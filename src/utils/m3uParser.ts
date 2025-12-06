import type { Channel, ChannelGroup, PlaylistInfo } from '../types';

/**
 * Parse M3U/M3U8 playlist content into structured channel data
 */
export function parseM3U(content: string): PlaylistInfo {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  const channels: Channel[] = [];
  const groupsMap = new Map<string, Channel[]>();

  let currentChannel: Partial<Channel> | null = null;
  let channelIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip M3U header
    if (line.startsWith('#EXTM3U')) {
      continue;
    }

    // Parse EXTINF line (channel metadata)
    if (line.startsWith('#EXTINF:')) {
      currentChannel = parseExtInf(line, channelIndex);
      channelIndex++;
      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) {
      continue;
    }

    // This should be a URL - associate with current channel
    if (currentChannel && isValidUrl(line)) {
      const channel: Channel = {
        id: currentChannel.id || `channel-${channelIndex}`,
        name: currentChannel.name || `Channel ${channelIndex}`,
        url: line,
        logo: currentChannel.logo,
        group: currentChannel.group || 'Uncategorized',
        tvgId: currentChannel.tvgId,
        tvgName: currentChannel.tvgName,
        contentType: 'live', // M3U playlists are typically live streams
        downloadUrl: line, // Allow download of any stream
      };

      channels.push(channel);

      // Add to group
      const groupName = channel.group || 'Uncategorized';
      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, []);
      }
      groupsMap.get(groupName)!.push(channel);

      currentChannel = null;
    }
  }

  // Convert groups map to array
  const groups: ChannelGroup[] = Array.from(groupsMap.entries()).map(([name, channels]) => ({
    name,
    channels,
  }));

  return { channels, groups };
}

/**
 * Parse EXTINF line to extract channel metadata
 */
function parseExtInf(line: string, index: number): Partial<Channel> {
  const channel: Partial<Channel> = {
    id: `channel-${index}`,
  };

  // Extract attributes using regex
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
  const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
  const groupTitleMatch = line.match(/group-title="([^"]*)"/i);

  if (tvgIdMatch) channel.tvgId = tvgIdMatch[1];
  if (tvgNameMatch) channel.tvgName = tvgNameMatch[1];
  if (tvgLogoMatch) channel.logo = tvgLogoMatch[1];
  if (groupTitleMatch) channel.group = groupTitleMatch[1];

  // Extract channel name (after the last comma)
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex !== -1) {
    channel.name = line.substring(commaIndex + 1).trim();
  }

  return channel;
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Load playlist from URL
 */
export async function loadPlaylistFromUrl(url: string): Promise<PlaylistInfo> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load playlist: ${response.statusText}`);
  }
  const content = await response.text();
  return parseM3U(content);
}

/**
 * Load playlist from file
 */
export async function loadPlaylistFromFile(file: File): Promise<PlaylistInfo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(parseM3U(content));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
