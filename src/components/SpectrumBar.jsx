const POSITIONS = [
  { index: 0, label: 'Far Left',     short: 'FL', color: '#1d4ed8' },
  { index: 1, label: 'Left',         short: 'L',  color: '#3b82f6' },
  { index: 2, label: 'Center-Left',  short: 'CL', color: '#818cf8' },
  { index: 3, label: 'Neutral',      short: 'N',  color: '#a78bfa' },
  { index: 4, label: 'Center-Right', short: 'CR', color: '#f97316' },
  { index: 5, label: 'Right',        short: 'R',  color: '#ef4444' },
  { index: 6, label: 'Far Right',    short: 'FR', color: '#dc2626' },
];

const LIMITED_INDICES = new Set([1, 3, 5]); // Left, Neutral, Right

export default function SpectrumBar({ currentTakeIndex, onTakeJump, perspectiveMode }) {
  const isLimited = perspectiveMode === 'limited';
  const visiblePositions = isLimited
    ? POSITIONS.filter(p => LIMITED_INDICES.has(p.index))
    : POSITIONS;
  const current = POSITIONS[currentTakeIndex] || POSITIONS[3];

  return (
    <div className="spectrum-bar-wrapper">
      {/* Track with clickable position buttons */}
      <div className="spectrum-track">
        <div className="spectrum-gradient" />
        {visiblePositions.map((pos) => {
          const isActive = pos.index === currentTakeIndex;
          // For limited mode, remap position to 0, 50%, 100% of track
          const leftPct = isLimited
            ? ([1, 3, 5].indexOf(pos.index) / 2) * 100
            : (pos.index / 6) * 100;
          return (
            <button
              key={pos.index}
              className={`spectrum-pip ${isActive ? 'active' : ''}`}
              style={{
                left: `${leftPct}%`,
                background: isActive ? pos.color : `${pos.color}55`,
                boxShadow: isActive ? `0 0 0 4px ${pos.color}44, 0 0 12px ${pos.color}66` : 'none',
              }}
              onClick={() => onTakeJump(pos.index)}
              title={pos.label}
              aria-label={`Switch to ${pos.label} perspective`}
            />
          );
        })}
      </div>

      {/* Labels row */}
      <div className="spectrum-labels">
        <span className="spectrum-label-left">◀ Liberal</span>
        <span
          className="spectrum-current-label"
          style={{ color: current.color }}
        >
          {current.label}
        </span>
        <span className="spectrum-label-right">Conservative ▶</span>
      </div>

      {/* Quick-jump pill row */}
      <div className="spectrum-pills-row">
        {visiblePositions.map((pos) => {
          const isActive = pos.index === currentTakeIndex;
          return (
            <button
              key={pos.index}
              className={`spectrum-pill ${isActive ? 'active' : ''}`}
              style={{
                background:   isActive ? pos.color : `${pos.color}22`,
                borderColor:  `${pos.color}55`,
                color:        isActive ? '#fff' : pos.color,
              }}
              onClick={() => onTakeJump(pos.index)}
            >
              {pos.short}
            </button>
          );
        })}
      </div>

      {/* Limited coverage note */}
      {isLimited && (
        <p className="spectrum-limited-note">
          ⚠ Limited source coverage — only Left, Neutral &amp; Right available
        </p>
      )}
    </div>
  );
}
