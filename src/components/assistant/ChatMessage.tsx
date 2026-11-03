import type { ReactNode } from 'react';
import {
  AlertCircle,
  Image as ImageIcon,
  Info,
  Loader2,
  Mic,
  Sprout,
} from 'lucide-react';
import type { ThreadMessage } from '../../types';
import { renderChatText } from './renderChatText';

/** After this long without an answer the message says it is taking longer than usual. */
export const SLOW_ANALYSIS_MS = 90_000;

export function formatDraftAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'COP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('es-CO')}`;
  }
}

const PAYMENT_LABELS: Record<string, string> = {
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  EFECTIVO: 'Efectivo',
  DIGITAL: 'Digital',
};

/** Read-only summary of a draft; the live card with actions replaces it where available. */
export function DraftSummary({ message }: { message: ThreadMessage }) {
  const d = message.draft;
  if (!d)
    return <p className="whitespace-pre-wrap break-words">{message.text}</p>;
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-muted-foreground">
        Entendí esto
      </p>
      <p className="text-xl font-bold">
        {d.type === 'INCOME' ? 'Ingreso' : 'Gasto'} ·{' '}
        {formatDraftAmount(d.amount, d.currency)}
      </p>
      <p className="break-words">{d.description}</p>
      <p className="text-sm text-muted-foreground">
        {d.category} · {PAYMENT_LABELS[d.paymentMethod] ?? d.paymentMethod} ·{' '}
        {d.date}
      </p>
    </div>
  );
}

function UserStatus({ message, now }: { message: ThreadMessage; now: number }) {
  if (message.status === 'analyzing') {
    const slow = now - new Date(message.createdAt).getTime() > SLOW_ANALYSIS_MS;
    return (
      <p
        role="status"
        className="mt-1.5 flex items-center gap-1.5 text-sm opacity-90"
      >
        <Loader2
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {slow
          ? 'Está tardando más de lo normal. Puedes seguir esperando.'
          : 'Analizando…'}
      </p>
    );
  }
  if (message.status === 'failed') {
    return <p className="mt-1.5 text-sm font-semibold">No se pudo procesar</p>;
  }
  return null;
}

interface Props {
  message: ThreadMessage;
  now: number;
  /** Replaces the default read-only draft summary (live card with actions). */
  renderDraft?: (message: ThreadMessage) => ReactNode;
}

export function ChatMessage({ message, now, renderDraft }: Props) {
  if (message.role === 'user') {
    const AttachmentIcon =
      message.attachment?.kind === 'image' ? ImageIcon : Mic;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-base text-primary-foreground">
          {message.attachment && (
            <p className="mb-1 flex items-center gap-1.5 text-sm opacity-90">
              <AttachmentIcon className="h-4 w-4" aria-hidden="true" />
              {message.attachment.kind === 'image' ? 'Foto' : 'Audio'}
            </p>
          )}
          {message.text && (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}
          <UserStatus message={message} now={now} />
        </div>
      </div>
    );
  }

  const tone =
    message.kind === 'error'
      ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100'
      : message.kind === 'notice'
        ? 'border-border bg-muted text-foreground'
        : 'border-border bg-card text-foreground';

  return (
    <div className="flex items-end gap-2">
      <div
        className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Sprout className="h-4 w-4" />
      </div>
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 text-base ${tone}`}
      >
        {message.kind === 'error' && (
          <AlertCircle className="mb-1 h-5 w-5" aria-label="Error" />
        )}
        {message.kind === 'notice' && (
          <Info className="mb-1 h-5 w-5" aria-label="Aviso" />
        )}
        {message.kind === 'draft' ? (
          (renderDraft?.(message) ?? <DraftSummary message={message} />)
        ) : (
          <p className="break-words">{renderChatText(message.text)}</p>
        )}
      </div>
    </div>
  );
}
