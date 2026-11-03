import { useEffect, useState } from 'react';

export interface KeyboardInset {
  /** How far the on-screen keyboard pushes the bottom edge up, in pixels. */
  bottom: number;
  /** Height of the part of the screen that is actually visible, or null when unknown. */
  height: number | null;
}

const NONE: KeyboardInset = { bottom: 0, height: null };

/**
 * On iPhone the keyboard covers fixed elements instead of resizing the page. The visual viewport
 * tells how much is hidden, so a bottom sheet can lift its text box above the keyboard.
 */
export function useKeyboardInset(enabled: boolean): KeyboardInset {
  const [inset, setInset] = useState<KeyboardInset>(NONE);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;
    const update = () => {
      const bottom = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      setInset(
        bottom > 0 ? { bottom, height: Math.round(viewport.height) } : NONE
      );
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
