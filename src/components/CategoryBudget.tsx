import React from 'react';
import { Circle } from 'lucide-react';
import { Expense, Topic, BudgetRow } from '../types';
import { budgetByCategory } from '../lib/mathEngine';
import { ICON_REGISTRY } from './iconRegistry';

interface CategoryBudgetProps {
  expenses: Expense[];
  allExpenses?: Expense[];
  topics: Topic[];
  onEditTopic?: (
    id: string,
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => void;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;
}

// Visual tokens per budget status, reused for bar fill and badge.
const STATUS_STYLE: Record<
  BudgetRow['status'],
  { bar: string; badge: string; label: string }
> = {
  normal: {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    label: 'En rumbo',
  },
  warning: {
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    label: 'Cerca del Límite',
  },
  exceeded: {
    bar: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    label: '¡Excedido!',
  },
};

const CategoryBudget: React.FC<CategoryBudgetProps> = ({
  expenses,
  allExpenses,
  topics,
  onEditTopic,
  formatCurrency,
}) => {
  const { rows, summary } = budgetByCategory(expenses, topics);

  const historyList = (
    allExpenses && allExpenses.length > 0 ? allExpenses : expenses
  ).filter(
    (e) =>
      e.confirmed &&
      e.topicId !== 'topic_ahorros' &&
      !String(e.id || '').startsWith('exp_from_contrib_')
  );

  const activeMonthsSet = new Set<string>(
    historyList
      .map((e) => (e.date || '').slice(0, 7))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
  );
  const numActiveMonths = Math.max(1, activeMonthsSet.size);

  const avgByTopic = new Map<string, number>();
  for (const e of historyList) {
    avgByTopic.set(e.topicId, (avgByTopic.get(e.topicId) ?? 0) + e.amount);
  }
  for (const [tid, total] of avgByTopic.entries()) {
    avgByTopic.set(tid, Math.round(total / numActiveMonths));
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">
          Ninguna categoría tiene un límite mensual todavía.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Asigná un límite en Categorías para seguir tu presupuesto.
        </p>
      </div>
    );
  }

  const summaryPct = Math.min(summary.percent, 100);
  const summaryStatus: BudgetRow['status'] =
    summary.percent >= 100
      ? 'exceeded'
      : summary.percent >= 80
        ? 'warning'
        : 'normal';

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      {/* Total summary */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
            Presupuesto del mes
          </span>
          <span className="font-mono text-sm text-foreground">
            {formatCurrency(summary.totalSpent)}
            <span className="text-muted-foreground/60">
              {' '}
              / {formatCurrency(summary.totalLimit)}
            </span>
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${STATUS_STYLE[summaryStatus].bar}`}
            style={{ width: `${summaryPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span
            className={
              summary.totalRemaining >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }
          >
            {summary.totalRemaining >= 0
              ? `Te queda ${formatCurrency(summary.totalRemaining)}`
              : `Excedido por ${formatCurrency(Math.abs(summary.totalRemaining))}`}
          </span>
          {summary.exceededCount > 0 && (
            <span className="text-rose-400">
              {summary.exceededCount} categoría
              {summary.exceededCount > 1 ? 's' : ''} excedida
              {summary.exceededCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Per-category rows */}
      <ul className="space-y-4">
        {rows.map((row) => {
          const Icon = ICON_REGISTRY[row.icon] ?? Circle;
          const style = STATUS_STYLE[row.status];
          const barWidth = Math.min(row.percent, 100);
          return (
            <li key={row.topicId}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="size-4.5 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground break-words">
                  {row.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}
                  >
                    {style.label}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {formatCurrency(row.spent)}
                    <span className="text-muted-foreground/60">
                      {' '}
                      / {formatCurrency(row.limit)}
                    </span>
                  </span>
                </div>
                <span
                  className={
                    row.remaining >= 0
                      ? 'text-muted-foreground'
                      : 'text-rose-400'
                  }
                >
                  {row.remaining >= 0
                    ? `Te queda ${formatCurrency(row.remaining)}`
                    : `Excedido por ${formatCurrency(Math.abs(row.remaining))}`}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              {(() => {
                const avg = avgByTopic.get(row.topicId) ?? 0;
                const roundedSuggested = Math.max(
                  50000,
                  Math.round(avg / 10000) * 10000
                );
                const topicObj = topics.find((t) => t.id === row.topicId);
                const diffRatio =
                  row.limit > 0
                    ? Math.abs(roundedSuggested - row.limit) / row.limit
                    : 0;
                return (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Promedio real ({numActiveMonths}{' '}
                      {numActiveMonths === 1 ? 'mes' : 'meses'}):{' '}
                      <strong className="font-mono text-foreground">
                        {formatCurrency(avg)}
                      </strong>
                      /mes
                    </span>
                    {onEditTopic &&
                      topicObj &&
                      avg > 0 &&
                      diffRatio >= 0.1 &&
                      roundedSuggested !== row.limit && (
                        <button
                          type="button"
                          onClick={() =>
                            onEditTopic(
                              topicObj.id,
                              topicObj.name,
                              topicObj.type,
                              topicObj.icon,
                              topicObj.color,
                              roundedSuggested
                            )
                          }
                          className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                          Ajustar tope a {formatCurrency(roundedSuggested)}
                        </button>
                      )}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default CategoryBudget;
