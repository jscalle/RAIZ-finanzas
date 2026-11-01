import { describe, it, expect, beforeEach } from 'vitest';
import {
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
} from '../lib/syncQueue';

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
});
