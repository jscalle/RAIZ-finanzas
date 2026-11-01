import React from 'react';
import { Circle, Plus, Wallet } from 'lucide-react';
import { Expense, SavingGoal, Topic } from '../types';
import { ICON_REGISTRY } from './iconRegistry';
import CategoryBudget from './CategoryBudget';

interface DashboardSectionProps {
  expenses: Expense[];
  allExpenses?: Expense[];
  goals: SavingGoal[];
  topics: Topic[];
  onEditTopic?: (
    id: string,
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => void;
  startingSavings: number;
  totalContributions: number;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;
  privacyMode: 'real' | 'masked' | 'scaled';
  setPrivacyMode: (mode: 'real' | 'masked' | 'scaled') => void;
  privacyScale: number;
  setPrivacyScale: (scale: number) => void;
  activeMonth: string;
  setActiveMonth: (month: string) => void;
  capitalDisponible: number;
  cashPool: number;
  totals: { ingreso: number; gasto: number; ahorro: number };
  recentTransactions: {
    id: string;
    flow: 'ingreso' | 'gasto' | 'ahorro';
    topicId: string;
    description: string;
    amount: number;
  }[];
}

export default function DashboardSection({
  expenses,
  allExpenses,
  topics,
  onEditTopic,
  startingSavings,
  totalContributions,
  formatCurrency,
  totals,
  recentTransactions,
}: DashboardSectionProps) {
  const expensesFromSavings = (
    allExpenses && allExpenses.length > 0 ? allExpenses : expenses
  )
    .filter((e) => e.confirmed && e.source === 'AHORROS')
    .reduce((sum, e) => sum + e.amount, 0);
  const fallbackSavingsFromExpenses = (
    allExpenses && allExpenses.length > 0 ? allExpenses : expenses
  )
    .filter(
      (e) =>
        e.confirmed &&
        (e.topicId === 'topic_ahorros' ||
          String(e.id || '').startsWith('exp_from_contrib_'))
    )
    .reduce((sum, e) => sum + e.amount, 0);
  const effectiveContributions =
    totalContributions > 0 ? totalContributions : fallbackSavingsFromExpenses;
  const totalSavingsPool = Math.max(
    0,
    startingSavings + effectiveContributions - expensesFromSavings
  );
  const maxFlow = Math.max(totals.ingreso, totals.gasto, totals.ahorro, 1);
  const savingsRate =
    totals.ingreso > 0 ? Math.round((totals.ahorro / totals.ingreso) * 100) : 0;

  // Dynamic monthly execution & credit card metrics (no hardcoded pockets)
  const confirmedMonthExpenses = expenses.filter(
    (e) =>
      e.confirmed &&
      e.topicId !== 'topic_ahorros' &&
      !String(e.id || '').startsWith('exp_from_contrib_')
  );
  const historySource = (
    allExpenses && allExpenses.length > 0 ? allExpenses : expenses
  ).filter(
    (e) =>
      e.confirmed &&
      e.topicId !== 'topic_ahorros' &&
      !String(e.id || '').startsWith('exp_from_contrib_')
  );

  const budgetedTopics = topics.filter(
    (t) =>
      (t.type === 'EXPENSE' || t.type === 'BOTH') && (t.monthlyLimit || 0) > 0
  );

  const totalBudgetLimit = budgetedTopics.reduce(
    (sum, t) => sum + (t.monthlyLimit || 0),
    0
  );

  // Per-category over-budget (gastos reales fuera de lo planeado) & unspent reserve inside limits
  let overBudgetTotal = 0;
  let unspentWithinLimitsTotal = 0;
  for (const t of budgetedTopics) {
    const limit = t.monthlyLimit || 0;
    const spentInCat = confirmedMonthExpenses
      .filter((e) => e.topicId === t.id)
      .reduce((sum, e) => sum + e.amount, 0);
    if (spentInCat > limit) {
      overBudgetTotal += spentInCat - limit;
    } else {
      unspentWithinLimitsTotal += limit - spentInCat;
    }
  }

  const realConsumptionMonth = confirmedMonthExpenses
    .filter((e) => e.topicId !== 'topic_1787580821277')
    .reduce((sum, e) => sum + e.amount, 0);

  const debitAndCashMonth = confirmedMonthExpenses
    .filter(
      (e) =>
        e.paymentMethod !== 'CREDITO' && e.topicId !== 'topic_1787580821277'
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const creditPurchasesMonth = confirmedMonthExpenses
    .filter(
      (e) =>
        e.paymentMethod === 'CREDITO' && e.topicId !== 'topic_1787580821277'
    )
    .reduce((sum, e) => sum + e.amount, 0);

  const tcPaymentsMonth = confirmedMonthExpenses
    .filter((e) => e.topicId === 'topic_1787580821277')
    .reduce((sum, e) => sum + e.amount, 0);

  // Net old credit card debt paid this month beyond this month's new TC consumption
  const netPriorTcDebtPaidThisMonth = Math.max(
    0,
    tcPaymentsMonth - creditPurchasesMonth
  );

  // Disponible Real para Gastar (Proyectado del Mes):
  // Ingresos del mes - Ahorro del mes - (Topes Planeados + Excesos sobre Topes + Deuda TC anterior pagada este mes)
  const disponibleRealParaGastar = Math.max(
    0,
    totals.ingreso -
      totals.ahorro -
      totalBudgetLimit -
      overBudgetTotal -
      netPriorTcDebtPaidThisMonth
  );

  const unpaidCreditPurchases = historySource.filter(
    (e) =>
      e.paymentMethod === 'CREDITO' &&
      e.topicId !== 'topic_1787580821277' &&
      !(e as Expense & { creditPaid?: boolean }).creditPaid
  );
  const unpaidCreditTotal = unpaidCreditPurchases.reduce(
    (sum, e) => sum + e.amount,
    0
  );

  // Helper mappings
  const flowToken = {
    ingreso: {
      bg: 'bg-income',
      text: 'text-income',
      bar: 'bg-income',
      soft: 'bg-income-muted',
    },
    gasto: {
      bg: 'bg-expense',
      text: 'text-expense',
      bar: 'bg-expense',
      soft: 'bg-expense-muted',
    },
    ahorro: {
      bg: 'bg-savings',
      text: 'text-savings',
      bar: 'bg-savings',
      soft: 'bg-savings-muted',
    },
  };

  const flowMeta = {
    ingreso: { label: 'Ingreso', icon: 'TrendingUp' },
    gasto: { label: 'Gasto', icon: 'TrendingDown' },
    ahorro: { label: 'Ahorro', icon: 'PiggyBank' },
  };

  return (
    <div className="space-y-8" id="dashboard_panel">
      {/* Privacy and Control Panel */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4 hidden">
        {/* Hiding old settings bar logic since it might be requested, keeping it as placeholder */}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Resumen del mes
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">
            Tu panorama financiero
          </h1>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="size-4" />
          Nuevo movimiento
        </button>
      </header>

      {/* Balance hero */}
      <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-emerald-400">
              Disponible Real para Gastar (Libre después de Topes y Ahorro)
            </p>
            <p className="mt-1 font-display text-5xl font-bold tracking-tight text-foreground">
              {formatCurrency(disponibleRealParaGastar)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-xl">
              Cálculo: Ingresos ({formatCurrency(totals.ingreso)}) − Ahorro mes
              ({formatCurrency(totals.ahorro)}) − Topes planeados (
              {formatCurrency(totalBudgetLimit)}) − Excesos fuera de tope (
              {formatCurrency(overBudgetTotal)})
              {netPriorTcDebtPaidThisMonth > 0
                ? ` − Deuda TC anterior pagada (${formatCurrency(netPriorTcDebtPaidThisMonth)})`
                : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ahorro acumulado en metas:{' '}
              <span className="font-mono font-semibold text-savings">
                {formatCurrency(totalSavingsPool)}
              </span>{' '}
              · Tasa de ahorro del mes:{' '}
              <span className="font-semibold text-savings">{savingsRate}%</span>
            </p>
          </div>

          <div className="flex min-w-56 flex-1 flex-col gap-3">
            {(['ingreso', 'gasto', 'ahorro'] as const).map((f) => (
              <div key={f}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className={`size-2.5 rounded-full ${flowToken[f].bg}`}
                    />
                    {flowMeta[f].label}s
                  </span>
                  <span className="font-mono text-foreground">
                    {formatCurrency(totals[f])}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${flowToken[f].bar}`}
                    style={{ width: `${(totals[f] / maxFlow) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flow cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {(['ingreso', 'gasto', 'ahorro'] as const).map((f) => {
          const IconComp = ICON_REGISTRY[flowMeta[f].icon] || Circle;
          return (
            <div
              key={f}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex size-9 items-center justify-center rounded-xl ${flowToken[f].soft} ${flowToken[f].text}`}
                >
                  <IconComp className="size-4.5" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {flowMeta[f].label}s
                </span>
              </div>
              <p
                className={`mt-4 font-display text-2xl font-bold ${flowToken[f].text}`}
              >
                {formatCurrency(totals[f])}
              </p>
            </div>
          );
        })}
      </section>

      {/* Dynamic Execution & Credit Card Control (No static pockets) */}
      <section className="rounded-3xl border border-border bg-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Estado de Topes Planeados vs. Gasto Real del Mes
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">
              Reserva en Topes aún por Ejecutar:{' '}
              {formatCurrency(unspentWithinLimitsTotal)}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Has ejecutado {formatCurrency(realConsumptionMonth)} de{' '}
              {formatCurrency(totalBudgetLimit)} planeados en topes · Excesos
              fuera de tope:{' '}
              <span className="font-semibold text-rose-400">
                {formatCurrency(overBudgetTotal)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 font-medium text-emerald-400">
              Pagado con Débito / Efectivo: {formatCurrency(debitAndCashMonth)}
            </span>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 font-medium text-amber-400">
              Compras con TC este mes: {formatCurrency(creditPurchasesMonth)}
            </span>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 font-medium text-cyan-400">
              Pagos a Tarjetas este mes: {formatCurrency(tcPaymentsMonth)}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                💳 Compras con TC en la App sin Cruzar
              </span>
              <span className="font-mono text-base font-bold text-amber-400">
                {formatCurrency(unpaidCreditTotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Suma de las compras registradas en la app con método{' '}
              <strong>CRÉDITO</strong> que aún no se han cruzado con un abono en{' '}
              <em>Tarjetas/creditos</em>. (Si un gasto de TC se registró como
              Débito, cámbialo a Crédito en la pestaña Gastos para sumarlo
              aquí).
            </p>
            {unpaidCreditPurchases.length > 0 && (
              <ul className="pt-2 space-y-1 text-xs border-t border-border/60">
                {unpaidCreditPurchases.slice(0, 4).map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between text-muted-foreground"
                  >
                    <span className="truncate pr-2">
                      • {u.description} ({u.date})
                    </span>
                    <span className="font-mono font-semibold text-foreground shrink-0">
                      {formatCurrency(u.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-background/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                📐 Cómo funciona tu Calibración de Topes
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Abajo, en cada categoría verás tu <strong>Gasto del Mes</strong>{' '}
              frente al <strong>Tope Actual</strong> y tu{' '}
              <strong>Promedio Mensual Real</strong>. Si tu promedio histórico
              cambia frente al tope, puedes actualizar el tope con 1 clic para
              saber exactamente cuánto reservar en tu banco cada mes.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Budget by category */}
        <section className="lg:col-span-3">
          <h2 className="mb-4 font-display text-lg font-bold">
            Presupuesto por categoría
          </h2>
          <CategoryBudget
            expenses={confirmedMonthExpenses}
            allExpenses={historySource}
            topics={topics}
            onEditTopic={onEditTopic}
            formatCurrency={formatCurrency}
          />
        </section>

        {/* Recent */}
        <section className="lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-bold">
            Movimientos recientes
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {recentTransactions.map((t) => {
              const cat = topics.find((topic) => topic.id === t.topicId);
              const CatIcon = ICON_REGISTRY[cat?.icon || 'Wallet'] || Wallet;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${flowToken[t.flow].soft} ${flowToken[t.flow].text}`}
                  >
                    <CatIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {cat?.name || 'Otro'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold ${flowToken[t.flow].text}`}
                  >
                    {t.flow === 'ingreso' ? '+' : '−'}
                    {formatCurrency(t.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
