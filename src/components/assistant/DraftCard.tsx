import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import type { PendingTransaction, ThreadMessage } from '../../types';
import { DraftSummary, formatDraftAmount } from './ChatMessage';

/** If the draft is still there this long after a tap, the buttons come back with a hint. */
export const ACTION_TIMEOUT_MS = 8000;

const PAYMENT_LABELS: Record<string, string> = {
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  EFECTIVO: 'Efectivo',
  DIGITAL: 'Digital',
};

interface Props {
  message: ThreadMessage;
  /** The live pending draft, or undefined when it no longer exists. */
  pending: PendingTransaction | undefined;
  /** False until the first load of pending drafts arrived, so a card never flashes "resolved". */
  ready: boolean;
  onApprove: (tx: PendingTransaction) => void;
  onEdit: (tx: PendingTransaction) => void;
  onDiscard: (id: string) => void;
}

type Choice = 'saving' | 'discarding' | null;

/**
 * A draft the assistant understood. It acts on the live pending draft through the same
 * handlers the pending-drafts banner uses; the message snapshot is only for display.
 * Nothing is saved until the user taps "Guardar".
 */
export function DraftCard({
  message,
  pending,
  ready,
  onApprove,
  onEdit,
  onDiscard,
}: Props) {
  const [choice, setChoice] = useState<Choice>(null);
  const [slow, setSlow] = useState(false);
  const stillThere = useRef(false);
  useEffect(() => {
    stillThere.current = !!pending;
  }, [pending]);

  // After a tap, wait for the draft to disappear; if it does not, give the buttons back.
  useEffect(() => {
    if (!choice) return;
    const id = setTimeout(() => {
      if (stillThere.current) {
        setChoice(null);
        setSlow(true);
      }
    }, ACTION_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [choice]);

  if (!ready) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Revisando…
      </p>
    );
  }

  if (!pending) {
    if (choice === 'saving') {
      return (
        <p
          role="status"
          className="flex items-center gap-2 text-base font-semibold text-primary"
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          Guardado
        </p>
      );
    }
    if (choice === 'discarding') {
      return (
        <p
          role="status"
          className="text-base font-semibold text-muted-foreground"
        >
          Descartado
        </p>
      );
    }
    return (
      <div className="space-y-1">
        <DraftSummary message={message} />
        <p className="text-sm text-muted-foreground">
          Este movimiento ya se guardó o se descartó.
        </p>
      </div>
    );
  }

  const busy = choice !== null;
  const method = pending.paymentMethod
    ? (PAYMENT_LABELS[pending.paymentMethod] ?? pending.paymentMethod)
    : '';
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-muted-foreground">
          Entendí esto
        </p>
        <p className="text-xl font-bold">
          {pending.type === 'INCOME' ? 'Ingreso' : 'Gasto'} ·{' '}
          {formatDraftAmount(pending.amount, pending.currency)}
        </p>
        <p className="break-words">{pending.description}</p>
        <p className="text-sm text-muted-foreground">
          {[pending.category, method, pending.date].filter(Boolean).join(' · ')}
        </p>
      </div>
      {slow && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          No pude confirmar que se guardó. Revisa tu conexión e intenta de
          nuevo.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSlow(false);
            setChoice('saving');
            onApprove(pending);
          }}
          className="min-h-[52px] flex-1 rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {choice === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(pending)}
          className="min-h-[52px] rounded-full border border-border bg-card px-5 text-base font-semibold text-foreground disabled:opacity-50"
        >
          Cambiar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSlow(false);
            setChoice('discarding');
            onDiscard(pending.id);
          }}
          className="flex min-h-[48px] items-center gap-1.5 rounded-full px-4 text-base font-semibold text-muted-foreground disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Descartar
        </button>
      </div>
    </div>
  );
}
