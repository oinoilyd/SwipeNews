export default function FollowingDrawer({ threads, activeThread, onSelect, onClose }) {
  return (
    <div className="following-drawer-backdrop">
      <div className="following-drawer">
        <div className="following-drawer-header">
          <div className="following-drawer-title-row">
            <span className="following-drawer-eyebrow">● LIVE</span>
            <span className="following-drawer-title">Ongoing Stories</span>
          </div>
          <button className="following-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="following-drawer-list">
          {threads.length === 0 ? (
            <p className="following-drawer-empty">No ongoing stories tracked yet — check back after the next refresh.</p>
          ) : threads.map(thread => {
            const isActive = activeThread?.id === thread.id;
            return (
              <button
                key={thread.id}
                className={`following-thread-item${isActive ? ' active' : ''}`}
                onClick={() => onSelect(thread)}
              >
                <div className="following-thread-main">
                  <span className="following-thread-title">{thread.title}</span>
                  <span className="following-thread-meta">
                    {thread.topicIds?.length || 1} card{thread.topicIds?.length !== 1 ? 's' : ''} · {thread.articleCount} sources
                  </span>
                </div>
                {isActive && <span className="following-thread-check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
