// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { assistantBodyParser, handleAssistantMessage } from './assistantRoute';
import type { AssistantRouteDeps } from './assistantRoute';
import { createQuota } from './assistantMedia';

type Doc = { id: string; data: () => Record<string, unknown> };
const doc = (id: string, data: Record<string, unknown>): Doc => ({ id, data: () => data });

/** spaces/{id} with owner/members, sub-collections, and recorded pending_transactions writes. */
function createDb() {
  const writes: Array<{ path: string; data: any }> = [];
  const space = { ownerUid: 'owner', members: ['owner', 'kid'], startingSavings: 0 };
  const subs: Record<string, Doc[]> = {
    topics: [doc('t_food', { name: 'Comida', type: 'EXPENSE' }), doc('t_salary', { name: 'Salario', type: 'INCOME' })],
  };
  const db = {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: id === 'mine', data: () => space }),
        collection: (sub: string) => ({
          get: async () => ({ empty: !(subs[sub] ?? []).length, docs: subs[sub] ?? [] }),
          doc: (subId: string) => ({
            set: async (data: any) => {
              writes.push({ path: `${id}/${sub}/${subId}`, data });
            },
          }),
        }),
      }),
    }),
  } as unknown as Firestore;
  return { db, writes };
}

const run = (generate: any, body: unknown, uid = 'kid', limits?: AssistantRouteDeps['limits']) => {
  const { db, writes } = createDb();
  const now = new Date('2026-11-15T17:00:00Z');
  return handleAssistantMessage({ getDb: () => db, generate, now: () => now, limits }, { uid, body }).then((res) => ({
    ...res,
    writes,
  }));
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
    expect(res.writes).toHaveLength(1);
    expect(res.writes[0].path).toBe(`mine/pending_transactions/${body.drafts[0].id}`);
    expect(body.drafts[0].id.startsWith('as_')).toBe(true);
  });

  it('answers a question without saving anything', async () => {
    const generate = async () => JSON.stringify({ intent: 'QUERY', chatResponse: 'Llevas $0', transactions: [] });
    const res = await run(generate, { spaceId: 'mine', text: '¿Cuánto llevo?' });
    expect(res.httpStatus).toBe(200);
    expect(res.body).toMatchObject({ intent: 'QUERY', chatResponse: 'Llevas $0', drafts: [] });
    expect(res.writes).toEqual([]);
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
      expect(res.writes).toEqual([]);
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
    expect(res.writes).toHaveLength(20);
  });

  it('refuses callers outside the space before calling the model', async () => {
    const generate = vi.fn();
    const res = await run(generate, { spaceId: 'mine', text: 'hola' }, 'stranger');
    expect(res).toMatchObject({ httpStatus: 403, body: { error: 'not_a_member' } });
    expect(generate).not.toHaveBeenCalled();
    expect(res.writes).toEqual([]);
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
