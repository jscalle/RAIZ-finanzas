import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';
import { PendingTransaction, Topic } from '../types';
import { normalizeDateToISO } from '../App';

interface EditPendingTransactionModalProps {
  pendingTx: PendingTransaction | null;
  topics: Topic[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    pendingTx: PendingTransaction,
    editedData: {
      description: string;
      amount: number;
      topicId: string;
      date: string;
      type: 'EXPENSE' | 'INCOME';
      method: string;
    }
  ) => void;
}

export default function EditPendingTransactionModal({
  pendingTx,
  topics,
  isOpen,
  onClose,
  onSave,
}: EditPendingTransactionModalProps) {
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [topicId, setTopicId] = useState('');
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('DIGITAL');
  const [error, setError] = useState('');

  // Re-initialize the form whenever isOpen, pendingTx or topics change, using
  // the "adjust state when a prop changes" pattern instead of an effect.
  const [syncedFrom, setSyncedFrom] = useState<{
    isOpen: boolean;
    pendingTx: PendingTransaction | null;
    topics: Topic[];
  } | null>(null);
  if (
    syncedFrom === null ||
    syncedFrom.isOpen !== isOpen ||
    syncedFrom.pendingTx !== pendingTx ||
    syncedFrom.topics !== topics
  ) {
    setSyncedFrom({ isOpen, pendingTx, topics });
    if (isOpen && pendingTx) {
      setType(pendingTx.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
      setDescription(pendingTx.description || '');
      setAmount(pendingTx.amount.toString() || '');

      const isIncome = pendingTx.type === 'INCOME';
      const filteredTopics = topics.filter(
        (t) => t.type === (isIncome ? 'INCOME' : 'EXPENSE') || t.type === 'BOTH'
      );

      const matchedTopic = topics.find(
        (t) => t.name.toLowerCase() === pendingTx.category?.toLowerCase()
      );

      const defaultTopic = matchedTopic
        ? matchedTopic.id
        : filteredTopics.length > 0
          ? filteredTopics[0].id
          : '';

      setTopicId(defaultTopic);
      setDate(normalizeDateToISO(pendingTx.date || ''));
      setMethod('DIGITAL');
      setError('');
    }
  }

  if (!isOpen || !pendingTx) return null;

  const handleSave = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Por favor ingresa un monto válido mayor a 0');
      return;
    }
    if (!description.trim()) {
      setError('Por favor ingresa una descripción');
      return;
    }
    if (!topicId) {
      setError('Por favor selecciona una categoría');
      return;
    }
    if (!date) {
      setError('Por favor selecciona una fecha');
      return;
    }

    onSave(pendingTx, {
      description: description.trim(),
      amount: numAmount,
      topicId,
      date,
      type,
      method,
    });
  };

  const filteredTopics = topics.filter(
    (t) => t.type === type || t.type === 'BOTH'
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
        >
          <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Revisar Transacción SMS
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm border border-red-100 dark:border-red-800">
                {error}
              </div>
            )}

            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setType('EXPENSE');
                  const t = topics.filter(
                    (x) => x.type === 'EXPENSE' || x.type === 'BOTH'
                  );
                  if (!t.find((x) => x.id === topicId))
                    setTopicId(t.length > 0 ? t[0].id : '');
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  type === 'EXPENSE'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('INCOME');
                  const t = topics.filter(
                    (x) => x.type === 'INCOME' || x.type === 'BOTH'
                  );
                  if (!t.find((x) => x.id === topicId))
                    setTopicId(t.length > 0 ? t[0].id : '');
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  type === 'INCOME'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Ingreso
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descripción
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Supermercado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Monto
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Categoría
              </label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                {filteredTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
                {filteredTopics.length === 0 && (
                  <option value="" disabled>
                    No hay categorías
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Método de Pago
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="DIGITAL">Digital</option>
                <option value="DEBITO">Débito</option>
                <option value="CREDITO">Crédito</option>
                <option value="EFECTIVO">Efectivo</option>
              </select>
            </div>
          </div>

          <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 font-medium transition-colors w-full sm:w-auto"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors flex items-center justify-center gap-2 flex-1 shadow-sm shadow-blue-500/20"
            >
              <Check className="w-5 h-5" />
              Guardar e Ingresar ⚡
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
