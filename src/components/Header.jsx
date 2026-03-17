import { useState } from 'react';
import HamburgerMenu from './HamburgerMenu';

export default function Header({ onRefresh, onShowTopics, onShowTrending, timeFilter, onTimeFilterChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false); // triggered from hamburger "About"

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
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="hdr-pg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6d28d9" />
                <stop offset="100%" stopColor="#c4b5fd" />
              </linearGradient>
            </defs>
            <rect width="28" height="28" rx="7" fill="url(#hdr-pg)" />
            <text x="14" y="21" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontWeight="700" fontSize="19" fill="white">P</text>
          </svg>
          <span className="logo-text">Perspectiv</span>
        </div>

        <div className="header-controls">
          <button
            className="header-btn header-btn-xs"
            onClick={() => setShowInfo(true)}
            title="About / Disclaimer"
            aria-label="About and disclaimer"
          >
            ℹ
          </button>
          <button
            className="header-btn header-btn-xs"
            onClick={onRefresh}
            title="Refresh news"
            aria-label="Refresh news"
          >
            ↻
          </button>
        </div>
      </header>

      {showInfo && (
        <div className="info-modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="info-modal-card" onClick={e => e.stopPropagation()}>
            <div className="info-modal-header">
              <span className="info-modal-title">About Perspectiv</span>
              <button className="info-modal-close" onClick={() => setShowInfo(false)} aria-label="Close">✕</button>
            </div>
            <p className="info-modal-text">
              Perspectiv uses established media bias ratings (AllSides, Ground News) to
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
          timeFilter={timeFilter}
          onTimeFilterChange={onTimeFilterChange}
        />
      )}
    </>
  );
}
