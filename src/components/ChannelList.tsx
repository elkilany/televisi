import { useState, useMemo } from 'react';
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
  searchQuery: string;
}

type FilterMode = 'all' | 'favorites' | 'group';

export function ChannelList({
  channels,
  groups,
  activeChannel,
  favorites,
  onSelectChannel,
  onToggleFavorite,
  searchQuery,
}: ChannelListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('');

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

      <div className="channel-list__count">
        {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
      </div>

      <div className="channel-list__items">
        {filteredChannels.length === 0 ? (
          <div className="channel-list__empty">
            {searchQuery ? 'No channels found' : 'No channels available'}
          </div>
        ) : (
          filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isActive={activeChannel?.id === channel.id}
              isFavorite={favorites.has(channel.id)}
              onSelect={onSelectChannel}
              onToggleFavorite={onToggleFavorite}
            />
          ))
        )}
      </div>
    </div>
  );
}
