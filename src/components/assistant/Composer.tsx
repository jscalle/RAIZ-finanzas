import { useLayoutEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Loader2,
  Mic,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
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
  /** Voice notes: tap the mic to start, tap send to finish, trash to cancel. */
  voiceSupported: boolean;
  recording: boolean;
  recordingSeconds: number;
  /** Microphone level from 0 to 1, for the little bars. */
  recordingLevel: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
}

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const BAR_WEIGHTS = [0.5, 0.8, 1, 0.8, 0.5];

function RecordingBar({
  seconds,
  level,
  onCancel,
  onSend,
}: {
  seconds: number;
  level: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-3"
      role="group"
      aria-label="Grabando nota de voz"
    >
      <p role="status" className="sr-only">
        Grabando
      </p>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar grabación"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
      >
        <Trash2 className="h-6 w-6" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatClock(seconds)}
        </span>
        <span className="flex h-6 items-center gap-1" aria-hidden="true">
          {BAR_WEIGHTS.map((weight, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-primary"
              style={{
                height: `${Math.max(4, Math.round(24 * Math.min(1, level * weight + 0.1)))}px`,
              }}
            />
          ))}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          Máximo 3 minutos
        </span>
      </div>
      <button
        type="button"
        onClick={onSend}
        aria-label="Enviar nota de voz"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Send className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
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
  voiceSupported,
  recording,
  recordingSeconds,
  recordingLevel,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
}: Props) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Grow with the text (up to the max height) so a second line is never hidden.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 128)}px`;
  }, [value]);

  const hasContent = value.trim().length > 0 || attachment !== null;
  const canSend = hasContent && !sending;

  if (recording) {
    return (
      <div className="border-t border-border bg-background">
        <RecordingBar
          seconds={recordingSeconds}
          level={recordingLevel}
          onCancel={onCancelRecording}
          onSend={onStopRecording}
        />
      </div>
    );
  }

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
              {attachment.kind === 'image' ? (
                <ImageIcon className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Mic className="h-6 w-6" aria-hidden="true" />
              )}
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
          ref={boxRef}
          value={value}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Escribe aquí…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {!hasContent && voiceSupported && !sending ? (
          <button
            type="button"
            onClick={onStartRecording}
            aria-label="Grabar nota de voz"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Mic className="h-6 w-6" aria-hidden="true" />
          </button>
        ) : (
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
        )}
      </form>
    </div>
  );
}
