import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackToClose';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface Props {
  open: boolean;
  /** Becomes true on the first open and stays true, so what was typed survives closing. */
  mounted: boolean;
  onClose: () => void;
  /** Where the bubble was, so the sheet grows from it and shrinks back into it. */
  origin: { x: number; y: number } | null;
  children: ReactNode;
}

const OPEN_MS = 400;
const CLOSE_MS = 300;
const SWIPE_CLOSE_PX = 90;
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * The assistant as a layer over the app. On a phone it is a bottom sheet (full width, 88% of the
 * height) that grows out of the bubble, with the app still visible in the strip above and a close
 * button there. On a large screen it is a side panel on the right that leaves the page usable.
 */
export function AssistantSheet({
  open,
  mounted,
  onClose,
  origin,
  children,
}: Props) {
  const isLarge = useMediaQuery('(min-width: 768px)');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [pullY, setPullY] = useState(0);
  const pull = useRef<number | null>(null);
  const keyboard = useKeyboardInset(open && !isLarge);

  useBackToClose(open && !isLarge, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const state = open ? 'open' : 'closed';
  const hiddenWhenClosed = {
    visibility: open ? ('visible' as const) : ('hidden' as const),
  };

  if (isLarge) {
    return (
      <aside
        aria-label="Asistente"
        data-state={state}
        inert={!open}
        className="fixed right-0 top-0 z-[45] flex h-dvh w-[420px] max-w-full flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          ...hiddenWhenClosed,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transitionProperty: 'transform, visibility',
          transitionDelay: open ? '0s' : `0s, ${CLOSE_MS}ms`,
        }}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-foreground">Asistente</h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Cerrar el asistente"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </aside>
    );
  }

  const cx = origin?.x ?? window.innerWidth - 40;
  const cy = origin?.y ?? window.innerHeight - 140;
  const onTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [
      ...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => !el.hasAttribute('inert'));
    const all = [closeButton.current, ...items].filter(
      Boolean
    ) as HTMLElement[];
    const first = all[0];
    const last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    pull.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (pull.current !== null) setPullY(Math.max(0, e.clientY - pull.current));
  };
  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    if (pull.current === null) return;
    const distance = e.clientY - pull.current;
    pull.current = null;
    setPullY(0);
    if (distance > SWIPE_CLOSE_PX) onClose();
  };

  return (
    <div
      data-state={state}
      data-origin={`${cx},${cy}`}
      inert={!open}
      className="fixed inset-0 z-[45] motion-reduce:!transition-none"
      style={{
        ...hiddenWhenClosed,
        clipPath: open
          ? `circle(150% at ${cx}px ${cy}px)`
          : `circle(0px at ${cx}px ${cy}px)`,
        transition: `clip-path ${open ? OPEN_MS : CLOSE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear ${open ? 0 : CLOSE_MS}ms`,
      }}
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div className="relative flex h-[12dvh] items-center justify-end px-4">
        <button
          ref={closeButton}
          type="button"
          aria-label="Cerrar el asistente"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-lg"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Asistente"
        onKeyDown={onTab}
        className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-2xl"
        style={{
          bottom: keyboard.bottom,
          maxHeight: keyboard.height ?? undefined,
          transform: pullY ? `translateY(${pullY}px)` : undefined,
          transition: pullY ? 'none' : 'transform 200ms ease-out',
        }}
      >
        <div
          data-testid="sheet-handle"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        >
          <span
            className="h-1.5 w-12 rounded-full bg-border"
            aria-hidden="true"
          />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
