import { useState, useEffect } from 'react';

const STAGES = [
  "Fetching today's headlines…",
  "Identifying major stories…",
  "Ready!",
];

export default function LoadingScreen({ stage = 0 }) {
  const pct = Math.round(((stage + 1) / STAGES.length) * 100);

  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(id); return 1; }
        return n - 1;
      });
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
        <p className="loading-subtitle">{STAGES[Math.min(stage, STAGES.length - 1)]}</p>

        {/* Progress bar */}
        <div className="loading-progress-track">
          <div
            className="loading-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="loading-countdown">
          {countdown > 1 ? `~${countdown}s` : 'Almost there…'}
        </p>

        <div className="loading-spinner">
          <div className="spinner-ring" />
        </div>

        <p className="loading-note">
          Pre-generating all perspectives so navigation is instant
        </p>

        <p className="loading-tagline">Left · Right · and everything in between</p>

        <div className="loading-swipe-guide">
          <div className="swipe-guide-row">
            <span className="swipe-guide-icon">↕</span>
            <span className="swipe-guide-label">Swipe up / down to browse topics</span>
          </div>
          <div className="swipe-guide-row">
            <span className="swipe-guide-icon">↔</span>
            <span className="swipe-guide-label">Swipe left / right to shift perspective</span>
          </div>
        </div>
      </div>
    </div>
  );
}
