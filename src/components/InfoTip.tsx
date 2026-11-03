import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface Props {
  /** Accessible name of the (i) button, for example "Más información sobre el disponible". */
  label: string;
  title?: string;
  children: ReactNode;
}

/**
 * A small (i) button that opens an explanation. Keeps long descriptions off the screen until
 * someone asks for them. It works with a tap (no hover needed): a centered card on phones and a
 * popover under the button on larger screens. Closes with Escape, by tapping outside, or with
 * "Entendido", and gives the focus back to the button.
 */
export function InfoTip({ label, title, children }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-black/30 md:bg-transparent"
          />
          <div
            id={panelId}
            role="dialog"
            aria-label={title ?? label}
            className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-border bg-card p-4 text-left shadow-2xl md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-2 md:w-80 md:translate-y-0"
          >
            {title && (
              <p className="mb-1 text-sm font-semibold text-foreground">
                {title}
              </p>
            )}
            <div className="text-sm font-normal normal-case leading-relaxed tracking-normal text-muted-foreground">
              {children}
            </div>
            <button
              type="button"
              onClick={close}
              className="mt-3 min-h-[44px] w-full rounded-full border border-border text-sm font-semibold text-foreground md:hidden"
            >
              Entendido
            </button>
          </div>
        </>
      )}
    </span>
  );
}
