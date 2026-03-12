import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import CategoryFilter from './components/CategoryFilter';
import './App.css';

// Map take index (0-6) → position (-3 to 3)
const indexToPosition = (i) => i - 3;

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
  const [showTopicDrawer, setShowTopicDrawer]   = useState(false);

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

  // ── Reset topic & take index when category changes ────────────────────────
  useEffect(() => {
    setCurrentTopicIndex(0);
    setCurrentTakeIndex(3);
  }, [activeCategory]);

  // ── Reset take to neutral when topic changes ──────────────────────────────
  useEffect(() => {
    setCurrentTakeIndex(3);
  }, [currentTopicIndex]);

  // ── Fetch ONE take for ONE topic at ONE position ──────────────────────────
  // Takes a topic object directly — works regardless of current filter state
  const prefetchTake = useCallback(async (topic, position) => {
    if (!topic) return;
    const key = `${topic.id}:${position}`;

    if (takesMapRef.current[topic.id]?.[position] !== undefined) return;
    if (loadingSetRef.current.has(key)) return;

    loadingSetRef.current = new Set([...loadingSetRef.current, key]);
    setLoadingSet(new Set(loadingSetRef.current));

    try {
      const res = await fetch('/api/generate-takes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic, position }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.take) throw new Error('No take in response');

      takesMapRef.current = {
        ...takesMapRef.current,
        [topic.id]: {
          ...(takesMapRef.current[topic.id] || {}),
          [position]: data.take,
        },
      };
      setTakesMap({ ...takesMapRef.current });
    } catch (err) {
      console.warn(`Failed take for "${topic.title}" pos ${position}:`, err.message);
    } finally {
      loadingSetRef.current = new Set([...loadingSetRef.current].filter(k => k !== key));
      setLoadingSet(new Set(loadingSetRef.current));
    }
  }, []);

  // ── On topic change: prefetch neutral for current + adjacent topics ───────
  useEffect(() => {
    if (!filteredTopics.length) return;
    const total = filteredTopics.length;
    const cur  = filteredTopics[currentTopicIndex];
    const next = filteredTopics[(currentTopicIndex + 1) % total];
    const prev = filteredTopics[currentTopicIndex > 0 ? currentTopicIndex - 1 : 0];
    if (cur)  prefetchTake(cur,  0);
    if (next && next !== cur)  prefetchTake(next, 0);
    if (prev && prev !== cur)  prefetchTake(prev, 0);
  }, [currentTopicIndex, filteredTopics, prefetchTake]);

  // ── On take index change: fetch that position + prefetch one step each way ─
  useEffect(() => {
    if (!currentTopic) return;
    const pos = indexToPosition(currentTakeIndex);
    prefetchTake(currentTopic, pos);
    if (pos > -3) prefetchTake(currentTopic, pos - 1);
    if (pos <  3) prefetchTake(currentTopic, pos + 1);
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

      setTopicShells(data.topics);
      setCurrentTopicIndex(0);
      setCurrentTakeIndex(3);
      setActiveCategory('All');
      setLoadingStage(2);
    } catch (err) {
      clearTimeout(timer1);
      setError(err.message || 'Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchTopicShells(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigate takes ────────────────────────────────────────────────────────
  const handleTakeLeft  = useCallback(() => setCurrentTakeIndex(i => Math.max(0, i - 1)), []);
  const handleTakeRight = useCallback(() => setCurrentTakeIndex(i => Math.min(6, i + 1)), []);
  const handleTakeJump  = useCallback((index) => setCurrentTakeIndex(index), []);

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
        onRefresh={() => fetchTopicShells(true)}
        topicNumber={filteredTopics.length > 0 ? currentTopicIndex + 1 : 0}
        totalTopics={filteredTopics.length}
        onShowTopics={() => setShowTopicDrawer(true)}
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
    </div>
  );
}
