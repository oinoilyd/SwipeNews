import { useRef, useEffect, useState } from 'react';
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
  headerCollapsed,
  onRestoreHeader,
}) {
  const touchStartX          = useRef(null);
  const touchStartY          = useRef(null);
  const touchStartTime       = useRef(null);
  const touchStartTarget     = useRef(null);
  const lastSwipeTime        = useRef(0);
  // Absolute timestamp until which vertical swipe-to-navigate is locked.
  // New topic → 2500ms lock. Perspective change → 1000ms lock (if not longer).
  const verticalSwipeLockUntil = useRef(0);
  // Direction of the last topic navigation, used to pick the slide-in animation.
  const pendingNavDir = useRef(null); // 'next' | 'prev' | null
  const [slideClass,  setSlideClass] = useState('');

  useEffect(() => {
    verticalSwipeLockUntil.current = Date.now() + 2500;
    const dir = pendingNavDir.current;
    pendingNavDir.current = null;
    const cls = dir === 'next' ? 'slide-in-bottom'
              : dir === 'prev' ? 'slide-in-top'
              : '';
    if (cls) {
      setSlideClass(cls);
      const t = setTimeout(() => setSlideClass(''), 380);
      return () => clearTimeout(t);
    }
  }, [topic.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the neutral perspective (index 3) finishes loading, cap the vertical
  // lock to 1s — no need to wait the full 2.5s if there's already content.
  useEffect(() => {
    if (!takesLoading && currentTakeIndex === 3) {
      verticalSwipeLockUntil.current = Math.min(
        verticalSwipeLockUntil.current,
        Date.now() + 1000
      );
    }
  }, [takesLoading, currentTakeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const startY      = touchStartY.current;

    touchStartX.current      = null;
    touchStartY.current      = null;
    touchStartTime.current   = null;
    touchStartTarget.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // ── Top-zone gesture: restore collapsed header ────────────────────────────
    // When the header is hidden, a tap or any vertical swipe starting in the top
    // 72px of the viewport (where the spectrum bar lives) brings it back.
    // Horizontal swipes in this zone are still handled as perspective changes.
    if (headerCollapsed && startY < 72) {
      const isTap          = absDx < 22 && absDy < 22;
      const isVerticalSwipe = absDy > 30 && absDy > absDx * 1.3;
      if (isTap || isVerticalSwipe) {
        onRestoreHeader?.();
        return;
      }
    }

    // ── Horizontal swipe → change perspective ────────────────────────────────
    if (absDx >= 55 && absDx > absDy * 1.5) {
      const now = Date.now();
      if (now - lastSwipeTime.current < 400) return;
      lastSwipeTime.current = now;
      // After a perspective switch, apply a 1s vertical lock (if not already longer).
      verticalSwipeLockUntil.current = Math.max(
        verticalSwipeLockUntil.current,
        Date.now() + 1000
      );
      if (dx < 0) onTakeRight();
      else        onTakeLeft();
      return;
    }

    // ── Vertical swipe → navigate topics ─────────────────────────────────────
    // Must be clearly vertical and at least 100px.
    if (absDy < 100 || absDy < absDx * 2) return;

    // Block vertical navigation until the lock expires.
    // New topic → 2500ms lock. Perspective switch → 1000ms lock.
    if (Date.now() < verticalSwipeLockUntil.current) return;

    // Block vertical nav while any take is loading — the lock cap above
    // handles the neutral-fully-loaded case by shortening the wait to 1s.
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

    if (dy < 0) { pendingNavDir.current = 'next'; onNextTopic(); }
    else        { pendingNavDir.current = 'prev'; onPrevTopic(); }
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
          slideClass={slideClass}
        />
      </div>

      {/* Topic navigation — explicit tap buttons + counter */}
      <div className="topic-nav-bar">
        <button
          className="topic-nav-btn"
          onClick={() => { pendingNavDir.current = 'prev'; onPrevTopic(); }}
          aria-label="Previous topic"
        >↑</button>
        <span className="topic-counter-inline">
          {currentTopicIndex + 1}
          <span className="topic-counter-sep"> / </span>
          {totalTopics}
        </span>
        <button
          className="topic-nav-btn"
          onClick={() => { pendingNavDir.current = 'next'; onNextTopic(); }}
          aria-label="Next topic"
        >↓</button>
      </div>
    </div>
  );
}
