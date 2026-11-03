import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  Check,
  Edit2,
  Lock,
  Pencil,
  PiggyBank,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { SavingGoal, SavingContribution, Topic } from '../types';
import { renderIcon } from './renderIcon';
import { parseFormattedNumber } from '../lib/mathEngine';
import { InfoTip } from './InfoTip';

interface SavingsSectionProps {
  goals: SavingGoal[];
  contributions: SavingContribution[];
  topics: Topic[];
  startingSavings: number;
  onUpdateStartingSavings: (amount: number) => void;
  onAddGoal: (
    name: string,
    targetAmount: number,
    deadline: string,
    topicId: string
  ) => void;
  onEditGoal: (
    id: string,
    name: string,
    targetAmount: number,
    deadline: string,
    topicId: string
  ) => void;
  onDeleteGoal: (id: string) => void;
  onAddContribution: (
    goalId: string,
    amount: number,
    description: string,
    date: string,
    deductFromIncomes: boolean
  ) => void;
  onEditContribution: (
    id: string,
    goalId: string,
    amount: number,
    description: string,
    date: string
  ) => void;
  onDeleteContribution: (id: string) => void;
  currentAvailableIncomes: number;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;
}

export default function SavingsSection({
  goals,
  contributions,
  topics,
  startingSavings,
  onUpdateStartingSavings,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onAddContribution,
  onEditContribution,
  onDeleteContribution,
  currentAvailableIncomes,
  formatCurrency,
}: SavingsSectionProps) {
  // Goal Modal states
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [goalTopicId, setGoalTopicId] = useState('');
  const [goalError, setGoalError] = useState('');

  // Contribution Modal states
  const [isContributionModalOpen, setIsContributionModalOpen] = useState(false);
  const [editingContribution, setEditingContribution] =
    useState<SavingContribution | null>(null);
  const [selectedContributionDetail, setSelectedContributionDetail] =
    useState<SavingContribution | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDesc, setContributionDesc] = useState('');
  const [contributionDate, setContributionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [deductFromIncomes, setDeductFromIncomes] = useState(true);
  const [contributionError, setContributionError] = useState('');

  // Edit Starting Savings state
  const [isEditingStarting, setIsEditingStarting] = useState(false);
  const [tempStarting, setTempStarting] = useState(startingSavings.toString());

  const savingsTopics = topics.filter(
    (t) => t.type === 'SAVINGS' || t.type === 'BOTH'
  );

  // Calculations

  const totalContributions = contributions.reduce(
    (sum, c) => sum + c.amount,
    0
  );
  const totalSavingsPool = startingSavings + totalContributions;

  // Goal Submit
  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) {
      setGoalError('El nombre es requerido.');
      return;
    }
    const target = parseFormattedNumber(targetAmount);
    if (isNaN(target) || target <= 0) {
      setGoalError('El monto meta debe ser mayor a cero.');
      return;
    }
    if (!goalTopicId) {
      setGoalError('Debes seleccionar un tópico.');
      return;
    }

    if (editingGoal) {
      onEditGoal(
        editingGoal.id,
        goalName.trim(),
        target,
        deadline ||
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        goalTopicId
      );
    } else {
      onAddGoal(
        goalName.trim(),
        target,
        deadline ||
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        goalTopicId
      );
    }

    setIsGoalModalOpen(false);
    setEditingGoal(null);
    setGoalName('');
    setTargetAmount('');
    setGoalError('');
  };

  const handleOpenAddGoal = () => {
    if (savingsTopics.length === 0) {
      alert(
        "Primero crea un tópico de tipo 'Ahorro' o 'Ambos' en la pestaña Configuración."
      );
      return;
    }
    setEditingGoal(null);
    setGoalName('');
    setTargetAmount('');
    setDeadline('');
    setGoalTopicId(savingsTopics[0].id);
    setGoalError('');
    setIsGoalModalOpen(true);
  };

  const handleOpenEditGoal = (goal: SavingGoal) => {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setTargetAmount(goal.targetAmount.toString());
    setDeadline(goal.deadline || '');
    setGoalTopicId(goal.topicId);
    setGoalError('');
    setIsGoalModalOpen(true);
  };

  // Contribution Submit
  const handleContributionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoalId) {
      setContributionError('Selecciona una meta.');
      return;
    }
    const amountVal = parseFormattedNumber(contributionAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setContributionError('Monto de depósito inválido.');
      return;
    }

    if (editingContribution) {
      onEditContribution(
        editingContribution.id,
        selectedGoalId,
        amountVal,
        contributionDesc.trim() || 'Aporte a meta de ahorro',
        contributionDate
      );
    } else {
      if (deductFromIncomes && amountVal > currentAvailableIncomes) {
        setContributionError(
          `Saldo insuficiente en Ingresos (${currentAvailableIncomes.toFixed(2)}) para realizar este descuento.`
        );
        return;
      }
      onAddContribution(
        selectedGoalId,
        amountVal,
        contributionDesc.trim() || 'Aporte a meta de ahorro',
        contributionDate,
        deductFromIncomes
      );
    }

    setIsContributionModalOpen(false);
    setEditingContribution(null);
    setContributionAmount('');
    setContributionDesc('');
    setContributionError('');
  };

  const handleOpenAddContribution = () => {
    if (goals.length === 0) {
      alert('Primero crea al menos una meta de ahorro.');
      return;
    }
    setEditingContribution(null);
    setSelectedGoalId(goals[0].id);
    setContributionAmount('');
    setContributionDesc('');
    setContributionDate(new Date().toISOString().split('T')[0]);
    setDeductFromIncomes(true);
    setContributionError('');
    setIsContributionModalOpen(true);
  };

  const handleOpenEditContribution = (contrib: SavingContribution) => {
    setEditingContribution(contrib);
    setSelectedGoalId(contrib.goalId);
    setContributionAmount(contrib.amount.toString());
    setContributionDesc(contrib.description);
    setContributionDate(contrib.date);
    setDeductFromIncomes(false); // Not applicable for edits
    setContributionError('');
    setIsContributionModalOpen(true);
  };

  const handleSaveStarting = () => {
    const val = parseFormattedNumber(tempStarting);
    if (!isNaN(val) && val >= 0) {
      onUpdateStartingSavings(val);
      setIsEditingStarting(false);
    }
  };

  return (
    <div
      className="bg-card rounded-2xl p-6 border border-border/40 space-y-6"
      id="savings_panel"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-light text-foreground flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-pink-400" />
            Plan de Ahorros y Metas
            <InfoTip
              label="Más información sobre el plan de ahorros y metas"
              title="Plan de Ahorros y Metas"
            >
              Constituye un colchón financiero y define metas claras. Reasigna
              ingresos corrientes hacia tus fondos de ahorro.
            </InfoTip>
          </h2>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleOpenAddGoal}
            className="flex-1 sm:flex-initial px-4 py-2 text-sm font-bold text-muted-foreground bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
            id="btn_add_goal"
          >
            <Plus className="h-4 w-4" />
            Nueva Meta
          </button>
          <button
            onClick={handleOpenAddContribution}
            className="flex-1 sm:flex-initial px-4 py-2 text-sm font-bold text-[#070809] bg-pink-400 hover:bg-pink-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            id="btn_open_deposit"
          >
            <ArrowDownCircle className="h-4 w-4" />
            Depositar Ahorro
          </button>
        </div>
      </div>

      {/* Stats Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border/40 flex justify-between items-center">
          <div>
            <span className="block text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold">
              Colchón Inicial
            </span>
            {isEditingStarting ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="text"
                  value={tempStarting}
                  onChange={(e) => setTempStarting(e.target.value)}
                  className="w-24 px-2 py-1 bg-white/5 border border-white/15 rounded text-foreground font-mono text-sm focus:outline-none focus:border-pink-500"
                />
                <button
                  onClick={handleSaveStarting}
                  className="p-1 bg-pink-500/10 text-pink-400 rounded hover:bg-pink-500/20"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-semibold text-muted-foreground font-mono">
                  {formatCurrency(startingSavings)}
                </span>
                <button
                  onClick={() => {
                    setTempStarting(startingSavings.toString());
                    setIsEditingStarting(true);
                  }}
                  className="p-1 text-muted-foreground/80 hover:text-pink-400 transition-colors"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          <Lock className="h-8 w-8 text-muted" />
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/40 flex justify-between items-center">
          <div>
            <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider block font-mono">
              Fondo General de Ahorro
            </span>
            <span className="text-xl font-bold text-savings font-mono mt-0.5 block">
              {formatCurrency(
                totalSavingsPool -
                  goals.reduce((acc, g) => acc + (g.currentAmount || 0), 0)
              )}
            </span>
          </div>
          <PiggyBank className="h-8 w-8 text-savings/40" />
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/40 flex justify-between items-center">
          <div>
            <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider block font-mono">
              Comprometido en Metas
            </span>
            <span className="text-xl font-bold text-cyan-400 font-mono mt-0.5 block">
              {formatCurrency(
                goals.reduce((acc, g) => acc + (g.currentAmount || 0), 0)
              )}
            </span>
          </div>
          <Target className="h-8 w-8 text-cyan-500/40" />
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/40 flex justify-between items-center">
          <div>
            <span className="block text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold">
              Fondo Total
            </span>
            <span className="text-xl font-bold text-foreground mt-1 block font-mono">
              {formatCurrency(totalSavingsPool)}
            </span>
          </div>
          <ShieldCheck className="h-8 w-8 text-primary/20" />
        </div>
      </div>

      {/* Saving Goals Grid */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground/80 uppercase tracking-widest mb-4">
          Metas de Ahorro Activas
        </h3>
        {goals.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            No tienes metas de ahorro registradas. Crea una para comenzar a
            asignar tu capital guardado.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((goal) => {
              const pct = Math.min(
                100,
                (goal.currentAmount / goal.targetAmount) * 100
              );
              const topic = topics.find((t) => t.id === goal.topicId);

              const now = new Date();
              const deadlineDate = new Date(goal.deadline);
              const diffTime = deadlineDate.getTime() - now.getTime();
              const monthsRemaining = Math.max(
                0,
                Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44))
              );

              const remainingAmount = Math.max(
                0,
                goal.targetAmount - goal.currentAmount
              );
              const needMonthly =
                monthsRemaining > 0
                  ? remainingAmount / monthsRemaining
                  : remainingAmount;

              const goalContributions = contributions.filter(
                (c) => c.goalId === goal.id
              );
              let firstDate = new Date();
              if (goalContributions.length > 0) {
                firstDate = new Date(
                  Math.min(
                    ...goalContributions.map((c) => new Date(c.date).getTime())
                  )
                );
              }
              const elapsedMonths = Math.max(
                1,
                Math.ceil(
                  (now.getTime() - firstDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 30.44)
                )
              );
              const currentAverageContribution =
                goal.currentAmount / elapsedMonths;

              const isOnTrack =
                currentAverageContribution >= needMonthly &&
                goal.currentAmount > 0;
              const isCompleted = goal.currentAmount >= goal.targetAmount;

              return (
                <div
                  key={goal.id}
                  className="rounded-2xl border border-border bg-card p-6"
                  id={`goal_card_${goal.id}`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-muted text-foreground rounded-lg">
                          {topic ? (
                            renderIcon(topic.icon, 'h-4.5 w-4.5')
                          ) : (
                            <Target className="h-4.5 w-4.5" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground text-sm leading-tight">
                            {goal.name}
                          </h4>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            Tópico: {topic?.name || 'Sin Tópico'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-col items-end">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleOpenEditGoal(goal)}
                            className="p-1 text-muted-foreground hover:text-primary rounded transition-all cursor-pointer"
                            title="Editar meta"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteGoal(goal.id)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded transition-all cursor-pointer"
                            title="Eliminar meta"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isCompleted ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold mt-1">
                            Completado
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${isOnTrack ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}
                          >
                            {isOnTrack ? 'En camino' : 'Ajustar ritmo'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs py-3 border-t border-b border-border my-3">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">
                          Ahorrado
                        </span>
                        <span className="font-bold text-foreground font-mono text-sm">
                          {formatCurrency(goal.currentAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] text-right">
                          Meta Objetivo
                        </span>
                        <span className="font-bold text-primary font-mono text-sm block text-right">
                          {formatCurrency(goal.targetAmount)}
                        </span>
                      </div>
                    </div>

                    {!isCompleted && (
                      <div className="grid grid-cols-2 gap-4 text-xs mb-4">
                        <div className="bg-muted/50 p-2 rounded-lg">
                          <span className="text-muted-foreground block text-[9px] uppercase">
                            Aporte Promedio
                          </span>
                          <span className="font-mono font-semibold">
                            {formatCurrency(currentAverageContribution)}/mes
                          </span>
                        </div>
                        <div className="bg-muted/50 p-2 rounded-lg text-right">
                          <span className="text-muted-foreground block text-[9px] uppercase">
                            Sugerido Límite
                          </span>
                          <span className="font-mono font-semibold">
                            {formatCurrency(needMonthly)}/mes
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                      <span>Progreso</span>
                      <span className="text-primary font-bold">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {goal.deadline && (
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          Límite: {goal.deadline}
                        </span>
                        {!isCompleted && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {monthsRemaining}{' '}
                            {monthsRemaining === 1
                              ? 'mes restante'
                              : 'meses restantes'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contributions Logs */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground/80 uppercase tracking-widest mb-3">
          Historial de Depósitos
        </h3>
        <div className="border border-border/40 rounded-xl bg-card/40 overflow-hidden">
          {contributions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground/80 italic text-xs">
              Aún no hay movimientos de aporte a metas registrados.
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground/80 text-[10px] font-bold uppercase tracking-widest">
                      <th className="p-4">Meta Destino</th>
                      <th className="p-4">Detalle / Nota</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4 text-right">Aporte</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {contributions.map((c) => {
                      const goal = goals.find((g) => g.id === c.goalId);
                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-muted/30 transition-all"
                        >
                          <td className="p-4 font-semibold text-muted-foreground/80">
                            {goal ? goal.name : 'Ahorro Libre / General'}
                          </td>
                          <td className="p-4 text-muted-foreground/80">
                            {c.description}
                          </td>
                          <td className="p-4 text-muted-foreground/80 font-mono text-[11px]">
                            {c.date}
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-primary">
                            +{formatCurrency(c.amount)}
                          </td>
                          <td className="p-4 text-right space-x-1">
                            <button
                              onClick={() => handleOpenEditContribution(c)}
                              className="p-1 text-muted-foreground/80 hover:text-cyan-400 rounded hover:bg-cyan-500/10 transition-all cursor-pointer"
                              title="Editar aporte"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteContribution(c.id)}
                              className="p-1 text-muted-foreground/80 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-all cursor-pointer"
                              title="Eliminar aporte"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE LIST CARDS */}
              <div className="block md:hidden space-y-2">
                <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
                  {contributions.map((c) => {
                    const goal = goals.find((g) => g.id === c.goalId);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedContributionDetail(c)}
                        className="w-full text-left p-4 hover:bg-muted/30 transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <ArrowDownCircle className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-foreground truncate">
                              {goal ? goal.name : 'Ahorro Libre / General'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {c.description}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {c.date}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-primary">
                              +{formatCurrency(c.amount)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MOBILE Contribution Detail Modal */}
      {selectedContributionDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50 md:hidden animate-in fade-in">
          <div className="bg-card rounded-3xl sm:rounded-2xl w-full max-w-md border border-border/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                    <ArrowDownCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight">
                      {goals.find(
                        (g) => g.id === selectedContributionDetail.goalId
                      )?.name || 'Ahorro Libre'}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {selectedContributionDetail.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedContributionDetail(null)}
                  className="p-2 text-muted-foreground/80 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Aporte</span>
                  <span className="font-mono font-bold text-lg text-primary">
                    +{formatCurrency(selectedContributionDetail.amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/40">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <span className="font-mono text-sm text-foreground">
                    {selectedContributionDetail.date}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => {
                    setSelectedContributionDetail(null);
                    handleOpenEditContribution(selectedContributionDetail);
                  }}
                  className="p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setSelectedContributionDetail(null);
                    onDeleteContribution(selectedContributionDetail.id);
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

      {/* Goal Modal */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-card">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {editingGoal ? 'Editar Meta de Ahorro' : 'Nueva Meta de Ahorro'}
              </h3>
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="p-1 text-muted-foreground/80 hover:text-muted-foreground rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleGoalSubmit} className="p-6 space-y-4">
              {goalError && (
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg text-xs border border-rose-500/20 flex gap-2">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{goalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Nombre de la Meta
                </label>
                <input
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="ej. Fondo de Emergencia, Vacaciones Japón..."
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Monto Objetivo ($)
                  </label>
                  <input
                    type="text"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Fecha Límite
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Tópico / Categoría
                </label>
                <select
                  value={goalTopicId}
                  onChange={(e) => setGoalTopicId(e.target.value)}
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                >
                  {savingsTopics.map((t) => (
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

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-muted-foreground/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-pink-400 hover:bg-pink-300 rounded-lg transition-colors"
                >
                  {editingGoal ? 'Guardar Cambios' : 'Crear Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit/Contribution Modal */}
      {isContributionModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-sm w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-card">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5 text-pink-400" />
                {editingContribution
                  ? 'Editar Depósito'
                  : 'Registrar Aporte / Depósito'}
              </h3>
              <button
                onClick={() => setIsContributionModalOpen(false)}
                className="p-1 text-muted-foreground/80 hover:text-muted-foreground rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleContributionSubmit} className="p-6 space-y-4">
              {contributionError && (
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg text-xs border border-rose-500/20 flex gap-2">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{contributionError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Seleccionar Meta Destino
                </label>
                <select
                  value={selectedGoalId}
                  onChange={(e) => setSelectedGoalId(e.target.value)}
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                >
                  {goals.map((g) => (
                    <option
                      key={g.id}
                      value={g.id}
                      className="bg-card text-muted-foreground"
                    >
                      {g.name} (Meta: ${g.targetAmount}, Falta: $
                      {g.targetAmount - g.currentAmount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Monto del Aporte ($)
                  </label>
                  <input
                    type="text"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Fecha de Depósito
                  </label>
                  <input
                    type="date"
                    value={contributionDate}
                    onChange={(e) => setContributionDate(e.target.value)}
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Descripción corta
                </label>
                <input
                  type="text"
                  value={contributionDesc}
                  onChange={(e) => setContributionDesc(e.target.value)}
                  placeholder="ej. Depósito mensual programado..."
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                />
              </div>

              {!editingContribution && (
                <div className="flex items-center gap-2 py-1 bg-white/[0.02] border border-border/40 rounded-lg p-2.5">
                  <input
                    type="checkbox"
                    id="deduct_from_incomes"
                    checked={deductFromIncomes}
                    onChange={(e) => setDeductFromIncomes(e.target.checked)}
                    className="h-4 w-4 rounded bg-white/5 border-white/10 text-pink-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <label
                    htmlFor="deduct_from_incomes"
                    className="text-[11px] text-muted-foreground/80 font-medium cursor-pointer select-none leading-snug"
                  >
                    Descontar este monto de mis Ingresos Corrientes de este mes
                    (${currentAvailableIncomes.toFixed(0)} disponible).
                  </label>
                </div>
              )}

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsContributionModalOpen(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-muted-foreground/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-pink-400 hover:bg-pink-300 rounded-lg transition-colors"
                >
                  {editingContribution ? 'Guardar Cambios' : 'Confirmar Aporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
