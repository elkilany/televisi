import { useState, useEffect, useCallback } from 'react';
import { downloadLogger } from '../utils/downloadLogger';
import type { LogEntry } from '../utils/downloadLogger';

export function useDownloadLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Initial load
    setLogs(downloadLogger.getLogs());

    // Subscribe to updates
    const unsubscribe = downloadLogger.subscribe(() => {
      setLogs(downloadLogger.getLogs());
    });

    return unsubscribe;
  }, []);

  const clearLogs = useCallback(() => {
    downloadLogger.clear();
  }, []);

  const exportLogs = useCallback(() => {
    return downloadLogger.exportAsText();
  }, []);

  const copyLogsToClipboard = useCallback(async () => {
    const text = downloadLogger.exportAsText();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  }, []);

  return {
    logs,
    clearLogs,
    exportLogs,
    copyLogsToClipboard,
  };
}
