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

/**
 * Live conversation of the signed-in user with the assistant in one space.
 * Listens only while enabled with a space and a user, and stops (and clears the
 * messages) whenever the space or the user changes.
 */
export function useAssistantThread(
  spaceId: string | undefined,
  uid: string | undefined,
  enabled: boolean
) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    if (!enabled || !spaceId || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeToAssistantThread(
      spaceId,
      uid,
      (next) => {
        setMessages(next);
        setLoading(false);
        setLoadError(null);
      },
      (error) => {
        setLoading(false);
        setLoadError(
          isPermissionDenied(error) ? PERMISSION_ERROR : GENERIC_ERROR
        );
      }
    );
  }, [spaceId, uid, enabled]);

  return { messages, loading, loadError };
}
