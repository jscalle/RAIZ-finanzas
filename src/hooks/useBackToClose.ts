import { useEffect, useRef } from 'react';

/**
 * While `open`, the browser's back button (and the Android back gesture) closes the sheet instead
 * of leaving the app. It adds one history entry on open and takes it away again when the sheet
 * is closed some other way, so the history stays as it was.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ raizSheet: true }, '');
    const onPop = () => latest.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if ((window.history.state as { raizSheet?: boolean } | null)?.raizSheet) {
        window.history.back();
      }
    };
  }, [open]);
}
