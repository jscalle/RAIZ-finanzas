// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { assistantBodyParser, handleAssistantMessage, registerAssistantRoutes } from './assistantRoute';
import type { AssistantRouteDeps } from './assistantRoute';
import { createQuota } from './assistantMedia';
import { createMemoryFirestore } from './testing/memoryFirestore';

const THREAD = (uid: string) => `spaces/mine/assistant_threads/${uid}/messages`;
const PENDING = 'spaces/mine/pending_transactions';

function seededDb() {
  return createMemoryFirestore({
    'spaces/mine': { ownerUid: 'owner', members: ['owner', 'kid'], startingSavings: 0 },
    'spaces/mine/topics/t_food': { name: 'Comida', type: 'EXPENSE' },
    'spaces/mine/topics/t_salary': { name: 'Salario', type: 'INCOME' },
  });
}

const NOW = new Date('2026-11-15T17:00:00Z');

/** Runs the handler against a fresh in-memory database (or the one given). */
const run = (
  generate: any,
  body: unknown,
  uid = 'kid',
  limits?: AssistantRouteDeps['limits'],
  extra: Partial<AssistantRouteDeps> & { mem?: ReturnType<typeof seededDb> } = {}
) => {
  const mem = extra.mem ?? seededDb();
  const { mem: _ignored, ...deps } = extra;
  return handleAssistantMessage({ getDb: () => mem.db, generate, now: () => NOW, limits, ...deps }, { uid, body }).then(
    (res) => ({ ...res, mem, pending: mem.list(PENDING), thread: mem.list(THREAD(uid)) })
  );
};

afterEach(() => vi.restoreAllMocks());

describe('handleAssistantMessage', () => {
  it('turns a recorded expense into a saved pending draft and returns it', async () => {
    const generate = vi.fn().mockResolvedValue(
      JSON.stringify({
        intent: 'RECORD',
        chatResponse: 'Listo',
        transactions: [{ type: 'EXPENSE', amount: 45000, category: 'Comida', description: 'Almuerzo', paymentMethod: 'DEBITO', date: '2026-11-15', explanation: 'ok' }],
      })
    );
    const res = await run(generate, { spaceId: 'mine', text: 'Almuerzo 45000' });
    expect(res.httpStatus).toBe(200);
    const body = res.body as any;
    expect(body.intent).toBe('RECORD');
    expect(body.chatResponse).toBe('Listo');
    expect(body.usedFallback).toBe(false);
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({ amount: 45000, category: 'Comida', topicId: 't_food', status: 'TELEGRAM_DRAFT' });
    expect(res.pending).toHaveLength(1);
    expect(res.pending[0].__id).toBe(body.drafts[0].id);
    expect(body.drafts[0].id).toMatch(/^as_[0-9a-f]{6}_/);
  });

  it('answers a question without saving any draft', async () => {
    const generate = async () => JSON.stringify({ intent: 'QUERY', chatResponse: 'Llevas $0', transactions: [] });
    const res = await run(generate, { spaceId: 'mine', text: '¿Cuánto llevo?' });
    expect(res.httpStatus).toBe(200);
    expect(res.body).toMatchObject({ intent: 'QUERY', chatResponse: 'Llevas $0', drafts: [] });
    expect(res.pending).toEqual([]);
  });

  it('reports usedFallback when the model fails and still builds a draft from the text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await run(async () => {
      throw new Error('quota');
    }, { spaceId: 'mine', text: 'Almuerzo 45000 en efectivo' });
    expect(res.httpStatus).toBe(200);
    expect((res.body as any).usedFallback).toBe(true);
    expect((res.body as any).drafts[0]).toMatchObject({ amount: 45000, paymentMethod: 'EFECTIVO' });
  });

  it('does not fail when the model answers something that is not an object', async () => {
    for (const raw of ['null', '[]', '"texto"', '5']) {
      const res = await run(async () => raw, { spaceId: 'mine', text: 'hola' });
      expect(res.httpStatus).toBe(200);
      expect(res.body).toMatchObject({ drafts: [], intent: null });
      expect(res.pending).toEqual([]);
    }
  });

  it('drops malformed transactions and caps the number of drafts', async () => {
    const good = (n: number) => ({ type: 'EXPENSE', amount: n, category: 'Comida', description: `g${n}` });
    const junk = [null, 'x', 7, { amount: 'abc' }, { amount: 1e999 }, { amount: '1e999' }, { amount: null }, { amount: '' }, { amount: 0 }, { amount: -50 }, { description: 'sin monto' }, { amount: 5, category: { a: 1 }, date: 20261115, description: ['x'] }];
    const many = Array.from({ length: 30 }, (_, i) => good(i + 1));
    const res = await run(async () => JSON.stringify({ intent: 'RECORD', transactions: [...junk, ...many] }), { spaceId: 'mine', text: 'hola' });
    expect(res.httpStatus).toBe(200);
    const drafts = (res.body as any).drafts;
    expect(drafts).toHaveLength(20);
    // the one junk entry with a finite amount survives with safe defaults
    expect(drafts[0]).toMatchObject({ amount: 5, category: 'Comida' });
    expect(drafts[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(drafts.every((d: any) => Number.isFinite(d.amount) && d.amount > 0)).toBe(true);
    expect(res.pending).toHaveLength(20);
  });

  it('keeps valid dates, converts dd/mm/yyyy, and replaces impossible or free-text dates with today', async () => {
    const tx = (date: string) => ({ type: 'EXPENSE', amount: 10, category: 'Comida', date });
    const res = await run(
      async () => JSON.stringify({ intent: 'RECORD', transactions: ['2026-11-05', '05/11/2026', '31/02/2026', '2026-13-40', 'ayer', ''].map(tx) }),
      { spaceId: 'mine', text: 'x' }
    );
    const dates = (res.body as any).drafts.map((d: any) => d.date);
    expect(dates.slice(0, 2)).toEqual(['2026-11-05', '2026-11-05']);
    const today = dates[5];
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates.slice(2)).toEqual([today, today, today, today]);
  });

  it('refuses callers outside the space before calling the model, and writes nothing', async () => {
    const generate = vi.fn();
    const res = await run(generate, { spaceId: 'mine', text: 'hola' }, 'stranger');
    expect(res).toMatchObject({ httpStatus: 403, body: { error: 'not_a_member' } });
    expect(generate).not.toHaveBeenCalled();
    expect(res.pending).toEqual([]);
    expect(res.thread).toEqual([]);
  });

  const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(32).fill(0)]).toString('base64');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)]).toString('base64');

  it('sends a voice note to the model with the type found in its bytes, even without text', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ intent: 'QUERY', chatResponse: 'ok', transactions: [] }));
    const res = await run(generate, { spaceId: 'mine', attachment: { mime: 'audio/webm;codecs=opus', dataBase64: WEBM } });
    expect(res.httpStatus).toBe(200);
    const { contents } = generate.mock.calls[0][0];
    expect(contents[0]).toEqual({ inlineData: { mimeType: 'audio/webm', data: WEBM } });
  });

  it('rejects an invalid attachment before touching the database or the model', async () => {
    const generate = vi.fn();
    expect(await run(generate, { spaceId: 'mine', text: 'x', attachment: { mime: 'audio/webm', dataBase64: PNG } })).toMatchObject({ httpStatus: 400, body: { error: 'attachment_type_mismatch' } });
    expect(await run(generate, { spaceId: 'mine', text: 'x', attachment: { mime: 'video/mp4', dataBase64: WEBM } })).toMatchObject({ httpStatus: 400, body: { error: 'attachment_type_not_allowed' } });
    expect(await run(generate, { spaceId: 'mine', attachment: 'nope' })).toMatchObject({ httpStatus: 400, body: { error: 'attachment_invalid' } });
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers 429 with a retry time when the per-user caps are reached', async () => {
    const ok = async () => JSON.stringify({ intent: 'QUERY', chatResponse: 'ok', transactions: [] });
    const limits = {
      messages: createQuota({ windowMs: 60_000, max: 3, now: () => 0 }),
      media: createQuota({ windowMs: 86_400_000, max: 1, now: () => 0 }),
    };
    const photo = { spaceId: 'mine', text: 'x', attachment: { mime: 'image/png', dataBase64: PNG } };
    expect((await run(ok, photo, 'kid', limits)).httpStatus).toBe(200);
    expect(await run(ok, photo, 'kid', limits)).toMatchObject({ httpStatus: 429, body: { error: 'media_quota_exceeded', retryAfterSeconds: 86400 } });
    expect((await run(ok, { spaceId: 'mine', text: 'hola' }, 'kid', limits)).httpStatus).toBe(200);
    expect(await run(ok, { spaceId: 'mine', text: 'otra' }, 'kid', limits)).toMatchObject({ httpStatus: 429, body: { error: 'rate_limited', retryAfterSeconds: 60 } });
    // another user is not affected
    expect((await run(ok, { spaceId: 'mine', text: 'hola' }, 'owner', limits)).httpStatus).toBe(200);
  });

  it('does not count quota for callers outside the space', async () => {
    const messages = createQuota({ windowMs: 60_000, max: 1, now: () => 0 });
    const limits = { messages, media: createQuota({ windowMs: 1000, max: 1 }) };
    await run(vi.fn(), { spaceId: 'mine', text: 'hola' }, 'stranger', limits);
    expect(messages.take('stranger')).toEqual({ allowed: true });
  });

  it('validates the body: shape, text and space id', async () => {
    const generate = vi.fn();
    expect(await run(generate, null)).toMatchObject({ httpStatus: 400, body: { error: 'invalid_body' } });
    expect(await run(generate, { spaceId: 'mine', text: '   ' })).toMatchObject({ httpStatus: 400, body: { error: 'empty_message' } });
    expect(await run(generate, { spaceId: 'mine', text: 5 })).toMatchObject({ httpStatus: 400, body: { error: 'empty_message' } });
    expect(await run(generate, { spaceId: 'mine', text: 'x'.repeat(2001) })).toMatchObject({ httpStatus: 400, body: { error: 'text_too_long' } });
    expect(await run(generate, { spaceId: 'a/b', text: 'hola' })).toMatchObject({ httpStatus: 400, body: { error: 'invalid_space_id' } });
    expect(await run(generate, { spaceId: 'otro', text: 'hola' })).toMatchObject({ httpStatus: 404, body: { error: 'space_not_found' } });
    expect(generate).not.toHaveBeenCalled();
  });

  describe('conversation thread', () => {
    const record = (n = 1) =>
      JSON.stringify({
        intent: 'RECORD',
        chatResponse: 'Listo, revisa y confirma.',
        transactions: Array.from({ length: n }, (_, i) => ({ type: 'EXPENSE', amount: 1000 * (i + 1), category: 'Comida', description: `d${i}`, paymentMethod: 'DEBITO', date: '2026-11-15', explanation: 'x' })),
      });

    it('saves the user message as "analyzing" before the model runs, then marks it done', async () => {
      const mem = seededDb();
      let during: any[] = [];
      const generate = async () => {
        during = mem.list(THREAD('kid'));
        return record();
      };
      const res = await run(generate, { spaceId: 'mine', text: 'Almuerzo 1000' }, 'kid', undefined, { mem });
      expect(during).toHaveLength(1);
      expect(during[0]).toMatchObject({ role: 'user', kind: 'text', text: 'Almuerzo 1000', status: 'analyzing' });
      const user = res.thread.find((m) => m.role === 'user')!;
      expect(user).toMatchObject({ status: 'done', usedFallback: false });
      expect((res.body as any).messageId).toBe(user.__id);
    });

    it('writes the assistant answer and one draft message per draft, in order, linked to the pending draft', async () => {
      const res = await run(async () => record(2), { spaceId: 'mine', text: 'dos gastos' });
      const messages = res.thread.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      expect(messages.map((m) => `${m.role}:${m.kind}`)).toEqual(['user:text', 'assistant:text', 'assistant:draft', 'assistant:draft']);
      const user = messages[0];
      expect(new Set(messages.map((m) => m.createdAt)).size).toBe(4);
      expect(messages.slice(1).every((m) => m.replyTo === user.__id)).toBe(true);
      expect(messages[1].text).toBe('Listo, revisa y confirma.');
      const drafts = (res.body as any).drafts;
      expect(messages[2]).toMatchObject({ draftId: drafts[0].id, draft: { amount: 1000, category: 'Comida', type: 'EXPENSE', currency: 'COP', date: '2026-11-15' } });
      expect(messages[3].draftId).toBe(drafts[1].id);
    });

    it('keeps each user thread separate', async () => {
      const mem = seededDb();
      await run(async () => record(), { spaceId: 'mine', text: 'a' }, 'kid', undefined, { mem });
      await run(async () => record(), { spaceId: 'mine', text: 'b' }, 'owner', undefined, { mem });
      expect(mem.list(THREAD('kid')).filter((m) => m.role === 'user').map((m) => m.text)).toEqual(['a']);
      expect(mem.list(THREAD('owner')).filter((m) => m.role === 'user').map((m) => m.text)).toEqual(['b']);
    });

    it('says so when nothing could be understood, instead of staying silent', async () => {
      const res = await run(async () => '{}', { spaceId: 'mine', text: 'asdf' });
      const assistant = res.thread.filter((m) => m.role === 'assistant');
      expect(assistant).toHaveLength(1);
      expect(assistant[0]).toMatchObject({ kind: 'notice' });
      expect(assistant[0].text).toContain('No pude identificar');
    });

    it('tells the user when the media could not be analyzed and a basic reader was used', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = await run(async () => {
        throw new Error('quota');
      }, { spaceId: 'mine', text: 'Almuerzo 45000', attachment: { mime: 'audio/webm', dataBase64: WEBM } });
      const user = res.thread.find((m) => m.role === 'user')!;
      expect(user).toMatchObject({ usedFallback: true, status: 'done', attachment: { kind: 'audio', mimeType: 'audio/webm', sizeBytes: 36 } });
      const notice = res.thread.find((m) => m.kind === 'notice')!;
      expect(notice.text).toContain('audio');
    });

    it('never stores the raw media, only its kind, type and size', async () => {
      const res = await run(async () => record(), { spaceId: 'mine', text: 'foto', attachment: { mime: 'image/png', dataBase64: PNG } });
      expect(JSON.stringify([...res.mem.store.values()])).not.toContain(PNG);
      expect(res.thread.find((m) => m.role === 'user')).toMatchObject({ attachment: { kind: 'image', mimeType: 'image/png', sizeBytes: 40 } });
    });

    it('commits drafts, replies and the done status together or not at all', async () => {
      const mem = seededDb();
      mem.failBatchWhen(() => true);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await run(async () => record(3), { spaceId: 'mine', text: 'tres' }, 'kid', undefined, { mem });
      expect(res).toMatchObject({ httpStatus: 500, body: { error: 'assistant_failed' } });
      expect(res.pending).toEqual([]);
      expect(res.thread.filter((m) => m.role === 'assistant').map((m) => m.kind)).toEqual(['error']);
      expect(res.thread.find((m) => m.role === 'user')).toMatchObject({ status: 'failed' });
    });

    it('fails before calling the model when the user message cannot be saved', async () => {
      const mem = seededDb();
      mem.failWritesWhen((path) => path.includes('/messages/'));
      const generate = vi.fn();
      await expect(run(generate, { spaceId: 'mine', text: 'hola' }, 'kid', undefined, { mem })).rejects.toThrow();
      expect(generate).not.toHaveBeenCalled();
    });

    it('gives drafts of simultaneous requests different ids', async () => {
      const mem = seededDb();
      const a = await run(async () => record(), { spaceId: 'mine', text: 'a' }, 'kid', undefined, { mem, newId: () => 'aaaaaa' });
      const b = await run(async () => record(), { spaceId: 'mine', text: 'b' }, 'owner', undefined, { mem, newId: () => 'bbbbbb' });
      expect((a.body as any).drafts[0].id).not.toBe((b.body as any).drafts[0].id);
      expect(mem.list(PENDING)).toHaveLength(2);
    });

    it('uses a different random part on every request by default', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 25; i++) {
        const r = await run(async () => record(), { spaceId: 'mine', text: 'x' });
        ids.add((r.body as any).drafts[0].id);
      }
      expect(ids.size).toBe(25);
    });
  });
});

describe('registerAssistantRoutes', () => {
  async function withApp(opts: { allow: boolean; limited?: boolean; uid?: string }, fn: (url: string, calls: string[]) => Promise<void>) {
    const calls: string[] = [];
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, {
      guard: (_req, _res, next) => {
        calls.push('guard');
        next();
      },
      rateLimit: (_req, res) => {
        calls.push('rateLimit');
        if (opts.limited) {
          res.status(429).json({ error: 'slow_down' });
          return false;
        }
        return true;
      },
      requireIdToken: async (_req, res) => {
        calls.push('auth');
        if (!opts.allow) {
          res.status(401).json({ error: 'no token' });
          return null;
        }
        return { uid: opts.uid ?? 'kid' };
      },
      handler: async (input) => {
        calls.push(`handler:${input.uid}`);
        return { httpStatus: 200, body: { echoed: input.body } };
      },
    });
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls);
    } finally {
      server.close();
    }
  }
  const post = (url: string) => fetch(`${url}/api/assistant/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hi: 1 }) });

  it('runs project guard, IP limit, token check and then the handler with the verified uid', async () => {
    await withApp({ allow: true, uid: 'u7' }, async (url, calls) => {
      const res = await post(url);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ echoed: { hi: 1 } });
      expect(calls).toEqual(['guard', 'rateLimit', 'auth', 'handler:u7']);
    });
  });

  it('never reaches the handler without a valid token', async () => {
    await withApp({ allow: false }, async (url, calls) => {
      expect((await post(url)).status).toBe(401);
      expect(calls).toEqual(['guard', 'rateLimit', 'auth']);
    });
  });

  it('stops at the IP limit before checking the token', async () => {
    await withApp({ allow: true, limited: true }, async (url, calls) => {
      expect((await post(url)).status).toBe(429);
      expect(calls).toEqual(['guard', 'rateLimit']);
    });
  });

  it('answers a generic 500 when the handler throws, without leaking the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, {
      guard: (_q, _s, next) => next(),
      rateLimit: () => true,
      requireIdToken: async () => ({ uid: 'u' }),
      handler: async () => {
        throw new Error('secret internal detail');
      },
    });
    const server = app.listen(0);
    try {
      const res = await post(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'assistant_failed' });
    } finally {
      server.close();
    }
  });
});

describe('assistantBodyParser', () => {
  async function withServer(fn: (url: string) => Promise<void>) {
    const app = express();
    app.use('/api/assistant', ...assistantBodyParser());
    app.use(express.json({ limit: '50mb' }));
    app.post('/api/assistant/echo', (req, res) => res.json({ length: req.body.t.length }));
    app.post('/other', (req, res) => res.json({ length: req.body.t.length }));
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }
  const post = (url: string, body: string) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  it('keeps a 15 MB limit on the assistant routes and answers JSON errors', async () => {
    await withServer(async (url) => {
      const big = JSON.stringify({ t: 'a'.repeat(16 * 1024 * 1024) });
      const tooLarge = await post(`${url}/api/assistant/echo`, big);
      expect(tooLarge.status).toBe(413);
      expect(await tooLarge.json()).toEqual({ error: 'payload_too_large' });

      const ok = await post(`${url}/api/assistant/echo`, JSON.stringify({ t: 'a'.repeat(12 * 1024 * 1024) }));
      expect(ok.status).toBe(200);

      const broken = await post(`${url}/api/assistant/echo`, '{not json');
      expect(broken.status).toBe(400);
      expect(await broken.json()).toEqual({ error: 'invalid_json' });
    });
  });

  it('leaves the global 50 MB limit untouched for other routes', async () => {
    await withServer(async (url) => {
      const res = await post(`${url}/other`, JSON.stringify({ t: 'a'.repeat(20 * 1024 * 1024) }));
      expect(res.status).toBe(200);
    });
  });
});
