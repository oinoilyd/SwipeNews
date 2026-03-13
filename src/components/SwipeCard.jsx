import { useState, useEffect } from 'react';

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

// ── Voting sub-component (neutral card only) — localStorage only ──────────────
function VotingButtons({ topicId }) {
  const voteKey   = `vote:${topicId}`;
  const countsKey = `votecounts:${topicId}`;

  const [userVote,  setUserVote]  = useState(() => localStorage.getItem(voteKey));
  const [votes,     setVotes]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(countsKey)) || { up: 0, down: 0 }; }
    catch { return { up: 0, down: 0 }; }
  });
  const [animating, setAnimating] = useState(null);

  function castVote(dir) {
    setAnimating(dir);
    setTimeout(() => setAnimating(null), 600);

    let next;

    if (userVote === dir) {
      // Tap same button → remove vote
      next = {
        up:   votes.up   - (dir === 'up'   ? 1 : 0),
        down: votes.down - (dir === 'down' ? 1 : 0),
      };
      setUserVote(null);
      localStorage.removeItem(voteKey);
    } else if (userVote && userVote !== dir) {
      // Tap opposite → switch vote
      next = {
        up:   votes.up   + (dir === 'up'   ? 1 : -1),
        down: votes.down + (dir === 'down' ? 1 : -1),
      };
      setUserVote(dir);
      localStorage.setItem(voteKey, dir);
    } else {
      // No vote yet → cast
      next = {
        up:   votes.up   + (dir === 'up'   ? 1 : 0),
        down: votes.down + (dir === 'down' ? 1 : 0),
      };
      setUserVote(dir);
      localStorage.setItem(voteKey, dir);
    }

    setVotes(next);
    localStorage.setItem(countsKey, JSON.stringify(next));
  }

  return (
    <div className="voting-row">
      <span className="voting-label">Was this coverage balanced?</span>
      <div className="voting-btns">
        <button
          className={[
            'vote-btn',
            userVote === 'up'   ? 'voted'     : '',
            animating === 'up'  ? 'vote-anim' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => castVote('up')}
          aria-label="Thumbs up"
        >
          👍 <span className="vote-count">{votes.up}</span>
        </button>

        <button
          className={[
            'vote-btn',
            userVote === 'down'  ? 'voted'     : '',
            animating === 'down' ? 'vote-anim' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => castVote('down')}
          aria-label="Thumbs down"
        >
          👎 <span className="vote-count">{votes.down}</span>
        </button>
      </div>
    </div>
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
  const [sourcesOpen,      setSourcesOpen]      = useState(false);
  const [neutralExpanded,  setNeutralExpanded]  = useState(false);

  // Reset expand states when topic changes
  useEffect(() => {
    setNeutralExpanded(false);
    setSourcesOpen(false);
  }, [topic.id]);

  const isNeutral  = currentTakeIndex === 3;
  const isLimited  = perspectiveMode === 'limited';
  const tint       = CARD_TINTS[currentTakeIndex] ?? CARD_TINTS[3];
  const accent     = currentTake?.color || '#a78bfa';
  const canGoLeft  = isLimited
    ? LIMITED_INDICES.some(i => i < currentTakeIndex)
    : currentTakeIndex > 0;
  const canGoRight = isLimited
    ? LIMITED_INDICES.some(i => i > currentTakeIndex)
    : currentTakeIndex < 6;
  const timestamp  = formatAge(topic.latestPublishedAt);

  // ── Shared: nav arrows ────────────────────────────────────────────────────
  const navArrows = (
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

  // ── NEUTRAL CARD — always shows image + summary; AI analysis expands ──────
  if (isNeutral) {
    return (
      <div className="swipe-card neutral-card" style={{ '--card-tint': tint, '--accent': '#a78bfa' }}>
        {renderImage('neutral')}

        <div className="card-body">
          {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}

          {topic.summary && <p className="neutral-blurb">{topic.summary}</p>}

          {/* Expandable AI analysis */}
          {!currentTake && takesLoading && (
            <div className="neutral-take-loading">
              <span className="spinner-ring-sm" />
              <span>Loading analysis…</span>
            </div>
          )}

          {currentTake && (
            <div className="neutral-expand-section">
              <button
                className={`neutral-read-more-btn${neutralExpanded ? ' open' : ''}`}
                onClick={() => setNeutralExpanded(e => !e)}
              >
                {neutralExpanded ? '▴ Show less' : '▾ Read full neutral analysis'}
              </button>
              {neutralExpanded && (
                <div className="neutral-full-take">
                  <div className="take-text">
                    {currentTake.text.split('\n\n').map((p, i) => (
                      <p key={i}>{p.trim()}</p>
                    ))}
                  </div>
                  {renderSources(currentTake.sources)}
                </div>
              )}
            </div>
          )}

          {/* Voting — uses key prop to force re-mount per topic */}
          <VotingButtons key={topic.id} topicId={topic.id} />
        </div>

        {navArrows}
      </div>
    );
  }

  // ── PERSPECTIVE CARD — loading ────────────────────────────────────────────
  if (!currentTake) {
    return (
      <div className="swipe-card" style={{ '--card-tint': tint, '--accent': '#a78bfa' }}>
        {renderImage()}
        <div className="card-body">
          {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}
          <div className="takes-loading-state">
            <div className="spinner-ring" />
            <p className="takes-loading-label">
              {takesLoading ? 'Generating perspective…' : 'Loading…'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── PERSPECTIVE CARD — loaded ─────────────────────────────────────────────
  return (
    <div className="swipe-card" style={{ '--card-tint': tint, '--accent': accent }}>
      {renderImage()}
      <div className="card-body">
        {timestamp && <p className="card-timestamp">Updated {timestamp}</p>}
        <div
          className="perspective-badge"
          style={{ color: accent, borderLeftColor: accent, background: `${accent}18` }}
        >
          {currentTake.label} Perspective
        </div>
        <div className="take-text">
          {currentTake.text.split('\n\n').map((p, i) => (
            <p key={i}>{p.trim()}</p>
          ))}
        </div>
        {renderSources(currentTake.sources)}
      </div>
      {navArrows}
    </div>
  );
}
