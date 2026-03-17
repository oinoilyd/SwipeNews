import { useRef, useEffect } from 'react';
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
  const touchStartX        = useRef(null);
  const touchStartY        = useRef(null);
  const touchStartTime     = useRef(null);
  const touchStartTarget   = useRef(null);
  const lastSwipeTime      = useRef(0);
  // Reset whenever the topic changes — enforces a 1s window where vertical
  // swipe-to-navigate is locked out so skeleton scrolling doesn't misfire.
  const lastTopicChangeTime = useRef(Date.now());

  useEffect(() => {
    lastTopicChangeTime.current = Date.now();
  }, [topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchStart = (e) => {
    touchStartX.current      = e.touches[0].clientX;
    touchStartY.current      = e.touches[0].clientY;
    touchStartTime.current   = Date.now();
    touchStartTarget.current = e.target;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;

    const dx          = e.changedTouches[0].clientX - touchStartX.current;
    const dy          = e.changedTouches[0].clientY - touchStartY.current;
    const dt          = Math.max(Date.now() - touchStartTime.current, 1);
    const savedTarget = touchStartTarget.current;

    touchStartX.current      = null;
    touchStartY.current      = null;
    touchStartTime.current   = null;
    touchStartTarget.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // ── Horizontal swipe → change perspective ────────────────────────────────
    // While loading: require a very deliberate 160px drag (≈3× normal threshold).
    const swipeThreshold = takesLoading ? 160 : 55;
    if (absDx >= swipeThreshold && absDx > absDy * 1.5) {
      const now = Date.now();
      if (now - lastSwipeTime.current < 400) return;
      lastSwipeTime.current = now;
      if (dx < 0) onTakeRight();
      else        onTakeLeft();
      return;
    }

    // ── Vertical swipe → navigate topics ─────────────────────────────────────
    // Must be clearly vertical and at least 100px (raised from 80).
    if (absDy < 100 || absDy < absDx * 2) return;

    // Block vertical navigation for 1 second after a topic change.
    // This is the core fix: the skeleton has little content so the card body
    // is already "at the bottom", and any downward scroll attempt misfires as
    // topic navigation. The cooldown gives the content time to load first.
    if (Date.now() - lastTopicChangeTime.current < 1000) return;

    // Also block entirely while the current take is loading.
    if (takesLoading) return;

    // Determine where the touch started
    const inCardContent = savedTarget?.closest?.('.card-content');

    if (inCardContent) {
      // Inside the text area: require boundary + a deliberate flick velocity.
      const cardBody = inCardContent.closest?.('.card-body');
      if (cardBody) {
        const atTop    = cardBody.scrollTop <= 5;
        const atBottom = cardBody.scrollTop + cardBody.clientHeight >= cardBody.scrollHeight - 20;
        if (dy < 0 && !atBottom) return;  // still content below — keep scrolling
        if (dy > 0 && !atTop)    return;  // still content above — keep scrolling
      }
      // Velocity gate: raised to 0.45 px/ms (~450 px/s) — requires a real flick.
      if (absDy / dt < 0.45) return;
    }
    // Outside the text area (image, header, spectrum bar, nav bar):
    // passes with just the distance check — no scroll conflict there.

    if (dy < 0) onNextTopic();
    else        onPrevTopic();
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

      {/* Topic navigation — explicit tap buttons + counter */}
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
