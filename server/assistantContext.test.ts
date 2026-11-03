// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  getSpaceFullContext,
  getSpaceTopics,
  normalizeDateToISO,
} from './assistantContext';

type Doc = { id: string; data: () => Record<string, unknown> };
const doc = (id: string, data: Record<string, unknown>): Doc => ({ id, data: () => data });

/** Minimal fake of spaces/{id} with get() and sub-collection get(). */
function createFakeDb(space: Record<string, unknown>, subs: Record<string, Doc[]>): Firestore {
  const snap = (docs: Doc[]) => ({ empty: docs.length === 0, docs });
  const spaceRef = {
    get: async () => ({ data: () => space }),
    collection: (name: string) => ({ get: async () => snap(subs[name] ?? []) }),
  };
  return { collection: () => ({ doc: () => spaceRef }) } as unknown as Firestore;
}

describe('normalizeDateToISO', () => {
  it('converts dd/mm/yyyy and dd-mm-yyyy to ISO with zero padding', () => {
    expect(normalizeDateToISO('05/11/2025')).toBe('2025-11-05');
    expect(normalizeDateToISO('5-1-2025')).toBe('2025-01-05');
  });

  it('keeps ISO dates unchanged and falls back to today for empty input', () => {
    expect(normalizeDateToISO('2025-11-05')).toBe('2025-11-05');
    expect(normalizeDateToISO('')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getSpaceTopics', () => {
  it('maps stored topics, defaulting name to id and type to EXPENSE', async () => {
    const db = createFakeDb({}, { topics: [doc('t1', { name: 'Mercado' }), doc('t2', { type: 'INCOME' })] });
    expect(await getSpaceTopics(() => db, 'espacio')).toEqual([
      { id: 't1', name: 'Mercado', type: 'EXPENSE' },
      { id: 't2', name: 't2', type: 'INCOME' },
    ]);
  });

  it('falls back to the built-in topics when the space has none', async () => {
    const db = createFakeDb({}, {});
    const topics = await getSpaceTopics(() => db, 'espacio');
    expect(topics.length).toBeGreaterThan(5);
    expect(topics.some((t) => t.type === 'INCOME')).toBe(true);
  });

  it('can skip the built-in topics: an empty space has no categories and an unavailable database none either', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getSpaceTopics(() => createFakeDb({}, {}), 'espacio', { fallback: false })).toEqual([]);
    expect(
      await getSpaceTopics(
        () => {
          throw new Error('admin not ready');
        },
        'espacio',
        { fallback: false }
      )
    ).toEqual([]);
    warn.mockRestore();
  });

  it('falls back to the built-in topics when the database is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const topics = await getSpaceTopics(() => {
      throw new Error('admin not ready');
    }, 'espacio');
    expect(topics.length).toBeGreaterThan(5);
    warn.mockRestore();
  });
});

describe('getSpaceFullContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T17:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns null when the database is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await getSpaceFullContext(() => {
        throw new Error('admin not ready');
      }, 'espacio')
    ).toBeNull();
    warn.mockRestore();
  });

  it('summarises the current month, ignores demo seed records and unpaid credit purchases are tracked', async () => {
    const db = createFakeDb(
      { startingSavings: 1000 },
      {
        topics: [
          doc('t_food', { name: 'Comida', type: 'EXPENSE', monthlyLimit: 500000 }),
          doc('topic_1787580821277', { name: 'Tarjetas', type: 'EXPENSE' }),
          doc('topic_vivienda', { name: 'Demo', type: 'EXPENSE' }),
        ],
        expenses: [
          doc('e1', { amount: 100000, topicId: 't_food', date: '2026-11-03', paymentMethod: 'DEBITO' }),
          doc('e2', { amount: 50000, topicId: 't_food', date: '2026-10-20', paymentMethod: 'DEBITO' }),
          doc('e4', { amount: 30000, topicId: 't_food', date: '2026-11-04', paymentMethod: 'CREDITO' }),
          doc('exp_1', { amount: 999999, topicId: 't_food', date: '2026-11-05' }),
        ],
        incomes: [doc('i1', { amount: 2000000, topicId: '', date: '2026-11-01' })],
        contributions: [doc('c1', { amount: 100000, date: '2026-11-02' })],
      }
    );

    const ctx = await getSpaceFullContext(() => db, 'espacio');

    expect(ctx?.currentMonth).toBe('2026-11');
    expect(ctx?.categoryBreakdown.map((c) => c.topicId)).toEqual(['t_food', 'topic_1787580821277']);
    expect(ctx?.categoryBreakdown[0]).toMatchObject({
      spentThisMonth: 130000,
      monthlyLimit: 500000,
      remainingBudget: 370000,
      percentUsed: 26,
      averageMonthly: 90000,
    });
    expect(ctx?.financialSummary).toMatchObject({
      ingresosMesActual: 2000000,
      ahorroMesActual: 100000,
      comprasConTcMesActual: 30000,
      deudaTcPendienteTotal: 30000,
      ahorroAcumuladoTotal: 101000,
      totalBudgetLimit: 500000,
      disponibleRealParaGastar: 1400000,
    });
    expect(ctx?.unpaidCreditExpenses).toHaveLength(1);
    // newest first, demo record exp_1 excluded
    expect(ctx?.recentRecords[0]).toMatchObject({ amount: 30000, date: '2026-11-04' });
    expect(ctx?.recentRecords.some((r) => r.amount === 999999)).toBe(false);
  });
});
