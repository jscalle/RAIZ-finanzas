import React, { useState } from 'react';
import {
  AlertCircle,
  Pencil,
  Plus,
  Settings2,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Topic } from '../types';
import { renderIcon } from './renderIcon';
import { AVAILABLE_ICONS } from './iconRegistry';

interface TopicsConfigProps {
  topics: Topic[];
  onAddTopic: (
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => void;
  onEditTopic: (
    id: string,
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => void;
  onDeleteTopic: (id: string) => void;
}

const AVAILABLE_COLORS = [
  {
    name: 'Emerald',
    value: 'emerald',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    name: 'Cyan',
    value: 'cyan',
    text: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
  {
    name: 'Amber',
    value: 'amber',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  {
    name: 'Orange',
    value: 'orange',
    text: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  {
    name: 'Blue',
    value: 'blue',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    name: 'Purple',
    value: 'purple',
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  {
    name: 'Pink',
    value: 'pink',
    text: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
  },
  {
    name: 'Slate',
    value: 'slate',
    text: 'text-muted-foreground/80',
    bg: 'bg-white/5',
    border: 'border-white/10',
  },
];

export default function TopicsConfig({
  topics,
  onAddTopic,
  onEditTopic,
  onDeleteTopic,
}: TopicsConfigProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH'>(
    'EXPENSE'
  );
  const [selectedIcon, setSelectedIcon] = useState('ShoppingBag');
  const [selectedColor, setSelectedColor] = useState('cyan');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [error, setError] = useState('');

  const handleOpenAdd = () => {
    setEditingTopic(null);
    setName('');
    setType('EXPENSE');
    setSelectedIcon('ShoppingBag');
    setSelectedColor('cyan');
    setMonthlyLimit('');
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (topic: Topic) => {
    setEditingTopic(topic);
    setName(topic.name);
    setType(topic.type);
    setSelectedIcon(topic.icon);
    setSelectedColor(topic.color);
    setMonthlyLimit(topic.monthlyLimit ? topic.monthlyLimit.toString() : '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre es requerido.');
      return;
    }

    const parsedLimit = monthlyLimit
      ? parseInt(monthlyLimit.replace(/\D/g, ''), 10)
      : undefined;
    const finalLimit =
      parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined;

    if (editingTopic) {
      onEditTopic(
        editingTopic.id,
        name.trim(),
        type,
        selectedIcon,
        selectedColor,
        finalLimit
      );
    } else {
      onAddTopic(name.trim(), type, selectedIcon, selectedColor, finalLimit);
    }

    setIsModalOpen(false);
    setEditingTopic(null);
    setName('');
    setMonthlyLimit('');
    setError('');
  };

  const getTopicColorClasses = (colorName: string) => {
    return (
      AVAILABLE_COLORS.find((c) => c.value === colorName) ||
      AVAILABLE_COLORS[AVAILABLE_COLORS.length - 1]
    );
  };

  return (
    <div
      className="bg-card rounded-2xl p-6 border border-border/40 space-y-6"
      id="topics_config_panel"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-light text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-cyan-400" />
            Configuración de Tópicos
          </h2>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Crea y administra las categorías aplicables a tus ingresos, gastos o
            planes de ahorro.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 text-sm font-bold text-[#070809] bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          id="btn_add_topic"
        >
          <Plus className="h-4 w-4" />
          Nuevo Tópico
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {topics.map((topic) => {
          const theme = getTopicColorClasses(topic.color);
          return (
            <div
              key={topic.id}
              className="rounded-2xl border border-border bg-card p-6"
              id={`topic_card_${topic.id}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 p-2.5 rounded-lg ${theme.bg} ${theme.text}`}
                >
                  {renderIcon(topic.icon, 'h-5 w-5')}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-muted-foreground text-sm flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
                    <span className="break-words">{topic.name}</span>
                    {topic.monthlyLimit && (
                      <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded-full inline-block max-w-full truncate">
                        Límite: ${topic.monthlyLimit.toLocaleString('es-CO')}
                        /mes
                      </span>
                    )}
                  </h3>
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                    {topic.type === 'BOTH'
                      ? 'Ambos'
                      : topic.type === 'INCOME'
                        ? 'Ingreso'
                        : topic.type === 'EXPENSE'
                          ? 'Gasto'
                          : 'Ahorro'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(topic)}
                  className="p-1.5 text-muted-foreground/80 hover:text-cyan-400 rounded-lg hover:bg-cyan-500/10 transition-all cursor-pointer"
                  title="Editar tópico"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDeleteTopic(topic.id)}
                  className="p-1.5 text-muted-foreground/80 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
                  title="Eliminar tópico"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full border border-border/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/40 flex justify-between items-center bg-card">
              <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                <Tag className="h-5 w-5 text-cyan-400" />
                {editingTopic ? 'Editar Tópico' : 'Crear Nuevo Tópico'}
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
                  Nombre del Tópico
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. Suscripciones, Compras..."
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Tipo de Transacción
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as Topic['type'])}
                  className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 focus:bg-card text-xs bg-white/[0.03] text-foreground"
                >
                  <option value="EXPENSE">Aplica a Gastos</option>
                  <option value="INCOME">Aplica a Ingresos</option>
                  <option value="SAVINGS">Aplica a Ahorros</option>
                  <option value="BOTH">Aplica a Ambos (Ingresos/Gastos)</option>
                </select>
              </div>

              {(type === 'EXPENSE' || type === 'BOTH') && (
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Límite Mensual (Opcional)
                  </label>
                  <input
                    type="text"
                    value={monthlyLimit}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setMonthlyLimit(
                        val ? parseInt(val, 10).toLocaleString('es-CO') : ''
                      );
                    }}
                    placeholder="ej. 1.200.000"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500 text-xs bg-white/[0.03] text-foreground"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Seleccionar Ícono
                </label>
                <div className="grid grid-cols-6 gap-2 p-2 border border-border/40 rounded-lg bg-white/[0.01] max-h-24 overflow-y-auto">
                  {AVAILABLE_ICONS.map((icoName) => (
                    <button
                      key={icoName}
                      type="button"
                      onClick={() => setSelectedIcon(icoName)}
                      className={`p-2 rounded-lg flex items-center justify-center border transition-all ${
                        selectedIcon === icoName
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                          : 'border-transparent text-muted-foreground/80 hover:bg-white/5'
                      }`}
                    >
                      {renderIcon(icoName, 'h-4 w-4')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                  Seleccionar Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setSelectedColor(col.value)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        selectedColor === col.value
                          ? `${col.bg} ${col.text} ${col.border}`
                          : 'border-transparent bg-white/5 text-muted-foreground/80 hover:bg-white/10'
                      }`}
                    >
                      {col.name}
                    </button>
                  ))}
                </div>
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
                  className="flex-1 px-4 py-2 text-xs font-bold text-[#070809] bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors"
                >
                  {editingTopic ? 'Guardar Cambios' : 'Crear Tópico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
