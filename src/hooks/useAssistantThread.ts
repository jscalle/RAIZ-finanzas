import { useEffect, useState } from 'react';
import {
  isPermissionDenied,
  subscribeToAssistantThread,
} from '../lib/firebase';
import type { ThreadMessage } from '../types';

const PERMISSION_ERROR =
  'No tienes permiso para ver esta conversación todavía. Si acabas de actualizar la app, intenta de nuevo en unos minutos.';
const GENERIC_ERROR =
  'No pude cargar la conversación. Revisa tu conexión e intenta de nuevo.';

interface Snapshot {
  /** Which space and user this snapshot belongs to; a different key means it is stale. */
  key: string | null;
  messages: ThreadMessage[];
  loaded: boolean;
  error: string | null;
}

const EMPTY: Snapshot = { key: null, messages: [], loaded: false, error: null };

/**
 * Live conversation of the signed-in user with the assistant in one space.
 * Listens only while enabled with a space and a user. When the space or the user
 * changes the previous messages stop applying right away (the state is keyed), and
 * the old listener is closed.
 */
export function useAssistantThread(
  spaceId: string | undefined,
  uid: string | undefined,
  enabled: boolean
) {
  const key = enabled && spaceId && uid ? `${spaceId}|${uid}` : null;
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);

  useEffect(() => {
    if (!key || !spaceId || !uid) return;
    return subscribeToAssistantThread(
      spaceId,
      uid,
      (messages) => setSnapshot({ key, messages, loaded: true, error: null }),
      (error) =>
        setSnapshot((previous) => ({
          key,
          messages: previous.key === key ? previous.messages : [],
          loaded: true,
          error: isPermissionDenied(error) ? PERMISSION_ERROR : GENERIC_ERROR,
        }))
    );
  }, [key, spaceId, uid]);

  const current = snapshot.key === key ? snapshot : EMPTY;
  return {
    messages: current.messages,
    loading: key !== null && !current.loaded,
    loadError: current.error,
  };
}
