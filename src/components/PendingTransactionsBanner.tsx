import React, { useState } from 'react';
import {
  Edit2,
  Trash2,
  Zap,
  ArrowLeft,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';
import { PendingTransaction } from '../types';

interface PendingTransactionsBannerProps {
  pendingTransactions: PendingTransaction[];
  onApprove: (tx: PendingTransaction) => void;
  onApproveAll?: (txs: PendingTransaction[]) => void;
  onDiscard: (id: string) => void;
  onEdit: (tx: PendingTransaction) => void;
}

export const PendingTransactionsBanner: React.FC<
  PendingTransactionsBannerProps
> = ({ pendingTransactions, onApprove, onApproveAll, onDiscard, onEdit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp the index when the queue shrinks (adjusting state during render
  // instead of in an effect; the guard ensures it settles after one pass).
  const maxIndex = Math.max(0, pendingTransactions.length - 1);
  if (currentIndex > maxIndex) {
    setCurrentIndex(maxIndex);
  }

  if (pendingTransactions.length === 0) return null;

  const currentTx = pendingTransactions[currentIndex];
  if (!currentTx) return null;

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <span className="font-semibold text-amber-900 text-sm">
              Transacciones SMS Pendientes ({currentIndex + 1} de{' '}
              {pendingTransactions.length} en cola)
            </span>
          </div>
          <span className="text-xs font-medium text-amber-700 bg-amber-200/50 px-2 py-0.5 rounded-full">
            Pendiente
          </span>
        </div>

        <div className="mt-3 text-sm text-amber-800 space-y-1 bg-amber-100/50 p-3 rounded-lg">
          <p className="font-medium text-lg">
            {currentTx.currency || 'COP'} $
            {currentTx.amount.toLocaleString('es-CO')}
          </p>
          <p className="text-amber-900 font-medium">
            En: {currentTx.description}
          </p>
          <div className="flex gap-4 text-amber-700/80 text-xs mt-1">
            <span>Fecha: {currentTx.date}</span>
            <span>Categoría sugerida: {currentTx.category}</span>
          </div>
          {currentTx.explanation && (
            <p className="text-amber-700/80 mt-1 italic">
              &quot;{currentTx.explanation}&quot;
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onApprove(currentTx)}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Aprobar (1-Tap)
          </button>

          <button
            onClick={() => onEdit(currentTx)}
            className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Editar
          </button>

          <button
            onClick={() => onDiscard(currentTx.id)}
            className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Descartar
          </button>

          {pendingTransactions.length > 1 && onApproveAll && (
            <button
              onClick={() => onApproveAll(pendingTransactions)}
              className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors ml-auto"
            >
              <CheckCheck className="w-4 h-4" />
              Aprobar Todas ({pendingTransactions.length})
            </button>
          )}
        </div>

        {pendingTransactions.length > 1 && (
          <div className="mt-4 pt-3 border-t border-amber-200/50 flex justify-between items-center">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-xs text-amber-600">
              {currentIndex + 1} / {pendingTransactions.length}
            </span>
            <button
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(pendingTransactions.length - 1, prev + 1)
                )
              }
              disabled={currentIndex === pendingTransactions.length - 1}
              className="flex items-center gap-1 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
