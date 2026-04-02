import { useState, useEffect } from 'react';

const TIME_OPTIONS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '48h', label: 'Last 48 Hours' },
  { value: '72h', label: 'Last 72 Hours' },
];

export default function HamburgerMenu({ onClose, onShowTrending, onShowInfo, timeFilter, onTimeFilterChange }) {
  const [timeOpen,      setTimeOpen]      = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIOSGuide,  setShowIOSGuide]  = useState(false);

  // Detect device type
  const isIOS        = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile     = typeof window   !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const isStandalone = typeof window   !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

  // Android Chrome: capture the native install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
    onClose();
  };

  // Show the button if:
  //  - iOS mobile + not already installed → show iOS how-to guide
  //  - Android/other mobile + prompt captured → show native prompt
  const showIOSButton     = isMobile && isIOS && !isStandalone;
  const showAndroidButton = isMobile && !isIOS && !!installPrompt;

  const items = [
    { label: 'Profile',            icon: '👤', disabled: true,  note: 'Coming soon' },
    { label: '🔥 Hot Trending',     disabled: false, action: () => { onShowTrending(); onClose(); } },
    { label: 'Settings',           icon: '⚙️', disabled: true,  note: 'Coming soon' },
    { label: '✉️ Feedback',         disabled: false, action: () => { window.location.href = 'mailto:perspectivnews@gmail.com?subject=SwipeNews Feedback'; onClose(); } },
    { label: 'About / Disclaimer', icon: 'ℹ️', disabled: false, action: () => { onShowInfo(); onClose(); } },
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

          {showIOSButton && (
            <button className="hamburger-item" onClick={() => setShowIOSGuide(true)}>
              <span className="hamburger-item-label">📲 Add to Home Screen</span>
            </button>
          )}

          {showAndroidButton && (
            <button className="hamburger-item" onClick={handleInstall}>
              <span className="hamburger-item-label">📲 Add to Home Screen</span>
            </button>
          )}
        </nav>

        {/* iOS how-to guide */}
        {showIOSGuide && (
          <div className="ios-guide-backdrop" onClick={() => setShowIOSGuide(false)}>
            <div className="ios-guide-card" onClick={e => e.stopPropagation()}>
              <div className="ios-guide-header">
                <span className="ios-guide-title">Add to Home Screen</span>
                <button className="hamburger-close" onClick={() => setShowIOSGuide(false)}>✕</button>
              </div>
              <ol className="ios-guide-steps">
                <li>Tap the <strong>Share</strong> button <span style={{fontSize:'1.2em'}}>⎋</span> at the bottom of Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>Add</strong> in the top right</li>
              </ol>
              <p className="ios-guide-note">Must be opened in Safari for this to work.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
