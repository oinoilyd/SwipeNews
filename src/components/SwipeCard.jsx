import { useState } from 'react';

// Subtle card background tint per take position
const CARD_TINTS = [
  'rgba(29,  78, 216, 0.13)',  // 0 Far Left
  'rgba(59, 130, 246, 0.10)',  // 1 Left
  'rgba(129,140, 248, 0.07)',  // 2 Center-Left
  'rgba(0,   0,   0,  0.00)',  // 3 Neutral
  'rgba(249,115,  22, 0.07)',  // 4 Center-Right
  'rgba(239, 68,  68, 0.10)',  // 5 Right
  'rgba(220, 38,  38, 0.13)',  // 6 Far Right
];

export default function SwipeCard({
  topic,
  currentTake,
  currentTakeIndex,
  takesLoading,
  onTakeLeft,
  onTakeRight,
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Show loading state while takes are being fetched
  if (!currentTake) {
    const tint = CARD_TINTS[currentTakeIndex] ?? CARD_TINTS[3];
    return (
      <div className="swipe-card" style={{ '--card-tint': tint, '--accent': '#a78bfa' }}>
        {topic.urlToImage && (
          <div className="card-image-container">
            <img
              src={topic.urlToImage}
              alt={topic.title}
              className="card-image"
              onError={(e) => {
                e.target.closest('.card-image-container').style.display = 'none';
              }}
            />
            <div className="card-image-overlay" />
            <span className="card-image-topic-badge">{topic.title}</span>
          </div>
        )}
        {!topic.urlToImage && (
          <div className="card-no-image-header">
            <p className="card-eyebrow">TODAY'S TOPIC</p>
            <h2 className="card-topic-title-large">{topic.title}</h2>
          </div>
        )}
        <div className="card-body">
          <div className="takes-loading-state">
            <div className="spinner-ring" />
            <p className="takes-loading-label">
              {takesLoading ? 'Generating perspectives…' : 'Loading…'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tint       = CARD_TINTS[currentTakeIndex] ?? CARD_TINTS[3];
  const accent     = currentTake.color || '#a78bfa';
  const canGoLeft  = currentTakeIndex > 0;
  const canGoRight = currentTakeIndex < 6;

  return (
    <div
      className="swipe-card"
      style={{ '--card-tint': tint, '--accent': accent }}
    >
      {/* ── Topic image ── */}
      {topic.urlToImage && (
        <div className="card-image-container">
          <img
            src={topic.urlToImage}
            alt={topic.title}
            className="card-image"
            onError={(e) => {
              e.target.closest('.card-image-container').style.display = 'none';
            }}
          />
          <div className="card-image-overlay" />
          <span className="card-image-topic-badge">{topic.title}</span>
        </div>
      )}

      {/* ── No-image fallback header ── */}
      {!topic.urlToImage && (
        <div className="card-no-image-header">
          <p className="card-eyebrow">TODAY'S TOPIC</p>
          <h2 className="card-topic-title-large">{topic.title}</h2>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="card-body">
        {/* Perspective badge */}
        <div
          className="perspective-badge"
          style={{ color: accent, borderLeftColor: accent, background: `${accent}18` }}
        >
          {currentTake.label} Perspective
        </div>

        {/* Synthesized take text */}
        <div className="take-text">
          {currentTake.text.split('\n\n').map((para, i) => (
            <p key={i}>{para.trim()}</p>
          ))}
        </div>

        {/* ── Sources accordion ── */}
        {currentTake.sources?.length > 0 && (
          <div className="sources-panel">
            <button
              className="sources-toggle"
              onClick={() => setSourcesOpen(o => !o)}
            >
              <span className="sources-chevron">{sourcesOpen ? '▾' : '▸'}</span>
              Sources&nbsp;
              <span className="sources-count">({currentTake.sources.length})</span>
            </button>

            {sourcesOpen && (
              <ul className="sources-list">
                {currentTake.sources.map((src, i) => (
                  <li key={i} className="source-item">
                    <span className="source-name">{src.name}</span>
                    {src.framing && (
                      <span className="source-framing">"{src.framing}"</span>
                    )}
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
                        onClick={e => e.stopPropagation()}
                      >
                        Read ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Left / Right perspective arrows ── */}
      <div className="card-nav-arrows">
        <button
          className={`nav-arrow nav-arrow-left ${!canGoLeft ? 'disabled' : ''}`}
          onClick={onTakeLeft}
          disabled={!canGoLeft}
          aria-label="More liberal perspective"
        >
          <span className="arrow-icon">←</span>
          <span className="arrow-label">More Liberal</span>
        </button>

        <button
          className={`nav-arrow nav-arrow-right ${!canGoRight ? 'disabled' : ''}`}
          onClick={onTakeRight}
          disabled={!canGoRight}
          aria-label="More conservative perspective"
        >
          <span className="arrow-label">More Conservative</span>
          <span className="arrow-icon">→</span>
        </button>
      </div>
    </div>
  );
}
