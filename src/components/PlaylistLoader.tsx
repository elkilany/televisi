import { useState, useRef } from 'react';
import './PlaylistLoader.css';

interface PlaylistLoaderProps {
  onLoadUrl: (url: string) => void;
  onLoadFile: (file: File) => void;
  isLoading: boolean;
  error: string | null;
}

export function PlaylistLoader({ onLoadUrl, onLoadFile, isLoading, error }: PlaylistLoaderProps) {
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="playlist-loader">
      <div className="playlist-loader__header">
        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 8l7 4-7 4V8z"/>
        </svg>
        <h1>Televisi</h1>
        <p>Load your M3U playlist to start watching</p>
      </div>

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
          <li>Supports M3U and M3U8 playlist formats</li>
          <li>Works with HLS, DASH, and direct video streams</li>
          <li>Your favorites are saved locally in your browser</li>
        </ul>
      </div>
    </div>
  );
}
