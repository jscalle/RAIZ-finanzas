import { saveSpaceDocument, deleteSpaceDocument } from './firebase';

export interface SyncQueueItem {
  id: string;
  subcol: string;
  action: 'save' | 'delete';
  data?: object;
  timestamp: number;
}

export function getSyncQueue(spaceId: string): SyncQueueItem[] {
  const queueStr = localStorage.getItem(`sync_queue_${spaceId}`);
  if (queueStr) {
    try {
      return JSON.parse(queueStr);
    } catch {
      return [];
    }
  }
  return [];
}

function setSyncQueue(spaceId: string, queue: SyncQueueItem[]) {
  localStorage.setItem(`sync_queue_${spaceId}`, JSON.stringify(queue));
}

export function addToSyncQueue(
  spaceId: string,
  item: Omit<SyncQueueItem, 'timestamp'>
) {
  const queue = getSyncQueue(spaceId);
  const newItem: SyncQueueItem = { ...item, timestamp: Date.now() };

  // If there's an existing item for the same id and subcol, we might want to update or remove it.
  // But a simple append and filter approach also works.
  const existingIndex = queue.findIndex(
    (q) => q.id === item.id && q.subcol === item.subcol
  );
  if (existingIndex !== -1) {
    queue[existingIndex] = newItem;
  } else {
    queue.push(newItem);
  }

  setSyncQueue(spaceId, queue);
}

export function removeFromSyncQueue(
  spaceId: string,
  id: string,
  subcol: string
) {
  const queue = getSyncQueue(spaceId);
  const newQueue = queue.filter((q) => !(q.id === id && q.subcol === subcol));
  setSyncQueue(spaceId, newQueue);
}

export async function flushSyncQueue(spaceId: string): Promise<number> {
  const queue = getSyncQueue(spaceId);
  if (queue.length === 0) return 0;

  // Sort by timestamp just in case
  const sortedQueue = [...queue].sort((a, b) => a.timestamp - b.timestamp);
  let flushedCount = 0;

  for (const item of sortedQueue) {
    try {
      if (item.action === 'save') {
        // Save entries are always enqueued with data; a missing payload is
        // rejected and logged inside saveSpaceDocument, as before.
        await saveSpaceDocument(
          spaceId,
          item.subcol,
          item.id,
          item.data as object
        );
      } else if (item.action === 'delete') {
        await deleteSpaceDocument(spaceId, item.subcol, item.id);
      }
      removeFromSyncQueue(spaceId, item.id, item.subcol);
      flushedCount++;
    } catch (err) {
      console.error('Failed to flush item', item, err);
      // Stop flushing on first error assuming it's a network issue
      break;
    }
  }

  return flushedCount;
}
