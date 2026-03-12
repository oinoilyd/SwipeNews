import { useEffect, useRef } from 'react';

export default function TopicDrawer({ topics, takesMap = {}, currentIndex, onSelect, onClose }) {
  const listRef = useRef(null);

  useEffect(() => {
    const active = listRef.current?.querySelector('.drawer-item.active');
    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      <div className="topic-drawer" role="dialog" aria-label="All topics">
        <div className="drawer-header">
          <h3 className="drawer-title">All Topics</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-list" ref={listRef}>
          {topics.map((topic, i) => (
            <button
              key={topic.id}
              className={`drawer-item ${i === currentIndex ? 'active' : ''}`}
              onClick={() => onSelect(i)}
            >
              <div className="drawer-item-num">{i + 1}</div>

              <div className="drawer-item-content">
                <div className="drawer-item-title">{topic.title}</div>
                {topic.summary && (
                  <div className="drawer-item-summary">{topic.summary}</div>
                )}
                <div className="drawer-coverage">
                  {(() => {
                    const byPos = takesMap[topic.id] || {};
                    const loaded = Object.keys(byPos).length;
                    if (loaded === 0) return (
                      <span className="cov-pill cov-loading">Loading…</span>
                    );
                    if (loaded >= 7) return (
                      <span className="cov-pill cov-total">✓ All 7 perspectives</span>
                    );
                    return (
                      <span className="cov-pill cov-partial">{loaded} / 7 perspectives</span>
                    );
                  })()}
                </div>
              </div>

              {i === currentIndex && <div className="drawer-item-dot" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
