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
}) {
  // Touch tracking for vertical swipe (topic navigation)
  const touchStartY = useRef(null);
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartY.current = null;
    touchStartX.current = null;

    // Only treat as vertical swipe if dy > dx (more vertical than horizontal)
    if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx)) return;

    if (dy < 0) onNextTopic();       // swipe up → next topic
    else        onPrevTopic();       // swipe down → prev topic
  };

  return (
    <div className="card-stack-container">
      {/* Spectrum bar — 7 fixed positions */}
      <SpectrumBar
        currentTakeIndex={currentTakeIndex}
        onTakeJump={onTakeJump}
      />

      {/* Card area with touch handlers for vertical swipe */}
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
        ← → keys to shift perspective · ↑ ↓ or swipe to change topic
      </p>
    </div>
  );
}
