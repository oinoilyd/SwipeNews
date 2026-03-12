import { useState, useEffect, useCallback, useRef } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import './App.css';

export default function App() {
  const [topicShells, setTopicShells]         = useState([]);
  const [takesMap, setTakesMap]               = useState({});   // { [topicId]: takes[] }
  const [loadingTakes, setLoadingTakes]       = useState(new Set());
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentTakeIndex, setCurrentTakeIndex]   = useState(3); // 3 = Neutral
  const [isLoading, setIsLoading]             = useState(true);
  const [loadingStage, setLoadingStage]       = useState(0);
  const [error, setError]                     = useState(null);
  const [showTopicDrawer, setShowTopicDrawer] = useState(false);

  // Refs for stale-closure-safe access inside async callbacks
  const takesMapRef       = useRef({});
  const loadingRef        = useRef(new Set());
  const topicShellsRef    = useRef([]);

  // Keep refs in sync
  useEffect(() => { topicShellsRef.current = topicShells; }, [topicShells]);

  // Derived values
  const currentTopic  = topicShells[currentTopicIndex];
  const currentTakes  = currentTopic ? takesMap[currentTopic.id] : null;
  const currentTake   = Array.isArray(currentTakes) ? currentTakes[currentTakeIndex] : null;
  const takesAreLoading = currentTopic ? loadingTakes.has(currentTopic.id) : false;

  // ── Fetch takes for one topic ────────────────────────────────────────────────
  const prefetchTakes = useCallback(async (index) => {
    const shells = topicShellsRef.current;
    const topic = shells[index];
    if (!topic) return;

    // Skip if already loaded or in-flight
    if (takesMapRef.current[topic.id] || loadingRef.current.has(topic.id)) return;

    loadingRef.current = new Set([...loadingRef.current, topic.id]);
    setLoadingTakes(new Set(loadingRef.current));

    try {
      const res = await fetch('/api/generate-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!Array.isArray(data.takes) || data.takes.length !== 7) {
        throw new Error('Invalid takes response');
      }

      takesMapRef.current = { ...takesMapRef.current, [topic.id]: data.takes };
      setTakesMap({ ...takesMapRef.current });
    } catch (err) {
      console.warn(`Failed to load takes for "${topic.title}":`, err.message);
    } finally {
      loadingRef.current = new Set([...loadingRef.current].filter(id => id !== topic.id));
      setLoadingTakes(new Set(loadingRef.current));
    }
  }, []);

  // ── Fetch topic shells (fast — just clustering) ──────────────────────────────
  const fetchTopicShells = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setLoadingStage(0);
    setError(null);

    // Animate stages — clustering takes ~5-8s
    const timer1 = setTimeout(() => setLoadingStage(1), 2500);

    try {
      const url = forceRefresh ? '/api/clustered-news?refresh=1' : '/api/clustered-news';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.topics?.length) throw new Error('No topics returned');

      clearTimeout(timer1);

      // Reset takes state
      takesMapRef.current = {};
      loadingRef.current  = new Set();
      setTakesMap({});
      setLoadingTakes(new Set());

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

  // Reset take to neutral when topic changes
  useEffect(() => {
    setCurrentTakeIndex(3);
  }, [currentTopicIndex]);

  // Prefetch takes for current topic + adjacent topics
  useEffect(() => {
    if (!topicShells.length) return;
    const total = topicShells.length;
    prefetchTakes(currentTopicIndex);
    prefetchTakes((currentTopicIndex + 1) % total);
    if (currentTopicIndex > 0) prefetchTakes(currentTopicIndex - 1);
  }, [currentTopicIndex, topicShells.length, prefetchTakes]);

  // ── Navigate takes (left = more liberal, right = more conservative) ──────────
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
            takesLoading={takesAreLoading}
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
