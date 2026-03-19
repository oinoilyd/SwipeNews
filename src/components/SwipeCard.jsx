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

// ── Perspective metadata ───────────────────────────────────────────────────────
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
  1: { label: 'Fan',      color: '#22c55e' },
  3: { label: 'Neutral',  color: '#a78bfa' },
  5: { label: 'Business', color: '#f59e0b' },
};
const TECH_META_OVERRIDE = {
  1: { label: 'Optimist', color: '#3b82f6' },
  2: { label: 'Skeptic',  color: '#f59e0b' },
  3: { label: 'Neutral',  color: '#a78bfa' },
  5: { label: 'Industry', color: '#10b981' },
};
const ENTERTAINMENT_META_OVERRIDE = {
  1: { label: 'Progressive', color: '#7b6eb0' },
  3: { label: 'Neutral',     color: '#7d8699' },
  5: { label: 'Traditional', color: '#8f6344' },
};

const LEFT_COLOR = {
  full:          '#3b82f6',
  sports:        '#22c55e',
  tech:          '#3b82f6',
  entertainment: '#7b6eb0',
};
const RIGHT_COLOR = {
  full:          '#ef4444',
  sports:        '#f59e0b',
  tech:          '#10b981',
  entertainment: '#8f6344',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SwipeCard({
  topic,
  currentTake     = null,
  currentTakeIndex = 3,
  takesLoading    = false,
  perspectiveMode = 'full',
  spectrumBar     = null,
  isPreview       = false,
  onScrollChange  = null,
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [atBottom,    setAtBottom]    = useState(false);
  const scrollRef  = useRef(null);   // the single scroll container
  const bgImageRef = useRef(null);   // photo img — for parallax

  const displayedText = useStreamingText(isPreview ? '' : (currentTake?.text ?? ''));

  // ── Reset when topic changes ──────────────────────────────────────────────
  useEffect(() => {
    setSourcesOpen(false);
    setAtBottom(false);
    if (scrollRef.current)  scrollRef.current.scrollTop = 0;
    if (bgImageRef.current) bgImageRef.current.style.transform = '';
    if (onScrollChange) onScrollChange(false);
  }, [topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-unlock when content fits without scrolling
  useEffect(() => {
    if (!currentTake) return;
    const id = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollHeight - el.clientHeight <= 0) setAtBottom(true);
    }, 80);
    return () => clearTimeout(id);
  }, [currentTake]);

  // ── Scroll handler: parallax photo + header collapse + at-bottom ─────────
  function handleScroll(e) {
    const el        = e.currentTarget;
    const scrollTop = el.scrollTop;
    const scrollMax = el.scrollHeight - el.clientHeight;

    // Parallax: photo drifts up faster than the scroll (0.25× extra)
    if (bgImageRef.current) {
      bgImageRef.current.style.transform = `translateY(${-scrollTop * 0.25}px)`;
    }

    // Collapse header once user starts reading
    if (onScrollChange) onScrollChange(scrollTop > 10);

    // Unlock next-card when fully scrolled
    setAtBottom(scrollMax <= 0 || scrollTop >= scrollMax - 6);
  }

  // ── Derived metadata ──────────────────────────────────────────────────────
  const override =
    perspectiveMode === 'sports'          ? SPORTS_META_OVERRIDE[currentTakeIndex]
    : perspectiveMode === 'tech'          ? TECH_META_OVERRIDE[currentTakeIndex]
    : perspectiveMode === 'entertainment' ? ENTERTAINMENT_META_OVERRIDE[currentTakeIndex]
    : null;

  const baseMeta = TAKE_META[currentTakeIndex] ?? TAKE_META[3];
  const meta     = override ? { ...baseMeta, ...override } : baseMeta;
  const accent   = override?.color || meta.color || '#a78bfa';
  const tint     = `${accent}20`;

  const isNeutral = currentTakeIndex === 3;
  const timestamp = formatAge(topic.latestPublishedAt);
  const lColor    = LEFT_COLOR[perspectiveMode]  || LEFT_COLOR.full;
  const rColor    = RIGHT_COLOR[perspectiveMode] || RIGHT_COLOR.full;

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
                  <a href={src.url} target="_blank" rel="noopener noreferrer"
                    className="source-link" onClick={e => e.stopPropagation()}>
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

  // ── Shared photo element ──────────────────────────────────────────────────
  const photoEl = topic.urlToImage ? (
    <img
      ref={bgImageRef}
      src={topic.urlToImage}
      alt={topic.title}
      className="card-bg-image"
      onError={e => { e.target.style.display = 'none'; }}
    />
  ) : (
    <div className="card-bg-solid" />
  );

  // ── Preview card (prev/next slot) ─────────────────────────────────────────
  if (isPreview) {
    return (
      <div className="swipe-card" style={{ '--accent': accent, '--card-tint': tint }}>
        {photoEl}
        <div className="card-bg-gradient" />
        <div className="card-tint-overlay" />
        <div className="card-overlay">
          <div className="card-top-row">
            {topic.category && <span className="topic-category-badge">{topic.category}</span>}
          </div>
          <div className="card-drag-spacer" />
          <div className="card-bottom-panel">
            <h2 className="card-title-overlay">{topic.title}</h2>
          </div>
        </div>
      </div>
    );
  }

  // ── Active card — single scroll container ─────────────────────────────────
  return (
    <div
      className="swipe-card"
      style={{ '--accent': accent, '--card-tint': tint }}
      data-at-bottom={atBottom ? '1' : '0'}
    >
      {/* One scrollable column: [photo section] ↓ [content section] */}
      <div className="card-scroll-inner" ref={scrollRef} onScroll={handleScroll}>

        {/* ── Photo section — scrolls up as user reads ── */}
        <div className="card-photo-section">
          {photoEl}
          <div className="card-photo-gradient" />
          <div className="card-tint-overlay" />

          {/* Badge + timestamp pinned to top of photo */}
          <div className="card-top-row">
            {topic.category && <span className="topic-category-badge">{topic.category}</span>}
            {timestamp && <span className="card-timestamp-overlay">{timestamp}</span>}
          </div>

          {/* Title + swipe hint anchored to bottom of photo */}
          <div className="card-photo-footer">
            <h2 className="card-title-overlay">{topic.title}</h2>
            <div className="card-swipe-hint">
              <span className="card-swipe-arrow" style={{ color: lColor }}>◀</span>
              <span className="card-swipe-label">
                {takesLoading ? <span className="spinner-ring-sm" /> : 'SWIPE PERSPECTIVE'}
              </span>
              <span className="card-swipe-arrow" style={{ color: rColor }}>▶</span>
            </div>
          </div>
        </div>

        {/* ── Content section — spectrum bar + narrative ── */}
        <div className="card-content-section" style={{ '--accent': accent }}>

          {spectrumBar && (
            <div className="card-spectrum-embed">{spectrumBar}</div>
          )}

          <div className="card-take-content">
            {/* Perspective badge */}
            <div
              className="perspective-badge"
              style={{ color: accent, borderLeftColor: accent, background: `${accent}18` }}
            >
              {meta.label} Perspective
            </div>

            {/* Neutral summary blurb */}
            {isNeutral && topic.summary && (
              <p className="neutral-blurb">{topic.summary}</p>
            )}

            {/* Take text or skeleton */}
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

          {/* Extra bottom padding so content clears safe area */}
          <div style={{ height: `calc(env(safe-area-inset-bottom, 0px) + 20px)` }} />
        </div>

      </div>
    </div>
  );
}
