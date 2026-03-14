import { useState, useEffect, useRef, useCallback } from 'react';

// ── Word-by-word streaming animation ─────────────────────────────────────────
function useStreamingText(text, speedMs = 35) {
  const [displayed, setDisplayed] = useState('');
  const textRef = useRef('');

  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    // Reset when text changes (new topic or position)
    textRef.current = text;
    setDisplayed('');
    const words = text.split(' ');
    let i = 0;
    const id = setInterval(() => {
      i++;
      // Guard against stale closure: make sure we're still on same text
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

// ── Voting sub-component — corner mode (bottom-left 👎, bottom-right 👍) ─────
function VotingButtons({ topicId }) {
  const voteKey   = `vote:${topicId}`;
  const countsKey = `votecounts:${topicId}`;

  const [userVote,  setUserVote]  = useState(() => localStorage.getItem(voteKey));
  const [votes,     setVotes]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(countsKey)) || { up: 0, down: 0 }; }
    catch { return { up: 0, down: 0 }; }
  });
  const [animating, setAnimating] = useState(null);

  const castVote = useCallback((dir) => {
    if (userVote) return;
    setAnimating(dir);
    setTimeout(() => setAnimating(null), 600);
    const next = {
      up:   votes.up   + (dir === 'up'   ? 1 : 0),
      down: votes.down + (dir === 'down' ? 1 : 0),
    };
    setVotes(next);
    setUserVote(dir);
    localStorage.setItem(voteKey,   dir);
    localStorage.setItem(countsKey, JSON.stringify(next));
  }, [userVote, votes, voteKey, countsKey]);

  return (
    <>
      {/* Bottom-left: thumbs down */}
      <button
        className={[
          'vote-btn',
          userVote === 'down'  ? 'voted'     : '',
          userVote === 'up'    ? 'other-voted': '',
          animating === 'down' ? 'vote-anim'  : '',
        ].filter(Boolean).join(' ')}
        onClick={() => castVote('down')}
        aria-label="Thumbs down"
        disabled={!!userVote}
      >
        👎 <span className="vote-count">{votes.down}</span>
      </button>

      {/* Bottom-right: thumbs up */}
      <button
        className={[
          'vote-btn',
          userVote === 'up'   ? 'voted'     : '',
          userVote === 'down' ? 'other-voted': '',
          animating === 'up'  ? 'vote-anim'  : '',
        ].filter(Boolean).join(' ')}
        onClick={() => castVote('up')}
        aria-label="Thumbs up"
        disabled={!!userVote}
      >
        👍 <span className="vote-count">{votes.up}</span>
      </button>
    </>
  );
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

const LIMITED_INDICES = [1, 3, 5]; // Left, Neutral, Right

const TAKE_META = [
  { label: 'Far Left',     color: '#1d4ed8' },
  { label: 'Left',         color: '#3b82f6' },
  { label: 'Center-Left',  color: '#818cf8' },
  { label: 'Neutral',      color: '#a78bfa' },
  { label: 'Center-Right', color: '#f97316' },
  { label: 'Right',        color: '#ef4444' },
  { label: 'Far Right',    color: '#dc2626' },
];

// ── Sports / Tech label overrides for loading state ───────────────────────────
// These map take index → {label, color} for non-political perspectives
const SPORTS_META_OVERRIDE = {
  1: { label: 'Fan',      color: '#f97316' },
  3: { label: 'Analyst',  color: '#a78bfa' },
  5: { label: 'Business', color: '#22d3ee' },
};
const TECH_META_OVERRIDE = {
  1: { label: 'Optimist', color: '#3b82f6' },
  3: { label: 'Skeptic',  color: '#f59e0b' },
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
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [atBound,     setAtBound]     = useState(null); // 'top' | 'bottom' | null

  const cardBodyRef = useRef(null);

  // Word-by-word animation for take text
  const displayedText = useStreamingText(currentTake?.text ?? '');

  // Reset scroll states when topic changes
  useEffect(() => {
    setSourcesOpen(false);
    setAtBound(null);
    if (cardBodyRef.current) cardBodyRef.current.scrollTop = 0;
  }, [topic.id]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    const atTop    = el.scrollTop <= 5;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5;
    if (atTop && atBottom) setAtBound(null);  // content fits, no scroll needed
    else if (atTop)        setAtBound('top');
    else if (atBottom)     setAtBound('bottom');
    else                   setAtBound(null);
  };

  const isNeutral  = currentTakeIndex === 3;
  const isNonFull  = perspectiveMode !== 'full'; // sports, tech, limited all use 3 positions
  const tint       = CARD_TINTS[currentTakeIndex] ?? CARD_TINTS[3];
  const accent     = currentTake?.color || '#a78bfa';
  const canGoLeft  = isNonFull
    ? LIMITED_INDICES.some(i => i < currentTakeIndex)
    : currentTakeIndex > 0;
  const canGoRight = isNonFull
    ? LIMITED_INDICES.some(i => i > currentTakeIndex)
    : currentTakeIndex < 6;
  const timestamp  = formatAge(topic.latestPublishedAt);

  // ── Shared: vote strip (bottom-left 👎, bottom-right 👍) ─────────────────
  const voteStrip = (
    <div className="card-vote-strip">
      <VotingButtons topicId={topic.id} />
    </div>
  );

  // ── Shared: swipe indicator row ──────────────────────────────────────────
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

  // ── Shared: image or no-image header ─────────────────────────────────────
  function renderImage(variant) {
    if (!topic.urlToImage) {
      return (
        <div className={`card-no-image-header${variant === 'neutral' ? ' neutral-no-image' : ''}`}>
          {variant === 'neutral' && topic.category && (
            <span className="topic-category-badge">{topic.category}</span>
          )}
          {variant !== 'neutral' && <p className="card-eyebrow">TODAY'S TOPIC</p>}
          <h2 className="card-topic-title-large">{topic.title}</h2>
        </div>
      );
    }
    return (
      <div className={`card-image-container${variant === 'neutral' ? ' neutral-image' : ''}`}>
        <img
          src={topic.urlToImage}
          alt={topic.title}
          className="card-image"
          onError={(e) => { e.target.closest('.card-image-container').style.display = 'none'; }}
        />
        <div className={`card-image-overlay${variant === 'neutral' ? ' neutral-overlay' : ''}`} />
        {variant === 'neutral' ? (
          <div className="neutral-image-content">
            {topic.category && <span className="topic-category-badge">{topic.category}</span>}
            <h2 className="neutral-card-title">{topic.title}</h2>
          </div>
        ) : (
          <span className="card-image-topic-badge">{topic.title}</span>
        )}
      </div>
    );
  }

  // ── Shared: sources accordion ─────────────────────────────────────────────
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

  // ── Scroll boundary hint ─────────────────────────────────────────────────
  const scrollHint = atBound && (
    <div className={`scroll-hint scroll-hint-${atBound}`}>
      {atBound === 'top' ? '↑' : '↓'}
    </div>
  );

  // ── NEUTRAL CARD ──────────────────────────────────────────────────────────
  if (isNeutral) {
    return (
      <div className="swipe-card neutral-card" style={{ '--card-tint': tint, '--accent': '#a78bfa' }}>
        <div className="card-body card-body-with-image" ref={cardBodyRef} onScroll={handleScroll}>
          {renderImage('neutral')}
          <div className="card-body-content">
            {scrollHint}
            {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}

            {topic.summary && <p className="neutral-blurb">{topic.summary}</p>}

            {!currentTake && takesLoading && (
              <div className="neutral-take-loading">
                <span className="spinner-ring-sm" />
                <span>Loading analysis…</span>
              </div>
            )}

            {currentTake && (
              <div className="take-text">
                {displayedText.split('\n\n').map((p, i) => (
                  <p key={i}>{p.trim()}</p>
                ))}
              </div>
            )}

            {currentTake && renderSources(currentTake.sources)}
          </div>
        </div>

        {voteStrip}
        {navArrows}
      </div>
    );
  }

  // ── PERSPECTIVE CARD — loading ────────────────────────────────────────────
  if (!currentTake) {
    const baseMeta = TAKE_META[currentTakeIndex] ?? TAKE_META[3];
    const override =
      perspectiveMode === 'sports' ? SPORTS_META_OVERRIDE[currentTakeIndex] :
      perspectiveMode === 'tech'   ? TECH_META_OVERRIDE[currentTakeIndex]   : null;
    const meta = override ? { ...baseMeta, ...override } : baseMeta;
    return (
      <div className="swipe-card" style={{ '--card-tint': tint, '--accent': meta.color }}>
        <div className="card-body card-body-with-image" ref={cardBodyRef} onScroll={handleScroll}>
          {renderImage()}
          <div className="card-body-content">
            {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}
            <div
              className="perspective-badge"
              style={{ color: meta.color, borderLeftColor: meta.color, background: `${meta.color}18` }}
            >
              {meta.label} Perspective
            </div>
            <div className="take-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
            </div>
          </div>
        </div>
        {voteStrip}
        {navArrows}
      </div>
    );
  }

  // ── PERSPECTIVE CARD — loaded ─────────────────────────────────────────────
  return (
    <div className="swipe-card" style={{ '--card-tint': tint, '--accent': accent }}>
      <div className="card-body card-body-with-image" ref={cardBodyRef} onScroll={handleScroll}>
        {renderImage()}
        <div className="card-body-content">
          {scrollHint}
          {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}
          <div
            className="perspective-badge"
            style={{ color: accent, borderLeftColor: accent, background: `${accent}18` }}
          >
            {currentTake.label} Perspective
          </div>
          <div className="take-text">
            {displayedText.split('\n\n').map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
          </div>
          {renderSources(currentTake.sources)}
        </div>
      </div>
      {voteStrip}
      {navArrows}
    </div>
  );
}
