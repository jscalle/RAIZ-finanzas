import { useRef } from 'react';
import { Loader2, Send } from 'lucide-react';

export const MAX_MESSAGE_LENGTH = 2000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}

/** Text box and send button. Font stays at 16px so iOS does not zoom on focus. */
export function Composer({ value, onChange, onSend, sending }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !sending;

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-background px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <label htmlFor="assistant-message" className="sr-only">
        Escribe tu mensaje
      </label>
      <textarea
        id="assistant-message"
        ref={ref}
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
  );
}
