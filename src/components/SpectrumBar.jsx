// ── Full 7-position political spectrum ────────────────────────────────────────
const POLITICAL_POSITIONS = [
  { index: 0, label: 'Far Left',     short: 'FL',  color: '#1d4ed8' },
  { index: 1, label: 'Left',         short: 'L',   color: '#3b82f6' },
  { index: 2, label: 'Center-Left',  short: 'CL',  color: '#818cf8' },
  { index: 3, label: 'Neutral',      short: 'N',   color: '#a78bfa' },
  { index: 4, label: 'Center-Right', short: 'CR',  color: '#f97316' },
  { index: 5, label: 'Right',        short: 'R',   color: '#ef4444' },
  { index: 6, label: 'Far Right',    short: 'FR',  color: '#dc2626' },
];

// Limited political (3 positions only)
const LIMITED_INDICES = new Set([1, 3, 5]);

// Sports perspectives — use the same 3 nav indices (1=Fan, 3=Neutral, 5=Business)
const SPORTS_POSITIONS = [
  { index: 1, label: 'Fan',      short: 'Fan', color: '#22c55e' },  // green
  { index: 3, label: 'Neutral',  short: 'N',   color: '#a78bfa' },  // purple
  { index: 5, label: 'Business', short: 'Biz', color: '#f59e0b' },  // amber
];

// Tech perspectives — 4 positions: Optimist, Skeptic, Neutral, Industry
const TECH_POSITIONS = [
  { index: 1, label: 'Optimist', short: 'Opt', color: '#3b82f6' },
  { index: 2, label: 'Skeptic',  short: 'Ske', color: '#f59e0b' },
  { index: 3, label: 'Neutral',  short: 'Neu', color: '#a78bfa' },
  { index: 5, label: 'Industry', short: 'Ind', color: '#10b981' },
];
const TECH_INDICES_ARR = [1, 2, 3, 5];

import { useState, useRef } from 'react';

export default function SpectrumBar({ currentTakeIndex, onTakeJump, perspectiveMode }) {
  const [modeTooltip, setModeTooltip] = useState(false);
  const modeTooltipTimer = useRef(null);

  function showModeTooltip() {
    clearTimeout(modeTooltipTimer.current);
    setModeTooltip(true);
    modeTooltipTimer.current = setTimeout(() => setModeTooltip(false), 2500);
  }
  // Pick the right position set
  const isSports  = perspectiveMode === 'sports';
  const isTech    = perspectiveMode === 'tech';
  const isLimited = perspectiveMode === 'limited';
  const isNonFull = perspectiveMode !== 'full';

  const visiblePositions =
    isSports  ? SPORTS_POSITIONS :
    isTech    ? TECH_POSITIONS :
    isLimited ? POLITICAL_POSITIONS.filter(p => LIMITED_INDICES.has(p.index)) :
                POLITICAL_POSITIONS;

  // Active position label + color
  const current =
    visiblePositions.find(p => p.index === currentTakeIndex)
    ?? visiblePositions[1]; // default to middle

  return (
    <div className="spectrum-bar-wrapper">
      {/* Track with clickable pips */}
      <div className="spectrum-track">
        <div className={`spectrum-gradient${isSports ? ' sports-gradient' : isTech ? ' tech-gradient' : ''}`} />
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
        ) : (
          <>
            <span className="spectrum-label-left">◀ Liberal</span>
            <span className="spectrum-current-label" style={{ color: current.color }}>{current.label}</span>
            <span className="spectrum-label-right">Conservative ▶</span>
          </>
        )}
      </div>

      {/* Quick-jump pills — only on neutral */}
      {currentTakeIndex === 3 && (
        <div className="spectrum-pills-row">
          {visiblePositions.map((pos) => {
            const isActive = pos.index === currentTakeIndex;
            return (
              <button
                key={pos.index}
                className={`spectrum-pill ${isActive ? 'active' : ''}`}
                style={{
                  background:  isActive ? pos.color : `${pos.color}22`,
                  borderColor: `${pos.color}55`,
                  color:        isActive ? '#fff' : pos.color,
                }}
                onClick={() => onTakeJump(pos.index)}
              >
                {pos.short}
              </button>
            );
          })}
        </div>
      )}

      {/* Mode indicator — tap for tooltip */}
      {(isSports || isTech || isLimited) && (
        <div className="spectrum-mode-indicator">
          <button className="spectrum-mode-btn" onClick={showModeTooltip}>
            {isSports ? '🏆' : isTech ? '💻' : '⚠'}
          </button>
          {modeTooltip && (
            <span className="spectrum-mode-tooltip">
              {isSports && 'Sports topic — Fan, Neutral & Business perspectives'}
              {isTech   && 'Tech topic — Optimist, Skeptic, Neutral & Industry perspectives'}
              {isLimited && 'Limited coverage — only Left, Neutral & Right available'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
