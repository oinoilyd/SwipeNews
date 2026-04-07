import { useState, useEffect, useRef } from 'react';

// Sub-categories that roll up into the combined "Politics" meta-pill
export const POLITICAL_CATS = [
  'US Politics',
  'World',
  'Policy',
  'Economy',
  'National Security',
  'Elections',
];

// Categories included in the "Hot" feed (news/world/politics — no sports/tech/entertainment)
export const HOT_CATS = [
  'US Politics',
  'World',
  'Policy',
  'Economy',
  'National Security',
  'Elections',
  'Health',
];

export const CATEGORIES = [
  'All',
  'Politics',           // ← combined meta-category for all political sub-categories
  'US Politics',
  'World',
  'Policy',
  'Economy',
  'National Security',
  'Elections',
  'Technology',
  'Health',
  'Sports & Culture',
  'Entertainment',
];

// activeCategories: string[] — empty means "All"
export default function CategoryFilter({
  activeCategories,
  onToggle,
  topicShells,
  trendingCount = 0,
  followingThreads = [],
  activeFollowingThread,
  onFollowingSelect,
}) {
  const [followOpen, setFollowOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!followOpen) return;
    const handler = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setFollowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [followOpen]);

  const counts = topicShells.reduce((acc, t) => {
    const cat = t.category || 'US Politics';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount    = topicShells.length;
  const politicsCount = POLITICAL_CATS.reduce((sum, c) => sum + (counts[c] || 0), 0);
  const allActive     = activeCategories.length === 0;
  const hotActive     = activeCategories.includes('Hot');
  const followActive  = !!activeFollowingThread;

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      {/* All pill */}
      <button
        role="tab"
        aria-selected={allActive}
        className={`cat-pill ${allActive ? 'active' : ''}`}
        onClick={() => onToggle('All')}
      >
        All
        {totalCount > 0 && <span className="cat-count">{totalCount}</span>}
      </button>

      {/* Hot pill — popular news, world & politics */}
      <button
        role="tab"
        aria-selected={hotActive}
        className={`cat-pill cat-pill-trending ${hotActive ? 'active' : ''}`}
        onClick={() => onToggle('Hot')}
      >
        🔥 Hot
        {trendingCount > 0 && <span className="cat-count">{trendingCount}</span>}
      </button>

      {/* Follow pill — dropdown of ongoing developing stories */}
      {followingThreads.length > 0 && (
        <div className="follow-pill-wrapper" ref={wrapperRef}>
          <button
            role="tab"
            aria-selected={followActive}
            className={`cat-pill cat-pill-following${followActive ? ' active' : ''}`}
            onClick={() => setFollowOpen(o => !o)}
          >
            {activeFollowingThread ? activeFollowingThread.title : 'Follow'}
            <span className="follow-caret">{followOpen ? '▴' : '▾'}</span>
          </button>

          {followOpen && (
            <div className="follow-dropdown">
              {activeFollowingThread && (
                <button
                  className="follow-dropdown-item follow-dropdown-clear"
                  onClick={() => { onFollowingSelect(null); setFollowOpen(false); }}
                >
                  ✕ Clear filter
                </button>
              )}
              {followingThreads.map(thread => (
                <button
                  key={thread.id}
                  className={`follow-dropdown-item${activeFollowingThread?.id === thread.id ? ' active' : ''}`}
                  onClick={() => { onFollowingSelect(thread); setFollowOpen(false); }}
                >
                  {thread.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {CATEGORIES.filter(c => c !== 'All').map(cat => {
        let count;
        if (cat === 'Politics') count = politicsCount;
        else                    count = counts[cat] || 0;

        const isActive =
          cat === 'Politics' ? activeCategories.includes('Politics') :
                               activeCategories.includes(cat);

        const isEmpty = count === 0;

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={isActive}
            className={`cat-pill ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : ''}`}
            onClick={() => !isEmpty && onToggle(cat)}
            disabled={isEmpty}
          >
            {cat}
            {count > 0 && <span className="cat-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
