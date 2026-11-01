import React, { useEffect } from 'react';
import { fetchRecentBankEmails } from '../lib/gmail';
import { clearStoredToken } from '../lib/firebase';

type Toast = {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
};

interface UseGmailSyncArgs {
  gToken: string | null;
  setGToken: React.Dispatch<React.SetStateAction<string | null>>;
  syncEnabled: boolean;
  currentSpaceId: string;
  setToast: React.Dispatch<React.SetStateAction<Toast | null>>;
}

/**
 * Owns the Gmail bank-alert sync side of the app: the auto-sync effect that runs
 * when connected to a Cloud Space and the manual "refresh all data" handler.
 *
 * The Gmail OAuth token (gToken) is intentionally NOT owned here: it is shared
 * with the auth flow (set by initAuth and the sign-in handlers) and written via
 * writeStoredToken there, so it stays in App.tsx and is threaded in. This hook
 * only consumes it and clears it (clearStoredToken) when it expires, exactly
 * mirroring the original App.tsx behavior.
 *
 * Behavior, effect dependency arrays, and console logging are preserved verbatim
 * from App.tsx, including the auto-sync effect that only console.logs the fetched
 * count and never persists it.
 */
export function useGmailSync({
  gToken,
  setGToken,
  syncEnabled,
  currentSpaceId,
  setToast,
}: UseGmailSyncArgs) {
  // Auto-sync Gmail bank alerts when connected to a Cloud Space
  useEffect(() => {
    if (syncEnabled && currentSpaceId && gToken) {
      fetchRecentBankEmails(gToken)
        .then((fetchedEmails) => {
          if (fetchedEmails.length > 0) {
            console.log(
              `Auto Gmail Sync: Sincronizados ${fetchedEmails.length} correos de alerta en el espacio ${currentSpaceId}.`
            );
          }
        })
        .catch((err) => {
          const errMsg = err?.message || String(err);
          if (
            errMsg.includes('UNAUTHORIZED_GMAIL_TOKEN') ||
            errMsg.includes('401')
          ) {
            console.warn(
              'Google Gmail token has expired. Clearing saved token.'
            );
            setGToken(null);
            clearStoredToken();
          } else {
            console.warn('Auto Gmail Sync notice:', errMsg);
          }
        });
    }
  }, [syncEnabled, currentSpaceId, gToken, setGToken]);

  const handleRefreshAllData = async () => {
    setToast({
      message: 'Refrescando datos en tiempo real...',
      type: 'info',
    });

    if (gToken) {
      try {
        const fetchedEmails = await fetchRecentBankEmails(gToken);
        if (fetchedEmails.length > 0) {
          setToast({
            message: `¡Datos actualizados! Se consultaron ${fetchedEmails.length} alertas bancarias de Gmail.`,
            type: 'success',
          });
          return;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.includes('UNAUTHORIZED_GMAIL_TOKEN') ||
          errMsg.includes('401')
        ) {
          setGToken(null);
          clearStoredToken();
          setToast({
            message:
              'Tu sesión de Gmail ha expirado (límite de 1 hora). Por favor toca "Conectar con Google" para refrescar.',
            type: 'warning',
          });
          return;
        }
      }
    }

    setToast({
      message: 'Datos y estado sincronizados correctamente.',
      type: 'success',
    });
  };

  return { handleRefreshAllData };
}
