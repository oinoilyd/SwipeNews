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
  const lastHSwipe     = useRef(0);

  // Rendering state (these drive the actual card positions)
  const [dragY,    setDragY]    = useState(0);
  const [snapping, setSnapping] = useState(false);

  // Keep callback refs so event listeners always call the latest version
  const cbRef = useRef({});
  cbRef.current = {
    prevTopic, nextTopic, snapping,
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
      startXRef.current      = e.touches[0].clientX;
      startYRef.current      = e.touches[0].clientY;
      startTimeRef.current   = Date.now();
      startTargetRef.current = e.target;
    }

    function onTouchMove(e) {
      if (!isDragging.current || cbRef.current.snapping) return;

      const rawDx = e.touches[0].clientX - startXRef.current;
      const rawDy = e.touches[0].clientY - startYRef.current;

      // Commit to axis once we've moved 8px
      if (!axisRef.current) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
        axisRef.current = Math.abs(rawDx) > Math.abs(rawDy) ? 'h' : 'v';
      }

      // Horizontal: let the browser / React handle (no card translation)
      if (axisRef.current === 'h') return;

      // Vertical: decide once if this gesture translates cards
      if (!cardDragRef.current) {
        const target   = startTargetRef.current;
        const panel    = target?.closest?.('.card-take-panel');
        const isHero   = !panel;
        const atTop    = !panel || panel.scrollTop <= 2;
        const atBottom = !panel ||
          panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4;

        // For hero→up (intent: next card), only allow if take panel is at bottom
        const card           = el.querySelector('.swipe-card');
        const panelAtBottom  = card?.dataset?.atBottom === '1';

        const allow =
          (isHero  && rawDy > 0) ||                    // hero swipe down → prev (always ok)
          (isHero  && rawDy < 0 && panelAtBottom) ||   // hero swipe up → next (only if read)
          (!isHero && rawDy > 0 && atTop)    ||        // panel swipe down at top → prev
          (!isHero && rawDy < 0 && atBottom);          // panel swipe up at bottom → next

        if (allow) cardDragRef.current = true;
      }

      if (!cardDragRef.current) return; // let the take panel scroll natively

      // Prevent page scroll while translating the card stack
      e.preventDefault();

      const { prevTopic: prev, nextTopic: next } = cbRef.current;

      // Rubber-band resistance at feed edges
      let dy = rawDy;
      if (!prev && rawDy > 0) dy = Math.min(Math.sqrt(rawDy) * 9, 130);
      if (!next && rawDy < 0) dy = Math.max(-Math.sqrt(-rawDy) * 9, -130);

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
              onRefreshOrder: doRefresh } = cbRef.current;

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

      if (!isCard) { setDragY(0); return; }

      // ── Vertical: snap decision ──────────────────────────────────────────
      const vh       = window.innerHeight;
      const velocity = Math.abs(rawDy) / dt;
      const crossed  = Math.abs(rawDy) > vh * SNAP_THRESHOLD || velocity > 0.55;

      setSnapping(true);

      if (crossed && rawDy < 0 && next) {
        setDragY(-vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goNext(); }, 300);
      } else if (crossed && rawDy > 0 && prev) {
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
