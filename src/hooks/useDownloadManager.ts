import { useState, useCallback, useRef, useEffect } from 'react';
import { downloadLogger } from '../utils/downloadLogger';

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
  retryCount: number; // Number of retry attempts made
}

interface DownloadController {
  abort: () => void;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
}

const STORAGE_KEY = 'televisi-downloads';
const SETTINGS_KEY = 'televisi-download-settings';
const DEFAULT_DELAY_MS = 5000; // 5 second delay between downloads
const DEFAULT_SPEED_LIMIT = 500; // 500 KB/s default speed limit (0 = unlimited)
const MIN_CHUNK_DELAY_MS = 10; // Small minimum delay between chunk reads
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout for initial connection
const MAX_RETRIES = 5; // Number of retry attempts for failed downloads
const RETRY_DELAY_MS = 3000; // Initial delay before retry (doubles each attempt)

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
          retryCount: d.retryCount ?? 0, // Backwards compatibility
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

  // Speed settings (loaded from localStorage)
  const [speedLimitKBps, setSpeedLimitState] = useState<number>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        return settings.speedLimitKBps ?? DEFAULT_SPEED_LIMIT;
      } catch {
        return DEFAULT_SPEED_LIMIT;
      }
    }
    return DEFAULT_SPEED_LIMIT;
  });

  const [delayMs, setDelayMsState] = useState<number>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        return settings.delayMs ?? DEFAULT_DELAY_MS;
      } catch {
        return DEFAULT_DELAY_MS;
      }
    }
    return DEFAULT_DELAY_MS;
  });

  // Refs to hold current values for use in callbacks
  const speedLimitRef = useRef(speedLimitKBps);
  const delayMsRef = useRef(delayMs);

  // Update refs when state changes
  useEffect(() => {
    speedLimitRef.current = speedLimitKBps;
    delayMsRef.current = delayMs;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ speedLimitKBps, delayMs }));
  }, [speedLimitKBps, delayMs]);

  const setSpeedLimit = useCallback((value: number) => {
    setSpeedLimitState(Math.max(0, value));
  }, []);

  const setDelayMs = useCallback((value: number) => {
    setDelayMsState(Math.max(0, value));
  }, []);

  const controllersRef = useRef<Map<string, DownloadController>>(new Map());
  const speedTrackersRef = useRef<Map<string, { lastBytes: number; lastTime: number }>>(new Map());
  const isProcessingRef = useRef(false);
  const activeDownloadIdRef = useRef<string | null>(null); // Track which download is currently active
  const lastDownloadCompletedRef = useRef<number>(0); // Track when the last download completed
  const scheduleNextRef = useRef<(() => void) | null>(null); // Ref to hold schedule function
  const startDownloadRef = useRef<((id: string, url: string) => void) | null>(null); // Ref to hold startDownload

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
      retryCount: 0,
    };

    // Just add to queue statically - no server requests
    setDownloads(prev => [newDownload, ...prev]);

    return id;
  }, []);

  // Add multiple downloads at once (for downloading entire folders/groups)
  const addMultipleDownloads = useCallback((items: { name: string; url: string }[]): string[] => {
    if (items.length === 0) return [];

    const timestamp = Date.now();

    // All items are added as pending - no server requests
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
      retryCount: 0,
    }));

    // Just add to queue statically - no server requests
    setDownloads(prev => [...newDownloads, ...prev]);

    return newDownloads.map(d => d.id);
  }, []);

  // Start processing the queue - call this to begin downloads
  const startQueue = useCallback(() => {
    // Don't start if already processing or if another download is active
    if (isProcessingRef.current || activeDownloadIdRef.current !== null) {
      downloadLogger.debug('Queue start blocked - download already in progress');
      return;
    }

    setDownloads(prev => {
      const nextPending = prev.find(d => d.status === 'pending');
      if (!nextPending) return prev;

      isProcessingRef.current = true;

      const pendingId = nextPending.id;
      const pendingUrl = nextPending.url;
      setTimeout(() => {
        if (startDownloadRef.current) {
          startDownloadRef.current(pendingId, pendingUrl);
        }
      }, 0);

      return prev.map(d =>
        d.id === nextPending.id ? { ...d, status: 'downloading' as DownloadStatus } : d
      );
    });
  }, []);

  const startDownload = useCallback(async (id: string, url: string) => {
    // CRITICAL: Prevent multiple simultaneous downloads
    // Block if ANY download is active (even same ID - prevents React double-calls)
    if (activeDownloadIdRef.current !== null) {
      downloadLogger.warn(`Blocked duplicate download attempt`, {
        blockedId: id,
        activeId: activeDownloadIdRef.current,
        sameId: activeDownloadIdRef.current === id,
      });
      return;
    }

    // Set this as the active download IMMEDIATELY before any async work
    activeDownloadIdRef.current = id;

    const abortController = new AbortController();

    // Get download name synchronously from current state
    let downloadName = 'Unknown';
    const currentDownloads = downloads;
    const currentDownload = currentDownloads.find(d => d.id === id);
    if (currentDownload) {
      downloadName = currentDownload.name;
    }

    downloadLogger.info(`Starting download: ${downloadName}`, {
      url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
      downloadName,
    });

    // Helper to get a user-friendly error message
    const getErrorMessage = (error: unknown): string => {
      if (error instanceof TypeError) {
        // Network errors typically manifest as TypeError in fetch
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          return 'Network error - check your internet connection';
        }
        if (error.message.includes('CORS')) {
          return 'Server blocked request (CORS error)';
        }
        return `Network error: ${error.message}`;
      }
      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          return 'Connection timed out - server not responding';
        }
        return error.message;
      }
      return 'Download failed - unknown error';
    };

    // Helper to check if error is retryable
    const isRetryableError = (error: unknown): boolean => {
      if (error instanceof Error) {
        // Don't retry user-initiated aborts
        if (error.name === 'AbortError') return false;
        // Retry network errors
        if (error instanceof TypeError) return true;
        // Retry timeout errors
        if (error.name === 'TimeoutError') return true;
        // Retry connection lost errors (stream read failures)
        if (error.message.includes('Connection lost')) return true;
        // Retry read timeout errors (stalled connections)
        if (error.message.includes('Read timeout')) return true;
        // Retry server errors (5xx)
        if (error.message.includes('HTTP 5')) return true;
        // Retry "too many requests"
        if (error.message.includes('HTTP 429')) return true;
      }
      return false;
    };

    // Get current retry count
    let currentRetryCount = 0;
    setDownloads(prev => {
      const download = prev.find(d => d.id === id);
      if (download) {
        currentRetryCount = download.retryCount;
      }
      return prev;
    });

    try {
      // Status is already set to 'downloading' by the queue processor

      // Create a timeout for the fetch request
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, FETCH_TIMEOUT_MS);

      let response: Response;
      try {
        downloadLogger.debug(`Connecting to server...`, { downloadName });
        response = await fetch(url, {
          signal: abortController.signal,
        });
        clearTimeout(timeoutId);
        downloadLogger.info(`Server responded: HTTP ${response.status}`, {
          downloadName,
          status: response.status,
          statusText: response.statusText,
          headers: {
            contentLength: response.headers.get('content-length'),
            contentType: response.headers.get('content-type'),
          },
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // Check if it was a timeout
        if (abortController.signal.aborted) {
          downloadLogger.error(`Connection timed out after ${FETCH_TIMEOUT_MS / 1000}s`, { downloadName });
          const timeoutError = new Error('Connection timed out - server not responding');
          timeoutError.name = 'TimeoutError';
          throw timeoutError;
        }
        downloadLogger.error(`Fetch error: ${fetchError instanceof Error ? fetchError.message : 'Unknown'}`, {
          downloadName,
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        });
        throw fetchError;
      }

      if (!response.ok) {
        const statusText = response.statusText || 'Unknown error';
        downloadLogger.error(`HTTP error: ${response.status} ${statusText}`, { downloadName, status: response.status });
        if (response.status === 403) {
          throw new Error('Access denied (403) - URL may have expired');
        } else if (response.status === 404) {
          throw new Error('File not found (404) - content may have been removed');
        } else if (response.status === 429) {
          throw new Error('Too many requests (429) - try again later');
        } else if (response.status >= 500) {
          throw new Error(`Server error (${response.status}) - try again later`);
        }
        throw new Error(`HTTP ${response.status}: ${statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

      downloadLogger.info(`Download started: ${downloadLogger.formatBytes(totalSize)}`, {
        downloadName,
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      });

      updateDownload(id, { size: totalSize, retryCount: 0 }); // Reset retry count on successful connection

      if (!response.body) {
        throw new Error('Response body is not available');
      }

      const reader = response.body.getReader();
      controllersRef.current.set(id, { abort: () => abortController.abort(), reader });
      speedTrackersRef.current.set(id, { lastBytes: 0, lastTime: Date.now() });

      const chunks: BlobPart[] = [];
      let downloadedBytes = 0;
      let consecutiveSlowReads = 0;
      let lastProgressLog = 0; // Track last logged progress percentage
      let chunkCount = 0;
      const startTime = Date.now();
      const SLOW_READ_THRESHOLD_MS = 5000; // Consider a read slow if it takes > 5s
      const READ_TIMEOUT_MS = 60000; // 60 second timeout for each read operation

      // Helper to format bytes for logging
      const formatProgress = (bytes: number, total: number): string => {
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        if (total > 0) {
          const totalMb = (total / (1024 * 1024)).toFixed(2);
          const percent = ((bytes / total) * 100).toFixed(1);
          return `${mb}MB / ${totalMb}MB (${percent}%)`;
        }
        return `${mb}MB`;
      };

      while (true) {
        const readStartTime = Date.now();
        let readResult: ReadableStreamReadResult<Uint8Array>;

        try {
          // Add read timeout to detect stalled connections
          const readPromise = reader.read();
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Read timeout - connection stalled at ${formatProgress(downloadedBytes, totalSize)}`));
            }, READ_TIMEOUT_MS);
          });

          readResult = await Promise.race([readPromise, timeoutPromise]);
        } catch (readError) {
          // Handle stream read errors (connection dropped, stalled, etc.)
          const progress = formatProgress(downloadedBytes, totalSize);
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

          if (readError instanceof Error && readError.message.includes('Read timeout')) {
            downloadLogger.error(`Read timeout - connection stalled`, {
              downloadName,
              progress,
              downloadedBytes,
              totalSize,
              chunkCount,
              elapsedSeconds: elapsedSec,
              lastChunkSize: chunks.length > 0 ? 'unknown' : 0,
            });
            throw readError;
          }

          downloadLogger.error(`Connection lost during download`, {
            downloadName,
            progress,
            downloadedBytes,
            totalSize,
            chunkCount,
            elapsedSeconds: elapsedSec,
            error: readError instanceof Error ? readError.message : String(readError),
            errorType: readError instanceof Error ? readError.constructor.name : typeof readError,
          });
          throw new Error(`Connection lost while downloading (at ${progress})`);
        }

        const { done, value } = readResult;
        const readDuration = Date.now() - readStartTime;

        if (done) break;

        chunks.push(value as BlobPart);
        downloadedBytes += value.length;
        chunkCount++;

        // Log progress every 10%
        if (totalSize > 0) {
          const currentProgress = Math.floor((downloadedBytes / totalSize) * 100);
          if (currentProgress >= lastProgressLog + 10) {
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            const speedMBps = (downloadedBytes / (Date.now() - startTime) * 1000 / (1024 * 1024)).toFixed(2);
            downloadLogger.debug(`Progress: ${currentProgress}%`, {
              downloadName,
              progress: `${currentProgress}%`,
              downloaded: downloadLogger.formatBytes(downloadedBytes),
              total: downloadLogger.formatBytes(totalSize),
              chunkCount,
              elapsedSeconds: elapsedSec,
              averageSpeedMBps: speedMBps,
            });
            lastProgressLog = currentProgress;
          }
        }

        // Track slow reads for adaptive behavior
        if (readDuration > SLOW_READ_THRESHOLD_MS) {
          consecutiveSlowReads++;
          if (consecutiveSlowReads >= 3) {
            // Connection is very slow, might be failing
            downloadLogger.warn(`Connection slow - ${consecutiveSlowReads} slow reads`, {
              downloadName,
              progress: formatProgress(downloadedBytes, totalSize),
              readDurationMs: readDuration,
            });
          }
        } else {
          consecutiveSlowReads = 0;
        }

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

        // Throttle download speed if speed limit is set
        // Only apply delay if we have a speed limit configured
        if (speedLimitRef.current > 0) {
          const targetBytesPerSecond = speedLimitRef.current * 1024;
          const speedBasedDelay = (value.length / targetBytesPerSecond) * 1000;
          const chunkDelay = Math.max(MIN_CHUNK_DELAY_MS, speedBasedDelay);
          await new Promise(resolve => setTimeout(resolve, chunkDelay));
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

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgSpeed = (downloadedBytes / (Date.now() - startTime) * 1000 / (1024 * 1024)).toFixed(2);

      downloadLogger.info(`Download completed: ${downloadName}`, {
        downloadName,
        totalSize: downloadLogger.formatBytes(downloadedBytes),
        totalChunks: chunkCount,
        totalTimeSeconds: totalTime,
        averageSpeedMBps: avgSpeed,
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
      activeDownloadIdRef.current = null; // Clear active download
      isProcessingRef.current = false;
      lastDownloadCompletedRef.current = Date.now();

      // Schedule next download after cooldown
      if (scheduleNextRef.current) {
        scheduleNextRef.current();
      }

    } catch (error) {
      controllersRef.current.delete(id);
      speedTrackersRef.current.delete(id);

      if (error instanceof Error && error.name === 'AbortError') {
        // Check current status using functional update to get fresh state
        setDownloads(prev => {
          const download = prev.find(d => d.id === id);

          // If paused, keep processing ref true so next download waits
          if (download?.status === 'paused') {
            // Don't reset isProcessingRef - user paused, so wait
            // But clear active download so pause works
            activeDownloadIdRef.current = null;
            return prev;
          }

          // If cancelled or unknown, reset processing ref and allow next
          activeDownloadIdRef.current = null;
          isProcessingRef.current = false;
          lastDownloadCompletedRef.current = Date.now();

          // Schedule next download
          if (scheduleNextRef.current) {
            scheduleNextRef.current();
          }

          if (download?.status !== 'cancelled') {
            return prev.map(d => d.id === id ? { ...d, status: 'cancelled' as DownloadStatus } : d);
          }
          return prev;
        });
      } else if (isRetryableError(error) && currentRetryCount < MAX_RETRIES) {
        // Retry with exponential backoff
        const retryDelay = RETRY_DELAY_MS * Math.pow(2, currentRetryCount);
        const errorMsg = getErrorMessage(error);

        downloadLogger.warn(`Retrying download (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`, {
          downloadName,
          error: errorMsg,
          retryDelaySeconds: retryDelay / 1000,
          attempt: currentRetryCount + 1,
          maxRetries: MAX_RETRIES,
        });

        updateDownload(id, {
          error: `${errorMsg} - Retrying in ${retryDelay / 1000}s (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`,
          retryCount: currentRetryCount + 1,
        });

        // Schedule retry
        setTimeout(() => {
          // Check if download was cancelled while waiting for retry
          setDownloads(prev => {
            const download = prev.find(d => d.id === id);
            if (download && download.status === 'downloading') {
              // Still in downloading state, proceed with retry
              downloadLogger.info(`Retrying now...`, { downloadName, attempt: currentRetryCount + 1 });
              if (startDownloadRef.current) {
                startDownloadRef.current(id, url);
              }
            } else {
              // Download was cancelled or status changed, don't retry
              downloadLogger.info(`Retry cancelled - download status changed`, { downloadName });
              isProcessingRef.current = false;
              if (scheduleNextRef.current) {
                scheduleNextRef.current();
              }
            }
            return prev;
          });
        }, retryDelay);

        // Don't reset isProcessingRef - we're still working on this download
      } else {
        // No more retries or non-retryable error
        const errorMsg = getErrorMessage(error);
        const finalError = currentRetryCount >= MAX_RETRIES
          ? `${errorMsg} (failed after ${MAX_RETRIES} retries)`
          : errorMsg;

        downloadLogger.error(`Download failed permanently: ${downloadName}`, {
          downloadName,
          error: finalError,
          retryCount: currentRetryCount,
          maxRetries: MAX_RETRIES,
          wasRetryable: isRetryableError(error),
          originalError: error instanceof Error ? error.message : String(error),
        });

        updateDownload(id, {
          status: 'failed',
          error: finalError,
          speed: 0,
        });
        activeDownloadIdRef.current = null; // Clear active download
        isProcessingRef.current = false;
        lastDownloadCompletedRef.current = Date.now();

        // Schedule next download
        if (scheduleNextRef.current) {
          scheduleNextRef.current();
        }
      }
    }
  }, [updateDownload, downloadFolder, autoSave, saveToFolder, downloads]);

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
          retryCount: 0, // Reset retry count on manual resume
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
          retryCount: 0, // Reset retry count on manual retry
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
    activeDownloadIdRef.current = null;
    isProcessingRef.current = false;
    setDownloads([]);
  }, []);

  // Process next download in queue - called only after a download completes
  const processNextInQueue = useCallback(() => {
    // Don't process next if another download is still active
    if (activeDownloadIdRef.current !== null) {
      downloadLogger.debug('Queue processing blocked - download still active');
      return;
    }

    setDownloads(prev => {
      const nextPending = prev.find(d => d.status === 'pending');
      if (!nextPending) {
        return prev;
      }

      // Mark as downloading and start
      isProcessingRef.current = true;

      // Schedule the actual download start after state update
      const pendingId = nextPending.id;
      const pendingUrl = nextPending.url;
      setTimeout(() => {
        if (startDownloadRef.current) {
          startDownloadRef.current(pendingId, pendingUrl);
        }
      }, 0);

      return prev.map(d =>
        d.id === nextPending.id ? { ...d, status: 'downloading' as DownloadStatus } : d
      );
    });
  }, []);

  // Schedule next download after cooldown - called when a download completes
  const scheduleNextDownload = useCallback(() => {
    const timeSinceLastDownload = Date.now() - lastDownloadCompletedRef.current;
    const cooldownRemaining = delayMsRef.current - timeSinceLastDownload;

    if (cooldownRemaining > 0) {
      setTimeout(() => {
        processNextInQueue();
      }, cooldownRemaining);
    } else {
      processNextInQueue();
    }
  }, [processNextInQueue]);

  // Keep the refs updated with the latest functions
  useEffect(() => {
    scheduleNextRef.current = scheduleNextDownload;
  }, [scheduleNextDownload]);

  useEffect(() => {
    startDownloadRef.current = startDownload;
  }, [startDownload]);

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
    startQueue,
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
    // Speed settings
    speedLimitKBps,
    setSpeedLimit,
    delayMs,
    setDelayMs,
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
