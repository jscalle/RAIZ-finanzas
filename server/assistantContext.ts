// Channel-agnostic space context for the assistant (Telegram and in-app).
// Moved verbatim out of server.ts; behaviour unchanged.
import type { Firestore } from 'firebase-admin/firestore';
import { calculateFinancials } from '../src/lib/mathEngine';

export const DEMO_SEED_IDS = new Set([
  "exp_1",
  "exp_2",
  "exp_3",
  "exp_4",
  "exp_5",
  "inc_1",
  "inc_2",
  "inc_3",
  "goal_1",
  "goal_2",
  "cnt_1",
  "cnt_2",
  "topic_vivienda",
  "topic_deudas",
]);

export function getColombiaDateISO(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export function normalizeDateToISO(dateStr: string): string {
  if (!dateStr) return getColombiaDateISO();
  const regex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const match = dateStr.match(regex);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return dateStr;
}

export async function getSpaceTopics(
  getDb: () => Firestore,
  spaceId: string,
  // Telegram keeps its built-in example list for spaces without categories; the in-app
  // assistant passes fallback: false so it never talks about categories that do not exist.
  options: { fallback?: boolean } = {}
): Promise<Array<{ id: string; name: string; type: string }>> {
  try {
    const adminDb = getDb();
    const snap = await adminDb.collection("spaces").doc(spaceId).collection("topics").get();
    if (!snap.empty) {
      return snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || d.id,
        type: d.data().type || "EXPENSE",
      }));
    }
  } catch (e) {
    console.warn("[assistant] Fallback topics used:", e);
  }
  if (options.fallback === false) return [];
  return [
    { id: "topic_1788142618873", name: "Restaurantes", type: "EXPENSE" },
    { id: "topic_comida", name: "Alimentación", type: "EXPENSE" },
    { id: "topic_1785985166584", name: "Salud e Imprevistos", type: "EXPENSE" },
    { id: "topic_transporte", name: "Transporte", type: "EXPENSE" },
    { id: "topic_ocio", name: "Ocio y Entretenimiento", type: "EXPENSE" },
    { id: "topic_1787321355706", name: "Compromisos Fijos", type: "EXPENSE" },
    { id: "topic_servicios", name: "Servicios Públicos", type: "EXPENSE" },
    { id: "topic_1786453647821", name: "Hogar", type: "EXPENSE" },
    { id: "topic_1790863156080", name: "Suscripciones", type: "EXPENSE" },
    { id: "topic_1787580821277", name: "Tarjetas/creditos", type: "EXPENSE" },
    { id: "topic_salario", name: "Salario Fijo", type: "INCOME" },
    { id: "topic_freelance", name: "Freelance / Extras", type: "INCOME" },
    { id: "topic_1787755412622", name: "Otros Ingresos", type: "INCOME" },
  ];
}

export async function getSpaceFullContext(getDb: () => Firestore, spaceId: string) {
  try {
    const adminDb = getDb();
    const spaceRef = adminDb.collection("spaces").doc(spaceId);
    const [spaceDoc, topicsSnap, expSnap, incSnap, goalsSnap, contribSnap, withSnap] = await Promise.all([
      spaceRef.get(),
      spaceRef.collection("topics").get(),
      spaceRef.collection("expenses").get(),
      spaceRef.collection("incomes").get(),
      spaceRef.collection("goals").get(),
      spaceRef.collection("contributions").get(),
      spaceRef.collection("withdrawals").get(),
    ]);

    const spaceData = spaceDoc.data() || {};
    const startingSavings = Number(spaceData.startingSavings || spaceData.savingsPool || 10000);

    const topics = topicsSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => ({
        id: d.id,
        name: d.data().name || d.id,
        type: d.data().type || "EXPENSE",
        monthlyLimit: Number(d.data().monthlyLimit) || 0,
      }));
    const topicMap = new Map(topics.map((t) => [t.id, t.name]));

    const expenses = expSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "EXPENSE",
          amount: Number(data.amount) || 0,
          description: data.description || "",
          topicId: data.topicId || "",
          category: topicMap.get(data.topicId) || data.topicId || "Otros",
          date: data.date || "",
          confirmed: data.confirmed !== false,
          source: data.source || "INGRESOS",
          paymentMethod: data.paymentMethod || "DEBITO",
          creditPaid: Boolean(data.creditPaid),
        };
      });

    const incomes = incSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: "INCOME",
          amount: Number(data.amount) || 0,
          description: data.description || "",
          topicId: data.topicId || "",
          category: topicMap.get(data.topicId) || data.topicId || "Ingresos",
          date: data.date || "",
          confirmed: data.confirmed !== false,
          method: data.method || "DIGITAL",
        };
      });

    const goals = goalsSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => d.data());
    const contributions = contribSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => ({
        amount: Number(d.data().amount) || 0,
        date: d.data().date || "",
        description: d.data().description || "",
      }));

    const currentMonth = getColombiaDateISO().slice(0, 7);

    // Balance left over from earlier months, computed with the same function the web app uses
    // so the assistant and the dashboard cannot disagree.
    const [cy, cm] = currentMonth.split("-").map(Number);
    const previousDate = new Date(Date.UTC(cy, cm - 2, 1));
    const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const upToPrevious = <T extends { date?: string }>(rows: T[]) =>
      rows.filter((r) => (r.date || "").slice(0, 7) <= previousMonth);
    const withdrawals = withSnap.docs
      .filter((d) => !DEMO_SEED_IDS.has(d.id))
      .map((d) => ({ amount: Number(d.data().amount) || 0, date: d.data().date || "" }));
    const previousFinancials = calculateFinancials(
      upToPrevious(incomes) as never,
      upToPrevious(expenses) as never,
      upToPrevious(contributions) as never,
      upToPrevious(withdrawals) as never,
      startingSavings
    );
    const saldoMesAnterior = Math.max(0, previousFinancials.currentIncomesPool + previousFinancials.cashPool);
    const validExpenses = expenses.filter(
      (e) =>
        e.confirmed &&
        e.topicId !== "topic_ahorros" &&
        !String(e.id || "").startsWith("exp_from_contrib_")
    );

    const expensesFromSavings = validExpenses
      .filter((e) => e.source === "AHORROS")
      .reduce((s, e) => s + e.amount, 0);
    const totalContributions = contributions.reduce((s, c) => s + c.amount, 0);
    const totalSavingsPool = startingSavings + totalContributions - expensesFromSavings;

    // Per-category spending for currentMonth (excluding internal savings transfers)
    const monthExpenses = validExpenses.filter((e) => (e.date || "").startsWith(currentMonth));
    const monthIncomes = incomes.filter((i) => i.confirmed && (i.date || "").startsWith(currentMonth));
    const monthContributions = contributions.filter((c) => (c.date || "").startsWith(currentMonth));

    // All unpaid credit card purchases across history
    const unpaidCreditExpenses = validExpenses.filter(
      (e) => e.paymentMethod === "CREDITO" && e.topicId !== "topic_1787580821277" && !e.creditPaid
    );

    // Distinct active months in history for average calculation
    const activeMonthsSet = new Set<string>(
      validExpenses.map((e) => (e.date || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
    );
    const numActiveMonths = Math.max(1, activeMonthsSet.size);

    const categoryBreakdown = topics
      .filter((t) => t.type === "EXPENSE" || t.type === "BOTH")
      .map((t) => {
        const spentThisMonth = monthExpenses
          .filter((e) => e.topicId === t.id)
          .reduce((s, e) => s + e.amount, 0);
        const totalHistoricalTopic = validExpenses
          .filter((e) => e.topicId === t.id)
          .reduce((s, e) => s + e.amount, 0);
        const averageMonthly = Math.round(totalHistoricalTopic / numActiveMonths);
        const limit = t.monthlyLimit || 0;
        return {
          topicId: t.id,
          category: t.name,
          spentThisMonth,
          monthlyLimit: limit,
          remainingBudget: limit > 0 ? limit - spentThisMonth : null,
          percentUsed: limit > 0 ? Math.round((spentThisMonth / limit) * 100) : 0,
          averageMonthly,
        };
      });

    const totalBudgetLimit = categoryBreakdown.reduce((s, c) => s + (c.monthlyLimit || 0), 0);
    let overBudgetTotal = 0;
    let unspentWithinLimitsTotal = 0;
    for (const c of categoryBreakdown) {
      const limit = c.monthlyLimit || 0;
      if (limit > 0) {
        if (c.spentThisMonth > limit) {
          overBudgetTotal += c.spentThisMonth - limit;
        } else {
          unspentWithinLimitsTotal += limit - c.spentThisMonth;
        }
      }
    }

    const ingresosMesActual = monthIncomes.reduce((s, i) => s + i.amount, 0);
    const gastosConsumoRealMesActual = monthExpenses
      .filter((e) => e.topicId !== "topic_1787580821277")
      .reduce((s, e) => s + e.amount, 0);
    const gastosDebitoEfectivoMesActual = monthExpenses
      .filter((e) => e.paymentMethod !== "CREDITO" && e.topicId !== "topic_1787580821277")
      .reduce((s, e) => s + e.amount, 0);
    const comprasConTcMesActual = monthExpenses
      .filter((e) => e.paymentMethod === "CREDITO" && e.topicId !== "topic_1787580821277")
      .reduce((s, e) => s + e.amount, 0);
    const pagosTarjetasCreditoMesActual = monthExpenses
      .filter((e) => e.topicId === "topic_1787580821277")
      .reduce((s, e) => s + e.amount, 0);
    const deudaTcAnteriorPagadaEsteMes = Math.max(
      0,
      pagosTarjetasCreditoMesActual - comprasConTcMesActual
    );
    const ahorroMesActual = monthContributions.reduce((s, c) => s + c.amount, 0);
    const deudaTcPendienteTotal = unpaidCreditExpenses.reduce((s, e) => s + e.amount, 0);

    // Spending in categories without a limit has no envelope to come out of, so it reduces the free
    // money directly. Savings-funded spending and credit card payments are left out.
    const budgetedIds = new Set(categoryBreakdown.filter((c) => c.monthlyLimit > 0).map((c) => c.topicId));
    const gastosSinTopeMesActual = monthExpenses
      .filter((e) => !budgetedIds.has(e.topicId) && e.topicId !== "topic_1787580821277" && e.source !== "AHORROS")
      .reduce((s, e) => s + e.amount, 0);

    // Same formula as Web App DashboardSection.tsx:
    // Saldo del mes anterior + Ingresos - Ahorro mes - Topes planeados - Excesos fuera de tope - Gastos sin tope - Deuda TC anterior pagada
    const disponibleRealParaGastar = Math.max(
      0,
      saldoMesAnterior +
        ingresosMesActual -
        ahorroMesActual -
        totalBudgetLimit -
        overBudgetTotal -
        gastosSinTopeMesActual -
        deudaTcAnteriorPagadaEsteMes
    );
    const money = (n: number) => `$${n.toLocaleString("es-CO")}`;

    const recentRecords = [
      ...validExpenses.map((e) => ({
        type: "EXPENSE",
        amount: e.amount,
        description: e.description,
        category: e.category,
        paymentMethod: e.paymentMethod,
        date: e.date,
      })),
      ...incomes.map((i) => ({
        type: "INCOME",
        amount: i.amount,
        description: i.description,
        category: i.category,
        paymentMethod: i.method,
        date: i.date,
      })),
    ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return {
      currentMonth,
      numActiveMonths,
      financialSummary: {
        disponibleRealParaGastar,
        formulaDisponibleReal: `${saldoMesAnterior > 0 ? `Saldo del mes anterior (${money(saldoMesAnterior)}) + ` : ""}Ingresos (${money(ingresosMesActual)}) - Ahorro mes (${money(ahorroMesActual)}) - Topes planeados (${money(totalBudgetLimit)}) - Excesos fuera de tope (${money(overBudgetTotal)})${gastosSinTopeMesActual > 0 ? ` - Gastos sin tope (${money(gastosSinTopeMesActual)})` : ""} - Deuda TC anterior pagada (${money(deudaTcAnteriorPagadaEsteMes)})`,
        saldoMesAnterior,
        gastosSinTopeMesActual,
        ingresosMesActual,
        gastosConsumoRealMesActual,
        gastosDebitoEfectivoMesActual,
        comprasConTcMesActual,
        pagosTarjetasCreditoMesActual,
        deudaTcAnteriorPagadaEsteMes,
        ahorroMesActual,
        ahorroAcumuladoTotal: totalSavingsPool,
        totalBudgetLimit,
        reservaEnTopesPorEjecutar: unspentWithinLimitsTotal,
        excesosFueraDeTope: overBudgetTotal,
        deudaTcPendienteTotal,
      },
      unpaidCreditExpenses,
      categoryBreakdown,
      goals,
      recentRecords: recentRecords.slice(0, 120),
    };
  } catch (e) {
    console.warn("[assistant] Error building full financial context:", e);
    return null;
  }
}
