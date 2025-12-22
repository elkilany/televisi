import { useEffect, useRef } from 'react';

/**
 * Hook to keep the session alive and prevent timeouts.
 * - Prevents browser from throttling the tab
 * - Keeps JavaScript execution active
 * - Handles visibility changes to restore activity when tab becomes visible
 */
export function useKeepAlive(intervalMs: number = 30000) {
  const intervalRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Keep-alive function that runs periodically
    const keepAlive = () => {
      lastActivityRef.current = Date.now();
      // Touch localStorage to keep the session active
      localStorage.setItem('televisi-keepalive', Date.now().toString());
    };

    // Start the keep-alive interval
    intervalRef.current = window.setInterval(keepAlive, intervalMs);

    // Handle visibility change - restore activity when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible, trigger immediate keep-alive
        keepAlive();
      }
    };

    // Prevent page from being discarded by the browser
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only show warning if there are active downloads
      const hasActiveDownloads = localStorage.getItem('televisi-downloads');
      if (hasActiveDownloads) {
        const downloads = JSON.parse(hasActiveDownloads);
        const hasActive = downloads.some((d: { status: string }) =>
          d.status === 'downloading' || d.status === 'pending'
        );
        if (hasActive) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Initial keep-alive
    keepAlive();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [intervalMs]);

  return {
    lastActivity: lastActivityRef.current,
  };
}
