import { useState, useRef } from 'react';

// ── Full 7-position political spectrum ────────────────────────────────────────
const POLITICAL_POSITIONS = [
  { index: 0, label: 'Far Left',     color: '#1d4ed8' },
  { index: 1, label: 'Left',         color: '#3b82f6' },
  { index: 2, label: 'Center-Left',  color: '#818cf8' },
  { index: 3, label: 'Neutral',      color: '#a78bfa' },
  { index: 4, label: 'Center-Right', color: '#f97316' },
  { index: 5, label: 'Right',        color: '#ef4444' },
  { index: 6, label: 'Far Right',    color: '#dc2626' },
];

// Sports perspectives
const SPORTS_POSITIONS = [
  { index: 1, label: 'Fan',      color: '#22c55e' },
  { index: 3, label: 'Neutral',  color: '#a78bfa' },
  { index: 5, label: 'Business', color: '#f59e0b' },
];

// Tech perspectives
const TECH_POSITIONS = [
  { index: 1, label: 'Optimist', color: '#3b82f6' },
  { index: 2, label: 'Skeptic',  color: '#f59e0b' },
  { index: 3, label: 'Neutral',  color: '#a78bfa' },
  { index: 5, label: 'Industry', color: '#10b981' },
];
const TECH_INDICES_ARR = [1, 2, 3, 5];

// Entertainment perspectives
const ENTERTAINMENT_POSITIONS = [
  { index: 1, label: 'Progressive', color: '#7b6eb0' },
  { index: 3, label: 'Neutral',     color: '#7d8699' },
  { index: 5, label: 'Traditional', color: '#8f6344' },
];

export default function SpectrumBar({ currentTakeIndex, onTakeJump, perspectiveMode }) {
  const [modeTooltip, setModeTooltip] = useState(false);
  const modeTooltipTimer = useRef(null);

  function showModeTooltip() {
    clearTimeout(modeTooltipTimer.current);
    setModeTooltip(true);
    modeTooltipTimer.current = setTimeout(() => setModeTooltip(false), 2500);
  }

  const isSports        = perspectiveMode === 'sports';
  const isTech          = perspectiveMode === 'tech';
  const isEntertainment = perspectiveMode === 'entertainment';
  const isNonFull       = perspectiveMode !== 'full';

  const visiblePositions =
    isSports        ? SPORTS_POSITIONS :
    isTech          ? TECH_POSITIONS :
    isEntertainment ? ENTERTAINMENT_POSITIONS :
                      POLITICAL_POSITIONS;

  const current =
    visiblePositions.find(p => p.index === currentTakeIndex)
    ?? visiblePositions[1];

  return (
    <div className="spectrum-bar-wrapper">
      {/* Track with clickable pips */}
      <div className="spectrum-track">
        <div className={`spectrum-gradient${isSports ? ' sports-gradient' : isTech ? ' tech-gradient' : isEntertainment ? ' entertainment-gradient' : ''}`} />
        {visiblePositions.map((pos) => {
          const isActive = pos.index === currentTakeIndex;
          const leftPct  = isTech
            ? (TECH_INDICES_ARR.indexOf(pos.index) / (TECH_INDICES_ARR.length - 1)) * 100
            : isNonFull
            ? ([1, 3, 5].indexOf(pos.index) / 2) * 100
            : (pos.index / 6) * 100;
          return (
            <button
              key={pos.index}
              className={`spectrum-pip ${isActive ? 'active' : ''}`}
              style={{
                left:      `${leftPct}%`,
                background: isActive ? pos.color : `${pos.color}55`,
                boxShadow:  isActive ? `0 0 0 4px ${pos.color}44, 0 0 12px ${pos.color}66` : 'none',
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
        {isSports ? (
          <>
            <span className="spectrum-label-left">🏆 Sports</span>
            <span className="spectrum-current-label" style={{ color: current.color }}>{current.label}</span>
            <span className="spectrum-label-right">Fan · Neutral · Business</span>
          </>
        ) : isTech ? (
          <>
            <span className="spectrum-label-left">💻 Tech</span>
            <span className="spectrum-current-label" style={{ color: current.color }}>{current.label}</span>
            <span className="spectrum-label-right">Opt · Ske · Neu · Ind</span>
          </>
        ) : isEntertainment ? (
          <>
            <span className="spectrum-label-left">🎬 Entertainment</span>
            <span className="spectrum-current-label" style={{ color: current.color }}>{current.label}</span>
            <span className="spectrum-label-right">Progressive · Traditional</span>
          </>
        ) : (
          <>
            <span className="spectrum-label-left">◀ Liberal</span>
            <span className="spectrum-current-label" style={{ color: current.color }}>{current.label}</span>
            <span className="spectrum-label-right">Conservative ▶</span>
          </>
        )}
      </div>
    </div>
  );
}
