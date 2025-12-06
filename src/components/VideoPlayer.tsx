import { useCallback } from 'react';
import { useHls } from '../hooks/useHls';
import { useRecorder, formatDuration } from '../hooks/useRecorder';
import type { Channel } from '../types';
import './VideoPlayer.css';

interface VideoPlayerProps {
  channel: Channel | null;
}

export function VideoPlayer({ channel }: VideoPlayerProps) {
  const videoRef = useHls(channel?.url || null);
  const { state: recorderState, startRecording, stopRecording, pauseRecording, resumeRecording } = useRecorder();

  const handleDownload = useCallback(() => {
    if (!channel?.downloadUrl) return;

    const link = document.createElement('a');
    link.href = channel.downloadUrl;
    link.download = `${channel.name}.${channel.containerExtension || 'mp4'}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [channel]);

  const handleRecord = useCallback(() => {
    if (!videoRef.current) return;

    if (recorderState.isRecording) {
      stopRecording();
    } else {
      const filename = channel?.name?.replace(/[^a-z0-9]/gi, '_') || 'recording';
      startRecording(videoRef.current, filename);
    }
  }, [videoRef, recorderState.isRecording, channel?.name, startRecording, stopRecording]);

  const handlePauseResume = useCallback(() => {
    if (recorderState.isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  }, [recorderState.isPaused, pauseRecording, resumeRecording]);

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

  const canDownload = channel.contentType === 'movies' || channel.contentType === 'series';
  const canRecord = channel.contentType === 'live';

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        className="video-player__video"
        controls
        autoPlay
        playsInline
        crossOrigin="anonymous"
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

        <div className="video-player__actions">
          {/* Download button for movies/series */}
          {canDownload && channel.downloadUrl && (
            <button
              className="video-player__action-btn"
              onClick={handleDownload}
              title="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              <span>Download</span>
            </button>
          )}

          {/* Record button for live streams */}
          {canRecord && (
            <>
              <button
                className={`video-player__action-btn ${recorderState.isRecording ? 'recording' : ''}`}
                onClick={handleRecord}
                title={recorderState.isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                {recorderState.isRecording ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                    <span>Stop ({formatDuration(recorderState.duration)})</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="4" fill="currentColor"/>
                    </svg>
                    <span>Record</span>
                  </>
                )}
              </button>

              {recorderState.isRecording && (
                <button
                  className="video-player__action-btn"
                  onClick={handlePauseResume}
                  title={recorderState.isPaused ? 'Resume' : 'Pause'}
                >
                  {recorderState.isPaused ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <rect x="6" y="4" width="4" height="16"/>
                      <rect x="14" y="4" width="4" height="16"/>
                    </svg>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {recorderState.error && (
        <div className="video-player__error">
          {recorderState.error}
        </div>
      )}
    </div>
  );
}
