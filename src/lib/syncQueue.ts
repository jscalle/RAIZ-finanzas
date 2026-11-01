import {
  saveSpaceDocument,
  deleteSpaceDocument,
  isPermissionDenied,
} from './firebase';

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

export interface FlushSyncQueueResult {
  // Items written to the cloud and removed from the queue.
  flushed: number;
  // Items the security rules refused (permission-denied). They can never
  // succeed, so they were removed from the queue; callers must tell the user.
  dropped: SyncQueueItem[];
}

export async function flushSyncQueue(
  spaceId: string
): Promise<FlushSyncQueueResult> {
  const queue = getSyncQueue(spaceId);
  const result: FlushSyncQueueResult = { flushed: 0, dropped: [] };
  if (queue.length === 0) return result;

  // Sort by timestamp just in case
  const sortedQueue = [...queue].sort((a, b) => a.timestamp - b.timestamp);

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
      result.flushed++;
    } catch (err) {
      if (isPermissionDenied(err)) {
        // Not retryable: drop it and report it instead of retrying forever.
        console.error('Dropped a sync item refused by the rules', item, err);
        removeFromSyncQueue(spaceId, item.id, item.subcol);
        result.dropped.push(item);
        continue;
      }
      console.error('Failed to flush item', item, err);
      // Stop flushing on the first retryable error (e.g. offline) and keep the
      // remaining items queued for the next attempt.
      break;
    }
  }

  return result;
}
