import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CardStack from './components/CardStack';
import Header from './components/Header';
import LoadingScreen from './components/LoadingScreen';
import TopicDrawer from './components/TopicDrawer';
import TrendingDrawer from './components/TrendingDrawer';
import CategoryFilter, { POLITICAL_CATS, HOT_CATS } from './components/CategoryFilter';
import TimeFilter from './components/TimeFilter';
import ListView from './components/ListView';
import FollowingDrawer from './components/FollowingDrawer';
import AskTab from './components/AskTab';
import HistoryTab from './components/HistoryTab';
import { getLanguage, applyDirection, LANGUAGES, t } from './lib/i18n.js';
import './App.css';

// Category → perspectiveMode mapping
// 'full' = 7 political positions, 'entertainment' = Progressive/Neutral/Traditional,
// 'sports' = Fan/Neutral/Business, 'tech' = Optimist/Skeptic/Neutral/Industry
function getPerspectiveMode(category) {
  if (category === 'Sports & Culture') return 'sports';
  if (category === 'Technology')       return 'tech';
  if (category === 'Entertainment')    return 'entertainment';
  return 'full';
}
// All non-full modes use limited indices for navigation
const IS_LIMITED = (pm) => pm !== 'full';

// Map take index (0-6) → position (-3 to 3)
const indexToPosition = (i) => i - 3;

// ── Limited-mode indices ───────────────────────────────────────────────────────
const LIMITED_INDICES = [1, 3, 5];         // Left, Neutral, Right (sports / limited)
const TECH_INDICES    = [1, 3, 5];         // Optimist(-2), Neutral(0), Industry(2)

function getActiveIndices(pm) {
  return pm === 'tech' ? TECH_INDICES : LIMITED_INDICES;
}

// ── localStorage take cache helpers ──────────────────────────────────────────
const CACHE_PREFIX    = 'sw_take';
const CACHE_MAX_AGE   = 6 * 60 * 60 * 1000; // 6 hours

function buildCacheKey(topicId, publishedAt, position) {
  return `${CACHE_PREFIX}:${topicId}:${publishedAt ?? 'x'}:${position}`;
}

const WEAK_TAKE_PHRASES = ['cannot verify', 'appears to be false'];
function isWeakTake(take) {
  const t = (take?.text || '').toLowerCase();
  return WEAK_TAKE_PHRASES.some(p => t.includes(p));
}

function loadCachedTake(topicId, publishedAt, position) {
  try {
    const key = buildCacheKey(topicId, publishedAt, position);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { take, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_MAX_AGE || isWeakTake(take)) {
      localStorage.removeItem(key);
      return null;
    }
    return take;
  } catch { return null; }
}

function saveCachedTake(topicId, publishedAt, position, take) {
  if (isWeakTake(take)) return; // never cache bad takes
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

// ── Topics localStorage cache (2h TTL — topics only change at 6am cron) ─────
const TOPICS_CACHE_KEY = 'sw_topics_v1';
const TOPICS_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function saveTopicsCache(topics, following = []) {
  try {
    localStorage.setItem(TOPICS_CACHE_KEY, JSON.stringify({ topics, following, ts: Date.now() }));
  } catch { /* ignore quota errors */ }
}

function loadTopicsCache() {
  try {
    const raw = localStorage.getItem(TOPICS_CACHE_KEY);
    if (!raw) return null;
    const { topics, following, ts } = JSON.parse(raw);
    if (!topics?.length) return null;
    // Keep stale data — return it with a flag so caller can background-refresh
    // instead of showing the loading screen.
    const stale = Date.now() - ts > TOPICS_CACHE_TTL;
    return { topics, following: following || [], stale };
  } catch { return null; }
}

export default function App() {
  // Language — read once at mount, static for the session (reloads on change)
  const lang    = getLanguage();
  const apiLang = LANGUAGES[lang]?.apiName ?? 'English';
  // Apply RTL direction for Arabic
  applyDirection(lang);

  const [topicShells, setTopicShells]           = useState([]);
  // { [topicId]: { [position]: take } }  — lazy per-position
  const [takesMap, setTakesMap]                 = useState({});
  // Set<"topicId:position"> — in-flight requests
  const [loadingSet, setLoadingSet]             = useState(new Set());
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [currentTakeIndex, setCurrentTakeIndex]   = useState(3); // 3 = Neutral
  const [activeCategories, setActiveCategories] = useState(['Hot']); // default to Hot feed
  const [timeFilter, setTimeFilter]             = useState('48h');
  const [isLoading, setIsLoading]               = useState(true);
  const [loadingStage, setLoadingStage]         = useState(0);
  const [error, setError]                       = useState(null);
  const [showTopicDrawer,    setShowTopicDrawer]    = useState(false);
  const [showTrendingDrawer, setShowTrendingDrawer] = useState(false);
  const [headerCollapsed,    setHeaderCollapsed]    = useState(false);
  const [trendingTitles,     setTrendingTitles]     = useState(new Set());
  const [listView,           setListView]           = useState(false);
  const [followingThreads,      setFollowingThreads]      = useState([]);
  const [activeFollowingThread, setActiveFollowingThread] = useState(null);
  const [showFollowingDrawer,   setShowFollowingDrawer]   = useState(false);
  const [activeMode,            setActiveMode]            = useState('feed'); // 'feed' | 'ask'

  // Refs for stale-closure-safe async callbacks
  const takesMapRef        = useRef({});
  const loadingSetRef      = useRef(new Set());
  const topBarRef          = useRef(null);
  const topBarHeightRef    = useRef(null);

  // ── Filtered topic list (by category) ────────────────────────────────────
  // "Politics" is a meta-category — it expands to all political sub-categories.
  // "Hot" shows all popular news, world & politics stories (HOT_CATS), boosting
  //   trending titles to the top so the most-relevant stories appear first.
  // activeFollowingThread overrides category filter — shows only that story's topics.
  const filteredTopics = useMemo(() => {
    if (activeFollowingThread) {
      const ids = new Set(activeFollowingThread.topicIds || []);
      return topicShells.filter(t => ids.has(t.id));
    }
    if (activeCategories.length === 0) return topicShells;
    const hasPoliticsMeta = activeCategories.includes('Politics');
    const hasHot          = activeCategories.includes('Hot');
    if (hasHot) {
      // Include every topic that belongs to a "news" category
      const hotTopics = topicShells.filter(t => HOT_CATS.includes(t.category || 'US Politics'));
      // Sort: trending titles first, then by article count descending
      return [...hotTopics].sort((a, b) => {
        const aTrending = trendingTitles.has(a.title) ? 1 : 0;
        const bTrending = trendingTitles.has(b.title) ? 1 : 0;
        if (bTrending !== aTrending) return bTrending - aTrending;
        return (b.articles?.length ?? 0) - (a.articles?.length ?? 0);
      });
    }
    return topicShells.filter(t => {
      const cat = t.category || 'US Politics';
      if (activeCategories.includes(cat)) return true;
      if (hasPoliticsMeta && POLITICAL_CATS.includes(cat)) return true;
      return false;
    });
  }, [topicShells, activeCategories, trendingTitles, activeFollowingThread]); // eslint-disable-line

  // ── Time-filtered topic list (by recency window) ──────────────────────────
  const timeFilteredTopics = useMemo(() => {
    const HOT_MIN = 11; // Hot feed always shows at least this many stories
    const isHot   = activeCategories.includes('Hot');
    const hours   = { '24h': 24, '48h': 48, '72h': 72 }[timeFilter] ?? 48;
    const cutoff  = Date.now() - hours * 60 * 60 * 1000;
    const result  = filteredTopics.filter(t => {
      if (!t.latestPublishedAt) return true;
      const ms = new Date(t.latestPublishedAt).getTime();
      if (isNaN(ms)) return true;
      return ms >= cutoff;
    });
    // For Hot: if the time window is too aggressive, pad with the next-oldest
    // stories from the full sorted list until we reach the minimum count.
    if (isHot && result.length < HOT_MIN) {
      const seen    = new Set(result.map(t => t.id));
      const extras  = filteredTopics.filter(t => !seen.has(t.id));
      const needed  = HOT_MIN - result.length;
      return [...result, ...extras.slice(0, needed)];
    }
    return result;
  }, [filteredTopics, timeFilter, activeCategories]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentTopic       = timeFilteredTopics[currentTopicIndex] ?? null;
  const prevTopic          = timeFilteredTopics[currentTopicIndex - 1] ?? null;
  const nextTopic          = timeFilteredTopics[currentTopicIndex + 1] ?? null;
  const currentPosition    = indexToPosition(currentTakeIndex);
  const currentTake        = currentTopic
    ? (takesMap[currentTopic.id]?.[currentPosition] ?? null)
    : null;
  const currentTakeLoading = currentTopic
    ? loadingSet.has(`${currentTopic.id}:${currentPosition}`)
    : false;
  const perspectiveMode    = currentTopic?.perspectiveMode ?? 'full';

  // ── Toggle a category on/off ─────────────────────────────────────────────
  // Hot is solo-mode: clicking it clears everything else and selects only Hot.
  // Clicking Hot when already solo does nothing.
  // Clicking any other category while Hot is active exits Hot and adds that category.
  // In multi-select mode, categories toggle on/off normally.
  const handleCategoryToggle = useCallback((cat) => {
    setActiveMode('feed');          // any category tap exits special modes
    setActiveFollowingThread(null); // clear story filter when switching categories
    if (cat === 'Hot') {
      setActiveCategories(prev => {
        const isHotSolo = prev.length === 1 && prev[0] === 'Hot';
        return isHotSolo ? prev : ['Hot'];
      });
    } else {
      setActiveCategories(prev => {
        const withoutHot = prev.filter(c => c !== 'Hot');
        return withoutHot.includes(cat)
          ? withoutHot.filter(c => c !== cat)
          : [...withoutHot, cat];
      });
    }
  }, []);

  // ── Reset topic & take index when category or time filter changes ────────
  useEffect(() => {
    setCurrentTopicIndex(0);
    setCurrentTakeIndex(3);
  }, [activeCategories, timeFilter]);

  // ── Reset take to neutral when topic changes ────────────────────────────
  useEffect(() => {
    setCurrentTakeIndex(3);
    // Header stays collapsed — user restores it deliberately
  }, [currentTopicIndex]);

  // ── Animate top bar height when collapsing/expanding ─────────────────────
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    if (headerCollapsed) {
      topBarHeightRef.current = el.scrollHeight;
      el.style.height = `${el.scrollHeight}px`;
      el.getBoundingClientRect(); // force reflow
      el.style.height = '0px';
    } else if (topBarHeightRef.current !== null) {
      // Only animate expand if we previously collapsed (avoid running on initial mount)
      el.style.height = `${topBarHeightRef.current}px`;
      const onEnd = () => { el.style.height = ''; el.removeEventListener('transitionend', onEnd); };
      el.addEventListener('transitionend', onEnd);
    }
  }, [headerCollapsed]);

  // Only collapse — expand happens exclusively via deliberate top-tap
  const handleScrollChange = useCallback((collapsed) => {
    if (collapsed) setHeaderCollapsed(true);
  }, []);

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
      body:    JSON.stringify({ topic, position, language: apiLang }),
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
    if (loadingSetRef.current.size >= 4) return;

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
          body:    JSON.stringify({ topic, position, language: apiLang }),
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

  // ── Fetch trending titles whenever topicShells refreshes ─────────────────
  useEffect(() => {
    if (!topicShells.length) return;
    const payload = topicShells
      .filter(t => t.category !== 'Sports & Culture')
      .map(t => ({ title: t.title, articleCount: t.articles?.length ?? 0 }));
    fetch('/api/trending', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topics: payload }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.trending?.length) {
          setTrendingTitles(new Set(data.trending.map(r => r.title)));
        }
      })
      .catch(() => {
        // Fallback: article-count ranking
        const top10 = [...topicShells]
          .filter(t => t.category !== 'Sports & Culture')
          .sort((a, b) => (b.articles?.length ?? 0) - (a.articles?.length ?? 0))
          .slice(0, 10)
          .map(t => t.title);
        setTrendingTitles(new Set(top10));
      });
  }, [topicShells]);

  // ── On topic change: prefetch neutral for current topic only ─────────────
  useEffect(() => {
    if (!timeFilteredTopics.length) return;
    const cur = timeFilteredTopics[currentTopicIndex];
    if (cur) prefetchTake(cur, 0);
  }, [currentTopicIndex, timeFilteredTopics, prefetchTake]);

  // ── On take index change: fetch that position + prefetch neighbors ─────────
  useEffect(() => {
    if (!currentTopic) return;
    const pos = indexToPosition(currentTakeIndex);
    prefetchTake(currentTopic, pos);

    if (IS_LIMITED(currentTopic.perspectiveMode)) {
      const indices = getActiveIndices(currentTopic.perspectiveMode);
      const idx = indices.indexOf(currentTakeIndex);
      if (idx > 0)                  prefetchTake(currentTopic, indexToPosition(indices[idx - 1]));
      if (idx < indices.length - 1) prefetchTake(currentTopic, indexToPosition(indices[idx + 1]));
    } else {
      if (pos > -3) prefetchTake(currentTopic, pos - 1);
      if (pos <  3) prefetchTake(currentTopic, pos + 1);
    }
  }, [currentTakeIndex, currentTopic, prefetchTake]);

  // ── Fetch topic shells ────────────────────────────────────────────────────
  // ── Shared: process raw topic array → shuffle + set state ───────────────
  const applyTopics = useCallback((rawTopics, bundledTakes = {}) => {
    takesMapRef.current   = {};
    loadingSetRef.current = new Set();
    setTakesMap({});
    setLoadingSet(new Set());

    const processedTopics = rawTopics.map(t => ({
      ...t,
      perspectiveMode: getPerspectiveMode(t.category),
    }));
    // Shuffle order on every load so the feed feels fresh
    for (let i = processedTopics.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [processedTopics[i], processedTopics[j]] = [processedTopics[j], processedTopics[i]];
    }

    // Seed any pre-bundled takes (Fix 2: from clustered-news response)
    if (Object.keys(bundledTakes).length > 0) {
      const seedMap = {};
      for (const [topicId, posMap] of Object.entries(bundledTakes)) {
        seedMap[topicId] = posMap;
        const topic = processedTopics.find(t => t.id === topicId);
        if (topic) {
          for (const [pos, take] of Object.entries(posMap)) {
            saveCachedTake(topic.id, topic.latestPublishedAt, parseInt(pos), take);
          }
        }
      }
      takesMapRef.current = seedMap;
      setTakesMap({ ...seedMap });
    }

    setTopicShells(processedTopics);
    setCurrentTopicIndex(0);
    setCurrentTakeIndex(3);
    setLoadingStage(2);
    pruneOldCache(rawTopics);
  }, []);

  // ── Silent background refresh — no loading screen, just updates the cache ──
  // Called when stale localStorage data is served. Fetches fresh topics from
  // the API and saves them to localStorage so the NEXT visit loads fresh.
  // Does not disrupt the current session (no applyTopics call).
  const silentRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/clustered-news');
      if (!res.ok) return;
      const data = await res.json();
      if (data.loading || !data.topics?.length) return;
      saveTopicsCache(data.topics, data.following || []);
      // Update following threads in the background (low-disruption)
      if (data.following?.length) setFollowingThreads(data.following);
    } catch { /* silent — stale data remains visible, no error shown */ }
  }, []);

  const fetchTopicShells = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setLoadingStage(0);
    setError(null);

    const timer1 = setTimeout(() => setLoadingStage(1), 2500);
    let keepLoading = false;

    try {
      // ── Fast path: serve from localStorage immediately (even if stale) ──────
      // Stale data is shown instantly; a silent background fetch updates the
      // cache for the next visit without any loading screen.
      if (!forceRefresh) {
        const cache = loadTopicsCache();
        if (cache?.topics?.length) {
          clearTimeout(timer1);
          if (cache.following?.length) setFollowingThreads(cache.following);
          applyTopics(cache.topics);
          if (cache.stale) silentRefresh(); // fire-and-forget, no await
          return; // finally clears isLoading
        }
      }

      // ── Network path (first-ever visit or manual refresh) ─────────────────
      const url = forceRefresh ? '/api/clustered-news?refresh=1' : '/api/clustered-news';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.loading) {
        // Redis cold — pregenerate is running. Poll every 12s (was 30s).
        keepLoading = true;
        setLoadingStage(1);
        setTimeout(() => fetchTopicShells(false), 12000);
        return;
      }

      if (!data.topics?.length) throw new Error('No topics returned');

      clearTimeout(timer1);

      // Save to localStorage so next load is instant
      saveTopicsCache(data.topics, data.following || []);

      // Capture Following threads if present
      if (data.following?.length) setFollowingThreads(data.following);

      // Apply topics + any pre-bundled takes from the API
      applyTopics(data.topics, data.takes ?? {});

    } catch (err) {
      clearTimeout(timer1);
      setError(err.message || 'Failed to load news');
    } finally {
      if (!keepLoading) setIsLoading(false);
    }
  }, [applyTopics, silentRefresh]);

  // ── Pull-to-refresh: shuffle topic order in-place, no network call ──────────
  const handleRefreshOrder = useCallback(() => {
    setTopicShells(prev => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
    setCurrentTopicIndex(0);
    setCurrentTakeIndex(3);
  }, []);

  // ── Manual refresh: reload topics from Redis cache (pregenerate runs on cron) ─
  // NOTE: do NOT fire /api/pregenerate here — it can timeout/500 and the cron
  // handles daily regeneration. This just reloads whatever is already cached.
  const handleManualRefresh = useCallback(() => {
    fetchTopicShells(true);
  }, [fetchTopicShells]);

  // Initial load
  useEffect(() => { fetchTopicShells(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigate takes — respect limited mode ─────────────────────────────────
  const handleTakeLeft = useCallback(() => {
    if (IS_LIMITED(perspectiveMode)) {
      const indices = getActiveIndices(perspectiveMode);
      const prev = indices.filter(i => i < currentTakeIndex);
      if (prev.length) setCurrentTakeIndex(prev[prev.length - 1]);
    } else {
      setCurrentTakeIndex(i => Math.max(0, i - 1));
    }
  }, [perspectiveMode, currentTakeIndex]);

  const handleTakeRight = useCallback(() => {
    if (IS_LIMITED(perspectiveMode)) {
      const indices = getActiveIndices(perspectiveMode);
      const next = indices.filter(i => i > currentTakeIndex);
      if (next.length) setCurrentTakeIndex(next[0]);
    } else {
      setCurrentTakeIndex(i => Math.min(6, i + 1));
    }
  }, [perspectiveMode, currentTakeIndex]);

  const handleTakeJump = useCallback((index) => {
    if (IS_LIMITED(perspectiveMode) && !getActiveIndices(perspectiveMode).includes(index)) return;
    setCurrentTakeIndex(index);
  }, [perspectiveMode]);

  // ── Navigate topics ───────────────────────────────────────────────────────
  const handleNextTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i + 1) % timeFilteredTopics.length);
  }, [timeFilteredTopics.length]);

  const handlePrevTopic = useCallback(() => {
    setCurrentTopicIndex(i => (i - 1 + timeFilteredTopics.length) % timeFilteredTopics.length);
  }, [timeFilteredTopics.length]);

  const handleJumpToTopic = useCallback((index) => {
    setShowTopicDrawer(false);
    setCurrentTopicIndex(index);
  }, []);

  const handleTrendingSelect = useCallback((topic) => {
    setShowTrendingDrawer(false);
    const index = topicShells.findIndex(t => t.title === topic.title || t.id === topic.id);
    if (index !== -1) {
      setActiveCategories([]);
      setCurrentTopicIndex(index);
    }
  }, [topicShells]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Never intercept keys while the user is typing in an input or textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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
  if (isLoading) return <LoadingScreen stage={loadingStage} lang={lang} />;

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">⚠️</div>
          <h2>{t('somethingWrong', lang)}</h2>
          <p className="error-msg">{error}</p>
          <button className="btn-primary" onClick={() => fetchTopicShells(true)}>{t('tryAgain', lang)}</button>
        </div>
      </div>
    );
  }

  if (!topicShells.length) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">📭</div>
          <h2>{t('noTopicsFound', lang)}</h2>
          <p className="error-msg">{t('noTopicsMsg', lang)}</p>
          <button className="btn-primary" onClick={() => fetchTopicShells(true)}>{t('refresh', lang)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="top-bar">
        {/* Only the header row collapses — category filter stays visible */}
        <div ref={topBarRef} className="header-row-collapsible">
          <Header
            onRefresh={handleManualRefresh}
            onShowTopics={() => setShowTopicDrawer(true)}
            onShowTrending={() => setShowTrendingDrawer(true)}
            listView={listView}
            onToggleListView={() => setListView(v => !v)}
          />
        </div>

        <CategoryFilter
          activeCategories={activeCategories}
          onToggle={handleCategoryToggle}
          topicShells={topicShells}
          trendingCount={trendingTitles.size}
          followingThreads={followingThreads}
          activeFollowingThread={activeFollowingThread}
          onFollowingOpen={() => setShowFollowingDrawer(true)}
          lang={lang}
          activeMode={activeMode}
          onAskMode={() => setActiveMode('ask')}
          onHistoryMode={() => setActiveMode('history')}
        />

        {activeMode === 'feed' && (
          <TimeFilter activeFilter={timeFilter} onSelect={setTimeFilter} />
        )}
      </div>

      <main className="main">
        {activeMode === 'ask' ? (
          <AskTab lang={lang} apiLang={apiLang} />
        ) : activeMode === 'history' ? (
          <HistoryTab />
        ) : timeFilteredTopics.length === 0 ? (
          <div className="empty-category">
            <p className="empty-category-msg">{t('noTopicsWindow', lang)}</p>
            <button className="btn-secondary" onClick={() => setTimeFilter('72h')}>
              {t('expandWindow', lang)}
            </button>
          </div>
        ) : listView ? (
          <ListView
            topics={timeFilteredTopics}
            onSelectTopic={(i) => {
              setCurrentTopicIndex(i);
              setCurrentTakeIndex(3);
              setListView(false);
            }}
          />
        ) : currentTopic && (
          <CardStack
            prevTopic={prevTopic}
            topic={currentTopic}
            nextTopic={nextTopic}
            currentTake={currentTake}
            currentTakeIndex={currentTakeIndex}
            topicTakesMap={takesMap[currentTopic.id] || {}}
            takesLoading={currentTakeLoading}
            onTakeLeft={handleTakeLeft}
            onTakeRight={handleTakeRight}
            onTakeJump={handleTakeJump}
            onNextTopic={handleNextTopic}
            onPrevTopic={handlePrevTopic}
            perspectiveMode={perspectiveMode}
            onRefreshOrder={handleRefreshOrder}
            onScrollChange={handleScrollChange}
            onExpandHeader={() => setHeaderCollapsed(false)}
            headerCollapsed={headerCollapsed}
            lang={lang}
          />
        )}
      </main>

      <footer className="app-footer collapsed">
        <a href="mailto:perspectivesnews@test.com" className="footer-link">perspectivesnews@test.com</a>
        <span>© {new Date().getFullYear()} Perspectiv</span>
      </footer>


      {showTopicDrawer && (
        <TopicDrawer
          topics={timeFilteredTopics}
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

      {showFollowingDrawer && (
        <FollowingDrawer
          threads={followingThreads}
          activeThread={activeFollowingThread}
          onSelect={(thread) => {
            setActiveFollowingThread(thread);
            setCurrentTopicIndex(0);
            setCurrentTakeIndex(3);
          }}
          onClose={() => setShowFollowingDrawer(false)}
          lang={lang}
        />
      )}
    </div>
  );
}
