export default function TrendingDrawer({ topics, onClose, onSelectTopic }) {
  const trending = [...topics]
    .filter(t => t.category !== 'Sports & Culture')
    .sort((a, b) => (b.articles?.length ?? 0) - (a.articles?.length ?? 0))
    .slice(0, 10);

  return (
    <div className="trending-overlay" onClick={onClose}>
      <div className="trending-drawer" onClick={e => e.stopPropagation()}>
        <div className="trending-header">
          <span className="trending-title">🔥 Top 10 Trending</span>
          <button className="trending-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="trending-list">
          {trending.map((topic, i) => (
            <button
              key={topic.id}
              className="trending-item"
              onClick={() => { onSelectTopic(topic); onClose(); }}
            >
              <span className="trending-rank">{i + 1}</span>
              <div className="trending-item-body">
                <span className="trending-item-title">{topic.title}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
