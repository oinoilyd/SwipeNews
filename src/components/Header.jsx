import { useState } from 'react';
import HamburgerMenu from './HamburgerMenu';

export default function Header({ onRefresh, onShowTopics, onShowTrending }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <button
            className="header-btn header-btn-sm"
            onClick={() => setShowMenu(true)}
            title="Menu"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="logo-icon">📰</span>
          <span className="logo-text">SwipeNews</span>
        </div>

        <div className="header-controls">
          <button
            className="header-btn header-btn-xs"
            onClick={() => setShowInfo(true)}
            title="About bias ratings"
            aria-label="About bias ratings"
          >
            ℹ
          </button>
          <button
            className="header-btn header-btn-xs"
            onClick={onRefresh}
            title="Refresh news"
          >
            ↻
          </button>
        </div>
      </header>

      {showInfo && (
        <div className="info-modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="info-modal-card" onClick={e => e.stopPropagation()}>
            <div className="info-modal-header">
              <span className="info-modal-title">About SwipeNews</span>
              <button className="info-modal-close" onClick={() => setShowInfo(false)} aria-label="Close">✕</button>
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
      )}

      {showMenu && (
        <HamburgerMenu
          onClose={() => setShowMenu(false)}
          onShowTrending={onShowTrending}
          onShowInfo={() => { setShowMenu(false); setShowInfo(true); }}
          onShowTopics={() => { setShowMenu(false); onShowTopics(); }}
        />
      )}
    </>
  );
}
