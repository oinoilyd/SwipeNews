import { useState, useEffect } from 'react';
import { t } from '../lib/i18n.js';

export default function LoadingScreen({ stage = 0, lang = 'en' }) {
  const stages = [t('loadingStage0', lang), t('loadingStage1', lang), t('loadingReady', lang)];
  const pct    = Math.round(((stage + 1) / stages.length) * 100);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(n => { if (n <= 1) { clearInterval(id); return 1; } return n - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-logo">
          <svg width="64" height="64" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect width="28" height="28" rx="7" fill="#000"/>
            <text x="14" y="21" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontWeight="700" fontSize="19" fill="white">P</text>
          </svg>
        </div>
        <h1 className="loading-title">Perspectiv</h1>
        <p className="loading-subtitle">{stages[Math.min(stage, stages.length - 1)]}</p>

        <div className="loading-progress-track">
          <div className="loading-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <p className="loading-countdown">
          {countdown > 1 ? `~${countdown}s` : t('loadingAlmost', lang)}
        </p>

        <div className="loading-spinner">
          <div className="spinner-ring" />
        </div>

        <p className="loading-note">{t('loadingNote', lang)}</p>
        <p className="loading-tagline">{t('loadingTagline', lang)}</p>

        <div className="loading-swipe-guide">
          <div className="swipe-guide-row">
            <span className="swipe-guide-icon">↕</span>
            <span className="swipe-guide-label">{t('loadingSwipeTopics', lang)}</span>
          </div>
          <div className="swipe-guide-row">
            <span className="swipe-guide-icon">↔</span>
            <span className="swipe-guide-label">{t('loadingSwipePerspective', lang)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
