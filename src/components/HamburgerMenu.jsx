import { useState } from 'react';

const TIME_OPTIONS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '48h', label: 'Last 48 Hours' },
  { value: '72h', label: 'Last 72 Hours' },
];

export default function HamburgerMenu({ onClose, onShowTrending, onShowInfo, timeFilter, onTimeFilterChange }) {
  const [timeOpen, setTimeOpen] = useState(false);

  const items = [
    { label: 'Profile',             icon: '👤', disabled: true,  note: 'Coming soon' },
    { label: '🔥 Top 10 Trending',  disabled: false, action: () => { onShowTrending(); onClose(); } },
    { label: 'Settings',            icon: '⚙️', disabled: true,  note: 'Coming soon' },
    { label: 'Contact Us',          icon: '✉️', disabled: true,  note: 'Coming soon' },
    { label: 'About / Disclaimer',  icon: 'ℹ️', disabled: false, action: () => { onShowInfo(); onClose(); } },
  ];

  return (
    <div className="hamburger-overlay" onClick={onClose}>
      <div className="hamburger-drawer" onClick={e => e.stopPropagation()}>
        <div className="hamburger-header">
          <span className="hamburger-title">Menu</span>
          <button className="hamburger-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        {/* Time range filter — accordion */}
        <div className="hamburger-section">
          <button
            className="hamburger-section-toggle"
            onClick={() => setTimeOpen(o => !o)}
          >
            <span className="hamburger-section-label">Time Range</span>
            <span className="hamburger-section-chevron">{timeOpen ? '▾' : '▸'}</span>
          </button>
          {timeOpen && (
            <div className="hamburger-time-options">
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`hamburger-time-btn${timeFilter === opt.value ? ' active' : ''}`}
                  onClick={() => { onTimeFilterChange?.(opt.value); onClose(); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="hamburger-nav">
          {items.map((item, i) => (
            <button
              key={i}
              className={`hamburger-item${item.disabled ? ' disabled' : ''}`}
              onClick={item.disabled ? undefined : item.action}
              disabled={item.disabled}
            >
              <span className="hamburger-item-label">{item.label}</span>
              {item.note && <span className="hamburger-item-note">{item.note}</span>}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
