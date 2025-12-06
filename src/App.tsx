import { useState, useEffect, useCallback } from 'react';
import type { Channel, ChannelGroup, PlaylistInfo } from './types';
import { loadPlaylistFromUrl, loadPlaylistFromFile } from './utils/m3uParser';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelList } from './components/ChannelList';
import { SearchBar } from './components/SearchBar';
import { PlaylistLoader } from './components/PlaylistLoader';
import './App.css';

const FAVORITES_KEY = 'televisi-favorites';
const LAST_PLAYLIST_KEY = 'televisi-last-playlist';

function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (savedFavorites) {
      try {
        setFavorites(new Set(JSON.parse(savedFavorites)));
      } catch {
        // Ignore invalid data
      }
    }
  }, []);

  // Save favorites to localStorage when changed
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  const handlePlaylistLoaded = useCallback((playlist: PlaylistInfo) => {
    setChannels(playlist.channels);
    setGroups(playlist.groups);
    setActiveChannel(null);
    setError(null);
  }, []);

  const handleLoadUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const playlist = await loadPlaylistFromUrl(url);
      handlePlaylistLoaded(playlist);
      localStorage.setItem(LAST_PLAYLIST_KEY, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [handlePlaylistLoaded]);

  const handleLoadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const playlist = await loadPlaylistFromFile(file);
      handlePlaylistLoaded(playlist);
      localStorage.removeItem(LAST_PLAYLIST_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [handlePlaylistLoaded]);

  const handleSelectChannel = useCallback((channel: Channel) => {
    setActiveChannel(channel);
  }, []);

  const handleToggleFavorite = useCallback((channel: Channel) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(channel.id)) {
        next.delete(channel.id);
      } else {
        next.add(channel.id);
      }
      return next;
    });
  }, []);

  const handleClearPlaylist = useCallback(() => {
    setChannels([]);
    setGroups([]);
    setActiveChannel(null);
    localStorage.removeItem(LAST_PLAYLIST_KEY);
  }, []);

  // Show playlist loader if no channels loaded
  if (channels.length === 0) {
    return (
      <PlaylistLoader
        onLoadUrl={handleLoadUrl}
        onLoadFile={handleLoadFile}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return (
    <div className="app">
      <aside className={`app__sidebar ${sidebarCollapsed ? 'app__sidebar--collapsed' : ''}`}>
        <div className="app__sidebar-header">
          <div className="app__logo">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 8l7 4-7 4V8z"/>
            </svg>
            <span>Televisi</span>
          </div>
          <button
            className="app__sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed ? (
                <path d="M9 18l6-6-6-6"/>
              ) : (
                <path d="M15 18l-6-6 6-6"/>
              )}
            </svg>
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="app__search">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
            <ChannelList
              channels={channels}
              groups={groups}
              activeChannel={activeChannel}
              favorites={favorites}
              onSelectChannel={handleSelectChannel}
              onToggleFavorite={handleToggleFavorite}
              searchQuery={searchQuery}
            />
            <div className="app__sidebar-footer">
              <button
                className="app__change-playlist"
                onClick={handleClearPlaylist}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Change Playlist
              </button>
            </div>
          </>
        )}
      </aside>

      <main className="app__main">
        <VideoPlayer channel={activeChannel} />
      </main>
    </div>
  );
}

export default App;
