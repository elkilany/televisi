import { useHls } from '../hooks/useHls';
import type { Channel } from '../types';
import './VideoPlayer.css';

interface VideoPlayerProps {
  channel: Channel | null;
}

export function VideoPlayer({ channel }: VideoPlayerProps) {
  const videoRef = useHls(channel?.url || null);

  if (!channel) {
    return (
      <div className="video-player video-player--empty">
        <div className="video-player__placeholder">
          <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 8l7 4-7 4V8z"/>
          </svg>
          <p>Select a channel to start watching</p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        className="video-player__video"
        controls
        autoPlay
        playsInline
      />
      <div className="video-player__info">
        {channel.logo && (
          <img
            src={channel.logo}
            alt={channel.name}
            className="video-player__logo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <div className="video-player__details">
          <h2 className="video-player__title">{channel.name}</h2>
          {channel.group && (
            <span className="video-player__group">{channel.group}</span>
          )}
        </div>
      </div>
    </div>
  );
}
