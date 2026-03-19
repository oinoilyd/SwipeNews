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
  const isDragging     = useRef(false);
  const axisRef        = useRef(null);     // 'v' | 'h' | null
  const cardDragRef    = useRef(false);    // true = translating the card stack
  const bottomPullRef  = useRef(false);    // true = pulling down from scroll-bottom → next
  const lastHSwipe     = useRef(0);

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
      startXRef.current      = e.touches[0].clientX;
      startYRef.current      = e.touches[0].clientY;
      startTimeRef.current   = Date.now();
      startTargetRef.current = e.target;
    }

    function onTouchMove(e) {
      if (!isDragging.current || cbRef.current.snapping) return;

      const rawDx = e.touches[0].clientX - startXRef.current;
      const rawDy = e.touches[0].clientY - startYRef.current;
      const isVertical = Math.abs(rawDy) > Math.abs(rawDx);

      // ── Scroll boundary snapshot (reused for both early-intercept and allow) ──
      const target = startTargetRef.current;
      const panel  = target?.closest?.('.card-scroll-inner');
      const atTop  = !panel || panel.scrollTop <= 2;
      // Generous threshold: 40px from bottom counts as "at bottom"
      // so sources accordion / padding don't block the gesture
      const atBot  = !panel || panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 40;

      // ── Early intercept — prevent browser from stealing the gesture ──────────
      // Must happen before the 8px axis-lock delay, otherwise the browser
      // starts its own overscroll animation and won't release it afterward.
      //   • Upward swipe when unlocked: prevent browser overscroll-up
      //   • Downward pull at scroll-bottom: prevent browser overscroll-down
      const card = el.querySelector('.swipe-card');
      const isUnlocked = card?.dataset?.atBottom === '1';
      if (isVertical && (
        (rawDy < -2 && isUnlocked) ||   // up swipe (unlocked) → we'll handle
        (rawDy >  2 && atBot)           // down pull at bottom → we'll handle as next
      )) {
        e.preventDefault();
      }

      // Commit to axis once we've moved 8px
      if (!axisRef.current) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
        axisRef.current = isVertical ? 'v' : 'h';
      }

      // Horizontal: let the browser / React handle (no card translation)
      if (axisRef.current === 'h') return;

      // ── Vertical: decide once if this gesture translates the card stack ──────
      if (!cardDragRef.current) {
        const panelAtBottom = isUnlocked; // already read above

        // Down pull at scroll bottom → elastic → next card
        // Works from ANYWHERE (photo or text), no zone restriction
        // No canSwipeNext gate needed to START the drag (elastic is immediate);
        // commit to next card is gated later in onTouchEnd.
        const isBottomOverscroll = rawDy > 0 && atBot;
        if (isBottomOverscroll) bottomPullRef.current = true;

        const allow =
          (rawDy < 0 && panelAtBottom)     ||  // swipe up (unlocked) → next
          (rawDy > 0 && atTop && !atBot)   ||  // pull down at scroll-top only → prev
          isBottomOverscroll;                   // pull down at bottom → elastic → next

        if (allow) cardDragRef.current = true;
      }

      if (!cardDragRef.current) return; // let content scroll natively

      // Prevent page scroll while translating the card stack
      e.preventDefault();

      const { prevTopic: prev, nextTopic: next } = cbRef.current;

      let dy = rawDy;
      if (bottomPullRef.current) {
        // Elastic resistance for bottom-pull → next gesture
        dy = Math.min(Math.sqrt(rawDy) * 7, 90);
      } else if (!prev && rawDy > 0) {
        // Rubber-band at top of feed (no prev card)
        dy = Math.min(Math.sqrt(rawDy) * 9, 130);
      } else if (!next && rawDy < 0) {
        // Rubber-band at bottom of feed (no next card)
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

      const isBottomPull = bottomPullRef.current;
      bottomPullRef.current = false;

      if (!isCard) { setDragY(0); return; }

      // ── Vertical: snap decision ──────────────────────────────────────────
      const vh       = window.innerHeight;
      const velocity = Math.abs(rawDy) / dt;

      // Bottom-pull: elastic-down gesture commits at 100px raw pull.
      // Loading: require very deliberate swipe to avoid accidental nav.
      // Normal: 28% vh OR quick flick.
      const crossed = isBottomPull
        ? rawDy > 100                                           // elastic pull: 100px raw
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
