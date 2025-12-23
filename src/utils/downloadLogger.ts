/**
 * Download Debug Logger
 * Captures all download-related events for debugging
 */

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

class DownloadLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private listeners: Set<() => void> = new Set();

  private addLog(level: LogEntry['level'], message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.unshift(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Also log to console for browser devtools
    const consoleMsg = `[Download] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, data || '');
        break;
      case 'warn':
        console.warn(consoleMsg, data || '');
        break;
      case 'debug':
        console.debug(consoleMsg, data || '');
        break;
      default:
        console.log(consoleMsg, data || '');
    }

    // Notify listeners
    this.listeners.forEach(fn => fn());
  }

  info(message: string, data?: Record<string, unknown>) {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.addLog('error', message, data);
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.addLog('debug', message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogsForDownload(downloadName: string): LogEntry[] {
    return this.logs.filter(log =>
      log.message.includes(downloadName) ||
      log.data?.name === downloadName ||
      log.data?.downloadName === downloadName
    );
  }

  clear() {
    this.logs = [];
    this.listeners.forEach(fn => fn());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Export logs as text for sharing
  exportAsText(): string {
    return this.logs.map(log => {
      const time = new Date(log.timestamp).toISOString();
      const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
      return `[${time}] [${log.level.toUpperCase()}] ${log.message}${dataStr}`;
    }).join('\n');
  }

  // Format bytes for display
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Singleton instance
export const downloadLogger = new DownloadLogger();
