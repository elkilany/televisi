import type { ContentType } from '../types';
import './ContentTypeSelector.css';

interface ContentTypeSelectorProps {
  activeType: ContentType;
  onChange: (type: ContentType) => void;
  counts: {
    live: number;
    movies: number;
    series: number;
  };
}

export function ContentTypeSelector({ activeType, onChange, counts }: ContentTypeSelectorProps) {
  return (
    <div className="content-type-selector">
      <button
        className={`content-type-selector__btn ${activeType === 'live' ? 'active' : ''}`}
        onClick={() => onChange('live')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        <span>Live</span>
        <span className="content-type-selector__count">{counts.live}</span>
      </button>
      <button
        className={`content-type-selector__btn ${activeType === 'movies' ? 'active' : ''}`}
        onClick={() => onChange('movies')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
          <line x1="7" y1="2" x2="7" y2="22"/>
          <line x1="17" y1="2" x2="17" y2="22"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <line x1="2" y1="7" x2="7" y2="7"/>
          <line x1="2" y1="17" x2="7" y2="17"/>
          <line x1="17" y1="17" x2="22" y2="17"/>
          <line x1="17" y1="7" x2="22" y2="7"/>
        </svg>
        <span>Movies</span>
        <span className="content-type-selector__count">{counts.movies}</span>
      </button>
      <button
        className={`content-type-selector__btn ${activeType === 'series' ? 'active' : ''}`}
        onClick={() => onChange('series')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
          <polyline points="17,2 12,7 7,2"/>
        </svg>
        <span>Series</span>
        <span className="content-type-selector__count">{counts.series}</span>
      </button>
    </div>
  );
}
