import type { Channel } from '../types';
import './ChannelCard.css';

interface ChannelCardProps {
  channel: Channel;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
}

export function ChannelCard({
  channel,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ChannelCardProps) {
  return (
    <div
      className={`channel-card ${isActive ? 'channel-card--active' : ''}`}
      onClick={() => onSelect(channel)}
    >
      <div className="channel-card__logo-container">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="channel-card__logo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`channel-card__logo-placeholder ${channel.logo ? 'hidden' : ''}`}>
          {channel.name.charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="channel-card__info">
        <h3 className="channel-card__name">{channel.name}</h3>
        {channel.group && (
          <span className="channel-card__group">{channel.group}</span>
        )}
      </div>
      <button
        className={`channel-card__favorite ${isFavorite ? 'channel-card__favorite--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(channel);
        }}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </button>
    </div>
  );
}
