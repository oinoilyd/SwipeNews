import { useState, useEffect, useRef } from 'react';
import JargonText from './JargonText.jsx';

// ── Word-by-word streaming animation ─────────────────────────────────────────
function useStreamingText(text, speedMs = 35) {
  const [displayed, setDisplayed] = useState('');
  const textRef = useRef('');

  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    textRef.current = text;
    setDisplayed('');
    const words = text.split(' ');
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (textRef.current !== text) { clearInterval(id); return; }
      setDisplayed(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text, speedMs]);

  return displayed;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatAge(iso) {
  if (!iso) return null;
  try {
    const d     = new Date(iso);
    const month = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time  = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${month}, ${time}`;
  } catch { return null; }
}

// ── Card tint per take index ──────────────────────────────────────────────────
const CARD_TINTS = [
  'rgba(29,  78, 216, 0.13)',  // 0 Far Left
  'rgba(59, 130, 246, 0.10)',  // 1 Left
  'rgba(129,140, 248, 0.07)',  // 2 Center-Left
  'rgba(0,   0,   0,  0.00)',  // 3 Neutral
  'rgba(249,115,  22, 0.07)',  // 4 Center-Right
  'rgba(239, 68,  68, 0.10)',  // 5 Right
  'rgba(220, 38,  38, 0.13)',  // 6 Far Right
];

const LIMITED_INDICES = [1, 3, 5];
const TECH_INDICES    = [1, 2, 3, 5];

const TAKE_META = [
  { label: 'Far Left',     color: '#1d4ed8' },
  { label: 'Left',         color: '#3b82f6' },
  { label: 'Center-Left',  color: '#818cf8' },
  { label: 'Neutral',      color: '#a78bfa' },
  { label: 'Center-Right', color: '#f97316' },
  { label: 'Right',        color: '#ef4444' },
  { label: 'Far Right',    color: '#dc2626' },
];

const SPORTS_META_OVERRIDE = {
  1: { label: 'Fan',      color: '#22c55e' },  // green — social, crowd energy
  3: { label: 'Neutral',  color: '#a78bfa' },  // purple — consistent with neutral
  5: { label: 'Business', color: '#f59e0b' },  // amber/gold — financial
};
const TECH_META_OVERRIDE = {
  1: { label: 'Optimist', color: '#3b82f6' },
  2: { label: 'Skeptic',  color: '#f59e0b' },
  3: { label: 'Neutral',  color: '#a78bfa' },
  5: { label: 'Industry', color: '#10b981' },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SwipeCard({
  topic,
  currentTake,
  currentTakeIndex,
  takesLoading,
  onTakeLeft,
  onTakeRight,
  perspectiveMode,
  onScrollChange,
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const cardBodyRef       = useRef(null);
  const scrollCollapseRef = useRef(false);

  const displayedText = useStreamingText(currentTake?.text ?? '');

  // Reset scroll + sources on topic change
  useEffect(() => {
    setSourcesOpen(false);
    scrollCollapseRef.current = false;
    onScrollChange?.(false);
    if (cardBodyRef.current) cardBodyRef.current.scrollTop = 0;
  }, [topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = (e) => {
    if (!onScrollChange) return;
    const shouldCollapse = e.currentTarget.scrollTop > 20;
    if (shouldCollapse !== scrollCollapseRef.current) {
      scrollCollapseRef.current = shouldCollapse;
      onScrollChange(shouldCollapse);
    }
  };

  // Derived values
  const isNeutral     = currentTakeIndex === 3;
  const isNonFull     = perspectiveMode !== 'full';
  const activeIndices = perspectiveMode === 'tech' ? TECH_INDICES : LIMITED_INDICES;
  const tint          = CARD_TINTS[currentTakeIndex] ?? CARD_TINTS[3];

  const baseMeta  = TAKE_META[currentTakeIndex] ?? TAKE_META[3];
  const override  = perspectiveMode === 'sports' ? SPORTS_META_OVERRIDE[currentTakeIndex]
                  : perspectiveMode === 'tech'   ? TECH_META_OVERRIDE[currentTakeIndex]
                  : null;
  const meta      = override ? { ...baseMeta, ...override } : baseMeta;
  const accent    = currentTake?.color || meta.color || '#a78bfa';

  const canGoLeft  = isNonFull
    ? activeIndices.some(i => i < currentTakeIndex)
    : currentTakeIndex > 0;
  const canGoRight = isNonFull
    ? activeIndices.some(i => i > currentTakeIndex)
    : currentTakeIndex < 6;

  const timestamp = formatAge(topic.latestPublishedAt);

  // ── Hero: image with title overlay, or no-image header ───────────────────
  function renderHero() {
    if (!topic.urlToImage) {
      return (
        <div className="card-no-image-header">
          {topic.category && (
            <span className="topic-category-badge">{topic.category}</span>
          )}
          <h2 className="card-topic-title-large">{topic.title}</h2>
        </div>
      );
    }
    return (
      <div className="card-image-container">
        <img
          src={topic.urlToImage}
          alt={topic.title}
          className="card-image"
          onError={(e) => { e.target.closest('.card-image-container').style.display = 'none'; }}
        />
        <div className="card-image-overlay" />
        <div className="card-image-content">
          {topic.category && (
            <span className="topic-category-badge">{topic.category}</span>
          )}
          <h2 className="card-image-title">{topic.title}</h2>
        </div>
      </div>
    );
  }

  // ── Sources accordion ─────────────────────────────────────────────────────
  function renderSources(sources) {
    if (!sources?.length) return null;
    return (
      <div className="sources-panel">
        <button className="sources-toggle" onClick={() => setSourcesOpen(o => !o)}>
          <span className="sources-chevron">{sourcesOpen ? '▾' : '▸'}</span>
          Sources&nbsp;<span className="sources-count">({sources.length})</span>
        </button>
        {sourcesOpen && (
          <ul className="sources-list">
            {sources.map((src, i) => (
              <li key={i} className="source-item">
                <span className="source-name">{src.name}</span>
                {src.framing && <span className="source-framing">"{src.framing}"</span>}
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
    );
  }

  // ── Perspective nav arrows (bottom bar) ───────────────────────────────────
  const navArrows = (
    <div className="card-nav-arrows">
      <button
        className={`swipe-nav-tap${!canGoLeft ? ' faded' : ''}`}
        onClick={onTakeLeft}
        disabled={!canGoLeft}
        aria-label="More liberal perspective"
      >🔵←</button>
      <span className="swipe-nav-label">SWIPE</span>
      <button
        className={`swipe-nav-tap${!canGoRight ? ' faded' : ''}`}
        onClick={onTakeRight}
        disabled={!canGoRight}
        aria-label="More conservative perspective"
      >→🔴</button>
    </div>
  );

  // ── Single unified render ─────────────────────────────────────────────────
  return (
    <div className="swipe-card" style={{ '--card-tint': tint, '--accent': accent }}>
      {/* Scrollable area: hero image at top, content below */}
      <div className="card-body" ref={cardBodyRef} onScroll={handleScroll}>
        {renderHero()}

        <div className="card-content">
          {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}

          {/* Neutral-only: high-level summary sits above the perspective content */}
          {isNeutral && topic.summary && (
            <p className="neutral-blurb">{topic.summary}</p>
          )}

          {/* Perspective badge — identical for all perspectives including neutral */}
          <div
            className="perspective-badge"
            style={{ color: accent, borderLeftColor: accent, background: `${accent}18` }}
          >
            {(currentTake?.label ?? meta.label)} Perspective
          </div>

          {/* Take content — identical structure for all perspectives */}
          {!currentTake ? (
            <div className="take-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
            </div>
          ) : (
            <>
              <div className="take-text">
                {displayedText.split('\n\n').map((p, i) => (
                  <p key={i}><JargonText>{p.trim()}</JargonText></p>
                ))}
              </div>
              {renderSources(currentTake.sources)}
            </>
          )}
        </div>
      </div>

      {navArrows}
    </div>
  );
}
