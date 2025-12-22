import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Channel, ChannelGroup, PlaylistInfo, ContentType } from './types';
import type { XtreamCredentials, XtreamFullPlaylist } from './utils/xtreamApi';
import { loadPlaylistFromUrl, loadPlaylistFromFile } from './utils/m3uParser';
import { loadFullPlaylistFromXtream, loadSeriesEpisodes, saveXtreamCredentials, clearXtreamCredentials, loadXtreamCredentials } from './utils/xtreamApi';
import { useDownloadManager } from './hooks/useDownloadManager';
import { useDebounce } from './hooks/useDebounce';
import { useKeepAlive } from './hooks/useKeepAlive';
import { VideoPlayer } from './components/VideoPlayer';
import { ChannelList } from './components/ChannelList';
import { SearchBar } from './components/SearchBar';
import { PlaylistLoader } from './components/PlaylistLoader';
import { ContentTypeSelector } from './components/ContentTypeSelector';
import { DownloadManager } from './components/DownloadManager';
import './App.css';

const FAVORITES_KEY = 'televisi-favorites';
const LAST_PLAYLIST_KEY = 'televisi-last-playlist';

function App() {
  // Keep session alive
  useKeepAlive(30000); // Keep alive every 30 seconds

  // Content state
  const [fullPlaylist, setFullPlaylist] = useState<XtreamFullPlaylist | null>(null);
  const [m3uPlaylist, setM3uPlaylist] = useState<PlaylistInfo | null>(null);
  const [activeContentType, setActiveContentType] = useState<ContentType>('live');
  const [seriesEpisodes, setSeriesEpisodes] = useState<Channel[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Channel | null>(null);

  // UI state
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDownloadManager, setShowDownloadManager] = useState(false);

  // Download manager
  const {
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
    folderName,
    selectDownloadFolder,
    clearDownloadFolder,
    autoSave,
    setAutoSave,
    speedLimitKBps,
    setSpeedLimit,
    delayMs,
    setDelayMs,
  } = useDownloadManager();

  // Count active downloads
  const activeDownloadsCount = downloads.filter(d =>
    ['pending', 'downloading', 'paused'].includes(d.status)
  ).length;

  // Get current playlist based on content type and source
  const currentPlaylist = useMemo((): PlaylistInfo => {
    // If viewing series episodes
    if (selectedSeries && seriesEpisodes.length > 0) {
      const groups: ChannelGroup[] = [];
      const groupsMap = new Map<string, Channel[]>();

      seriesEpisodes.forEach(ep => {
        const groupName = ep.group || 'Episodes';
        if (!groupsMap.has(groupName)) {
          groupsMap.set(groupName, []);
        }
        groupsMap.get(groupName)!.push(ep);
      });

      groupsMap.forEach((channels, name) => {
        groups.push({ name, channels });
      });

      return { channels: seriesEpisodes, groups };
    }

    // If M3U playlist loaded
    if (m3uPlaylist) {
      return m3uPlaylist;
    }

    // If Xtream playlist loaded
    if (fullPlaylist) {
      switch (activeContentType) {
        case 'live':
          return fullPlaylist.live;
        case 'movies':
          return fullPlaylist.movies;
        case 'series':
          return fullPlaylist.series;
        default:
          return fullPlaylist.live;
      }
    }

    return { channels: [], groups: [] };
  }, [fullPlaylist, m3uPlaylist, activeContentType, selectedSeries, seriesEpisodes]);

  // Content counts for selector
  const contentCounts = useMemo(() => {
    if (fullPlaylist) {
      return {
        live: fullPlaylist.live.channels.length,
        movies: fullPlaylist.movies.channels.length,
        series: fullPlaylist.series.channels.length,
      };
    }
    if (m3uPlaylist) {
      return {
        live: m3uPlaylist.channels.length,
        movies: 0,
        series: 0,
      };
    }
    return { live: 0, movies: 0, series: 0 };
  }, [fullPlaylist, m3uPlaylist]);

  const isXtreamMode = fullPlaylist !== null;
  const hasContent = currentPlaylist.channels.length > 0 || (fullPlaylist !== null) || (m3uPlaylist !== null);

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

  const handleLoadUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const playlist = await loadPlaylistFromUrl(url);
      setM3uPlaylist(playlist);
      setFullPlaylist(null);
      setActiveChannel(null);
      setActiveContentType('live');
      localStorage.setItem(LAST_PLAYLIST_KEY, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoadFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const playlist = await loadPlaylistFromFile(file);
      setM3uPlaylist(playlist);
      setFullPlaylist(null);
      setActiveChannel(null);
      setActiveContentType('live');
      localStorage.removeItem(LAST_PLAYLIST_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoadXtream = useCallback(async (credentials: XtreamCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const playlist = await loadFullPlaylistFromXtream(credentials);
      setFullPlaylist(playlist);
      setM3uPlaylist(null);
      setActiveChannel(null);
      setActiveContentType('live');
      saveXtreamCredentials(credentials);
      localStorage.removeItem(LAST_PLAYLIST_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectChannel = useCallback(async (channel: Channel) => {
    // If selecting a series, load its episodes
    if (channel.contentType === 'series' && channel.seriesId && !channel.url) {
      const credentials = loadXtreamCredentials();
      if (credentials) {
        setIsLoading(true);
        try {
          const episodes = await loadSeriesEpisodes(credentials, channel.seriesId);
          setSeriesEpisodes(episodes);
          setSelectedSeries(channel);
          setActiveChannel(null);
        } catch (err) {
          setError('Failed to load episodes');
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      setActiveChannel(channel);
    }
  }, []);

  const handleBackFromSeries = useCallback(() => {
    setSelectedSeries(null);
    setSeriesEpisodes([]);
    setActiveChannel(null);
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

  const handleContentTypeChange = useCallback((type: ContentType) => {
    setActiveContentType(type);
    setActiveChannel(null);
    setSelectedSeries(null);
    setSeriesEpisodes([]);
    setSearchQuery('');
  }, []);

  const handleClearPlaylist = useCallback(() => {
    setFullPlaylist(null);
    setM3uPlaylist(null);
    setActiveChannel(null);
    setSelectedSeries(null);
    setSeriesEpisodes([]);
    localStorage.removeItem(LAST_PLAYLIST_KEY);
    clearXtreamCredentials();
  }, []);

  const handleDownload = useCallback((name: string, url: string) => {
    addDownload(name, url);
    startQueue(); // Start processing the queue
    setShowDownloadManager(true);
  }, [addDownload, startQueue]);

  const handleDownloadAll = useCallback((channels: Channel[]) => {
    const items = channels.map(channel => ({
      name: `${channel.name}${channel.containerExtension ? `.${channel.containerExtension}` : ''}`,
      url: channel.downloadUrl || channel.url,
    }));

    if (items.length > 0) {
      addMultipleDownloads(items);
      startQueue(); // Start processing the queue
      setShowDownloadManager(true);
    }
  }, [addMultipleDownloads, startQueue]);

  // Show playlist loader if no content loaded
  if (!hasContent) {
    return (
      <PlaylistLoader
        onLoadUrl={handleLoadUrl}
        onLoadFile={handleLoadFile}
        onLoadXtream={handleLoadXtream}
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
          <div className="app__header-actions">
            <button
              className={`app__downloads-btn ${activeDownloadsCount > 0 ? 'active' : ''}`}
              onClick={() => setShowDownloadManager(true)}
              title="Downloads"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              {activeDownloadsCount > 0 && (
                <span className="app__downloads-badge">{activeDownloadsCount}</span>
              )}
            </button>
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
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Content type selector for Xtream mode */}
            {isXtreamMode && !selectedSeries && (
              <div className="app__content-type">
                <ContentTypeSelector
                  activeType={activeContentType}
                  onChange={handleContentTypeChange}
                  counts={contentCounts}
                />
              </div>
            )}

            {/* Back button when viewing series episodes */}
            {selectedSeries && (
              <div className="app__series-header">
                <button
                  className="app__back-btn"
                  onClick={handleBackFromSeries}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  Back to Series
                </button>
                <div className="app__series-title">
                  {selectedSeries.logo && (
                    <img src={selectedSeries.logo} alt={selectedSeries.name} />
                  )}
                  <span>{selectedSeries.name}</span>
                </div>
              </div>
            )}

            <div className="app__search">
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>

            <ChannelList
              channels={currentPlaylist.channels}
              groups={currentPlaylist.groups}
              activeChannel={activeChannel}
              favorites={favorites}
              onSelectChannel={handleSelectChannel}
              onToggleFavorite={handleToggleFavorite}
              onDownloadAll={handleDownloadAll}
              searchQuery={debouncedSearchQuery}
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
        <VideoPlayer channel={activeChannel} onDownload={handleDownload} />
      </main>

      {/* Download Manager Modal */}
      {showDownloadManager && (
        <>
          <div className="download-manager-overlay" onClick={() => setShowDownloadManager(false)} />
          <DownloadManager
            downloads={downloads}
            onPause={pauseDownload}
            onResume={resumeDownload}
            onCancel={cancelDownload}
            onRemove={removeDownload}
            onRetry={retryDownload}
            onSave={saveDownload}
            onClearCompleted={clearCompleted}
            onClearAll={clearAll}
            onClose={() => setShowDownloadManager(false)}
            folderName={folderName}
            onSelectFolder={selectDownloadFolder}
            onClearFolder={clearDownloadFolder}
            autoSave={autoSave}
            onAutoSaveChange={setAutoSave}
            speedLimitKBps={speedLimitKBps}
            onSpeedLimitChange={setSpeedLimit}
            delayMs={delayMs}
            onDelayMsChange={setDelayMs}
          />
        </>
      )}
    </div>
  );
}

export default App;
