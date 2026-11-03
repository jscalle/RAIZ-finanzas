import { Loader2, Mic, Plus, Send, X } from 'lucide-react';
import { formatFileSize } from '../../lib/attachments';
import type { PickedAttachment } from '../../lib/attachments';

export const MAX_MESSAGE_LENGTH = 2000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  attachment: PickedAttachment | null;
  /** The attachment is being uploaded (the server has not shown it in the thread yet). */
  uploading: boolean;
  onOpenAttach: () => void;
  onRemoveAttachment: () => void;
}

/** Text box, attach button and send button. Font stays at 16px so iOS does not zoom on focus. */
export function Composer({
  value,
  onChange,
  onSend,
  sending,
  attachment,
  uploading,
  onOpenAttach,
  onRemoveAttachment,
}: Props) {
  const canSend = (value.trim().length > 0 || attachment !== null) && !sending;

  return (
    <div className="border-t border-border bg-background">
      {attachment && (
        <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-2">
          {attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt="Vista previa de la foto"
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mic className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {attachment.file.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(attachment.file.size)} ·{' '}
              {uploading ? 'Subiendo…' : 'Listo para enviar'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRemoveAttachment}
            disabled={uploading}
            aria-label="Quitar archivo adjunto"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-2 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        <button
          type="button"
          onClick={onOpenAttach}
          disabled={sending}
          aria-label="Adjuntar foto o audio"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
        <label htmlFor="assistant-message" className="sr-only">
          Escribe tu mensaje
        </label>
        <textarea
          id="assistant-message"
          value={value}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Escribe aquí… por ejemplo: gasté 45.000 en el almuerzo"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {sending ? (
            <Loader2
              className="h-6 w-6 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Send className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  );
}
