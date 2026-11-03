// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { handleAssistantMessage } from './assistantRoute';

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

const run = (generate: any, body: unknown, uid = 'kid') => {
  const { db, writes } = createDb();
  const now = new Date('2026-11-15T17:00:00Z');
  return handleAssistantMessage({ getDb: () => db, generate, now: () => now }, { uid, body }).then((res) => ({
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

  it('refuses callers outside the space before calling the model', async () => {
    const generate = vi.fn();
    const res = await run(generate, { spaceId: 'mine', text: 'hola' }, 'stranger');
    expect(res).toMatchObject({ httpStatus: 403, body: { error: 'not_a_member' } });
    expect(generate).not.toHaveBeenCalled();
    expect(res.writes).toEqual([]);
  });

  it('rejects attachments until media support exists', async () => {
    const generate = vi.fn();
    const res = await run(generate, { spaceId: 'mine', text: 'foto', attachment: { mime: 'image/png', dataBase64: 'AAAA' } });
    expect(res).toMatchObject({ httpStatus: 400, body: { error: 'attachment_not_supported' } });
    expect(generate).not.toHaveBeenCalled();
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
