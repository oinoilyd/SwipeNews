import { useState, useEffect } from 'react';

function fallback(list) {
  return [...list]
    .sort((a, b) => (b.articles?.length ?? 0) - (a.articles?.length ?? 0))
    .slice(0, 10);
}

export default function TrendingDrawer({ topics, onClose, onSelectTopic }) {
  const [ranked, setRanked] = useState(null);

  useEffect(() => {
    const eligible = topics.filter(t => t.category !== 'Sports & Culture');
    const payload  = eligible.map(t => ({ title: t.title, articleCount: t.articles?.length ?? 0 }));

    fetch('/api/trending', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topics: payload }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.trending?.length) {
          // Map ranked title entries back to full topic objects by exact title match
          const byTitle = Object.fromEntries(eligible.map(t => [t.title, t]));
          const matched = data.trending.map(r => byTitle[r.title]).filter(Boolean);
          setRanked(matched.length ? matched : fallback(eligible));
        } else {
          setRanked(fallback(eligible));
        }
      })
      .catch(() => setRanked(fallback(eligible)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="trending-overlay" onClick={onClose}>
      <div className="trending-drawer" onClick={e => e.stopPropagation()}>
        <div className="trending-header">
          <span className="trending-title">🔥 Hot Trending</span>
          <button className="trending-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="trending-list">
          {ranked === null ? (
            <p style={{ color: '#888', padding: '12px 16px', fontSize: '0.85rem' }}>Loading…</p>
          ) : ranked.length === 0 ? (
            <p style={{ color: '#888', padding: '12px 16px', fontSize: '0.85rem' }}>No trending topics yet.</p>
          ) : (
            ranked.map((topic, i) => (
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
