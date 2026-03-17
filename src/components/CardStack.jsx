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
  // Absolute timestamp until which FORWARD (next) vertical navigation is locked.
  const verticalSwipeLockUntil = useRef(0);
  // Direction of the last topic navigation, used to pick the slide-in animation.
  const pendingNavDir = useRef(null); // 'next' | 'prev' | null
  const [slideClass,  setSlideClass] = useState('');
  // Ref to the card-area div for the rubber-band transform
  const cardAreaRef = useRef(null);

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

  // When the neutral perspective (index 3) finishes loading, cap the forward
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

  // ── Rubber band: live elastic stretch while pulling back past topic 0 ──────
  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    if (currentTopicIndex !== 0) return;          // only at first topic
    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dy <= 0) return;                          // only on the "scroll up / go back" gesture
    if (Math.abs(dx) > dy * 1.5) return;          // skip if mostly horizontal

    // Don't rubber-band if the card is scrolled down (user is just scrolling text)
    const cardBody = touchStartTarget.current?.closest?.('.card-body');
    if (cardBody && cardBody.scrollTop > 5) return;

    // Sqrt damping gives a natural elastic feel that resists harder as you pull
    const stretch = Math.sqrt(dy) * 4.5;
    const el = cardAreaRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform  = `translateY(${stretch}px)`;
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;

    // ── Snap back rubber band before anything else ────────────────────────────
    const cardEl = cardAreaRef.current;
    if (cardEl?.style.transform) {
      // Spring-back with a satisfying overshoot
      cardEl.style.transition = 'transform 0.52s cubic-bezier(0.34, 1.56, 0.64, 1)';
      cardEl.style.transform  = '';
      setTimeout(() => { if (cardAreaRef.current) cardAreaRef.current.style.transition = ''; }, 540);
      touchStartX.current = touchStartY.current = touchStartTime.current = touchStartTarget.current = null;
      return; // don't navigate — rubber band means "nothing to go back to"
    }

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
    if (headerCollapsed && startY < 72) {
      const isTap           = absDx < 22 && absDy < 22;
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
      verticalSwipeLockUntil.current = Math.max(
        verticalSwipeLockUntil.current,
        Date.now() + 1000
      );
      if (dx < 0) onTakeRight();
      else        onTakeLeft();
      return;
    }

    // ── Vertical swipe → navigate topics ─────────────────────────────────────
    if (absDy < absDx * 2) return; // must be clearly vertical

    if (dy > 0) {
      // ── BACKWARD / prev topic ("scroll up" — going back) ─────────────────
      // Instant & snappy: no time lock, no loading check, lower threshold.
      if (absDy < 70) return;
      // In text area: must be at the top of the scroll (nothing more to scroll up)
      const inCardContent = savedTarget?.closest?.('.card-content');
      if (inCardContent) {
        const cardBody = inCardContent.closest?.('.card-body');
        if (cardBody?.scrollTop > 5) return;   // still scrollable — don't navigate
        if (absDy / dt < 0.45) return;         // velocity gate still applies
      }
      pendingNavDir.current = 'prev';
      onPrevTopic();
      return;
    }

    // ── FORWARD / next topic ("scroll down") ─────────────────────────────────
    // Keep all safety guards: lock, loading check, 100px threshold.
    if (absDy < 100) return;
    if (Date.now() < verticalSwipeLockUntil.current) return;
    if (takesLoading) return;

    const inCardContent = savedTarget?.closest?.('.card-content');
    if (inCardContent) {
      const cardBody = inCardContent.closest?.('.card-body');
      if (cardBody) {
        const atBottom = cardBody.scrollTop + cardBody.clientHeight >= cardBody.scrollHeight - 20;
        if (!atBottom) return; // still content below — keep scrolling
      }
      if (absDy / dt < 0.45) return;
    }

    pendingNavDir.current = 'next';
    onNextTopic();
  };

  return (
    <div
      className="card-stack-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <SpectrumBar
        currentTakeIndex={currentTakeIndex}
        onTakeJump={onTakeJump}
        perspectiveMode={perspectiveMode}
      />

      <div className="card-area" ref={cardAreaRef}>
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
