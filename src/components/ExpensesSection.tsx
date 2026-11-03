import React, { useState } from 'react';
import CategoryDonut from './CategoryDonut';
import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  Clock,
  MessageSquare,
  MinusCircle,
  Pencil,
  PiggyBank,
  Plus,
  Shapes,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { Expense, Topic } from '../types';
import { renderIcon } from './renderIcon';
import { parseFormattedNumber, expensesByCategory } from '../lib/mathEngine';
import { InfoTip } from './InfoTip';

interface ExpensesSectionProps {
  expenses: Expense[];
  topics: Topic[];
  onAddExpense: (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    source: 'INGRESOS' | 'AHORROS',
    confirmed: boolean,
    paymentMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO'
  ) => void;
  onEditExpense: (
    id: string,
    description: string,
    amount: number,
    topicId: string,
    date: string,
    source: 'INGRESOS' | 'AHORROS',
    confirmed: boolean,
    paymentMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO'
  ) => void;
  onToggleConfirmExpense: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;
}

const renderReconciliationBadge = (status?: string, source?: string) => {
  if (status === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase whitespace-nowrap">
        <CheckCircle className="h-2.5 w-2.5" />
        Verificado Gmail
      </span>
    );
  }
  if (source === 'SMS_PUSH' || source === 'GMAIL') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[9px] font-bold uppercase whitespace-nowrap">
        <MessageSquare className="h-2.5 w-2.5" />
        Capturado SMS/Push
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase whitespace-nowrap">
        <Clock className="h-2.5 w-2.5" />
        Pendiente
      </span>
    );
  }
  return null;
};

export default function ExpensesSection({
  expenses,
  topics,
  onAddExpense,
  onEditExpense,
  onToggleConfirmExpense,
  onDeleteExpense,
  formatCurrency,
}: ExpensesSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedExpenseDetail, setSelectedExpenseDetail] =
    useState<Expense | null>(null);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [topicId, setTopicId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [source, setSource] = useState<'INGRESOS' | 'AHORROS'>('INGRESOS');
  const [confirmed, setConfirmed] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<
    'DEBITO' | 'CREDITO' | 'EFECTIVO'
  >('DEBITO');
  const [error, setError] = useState('');

  const expenseTopics = topics.filter(
    (t) => t.type === 'EXPENSE' || t.type === 'BOTH'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('La descripción es requerida.');
      return;
    }
    const val = parseFormattedNumber(amount);
    if (isNaN(val) || val <= 0) {
      setError('El monto debe ser un número mayor a cero.');
      return;
    }
    if (!topicId) {
      setError('Debes seleccionar un tópico.');
      return;
    }

    try {
      if (editingExpense) {
        onEditExpense(
          editingExpense.id,
          description.trim(),
          val,
          topicId,
          date,
          source,
          confirmed,
          paymentMethod
        );
      } else {
        onAddExpense(
          description.trim(),
          val,
          topicId,
          date,
          source,
          confirmed,
          paymentMethod
        );
      }

      // Reset States
      setIsModalOpen(false);
      setEditingExpense(null);
      setDescription('');
      setAmount('');
      setSource('INGRESOS');
      setConfirmed(true);
      setPaymentMethod('DEBITO');
      setError('');
    } catch (err) {
      setError(
        (err instanceof Error && err.message) || 'Error al guardar el gasto'
      );
    }
  };

  const handleDeleteExpense = (id: string) => {
    try {
      onDeleteExpense(id);
      setError('');
    } catch (err) {
      setError(
        (err instanceof Error && err.message) || 'Error al eliminar el gasto'
      );
    }
  };

  const handleToggleConfirmExpense = (id: string) => {
    try {
      onToggleConfirmExpense(id);
      setError('');
    } catch (err) {
      setError(
        (err instanceof Error && err.message) || 'Error al actualizar el estado'
      );
    }
  };

  const handleOpenAdd = () => {
    if (expenseTopics.length === 0) {
      alert(
        "Primero crea un tópico de tipo 'Gasto' o 'Ambos' en la pestaña Configuración."
      );
      return;
    }
    setEditingExpense(null);
    setDescription('');
    setAmount('');
    setTopicId(expenseTopics[0].id);
    setDate(new Date().toISOString().split('T')[0]);
    setSource('INGRESOS');
    setConfirmed(true);
    setPaymentMethod('DEBITO');
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setDescription(exp.description);
    setAmount(exp.amount.toString());
    setTopicId(exp.topicId);
    setDate(exp.date);
    setSource(exp.source);
    setConfirmed(exp.confirmed);
    setPaymentMethod(exp.paymentMethod || 'DEBITO');
    setError('');
    setIsModalOpen(true);
  };

  // Filter out internal savings transfers (already shown in Metas de Ahorro)
  const visibleExpenses = expenses.filter(
    (e) =>
      e.topicId !== 'topic_ahorros' &&
      !String(e.id || '').startsWith('exp_from_contrib_')
  );

  // Separate real consumption from credit card payments so numbers match Dashboard 100%
  const consumptionExpenses = visibleExpenses.filter(
    (e) => e.topicId !== 'topic_1787580821277'
  );
  const tcPaymentExpenses = visibleExpenses.filter(
    (e) => e.topicId === 'topic_1787580821277'
  );

  const totalConsumption = consumptionExpenses
    .filter((e) => e.confirmed)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const totalTcPayments = tcPaymentExpenses
    .filter((e) => e.confirmed)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const totalAllOutflows = totalConsumption + totalTcPayments;

  const { slices: categorySlices, total: categoryTotal } = expensesByCategory(
    consumptionExpenses.filter((e) => e.confirmed),
    topics
  );

  return (
    <div
      className="bg-card rounded-2xl p-6 border border-border/40 space-y-6"
      id="expenses_panel"
    >
      {error && !isModalOpen && (
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-lg text-sm border border-rose-500/20 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            className="ml-auto text-rose-400/80 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-light text-foreground flex items-center gap-2">
            <MinusCircle className="h-5 w-5 text-rose-400" />
            Control de Gastos
            <InfoTip
              label="Más información sobre el control de gastos"
              title="Control de Gastos"
            >
              Reconcilia tus desembolsos, seleccionando si pagas con Débito,
              Crédito o Efectivo Físico, y cruza su origen entre ingresos
              corrientes o ahorros acumulados.
            </InfoTip>
          </h2>
        </div>
        <button
          onClick={handleOpenAdd}
          className="w-full sm:w-auto px-4 py-2 text-sm font-bold text-[#070809] bg-rose-400 hover:bg-rose-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          id="btn_add_expense"
        >
          <Plus className="h-4 w-4" />
          Registrar Gasto
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border/40">
          <span className="block text-[10px] text-rose-400 uppercase tracking-widest font-bold">
            Consumo Real del Mes (Sin Pagos TC)
          </span>
          <span className="text-2xl font-semibold text-foreground mt-1 block font-mono">
            {formatCurrency(totalConsumption)}
          </span>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border/40">
          <span className="block text-[10px] text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1">
            <Briefcase className="h-3 w-3" />
            Abonos / Pagos a Tarjetas (TC)
          </span>
          <span className="text-2xl font-semibold text-cyan-400 mt-1 block font-mono">
            {formatCurrency(totalTcPayments)}
          </span>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border/40">
          <span className="block text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold flex items-center gap-1">
            <PiggyBank className="h-3 w-3" />
            Total Egresos (Consumo + Abonos TC)
          </span>
          <span className="text-2xl font-semibold text-muted-foreground mt-1 block font-mono">
            {formatCurrency(totalAllOutflows)}
          </span>
        </div>
      </div>

      {/* Expenses by category */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground/80">
          <Shapes className="h-4 w-4" />
          Gastos por categoría
        </h3>
        <CategoryDonut
          slices={categorySlices}
          total={categoryTotal}
          formatCurrency={formatCurrency}
        />
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-x-auto border border-border/40 rounded-xl bg-card/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground/80 text-[10px] font-bold uppercase tracking-widest">
              <th className="p-4">Tópico</th>
              <th className="p-4">Descripción</th>
              <th className="p-4">Método de Pago</th>
              <th className="p-4">Fecha</th>
              <th className="p-4">Monto</th>
              <th className="p-4">Origen / Cruce</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border rounded-2xl border border-border bg-card">
            {visibleExpenses.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="p-8 text-center text-muted-foreground/80 italic"
                >
                  No hay gastos registrados en este periodo.
                </td>
              </tr>
            ) : (
              visibleExpenses.map((exp) => {
                const topic = topics.find((t) => t.id === exp.topicId);
                const isEfectivo = exp.paymentMethod === 'EFECTIVO';
                const isCredito = exp.paymentMethod === 'CREDITO';
                return (
                  <tr
                    key={exp.id}
                    className="hover:bg-muted/30 transition-all"
                    id={`expense_row_${exp.id}`}
                  >
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded bg-muted text-muted-foreground/80`}
                        >
                          {topic ? (
                            renderIcon(topic.icon, 'h-4 w-4')
                          ) : (
                            <ShoppingBag className="h-4 w-4" />
                          )}
                        </div>
                        <span className="font-semibold text-muted-foreground/80">
                          {topic?.name || 'Sin Tópico'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 font-light text-muted-foreground">
                      {exp.description}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isEfectivo
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                            : isCredito
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/10'
                        }`}
                      >
                        {exp.paymentMethod === 'EFECTIVO'
                          ? '💰 Efectivo'
                          : exp.paymentMethod === 'CREDITO'
                            ? '💳 Crédito'
                            : '🪪 Débito'}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground/80 font-mono whitespace-nowrap">
                      {exp.date}
                    </td>
                    <td className="p-4 font-mono font-bold text-muted-foreground">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest font-mono flex items-center gap-1 w-max ${
                          exp.source === 'INGRESOS'
                            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                            : 'bg-pink-500/10 text-pink-300 border border-pink-500/20'
                        }`}
                      >
                        {exp.source === 'INGRESOS' ? (
                          <>
                            <TrendingUp className="h-2.5 w-2.5" />
                            Ingresos
                          </>
                        ) : (
                          <>
                            <PiggyBank className="h-2.5 w-2.5" />
                            Ahorros
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleConfirmExpense(exp.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all ${
                          exp.confirmed
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-muted text-muted-foreground/80 border border-border/40'
                        }`}
                      >
                        {exp.confirmed ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Confirmado (Pagado)
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" />
                            Por Confirmar
                          </>
                        )}
                      </button>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(exp)}
                          className="p-1.5 text-muted-foreground/80 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all cursor-pointer"
                          title="Editar gasto"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 text-muted-foreground/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MOBILE LIST CARDS */}
      <div className="block md:hidden space-y-2">
        {visibleExpenses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground/80 italic border border-border/40 rounded-xl bg-card/40">
            No hay gastos registrados en este periodo.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
            {visibleExpenses.map((exp) => {
              const topic = topics.find((t) => t.id === exp.topicId);
              return (
                <button
                  key={exp.id}
                  onClick={() => setSelectedExpenseDetail(exp)}
                  className="w-full text-left p-4 hover:bg-muted/30 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
                      {topic ? (
                        renderIcon(topic.icon, 'h-5 w-5')
                      ) : (
                        <ShoppingBag className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {exp.description}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="truncate">
                          {topic?.name || 'Sin Tópico'}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{exp.date}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="font-mono font-bold text-foreground">
                          {formatCurrency(exp.amount)}
                        </div>
                        {renderReconciliationBadge(
                          exp.reconciliationStatus,
                          exp.verificationSource
                        )}
                      </div>
                      <span
                        className={`h-2 w-2 rounded-full ${exp.confirmed ? 'bg-rose-400' : 'bg-muted-foreground/40'}`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MOBILE DETAIL MODAL */}
      {selectedExpenseDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50 md:hidden animate-in fade-in">
          <div className="bg-card rounded-3xl sm:rounded-2xl w-full max-w-md border border-border/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400">
                    {topics.find(
                      (t) => t.id === selectedExpenseDetail.topicId
                    ) ? (
                      renderIcon(
                        topics.find(
                          (t) => t.id === selectedExpenseDetail.topicId
                        )!.icon,
                        'h-6 w-6'
                      )
                    ) : (
                      <ShoppingBag className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight">
                      {selectedExpenseDetail.description}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {topics.find(
                        (t) => t.id === selectedExpenseDetail.topicId
                      )?.name || 'Sin Tópico'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedExpenseDetail(null)}
                  className="p-2 text-muted-foreground/80 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Monto</span>
                  <span className="font-mono font-bold text-lg text-foreground">
                    {formatCurrency(selectedExpenseDetail.amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <span className="font-mono text-sm text-foreground">
                    {selectedExpenseDetail.date}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">
                    Método de Pago
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedExpenseDetail.paymentMethod === 'EFECTIVO'
                      ? '💰 Efectivo'
                      : selectedExpenseDetail.paymentMethod === 'CREDITO'
                        ? '💳 Crédito'
                        : '🪪 Débito'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Origen</span>
                  <span
                    className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${selectedExpenseDetail.source === 'INGRESOS' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-pink-500/10 text-pink-400'}`}
                  >
                    {selectedExpenseDetail.source === 'INGRESOS'
                      ? 'Ingresos'
                      : 'Ahorros'}
                  </span>
                </div>

                {(selectedExpenseDetail.reconciliationStatus ||
                  selectedExpenseDetail.verificationSource) && (
                  <div className="flex justify-between items-center py-3 border-b border-border/40">
                    <span className="text-sm text-muted-foreground">
                      Estado
                    </span>
                    {renderReconciliationBadge(
                      selectedExpenseDetail.reconciliationStatus,
                      selectedExpenseDetail.verificationSource
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => {
                    handleToggleConfirmExpense(selectedExpenseDetail.id);
                    setSelectedExpenseDetail({
                      ...selectedExpenseDetail,
                      confirmed: !selectedExpenseDetail.confirmed,
                    });
                  }}
                  className={`col-span-2 p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-colors ${
                    selectedExpenseDetail.confirmed
                      ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {selectedExpenseDetail.confirmed ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                  {selectedExpenseDetail.confirmed
                    ? 'Marcado como Pagado'
                    : 'Marcar como Pagado'}
                </button>
                <button
                  onClick={() => {
                    setSelectedExpenseDetail(null);
                    handleOpenEdit(selectedExpenseDetail);
                  }}
                  className="p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setSelectedExpenseDetail(null);
                    handleDeleteExpense(selectedExpenseDetail.id);
                  }}
                  className="p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-card">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <MinusCircle className="h-5 w-5 text-rose-400" />
                {editingExpense ? 'Editar Gasto' : 'Registrar Gasto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted-foreground/80 hover:text-muted-foreground rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg text-xs border border-rose-500/20 flex gap-2">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Descripción
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ej. Compra supermercado, Pago de luz..."
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Monto ($)
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as 'DEBITO' | 'CREDITO' | 'EFECTIVO'
                      )
                    }
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                  >
                    <option value="DEBITO">🪪 Tarjeta de Débito</option>
                    <option value="CREDITO">💳 Tarjeta de Crédito</option>
                    <option value="EFECTIVO">💰 Efectivo Físico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Tópico / Categoría
                  </label>
                  <select
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                  >
                    {expenseTopics.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        className="bg-card text-muted-foreground"
                      >
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cruce de origen (Cruzar ingresos o ahorros) */}
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Cruce / Origen de Fondos (Capital Disponible)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSource('INGRESOS')}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      source === 'INGRESOS'
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                        : 'bg-white/[0.01] border-border/40 text-muted-foreground/80 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Briefcase className="h-4 w-4" />
                    <div className="text-[10px] font-bold uppercase tracking-wider">
                      Ingresos
                    </div>
                    <span className="text-[9px] text-muted-foreground/80">
                      Fondo corriente mensual
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSource('AHORROS')}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      source === 'AHORROS'
                        ? 'bg-pink-500/15 border-pink-500 text-pink-300'
                        : 'bg-white/[0.01] border-border/40 text-muted-foreground/80 hover:bg-white/[0.03]'
                    }`}
                  >
                    <PiggyBank className="h-4 w-4" />
                    <div className="text-[10px] font-bold uppercase tracking-wider">
                      Ahorros
                    </div>
                    <span className="text-[9px] text-muted-foreground/80">
                      Respaldo / Metas
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="confirm_exp_on_add"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded bg-white/5 border-white/10 text-rose-500 focus:ring-0 focus:ring-offset-0"
                />
                <label
                  htmlFor="confirm_exp_on_add"
                  className="text-xs text-muted-foreground/80 font-medium cursor-pointer select-none"
                >
                  Marcar como gasto ya pagado / confirmado
                </label>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-muted-foreground/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-rose-400 hover:bg-rose-300 rounded-lg transition-colors"
                >
                  {editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
