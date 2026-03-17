// Sub-categories that roll up into the combined "Politics" meta-pill
export const POLITICAL_CATS = [
  'US Politics',
  'World',
  'Policy',
  'Economy',
  'National Security',
  'Elections',
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
export default function CategoryFilter({ activeCategories, onToggle, topicShells, trendingCount = 0 }) {
  const counts = topicShells.reduce((acc, t) => {
    const cat = t.category || 'US Politics';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount    = topicShells.length;
  const politicsCount = POLITICAL_CATS.reduce((sum, c) => sum + (counts[c] || 0), 0);
  const allActive     = activeCategories.length === 0;
  const top10Active   = activeCategories.includes('Top 10');

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      {/* Top 10 pill — always first after All */}
      <button
        role="tab"
        aria-selected={allActive}
        className={`cat-pill ${allActive ? 'active' : ''}`}
        onClick={() => onToggle('All')}
      >
        All
        {totalCount > 0 && <span className="cat-count">{totalCount}</span>}
      </button>

      <button
        role="tab"
        aria-selected={top10Active}
        className={`cat-pill cat-pill-trending ${top10Active ? 'active' : ''}`}
        onClick={() => onToggle('Top 10')}
      >
        🔥 Top 10
        {trendingCount > 0 && <span className="cat-count">{trendingCount}</span>}
      </button>

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
