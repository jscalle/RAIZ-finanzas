import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FloatingAssistantButton } from './FloatingAssistantButton';
import { BUBBLE_SIZE, EDGE_MARGIN, allowedY } from '../lib/bubblePosition';

const KEY = 'raiz.assistantBubble';
const setScreen = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
};
const open = () => screen.getByRole('button', { name: /Abrir el asistente/ });
/** The wrapper moves with a transform; read where it currently is. */
const where = () => {
  const m = (open().parentElement as HTMLElement).style.transform.match(
    /translate3d\(([-\d.]+)px, ([-\d.]+)px/
  );
  return { x: Number(m?.[1]), y: Number(m?.[2]) };
};
const drag = (from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(open(), {
    clientX: from[0],
    clientY: from[1],
    pointerId: 1,
    button: 0,
  });
  fireEvent.pointerMove(open(), {
    clientX: to[0],
    clientY: to[1],
    pointerId: 1,
  });
  fireEvent.pointerUp(open(), { clientX: to[0], clientY: to[1], pointerId: 1 });
};

beforeEach(() => {
  localStorage.clear();
  setScreen(390, 844);
});
afterEach(() => vi.restoreAllMocks());

describe('FloatingAssistantButton', () => {
  it('shows the brand icon as one accessible button, at the bottom right', () => {
    render(<FloatingAssistantButton onOpen={() => {}} />);
    expect(open()).toBeInTheDocument();
    expect(open().querySelector('img')).toHaveAttribute('alt', '');
    const { max } = allowedY({ width: 390, height: 844 });
    expect(where()).toEqual({ x: 390 - BUBBLE_SIZE - EDGE_MARGIN, y: max });
  });

  it('renders nothing when hidden', () => {
    render(<FloatingAssistantButton onOpen={() => {}} hidden />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the assistant on a tap', () => {
    const onOpen = vi.fn();
    render(<FloatingAssistantButton onOpen={onOpen} />);
    fireEvent.click(open());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows how many drafts wait, caps it at 9+, and says a reply arrived', () => {
    const { rerender } = render(
      <FloatingAssistantButton onOpen={() => {}} badgeCount={3} />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(open()).toHaveAccessibleName(/3 por confirmar/);
    rerender(<FloatingAssistantButton onOpen={() => {}} badgeCount={12} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
    rerender(
      <FloatingAssistantButton onOpen={() => {}} badgeCount={0} hasUpdate />
    );
    expect(screen.queryByText('0')).toBeNull();
    expect(open()).toHaveAccessibleName(/respuesta nueva/);
  });

  describe('dragging', () => {
    it('snaps to the left edge when dropped on the left half, remembers it, and does not open', () => {
      const onOpen = vi.fn();
      render(<FloatingAssistantButton onOpen={onOpen} />);
      const start = where();
      drag([start.x + 20, start.y + 20], [60, 300]);
      expect(where().x).toBe(EDGE_MARGIN);
      expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({
        side: 'left',
      });
      fireEvent.click(open()); // the click that follows a drag is ignored
      expect(onOpen).not.toHaveBeenCalled();
      fireEvent.click(open()); // the next real tap opens
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('treats a tiny movement as a tap, not a drag', () => {
      const onOpen = vi.fn();
      render(<FloatingAssistantButton onOpen={onOpen} />);
      const start = where();
      drag([start.x + 20, start.y + 20], [start.x + 23, start.y + 22]);
      expect(where()).toEqual(start);
      expect(localStorage.getItem(KEY)).toBeNull();
      fireEvent.click(open());
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('never leaves the screen, even when dragged far outside it', () => {
      render(<FloatingAssistantButton onOpen={() => {}} />);
      const start = where();
      drag([start.x + 20, start.y + 20], [9000, -9000]);
      const { min } = allowedY({ width: 390, height: 844 });
      expect(where()).toEqual({ x: 390 - BUBBLE_SIZE - EDGE_MARGIN, y: min });
    });
  });

  describe('saved position', () => {
    it('comes back where the user left it', () => {
      localStorage.setItem(KEY, JSON.stringify({ side: 'left', yRatio: 0 }));
      render(<FloatingAssistantButton onOpen={() => {}} />);
      const { min } = allowedY({ width: 390, height: 844 });
      expect(where()).toEqual({ x: EDGE_MARGIN, y: min });
    });

    it('ignores corrupt saved data and starts at the bottom right', () => {
      localStorage.setItem(KEY, '{"side":"top","yRatio":"x"}');
      render(<FloatingAssistantButton onOpen={() => {}} />);
      expect(where().x).toBe(390 - BUBBLE_SIZE - EDGE_MARGIN);
    });

    it('works when storage is blocked', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      render(<FloatingAssistantButton onOpen={() => {}} />);
      const start = where();
      expect(() => drag([start.x + 20, start.y + 20], [40, 200])).not.toThrow();
      expect(where().x).toBe(EDGE_MARGIN);
    });
  });

  it('can be moved with the arrow keys, without opening the assistant', () => {
    const onOpen = vi.fn();
    render(<FloatingAssistantButton onOpen={onOpen} />);
    fireEvent.keyDown(open(), { key: 'ArrowLeft' });
    expect(where().x).toBe(EDGE_MARGIN);
    expect(JSON.parse(localStorage.getItem(KEY)!).side).toBe('left');
    const before = where().y;
    fireEvent.keyDown(open(), { key: 'ArrowUp' });
    expect(where().y).toBeLessThan(before);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps its place when the screen is resized or rotated', () => {
    render(<FloatingAssistantButton onOpen={() => {}} />);
    act(() => {
      setScreen(844, 390);
      window.dispatchEvent(new Event('resize'));
    });
    expect(where().x).toBe(844 - BUBBLE_SIZE - EDGE_MARGIN);
    const { max } = allowedY({ width: 844, height: 390 });
    expect(where().y).toBe(max);
  });
});
