import { useState } from 'react';
import type { DownloadItem, DownloadStatus } from '../hooks/useDownloadManager';
import { formatBytes, formatSpeed, estimateTimeRemaining } from '../hooks/useDownloadManager';
import { useDownloadLogger } from '../hooks/useDownloadLogger';
import './DownloadManager.css';

interface DownloadManagerProps {
  downloads: DownloadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onSave: (id: string) => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  onClose: () => void;
  // Folder management
  folderName: string | null;
  onSelectFolder: () => void;
  onClearFolder: () => void;
  autoSave: boolean;
  onAutoSaveChange: (enabled: boolean) => void;
  // Speed settings
  speedLimitKBps: number;
  onSpeedLimitChange: (value: number) => void;
  delayMs: number;
  onDelayMsChange: (value: number) => void;
}

function getStatusIcon(status: DownloadStatus) {
  switch (status) {
    case 'pending':
      return (
        <svg className="status-icon pending" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
      );
    case 'downloading':
      return (
        <svg className="status-icon downloading" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      );
    case 'paused':
      return (
        <svg className="status-icon paused" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      );
    case 'completed':
      return (
        <svg className="status-icon completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22,4 12,14.01 9,11.01" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="status-icon failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'cancelled':
      return (
        <svg className="status-icon cancelled" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
    default:
      return null;
  }
}

export function DownloadManager({
  downloads,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onRetry,
  onSave,
  onClearCompleted,
  onClearAll,
  onClose,
  folderName,
  onSelectFolder,
  onClearFolder,
  autoSave,
  onAutoSaveChange,
  speedLimitKBps,
  onSpeedLimitChange,
  delayMs,
  onDelayMsChange,
}: DownloadManagerProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const { logs, clearLogs, copyLogsToClipboard } = useDownloadLogger();

  const filteredDownloads = downloads.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'downloading', 'paused'].includes(d.status);
    if (filter === 'completed') return d.status === 'completed';
    return true;
  });

  const activeCount = downloads.filter(d => ['pending', 'downloading', 'paused'].includes(d.status)).length;
  const completedCount = downloads.filter(d => d.status === 'completed').length;

  return (
    <div className="download-manager">
      <div className="download-manager__header">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Downloads
        </h2>
        <button className="download-manager__close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Folder Selection */}
      <div className="download-manager__folder">
        <div className="download-manager__folder-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          {folderName ? (
            <span className="download-manager__folder-name">{folderName}</span>
          ) : (
            <span className="download-manager__folder-none">No folder selected</span>
          )}
        </div>
        <div className="download-manager__folder-actions">
          {folderName ? (
            <>
              <label className="download-manager__autosave">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => onAutoSaveChange(e.target.checked)}
                />
                Auto-save
              </label>
              <button className="download-manager__folder-btn" onClick={onClearFolder}>
                Clear
              </button>
            </>
          ) : (
            <button className="download-manager__folder-btn download-manager__folder-btn--primary" onClick={onSelectFolder}>
              Select Folder
            </button>
          )}
        </div>
      </div>

      {/* Speed Settings */}
      <div className="download-manager__speed">
        <div className="download-manager__speed-item">
          <label>Speed limit (KB/s):</label>
          <input
            type="number"
            min="0"
            max="10000"
            step="50"
            value={speedLimitKBps}
            onChange={(e) => onSpeedLimitChange(Number(e.target.value))}
            placeholder="0 = unlimited"
          />
        </div>
        <div className="download-manager__speed-item">
          <label>Delay between (s):</label>
          <input
            type="number"
            min="0"
            max="60"
            step="1"
            value={Math.round(delayMs / 1000)}
            onChange={(e) => onDelayMsChange(Number(e.target.value) * 1000)}
          />
        </div>
      </div>

      <div className="download-manager__filters">
        <button
          className={`download-manager__filter ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({downloads.length})
        </button>
        <button
          className={`download-manager__filter ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active ({activeCount})
        </button>
        <button
          className={`download-manager__filter ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          Completed ({completedCount})
        </button>
      </div>

      <div className="download-manager__list">
        {filteredDownloads.length === 0 ? (
          <div className="download-manager__empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <p>No downloads yet</p>
          </div>
        ) : (
          filteredDownloads.map(download => (
            <div key={download.id} className={`download-item download-item--${download.status}`}>
              <div className="download-item__icon">
                {getStatusIcon(download.status)}
              </div>

              <div className="download-item__info">
                <div className="download-item__name" title={download.name}>
                  {download.name}
                  {download.savedToFolder && (
                    <span className="download-item__saved" title="Saved to folder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22,4 12,14.01 9,11.01" />
                      </svg>
                    </span>
                  )}
                </div>

                <div className="download-item__details">
                  {download.status === 'downloading' && (
                    <>
                      <span>{formatBytes(download.downloaded)} / {download.size > 0 ? formatBytes(download.size) : 'Unknown'}</span>
                      <span className="download-item__speed">{formatSpeed(download.speed)}</span>
                      {download.size > 0 && (
                        <span className="download-item__eta">
                          ETA: {estimateTimeRemaining(download.downloaded, download.size, download.speed)}
                        </span>
                      )}
                    </>
                  )}

                  {download.status === 'completed' && (
                    <span>
                      {formatBytes(download.size)}
                      {download.savedToFolder && ' - Saved to folder'}
                    </span>
                  )}

                  {download.status === 'paused' && (
                    <span>{formatBytes(download.downloaded)} / {download.size > 0 ? formatBytes(download.size) : 'Unknown'} - Paused</span>
                  )}

                  {download.status === 'failed' && (
                    <span className="download-item__error">{download.error || 'Download failed'}</span>
                  )}

                  {download.status === 'cancelled' && (
                    <span>Cancelled</span>
                  )}

                  {download.status === 'pending' && (
                    <span>Waiting...</span>
                  )}
                </div>

                {(download.status === 'downloading' || download.status === 'paused') && (
                  <div className="download-item__progress">
                    <div
                      className="download-item__progress-bar"
                      style={{ width: `${download.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="download-item__actions">
                {download.status === 'downloading' && (
                  <button
                    className="download-item__btn"
                    onClick={() => onPause(download.id)}
                    title="Pause"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  </button>
                )}

                {download.status === 'paused' && (
                  <button
                    className="download-item__btn"
                    onClick={() => onResume(download.id)}
                    title="Resume"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </button>
                )}

                {(download.status === 'downloading' || download.status === 'paused' || download.status === 'pending') && (
                  <button
                    className="download-item__btn download-item__btn--danger"
                    onClick={() => onCancel(download.id)}
                    title="Cancel"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}

                {download.status === 'completed' && !download.savedToFolder && (
                  <button
                    className="download-item__btn download-item__btn--primary"
                    onClick={() => onSave(download.id)}
                    title="Save to device"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                )}

                {(download.status === 'failed' || download.status === 'cancelled') && (
                  <button
                    className="download-item__btn"
                    onClick={() => onRetry(download.id)}
                    title="Retry"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polyline points="23,4 23,10 17,10" />
                      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                    </svg>
                  </button>
                )}

                <button
                  className="download-item__btn download-item__btn--danger"
                  onClick={() => onRemove(download.id)}
                  title="Remove"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <polyline points="3,6 5,6 21,6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Debug Logs Panel */}
      <div className="download-manager__debug">
        <button
          className={`download-manager__debug-toggle ${showDebugLogs ? 'active' : ''}`}
          onClick={() => setShowDebugLogs(!showDebugLogs)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Debug Logs ({logs.length})
        </button>

        {showDebugLogs && (
          <div className="download-manager__debug-panel">
            <div className="download-manager__debug-actions">
              <button
                onClick={async () => {
                  await copyLogsToClipboard();
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 2000);
                }}
                title="Copy logs to clipboard"
              >
                {copyFeedback ? 'Copied!' : 'Copy Logs'}
              </button>
              <button onClick={clearLogs} title="Clear all logs">
                Clear
              </button>
            </div>
            <div className="download-manager__debug-logs">
              {logs.length === 0 ? (
                <div className="download-manager__debug-empty">No logs yet</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={`download-manager__debug-log download-manager__debug-log--${log.level}`}>
                    <span className="download-manager__debug-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`download-manager__debug-level download-manager__debug-level--${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="download-manager__debug-msg">{log.message}</span>
                    {log.data && (
                      <details className="download-manager__debug-data">
                        <summary>Data</summary>
                        <pre>{JSON.stringify(log.data, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {downloads.length > 0 && (
        <div className="download-manager__footer">
          {completedCount > 0 && (
            <button className="download-manager__action" onClick={onClearCompleted}>
              Clear Completed
            </button>
          )}
          <button className="download-manager__action download-manager__action--danger" onClick={onClearAll}>
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
