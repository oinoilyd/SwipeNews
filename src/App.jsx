import { useState, useEffect, useCallback } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import './App.css';

export default function App() {
  const [topics, setTopics] = useState([]);
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(3); // 3 = Neutral (center)
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState(null);
  const [showTopicDrawer, setShowTopicDrawer] = useState(false);

  const currentTopic = topics[currentTopicIndex];
  const currentTake = currentTopic?.takes[currentTakeIndex];

  useEffect(() => { fetchTopics(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset take to neutral whenever topic changes
  useEffect(() => {
    setCurrentTakeIndex(3);
  }, [currentTopicIndex]);

  // ── Fetch topics (all 7 takes pre-generated server-side) ─────────────────────
  async function fetchTopics(forceRefresh = false) {
    setIsLoading(true);
    setLoadingStage(0);
    setError(null);

    // Animate loading stages — the server takes ~40-60s so we pace messages
    const timer1 = setTimeout(() => setLoadingStage(1), 3000);
    const timer2 = setTimeout(() => setLoadingStage(2), 8000);
    const timer3 = setTimeout(() => setLoadingStage(3), 20000);

    try {
      const url = forceRefresh ? '/api/clustered-news?refresh=1' : '/api/clustered-news';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.topics?.length) throw new Error('No topics returned');

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setTopics(data.topics);
      setCurrentTopicIndex(0);
      setCurrentTakeIndex(3);
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setError(err.message || 'Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }

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
    setCurrentTopicIndex(i => (i + 1) % topics.length);
  }, [topics.length]);

  const handlePrevTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i - 1 + topics.length) % topics.length);
  }, [topics.length]);

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
          <button className="btn-primary" onClick={() => fetchTopics(true)}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!topics.length) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">📭</div>
          <h2>No topics found</h2>
          <p className="error-msg">Couldn't identify major stories right now.</p>
          <button className="btn-primary" onClick={() => fetchTopics(true)}>Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onRefresh={() => fetchTopics(true)}
        topicNumber={currentTopicIndex + 1}
        totalTopics={topics.length}
        onShowTopics={() => setShowTopicDrawer(true)}
      />
      <main className="main">
        {currentTopic && (
          <CardStack
            topic={currentTopic}
            currentTake={currentTake}
            currentTakeIndex={currentTakeIndex}
            onTakeLeft={handleTakeLeft}
            onTakeRight={handleTakeRight}
            onTakeJump={handleTakeJump}
            onNextTopic={handleNextTopic}
            onPrevTopic={handlePrevTopic}
            currentTopicIndex={currentTopicIndex}
            totalTopics={topics.length}
          />
        )}
      </main>

      {showTopicDrawer && (
        <TopicDrawer
          topics={topics}
          currentIndex={currentTopicIndex}
          onSelect={handleJumpToTopic}
          onClose={() => setShowTopicDrawer(false)}
        />
      )}
    </div>
  );
}
