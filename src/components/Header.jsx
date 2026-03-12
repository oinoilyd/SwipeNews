export default function Header({ onRefresh, topicNumber, totalTopics, onShowTopics }) {
  return (
    <header className="header">
      <div className="header-logo">
        <button
          className="header-btn"
          onClick={onShowTopics}
          title="Browse all topics"
          aria-label="Open topic list"
          style={{ padding: '5px 8px' }}
        >
          ☰
        </button>
        <span className="logo-icon">📰</span>
        <span className="logo-text">SwipeNews</span>
      </div>

      <div className="header-controls">
        {totalTopics > 0 && (
          <span className="header-counter">{topicNumber} / {totalTopics}</span>
        )}
        <button className="header-btn" onClick={onRefresh} title="Refresh news">
          ↻ Refresh
        </button>
      </div>
    </header>
  );
}
