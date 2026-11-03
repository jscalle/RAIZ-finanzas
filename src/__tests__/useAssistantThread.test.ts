import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ThreadMessage } from '../types';

const h = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  subscribeToAssistantThread: (...args: unknown[]) => h.subscribe(...args),
  isPermissionDenied: (e: unknown) =>
    (e as { code?: string } | null)?.code === 'permission-denied',
}));

import { useAssistantThread } from '../hooks/useAssistantThread';

type Emit = (m: ThreadMessage[]) => void;
type Fail = (e: unknown) => void;

const msg = (id: string): ThreadMessage => ({
  id,
  role: 'user',
  kind: 'text',
  text: id,
  createdAt: '2026-11-01T00:00:00.000Z',
});

describe('useAssistantThread', () => {
  let emit: Emit;
  let fail: Fail;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    unsubscribe = vi.fn();
    h.subscribe.mockImplementation(
      (_s: string, _u: string, onUpdate: Emit, onError: Fail) => {
        emit = onUpdate;
        fail = onError;
        return unsubscribe;
      }
    );
  });

  it('listens to the thread and returns its messages', () => {
    const { result } = renderHook(() =>
      useAssistantThread('espacio_a', 'u1', true)
    );
    expect(h.subscribe).toHaveBeenCalledWith(
      'espacio_a',
      'u1',
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.current.loading).toBe(true);

    act(() => emit([msg('a'), msg('b')]));
    expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(result.current.loading).toBe(false);
    expect(result.current.loadError).toBeNull();
  });

  it('does not listen without a space, a user, or when disabled', () => {
    renderHook(() => useAssistantThread('', 'u1', true));
    renderHook(() => useAssistantThread('espacio_a', undefined, true));
    const { result } = renderHook(() =>
      useAssistantThread('espacio_a', 'u1', false)
    );
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      messages: [],
      loading: false,
      loadError: null,
    });
  });

  it('stops listening and clears messages when the space or the user changes, and on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ space, uid }) => useAssistantThread(space, uid, true),
      { initialProps: { space: 'espacio_a', uid: 'u1' } }
    );
    act(() => emit([msg('a')]));
    expect(result.current.messages).toHaveLength(1);

    rerender({ space: 'espacio_b', uid: 'u1' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toEqual([]);
    expect(h.subscribe).toHaveBeenLastCalledWith(
      'espacio_b',
      'u1',
      expect.any(Function),
      expect.any(Function)
    );

    rerender({ space: 'espacio_b', uid: 'u2' });
    expect(unsubscribe).toHaveBeenCalledTimes(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(3);
  });

  it('explains a permission error and a generic error differently, and clears it on the next update', () => {
    const { result } = renderHook(() =>
      useAssistantThread('espacio_a', 'u1', true)
    );

    act(() => fail({ code: 'permission-denied' }));
    expect(result.current.loadError).toContain('permiso');
    expect(result.current.loading).toBe(false);

    act(() => fail({ code: 'unavailable' }));
    expect(result.current.loadError).toContain('conexión');

    act(() => emit([msg('a')]));
    expect(result.current.loadError).toBeNull();
  });
});
