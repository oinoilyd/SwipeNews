import { useState, useEffect, useRef, useCallback } from 'react';
import SwipeCard from './SwipeCard';
import SpectrumBar from './SpectrumBar';

// ── localStorage history ──────────────────────────────────────────────────────
const HISTORY_KEY = 'sw_ask_history';
const MAX_HISTORY  = 20;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); }
  catch { /* quota */ }
}

// ── Example prompts shown when history is empty ───────────────────────────────
const EXAMPLES = [
  'Gaza ceasefire negotiations',
  'US debt ceiling crisis',
  'AI regulation legislation',
  'Federal Reserve interest rates',
  'Ukraine war latest',
  'Immigration reform bill',
];

// ── Horizontal swipe hook ─────────────────────────────────────────────────────
function useHSwipe(elRef, onLeft, onRight, active) {
  const startX = useRef(0);
  const startY = useRef(0);
  useEffect(() => {
    if (!active) return;
    const el = elRef.current;
    if (!el) return;
    const onStart = (e) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };
    const onEnd = (e) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        dx < 0 ? onRight() : onLeft();
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [elRef, onLeft, onRight, active]);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AskTab({ lang = 'en', apiLang = 'English' }) {
  const [query,          setQuery]          = useState('');
  const [result,         setResult]         = useState(null); // { topic, takes }
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState(null);
  const [history,        setHistory]        = useState(loadHistory);
  const [takeIndex,      setTakeIndex]      = useState(3); // neutral

  const inputRef    = useRef(null);
  const containerRef = useRef(null);

  // Keyboard shortcuts when a card is shown
  useEffect(() => {
    if (!result) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft')  setTakeIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setTakeIndex(i => Math.min(6, i + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [result]);

  // Horizontal swipe on the card area
  const handleLeft  = useCallback(() => setTakeIndex(i => Math.max(0, i - 1)), []);
  const handleRight = useCallback(() => setTakeIndex(i => Math.min(6, i + 1)), []);
  useHSwipe(containerRef, handleLeft, handleRight, !!result);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (overrideQuery) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setError(null);
    setTakeIndex(3);

    try {
      const res = await fetch('/api/ask-topic', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q, language: apiLang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResult(data);
      setQuery(q);

      // Prepend to history (deduplicated by query text)
      const entry = { query: q, topic: data.topic, takes: data.takes, ts: Date.now() };
      setHistory(prev => {
        const deduped = prev.filter(h => h.query.toLowerCase() !== q.toLowerCase());
        const next = [entry, ...deduped];
        saveHistory(next);
        return next;
      });
    } catch (err) {
      setError(err.message || 'Failed to generate perspectives');
    } finally {
      setIsLoading(false);
    }
  }, [query, apiLang, isLoading]);

  const handleHistorySelect = useCallback((item) => {
    setQuery(item.query);
    setResult({ topic: item.topic, takes: item.takes });
    setTakeIndex(3);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  // Derived
  const position    = takeIndex - 3;
  const currentTake = result?.takes?.[position] ?? null;

  const specBar = result ? (
    <SpectrumBar
      currentTakeIndex={takeIndex}
      onTakeJump={setTakeIndex}
      perspectiveMode="full"
      lang={lang}
    />
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ask-tab">

      {/* ── Search bar ── */}
      <div className="ask-search-bar">
        <div className="ask-search-inner">
          <span className="ask-search-icon">✦</span>
          <input
            ref={inputRef}
            className="ask-search-input"
            type="text"
            placeholder="Ask about any topic or headline…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
          />
          {result && !isLoading && (
            <button className="ask-clear-btn" onClick={handleClear} title="Clear">✕</button>
          )}
        </div>
        <button
          className="ask-submit-btn"
          onClick={() => handleSubmit()}
          disabled={isLoading || !query.trim()}
        >
          {isLoading
            ? <span className="spinner-ring-sm" />
            : <span className="ask-submit-arrow">→</span>
          }
        </button>
      </div>

      {/* ── Content area ── */}
      <div className="ask-content" ref={containerRef}>

        {/* Loading */}
        {isLoading && (
          <div className="ask-generating">
            <div className="spinner-ring ask-spinner" />
            <p className="ask-generating-title">Generating 7 perspectives</p>
            <p className="ask-generating-sub">Analyzing "{query}" across the political spectrum</p>
            <div className="ask-spectrum-preview">
              {['Far Left','Left','Center-Left','Neutral','Center-Right','Right','Far Right'].map((l, i) => (
                <div key={l} className="ask-spectrum-dot" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="ask-error-state">
            <span className="ask-error-icon">⚠</span>
            <p className="ask-error-msg">{error}</p>
            <button className="btn-secondary" onClick={() => handleSubmit()}>Try again</button>
          </div>
        )}

        {/* Card result */}
        {!isLoading && result && !error && (
          <div className="ask-card-container">
            <SwipeCard
              topic={result.topic}
              currentTake={currentTake}
              currentTakeIndex={takeIndex}
              topicTakesMap={result.takes}
              takesLoading={false}
              perspectiveMode="full"
              spectrumBar={specBar}
            />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !result && !error && (
          <div className="ask-empty-state">

            {history.length > 0 ? (
              <>
                <p className="ask-section-label">Recent asks</p>
                <div className="ask-history-list">
                  {history.map((item, i) => (
                    <button
                      key={i}
                      className="ask-history-item"
                      onClick={() => handleHistorySelect(item)}
                    >
                      <span className="ask-history-icon">↩</span>
                      <span className="ask-history-text">{item.query}</span>
                      <span className="ask-history-arrow">→</span>
                    </button>
                  ))}
                </div>

                <p className="ask-section-label" style={{ marginTop: 20 }}>Try an example</p>
                <div className="ask-examples-grid">
                  {EXAMPLES.slice(0, 4).map(ex => (
                    <button key={ex} className="ask-example-chip"
                      onClick={() => { setQuery(ex); handleSubmit(ex); }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ask-intro">
                <div className="ask-intro-icon">✦</div>
                <h3 className="ask-intro-title">Ask about anything</h3>
                <p className="ask-intro-sub">
                  Type any topic or headline and get 7 perspectives from across the political spectrum — generated instantly by AI.
                </p>
                <div className="ask-examples-grid">
                  {EXAMPLES.map(ex => (
                    <button key={ex} className="ask-example-chip"
                      onClick={() => { setQuery(ex); handleSubmit(ex); }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
