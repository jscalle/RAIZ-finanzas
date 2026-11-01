import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addToSyncQueue,
  flushSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
} from '../lib/syncQueue';

// Cloud writes are replaced by controllable closures (they survive the
// config's mockReset); the rest of ../lib/firebase is the real module.
const cloud = vi.hoisted(() => ({
  save: async (..._args: unknown[]): Promise<void> => {},
  remove: async (..._args: unknown[]): Promise<void> => {},
}));

vi.mock('../lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/firebase')>()),
  saveSpaceDocument: (...args: unknown[]) => cloud.save(...args),
  deleteSpaceDocument: (...args: unknown[]) => cloud.remove(...args),
}));

const failure = (code: string) =>
  Object.assign(new Error(`Firestore failure: ${code}`), { code });

describe('syncQueue', () => {
  const spaceId = 'espacio_test';

  beforeEach(() => {
    localStorage.clear();
  });

  it('should add item to sync queue', () => {
    addToSyncQueue(spaceId, {
      id: 'item-1',
      subcol: 'expenses',
      action: 'save',
      data: { amount: 50000, description: 'Gasto prueba' },
    });

    const queue = getSyncQueue(spaceId);
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe('item-1');
  });

  it('should remove item from sync queue', () => {
    addToSyncQueue(spaceId, {
      id: 'item-2',
      subcol: 'incomes',
      action: 'save',
      data: { amount: 100000 },
    });

    removeFromSyncQueue(spaceId, 'item-2', 'incomes');
    const queue = getSyncQueue(spaceId);
    expect(queue.length).toBe(0);
  });

  describe('flushSyncQueue (S9)', () => {
    beforeEach(() => {
      cloud.save = async () => {};
      cloud.remove = async () => {};
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    const queueTwoItems = () => {
      addToSyncQueue(spaceId, {
        id: 'item-a',
        subcol: 'expenses',
        action: 'save',
        data: { amount: 1 },
      });
      addToSyncQueue(spaceId, {
        id: 'item-b',
        subcol: 'incomes',
        action: 'delete',
      });
    };

    it('flushes successful writes and removes them from the queue', async () => {
      queueTwoItems();

      const result = await flushSyncQueue(spaceId);

      expect(result).toEqual({ flushed: 2, dropped: [] });
      expect(getSyncQueue(spaceId)).toEqual([]);
    });

    it('drops a permission-denied item with a report instead of counting it as flushed', async () => {
      queueTwoItems();
      cloud.save = async () => {
        throw failure('permission-denied');
      };

      const result = await flushSyncQueue(spaceId);

      expect(result.flushed).toBe(1);
      expect(result.dropped.map((item) => item.id)).toEqual(['item-a']);
      expect(getSyncQueue(spaceId)).toEqual([]);
    });

    it('keeps a retryable failure queued and stops flushing', async () => {
      queueTwoItems();
      cloud.save = async () => {
        throw failure('unavailable');
      };

      const result = await flushSyncQueue(spaceId);

      expect(result).toEqual({ flushed: 0, dropped: [] });
      expect(getSyncQueue(spaceId).map((item) => item.id)).toEqual([
        'item-a',
        'item-b',
      ]);
    });
  });
});
