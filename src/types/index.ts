export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
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
