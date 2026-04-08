import { t, tCat } from '../lib/i18n.js';

// Sub-categories that roll up into the combined "Politics" meta-pill
export const POLITICAL_CATS = [
  'US Politics', 'World', 'Policy', 'Economy', 'National Security', 'Elections',
];

// Categories included in the "Hot" feed
export const HOT_CATS = [
  'US Politics', 'World', 'Policy', 'Economy', 'National Security', 'Elections', 'Health',
];

export const CATEGORIES = [
  'All', 'Politics', 'US Politics', 'World', 'Policy', 'Economy',
  'National Security', 'Elections', 'Technology', 'Health', 'Sports & Culture', 'Entertainment',
];

export default function CategoryFilter({
  activeCategories,
  onToggle,
  topicShells,
  trendingCount = 0,
  followingThreads = [],
  activeFollowingThread,
  onFollowingOpen,
  lang = 'en',
  activeMode = 'feed',
  onAskMode,
  onHistoryOpen,
  historyDisputeTitle = null,
}) {
  const counts = topicShells.reduce((acc, t2) => {
    const cat = t2.category || 'US Politics';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount    = topicShells.length;
  const politicsCount = POLITICAL_CATS.reduce((sum, c) => sum + (counts[c] || 0), 0);
  const allActive     = activeCategories.length === 0;
  const hotActive     = activeCategories.includes('Hot');
  const followActive  = !!activeFollowingThread;
  const askActive     = activeMode === 'ask';
  const historyActive = activeMode === 'history';

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">

      {/* 1 — Ask */}
      <button
        role="tab"
        aria-selected={askActive}
        className={`cat-pill cat-pill-ask${askActive ? ' active' : ''}`}
        onClick={onAskMode}
      >
        ✦ Ask
      </button>

      {/* 2 — History (opens drawer) */}
      <button
        role="tab"
        aria-selected={historyActive}
        className={`cat-pill cat-pill-history${historyActive ? ' active' : ''}`}
        onClick={onHistoryOpen}
      >
        {historyActive && historyDisputeTitle ? historyDisputeTitle : '⚔ History'}
        <span className="follow-caret">▾</span>
      </button>

      {/* 3 — Follow (conditional, opens drawer) */}
      {followingThreads.length > 0 && (
        <button role="tab" aria-selected={followActive}
          className={`cat-pill cat-pill-following${followActive ? ' active' : ''}`}
          onClick={onFollowingOpen}>
          {followActive ? activeFollowingThread.title : t('follow', lang)}
          <span className="follow-caret">▾</span>
        </button>
      )}

      {/* 4 — Hot */}
      <button role="tab" aria-selected={hotActive}
        className={`cat-pill cat-pill-trending${hotActive ? ' active' : ''}`}
        onClick={() => onToggle('Hot')}>
        {t('hot', lang)}
        {trendingCount > 0 && <span className="cat-count">{trendingCount}</span>}
      </button>

      {/* 5 — All */}
      <button role="tab" aria-selected={allActive}
        className={`cat-pill${allActive ? ' active' : ''}`}
        onClick={() => onToggle('All')}>
        {t('all', lang)}
        {totalCount > 0 && <span className="cat-count">{totalCount}</span>}
      </button>

      {/* 6+ — Category pills */}
      {CATEGORIES.filter(c => c !== 'All').map(cat => {
        const count    = cat === 'Politics' ? politicsCount : (counts[cat] || 0);
        const isActive = cat === 'Politics'
          ? activeCategories.includes('Politics')
          : activeCategories.includes(cat);
        const isEmpty  = count === 0;
        return (
          <button key={cat} role="tab" aria-selected={isActive}
            className={`cat-pill${isActive ? ' active' : ''}${isEmpty ? ' empty' : ''}`}
            onClick={() => !isEmpty && onToggle(cat)}
            disabled={isEmpty}>
            {tCat(cat, lang)}
            {count > 0 && <span className="cat-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
