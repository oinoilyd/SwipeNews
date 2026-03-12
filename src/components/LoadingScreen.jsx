const STAGES = [
  "Fetching today's headlines…",
  "Identifying major stories…",
  "Ready!",
];

export default function LoadingScreen({ stage = 0 }) {
  const pct = Math.round(((stage + 1) / STAGES.length) * 100);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-logo">
          <span className="logo-icon-large">📰</span>
        </div>
        <h1 className="loading-title">SwipeNews</h1>
        <p className="loading-subtitle">{STAGES[Math.min(stage, STAGES.length - 1)]}</p>

        {/* Progress bar */}
        <div className="loading-progress-track">
          <div
            className="loading-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="loading-spinner">
          <div className="spinner-ring" />
        </div>

        <p className="loading-note">
          Pre-generating all perspectives so navigation is instant
        </p>

        <div className="loading-sources">
          <span className="loading-source-pill left">🔵 Liberal Sources</span>
          <span className="loading-source-pill center">⚪ Center Sources</span>
          <span className="loading-source-pill right">🔴 Conservative Sources</span>
        </div>
      </div>
    </div>
  );
}
