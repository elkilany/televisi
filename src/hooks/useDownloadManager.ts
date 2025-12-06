import { useState, useCallback, useRef, useEffect } from 'react';

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  size: number;
  downloaded: number;
  progress: number;
  status: DownloadStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
  speed: number; // bytes per second
  blob?: Blob;
}

interface DownloadController {
  abort: () => void;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
}

const STORAGE_KEY = 'televisi-downloads';

export function useDownloadManager() {
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => {
    // Load completed downloads from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filter only completed downloads (we can't restore in-progress ones)
        return parsed.filter((d: DownloadItem) => d.status === 'completed').map((d: DownloadItem) => ({
          ...d,
          blob: undefined, // Blobs can't be serialized
        }));
      } catch {
        return [];
      }
    }
    return [];
  });

  const controllersRef = useRef<Map<string, DownloadController>>(new Map());
  const speedTrackersRef = useRef<Map<string, { lastBytes: number; lastTime: number }>>(new Map());

  // Save completed downloads to localStorage
  useEffect(() => {
    const completedDownloads = downloads.filter(d => d.status === 'completed').map(d => ({
      ...d,
      blob: undefined,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedDownloads));
  }, [downloads]);

  const updateDownload = useCallback((id: string, updates: Partial<DownloadItem>) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const addDownload = useCallback((name: string, url: string): string => {
    const id = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newDownload: DownloadItem = {
      id,
      name,
      url,
      size: 0,
      downloaded: 0,
      progress: 0,
      status: 'pending',
      startedAt: Date.now(),
      speed: 0,
    };

    setDownloads(prev => [newDownload, ...prev]);

    // Start download automatically
    startDownload(id, url);

    return id;
  }, []);

  const startDownload = useCallback(async (id: string, url: string) => {
    const abortController = new AbortController();

    try {
      updateDownload(id, { status: 'downloading' });

      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

      updateDownload(id, { size: totalSize });

      if (!response.body) {
        throw new Error('Response body is not available');
      }

      const reader = response.body.getReader();
      controllersRef.current.set(id, { abort: () => abortController.abort(), reader });
      speedTrackersRef.current.set(id, { lastBytes: 0, lastTime: Date.now() });

      const chunks: BlobPart[] = [];
      let downloadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value as BlobPart);
        downloadedBytes += value.length;

        // Calculate speed
        const tracker = speedTrackersRef.current.get(id);
        const now = Date.now();
        if (tracker) {
          const timeDiff = (now - tracker.lastTime) / 1000;
          if (timeDiff >= 0.5) { // Update speed every 0.5 seconds
            const bytesDiff = downloadedBytes - tracker.lastBytes;
            const speed = bytesDiff / timeDiff;
            speedTrackersRef.current.set(id, { lastBytes: downloadedBytes, lastTime: now });

            updateDownload(id, {
              downloaded: downloadedBytes,
              progress: totalSize > 0 ? (downloadedBytes / totalSize) * 100 : 0,
              speed,
            });
          } else {
            updateDownload(id, {
              downloaded: downloadedBytes,
              progress: totalSize > 0 ? (downloadedBytes / totalSize) * 100 : 0,
            });
          }
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks);

      updateDownload(id, {
        status: 'completed',
        progress: 100,
        downloaded: downloadedBytes,
        size: downloadedBytes,
        completedAt: Date.now(),
        speed: 0,
        blob,
      });

      controllersRef.current.delete(id);
      speedTrackersRef.current.delete(id);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it was paused or cancelled
        const download = downloads.find(d => d.id === id);
        if (download?.status !== 'paused' && download?.status !== 'cancelled') {
          updateDownload(id, { status: 'cancelled' });
        }
      } else {
        updateDownload(id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Download failed',
        });
      }
      controllersRef.current.delete(id);
      speedTrackersRef.current.delete(id);
    }
  }, [updateDownload, downloads]);

  const pauseDownload = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      updateDownload(id, { status: 'paused', speed: 0 });
      controller.abort();
    }
  }, [updateDownload]);

  const resumeDownload = useCallback((id: string) => {
    const download = downloads.find(d => d.id === id);
    if (download && (download.status === 'paused' || download.status === 'failed')) {
      // For simplicity, restart the download (range requests would need server support)
      updateDownload(id, {
        status: 'pending',
        downloaded: 0,
        progress: 0,
        error: undefined,
      });
      startDownload(id, download.url);
    }
  }, [downloads, startDownload, updateDownload]);

  const cancelDownload = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    updateDownload(id, { status: 'cancelled', speed: 0 });
    controllersRef.current.delete(id);
    speedTrackersRef.current.delete(id);
  }, [updateDownload]);

  const removeDownload = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    controllersRef.current.delete(id);
    speedTrackersRef.current.delete(id);
    setDownloads(prev => prev.filter(d => d.id !== id));
  }, []);

  const retryDownload = useCallback((id: string) => {
    const download = downloads.find(d => d.id === id);
    if (download && (download.status === 'failed' || download.status === 'cancelled')) {
      updateDownload(id, {
        status: 'pending',
        downloaded: 0,
        progress: 0,
        error: undefined,
        startedAt: Date.now(),
      });
      startDownload(id, download.url);
    }
  }, [downloads, startDownload, updateDownload]);

  const saveDownload = useCallback((id: string) => {
    const download = downloads.find(d => d.id === id);
    if (download?.blob) {
      const url = URL.createObjectURL(download.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = download.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [downloads]);

  const clearCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'));
  }, []);

  const clearAll = useCallback(() => {
    // Abort all active downloads
    controllersRef.current.forEach((controller) => {
      controller.abort();
    });
    controllersRef.current.clear();
    speedTrackersRef.current.clear();
    setDownloads([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllersRef.current.forEach((controller) => {
        controller.abort();
      });
    };
  }, []);

  return {
    downloads,
    addDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    retryDownload,
    saveDownload,
    clearCompleted,
    clearAll,
  };
}

// Utility functions
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function estimateTimeRemaining(downloaded: number, total: number, speed: number): string {
  if (speed <= 0 || total <= 0) return '--:--';
  const remaining = total - downloaded;
  const seconds = remaining / speed;
  return formatTime(seconds);
}
