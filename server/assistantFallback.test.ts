// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildLocalFallbackResult } from './assistantFallback';

const topics = [
  { id: 't_food', name: 'Comidas extra', type: 'EXPENSE' },
  { id: 't_market', name: 'Alimentación', type: 'EXPENSE' },
  { id: 't_salary', name: 'Salario', type: 'INCOME' },
];
const today = '2026-11-15';

describe('buildLocalFallbackResult', () => {
  it('records an expense paid by credit card with the matched category', () => {
    const r = buildLocalFallbackResult('Almuerzo 45000 con tarjeta de crédito', null, topics, today, false);
    expect(r.intent).toBe('RECORD');
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({
      type: 'EXPENSE',
      amount: 45000,
      currency: 'COP',
      category: 'Comidas extra',
      paymentMethod: 'CREDITO',
      date: today,
    });
  });

  it('records income as DIGITAL and cash expenses as EFECTIVO', () => {
    const income = buildLocalFallbackResult('Me pagaron salario 2.500.000', null, topics, today, false);
    expect(income.transactions[0]).toMatchObject({ type: 'INCOME', amount: 2500000, paymentMethod: 'DIGITAL' });

    const cash = buildLocalFallbackResult('Mercado 80000 en efectivo', null, topics, today, false);
    expect(cash.transactions[0]).toMatchObject({ type: 'EXPENSE', amount: 80000, paymentMethod: 'EFECTIVO' });
  });

  it('splits multi-line text into one transaction per line with a number', () => {
    const r = buildLocalFallbackResult('Taxi 12000\nCafé 5000', null, topics, today, false);
    expect(r.transactions.map((t) => t.amount)).toEqual([12000, 5000]);
  });

  it('answers questions with a summary of the context and no transactions', () => {
    const ctx = { currentMonth: '2026-11', financialSummary: {}, categoryBreakdown: [], recentRecords: [] };
    const r = buildLocalFallbackResult('¿Cuánto llevo este mes?', ctx, topics, today, false);
    expect(r.intent).toBe('QUERY');
    expect(r.transactions).toEqual([]);
    expect(r.chatResponse).toContain('2026-11');
  });

  it('does not invent a transaction for an image without an amount', () => {
    const r = buildLocalFallbackResult('', null, topics, today, true);
    expect(r.intent).toBe('QUERY');
    expect(r.transactions).toEqual([]);
    expect(r.chatResponse).toContain('Recibí tu imagen');
  });
});
