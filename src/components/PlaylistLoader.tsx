import { useState, useRef } from 'react';
import type { XtreamCredentials } from '../utils/xtreamApi';
import { loadXtreamCredentials } from '../utils/xtreamApi';
import './PlaylistLoader.css';

type LoaderTab = 'm3u' | 'xtream';

interface PlaylistLoaderProps {
  onLoadUrl: (url: string) => void;
  onLoadFile: (file: File) => void;
  onLoadXtream: (credentials: XtreamCredentials) => void;
  isLoading: boolean;
  error: string | null;
}

export function PlaylistLoader({ onLoadUrl, onLoadFile, onLoadXtream, isLoading, error }: PlaylistLoaderProps) {
  const [activeTab, setActiveTab] = useState<LoaderTab>('m3u');
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Xtream credentials state
  const savedCredentials = loadXtreamCredentials();
  const [server, setServer] = useState(savedCredentials?.server || 'http://cname.dino.ws');
  const [username, setUsername] = useState(savedCredentials?.username || '24cb5abe89');
  const [password, setPassword] = useState(savedCredentials?.password || '702a4052216d');

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLoadUrl(url.trim());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadFile(file);
    }
  };

  const handleXtreamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (server.trim() && username.trim() && password.trim()) {
      onLoadXtream({
        server: server.trim(),
        username: username.trim(),
        password: password.trim(),
      });
    }
  };

  return (
    <div className="playlist-loader">
      <div className="playlist-loader__header">
        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 8l7 4-7 4V8z"/>
        </svg>
        <h1>Televisi</h1>
        <p>Load your playlist to start watching</p>
      </div>

      <div className="playlist-loader__tabs">
        <button
          className={`playlist-loader__tab ${activeTab === 'm3u' ? 'active' : ''}`}
          onClick={() => setActiveTab('m3u')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          M3U Playlist
        </button>
        <button
          className={`playlist-loader__tab ${activeTab === 'xtream' ? 'active' : ''}`}
          onClick={() => setActiveTab('xtream')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          Xtream Login
        </button>
      </div>

      {activeTab === 'm3u' ? (
        <form className="playlist-loader__form" onSubmit={handleUrlSubmit}>
          <div className="playlist-loader__input-group">
            <input
              type="url"
              className="playlist-loader__input"
              placeholder="Enter M3U playlist URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="playlist-loader__btn playlist-loader__btn--primary"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? 'Loading...' : 'Load URL'}
            </button>
          </div>

          <div className="playlist-loader__divider">
            <span>or</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept=".m3u,.m3u8"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="playlist-loader__btn playlist-loader__btn--secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            Upload M3U File
          </button>
        </form>
      ) : (
        <form className="playlist-loader__form" onSubmit={handleXtreamSubmit}>
          <div className="playlist-loader__field">
            <label className="playlist-loader__label">Server URL</label>
            <input
              type="text"
              className="playlist-loader__input"
              placeholder="http://example.com:8080"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="playlist-loader__field">
            <label className="playlist-loader__label">Username</label>
            <input
              type="text"
              className="playlist-loader__input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="playlist-loader__field">
            <label className="playlist-loader__label">Password</label>
            <input
              type="password"
              className="playlist-loader__input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="playlist-loader__btn playlist-loader__btn--primary playlist-loader__btn--full"
            disabled={isLoading || !server.trim() || !username.trim() || !password.trim()}
          >
            {isLoading ? (
              <>
                <svg className="playlist-loader__spinner" viewBox="0 0 24 24" width="20" height="20">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                </svg>
                Connect
              </>
            )}
          </button>
        </form>
      )}

      {error && (
        <div className="playlist-loader__error">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          {error}
        </div>
      )}

      <div className="playlist-loader__tips">
        <h3>Tips</h3>
        <ul>
          {activeTab === 'm3u' ? (
            <>
              <li>Supports M3U and M3U8 playlist formats</li>
              <li>Works with HLS, DASH, and direct video streams</li>
              <li>Your favorites are saved locally in your browser</li>
            </>
          ) : (
            <>
              <li>Enter your Xtream Codes server details</li>
              <li>Credentials are saved locally for convenience</li>
              <li>Supports live TV streams from your provider</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
