import { useRef, useState, useEffect } from 'react';
import SwipeCard from './SwipeCard';
import SpectrumBar from './SpectrumBar';

const SNAP_THRESHOLD = 0.28;   // 28% of viewport height to commit snap
const H_SWIPE_MIN    = 40;     // px to commit a horizontal perspective swipe
const H_SWIPE_LOCK   = 380;    // ms debounce between perspective swipes

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
  const containerRef   = useRef(null);

  // Touch state in refs (not state) to avoid stale closures inside listeners
  const startXRef      = useRef(0);
  const startYRef      = useRef(0);
  const startTimeRef   = useRef(0);
  const startTargetRef = useRef(null);
  const isDragging      = useRef(false);
  const axisRef         = useRef(null);     // 'v' | 'h' | null
  const cardDragRef     = useRef(false);    // true = translating the card stack
  const bottomPullRef   = useRef(false);    // true = overscrolling down at bottom → next
  const overscrollRef   = useRef(0);        // accumulated px of downward overscroll at bottom
  const lastTouchYRef   = useRef(0);        // previous frame Y for local-delta tracking
  const lastHSwipe      = useRef(0);

  // Rendering state (these drive the actual card positions)
  const [dragY,    setDragY]    = useState(0);
  const [snapping, setSnapping] = useState(false);

  // Keep callback refs so event listeners always call the latest version
  const cbRef = useRef({});
  cbRef.current = {
    prevTopic, nextTopic, snapping, takesLoading,
    onNextTopic, onPrevTopic, onTakeLeft, onTakeRight, onRefreshOrder,
  };

  // ── Non-passive touch listeners (so e.preventDefault() actually works) ──────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e) {
      if (cbRef.current.snapping) return;
      isDragging.current     = true;
      axisRef.current        = null;
      cardDragRef.current    = false;
      bottomPullRef.current  = false;
      overscrollRef.current  = 0;
      lastTouchYRef.current  = e.touches[0].clientY;
      startXRef.current      = e.touches[0].clientX;
      startYRef.current      = e.touches[0].clientY;
      startTimeRef.current   = Date.now();
      startTargetRef.current = e.target;
    }

    function onTouchMove(e) {
      if (!isDragging.current || cbRef.current.snapping) return;

      const currentY   = e.touches[0].clientY;
      const currentX   = e.touches[0].clientX;
      const localDy    = currentY - lastTouchYRef.current; // frame-to-frame delta
      lastTouchYRef.current = currentY;

      const rawDx = currentX - startXRef.current;
      const rawDy = currentY - startYRef.current;
      const isVertical = Math.abs(rawDy) > Math.abs(rawDx);

      // ── Scroll boundary snapshot ─────────────────────────────────────────────
      const target = startTargetRef.current;
      const panel  = target?.closest?.('.card-scroll-inner');
      const atTop  = !panel || panel.scrollTop <= 2;
      // 40px threshold: sources/padding near bottom shouldn't block gesture
      const atBot  = !panel || panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 40;

      // ── Accumulate overscroll using local delta (NOT global rawDy) ───────────
      // This works correctly even in long continuous scroll gestures where rawDy
      // is large and negative — we only count the local downward motion at boundary.
      if (atBot && localDy > 0) {
        overscrollRef.current = Math.max(0, overscrollRef.current + localDy);
        bottomPullRef.current = true;
      } else if (localDy < 0 && overscrollRef.current > 0) {
        // Finger reversed — bleed off the overscroll (allows natural cancel)
        overscrollRef.current = Math.max(0, overscrollRef.current + localDy * 1.5);
        if (overscrollRef.current <= 0) bottomPullRef.current = false;
      }

      // ── Early intercept — prevent browser overscroll stealing the gesture ────
      // Must select the ACTIVE card (has data-at-bottom attr); preview cards don't
      const card = el.querySelector('.swipe-card[data-at-bottom]');
      const isUnlocked = card?.dataset?.atBottom === '1';
      if (
        (isVertical && rawDy < -2 && isUnlocked) || // unlocked upward swipe
        (atBot && localDy > 1)                       // any downward frame at bottom
      ) {
        e.preventDefault();
      }

      // ── Bottom-pull can commit card drag before axis lock (no lag on elastic) ─
      if (!cardDragRef.current && overscrollRef.current > 0) {
        cardDragRef.current = true;
        if (!axisRef.current) axisRef.current = 'v';
      }

      // Commit to axis once we've moved 8px
      if (!axisRef.current) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
        axisRef.current = isVertical ? 'v' : 'h';
      }
      if (axisRef.current === 'h') return;

      // ── Vertical: decide once if this gesture translates the card stack ──────
      if (!cardDragRef.current) {
        const panelAtBottom  = isUnlocked;
        const isBottomOvsc   = overscrollRef.current > 0 || (atBot && localDy > 0);

        const allow =
          (rawDy < 0 && panelAtBottom)   ||  // swipe up (unlocked) → next
          (rawDy > 0 && atTop && !atBot) ||  // top overscroll → prev
          isBottomOvsc;                       // bottom overscroll → elastic → next

        if (allow) cardDragRef.current = true;
      }

      if (!cardDragRef.current) return;
      e.preventDefault();

      const { prevTopic: prev, nextTopic: next } = cbRef.current;

      let dy = rawDy;
      if (bottomPullRef.current) {
        // Elastic visual uses accumulated overscroll — works regardless of global rawDy
        dy = Math.min(Math.sqrt(overscrollRef.current) * 6, 80);
      } else if (!prev && rawDy > 0) {
        dy = Math.min(Math.sqrt(rawDy) * 9, 130);
      } else if (!next && rawDy < 0) {
        dy = Math.max(-Math.sqrt(-rawDy) * 9, -130);
      }

      setDragY(dy);
    }

    function onTouchEnd(e) {
      if (!isDragging.current) return;
      isDragging.current = false;

      const axis   = axisRef.current;
      const rawDx  = e.changedTouches[0].clientX - startXRef.current;
      const rawDy  = e.changedTouches[0].clientY - startYRef.current;
      const dt     = Math.max(Date.now() - startTimeRef.current, 1);
      const isCard = cardDragRef.current;

      axisRef.current     = null;
      cardDragRef.current = false;

      const { prevTopic: prev, nextTopic: next,
              onNextTopic: goNext, onPrevTopic: goPrev,
              onTakeLeft: goLeft, onTakeRight: goRight,
              onRefreshOrder: doRefresh,
              takesLoading: loading } = cbRef.current;

      // ── Horizontal swipe → perspective ──────────────────────────────────
      if (axis === 'h') {
        const absDx = Math.abs(rawDx);
        const absDy = Math.abs(rawDy);
        if (absDx >= H_SWIPE_MIN && absDx > absDy * 1.2) {
          const now = Date.now();
          if (now - lastHSwipe.current >= H_SWIPE_LOCK) {
            lastHSwipe.current = now;
            rawDx < 0 ? goRight() : goLeft();
          }
        }
        setDragY(0);
        return;
      }

      const isBottomPull  = bottomPullRef.current;
      const overscrollPx  = overscrollRef.current;
      bottomPullRef.current  = false;
      overscrollRef.current  = 0;

      if (!isCard) { setDragY(0); return; }

      // ── Vertical: snap decision ──────────────────────────────────────────
      const vh       = window.innerHeight;
      const velocity = Math.abs(rawDy) / dt;

      // Bottom-pull: commit when accumulated overscroll reaches 40px.
      // Loading: require very deliberate swipe to avoid accidental nav.
      // Normal: 28% vh OR quick flick.
      const crossed = isBottomPull
        ? overscrollPx >= 40                                    // local overscroll threshold
        : loading
          ? (Math.abs(rawDy) > 200 && velocity > 0.8)          // streaming: deliberate only
          : (Math.abs(rawDy) > vh * SNAP_THRESHOLD || velocity > 0.55); // normal

      setSnapping(true);

      // ── Bottom-pull → NEXT card (upward animation regardless of drag dir) ──
      // No canSwipeNext gate here — 100px elastic pull is intentional enough
      if (isBottomPull && crossed && next) {
        setDragY(-vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goNext(); }, 300);
        return;
      }

      // ── Standard upward swipe → next ────────────────────────────────────
      if (crossed && rawDy < 0 && next) {
        setDragY(-vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goNext(); }, 300);
      // ── Downward at scroll top → prev ───────────────────────────────────
      } else if (crossed && rawDy > 0 && !isBottomPull && prev) {
        setDragY(vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goPrev(); }, 300);
      } else if (!prev && rawDy > 120 && doRefresh) {
        setDragY(0);
        setTimeout(() => { setSnapping(false); doRefresh(); }, 420);
      } else {
        setDragY(0);
        setTimeout(() => setSnapping(false), 380);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true  });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false }); // must be non-passive
    el.addEventListener('touchend',   onTouchEnd,   { passive: true  });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []); // stable — reads live values via cbRef

  // ── Horizontal swipe: handled via React synthetic events (always passive is OK) ──
  // This path handles perspective swipes that start before axis lock has committed.
  // The non-passive touchmove handler above covers card drag + preventDefault.

  const isRubberBand = (!prevTopic && dragY > 0) || (!nextTopic && dragY < 0);
  const snapTrans    = 'transform 0.30s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  const rbTrans      = 'transform 0.52s cubic-bezier(0.34, 1.56, 0.64, 1)';
  const transition   = snapping ? snapTrans : isRubberBand ? rbTrans : 'none';

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
