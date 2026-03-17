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
  onScrollChange,
}) {
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Only track horizontal swipes for perspective changes.
  // Topic navigation is via explicit ↑ / ↓ buttons — no more vertical swipe.
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Horizontal swipe only — must be dominant axis and ≥ 55px
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onTakeRight();
      else        onTakeLeft();
    }
  };

  return (
    <div
      className="card-stack-container"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <SpectrumBar
        currentTakeIndex={currentTakeIndex}
        onTakeJump={onTakeJump}
        perspectiveMode={perspectiveMode}
      />

      <div className="card-area">
        <SwipeCard
          topic={topic}
          currentTake={currentTake}
          currentTakeIndex={currentTakeIndex}
          takesLoading={takesLoading}
          onTakeLeft={onTakeLeft}
          onTakeRight={onTakeRight}
          perspectiveMode={perspectiveMode}
          onScrollChange={onScrollChange}
        />
      </div>

      {/* Topic navigation — explicit tap buttons */}
      <div className="topic-nav-bar">
        <button
          className="topic-nav-btn"
          onClick={onPrevTopic}
          aria-label="Previous topic"
        >↑</button>
        <span className="topic-counter-inline">
          {currentTopicIndex + 1}
          <span className="topic-counter-sep"> / </span>
          {totalTopics}
        </span>
        <button
          className="topic-nav-btn"
          onClick={onNextTopic}
          aria-label="Next topic"
        >↓</button>
      </div>
    </div>
  );
}
