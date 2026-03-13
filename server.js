import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Media Bias Database — keyed by newsdata.io source_id or normalized name ───
const MEDIA_BIAS = {
  'msnbc':           { score: -3, label: 'Far Left',    color: '#2563eb', name: 'MSNBC' },
  'cnn':             { score: -2, label: 'Left',        color: '#3b82f6', name: 'CNN' },
  'theguardian':     { score: -2, label: 'Left',        color: '#3b82f6', name: 'The Guardian' },
  'nytimes':         { score: -2, label: 'Left',        color: '#3b82f6', name: 'The New York Times' },
  'washingtonpost':  { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'The Washington Post' },
  'npr':             { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'NPR' },
  'nbcnews':         { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'NBC News' },
  'cbsnews':         { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'CBS News' },
  'reuters':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Reuters' },
  'apnews':          { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Associated Press' },
  'bbc':             { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'BBC News' },
  'bbcnews':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'BBC News' },
  'thehill':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'The Hill' },
  'axios':           { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Axios' },
  'foxnews':         { score:  3, label: 'Right',       color: '#ef4444', name: 'Fox News' },
  'nypost':          { score:  2, label: 'Right',       color: '#f87171', name: 'New York Post' },
  'breitbart':       { score:  4, label: 'Far Right',   color: '#dc2626', name: 'Breitbart News' },
  'washingtontimes': { score:  2, label: 'Right',       color: '#f87171', name: 'Washington Times' },
  'dailycaller':     { score:  3, label: 'Right',       color: '#ef4444', name: 'The Daily Caller' },
};

function getBias(sourceId) {
  if (!sourceId) return { score: 0, label: 'Unknown', color: '#6b7280', name: 'Unknown' };
  const id = sourceId.toLowerCase().replace(/[^a-z0-9]/g, '');
  // 1. Exact key match
  if (MEDIA_BIAS[id]) return MEDIA_BIAS[id];
  // 2. Substring match on keys
  for (const [k, v] of Object.entries(MEDIA_BIAS)) {
    if (id.includes(k) || k.includes(id)) return v;
  }
  // 3. Substring match on display names (catches GNews source names like "The New York Times")
  for (const v of Object.values(MEDIA_BIAS)) {
    const normalizedName = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedName.includes(id) || id.includes(normalizedName)) return v;
  }
  return { score: 0, label: 'Unknown', color: '#6b7280', name: sourceId };
}

// ── NewsData.io domain groups (max 5 per request on free/basic plans) ─────────
const DOMAIN_GROUPS = {
  left_a:  'edition.cnn.com,msnbc.com,theguardian.com,nbcnews.com,cbsnews.com',
  left_b:  'nytimes.com,washingtonpost.com,npr.org',
  center:  'reuters.com,apnews.com,bbc.com,thehill.com,axios.com',
  right:   'foxnews.com,nypost.com,breitbart.com,washingtontimes.com',
};

// ── The 7 take positions ───────────────────────────────────────────────────────
const TAKE_POSITIONS = [
  { position: -3, label: 'Far Left',     color: '#1d4ed8', tier: 'left'   },
  { position: -2, label: 'Left',         color: '#3b82f6', tier: 'left'   },
  { position: -1, label: 'Center-Left',  color: '#818cf8', tier: 'left'   },
  { position:  0, label: 'Neutral',      color: '#a78bfa', tier: 'center' },
  { position:  1, label: 'Center-Right', color: '#f97316', tier: 'right'  },
  { position:  2, label: 'Right',        color: '#ef4444', tier: 'right'  },
  { position:  3, label: 'Far Right',    color: '#dc2626', tier: 'right'  },
];

const TIER_OUTLETS = {
  left:   'NYT, CNN, MSNBC, NPR, Washington Post, Guardian, CBS News, NBC News',
  center: 'Reuters, AP, BBC, Axios, The Hill',
  right:  'Fox News, NY Post, Washington Times, Breitbart, Daily Caller',
};

// ── Server-side takes cache (6-hour TTL) ─────────────────────────────────────
const takesCache = new Map();
const TAKES_CACHE_TTL = 6 * 60 * 60 * 1000;

function takesCacheKey(topic, position) {
  const title = (topic.title || '').toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `${title}:${topic.latestPublishedAt || 'x'}:${position}`;
}
function getsCached(key) {
  const entry = takesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TAKES_CACHE_TTL) { takesCache.delete(key); return null; }
  return entry.take;
}
function setsCached(key, take) { takesCache.set(key, { take, ts: Date.now() }); }

// ── Server-side news cache (15-min TTL) ──────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;
let generationInFlight = null;

// ── Title-similarity deduplication helpers ────────────────────────────────────
const STOP_WORDS = new Set(['the','a','an','in','on','at','to','for','of','and','or','is','are','was','as','by','with','that','this','its','it','be','has','had','have','will','from','but','not','are','were']);

function titleWords(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function titleSimilarity(a, b) {
  const sa = titleWords(a), sb = titleWords(b);
  const intersection = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Fetch articles from NewsData.io ───────────────────────────────────────────
async function fetchArticles(url, tagCategory = null) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'success') {
      console.warn('NewsData.io warning:', data.results?.message || JSON.stringify(data).slice(0, 120), url.split('?')[0]);
      return [];
    }
    return (data.results || [])
      .filter(a => a.title && a.description)
      .map(a => {
        const bias = getBias(a.source_id);
        const publishedAt = a.pubDate
          ? a.pubDate.replace(' ', 'T') + 'Z'
          : null;
        return {
          title:         a.title,
          description:   a.description || '',
          source:        bias.name || a.source_id || 'Unknown',
          url:           a.link,
          urlToImage:    a.image_url || null,
          publishedAt,
          bias:          { score: bias.score, label: bias.label, color: bias.color },
          fetchCategory: tagCategory,
        };
      });
  } catch (err) {
    console.warn(`fetchArticles failed:`, err.message);
    return [];
  }
}

// ── Fetch articles from GNews ─────────────────────────────────────────────────
async function fetchGNews(topic, apiKey, tagCategory = null) {
  try {
    const url = `https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=us&max=10&topic=${topic}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.articles) {
      console.warn('GNews warning:', JSON.stringify(data).slice(0, 120));
      return [];
    }
    return data.articles
      .filter(a => a.title && a.description)
      .map(a => {
        const bias = getBias(a.source?.name || '');
        return {
          title:         a.title,
          description:   a.description || '',
          source:        bias.name !== 'Unknown' ? bias.name : (a.source?.name || 'Unknown'),
          url:           a.url,
          urlToImage:    a.image || null,
          publishedAt:   a.publishedAt || null,
          bias:          { score: bias.score, label: bias.label, color: bias.color },
          fetchCategory: tagCategory,
        };
      });
  } catch (err) {
    console.warn('fetchGNews failed:', err.message);
    return [];
  }
}

// ── Fetch sports articles from ESPN (no API key required) ─────────────────────
async function fetchESPN(url) {
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return (data.articles || [])
      .filter(a => a.headline)
      .map(a => ({
        title:         a.headline,
        description:   a.description || a.headline,
        source:        'ESPN',
        url:           a.links?.web?.href || '',
        urlToImage:    a.images?.[0]?.url || null,
        publishedAt:   a.published || null,
        bias:          { score: 0, label: 'Neutral', color: '#a78bfa' },
        fetchCategory: 'Sports & Culture',
      }));
  } catch (err) {
    console.warn('fetchESPN failed:', err.message);
    return [];
  }
}

// ── Cluster articles into topics using Claude ─────────────────────────────────
async function clusterArticles(articles) {
  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      const hint = a.fetchCategory ? ` [${a.fetchCategory}]` : '';
      return `[${i}] ${tier}:${a.source}${hint} | ${a.title}`;
    })
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Cluster these ${articles.length} news articles into 20-35 major ongoing topics.

Return ONLY valid JSON, no markdown:
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"US Politics|World|Policy|Economy|National Security|Elections|Technology|Health|Sports & Culture","articleIndices":[0,1,2,3]}]}

Rules:
- 20-35 topics total
- Each topic needs at least 1 article
- Prefer topics with 3+ articles from multiple bias tiers — these get the full 7-perspective treatment
- Topics with only 1-2 articles are still valuable — include them
- Merge near-duplicate topics into one
- "category" must be exactly one of: US Politics, World, Policy, Economy, National Security, Elections, Technology, Health, Sports & Culture
  - US Politics: domestic government, Congress, White House, political conflicts
  - World: international news, foreign affairs
  - Policy: legislation, regulations, climate/environment law, domestic policy debates
  - Economy: markets, jobs, trade, inflation, corporate news
  - National Security: military, intelligence, terrorism, border, defense
  - Elections: campaigns, voting, candidates, electoral politics
  - Technology: tech companies, AI, science, space, cyber
  - Health: public health, medicine, FDA, healthcare
  - Sports & Culture: sports, entertainment — only assign if article is tagged [Sports & Culture]
- Use [fetchCategory hints] shown in brackets when available to guide category assignment
- Neutral factual titles only — no editorial spin
- Order topics by descending newsworthiness (highest-priority first):
  1. National Security  2. Policy & Legislation  3. World  4. Economy
  5. Elections & Politics  6. US Politics  7. Technology  8. Health  9. Sports & Culture
- Minimum newsworthiness bar: only include topics that would plausibly appear on the front page of NYT, WSJ, or BBC. Skip celebrity gossip, lifestyle trends, parenting advice, entertainment opinions, product reviews, and human interest fluff. Merge trivial topics into broader ones or discard them. EXCEPTION: articles tagged [Sports & Culture] must always produce at least 3-5 Sports & Culture topics regardless of this filter — sports news belongs in the app even if it wouldn't make the front page.`,
    }],
  });

  const text = msg.content[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Clustering returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

// ── Build topic shells (takes generated on-demand) ────────────────────────────
async function buildTopicShells(clusters, allArticles) {
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return clusters
    .map((cluster, i) => {
      const clusterArticles = (cluster.articleIndices || [])
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < allArticles.length)
        .map(idx => allArticles[idx]);

      if (clusterArticles.length < 1) return null;

      const latestPublishedAt = clusterArticles.reduce((max, a) =>
        a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '');

      if (latestPublishedAt) {
        const latestMs = new Date(latestPublishedAt).getTime();
        if (!isNaN(latestMs) && latestMs < thirtyDaysAgoMs) return null;
      }

      const tiers = new Set(clusterArticles.map(a =>
        a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
      ));
      const perspectiveMode = (clusterArticles.length >= 3 && tiers.size >= 2) ? 'full' : 'limited';

      const imgArticle = clusterArticles.find(a => a.urlToImage);

      return {
        id:               `topic-${i}`,
        title:            cluster.title    || 'Untitled Story',
        summary:          cluster.summary  || '',
        category:         cluster.category || 'US Politics',
        urlToImage:       imgArticle?.urlToImage || null,
        latestPublishedAt: latestPublishedAt || null,
        perspectiveMode,
        articles: clusterArticles.map(a => ({
          title:       a.title,
          description: a.description,
          source:      a.source,
          url:         a.url,
          bias:        a.bias,
        })),
      };
    })
    .filter(Boolean);
}

// ── /api/clustered-news ────────────────────────────────────────────────────────
app.get('/api/clustered-news', async (req, res) => {
  const apiKey    = process.env.NEWSDATA_API_KEY;
  const gnewsKey  = process.env.GNEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NEWSDATA_API_KEY not set' });

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cachedTopics && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Serving from cache');
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  if (generationInFlight) {
    console.log('Generation in progress — waiting…');
    try {
      const topics = await generationInFlight;
      return res.json({ topics, fromCache: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Generation failed' });
    }
  }

  const doGenerate = async () => {
    const BASE = 'https://newsdata.io/api/1';
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    console.log('Fetching fresh articles from NewsData.io, GNews, and ESPN…');
    const results = await Promise.allSettled([
      // ── NewsData.io — bias-grouped domain fetches ──────────────────────────
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_b}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&size=10`),
      // ── NewsData.io — category-specific fetches ────────────────────────────
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=politics&language=en&size=10`,    'US Politics'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=business&language=en&size=10`,    'Economy'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=technology&language=en&size=10`,  'Technology'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=health&language=en&size=10`,      'Health'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=sports&language=en&size=10`,      'Sports & Culture'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=world&language=en&size=10`,       'World'),
      // ── NewsData.io — 30-day archive (may fail on free tier) ───────────────
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&from_date=${thirtyDaysAgo}&size=10`),
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&from_date=${thirtyDaysAgo}&size=10`),
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&from_date=${thirtyDaysAgo}&size=10`),
      // ── GNews — conditional on key presence ───────────────────────────────
      ...(gnewsKey ? [
        fetchGNews('nation',     gnewsKey, 'US Politics'),
        fetchGNews('world',      gnewsKey, 'World'),
        fetchGNews('business',   gnewsKey, 'Economy'),
        fetchGNews('technology', gnewsKey, 'Technology'),
        fetchGNews('health',     gnewsKey, 'Health'),
        fetchGNews('sports',     gnewsKey, 'Sports & Culture'),
      ] : []),
      // ── ESPN — no API key required ─────────────────────────────────────────
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/news'),
    ]);

    const batches = results.map(r => r.status === 'fulfilled' ? r.value : []);

    // Pass 1 — deduplicate by URL
    const urlSeen = new Set();
    const urlDeduped = batches.flat().filter(a => {
      if (!a.url || urlSeen.has(a.url)) return false;
      urlSeen.add(a.url);
      return true;
    });

    // Pass 2 — deduplicate by title similarity (Jaccard > 0.6)
    const titleSeenArr = [];
    const deduped = urlDeduped.filter(a => {
      if (titleSeenArr.some(t => titleSimilarity(t, a.title) > 0.6)) return false;
      titleSeenArr.push(a.title);
      return true;
    });

    console.log(`Fetched ${deduped.length} unique articles (${batches.map(b => b.length).join('+')})`);

    if (deduped.length < 5) throw new Error('Too few articles returned from news sources');

    console.log('Clustering articles with AI…');
    // Cap at 150 for clustering prompt
    const trimmed = deduped.slice(0, 150);
    const clusters = await clusterArticles(trimmed);
    console.log(`Identified ${clusters.length} clusters`);

    const topics = await buildTopicShells(clusters, trimmed);
    console.log(`Built ${topics.length} topic shells (${topics.filter(t=>t.perspectiveMode==='full').length} full, ${topics.filter(t=>t.perspectiveMode==='limited').length} limited)`);

    if (!topics.length) throw new Error('No topics could be generated');

    cachedTopics = topics;
    cacheTimestamp = Date.now();
    return topics;
  };

  generationInFlight = doGenerate();

  try {
    const topics = await generationInFlight;
    res.json({ topics, fromCache: false });
  } catch (err) {
    console.error('Error building news topics:', err);
    if (cachedTopics) {
      console.log('Returning stale cache after error');
      return res.json({ topics: cachedTopics, fromCache: true, stale: true });
    }
    res.status(500).json({ error: err.message || 'Failed to load news topics' });
  } finally {
    generationInFlight = null;
  }
});

// ── /api/generate-takes ────────────────────────────────────────────────────────
app.post('/api/generate-takes', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  const { topic, position } = req.body || {};

  if (!topic?.title || !Array.isArray(topic?.articles)) {
    return res.status(400).json({ error: 'Request body must include topic.title and topic.articles[]' });
  }
  if (!Number.isInteger(position) || position < -3 || position > 3) {
    return res.status(400).json({ error: 'position must be an integer from -3 to 3' });
  }

  const meta = TAKE_POSITIONS.find(p => p.position === position);

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const key    = takesCacheKey(topic, position);
  const cached = getsCached(key);
  if (cached) return res.json({ take: cached, fromCache: true });

  try {
    const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(none)'
      : arr.map(a => `  • ${a.source}: "${a.title}"`).join('\n');

    const primaryTier  = meta.tier;
    const tierInstruct =
      primaryTier === 'left'   ? `Emphasize systemic causes, equity, and progressive framing. Draw from ${TIER_OUTLETS.left}.`
    : primaryTier === 'right'  ? `Emphasize individual liberty, free markets, and conservative framing. Draw from ${TIER_OUTLETS.right}.`
    :                            `Present balanced, factual analysis without spin. Draw from ${TIER_OUTLETS.center}.`;

    const primaryArts = primaryTier === 'left' ? leftArts : primaryTier === 'right' ? rightArts : centerArts;
    const otherArts   = primaryTier === 'left' ? [...centerArts, ...rightArts]
                      : primaryTier === 'right' ? [...centerArts, ...leftArts]
                      : [...leftArts, ...rightArts];

    const prompt = `Write a ${meta.label} perspective on this news topic in exactly 3-4 sentences (50-80 words). Be direct and punchy. ${tierInstruct}

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY valid JSON:
{"take":{"position":${position},"label":"${meta.label}","text":"3-4 sentence take here","sources":[{"name":"Source Name","framing":"Brief framing note"}]}}`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!parsed.take) throw new Error('No take in response');

    const take = { ...parsed.take, color: meta.color };
    setsCached(key, take);
    return res.json({ take });
  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
});

// ── Votes endpoint (dev server — localStorage fallback, no Redis) ─────────────
const devVotes = new Map(); // topicTitle → { up, down }

app.get('/api/votes', (req, res) => {
  const { topicTitle } = req.query;
  if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });
  const v = devVotes.get(topicTitle) || { up: 0, down: 0 };
  res.json(v);
});

app.post('/api/votes', (req, res) => {
  const { topicTitle, direction } = req.body || {};
  if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });
  const v = devVotes.get(topicTitle) || { up: 0, down: 0 };
  if (direction === 'up')               v.up   = Math.max(0, v.up   + 1);
  else if (direction === 'down')        v.down = Math.max(0, v.down + 1);
  else if (direction === 'remove-up')   v.up   = Math.max(0, v.up   - 1);
  else if (direction === 'remove-down') v.down = Math.max(0, v.down - 1);
  else if (direction === 'switch-to-up')   { v.up = Math.max(0, v.up + 1);   v.down = Math.max(0, v.down - 1); }
  else if (direction === 'switch-to-down') { v.down = Math.max(0, v.down + 1); v.up  = Math.max(0, v.up  - 1); }
  devVotes.set(topicTitle, v);
  res.json(v);
});

// ── Pregenerate stub (dev server) ─────────────────────────────────────────────
app.post('/api/pregenerate', (req, res) => {
  res.json({ ok: true, message: 'pregenerate not available in dev mode', generated: 0, cached: 0 });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => console.log(`SwipeNews server running on :${PORT}`));
