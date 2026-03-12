import { useState, useEffect, useCallback, useRef } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import './App.css';

// Map take index (0-6) to position (-3 to 3)
const indexToPosition = (i) => i - 3;

export default function App() {
  const [topicShells, setTopicShells]           = useState([]);
  // { [topicId]: { [position]: take } }  — individual takes keyed by position
  const [takesMap, setTakesMap]                 = useState({});
  // Set<"topicId:position"> — tracks in-flight requests
  const [loadingSet, setLoadingSet]             = useState(new Set());
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentTakeIndex, setCurrentTakeIndex]   = useState(3); // 3 = Neutral (position 0)
  const [isLoading, setIsLoading]               = useState(true);
  const [loadingStage, setLoadingStage]         = useState(0);
  const [error, setError]                       = useState(null);
  const [showTopicDrawer, setShowTopicDrawer]   = useState(false);

  // Refs for stale-closure-safe access inside async callbacks
  const takesMapRef    = useRef({});
  const loadingSetRef  = useRef(new Set());
  const topicShellsRef = useRef([]);

  // Derived values
  const currentTopic    = topicShells[currentTopicIndex];
  const currentPosition = indexToPosition(currentTakeIndex);
  const currentTake     = currentTopic
    ? (takesMap[currentTopic.id]?.[currentPosition] ?? null)
    : null;
  const currentTakeLoading = currentTopic
    ? loadingSet.has(`${currentTopic.id}:${currentPosition}`)
    : false;

  // ── Fetch ONE take at ONE position ──────────────────────────────────────────
  const prefetchTake = useCallback(async (topicIndex, position) => {
    const shells = topicShellsRef.current;
    const topic  = shells[topicIndex];
    if (!topic) return;

    const key = `${topic.id}:${position}`;

    // Skip if already loaded or in-flight
    if (takesMapRef.current[topic.id]?.[position] !== undefined) return;
    if (loadingSetRef.current.has(key)) return;

    loadingSetRef.current = new Set([...loadingSetRef.current, key]);
    setLoadingSet(new Set(loadingSetRef.current));

    try {
      const res = await fetch('/api/generate-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, position }),
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

  // ── Fetch topic shells (fast — just clustering, ~5-8s) ───────────────────────
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

      // Reset all takes state on refresh
      takesMapRef.current  = {};
      loadingSetRef.current = new Set();
      setTakesMap({});
      setLoadingSet(new Set());

      setTopicShells(data.topics);
      topicShellsRef.current = data.topics;
      setCurrentTopicIndex(0);
      setCurrentTakeIndex(3);
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

  // Reset to neutral when topic changes
  useEffect(() => {
    setCurrentTakeIndex(3);
  }, [currentTopicIndex]);

  // When topic changes: prefetch neutral (0) for current + adjacent topics
  useEffect(() => {
    if (!topicShells.length) return;
    const total = topicShells.length;
    prefetchTake(currentTopicIndex, 0);
    prefetchTake((currentTopicIndex + 1) % total, 0);
    if (currentTopicIndex > 0) prefetchTake(currentTopicIndex - 1, 0);
  }, [currentTopicIndex, topicShells.length, prefetchTake]);

  // When take index changes: fetch that position + prefetch one step in each direction
  useEffect(() => {
    if (!topicShells.length) return;
    const pos = indexToPosition(currentTakeIndex);
    prefetchTake(currentTopicIndex, pos);
    if (pos > -3) prefetchTake(currentTopicIndex, pos - 1);
    if (pos <  3) prefetchTake(currentTopicIndex, pos + 1);
  }, [currentTakeIndex, currentTopicIndex, topicShells.length, prefetchTake]);

  // ── Navigate takes ────────────────────────────────────────────────────────────
  const handleTakeLeft = useCallback(() => {
    setCurrentTakeIndex(i => Math.max(0, i - 1));
  }, []);

  const handleTakeRight = useCallback(() => {
    setCurrentTakeIndex(i => Math.min(6, i + 1));
  }, []);

  const handleTakeJump = useCallback((index) => {
    setCurrentTakeIndex(index);
  }, []);

  // ── Navigate topics ───────────────────────────────────────────────────────────
  const handleNextTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i + 1) % topicShells.length);
  }, [topicShells.length]);

  const handlePrevTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i - 1 + topicShells.length) % topicShells.length);
  }, [topicShells.length]);

  const handleJumpToTopic = useCallback((index) => {
    setShowTopicDrawer(false);
    setCurrentTopicIndex(index);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────────
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
        topicNumber={currentTopicIndex + 1}
        totalTopics={topicShells.length}
        onShowTopics={() => setShowTopicDrawer(true)}
      />
      <main className="main">
        {currentTopic && (
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
            totalTopics={topicShells.length}
          />
        )}
      </main>

      {showTopicDrawer && (
        <TopicDrawer
          topics={topicShells}
          takesMap={takesMap}
          currentIndex={currentTopicIndex}
          onSelect={handleJumpToTopic}
          onClose={() => setShowTopicDrawer(false)}
        />
      )}
    </div>
  );
}
