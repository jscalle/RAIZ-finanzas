import { useEffect, useRef } from 'react';
import { Camera, Image as ImageIcon, Mic } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
}

const OPTIONS = [
  {
    label: 'Tomar foto',
    hint: 'Una factura o un recibo',
    icon: Camera,
    accept: 'image/*',
    capture: true,
  },
  {
    label: 'Elegir de la galería',
    hint: 'Una foto que ya tienes',
    icon: ImageIcon,
    accept: 'image/*',
    capture: false,
  },
  {
    label: 'Subir audio',
    hint: 'Una nota o un audio guardado',
    icon: Mic,
    accept: 'audio/*',
    capture: false,
  },
] as const;

/** Bottom sheet with three large choices. Each one opens the device picker. */
export function AttachSheet({ open, onClose, onPick }: Props) {
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adjuntar"
        className="relative w-full max-w-md rounded-t-3xl border border-border bg-card p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-2xl md:rounded-3xl"
      >
        <div
          className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border md:hidden"
          aria-hidden="true"
        />
        <ul className="space-y-1">
          {OPTIONS.map((option, i) => {
            const Icon = option.icon;
            return (
              <li key={option.label}>
                <label className="flex min-h-[56px] cursor-pointer items-center gap-4 rounded-2xl p-3 text-foreground focus-within:ring-2 focus-within:ring-primary hover:bg-muted">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col text-left">
                    <span className="text-base font-semibold">
                      {option.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                  <input
                    ref={i === 0 ? firstRef : undefined}
                    type="file"
                    accept={option.accept}
                    {...(option.capture
                      ? { capture: 'environment' as const }
                      : {})}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) {
                        onPick(file);
                        onClose();
                      }
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-[52px] w-full rounded-full border border-border text-base font-semibold text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
