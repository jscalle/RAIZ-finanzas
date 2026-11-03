import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useBackToClose } from '../hooks/useBackToClose';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the query and reacts when the screen changes', () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }));
    const { result, unmount } = renderHook(() =>
      useMediaQuery('(min-width: 768px)')
    );
    expect(result.current).toBe(false);
    act(() => {
      matches = true;
      listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(true);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('answers false when the browser cannot match media', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(
      renderHook(() => useMediaQuery('(min-width: 768px)')).result.current
    ).toBe(false);
  });
});

describe('useBackToClose', () => {
  beforeEach(() => {
    window.history.replaceState(null, '');
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds a history entry while open and closes on the back button', () => {
    const onClose = vi.fn();
    const push = vi.spyOn(window.history, 'pushState');
    renderHook(() => useBackToClose(true, onClose));
    expect(push).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while closed', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn();
    renderHook(() => useBackToClose(false, onClose));
    expect(push).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes its own history entry when closed another way, so back does not leave the app', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ open }) => useBackToClose(open, () => {}),
      { initialProps: { open: true } }
    );
    rerender({ open: false });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('does not go back again when the back button itself closed it', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ open }) => useBackToClose(open, () => {}),
      { initialProps: { open: true } }
    );
    window.history.replaceState(null, ''); // what the browser state looks like after a real "back"
    rerender({ open: false });
    expect(back).not.toHaveBeenCalled();
  });
});

describe('useKeyboardInset', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('reports how much of the bottom the on-screen keyboard covers, and clears it when it closes', () => {
    const vv = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: vv,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toEqual({ bottom: 0, height: null });

    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ bottom: 344, height: 500 });

    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current.bottom).toBe(0);
  });

  it('does nothing without visualViewport or when disabled', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    expect(renderHook(() => useKeyboardInset(true)).result.current).toEqual({
      bottom: 0,
      height: null,
    });
    const vv = Object.assign(new EventTarget(), { height: 500, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: vv,
    });
    const { result } = renderHook(() => useKeyboardInset(false));
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ bottom: 0, height: null });
  });
});
