import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import {
  BUBBLE_SIZE,
  DEFAULT_POSITION,
  clampPixels,
  dropTo,
  nudge,
  parseStored,
  serialize,
  toPixels,
} from '../lib/bubblePosition';
import type { BubblePosition, Viewport } from '../lib/bubblePosition';

const STORAGE_KEY = 'raiz.assistantBubble';
/** Movement under this many pixels is a tap, not a drag. */
const DRAG_THRESHOLD = 6;

interface Props {
  onOpen: () => void;
  /** Drafts waiting for a decision. */
  badgeCount?: number;
  /** The assistant answered while the panel was closed. */
  hasUpdate?: boolean;
  hidden?: boolean;
}

const readViewport = (): Viewport => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

function loadPosition(): BubblePosition {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_POSITION;
  } catch {
    return DEFAULT_POSITION;
  }
}

function savePosition(position: BubblePosition) {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(position));
  } catch {
    /* storage blocked: the bubble just forgets its place */
  }
}

/**
 * The assistant, as a draggable bubble that floats over every screen. A tap opens the assistant;
 * a drag moves it and, on release, it snaps to the nearer side and remembers its place. The arrow
 * keys move it too, so it never depends on dragging.
 */
export function FloatingAssistantButton({
  onOpen,
  badgeCount = 0,
  hasUpdate = false,
  hidden = false,
}: Props) {
  const [viewport, setViewport] = useState<Viewport>(readViewport);
  const [position, setPosition] = useState<BubblePosition>(loadPosition);
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(
    null
  );
  const gesture = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const ignoreNextClick = useRef(false);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  if (hidden) return null;

  const resting = clampPixels(toPixels(position, viewport), viewport);
  const shown = dragging ?? resting;

  const pointAt = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current!;
    return clampPixels(
      {
        x: g.originX + e.clientX - g.startX,
        y: g.originY + e.clientY - g.startY,
      },
      viewport
    );
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ignoreNextClick.current = false;
    gesture.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: resting.x,
      originY: resting.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (
      !g.moved &&
      Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD
    )
      return;
    g.moved = true;
    setDragging(pointAt(e));
  };

  const finish = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    const landedAt = pointAt(e);
    gesture.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!g.moved) return;
    const landed = dropTo(landedAt, viewport);
    ignoreNextClick.current = true;
    setPosition(landed);
    savePosition(landed);
    setDragging(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const next = nudge(position, e.key, viewport);
    setPosition(next);
    savePosition(next);
  };

  const label = [
    'Abrir el asistente',
    badgeCount > 0 ? `${badgeCount} por confirmar` : '',
    hasUpdate ? 'hay una respuesta nueva' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className={`fixed left-0 top-0 z-30 ${
        dragging
          ? ''
          : 'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none'
      }`}
      style={{ transform: `translate3d(${shown.x}px, ${shown.y}px, 0)` }}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          if (ignoreNextClick.current) {
            ignoreNextClick.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
        className={`relative block touch-none select-none overflow-hidden rounded-full border-2 border-primary/60 bg-card shadow-lg transition-[opacity,transform] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
          dragging ? 'scale-110 opacity-100' : 'opacity-85 hover:opacity-100'
        }`}
        style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
      >
        <img
          src="/apple-icon.png"
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      </button>
      {badgeCount > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-rose-500 px-1 text-[11px] font-bold text-white"
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      {hasUpdate && badgeCount === 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-background bg-primary"
        />
      )}
    </div>
  );
}
