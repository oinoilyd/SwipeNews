export const CATEGORIES = [
  'All',
  'Top US',
  'World',
  'Politics',
  'Economy',
  'Technology',
  'Health',
  'Military',
  'Climate',
  'Crime',
  'Sports & Culture',
];

export default function CategoryFilter({ activeCategory, onSelect, topicShells }) {
  // Count topics per category
  const counts = topicShells.reduce((acc, t) => {
    const cat = t.category || 'Top US';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCount = topicShells.length;

  return (
    <div className="category-filter" role="tablist" aria-label="Filter by category">
      {CATEGORIES.map(cat => {
        const count = cat === 'All' ? totalCount : (counts[cat] || 0);
        const isActive = activeCategory === cat;
        const isEmpty  = count === 0 && cat !== 'All';

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={isActive}
            className={`cat-pill ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : ''}`}
            onClick={() => !isEmpty && onSelect(cat)}
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
