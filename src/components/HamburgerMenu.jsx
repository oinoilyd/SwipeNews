import { useState, useEffect } from 'react';
import { LANGUAGES, getLanguage, setLanguage, t } from '../lib/i18n.js';

export default function HamburgerMenu({ onClose, onShowTrending, onShowInfo, lang = 'en' }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIOSGuide,  setShowIOSGuide]  = useState(false);
  const [currentLang,   setCurrentLang]   = useState(getLanguage());

  const isIOS        = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile     = typeof window   !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const isStandalone = typeof window   !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
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

  const handleLangChange = (e) => {
    const next = e.target.value;
    setCurrentLang(next);
    setLanguage(next); // saves + reloads
  };

  const showIOSButton     = isMobile && isIOS && !isStandalone;
  const showAndroidButton = isMobile && !isIOS && !!installPrompt;

  return (
    <div className="hamburger-overlay" onClick={onClose}>
      <div className="hamburger-drawer" onClick={e => e.stopPropagation()}>
        <div className="hamburger-header">
          <span className="hamburger-title">{t('menu', lang)}</span>
          <button className="hamburger-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>

        <nav className="hamburger-nav">
          <button className="hamburger-item" onClick={() => { onShowTrending(); onClose(); }}>
            <span className="hamburger-item-label">🔥 Hot Trending</span>
          </button>

          {/* Language selector */}
          <div className="hamburger-item hamburger-lang-row">
            <span className="hamburger-item-label">🌐 {t('language', lang)}</span>
            <select
              className="hamburger-lang-select"
              value={currentLang}
              onChange={handleLangChange}
              onClick={e => e.stopPropagation()}
            >
              {Object.entries(LANGUAGES).map(([code, { name }]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>

          <button className="hamburger-item" onClick={() => { window.location.href = 'mailto:perspectivnews@gmail.com?subject=SwipeNews Feedback'; onClose(); }}>
            <span className="hamburger-item-label">✉️ Feedback</span>
          </button>

          <button className="hamburger-item" onClick={() => { onShowInfo(); onClose(); }}>
            <span className="hamburger-item-label">ℹ️ About / Disclaimer</span>
          </button>

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
