import { useRef } from 'react';
import SwipeCard from './SwipeCard';
import SpectrumBar from './SpectrumBar';

export default function CardStack({
  topic,
  currentTake,
  currentTakeIndex,
  takesLoading,
  onTakeLeft,
  onTakeRight,
  onTakeJump,
  onNextTopic,
  onPrevTopic,
  currentTopicIndex,
  totalTopics,
  perspectiveMode,
}) {
  const touchStartY      = useRef(null);
  const touchStartX      = useRef(null);
  const touchStartTarget = useRef(null);

  const handleTouchStart = (e) => {
    touchStartY.current      = e.touches[0].clientY;
    touchStartX.current      = e.touches[0].clientX;
    touchStartTarget.current = e.target;
  };

  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const savedTarget = touchStartTarget.current;
    touchStartY.current      = null;
    touchStartX.current      = null;
    touchStartTarget.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // ── Horizontal swipe → change perspective ────────────────────────────────
    if (absDx >= 60 && absDx > absDy) {
      if (dx < 0) onTakeRight();   // swipe left  → more conservative
      else        onTakeLeft();    // swipe right → more liberal
      return;
    }

    // ── Vertical swipe → navigate topics ─────────────────────────────────────
    // Require 80px deliberate swipe, and vertical must dominate
    if (absDy < 80 || absDy < absDx) return;

    // Scrolling always takes priority: only navigate when at absolute boundary
    const cardBody = savedTarget?.closest?.('.card-body');
    if (cardBody) {
      const atTop    = cardBody.scrollTop === 0;
      const atBottom = cardBody.scrollTop + cardBody.clientHeight >= cardBody.scrollHeight - 1;
      if (dy < 0 && !atBottom) return;   // swipe up, but not at bottom yet
      if (dy > 0 && !atTop)    return;   // swipe down, but not at top yet
    }

    if (dy < 0) onNextTopic();     // swipe up   → next topic
    else        onPrevTopic();     // swipe down → prev topic
  };

  return (
    <div className="card-stack-container">
      {/* Spectrum bar — fixed positions (or 3 for limited topics) */}
      <SpectrumBar
        currentTakeIndex={currentTakeIndex}
        onTakeJump={onTakeJump}
        perspectiveMode={perspectiveMode}
      />

      {/* Card area with touch handlers */}
      <div
        className="card-area"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <SwipeCard
          topic={topic}
          currentTake={currentTake}
          currentTakeIndex={currentTakeIndex}
          takesLoading={takesLoading}
          onTakeLeft={onTakeLeft}
          onTakeRight={onTakeRight}
          perspectiveMode={perspectiveMode}
        />
      </div>

      {/* Topic navigation — dots (≤10 topics) or numeric counter (>10) */}
      <div className="topic-nav">
        <button
          className="topic-nav-btn"
          onClick={onPrevTopic}
          aria-label="Previous topic"
        >
          ↑
        </button>

        {totalTopics <= 10 ? (
          <div className="topic-dots">
            {Array.from({ length: totalTopics }).map((_, i) => (
              <span
                key={i}
                className={`topic-dot ${i === currentTopicIndex ? 'active' : ''}`}
              />
            ))}
          </div>
        ) : (
          <div className="topic-counter-inline">
            {currentTopicIndex + 1} <span className="topic-counter-sep">/</span> {totalTopics}
          </div>
        )}

        <button
          className="topic-nav-btn"
          onClick={onNextTopic}
          aria-label="Next topic"
        >
          ↓
        </button>
      </div>

      <p className="keyboard-hint">
        ← → to shift perspective · ↑ ↓ or swipe to change topic
      </p>
    </div>
  );
}
