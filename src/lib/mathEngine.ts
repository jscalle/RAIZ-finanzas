import {
  Income,
  Expense,
  SavingContribution,
  Withdrawal,
  SavingGoal,
  Topic,
  CategorySlice,
  BudgetRow,
  BudgetSummary,
} from '../types';

// Consumption thresholds shared with the budget UI.
const BUDGET_WARNING_PCT = 80;

function budgetStatus(percent: number): BudgetRow['status'] {
  if (percent >= 100) return 'exceeded';
  if (percent >= BUDGET_WARNING_PCT) return 'warning';
  return 'normal';
}

export function parseFormattedNumber(value: string | number): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value || typeof value !== 'string') return 0;

  // Remove all dots (thousands separators)
  const noDots = value.replace(/\./g, '');
  // Replace comma with dot (decimal separator)
  const standardFormat = noDots.replace(/,/g, '.');

  const parsed = parseFloat(standardFormat);
  return isNaN(parsed) ? 0 : parsed;
}

export function calculateFinancials(
  incomes: Income[],
  expenses: Expense[],
  contributions: SavingContribution[],
  withdrawals: Withdrawal[],
  startingSavings: number
) {
  const confirmedDigitalIncomes = incomes
    .filter((i) => i.confirmed && i.method !== 'EFECTIVO')
    .reduce((sum, i) => sum + i.amount, 0);

  const confirmedCashIncomes = incomes
    .filter((i) => i.confirmed && i.method === 'EFECTIVO')
    .reduce((sum, i) => sum + i.amount, 0);

  const expensesFromSavings = expenses
    .filter((e) => e.source === 'AHORROS' && e.confirmed)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalContributions = contributions.reduce(
    (sum, c) => sum + c.amount,
    0
  );

  const totalSavingsPool =
    startingSavings + totalContributions - expensesFromSavings;

  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);

  const digitalExpensesFromIncomes = expenses
    .filter(
      (e) =>
        e.source === 'INGRESOS' &&
        e.confirmed &&
        e.paymentMethod !== 'EFECTIVO' &&
        e.topicId !== 'topic_ahorros' &&
        !String(e.id || '').startsWith('exp_from_contrib_')
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const cashExpenses = expenses
    .filter((e) => e.confirmed && e.paymentMethod === 'EFECTIVO')
    .reduce((sum, e) => sum + e.amount, 0);

  const cashPool = confirmedCashIncomes + totalWithdrawals - cashExpenses;

  const currentIncomesPool = Math.max(
    0,
    confirmedDigitalIncomes -
      digitalExpensesFromIncomes -
      totalContributions -
      totalWithdrawals
  );

  const capitalDisponible = currentIncomesPool + cashPool + totalSavingsPool;

  return {
    confirmedDigitalIncomes,
    confirmedCashIncomes,
    expensesFromSavings,
    totalContributions,
    totalSavingsPool,
    totalWithdrawals,
    digitalExpensesFromIncomes,
    cashExpenses,
    cashPool,
    currentIncomesPool,
    capitalDisponible,
  };
}

/**
 * Group expenses by their topic (category) and return sorted slices with
 * per-category totals and percentages. Categories beyond `maxSlices` are folded
 * into a single "Otros" slice so charts stay legible. Pure and deterministic.
 */
export function expensesByCategory(
  expenses: Expense[],
  topics: Topic[],
  maxSlices = 7
): { slices: CategorySlice[]; total: number } {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Sum amounts per topic id.
  const totalsByTopic = new Map<string, number>();
  for (const e of expenses) {
    totalsByTopic.set(
      e.topicId,
      (totalsByTopic.get(e.topicId) ?? 0) + e.amount
    );
  }

  const topicById = new Map(topics.map((t) => [t.id, t]));

  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  const ranked: CategorySlice[] = Array.from(totalsByTopic.entries())
    .map(([topicId, amount]) => {
      const topic = topicById.get(topicId);
      return {
        topicId,
        name: topic?.name ?? 'Sin categoría',
        color: topic?.color ?? 'slate',
        total: amount,
        percent: pct(amount),
      };
    })
    // Only categories with spend are shown.
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  if (ranked.length <= maxSlices) {
    return { slices: ranked, total };
  }

  // Keep the top (maxSlices - 1) and fold the rest into "Otros".
  const head = ranked.slice(0, maxSlices - 1);
  const rest = ranked.slice(maxSlices - 1);
  const restTotal = rest.reduce((sum, s) => sum + s.total, 0);
  head.push({
    topicId: '__other__',
    name: 'Otros',
    color: 'slate',
    total: restTotal,
    percent: pct(restTotal),
  });

  return { slices: head, total };
}

/**
 * Budget-vs-actual per category. Includes every expense-capable topic that has
 * a positive monthlyLimit — even those with zero spend — so the full budget is
 * visible. Spend counts confirmed expenses only. Rows are sorted by consumption
 * (most-consumed first) so at-risk categories surface. Pure and deterministic.
 */
export function budgetByCategory(
  expenses: Expense[],
  topics: Topic[]
): { rows: BudgetRow[]; summary: BudgetSummary } {
  const spentByTopic = new Map<string, number>();
  for (const e of expenses) {
    if (!e.confirmed) continue;
    spentByTopic.set(e.topicId, (spentByTopic.get(e.topicId) ?? 0) + e.amount);
  }

  const rows: BudgetRow[] = topics
    .filter(
      (t) =>
        (t.type === 'EXPENSE' || t.type === 'BOTH') && (t.monthlyLimit ?? 0) > 0
    )
    .map((t) => {
      const limit = t.monthlyLimit as number;
      const spent = spentByTopic.get(t.id) ?? 0;
      const percent = (spent / limit) * 100;
      return {
        topicId: t.id,
        name: t.name,
        color: t.color,
        icon: t.icon,
        spent,
        limit,
        remaining: limit - spent,
        percent,
        status: budgetStatus(percent),
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const totalSpent = rows.reduce((sum, r) => sum + r.spent, 0);
  const totalLimit = rows.reduce((sum, r) => sum + r.limit, 0);
  const summary: BudgetSummary = {
    totalSpent,
    totalLimit,
    totalRemaining: totalLimit - totalSpent,
    percent: totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0,
    exceededCount: rows.filter((r) => r.status === 'exceeded').length,
  };

  return { rows, summary };
}

export function calculateGoalProgress(goal: SavingGoal) {
  return {
    ...goal,
    progressPercentage:
      goal.targetAmount > 0
        ? (goal.currentAmount / goal.targetAmount) * 100
        : 0,
    remainingAmount: Math.max(0, goal.targetAmount - goal.currentAmount),
  };
}

export function calculate12MonthProjection(
  startingCapital: number,
  averageMonthlyIncome: number,
  averageMonthlyExpense: number,
  startDate: Date = new Date()
) {
  const projections = [];
  let currentCapital = startingCapital;

  for (let i = 1; i <= 12; i++) {
    currentCapital += averageMonthlyIncome - averageMonthlyExpense;

    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);

    projections.push({
      monthIndex: i,
      monthString: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      projectedCapital: currentCapital,
    });
  }

  return projections;
}
