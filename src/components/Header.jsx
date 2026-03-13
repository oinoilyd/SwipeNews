import { useState } from 'react';

function InfoModal({ onClose }) {
  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal-card" onClick={e => e.stopPropagation()}>
        <div className="info-modal-header">
          <span className="info-modal-title">About SwipeNews</span>
          <button className="info-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="info-modal-text">
          SwipeNews uses established media bias ratings (AllSides, Ground News) to
          categorize news sources as left, center, or right leaning. AI perspectives
          are synthesized from multiple outlets within each bias tier. The AI uses
          its own discretion to interpret and summarize each source's framing —
          these are AI-generated narratives, not direct quotes.
        </p>
      </div>
    </div>
  );
}

export default function Header({ onRefresh, topicNumber, totalTopics, onShowTopics }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
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
          <button
            className="header-btn header-btn-icon"
            onClick={() => setShowInfo(true)}
            title="About bias ratings"
            aria-label="About bias ratings"
          >
            ℹ
          </button>
          <button className="header-btn" onClick={onRefresh} title="Refresh news">
            ↻ Refresh
          </button>
        </div>
      </header>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}
