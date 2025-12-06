import type { Channel, ChannelGroup, PlaylistInfo, ContentType } from '../types';

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

interface XtreamUserInfo {
  username: string;
  password: string;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
}

interface XtreamServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
}

interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface XtreamLiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

interface XtreamVodStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}

interface XtreamSeries {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

interface XtreamSeriesInfo {
  seasons: { [key: string]: XtreamEpisode[] };
  info: {
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    rating: string;
  };
  episodes: { [key: string]: XtreamEpisode[] };
}

interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image?: string;
    plot?: string;
    releasedate?: string;
    duration_secs?: number;
  };
  custom_sid: string;
  added: string;
  season: number;
  direct_source: string;
}

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
}

export interface XtreamFullPlaylist {
  live: PlaylistInfo;
  movies: PlaylistInfo;
  series: PlaylistInfo;
}

/**
 * Normalize server URL (remove trailing slash, ensure protocol)
 */
function normalizeServerUrl(server: string): string {
  let url = server.trim();

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }

  // Remove trailing slash
  url = url.replace(/\/+$/, '');

  return url;
}

/**
 * Authenticate with Xtream Codes server
 */
export async function authenticateXtream(credentials: XtreamCredentials): Promise<XtreamAuthResponse> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.user_info) {
    throw new Error('Invalid server response');
  }

  if (data.user_info.status !== 'Active') {
    throw new Error(`Account status: ${data.user_info.status}`);
  }

  return data;
}

/**
 * Generic function to fetch categories
 */
async function getCategories(credentials: XtreamCredentials, action: string): Promise<XtreamCategory[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=${action}`;

  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Get live TV streams from Xtream server
 */
async function getLiveStreams(credentials: XtreamCredentials): Promise<XtreamLiveStream[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_live_streams`;

  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Get VOD (movies) streams from Xtream server
 */
async function getVodStreams(credentials: XtreamCredentials): Promise<XtreamVodStream[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_vod_streams`;

  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Get series list from Xtream server
 */
async function getSeriesList(credentials: XtreamCredentials): Promise<XtreamSeries[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_series`;

  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Get series info (episodes) from Xtream server
 */
export async function getSeriesInfo(credentials: XtreamCredentials, seriesId: number): Promise<XtreamSeriesInfo | null> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_series_info&series_id=${seriesId}`;

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Convert streams to channels with grouping
 */
function processChannels(
  channels: Channel[],
  categoryMap: Map<string, string>
): { channels: Channel[]; groups: ChannelGroup[] } {
  // Update group names from category map
  channels.forEach(channel => {
    if (channel.group && categoryMap.has(channel.group)) {
      channel.group = categoryMap.get(channel.group);
    }
  });

  // Group channels by category
  const groupsMap = new Map<string, Channel[]>();
  channels.forEach(channel => {
    const groupName = channel.group || 'Uncategorized';
    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }
    groupsMap.get(groupName)!.push(channel);
  });

  const groups: ChannelGroup[] = Array.from(groupsMap.entries()).map(([name, channels]) => ({
    name,
    channels,
  }));

  return { channels, groups };
}

/**
 * Load full playlist from Xtream Codes server (Live, Movies, Series)
 */
export async function loadFullPlaylistFromXtream(credentials: XtreamCredentials): Promise<XtreamFullPlaylist> {
  const server = normalizeServerUrl(credentials.server);

  // Fetch all categories and streams in parallel
  const [
    liveCategories,
    vodCategories,
    seriesCategories,
    liveStreams,
    vodStreams,
    seriesList,
  ] = await Promise.all([
    getCategories(credentials, 'get_live_categories'),
    getCategories(credentials, 'get_vod_categories'),
    getCategories(credentials, 'get_series_categories'),
    getLiveStreams(credentials),
    getVodStreams(credentials),
    getSeriesList(credentials),
  ]);

  // Create category lookup maps
  const liveCategoryMap = new Map<string, string>();
  liveCategories.forEach(cat => liveCategoryMap.set(cat.category_id, cat.category_name));

  const vodCategoryMap = new Map<string, string>();
  vodCategories.forEach(cat => vodCategoryMap.set(cat.category_id, cat.category_name));

  const seriesCategoryMap = new Map<string, string>();
  seriesCategories.forEach(cat => seriesCategoryMap.set(cat.category_id, cat.category_name));

  // Convert live streams to channels
  const liveChannels: Channel[] = liveStreams.map((stream) => {
    const streamUrl = `${server}/live/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${stream.stream_id}.m3u8`;

    return {
      id: `live-${stream.stream_id}`,
      name: stream.name,
      url: streamUrl,
      logo: stream.stream_icon || undefined,
      group: stream.category_id,
      tvgId: stream.epg_channel_id || undefined,
      tvgName: stream.name,
      contentType: 'live' as ContentType,
    };
  });

  // Convert VOD streams to channels
  const movieChannels: Channel[] = vodStreams.map((stream) => {
    const ext = stream.container_extension || 'mp4';
    const streamUrl = `${server}/movie/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${stream.stream_id}.${ext}`;
    const downloadUrl = streamUrl; // Same URL can be used for download

    return {
      id: `movie-${stream.stream_id}`,
      name: stream.name,
      url: streamUrl,
      logo: stream.stream_icon || undefined,
      group: stream.category_id,
      contentType: 'movies' as ContentType,
      containerExtension: ext,
      downloadUrl,
    };
  });

  // Convert series to channels (each series as an entry, episodes loaded on demand)
  const seriesChannels: Channel[] = seriesList.map((series) => {
    return {
      id: `series-${series.series_id}`,
      name: series.name,
      url: '', // Series don't have direct URLs, episodes do
      logo: series.cover || undefined,
      group: series.category_id,
      contentType: 'series' as ContentType,
      seriesId: series.series_id,
    };
  });

  // Process and group channels
  const live = processChannels(liveChannels, liveCategoryMap);
  const movies = processChannels(movieChannels, vodCategoryMap);
  const series = processChannels(seriesChannels, seriesCategoryMap);

  return {
    live: { channels: live.channels, groups: live.groups },
    movies: { channels: movies.channels, groups: movies.groups },
    series: { channels: series.channels, groups: series.groups },
  };
}

/**
 * Load series episodes
 */
export async function loadSeriesEpisodes(credentials: XtreamCredentials, seriesId: number): Promise<Channel[]> {
  const server = normalizeServerUrl(credentials.server);
  const seriesInfo = await getSeriesInfo(credentials, seriesId);

  if (!seriesInfo || !seriesInfo.episodes) {
    return [];
  }

  const episodes: Channel[] = [];

  // Episodes are grouped by season number
  Object.entries(seriesInfo.episodes).forEach(([seasonNum, seasonEpisodes]) => {
    seasonEpisodes.forEach((episode) => {
      const ext = episode.container_extension || 'mp4';
      const streamUrl = `${server}/series/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${episode.id}.${ext}`;

      episodes.push({
        id: `episode-${episode.id}`,
        name: `S${seasonNum}E${episode.episode_num}: ${episode.title}`,
        url: streamUrl,
        logo: episode.info?.movie_image || seriesInfo.info?.cover || undefined,
        group: `Season ${seasonNum}`,
        contentType: 'series' as ContentType,
        containerExtension: ext,
        downloadUrl: streamUrl,
        seriesId,
        seasonNumber: parseInt(seasonNum),
        episodeNumber: episode.episode_num,
        episodeTitle: episode.title,
      });
    });
  });

  // Sort by season and episode number
  episodes.sort((a, b) => {
    if (a.seasonNumber !== b.seasonNumber) {
      return (a.seasonNumber || 0) - (b.seasonNumber || 0);
    }
    return (a.episodeNumber || 0) - (b.episodeNumber || 0);
  });

  return episodes;
}

/**
 * Legacy function for backward compatibility - loads only live streams
 */
export async function loadPlaylistFromXtream(credentials: XtreamCredentials): Promise<PlaylistInfo> {
  const full = await loadFullPlaylistFromXtream(credentials);
  return full.live;
}

/**
 * Save Xtream credentials to localStorage
 */
export function saveXtreamCredentials(credentials: XtreamCredentials): void {
  localStorage.setItem('televisi-xtream-credentials', JSON.stringify(credentials));
}

/**
 * Load Xtream credentials from localStorage
 */
export function loadXtreamCredentials(): XtreamCredentials | null {
  const saved = localStorage.getItem('televisi-xtream-credentials');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Clear saved Xtream credentials
 */
export function clearXtreamCredentials(): void {
  localStorage.removeItem('televisi-xtream-credentials');
}
