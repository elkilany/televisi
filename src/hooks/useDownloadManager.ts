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
  savedToFolder?: boolean;
}

interface DownloadController {
  abort: () => void;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
}

const STORAGE_KEY = 'televisi-downloads';
const DOWNLOAD_DELAY_MS = 3000; // 3 second delay between downloads to avoid server rate limiting

// File System Access API types
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

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

  const [downloadFolder, setDownloadFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(true);

  const controllersRef = useRef<Map<string, DownloadController>>(new Map());
  const speedTrackersRef = useRef<Map<string, { lastBytes: number; lastTime: number }>>(new Map());
  const isProcessingRef = useRef(false);
  const lastDownloadCompletedRef = useRef<number>(0); // Track when the last download completed

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

  // Select download folder using File System Access API
  const selectDownloadFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support folder selection. Please use Chrome or Edge.');
      return false;
    }

    try {
      const handle = await window.showDirectoryPicker();
      setDownloadFolder(handle);
      setFolderName(handle.name);
      return true;
    } catch (error) {
      // User cancelled or error
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to select folder:', error);
      }
      return false;
    }
  }, []);

  // Clear download folder
  const clearDownloadFolder = useCallback(() => {
    setDownloadFolder(null);
    setFolderName(null);
  }, []);

  // Save blob directly to the selected folder
  const saveToFolder = useCallback(async (name: string, blob: Blob): Promise<boolean> => {
    if (!downloadFolder) return false;

    try {
      // Sanitize filename
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
      const fileHandle = await downloadFolder.getFileHandle(safeName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      console.error('Failed to save to folder:', error);
      // Permission might have been revoked
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setDownloadFolder(null);
        setFolderName(null);
      }
      return false;
    }
  }, [downloadFolder]);

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
      savedToFolder: false,
    };

    setDownloads(prev => [newDownload, ...prev]);

    // Don't start immediately - the queue processor will handle it

    return id;
  }, []);

  // Add multiple downloads at once (for downloading entire folders/groups)
  const addMultipleDownloads = useCallback((items: { name: string; url: string }[]): string[] => {
    const timestamp = Date.now();
    const newDownloads: DownloadItem[] = items.map((item, index) => ({
      id: `download-${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      name: item.name,
      url: item.url,
      size: 0,
      downloaded: 0,
      progress: 0,
      status: 'pending' as DownloadStatus,
      startedAt: timestamp,
      speed: 0,
      savedToFolder: false,
    }));

    setDownloads(prev => [...newDownloads, ...prev]);

    // Return all IDs
    return newDownloads.map(d => d.id);
  }, []);

  const startDownload = useCallback(async (id: string, url: string) => {
    const abortController = new AbortController();

    try {
      // Status is already set to 'downloading' by the queue processor

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

      // Get download name for auto-save
      setDownloads(prev => {
        const download = prev.find(d => d.id === id);
        if (download && downloadFolder && autoSave) {
          // Auto-save to folder
          saveToFolder(download.name, blob).then(saved => {
            if (saved) {
              updateDownload(id, { savedToFolder: true });
            }
          });
        }
        return prev;
      });

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
      isProcessingRef.current = false;
      lastDownloadCompletedRef.current = Date.now(); // Track completion time for cooldown

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it was paused or cancelled
        setDownloads(prev => {
          const download = prev.find(d => d.id === id);
          if (download?.status !== 'paused' && download?.status !== 'cancelled') {
            return prev.map(d => d.id === id ? { ...d, status: 'cancelled' as DownloadStatus } : d);
          }
          return prev;
        });
      } else {
        updateDownload(id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Download failed',
        });
      }
      controllersRef.current.delete(id);
      speedTrackersRef.current.delete(id);
      isProcessingRef.current = false;
    }
  }, [updateDownload, downloadFolder, autoSave, saveToFolder]);

  const pauseDownload = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      updateDownload(id, { status: 'paused', speed: 0 });
      controller.abort();
    }
  }, [updateDownload]);

  const resumeDownload = useCallback((id: string) => {
    setDownloads(prev => {
      const download = prev.find(d => d.id === id);
      if (download && (download.status === 'paused' || download.status === 'failed')) {
        // For simplicity, restart the download (range requests would need server support)
        // Just set to pending - queue processor will start it
        return prev.map(d => d.id === id ? {
          ...d,
          status: 'pending' as DownloadStatus,
          downloaded: 0,
          progress: 0,
          error: undefined,
        } : d);
      }
      return prev;
    });
  }, []);

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
    setDownloads(prev => {
      const download = prev.find(d => d.id === id);
      if (download && (download.status === 'failed' || download.status === 'cancelled')) {
        // Just set to pending - queue processor will start it
        return prev.map(d => d.id === id ? {
          ...d,
          status: 'pending' as DownloadStatus,
          downloaded: 0,
          progress: 0,
          error: undefined,
          startedAt: Date.now(),
        } : d);
      }
      return prev;
    });
  }, []);

  const saveDownload = useCallback(async (id: string) => {
    const download = downloads.find(d => d.id === id);
    if (!download?.blob) return;

    // Try to save to folder first
    if (downloadFolder) {
      const saved = await saveToFolder(download.name, download.blob);
      if (saved) {
        updateDownload(id, { savedToFolder: true });
        return;
      }
    }

    // Fallback to browser download
    const url = URL.createObjectURL(download.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = download.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [downloads, downloadFolder, saveToFolder, updateDownload]);

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
    isProcessingRef.current = false;
    setDownloads([]);
  }, []);

  // Sequential queue processor - start next pending download when no download is active
  useEffect(() => {
    // Prevent multiple simultaneous processing
    if (isProcessingRef.current) return;

    const hasActiveDownload = downloads.some(d => d.status === 'downloading');
    if (hasActiveDownload) return;

    const nextPending = downloads.find(d => d.status === 'pending');
    if (!nextPending) return;

    // Check cooldown
    const timeSinceLastDownload = Date.now() - lastDownloadCompletedRef.current;
    const cooldownRemaining = DOWNLOAD_DELAY_MS - timeSinceLastDownload;

    if (cooldownRemaining > 0 && lastDownloadCompletedRef.current > 0) {
      // Wait for cooldown
      const timeout = setTimeout(() => {
        // Trigger re-evaluation
        setDownloads(prev => [...prev]);
      }, cooldownRemaining + 100);

      return () => clearTimeout(timeout);
    }

    // Mark as processing to prevent race conditions
    isProcessingRef.current = true;

    // Update status and start download
    setDownloads(prev =>
      prev.map(d =>
        d.id === nextPending.id ? { ...d, status: 'downloading' as DownloadStatus } : d
      )
    );

    startDownload(nextPending.id, nextPending.url);
  }, [downloads, startDownload]);

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
    addMultipleDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    retryDownload,
    saveDownload,
    clearCompleted,
    clearAll,
    // Folder management
    downloadFolder,
    folderName,
    selectDownloadFolder,
    clearDownloadFolder,
    autoSave,
    setAutoSave,
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
