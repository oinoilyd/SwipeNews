import { useState, useRef, useEffect, useCallback } from 'react';
import { HISTORY_DISPUTES } from '../lib/historyData.js';

// ── Constants (mirrors CardStack) ─────────────────────────────────────────────
const SNAP_THRESHOLD = 0.25;
const FLICK_VEL      = 0.5;
const FLICK_MIN      = 30;
const H_SWIPE_MIN    = 40;
const H_SWIPE_LOCK   = 380;

// ── Gradient badge colours per dispute index ──────────────────────────────────
const DISPUTE_BG = [
  'linear-gradient(160deg, #0f2744 0%, #1a4070 100%)',  // israel-palestine: blue
  'linear-gradient(160deg, #0f0f2a 0%, #2e1050 100%)',  // us-russia: navy/purple
  'linear-gradient(160deg, #0a2e18 0%, #0f2744 100%)',  // india-pakistan: green/blue
  'linear-gradient(160deg, #2a0a0a 0%, #0f2744 100%)',  // china-taiwan: red/blue
];

// ── Single history card ───────────────────────────────────────────────────────
function HistoryCard({ dispute, perspectiveIndex, isPreview = false }) {
  const scrollRef   = useRef(null);
  const perspective = dispute.perspectives[perspectiveIndex];
  const accent      = perspective?.color || '#a78bfa';
  const tint        = `${accent}18`;
  const bg          = DISPUTE_BG[HISTORY_DISPUTES.indexOf(dispute)] || DISPUTE_BG[0];

  // Reset scroll when perspective changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [perspectiveIndex, dispute.id]);

  if (isPreview) {
    return (
      <div className="swipe-card" style={{ '--accent': accent, '--card-tint': tint }}>
        <div className="card-photo-section" style={{ background: bg }}>
          <div className="card-photo-gradient" />
          <div className="card-tint-overlay" />
          <div className="card-photo-footer">
            <h2 className="card-title-overlay">{dispute.title}</h2>
          </div>
        </div>
        <div className="card-scroll-inner card-preview-body" />
      </div>
    );
  }

  return (
    <div className="swipe-card" style={{ '--accent': accent, '--card-tint': tint }}>

      {/* ── Photo-style header (gradient, not a real photo) ── */}
      <div className="card-photo-section" style={{ background: bg }}>
        <div className="card-photo-gradient" />
        <div className="card-tint-overlay" />

        {/* Top row: period badge + dispute counter */}
        <div className="card-top-row">
          <span className="topic-category-badge history-period-badge">{dispute.period}</span>
        </div>

        {/* Title + perspective dots */}
        <div className="card-photo-footer">
          <h2 className="card-title-overlay">{dispute.title}</h2>
          <div className="history-persp-dots">
            {dispute.perspectives.map((p, i) => (
              <span
                key={i}
                className={`history-persp-dot${i === perspectiveIndex ? ' active' : ''}`}
                style={{ background: i === perspectiveIndex ? p.color : 'rgba(255,255,255,0.3)' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="card-scroll-inner" ref={scrollRef}>
        <div className="card-content-section">

          {/* Perspective label bar */}
          <div className="history-perspective-bar" style={{ borderColor: `${accent}40`, background: `${accent}12` }}>
            <span className="history-perspective-label" style={{ color: accent }}>
              {perspective.label.toUpperCase()}
            </span>
            <span className="history-swipe-hint">← swipe →</span>
          </div>

          {/* Perspective content */}
          <div className="card-take-content">
            <h3 className="history-persp-title">{perspective.title}</h3>
            <div className="history-persp-body">
              {perspective.paragraphs.map((p, i) => (
                <p key={i} className="history-paragraph">{p}</p>
              ))}
            </div>
            <div className="history-nav-hint">
              <span>↑↓ change dispute</span>
              <span>·</span>
              <span>←→ change perspective</span>
            </div>
          </div>

          <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }} />
        </div>
      </div>
    </div>
  );
}

// ── HistoryTab — manages dispute + perspective navigation ─────────────────────
export default function HistoryTab() {
  const [disputeIndex,     setDisputeIndex]     = useState(0);
  const [perspectiveIndex, setPerspectiveIndex] = useState(1); // start on neutral
  const [dragY,            setDragY]            = useState(0);
  const [snapping,         setSnapping]         = useState(false);

  const containerRef    = useRef(null);
  const startYRef       = useRef(0);
  const startXRef       = useRef(0);
  const startTimeRef    = useRef(0);
  const startScrollRef  = useRef(0);
  const panelRef        = useRef(null);
  const phaseRef        = useRef('idle');
  const isDragging      = useRef(false);
  const lastHSwipe      = useRef(0);

  const totalDisputes = HISTORY_DISPUTES.length;
  const dispute       = HISTORY_DISPUTES[disputeIndex];
  const prevDispute   = disputeIndex > 0 ? HISTORY_DISPUTES[disputeIndex - 1] : null;
  const nextDispute   = disputeIndex < totalDisputes - 1 ? HISTORY_DISPUTES[disputeIndex + 1] : null;

  // Reset perspective to neutral when dispute changes
  useEffect(() => { setPerspectiveIndex(1); }, [disputeIndex]);

  // Stable callback ref
  const cbRef = useRef({});
  cbRef.current = {
    snapping, prevDispute, nextDispute, perspectiveIndex,
    goNextDispute: () => {
      if (disputeIndex < totalDisputes - 1) setDisputeIndex(i => i + 1);
    },
    goPrevDispute: () => {
      if (disputeIndex > 0) setDisputeIndex(i => i - 1);
    },
    goPerspLeft: () => setPerspectiveIndex(i => Math.max(0, i - 1)),
    goPerspRight: () => setPerspectiveIndex(i => Math.min(dispute.perspectives.length - 1, i + 1)),
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e) {
      if (cbRef.current.snapping) return;
      const t = e.touches[0];
      startYRef.current    = t.clientY;
      startXRef.current    = t.clientX;
      startTimeRef.current = Date.now();
      phaseRef.current     = 'deciding';
      isDragging.current   = true;

      const panel = e.target.closest?.('.card-scroll-inner') ?? null;
      panelRef.current       = panel;
      startScrollRef.current = panel?.scrollTop ?? 0;
    }

    function onTouchMove(e) {
      if (!isDragging.current || cbRef.current.snapping) return;

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      if (phaseRef.current === 'deciding') {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          phaseRef.current = 'h'; return;
        }
        if (Math.abs(dy) < 6) return;
        phaseRef.current = 'scroll';
      }

      if (phaseRef.current === 'h') return;

      const panel      = panelRef.current;
      const scrollDelta = panel ? (panel.scrollTop - startScrollRef.current) : 0;
      const rawCardDy   = dy + scrollDelta;

      const atTop = !panel || panel.scrollTop <= 1;
      const atBot = !panel || panel.scrollTop >= panel.scrollHeight - panel.clientHeight - 1;

      if ((dy > 0 && atTop) || (dy < 0 && atBot) || phaseRef.current === 'card') {
        e.preventDefault();
      }

      if (phaseRef.current === 'scroll' && Math.abs(rawCardDy) > 8) {
        phaseRef.current = 'card';
      }
      if (phaseRef.current !== 'card') return;

      const { prevDispute: prev, nextDispute: next } = cbRef.current;
      let visualDy = rawCardDy;
      if (rawCardDy > 0 && !prev) visualDy =  Math.min(Math.sqrt(rawCardDy)  * 10, 110);
      if (rawCardDy < 0 && !next) visualDy = -Math.min(Math.sqrt(-rawCardDy) * 10, 110);
      setDragY(visualDy);
    }

    function onTouchEnd(e) {
      if (!isDragging.current) return;
      isDragging.current = false;

      const phase = phaseRef.current;
      phaseRef.current = 'idle';

      const dx = e.changedTouches[0].clientX - startXRef.current;
      const dy = e.changedTouches[0].clientY - startYRef.current;
      const dt = Math.max(Date.now() - startTimeRef.current, 1);

      const { goPerspLeft, goPerspRight, goNextDispute, goPrevDispute,
              prevDispute: prev, nextDispute: next } = cbRef.current;

      // Horizontal → perspective
      if (phase === 'h') {
        if (Math.abs(dx) >= H_SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.2) {
          const now = Date.now();
          if (now - lastHSwipe.current >= H_SWIPE_LOCK) {
            lastHSwipe.current = now;
            dx < 0 ? goPerspRight() : goPerspLeft();
          }
        }
        setDragY(0); return;
      }

      if (phase !== 'card') { setDragY(0); return; }

      const panel      = panelRef.current;
      const scrollDelta = panel ? (panel.scrollTop - startScrollRef.current) : 0;
      const rawCardDy   = dy + scrollDelta;

      const vh       = window.innerHeight;
      const absDy    = Math.abs(rawCardDy);
      const velocity = absDy / dt;
      const crossed  = absDy > vh * SNAP_THRESHOLD || (velocity > FLICK_VEL && absDy > FLICK_MIN);

      setSnapping(true);
      if (crossed && rawCardDy < 0 && next) {
        setDragY(-vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goNextDispute(); }, 300);
      } else if (crossed && rawCardDy > 0 && prev) {
        setDragY(vh);
        setTimeout(() => { setDragY(0); setSnapping(false); goPrevDispute(); }, 300);
      } else {
        setDragY(0);
        setTimeout(() => setSnapping(false), 300);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true  });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []); // stable — reads live values through cbRef

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  setPerspectiveIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPerspectiveIndex(i => Math.min(dispute.perspectives.length - 1, i + 1));
      if (e.key === 'ArrowDown')  { e.preventDefault(); if (nextDispute) setDisputeIndex(i => i + 1); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); if (prevDispute) setDisputeIndex(i => i - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispute, nextDispute, prevDispute]);

  const isEdge     = (!prevDispute && dragY > 0) || (!nextDispute && dragY < 0);
  const snapTrans  = 'transform 0.30s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  const edgeTrans  = 'transform 0.48s cubic-bezier(0.34, 1.56, 0.64, 1)';
  const transition = snapping ? snapTrans : isEdge ? edgeTrans : 'none';

  return (
    <div className="history-tab">

      {/* Dispute counter strip */}
      <div className="history-counter-strip">
        {HISTORY_DISPUTES.map((d, i) => (
          <button
            key={d.id}
            className={`history-counter-dot${i === disputeIndex ? ' active' : ''}`}
            onClick={() => setDisputeIndex(i)}
            title={d.title}
          />
        ))}
        <span className="history-counter-label">
          {disputeIndex + 1} / {totalDisputes}
        </span>
      </div>

      {/* Card stack */}
      <div className="history-card-area" ref={containerRef}>

        {prevDispute && (
          <div className="card-track-slide"
            style={{ transform: `translateY(calc(-100% + ${dragY}px))`, transition }}>
            <HistoryCard dispute={prevDispute} perspectiveIndex={1} isPreview />
          </div>
        )}

        <div className="card-track-slide"
          style={{ transform: `translateY(${dragY}px)`, transition }}>
          <HistoryCard dispute={dispute} perspectiveIndex={perspectiveIndex} />
        </div>

        {nextDispute && (
          <div className="card-track-slide"
            style={{ transform: `translateY(calc(100% + ${dragY}px))`, transition }}>
            <HistoryCard dispute={nextDispute} perspectiveIndex={1} isPreview />
          </div>
        )}
      </div>
    </div>
  );
}
