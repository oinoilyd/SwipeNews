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
  const [sourcesOpen,      setSourcesOpen]      = useState(false);
  const [atBottom,         setAtBottom]         = useState(false);
  const [bouncing,         setBouncing]          = useState(false);
  const [sourceWarningOpen, setSourceWarningOpen] = useState(false);

  const scrollRef      = useRef(null);   // scroll container for content
  const bounceTimerRef = useRef(null);
  const bounceFiredRef = useRef(false);  // fire bounce once per bottom-reach

  const displayedText = useStreamingText(isPreview ? '' : (currentTake?.text ?? ''));

  // ── Reset when topic changes ──────────────────────────────────────────────
  useEffect(() => {
    setSourcesOpen(false);
    setAtBottom(false);
    setBouncing(false);
    setSourceWarningOpen(false);
    bounceFiredRef.current = false;
    clearTimeout(bounceTimerRef.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close source warning when perspective changes
  useEffect(() => { setSourceWarningOpen(false); }, [currentTakeIndex]);

  // Auto-detect bottom for short content that doesn't need scrolling
  useEffect(() => {
    if (!currentTake) return;
    const id = setTimeout(() => {
      const el = scrollRef.current;
      if (el && el.scrollHeight - el.clientHeight <= 0) setAtBottom(true);
    }, 80);
    return () => clearTimeout(id);
  }, [currentTake]);

  // ── Bounce hint when user reaches the bottom ──────────────────────────────
  useEffect(() => {
    if (!atBottom) { bounceFiredRef.current = false; return; }
    if (bounceFiredRef.current) return;
    bounceFiredRef.current = true;
    setBouncing(true);
    bounceTimerRef.current = setTimeout(() => setBouncing(false), 620);
  }, [atBottom]);

  // ── Scroll handler: header collapse + at-bottom detection ───────────────
  function handleScroll(e) {
    const el        = e.currentTarget;
    const scrollTop = el.scrollTop;
    const scrollMax = el.scrollHeight - el.clientHeight;

    // Detect bottom (sets atBottom, which triggers bounce+timer above)
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

  const WEAK_PHRASES = ['cannot verify', 'appears to be false'];
  const takeTextLower = (currentTake?.text || '').toLowerCase();
  const hasWeakTake = WEAK_PHRASES.some(p => takeTextLower.includes(p));
  const lColor    = LEFT_COLOR[perspectiveMode]  || LEFT_COLOR.full;
  const rColor    = RIGHT_COLOR[perspectiveMode] || RIGHT_COLOR.full;

  // Representative outlets per tier — the actual RSS sources used to generate takes.
  // Used as fallback when the take doesn't carry specific source data.
  const TIER_OUTLETS = {
    left:   ['MSNBC', 'CNN', 'NPR', 'Washington Post', 'The New York Times', 'NBC News'],
    center: ['AP News', 'Reuters', 'Axios', 'Politico', 'The Hill'],
    right:  ['Wall Street Journal', 'New York Post', 'Fox News'],
  };

  // Derive sources for this perspective.
  // Priority: take.sources → topic.sourceTiers (if available) → known tier outlets.
  // Tier: indices 0-2 = left, 3 = center, 4-6 = right.
  const takeSources = (() => {
    if (currentTake?.sources?.length) return currentTake.sources;
    const tier = currentTakeIndex <= 2 ? 'left' : currentTakeIndex >= 4 ? 'right' : 'center';
    // Use stored sourceTiers if topic has them (future topics after cache rebuild)
    const tiers = topic.sourceTiers;
    if (tiers) {
      const pool = tiers[tier]?.length ? tiers[tier] : tiers.all || [];
      if (pool.length) return pool.map(s => ({ name: s.name, framing: s.label, url: s.url }));
    }
    // Fallback: show the representative outlets for this tier from our RSS source list.
    // biasCounts tells us how many articles from each tier contributed to this topic.
    const counts = topic.biasCounts || {};
    const hasTier = tier === 'left' ? (counts.left||0) > 0
                  : tier === 'right' ? (counts.right||0) > 0
                  : (counts.center||0) > 0;
    const outlets = hasTier ? TIER_OUTLETS[tier] : TIER_OUTLETS.center;
    return outlets.slice(0, 3).map(name => ({ name, framing: null, url: null }));
  })();

  // ── Sources accordion ─────────────────────────────────────────────────────
  function renderSources(sources, isSingleSource) {
    if (!sources?.length) return null;
    return (
      <div className="sources-panel">
        <button className="sources-toggle" onClick={() => setSourcesOpen(o => !o)}>
          <span className="sources-chevron">{sourcesOpen ? '▾' : '▸'}</span>
          Sources&nbsp;<span className="sources-count">({sources.length})</span>
          {isSingleSource && (
            <span className="single-source-badge" title="Based on single source">ⓘ</span>
          )}
        </button>
        {isSingleSource && sourcesOpen && (
          <p className="single-source-note">Based on single source — limited perspective diversity</p>
        )}
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
      src={topic.urlToImage}
      alt={topic.title}
      className="card-bg-image"
      onError={e => { e.target.style.display = 'none'; }}
    />
  ) : (
    <div className="card-bg-solid" />
  );

  // ── Preview card (prev/next slot) — same layout as active so no snap on transition ──
  if (isPreview) {
    return (
      <div className="swipe-card" style={{ '--accent': accent, '--card-tint': tint }}>
        <div className="card-photo-section">
          {photoEl}
          <div className="card-photo-gradient" />
          <div className="card-tint-overlay" />
          <div className="card-top-row">
            {topic.category && <span className="topic-category-badge">{topic.category}</span>}
          </div>
          <div className="card-photo-footer">
            <h2 className="card-title-overlay">{topic.title}</h2>
          </div>
        </div>
        <div className="card-scroll-inner card-preview-body" />
      </div>
    );
  }

  // ── Active card — fixed photo top + scrollable content below ─────────────
  return (
    <div
      className="swipe-card"
      style={{ '--accent': accent, '--card-tint': tint }}
    >
      {/* ── Photo section — fixed 25%, never scrolls ── */}
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

      {/* ── Scrollable content — spectrum bar + narrative ── */}
      <div
        className="card-scroll-inner"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className={`card-content-section${bouncing ? ' bounce-bottom' : ''}`} style={{ '--accent': accent }}>

          {spectrumBar && (
            <div className="card-spectrum-embed">{spectrumBar}</div>
          )}

          <div className="card-take-content">
            {/* Topic context — always shown, lighter weight */}
            {topic.summary && (
              <p className="card-summary-context">{topic.summary}</p>
            )}

            {/* Section divider with perspective label */}
            <div className="perspective-divider">
              <span className="perspective-divider-line" />
              <span className="perspective-divider-center">
                <span
                  className="perspective-divider-label"
                  style={{ color: accent }}
                >
                  {meta.label.toUpperCase()}
                </span>
                {hasWeakTake && (
                  <button
                    className="source-warning-btn"
                    onClick={() => setSourceWarningOpen(o => !o)}
                    title="Limited source coverage for this perspective"
                  >
                    ⚠
                  </button>
                )}
              </span>
              <span className="perspective-divider-line" />
            </div>
            {sourceWarningOpen && (
              <p className="source-warning-msg">
                Pending primary source for validation.
              </p>
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
                {renderSources(takeSources, currentTake.singleSource)}
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
