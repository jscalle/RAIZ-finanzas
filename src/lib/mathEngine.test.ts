import { describe, it, expect } from 'vitest';
import {
  calculateFinancials,
  calculateGoalProgress,
  calculate12MonthProjection,
  parseFormattedNumber,
  expensesByCategory,
  budgetByCategory,
} from './mathEngine';
import {
  Income,
  Expense,
  SavingContribution,
  Withdrawal,
  SavingGoal,
  Topic,
} from '../types';

// Minimal factories for expensesByCategory tests.
const makeExpense = (topicId: string, amount: number): Expense => ({
  id: `${topicId}-${amount}-${Math.random()}`,
  description: 'x',
  amount,
  topicId,
  date: '2026-08-01',
  source: 'INGRESOS',
  confirmed: true,
});

const makeTopic = (id: string, name: string, color: string): Topic => ({
  id,
  name,
  type: 'EXPENSE',
  icon: 'ShoppingBag',
  color,
});

describe('mathEngine', () => {
  describe('calculateFinancials', () => {
    it('should correctly calculate capital, cash pool, and digital pool', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'Salary',
          amount: 1000,
          method: 'DIGITAL',
          confirmed: true,
          topicId: 't1',
        },
        {
          id: '2',
          date: '2023-01-02',
          description: 'Cash Gift',
          amount: 200,
          method: 'EFECTIVO',
          confirmed: true,
          topicId: 't2',
        },
        {
          id: '3',
          date: '2023-01-03',
          description: 'Unconfirmed',
          amount: 500,
          method: 'DIGITAL',
          confirmed: false,
          topicId: 't1',
        },
      ];

      const expenses: Expense[] = [
        {
          id: '1',
          date: '2023-01-04',
          description: 'Rent',
          amount: 400,
          source: 'INGRESOS',
          paymentMethod: 'DEBITO',
          confirmed: true,
          topicId: 't3',
        },
        {
          id: '2',
          date: '2023-01-05',
          description: 'Groceries',
          amount: 100,
          source: 'INGRESOS',
          paymentMethod: 'EFECTIVO',
          confirmed: true,
          topicId: 't4',
        },
        {
          id: '3',
          date: '2023-01-06',
          description: 'Bike',
          amount: 300,
          source: 'AHORROS',
          paymentMethod: 'CREDITO',
          confirmed: true,
          topicId: 't5',
        },
      ];

      const contributions: SavingContribution[] = [
        {
          id: '1',
          goalId: 'g1',
          date: '2023-01-07',
          amount: 150,
          description: 'Aporte',
        },
      ];

      const withdrawals: Withdrawal[] = [
        { id: '1', date: '2023-01-08', amount: 50, description: 'ATM' },
      ];

      const startingSavings = 1000;

      const result = calculateFinancials(
        incomes,
        expenses,
        contributions,
        withdrawals,
        startingSavings
      );

      expect(result.confirmedDigitalIncomes).toBe(1000);
      expect(result.confirmedCashIncomes).toBe(200);
      expect(result.expensesFromSavings).toBe(300);
      expect(result.totalContributions).toBe(150);
      expect(result.totalSavingsPool).toBe(1000 + 150 - 300); // 850
      expect(result.totalWithdrawals).toBe(50);
      expect(result.digitalExpensesFromIncomes).toBe(400);
      expect(result.cashExpenses).toBe(100);
      expect(result.cashPool).toBe(200 + 50 - 100); // 150

      // Math.max(0, 1000 - 400 - 150 - 50) = 400
      expect(result.currentIncomesPool).toBe(400);

      // 400 + 150 + 850 = 1400
      expect(result.capitalDisponible).toBe(1400);
    });

    it('should distinguish historical cumulative accumulation from bounded flow', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-15',
          description: 'Past',
          amount: 1000,
          method: 'DIGITAL',
          confirmed: true,
          topicId: 't1',
        },
        {
          id: '2',
          date: '2023-02-15',
          description: 'Current',
          amount: 1500,
          method: 'DIGITAL',
          confirmed: true,
          topicId: 't1',
        },
      ];
      const expenses: Expense[] = [
        {
          id: '3',
          date: '2023-01-20',
          description: 'Past Exp',
          amount: 500,
          source: 'INGRESOS',
          paymentMethod: 'DEBITO',
          confirmed: true,
          topicId: 't2',
        },
        {
          id: '4',
          date: '2023-02-20',
          description: 'Current Exp',
          amount: 800,
          source: 'INGRESOS',
          paymentMethod: 'DEBITO',
          confirmed: true,
          topicId: 't2',
        },
      ];

      // Simulate filtering for '2023-02' (Active Month)
      const activeMonth = '2023-02';

      // Cumulative arrays (up to and including activeMonth)
      const cumulativeIncomes = incomes.filter(
        (i) => i.date.substring(0, 7) <= activeMonth
      );
      const cumulativeExpenses = expenses.filter(
        (e) => e.date.substring(0, 7) <= activeMonth
      );

      // Monthly arrays (only activeMonth)
      const monthlyIncomes = incomes.filter((i) =>
        i.date.startsWith(activeMonth)
      );
      const monthlyExpenses = expenses.filter((e) =>
        e.date.startsWith(activeMonth)
      );

      // Calculate cumulative state
      const cumulativeResult = calculateFinancials(
        cumulativeIncomes,
        cumulativeExpenses,
        [],
        [],
        0
      );
      expect(cumulativeResult.capitalDisponible).toBe(
        1000 + 1500 - (500 + 800)
      ); // 2500 - 1300 = 1200

      // Compute monthly flow totals
      const monthlyIncomeFlow = monthlyIncomes
        .filter((i) => i.confirmed)
        .reduce((sum, i) => sum + i.amount, 0);
      const monthlyExpenseFlow = monthlyExpenses
        .filter((e) => e.confirmed)
        .reduce((sum, e) => sum + e.amount, 0);

      expect(monthlyIncomeFlow).toBe(1500); // Only February
      expect(monthlyExpenseFlow).toBe(800); // Only February
    });
  });

  describe('calculateGoalProgress', () => {
    it('should correctly calculate progress and remaining amount', () => {
      const goal: SavingGoal = {
        id: 'g1',
        name: 'Vacation',
        targetAmount: 1000,
        currentAmount: 250,
        deadline: '2023-12-31',
        topicId: 't1',
      };

      const result = calculateGoalProgress(goal);
      expect(result.progressPercentage).toBe(25);
      expect(result.remainingAmount).toBe(750);
    });

    it('should handle zero target amount', () => {
      const goal: SavingGoal = {
        id: 'g1',
        name: 'Vacation',
        targetAmount: 0,
        currentAmount: 250,
        deadline: '2023-12-31',
        topicId: 't1',
      };

      const result = calculateGoalProgress(goal);
      expect(result.progressPercentage).toBe(0);
      expect(result.remainingAmount).toBe(0);
    });
  });

  describe('calculate12MonthProjection', () => {
    it('should project capital over 12 months', () => {
      const startingCapital = 1000;
      const avgIncome = 2000;
      const avgExpense = 1500; // net +500/mo
      const startDate = new Date('2023-01-15T12:00:00Z');

      const projections = calculate12MonthProjection(
        startingCapital,
        avgIncome,
        avgExpense,
        startDate
      );

      expect(projections).toHaveLength(12);
      expect(projections[0].projectedCapital).toBe(1500);
      expect(projections[11].projectedCapital).toBe(1000 + 500 * 12); // 7000
      expect(projections[0].monthString).toBe('2023-02');
    });
  });

  describe('parseFormattedNumber', () => {
    it('should parse strings with dot as thousands separator and comma as decimal separator', () => {
      expect(parseFormattedNumber('1.234,56')).toBe(1234.56);
      expect(parseFormattedNumber('12,50')).toBe(12.5);
      expect(parseFormattedNumber('1000')).toBe(1000);
      expect(parseFormattedNumber('invalid')).toBe(0);
      expect(parseFormattedNumber('1.234.567,89')).toBe(1234567.89);
      expect(parseFormattedNumber(1234)).toBe(1234);
      expect(parseFormattedNumber(NaN)).toBe(0);
      expect(parseFormattedNumber(null as unknown as string)).toBe(0);
      expect(parseFormattedNumber('')).toBe(0);
    });

    it('should coerce non-string, non-number inputs to zero', () => {
      expect(parseFormattedNumber(undefined as unknown as string)).toBe(0);
      expect(parseFormattedNumber({} as unknown as string)).toBe(0);
      expect(parseFormattedNumber([] as unknown as string)).toBe(0);
    });

    it('should pass through numeric inputs including negatives and zero', () => {
      expect(parseFormattedNumber(0)).toBe(0);
      expect(parseFormattedNumber(-4500)).toBe(-4500);
      expect(parseFormattedNumber(-1234.56)).toBe(-1234.56);
    });

    it('should parse large formatted amounts without precision loss on integers', () => {
      expect(parseFormattedNumber('1.000.000.000')).toBe(1000000000);
      expect(parseFormattedNumber('999.999.999,99')).toBe(999999999.99);
    });

    it('should treat a leading partial value as parseFloat does', () => {
      // parseFloat stops at the first invalid character.
      expect(parseFormattedNumber('12abc')).toBe(12);
    });
  });

  describe('calculateFinancials edge cases', () => {
    const empty = () => calculateFinancials([], [], [], [], 0);

    it('should return all-zero aggregates for empty inputs', () => {
      const r = empty();
      expect(r.confirmedDigitalIncomes).toBe(0);
      expect(r.confirmedCashIncomes).toBe(0);
      expect(r.totalSavingsPool).toBe(0);
      expect(r.cashPool).toBe(0);
      expect(r.currentIncomesPool).toBe(0);
      expect(r.capitalDisponible).toBe(0);
    });

    it('should ignore unconfirmed incomes and expenses entirely', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'x',
          amount: 5000,
          method: 'DIGITAL',
          confirmed: false,
          topicId: 't1',
        },
      ];
      const expenses: Expense[] = [
        {
          id: '1',
          date: '2023-01-02',
          description: 'y',
          amount: 1000,
          source: 'INGRESOS',
          paymentMethod: 'DEBITO',
          confirmed: false,
          topicId: 't2',
        },
      ];
      const r = calculateFinancials(incomes, expenses, [], [], 0);
      expect(r.confirmedDigitalIncomes).toBe(0);
      expect(r.digitalExpensesFromIncomes).toBe(0);
      expect(r.capitalDisponible).toBe(0);
    });

    it('should clamp the digital incomes pool at zero when outflows exceed inflows', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'x',
          amount: 100,
          method: 'DIGITAL',
          confirmed: true,
          topicId: 't1',
        },
      ];
      const contributions: SavingContribution[] = [
        {
          id: 'c1',
          goalId: 'g1',
          date: '2023-01-02',
          amount: 500,
          description: 'over',
        },
      ];
      const r = calculateFinancials(incomes, [], contributions, [], 0);
      // Math.max(0, 100 - 0 - 500 - 0) => 0, never negative.
      expect(r.currentIncomesPool).toBe(0);
    });

    it('should allow the cash pool to go negative when cash expenses exceed cash inflows', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'cash',
          amount: 100,
          method: 'EFECTIVO',
          confirmed: true,
          topicId: 't1',
        },
      ];
      const expenses: Expense[] = [
        {
          id: '1',
          date: '2023-01-02',
          description: 'cash out',
          amount: 300,
          source: 'INGRESOS',
          paymentMethod: 'EFECTIVO',
          confirmed: true,
          topicId: 't2',
        },
      ];
      const r = calculateFinancials(incomes, expenses, [], [], 0);
      // 100 + 0 - 300 = -200 (not clamped).
      expect(r.cashPool).toBe(-200);
    });

    it('should count cash expenses regardless of their source bucket', () => {
      const expenses: Expense[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'from savings cash',
          amount: 70,
          source: 'AHORROS',
          paymentMethod: 'EFECTIVO',
          confirmed: true,
          topicId: 't1',
        },
      ];
      const r = calculateFinancials([], expenses, [], [], 0);
      expect(r.cashExpenses).toBe(70);
    });

    it('should handle large magnitude figures without overflow', () => {
      const incomes: Income[] = [
        {
          id: '1',
          date: '2023-01-01',
          description: 'big',
          amount: 1_000_000_000,
          method: 'DIGITAL',
          confirmed: true,
          topicId: 't1',
        },
      ];
      const r = calculateFinancials(incomes, [], [], [], 500_000_000);
      expect(r.confirmedDigitalIncomes).toBe(1_000_000_000);
      expect(r.capitalDisponible).toBe(1_500_000_000);
    });
  });

  describe('calculateGoalProgress additional cases', () => {
    it('should report over-100% progress and clamp remaining to zero when overfunded', () => {
      const goal: SavingGoal = {
        id: 'g1',
        name: 'Overfunded',
        targetAmount: 1000,
        currentAmount: 1500,
        deadline: '2023-12-31',
        topicId: 't1',
      };
      const r = calculateGoalProgress(goal);
      expect(r.progressPercentage).toBe(150);
      expect(r.remainingAmount).toBe(0);
    });

    it('should preserve the original goal fields on the returned object', () => {
      const goal: SavingGoal = {
        id: 'g9',
        name: 'Trip',
        targetAmount: 400,
        currentAmount: 100,
        deadline: '2024-01-01',
        topicId: 't2',
      };
      const r = calculateGoalProgress(goal);
      expect(r.id).toBe('g9');
      expect(r.name).toBe('Trip');
      expect(r.deadline).toBe('2024-01-01');
    });
  });

  describe('calculate12MonthProjection additional cases', () => {
    it('should decrease capital when expenses outpace income', () => {
      const projections = calculate12MonthProjection(
        1000,
        100,
        400,
        new Date('2023-01-15T12:00:00Z')
      );
      expect(projections[0].projectedCapital).toBe(700); // 1000 - 300
      expect(projections[11].projectedCapital).toBe(1000 - 300 * 12); // -2600
    });

    it('should roll the month/year forward across a year boundary', () => {
      const projections = calculate12MonthProjection(
        0,
        0,
        0,
        new Date('2023-11-15T12:00:00Z')
      );
      expect(projections[0].monthString).toBe('2023-12');
      expect(projections[1].monthString).toBe('2024-01');
      expect(projections[11].monthString).toBe('2024-11');
    });

    it('should keep capital flat when income equals expense', () => {
      const projections = calculate12MonthProjection(
        5000,
        1000,
        1000,
        new Date('2023-01-15T12:00:00Z')
      );
      expect(projections.every((p) => p.projectedCapital === 5000)).toBe(true);
    });
  });
});

describe('expensesByCategory', () => {
  const topics = [
    makeTopic('food', 'Comida', 'amber'),
    makeTopic('transport', 'Transporte', 'cyan'),
    makeTopic('health', 'Salud', 'emerald'),
  ];

  it('returns empty slices and zero total for no expenses', () => {
    expect(expensesByCategory([], topics)).toEqual({ slices: [], total: 0 });
  });

  it('groups by topic, sums amounts and sorts descending by total', () => {
    const { slices, total } = expensesByCategory(
      [
        makeExpense('food', 100),
        makeExpense('transport', 250),
        makeExpense('food', 300),
      ],
      topics
    );
    expect(total).toBe(650);
    expect(slices.map((s) => s.topicId)).toEqual(['food', 'transport']);
    expect(slices[0]).toMatchObject({
      name: 'Comida',
      color: 'amber',
      total: 400,
    });
    expect(slices[1]).toMatchObject({ name: 'Transporte', total: 250 });
  });

  it('computes percentages relative to the grand total', () => {
    const { slices } = expensesByCategory(
      [makeExpense('food', 400), makeExpense('transport', 100)],
      topics
    );
    expect(slices[0].percent).toBeCloseTo(80);
    expect(slices[1].percent).toBeCloseTo(20);
  });

  it('falls back to a neutral label for unknown topics', () => {
    const { slices } = expensesByCategory([makeExpense('ghost', 50)], topics);
    expect(slices[0]).toMatchObject({ name: 'Sin categoría', color: 'slate' });
  });

  it('returns zero percentages when the grand total is zero', () => {
    const { slices, total } = expensesByCategory(
      [makeExpense('food', 0), makeExpense('transport', 0)],
      topics
    );
    expect(total).toBe(0);
    expect(slices).toEqual([]);
  });

  it('excludes categories with zero total', () => {
    const { slices } = expensesByCategory(
      [makeExpense('food', 0), makeExpense('transport', 100)],
      topics
    );
    expect(slices.map((s) => s.topicId)).toEqual(['transport']);
  });

  it('folds categories beyond maxSlices into a single "Otros" slice', () => {
    const many = [
      makeTopic('a', 'A', 'amber'),
      makeTopic('b', 'B', 'cyan'),
      makeTopic('c', 'C', 'emerald'),
      makeTopic('d', 'D', 'blue'),
    ];
    const expenses = [
      makeExpense('a', 100),
      makeExpense('b', 80),
      makeExpense('c', 60),
      makeExpense('d', 40),
    ];
    const { slices, total } = expensesByCategory(expenses, many, 3);
    expect(total).toBe(280);
    expect(slices).toHaveLength(3);
    const other = slices[slices.length - 1];
    expect(other).toMatchObject({
      topicId: '__other__',
      name: 'Otros',
      total: 100,
    });
  });
});

describe('budgetByCategory', () => {
  const budgetedTopic = (
    id: string,
    name: string,
    monthlyLimit: number
  ): Topic => ({ ...makeTopic(id, name, 'amber'), monthlyLimit });

  const exp = (topicId: string, amount: number, confirmed = true): Expense => ({
    ...makeExpense(topicId, amount),
    confirmed,
  });

  it('includes budgeted categories even when nothing was spent', () => {
    const { rows, summary } = budgetByCategory(
      [],
      [budgetedTopic('food', 'Comida', 100)]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spent: 0,
      limit: 100,
      remaining: 100,
      status: 'normal',
    });
    expect(summary.totalLimit).toBe(100);
  });

  it('excludes categories without a positive monthly limit', () => {
    const rows = budgetByCategory(
      [exp('other', 50)],
      [makeTopic('other', 'Sin límite', 'cyan')]
    ).rows;
    expect(rows).toEqual([]);
  });

  it('counts confirmed spend only', () => {
    const { rows } = budgetByCategory(
      [exp('food', 40), exp('food', 30, false)],
      [budgetedTopic('food', 'Comida', 100)]
    );
    expect(rows[0].spent).toBe(40);
  });

  it('classifies status by the 80% and 100% thresholds', () => {
    const topics = [
      budgetedTopic('a', 'A', 100),
      budgetedTopic('b', 'B', 100),
      budgetedTopic('c', 'C', 100),
    ];
    const { rows } = budgetByCategory(
      [exp('a', 50), exp('b', 85), exp('c', 120)],
      topics
    );
    const byId = Object.fromEntries(rows.map((r) => [r.topicId, r.status]));
    expect(byId).toEqual({ a: 'normal', b: 'warning', c: 'exceeded' });
  });

  it('reports negative remaining when a category is exceeded', () => {
    const { rows } = budgetByCategory(
      [exp('food', 130)],
      [budgetedTopic('food', 'Comida', 100)]
    );
    expect(rows[0].remaining).toBe(-30);
    expect(rows[0].percent).toBeCloseTo(130);
  });

  it('sorts rows by consumption descending', () => {
    const { rows } = budgetByCategory(
      [exp('a', 20), exp('b', 90)],
      [budgetedTopic('a', 'A', 100), budgetedTopic('b', 'B', 100)]
    );
    expect(rows.map((r) => r.topicId)).toEqual(['b', 'a']);
  });

  it('summarizes totals and the exceeded count', () => {
    const { summary } = budgetByCategory(
      [exp('a', 120), exp('b', 40)],
      [budgetedTopic('a', 'A', 100), budgetedTopic('b', 'B', 100)]
    );
    expect(summary).toMatchObject({
      totalSpent: 160,
      totalLimit: 200,
      totalRemaining: 40,
      exceededCount: 1,
    });
    expect(summary.percent).toBeCloseTo(80);
  });
});
