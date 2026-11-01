import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react';
import { Income, Topic, Withdrawal } from '../types';
import { renderIcon } from './renderIcon';
import { parseFormattedNumber } from '../lib/mathEngine';

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
interface IncomesSectionProps {
  incomes: Income[];
  topics: Topic[];
  onAddIncome: (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO'
  ) => void;
  onEditIncome: (
    id: string,
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO'
  ) => void;
  onToggleConfirmIncome: (id: string) => void;
  onDeleteIncome: (id: string) => void;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;

  // ATM Withdrawals
  withdrawals: Withdrawal[];
  onAddWithdrawal: (description: string, amount: number, date: string) => void;
  onEditWithdrawal: (
    id: string,
    description: string,
    amount: number,
    date: string
  ) => void;
  onDeleteWithdrawal: (id: string) => void;
  cashPool: number;
}

export default function IncomesSection({
  incomes,
  topics,
  onAddIncome,
  onEditIncome,
  onToggleConfirmIncome,
  onDeleteIncome,
  formatCurrency,
  withdrawals,
  onAddWithdrawal,
  onEditWithdrawal,
  onDeleteWithdrawal,
  cashPool,
}: IncomesSectionProps) {
  // Income Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [selectedIncomeDetail, setSelectedIncomeDetail] =
    useState<Income | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [topicId, setTopicId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [confirmed, setConfirmed] = useState(true);
  const [method, setMethod] = useState<'DIGITAL' | 'EFECTIVO'>('DIGITAL');
  const [incomeError, setIncomeError] = useState('');
  const [globalError, setGlobalError] = useState('');

  // ATM Withdrawal Modal States
  const [isWthOpen, setIsWthOpen] = useState(false);
  const [editingWithdrawal, setEditingWithdrawal] = useState<Withdrawal | null>(
    null
  );
  const [selectedWthDetail, setSelectedWthDetail] = useState<Withdrawal | null>(
    null
  );
  const [wthDescription, setWthDescription] = useState('');
  const [wthAmount, setWthAmount] = useState('');
  const [wthDate, setWthDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [wthError, setWthError] = useState('');

  const incomeTopics = topics.filter(
    (t) => t.type === 'INCOME' || t.type === 'BOTH'
  );

  // Income Submit
  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setIncomeError('La descripción es requerida.');
      return;
    }
    const val = parseFormattedNumber(amount);
    if (isNaN(val) || val <= 0) {
      setIncomeError('El monto debe ser un número mayor a cero.');
      return;
    }
    if (!topicId) {
      setIncomeError('Debes seleccionar un tópico.');
      return;
    }

    try {
      if (editingIncome) {
        onEditIncome(
          editingIncome.id,
          description.trim(),
          val,
          topicId,
          date,
          confirmed,
          method
        );
      } else {
        onAddIncome(description.trim(), val, topicId, date, confirmed, method);
      }

      // Reset
      setIsModalOpen(false);
      setEditingIncome(null);
      setDescription('');
      setAmount('');
      setIncomeError('');
    } catch (err: any) {
      setIncomeError(err.message || 'Error al guardar el ingreso');
    }
  };

  const handleDeleteIncome = (id: string) => {
    try {
      onDeleteIncome(id);
      setGlobalError('');
    } catch (err: any) {
      setGlobalError(err.message || 'Error al eliminar el ingreso');
    }
  };

  const handleToggleConfirmIncome = (id: string) => {
    try {
      onToggleConfirmIncome(id);
      setGlobalError('');
    } catch (err: any) {
      setGlobalError(err.message || 'Error al actualizar el estado');
    }
  };

  // Open Add Income Modal
  const handleOpenAddIncome = () => {
    if (incomeTopics.length === 0) {
      alert(
        "Primero crea un tópico de tipo 'Ingreso' o 'Ambos' en la pestaña Configuración."
      );
      return;
    }
    setEditingIncome(null);
    setDescription('');
    setAmount('');
    setTopicId(incomeTopics[0].id);
    setDate(new Date().toISOString().split('T')[0]);
    setConfirmed(true);
    setMethod('DIGITAL');
    setIncomeError('');
    setIsModalOpen(true);
  };

  // Open Edit Income Modal
  const handleOpenEditIncome = (inc: Income) => {
    setEditingIncome(inc);
    setDescription(inc.description);
    setAmount(inc.amount.toString());
    setTopicId(inc.topicId);
    setDate(inc.date);
    setConfirmed(inc.confirmed);
    setMethod(inc.method || 'DIGITAL');
    setIncomeError('');
    setIsModalOpen(true);
  };

  // ATM Submit
  const handleWthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wthDescription.trim()) {
      setWthError('La descripción del retiro es requerida.');
      return;
    }
    const val = parseFormattedNumber(wthAmount);
    if (isNaN(val) || val <= 0) {
      setWthError('El monto del retiro debe ser un número mayor a cero.');
      return;
    }

    try {
      if (editingWithdrawal) {
        onEditWithdrawal(
          editingWithdrawal.id,
          wthDescription.trim(),
          val,
          wthDate
        );
      } else {
        onAddWithdrawal(wthDescription.trim(), val, wthDate);
      }

      setIsWthOpen(false);
      setEditingWithdrawal(null);
      setWthDescription('');
      setWthAmount('');
      setWthError('');
    } catch (err: any) {
      setWthError(err.message || 'Error al guardar el retiro');
    }
  };

  const handleDeleteWithdrawal = (id: string) => {
    try {
      onDeleteWithdrawal(id);
      setGlobalError('');
    } catch (err: any) {
      setGlobalError(err.message || 'Error al eliminar el retiro');
    }
  };

  // Open Add Withdrawal Modal
  const handleOpenAddWth = () => {
    setEditingWithdrawal(null);
    setWthDescription('Retiro de cajero');
    setWthAmount('');
    setWthDate(new Date().toISOString().split('T')[0]);
    setWthError('');
    setIsWthOpen(true);
  };

  // Open Edit Withdrawal Modal
  const handleOpenEditWth = (wth: Withdrawal) => {
    setEditingWithdrawal(wth);
    setWthDescription(wth.description);
    setWthAmount(wth.amount.toString());
    setWthDate(wth.date);
    setWthError('');
    setIsWthOpen(true);
  };

  // Stats calculations
  const totalIncomes = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const confirmedIncomes = incomes
    .filter((inc) => inc.confirmed)
    .reduce((sum, inc) => sum + inc.amount, 0);
  const pendingIncomes = totalIncomes - confirmedIncomes;

  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);

  return (
    <div className="space-y-6" id="incomes_panel">
      {globalError && (
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-lg text-sm border border-rose-500/20 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{globalError}</span>
          <button
            onClick={() => setGlobalError('')}
            className="ml-auto text-rose-400/80 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* 1. Main Incomes Card */}
      <div className="bg-card rounded-2xl p-6 border border-border/40 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-light text-foreground flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-emerald-400" />
              Gestión de Ingresos
            </h2>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Registra tus entradas de dinero, marcando si se reciben por
              transferencia digital o efectivo físico directo.
            </p>
          </div>
          <button
            onClick={handleOpenAddIncome}
            className="w-full sm:w-auto px-4 py-2 text-sm font-bold text-[#070809] bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            id="btn_add_income"
          >
            <Plus className="h-4 w-4" />
            Registrar Ingreso
          </button>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-muted/50 p-4 rounded-xl border border-border/40">
            <span className="block text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold">
              Total Ingresos
            </span>
            <span className="text-2xl font-semibold text-muted-foreground mt-1 block font-mono">
              {formatCurrency(totalIncomes)}
            </span>
          </div>
          <div className="bg-muted/50 p-4 rounded-xl border border-border/40">
            <span className="block text-[10px] text-emerald-500 uppercase tracking-widest font-bold flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Ingresos Confirmados
            </span>
            <span className="text-2xl font-semibold text-emerald-400 mt-1 block font-mono">
              {formatCurrency(confirmedIncomes)}
            </span>
          </div>
          <div className="bg-muted/50 p-4 rounded-xl border border-border/40">
            <span className="block text-[10px] text-amber-500 uppercase tracking-widest font-bold flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Ingresos Pendientes
            </span>
            <span className="text-2xl font-semibold text-amber-400 mt-1 block font-mono">
              {formatCurrency(pendingIncomes)}
            </span>
          </div>
        </div>

        {/* DESKTOP Incomes Table */}
        <div className="hidden md:block overflow-x-auto border border-border/40 rounded-xl bg-card/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground/80 text-[10px] font-bold uppercase tracking-widest">
                <th className="p-4">Tópico</th>
                <th className="p-4">Descripción</th>
                <th className="p-4">Origen / Vía</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Monto</th>
                <th className="p-4">Confirmación</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border rounded-2xl border border-border bg-card">
              {incomes.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-muted-foreground/80 italic"
                  >
                    No hay ingresos registrados en este periodo.
                  </td>
                </tr>
              ) : (
                incomes.map((inc) => {
                  const topic = topics.find((t) => t.id === inc.topicId);
                  const isEfectivo = inc.method === 'EFECTIVO';
                  return (
                    <tr
                      key={inc.id}
                      className="hover:bg-muted/50 transition-all"
                      id={`income_row_${inc.id}`}
                    >
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded bg-muted text-muted-foreground/80`}
                          >
                            {topic ? (
                              renderIcon(topic.icon, 'h-4 w-4')
                            ) : (
                              <DollarSign className="h-4 w-4" />
                            )}
                          </div>
                          <span className="font-semibold text-muted-foreground/80">
                            {topic?.name || 'Sin Tópico'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 font-light text-muted-foreground">
                        {inc.description}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isEfectivo
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/10'
                          }`}
                        >
                          {isEfectivo ? 'Efectivo' : 'Digital'}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground/80 font-mono whitespace-nowrap">
                        {inc.date}
                      </td>
                      <td className="p-4 font-mono font-bold text-muted-foreground">
                        {formatCurrency(inc.amount)}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleConfirmIncome(inc.id)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all ${
                            inc.confirmed
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {inc.confirmed ? (
                            <>
                              <Check className="h-3 w-3" />
                              Confirmado
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              Pendiente
                            </>
                          )}
                        </button>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditIncome(inc)}
                            className="p-1.5 text-muted-foreground/80 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all cursor-pointer"
                            title="Editar ingreso"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteIncome(inc.id)}
                            className="p-1.5 text-muted-foreground/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                            title="Eliminar ingreso"
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

        {/* MOBILE Incomes List Cards */}
        <div className="block md:hidden space-y-2">
          {incomes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground/80 italic border border-border/40 rounded-xl bg-card/40">
              No hay ingresos registrados en este periodo.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
              {incomes.map((inc) => {
                const topic = topics.find((t) => t.id === inc.topicId);
                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedIncomeDetail(inc)}
                    className="w-full text-left p-4 hover:bg-muted/30 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                        {topic ? (
                          renderIcon(topic.icon, 'h-5 w-5')
                        ) : (
                          <DollarSign className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground truncate">
                          {inc.description}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="truncate">
                            {topic?.name || 'Sin Tópico'}
                          </span>
                          <span>•</span>
                          <span className="font-mono">{inc.date}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="font-mono font-bold text-foreground">
                            {formatCurrency(inc.amount)}
                          </div>
                          <span
                            className={`h-2 w-2 rounded-full ${inc.confirmed ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          />
                        </div>
                        {renderReconciliationBadge(
                          inc.reconciliationStatus,
                          inc.verificationSource
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. ATM Withdrawals Sub-section */}
      <div className="bg-card rounded-2xl p-6 border border-border/40 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-light text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-cyan-400" />
              Retiros de Cajero Automático (ATM)
            </h2>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Al retirar efectivo de un cajero automático, el dinero se
              descuenta de tus cuentas digitales y se agrega a tu caja de{' '}
              <strong>Efectivo en Mano</strong>.
            </p>
          </div>
          <button
            onClick={handleOpenAddWth}
            className="w-full sm:w-auto px-4 py-2 text-sm font-bold text-background bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Registrar Retiro
          </button>
        </div>

        {/* Stats Summary for Withdrawals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-muted/50 p-4 rounded-xl border border-border/40">
            <span className="block text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold">
              Total Retirado del Cajero
            </span>
            <span className="text-2xl font-semibold text-cyan-400 mt-1 block font-mono">
              {formatCurrency(totalWithdrawals)}
            </span>
          </div>
          <div className="bg-muted/50 p-4 rounded-xl border border-border/40">
            <span className="block text-[10px] text-emerald-400 uppercase tracking-widest font-bold">
              Caja de Efectivo en Mano actual
            </span>
            <span className="text-2xl font-semibold text-emerald-400 mt-1 block font-mono">
              {formatCurrency(cashPool)}
            </span>
          </div>
        </div>

        {/* DESKTOP Withdrawals Table */}
        <div className="hidden md:block overflow-x-auto border border-border/40 rounded-xl bg-muted/20">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground/80 text-[10px] font-bold uppercase tracking-widest">
                <th className="p-4">Detalle / Cajero</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Monto Transferido</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border rounded-2xl border border-border bg-card">
              {withdrawals.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center text-muted-foreground/80 italic"
                  >
                    No hay retiros de efectivo registrados en este periodo.
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-muted/50 transition-all">
                    <td className="p-4 font-semibold text-muted-foreground/80 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/80" />
                      {w.description}
                    </td>
                    <td className="p-4 text-muted-foreground/80 font-mono">
                      {w.date}
                    </td>
                    <td className="p-4 font-mono font-bold text-cyan-400">
                      {formatCurrency(w.amount)}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditWth(w)}
                          className="p-1.5 text-muted-foreground/80 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all cursor-pointer"
                          title="Editar retiro"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteWithdrawal(w.id)}
                          className="p-1.5 text-muted-foreground/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                          title="Eliminar retiro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE Withdrawals List Cards */}
        <div className="block md:hidden space-y-2">
          {withdrawals.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground/80 italic border border-border/40 rounded-xl bg-muted/20">
              No hay retiros de efectivo registrados en este periodo.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
              {withdrawals.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWthDetail(w)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {w.description}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {w.date}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-cyan-400">
                        {formatCurrency(w.amount)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MOBILE Income Detail Modal */}
      {selectedIncomeDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50 md:hidden animate-in fade-in">
          <div className="bg-card rounded-3xl sm:rounded-2xl w-full max-w-md border border-border/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
                    {topics.find(
                      (t) => t.id === selectedIncomeDetail.topicId
                    ) ? (
                      renderIcon(
                        topics.find(
                          (t) => t.id === selectedIncomeDetail.topicId
                        )!.icon,
                        'h-6 w-6'
                      )
                    ) : (
                      <DollarSign className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight">
                      {selectedIncomeDetail.description}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {topics.find((t) => t.id === selectedIncomeDetail.topicId)
                        ?.name || 'Sin Tópico'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedIncomeDetail(null)}
                  className="p-2 text-muted-foreground/80 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Monto</span>
                  <span className="font-mono font-bold text-lg text-foreground">
                    {formatCurrency(selectedIncomeDetail.amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <span className="font-mono text-sm text-foreground">
                    {selectedIncomeDetail.date}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">
                    Origen / Vía
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedIncomeDetail.method === 'EFECTIVO'
                      ? 'Efectivo'
                      : 'Digital'}
                  </span>
                </div>

                {(selectedIncomeDetail.reconciliationStatus ||
                  selectedIncomeDetail.verificationSource) && (
                  <div className="flex justify-between items-center py-3 border-b border-border/40">
                    <span className="text-sm text-muted-foreground">
                      Estado
                    </span>
                    {renderReconciliationBadge(
                      selectedIncomeDetail.reconciliationStatus,
                      selectedIncomeDetail.verificationSource
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => {
                    handleToggleConfirmIncome(selectedIncomeDetail.id);
                    setSelectedIncomeDetail({
                      ...selectedIncomeDetail,
                      confirmed: !selectedIncomeDetail.confirmed,
                    });
                  }}
                  className={`col-span-2 p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-colors ${
                    selectedIncomeDetail.confirmed
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  {selectedIncomeDetail.confirmed ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                  {selectedIncomeDetail.confirmed
                    ? 'Confirmado'
                    : 'Marcar como Confirmado'}
                </button>
                <button
                  onClick={() => {
                    setSelectedIncomeDetail(null);
                    handleOpenEditIncome(selectedIncomeDetail);
                  }}
                  className="p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setSelectedIncomeDetail(null);
                    handleDeleteIncome(selectedIncomeDetail.id);
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

      {/* MOBILE Withdrawal Detail Modal */}
      {selectedWthDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50 md:hidden animate-in fade-in">
          <div className="bg-card rounded-3xl sm:rounded-2xl w-full max-w-md border border-border/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight">
                      {selectedWthDetail.description}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWthDetail(null)}
                  className="p-2 text-muted-foreground/80 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Monto</span>
                  <span className="font-mono font-bold text-lg text-foreground">
                    {formatCurrency(selectedWthDetail.amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <span className="font-mono text-sm text-foreground">
                    {selectedWthDetail.date}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => {
                    setSelectedWthDetail(null);
                    handleOpenEditWth(selectedWthDetail);
                  }}
                  className="p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setSelectedWthDetail(null);
                    handleDeleteWithdrawal(selectedWthDetail.id);
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

      {/* Income Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-muted/30">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-emerald-400" />
                {editingIncome ? 'Editar Ingreso' : 'Registrar Ingreso'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted-foreground/80 hover:text-muted-foreground rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIncomeSubmit} className="p-6 space-y-4">
              {incomeError && (
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg text-xs border border-rose-500/20 flex gap-2">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{incomeError}</span>
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
                  placeholder="ej. Pago de nómina Quincena 1..."
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
                    Vía / Formato
                  </label>
                  <select
                    value={method}
                    onChange={(e) =>
                      setMethod(e.target.value as 'DIGITAL' | 'EFECTIVO')
                    }
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                  >
                    <option value="DIGITAL">Transferencia Digital</option>
                    <option value="EFECTIVO">Efectivo Físico</option>
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
                    {incomeTopics.map((t) => (
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

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="confirm_on_add"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded bg-white/5 border-white/10 text-emerald-500 focus:ring-0 focus:ring-offset-0"
                />
                <label
                  htmlFor="confirm_on_add"
                  className="text-xs text-muted-foreground/80 font-medium cursor-pointer select-none"
                >
                  Marcar como ingreso confirmado (Ya recibido)
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
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors"
                >
                  {editingIncome ? 'Guardar Cambios' : 'Registrar Ingreso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATM Withdrawal Modal */}
      {isWthOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-card">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-cyan-400" />
                {editingWithdrawal
                  ? 'Editar Retiro'
                  : 'Registrar Retiro del Cajero'}
              </h3>
              <button
                onClick={() => setIsWthOpen(false)}
                className="p-1 text-muted-foreground/80 hover:text-muted-foreground rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleWthSubmit} className="p-6 space-y-4">
              {wthError && (
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg text-xs border border-rose-500/20 flex gap-2">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{wthError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Detalle / Cajero
                </label>
                <input
                  type="text"
                  value={wthDescription}
                  onChange={(e) => setWthDescription(e.target.value)}
                  placeholder="ej. Cajero Bancolombia Éxito..."
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Monto a Retirar ($)
                  </label>
                  <input
                    type="text"
                    value={wthAmount}
                    onChange={(e) => setWthAmount(e.target.value)}
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
                    value={wthDate}
                    onChange={(e) => setWthDate(e.target.value)}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-cyan-500/5 text-cyan-400 border border-cyan-500/10 rounded-lg text-xs leading-relaxed">
                Este movimiento resta del fondo digital (cuentas bancarias) y
                suma al efectivo disponible en mano.
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWthOpen(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-muted-foreground/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors"
                >
                  {editingWithdrawal ? 'Guardar Cambios' : 'Confirmar Retiro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
