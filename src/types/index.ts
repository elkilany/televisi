export type ContentType = 'live' | 'movies' | 'series';

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  contentType: ContentType;
  // For movies/series
  containerExtension?: string;
  downloadUrl?: string;
  // For series
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface ChannelGroup {
  name: string;
  channels: Channel[];
}

export interface PlaylistInfo {
  name?: string;
  channels: Channel[];
  groups: ChannelGroup[];
}

export interface SeriesInfo {
  seriesId: number;
  name: string;
  cover?: string;
  plot?: string;
  seasons: SeasonInfo[];
}

export interface SeasonInfo {
  seasonNumber: number;
  episodes: EpisodeInfo[];
}

export interface EpisodeInfo {
  id: string;
  episodeNumber: number;
  title: string;
  url: string;
  downloadUrl?: string;
  containerExtension?: string;
}
