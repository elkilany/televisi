import { useState, useMemo, useCallback, type ReactElement } from 'react';
import { List } from 'react-window';
import type { Channel, ChannelGroup } from '../types';
import { ChannelCard } from './ChannelCard';
import './ChannelList.css';

interface ChannelListProps {
  channels: Channel[];
  groups: ChannelGroup[];
  activeChannel: Channel | null;
  favorites: Set<string>;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
  onDownloadAll?: (channels: Channel[]) => void;
  searchQuery: string;
}

type FilterMode = 'all' | 'favorites' | 'group';

const ITEM_HEIGHT = 72; // Height of each channel card in pixels

// Custom row props (without index and style, which are provided by List)
interface CustomRowProps {
  channels: Channel[];
  activeChannel: Channel | null;
  favorites: Set<string>;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
}

// Row component for react-window v2
function RowComponent({
  index,
  style,
  channels,
  activeChannel,
  favorites,
  onSelectChannel,
  onToggleFavorite,
}: {
  index: number;
  style: React.CSSProperties;
} & CustomRowProps): ReactElement {
  const channel = channels[index];

  return (
    <div style={{ ...style, paddingRight: '1rem', paddingLeft: '1rem' }}>
      <ChannelCard
        channel={channel}
        isActive={activeChannel?.id === channel.id}
        isFavorite={favorites.has(channel.id)}
        onSelect={onSelectChannel}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  );
}

export function ChannelList({
  channels,
  groups,
  activeChannel,
  favorites,
  onSelectChannel,
  onToggleFavorite,
  onDownloadAll,
  searchQuery,
}: ChannelListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [listHeight, setListHeight] = useState(400);

  // Memoized filtered channels
  const filteredChannels = useMemo(() => {
    let result = channels;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (channel) =>
          channel.name.toLowerCase().includes(query) ||
          channel.group?.toLowerCase().includes(query)
      );
    }

    // Apply mode filter
    if (filterMode === 'favorites') {
      result = result.filter((channel) => favorites.has(channel.id));
    } else if (filterMode === 'group' && selectedGroup) {
      result = result.filter((channel) => channel.group === selectedGroup);
    }

    return result;
  }, [channels, searchQuery, filterMode, selectedGroup, favorites]);

  // Get downloadable channels (movies and series episodes with URLs)
  const downloadableChannels = useMemo(() => {
    return filteredChannels.filter(
      (channel) =>
        (channel.contentType === 'movies' || channel.contentType === 'series') &&
        (channel.downloadUrl || channel.url)
    );
  }, [filteredChannels]);

  // Measure container height
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setListHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(node);
      setListHeight(node.clientHeight);
    }
  }, []);

  // Create row props for react-window v2
  const rowProps: CustomRowProps = useMemo(() => ({
    channels: filteredChannels,
    activeChannel,
    favorites,
    onSelectChannel,
    onToggleFavorite,
  }), [filteredChannels, activeChannel, favorites, onSelectChannel, onToggleFavorite]);

  return (
    <div className="channel-list">
      <div className="channel-list__filters">
        <button
          className={`channel-list__filter-btn ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          All
        </button>
        <button
          className={`channel-list__filter-btn ${filterMode === 'favorites' ? 'active' : ''}`}
          onClick={() => setFilterMode('favorites')}
        >
          Favorites
        </button>
        <select
          className="channel-list__group-select"
          value={filterMode === 'group' ? selectedGroup : ''}
          onChange={(e) => {
            if (e.target.value) {
              setFilterMode('group');
              setSelectedGroup(e.target.value);
            } else {
              setFilterMode('all');
              setSelectedGroup('');
            }
          }}
        >
          <option value="">All Groups</option>
          {groups.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name} ({group.channels.length})
            </option>
          ))}
        </select>
      </div>

      <div className="channel-list__count-row">
        <div className="channel-list__count">
          {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
        </div>
        {onDownloadAll && downloadableChannels.length > 0 && (
          <button
            className="channel-list__download-all"
            onClick={() => onDownloadAll(downloadableChannels)}
            title={`Download all ${downloadableChannels.length} items`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download All ({downloadableChannels.length})
          </button>
        )}
      </div>

      <div className="channel-list__items" ref={containerRef}>
        {filteredChannels.length === 0 ? (
          <div className="channel-list__empty">
            {searchQuery ? 'No channels found' : 'No channels available'}
          </div>
        ) : (
          <List<CustomRowProps>
            rowComponent={RowComponent}
            rowCount={filteredChannels.length}
            rowHeight={ITEM_HEIGHT}
            rowProps={rowProps}
            overscanCount={5}
            defaultHeight={listHeight}
            style={{ height: listHeight }}
          />
        )}
      </div>
    </div>
  );
}
