// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  assertSpaceMember,
  buildAssistantPrompt,
  buildDrafts,
  inAppInstructions,
  loadAssistantContext,
  runAssistantModel,
} from './assistantService';
import { createMemoryFirestore } from './testing/memoryFirestore';
import type { AssistantContext } from './assistantService';

const topics = [
  { id: 't_food', name: 'Comida', type: 'EXPENSE' },
  { id: 't_home', name: 'Hogar', type: 'EXPENSE' },
  { id: 't_salary', name: 'Salario', type: 'INCOME' },
];
const ctx: AssistantContext = {
  topics,
  fullContext: { currentMonth: '2026-11', recentRecords: [] },
  todayISO: '2026-11-15',
};
const now = new Date('2026-11-15T17:00:00Z');

afterEach(() => vi.restoreAllMocks());

describe('buildAssistantPrompt', () => {
  it('includes the date, the category names and the user text', () => {
    const prompt = buildAssistantPrompt(ctx, 'Almuerzo 45000');
    expect(prompt).toContain('Fecha actual: 2026-11-15');
    expect(prompt).toContain('[Comida (EXPENSE), Hogar (EXPENSE), Salario (INCOME)]');
    expect(prompt).toContain('"Almuerzo 45000"');
  });

  it('cuts the user text at 2000 characters and marks empty text as media only', () => {
    expect(buildAssistantPrompt(ctx, 'x'.repeat(2500))).toContain(`"${'x'.repeat(2000)}"`);
    expect(buildAssistantPrompt(ctx, '')).toContain('(Nota de voz / imagen adjunta sin texto)');
  });
});

describe('runAssistantModel', () => {
  it('sends media first and the prompt last, and returns the parsed JSON', async () => {
    const generate = vi.fn().mockResolvedValue('{"intent":"RECORD","transactions":[]}');
    const out = await runAssistantModel({ generate }, ctx, {
      text: 'hola',
      media: [{ mimeType: 'audio/webm', dataBase64: 'QUJD' }],
    });
    expect(out).toEqual({ parsed: { intent: 'RECORD', transactions: [] }, usedFallback: false });
    const { contents } = generate.mock.calls[0][0];
    expect(contents[0]).toEqual({ inlineData: { mimeType: 'audio/webm', data: 'QUJD' } });
    expect(contents).toHaveLength(2);
    expect(typeof contents[1]).toBe('string');
  });

  it('treats an empty model answer as an empty object', async () => {
    const out = await runAssistantModel({ generate: async () => '  ' }, ctx, { text: 'hola' });
    expect(out).toEqual({ parsed: {}, usedFallback: false });
  });

  it('falls back to the local parser when the model fails or answers invalid JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const generate of [
      async () => {
        throw new Error('quota');
      },
      async () => 'not json',
    ]) {
      const out = await runAssistantModel({ generate }, ctx, { text: 'Almuerzo 45000 en efectivo' });
      expect(out.usedFallback).toBe(true);
      expect(out.parsed.intent).toBe('RECORD');
      expect(out.parsed.transactions[0]).toMatchObject({ amount: 45000, paymentMethod: 'EFECTIVO' });
    }
  });
});

describe('buildDrafts', () => {
  const base = { topics, spaceId: 'espacio', text: 'nota', todayISO: '2026-11-15', idPrefix: 'as_', now };

  it('builds a pending draft with the category matched case-insensitively', () => {
    const [d] = buildDrafts({
      ...base,
      transactions: [{ type: 'EXPENSE', amount: '45000', category: 'comida', description: 'Almuerzo', paymentMethod: 'CREDITO', date: '05/11/2026', explanation: 'ok' }],
    });
    expect(d).toEqual({
      id: `as_${now.getTime().toString(36)}_0`,
      spaceId: 'espacio',
      type: 'EXPENSE',
      amount: 45000,
      currency: 'COP',
      description: 'Almuerzo',
      category: 'Comida',
      topicId: 't_food',
      paymentMethod: 'CREDITO',
      date: '2026-11-05',
      explanation: 'ok',
      status: 'TELEGRAM_DRAFT',
      source: 'SMS_WEBHOOK',
      createdAt: now.toISOString(),
    });
  });

  it('uses the first category of the right type and the type defaults when the model leaves gaps', () => {
    const [d] = buildDrafts({ ...base, transactions: [{ type: 'INCOME', amount: 100, category: 'inexistente' }] });
    expect(d).toMatchObject({
      type: 'INCOME',
      category: 'Salario',
      topicId: 't_salary',
      paymentMethod: 'DIGITAL',
      description: 'nota',
      date: '2026-11-15',
    });
  });

  it('numbers the explanation when there are several drafts and gives each a distinct id', () => {
    const drafts = buildDrafts({
      ...base,
      transactions: [
        { type: 'EXPENSE', amount: 1, category: 'Hogar', explanation: 'a' },
        { type: 'EXPENSE', amount: 2, category: 'Hogar', explanation: 'b' },
      ],
    });
    expect(drafts.map((d) => d.explanation)).toEqual(['(1 de 2) a', '(2 de 2) b']);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
  });
});

function createDb(spaces: Record<string, Record<string, unknown>>) {
  const writes: Array<{ path: string; data: unknown }> = [];
  const db = {
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: id in spaces, data: () => spaces[id] }),
        collection: (sub: string) => ({
          doc: (subId: string) => ({
            set: async (data: unknown) => {
              writes.push({ path: `${col}/${id}/${sub}/${subId}`, data });
            },
          }),
        }),
      }),
    }),
  } as unknown as Firestore;
  return { db, writes };
}

describe('assertSpaceMember', () => {
  const { db } = createDb({ mine: { ownerUid: 'owner', members: ['owner', 'kid'] } });

  it('accepts the owner and members', async () => {
    expect((await assertSpaceMember(() => db, 'mine', 'owner')).ok).toBe(true);
    expect((await assertSpaceMember(() => db, 'mine', 'kid')).ok).toBe(true);
  });

  it('rejects strangers with 403, missing spaces with 404 and bad ids with 400', async () => {
    expect(await assertSpaceMember(() => db, 'mine', 'stranger')).toEqual({ ok: false, httpStatus: 403, body: { error: 'not_a_member' } });
    expect(await assertSpaceMember(() => db, 'nope', 'owner')).toEqual({ ok: false, httpStatus: 404, body: { error: 'space_not_found' } });
    expect(await assertSpaceMember(() => db, 'a/b', 'owner')).toEqual({ ok: false, httpStatus: 400, body: { error: 'invalid_space_id' } });
    expect(await assertSpaceMember(() => db, undefined, 'owner')).toMatchObject({ ok: false, httpStatus: 400 });
    for (const id of ['.', '..', '__reserved__']) {
      expect(await assertSpaceMember(() => db, id, 'owner')).toEqual({ ok: false, httpStatus: 400, body: { error: 'invalid_space_id' } });
    }
  });
});

describe('categories that do not exist', () => {
  it('loads no categories for a space that has none instead of inventing a default list', async () => {
    const mem = createMemoryFirestore({ 'spaces/vacio': { ownerUid: 'u', members: ['u'] } });
    const ctx = await loadAssistantContext(() => mem.db, 'vacio');
    expect(ctx.topics).toEqual([]);
  });

  it('loads the real categories of a space that has them', async () => {
    const mem = createMemoryFirestore({
      'spaces/lleno': { ownerUid: 'u', members: ['u'] },
      'spaces/lleno/topics/t1': { name: 'Mercado', type: 'EXPENSE' },
    });
    expect((await loadAssistantContext(() => mem.db, 'lleno')).topics).toEqual([
      { id: 't1', name: 'Mercado', type: 'EXPENSE' },
    ]);
  });

  it('leaves a draft without a category, not in a made-up one, when there are no categories', () => {
    const [d] = buildDrafts({
      transactions: [{ type: 'EXPENSE', amount: 100, category: 'Ocio y Entretenimiento' }],
      topics: [],
      spaceId: 'espacio',
      text: 'x',
      todayISO: '2026-11-15',
      idPrefix: 'as_',
      now,
    });
    expect(d).toMatchObject({ category: 'Sin categoría', topicId: '' });
  });
});

describe('in-app instructions', () => {
  it('keeps the prompt exactly as before when no extra instructions are given', () => {
    expect(buildAssistantPrompt(ctx, 'hola')).not.toContain('Instrucciones adicionales');
    expect(buildAssistantPrompt(ctx, 'hola', inAppInstructions(true))).toContain('Instrucciones adicionales');
  });

  it('forbids saying a movement was saved before the user confirms it', () => {
    const text = inAppInstructions(true);
    expect(text).toContain('Guardar');
    expect(text).toContain('Nunca digas');
    expect(text).not.toContain('todavía NO tiene categorías');
  });

  it('tells the model plainly that the space has no categories and where to create them', () => {
    const text = inAppInstructions(false);
    expect(text).toContain('todavía NO tiene categorías');
    expect(text).toContain('sección "Categorías"');
  });
});
