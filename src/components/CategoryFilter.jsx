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
export default function CategoryFilter({ activeCategories, onToggle, topicShells }) {
  const counts = topicShells.reduce((acc, t) => {
    const cat = t.category || 'US Politics';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount    = topicShells.length;
  const politicsCount = POLITICAL_CATS.reduce((sum, c) => sum + (counts[c] || 0), 0);
  const allActive     = activeCategories.length === 0;

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      {CATEGORIES.map(cat => {
        let count;
        if (cat === 'All')      count = totalCount;
        else if (cat === 'Politics') count = politicsCount;
        else                    count = counts[cat] || 0;

        // "Politics" is active when ALL political sub-categories are effectively selected
        // (either directly or via the meta-pill)
        const isActive =
          cat === 'All'      ? allActive :
          cat === 'Politics' ? activeCategories.includes('Politics') :
                               activeCategories.includes(cat);

        const isEmpty = count === 0 && cat !== 'All';

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
