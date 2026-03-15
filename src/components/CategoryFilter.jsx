export const CATEGORIES = [
  'All',
  'US Politics',
  'World',
  'Policy',
  'Economy',
  'National Security',
  'Elections',
  'Technology',
  'Health',
  'Sports & Culture',
];

// activeCategories: string[] — empty means "All"
export default function CategoryFilter({ activeCategories, onToggle, topicShells }) {
  const counts = topicShells.reduce((acc, t) => {
    const cat = t.category || 'US Politics';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount = topicShells.length;
  const allActive  = activeCategories.length === 0;

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      {CATEGORIES.map(cat => {
        const count   = cat === 'All' ? totalCount : (counts[cat] || 0);
        const isActive = cat === 'All' ? allActive : activeCategories.includes(cat);
        const isEmpty  = count === 0 && cat !== 'All';

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
