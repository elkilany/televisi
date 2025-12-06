import type { Channel, ChannelGroup, PlaylistInfo } from '../types';

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

interface XtreamStream {
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

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
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
 * Get live TV categories from Xtream server
 */
async function getLiveCategories(credentials: XtreamCredentials): Promise<XtreamCategory[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_live_categories`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get categories: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get live TV streams from Xtream server
 */
async function getLiveStreams(credentials: XtreamCredentials): Promise<XtreamStream[]> {
  const server = normalizeServerUrl(credentials.server);
  const url = `${server}/player_api.php?username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}&action=get_live_streams`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get streams: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Load playlist from Xtream Codes server
 */
export async function loadPlaylistFromXtream(credentials: XtreamCredentials): Promise<PlaylistInfo> {
  const server = normalizeServerUrl(credentials.server);

  // Fetch categories and streams in parallel
  const [categories, streams] = await Promise.all([
    getLiveCategories(credentials),
    getLiveStreams(credentials),
  ]);

  // Create category lookup map
  const categoryMap = new Map<string, string>();
  categories.forEach(cat => {
    categoryMap.set(cat.category_id, cat.category_name);
  });

  // Convert streams to channels
  const channels: Channel[] = streams.map((stream) => {
    const streamUrl = `${server}/live/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${stream.stream_id}.m3u8`;

    return {
      id: `xtream-${stream.stream_id}`,
      name: stream.name,
      url: streamUrl,
      logo: stream.stream_icon || undefined,
      group: categoryMap.get(stream.category_id) || 'Uncategorized',
      tvgId: stream.epg_channel_id || undefined,
      tvgName: stream.name,
    };
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
