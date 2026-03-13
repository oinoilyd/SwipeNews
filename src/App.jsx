import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import TrendingDrawer from './components/TrendingDrawer';
import CategoryFilter from './components/CategoryFilter';
import './App.css';

// Category → perspectiveMode mapping
// 'full' = 7 political positions, 'limited' = Left/Neutral/Right only,
// 'sports' = Fan/Analyst/Business, 'tech' = Optimist/Skeptic/Industry
function getPerspectiveMode(category) {
  if (category === 'Sports & Culture') return 'sports';
  if (category === 'Technology')       return 'tech';
  return 'full';
}
// All non-full modes use the same 3 LIMITED_INDICES [1,3,5] for navigation
const IS_LIMITED = (pm) => pm !== 'full';

// Map take index (0-6) → position (-3 to 3)
const indexToPosition = (i) => i - 3;

// ── Limited-mode indices (Left=1, Neutral=3, Right=5) ─────────────────────────
const LIMITED_INDICES = [1, 3, 5];

// ── localStorage take cache helpers ──────────────────────────────────────────
const CACHE_PREFIX    = 'sw_take';
const CACHE_MAX_AGE   = 6 * 60 * 60 * 1000; // 6 hours

function buildCacheKey(topicId, publishedAt, position) {
  return `${CACHE_PREFIX}:${topicId}:${publishedAt ?? 'x'}:${position}`;
}

function loadCachedTake(topicId, publishedAt, position) {
  try {
    const raw = localStorage.getItem(buildCacheKey(topicId, publishedAt, position));
    if (!raw) return null;
    const { take, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_MAX_AGE) {
      localStorage.removeItem(buildCacheKey(topicId, publishedAt, position));
      return null;
    }
    return take;
  } catch { return null; }
}

function saveCachedTake(topicId, publishedAt, position, take) {
  try {
    const key = buildCacheKey(topicId, publishedAt, position);
    localStorage.setItem(key, JSON.stringify({ take, ts: Date.now() }));
  } catch { /* ignore quota errors */ }
}

function pruneOldCache(topics) {
  const validKeys = new Set();
  for (const t of topics) {
    for (let p = -3; p <= 3; p++) {
      validKeys.add(buildCacheKey(t.id, t.latestPublishedAt, p));
    }
  }
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX) && !validKeys.has(k)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

export default function App() {
  const [topicShells, setTopicShells]           = useState([]);
  // { [topicId]: { [position]: take } }  — lazy per-position
  const [takesMap, setTakesMap]                 = useState({});
  // Set<"topicId:position"> — in-flight requests
  const [loadingSet, setLoadingSet]             = useState(new Set());
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentTakeIndex, setCurrentTakeIndex]   = useState(3); // 3 = Neutral
  const [activeCategory, setActiveCategory]     = useState('All');
  const [isLoading, setIsLoading]               = useState(true);
  const [loadingStage, setLoadingStage]         = useState(0);
  const [error, setError]                       = useState(null);
  const [showTopicDrawer,    setShowTopicDrawer]    = useState(false);
  const [showTrendingDrawer, setShowTrendingDrawer] = useState(false);

  // Refs for stale-closure-safe async callbacks
  const takesMapRef   = useRef({});
  const loadingSetRef = useRef(new Set());

  // ── Filtered topic list ───────────────────────────────────────────────────
  const filteredTopics = useMemo(() =>
    activeCategory === 'All'
      ? topicShells
      : topicShells.filter(t => t.category === activeCategory),
  [topicShells, activeCategory]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentTopic       = filteredTopics[currentTopicIndex] ?? null;
  const currentPosition    = indexToPosition(currentTakeIndex);
  const currentTake        = currentTopic
    ? (takesMap[currentTopic.id]?.[currentPosition] ?? null)
    : null;
  const currentTakeLoading = currentTopic
    ? loadingSet.has(`${currentTopic.id}:${currentPosition}`)
    : false;
  const perspectiveMode    = currentTopic?.perspectiveMode ?? 'full';

  // ── Reset topic & take index when category changes ────────────────────────
  useEffect(() => {
    setCurrentTopicIndex(0);
    setCurrentTakeIndex(3);
  }, [activeCategory]);

  // ── Reset take to neutral when topic changes ──────────────────────────────
  useEffect(() => {
    setCurrentTakeIndex(3);
  }, [currentTopicIndex]);

  // ── Store a completed take into state + localStorage cache ───────────────
  const storeTake = useCallback((topic, position, take) => {
    saveCachedTake(topic.id, topic.latestPublishedAt, position, take);
    takesMapRef.current = {
      ...takesMapRef.current,
      [topic.id]: {
        ...(takesMapRef.current[topic.id] || {}),
        [position]: take,
      },
    };
    setTakesMap({ ...takesMapRef.current });
  }, []);

  // ── Fetch ONE take via SSE streaming endpoint ─────────────────────────────
  const fetchStreamTake = useCallback(async (topic, position, key) => {
    const res = await fetch('/api/stream-take', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic, position }),
    });
    if (!res.ok) throw new Error(`stream-take HTTP ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.done && event.take) {
            return event.take;
          }
        } catch { /* partial line */ }
      }
    }
    throw new Error('Stream ended without take');
  }, []);

  // ── Fetch ONE take for ONE topic at ONE position ──────────────────────────
  const prefetchTake = useCallback(async (topic, position) => {
    if (!topic) return;
    const key = `${topic.id}:${position}`;

    if (takesMapRef.current[topic.id]?.[position] !== undefined) return;
    if (loadingSetRef.current.has(key)) return;
    if (loadingSetRef.current.size >= 2) return;

    // Check localStorage cache first
    const cached = loadCachedTake(topic.id, topic.latestPublishedAt, position);
    if (cached) {
      takesMapRef.current = {
        ...takesMapRef.current,
        [topic.id]: { ...(takesMapRef.current[topic.id] || {}), [position]: cached },
      };
      setTakesMap({ ...takesMapRef.current });
      return;
    }

    loadingSetRef.current = new Set([...loadingSetRef.current, key]);
    setLoadingSet(new Set(loadingSetRef.current));

    try {
      // Try fast path (returns instantly if Redis-cached, slower if generating)
      const TIMEOUT_MS = 4000;
      let take = null;

      try {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch('/api/generate-takes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ topic, position }),
          signal:  controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.take) take = data.take;
        }
      } catch (fastErr) {
        if (fastErr.name !== 'AbortError') throw fastErr;
        // Timed out — fall through to streaming
        console.info(`Falling back to streaming for "${topic.title}" pos ${position}`);
      }

      // If fast path timed out, use streaming fallback
      if (!take) {
        take = await fetchStreamTake(topic, position, key);
      }

      storeTake(topic, position, take);
    } catch (err) {
      console.warn(`Failed take for "${topic.title}" pos ${position}:`, err.message);
    } finally {
      loadingSetRef.current = new Set([...loadingSetRef.current].filter(k => k !== key));
      setLoadingSet(new Set(loadingSetRef.current));
    }
  }, [storeTake, fetchStreamTake]);

  // ── On topic change: prefetch neutral for current topic only ─────────────
  useEffect(() => {
    if (!filteredTopics.length) return;
    const cur = filteredTopics[currentTopicIndex];
    if (cur) prefetchTake(cur, 0);
  }, [currentTopicIndex, filteredTopics, prefetchTake]);

  // ── On take index change: fetch that position + prefetch neighbors ─────────
  useEffect(() => {
    if (!currentTopic) return;
    const pos = indexToPosition(currentTakeIndex);
    prefetchTake(currentTopic, pos);

    if (IS_LIMITED(currentTopic.perspectiveMode)) {
      // Only prefetch adjacent available limited positions
      const idx = LIMITED_INDICES.indexOf(currentTakeIndex);
      if (idx > 0)                       prefetchTake(currentTopic, indexToPosition(LIMITED_INDICES[idx - 1]));
      if (idx < LIMITED_INDICES.length - 1) prefetchTake(currentTopic, indexToPosition(LIMITED_INDICES[idx + 1]));
    } else {
      if (pos > -3) prefetchTake(currentTopic, pos - 1);
      if (pos <  3) prefetchTake(currentTopic, pos + 1);
    }
  }, [currentTakeIndex, currentTopic, prefetchTake]);

  // ── Fetch topic shells ────────────────────────────────────────────────────
  const fetchTopicShells = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setLoadingStage(0);
    setError(null);

    const timer1 = setTimeout(() => setLoadingStage(1), 2500);

    try {
      const url = forceRefresh ? '/api/clustered-news?refresh=1' : '/api/clustered-news';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.topics?.length) throw new Error('No topics returned');

      clearTimeout(timer1);

      takesMapRef.current   = {};
      loadingSetRef.current = new Set();
      setTakesMap({});
      setLoadingSet(new Set());

      const processedTopics = data.topics.map(t => ({
        ...t,
        perspectiveMode: getPerspectiveMode(t.category),
      }));
      setTopicShells(processedTopics);
      setCurrentTopicIndex(0);
      setCurrentTakeIndex(3);
      setActiveCategory('All');
      setLoadingStage(2);

      // Clean up stale cache entries
      pruneOldCache(data.topics);
    } catch (err) {
      clearTimeout(timer1);
      setError(err.message || 'Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Manual refresh: fire pregenerate in background, then reload topics ──────
  const handleManualRefresh = useCallback(() => {
    // Kick off full cache regeneration in the background (takes up to 5 min, fire-and-forget)
    fetch('/api/pregenerate', { method: 'POST' }).catch(() => {/* ignore */});
    // Immediately reload topic shells bypassing the news cache
    fetchTopicShells(true);
  }, [fetchTopicShells]);

  // Initial load
  useEffect(() => { fetchTopicShells(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigate takes — respect limited mode ─────────────────────────────────
  const handleTakeLeft = useCallback(() => {
    if (IS_LIMITED(perspectiveMode)) {
      const prev = LIMITED_INDICES.filter(i => i < currentTakeIndex);
      if (prev.length) setCurrentTakeIndex(prev[prev.length - 1]);
    } else {
      setCurrentTakeIndex(i => Math.max(0, i - 1));
    }
  }, [perspectiveMode, currentTakeIndex]);

  const handleTakeRight = useCallback(() => {
    if (IS_LIMITED(perspectiveMode)) {
      const next = LIMITED_INDICES.filter(i => i > currentTakeIndex);
      if (next.length) setCurrentTakeIndex(next[0]);
    } else {
      setCurrentTakeIndex(i => Math.min(6, i + 1));
    }
  }, [perspectiveMode, currentTakeIndex]);

  const handleTakeJump = useCallback((index) => {
    if (IS_LIMITED(perspectiveMode) && !LIMITED_INDICES.includes(index)) return;
    setCurrentTakeIndex(index);
  }, [perspectiveMode]);

  // ── Navigate topics ───────────────────────────────────────────────────────
  const handleNextTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i + 1) % filteredTopics.length);
  }, [filteredTopics.length]);

  const handlePrevTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i - 1 + filteredTopics.length) % filteredTopics.length);
  }, [filteredTopics.length]);

  const handleJumpToTopic = useCallback((index) => {
    setShowTopicDrawer(false);
    setCurrentTopicIndex(index);
  }, []);

  const handleTrendingSelect = useCallback((topic) => {
    setShowTrendingDrawer(false);
    const index = topicShells.findIndex(t => t.id === topic.id);
    if (index !== -1) {
      setActiveCategory('All');
      setCurrentTopicIndex(index);
    }
  }, [topicShells]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (showTopicDrawer) {
        if (e.key === 'Escape') setShowTopicDrawer(false);
        return;
      }
      if (e.key === 'ArrowRight') handleTakeRight();
      else if (e.key === 'ArrowLeft') handleTakeLeft();
      else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); handleNextTopic(); }
      else if (e.key === 'ArrowUp') handlePrevTopic();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTakeLeft, handleTakeRight, handleNextTopic, handlePrevTopic, showTopicDrawer]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen stage={loadingStage} />;

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p className="error-msg">{error}</p>
          <button className="btn-primary" onClick={() => fetchTopicShells(true)}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!topicShells.length) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">📭</div>
          <h2>No topics found</h2>
          <p className="error-msg">Couldn't identify major stories right now.</p>
          <button className="btn-primary" onClick={() => fetchTopicShells(true)}>Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onRefresh={handleManualRefresh}
        onShowTopics={() => setShowTopicDrawer(true)}
        onShowTrending={() => setShowTrendingDrawer(true)}
      />

      <CategoryFilter
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        topicShells={topicShells}
      />

      <main className="main">
        {filteredTopics.length === 0 ? (
          <div className="empty-category">
            <p className="empty-category-msg">No topics in this category yet.</p>
            <button className="btn-secondary" onClick={() => setActiveCategory('All')}>
              Show All Topics
            </button>
          </div>
        ) : currentTopic && (
          <CardStack
            topic={currentTopic}
            currentTake={currentTake}
            currentTakeIndex={currentTakeIndex}
            takesLoading={currentTakeLoading}
            onTakeLeft={handleTakeLeft}
            onTakeRight={handleTakeRight}
            onTakeJump={handleTakeJump}
            onNextTopic={handleNextTopic}
            onPrevTopic={handlePrevTopic}
            currentTopicIndex={currentTopicIndex}
            totalTopics={filteredTopics.length}
            perspectiveMode={perspectiveMode}
          />
        )}
      </main>

      {showTopicDrawer && (
        <TopicDrawer
          topics={filteredTopics}
          takesMap={takesMap}
          currentIndex={currentTopicIndex}
          onSelect={handleJumpToTopic}
          onClose={() => setShowTopicDrawer(false)}
        />
      )}

      {showTrendingDrawer && (
        <TrendingDrawer
          topics={topicShells}
          onClose={() => setShowTrendingDrawer(false)}
          onSelectTopic={handleTrendingSelect}
        />
      )}
    </div>
  );
}
