import { useRef, useState, useEffect } from 'react';
import SwipeCard from './SwipeCard';
import SpectrumBar from './SpectrumBar';

// ── Constants ────────────────────────────────────────────────────────────────
const SNAP_THRESHOLD = 0.25;  // 25% of viewport height commits a snap
const FLICK_VEL      = 0.5;   // px/ms — fast flick commits regardless of dist
const FLICK_MIN      = 30;    // px minimum even for a recognised flick
const H_SWIPE_MIN    = 40;    // px to commit a horizontal perspective swipe
const H_SWIPE_LOCK   = 380;   // ms debounce between perspective swipes

export default function CardStack({
  prevTopic,
  topic,
  nextTopic,
  currentTake,
  currentTakeIndex,
  takesLoading,
  onTakeLeft,
  onTakeRight,
  onTakeJump,
  onNextTopic,
  onPrevTopic,
  perspectiveMode,
  onRefreshOrder,
  onScrollChange,
}) {
  const containerRef = useRef(null);

  // ── All touch tracking in refs — never cause re-renders ─────────────────
  const startYRef      = useRef(0);
  const startXRef      = useRef(0);
  const startTimeRef   = useRef(0);
  const panelRef       = useRef(null);   // nearest .card-scroll-inner, or null
  const startScrollRef = useRef(0);      // panel.scrollTop at gesture start
  // Gesture phase: 'idle' | 'deciding' | 'h' | 'scroll' | 'card'
  const phaseRef       = useRef('idle');
  const isDragging     = useRef(false);
  const lastHSwipe     = useRef(0);

  const [dragY,    setDragY]    = useState(0);
  const [snapping, setSnapping] = useState(false);

  // ── Stable callback ref — listeners always see latest props ─────────────
  const cbRef = useRef({});
  cbRef.current = {
    prevTopic, nextTopic, snapping,
    onNextTopic, onPrevTopic, onTakeLeft, onTakeRight, onRefreshOrder,
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ── Touch start: snapshot gesture origin ────────────────────────────────
    function onTouchStart(e) {
      if (cbRef.current.snapping) return;
      const t = e.touches[0];
      startYRef.current    = t.clientY;
      startXRef.current    = t.clientX;
      startTimeRef.current = Date.now();
      phaseRef.current     = 'deciding';
      isDragging.current   = true;

      // Find the nearest scroll container (null when touching the photo area)
      const panel = e.target.closest?.('.card-scroll-inner') ?? null;
      panelRef.current       = panel;
      startScrollRef.current = panel?.scrollTop ?? 0;
    }

    // ── Touch move: the core logic ───────────────────────────────────────────
    function onTouchMove(e) {
      if (!isDragging.current || cbRef.current.snapping) return;

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      // ── Phase detection ──────────────────────────────────────────────────
      if (phaseRef.current === 'deciding') {
        // Strong horizontal bias → perspective swipe
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          phaseRef.current = 'h';
          return;
        }
        // Wait for clear vertical commitment
        if (Math.abs(dy) < 6) return;
        phaseRef.current = 'scroll'; // tentative; upgrades to 'card' at boundary
      }

      if (phaseRef.current === 'h') return;

      // ── Key formula: card displacement = finger delta − scroll absorbed ─────
      //
      // While the content panel scrolls within its bounds:
      //   scrollDelta cancels dy  →  rawCardDy ≈ 0  →  card stays still
      //
      // When the panel hits top or bottom (scrollDelta caps):
      //   extra finger motion accumulates in rawCardDy  →  card starts moving
      //
      // This works correctly for ANY gesture — short swipe, long scroll into
      // a boundary, or a fresh gesture starting mid-content. No manual atTop/
      // atBot tracking needed; the physics handle it automatically.
      const panel = panelRef.current;
      const scrollDelta = panel ? (panel.scrollTop - startScrollRef.current) : 0;
      const rawCardDy   = dy + scrollDelta;

      // At a scroll boundary, prevent the browser from doing iOS rubber-band
      // overscroll (which would "steal" the gesture from us). Also lock in
      // card drag mode once we're committed to it.
      const atTop = !panel || panel.scrollTop <= 1;
      const atBot = !panel || panel.scrollTop >= panel.scrollHeight - panel.clientHeight - 1;

      if ((dy > 0 && atTop) || (dy < 0 && atBot) || phaseRef.current === 'card') {
        e.preventDefault();
      }

      // Upgrade scroll → card-drag once boundary is passed by 8 px
      if (phaseRef.current === 'scroll' && Math.abs(rawCardDy) > 8) {
        phaseRef.current = 'card';
      }

      if (phaseRef.current !== 'card') return;

      const { prevTopic: prev, nextTopic: next } = cbRef.current;

      // Elastic rubber-band resistance at feed ends
      let visualDy = rawCardDy;
      if (rawCardDy > 0 && !prev) visualDy =  Math.min(Math.sqrt(rawCardDy)  * 10, 110);
      if (rawCardDy < 0 && !next) visualDy = -Math.min(Math.sqrt(-rawCardDy) * 10, 110);

      setDragY(visualDy);
    }

    // ── Touch end: snap decision ─────────────────────────────────────────────
    function onTouchEnd(e) {
      if (!isDragging.current) return;
      isDragging.current = false;

      const phase = phaseRef.current;
      phaseRef.current = 'idle';

      const dx = e.changedTouches[0].clientX - startXRef.current;
      const dy = e.changedTouches[0].clientY - startYRef.current;
      const dt = Math.max(Date.now() - startTimeRef.current, 1);

      const { prevTopic: prev, nextTopic: next,
              onNextTopic: goNext, onPrevTopic: goPrev,
              onTakeLeft: goLeft, onTakeRight: goRight,
              onRefreshOrder: doRefresh } = cbRef.current;

      // ── Horizontal → perspective ───────────────────────────────────────────
      if (phase === 'h') {
        if (Math.abs(dx) >= H_SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.2) {
          const now = Date.now();
          if (now - lastHSwipe.current >= H_SWIPE_LOCK) {
            lastHSwipe.current = now;
            dx < 0 ? goRight?.() : goLeft?.();
          }
        }
        setDragY(0);
        return;
      }

      // No card drag happened → spring back silently
      if (phase !== 'card') { setDragY(0); return; }

      // Re-apply the formula at release to get the final card displacement
      const panel      = panelRef.current;
      const scrollDelta = panel ? (panel.scrollTop - startScrollRef.current) : 0;
      const rawCardDy   = dy + scrollDelta;

      const vh       = window.innerHeight;
      const absDy    = Math.abs(rawCardDy);
      const velocity = absDy / dt;
      const crossed  = absDy > vh * SNAP_THRESHOLD || (velocity > FLICK_VEL && absDy > FLICK_MIN);

      setSnapping(true);

      if (crossed && rawCardDy < 0 && next) {
        // Swipe up → next topic
        setDragY(-vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goNext?.(); }, 300);
      } else if (crossed && rawCardDy > 0 && prev) {
        // Swipe down → prev topic
        setDragY(vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goPrev?.(); }, 300);
      } else if (!prev && rawCardDy > 120 && doRefresh) {
        // Pull-to-refresh on first card
        setDragY(0);
        setTimeout(() => { setSnapping(false); doRefresh?.(); }, 300);
      } else {
        // Didn't cross threshold — spring back
        setDragY(0);
        setTimeout(() => setSnapping(false), 300);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true  });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false }); // non-passive for preventDefault
    el.addEventListener('touchend',   onTouchEnd,   { passive: true  });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []); // stable — reads live values through cbRef

  // Springy return animation at feed ends; normal snap otherwise
  const isEdge     = (!prevTopic && dragY > 0) || (!nextTopic && dragY < 0);
  const snapTrans  = 'transform 0.30s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  const edgeTrans  = 'transform 0.48s cubic-bezier(0.34, 1.56, 0.64, 1)';
  const transition = snapping ? snapTrans : isEdge ? edgeTrans : 'none';

  const specBar = (
    <SpectrumBar
      currentTakeIndex={currentTakeIndex}
      onTakeJump={onTakeJump}
      perspectiveMode={perspectiveMode}
    />
  );

  return (
    <div ref={containerRef} className="card-stack-container">

      {/* Prev card — one full height above current */}
      {prevTopic && (
        <div
          className="card-track-slide"
          style={{ transform: `translateY(calc(-100% + ${dragY}px))`, transition }}
        >
          <SwipeCard topic={prevTopic} isPreview />
        </div>
      )}

      {/* Current card */}
      <div
        className="card-track-slide"
        style={{ transform: `translateY(${dragY}px)`, transition }}
      >
        <SwipeCard
          topic={topic}
          currentTake={currentTake}
          currentTakeIndex={currentTakeIndex}
          takesLoading={takesLoading}
          perspectiveMode={perspectiveMode}
          spectrumBar={specBar}
          onScrollChange={onScrollChange}
        />
      </div>

      {/* Next card — one full height below current */}
      {nextTopic && (
        <div
          className="card-track-slide"
          style={{ transform: `translateY(calc(100% + ${dragY}px))`, transition }}
        >
          <SwipeCard topic={nextTopic} isPreview />
        </div>
      )}
    </div>
  );
}
