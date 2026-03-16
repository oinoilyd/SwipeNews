import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../lib/redis.js';

// ── Media bias database — keyed by newsdata.io source_id or normalized name ──
const MEDIA_BIAS = {
  // Far Left / Left
  'msnbc':           { score: -3, label: 'Far Left',    color: '#2563eb', name: 'MSNBC' },
  'cnn':             { score: -2, label: 'Left',        color: '#3b82f6', name: 'CNN' },
  'theguardian':     { score: -2, label: 'Left',        color: '#3b82f6', name: 'The Guardian' },
  'nytimes':         { score: -2, label: 'Left',        color: '#3b82f6', name: 'The New York Times' },
  'washingtonpost':  { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'The Washington Post' },
  'npr':             { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'NPR' },
  'nbcnews':         { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'NBC News' },
  'cbsnews':         { score: -1, label: 'Left-Center', color: '#60a5fa', name: 'CBS News' },
  // Neutral
  'reuters':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Reuters' },
  'apnews':          { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Associated Press' },
  'bbc':             { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'BBC News' },
  'bbcnews':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'BBC News' },
  'thehill':         { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'The Hill' },
  'axios':           { score:  0, label: 'Neutral',     color: '#a78bfa', name: 'Axios' },
  // Right
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

// ── NewsData.io domain groups (max 5 domains per request on free/basic plans) ─
const DOMAIN_GROUPS = {
  left_a:  'edition.cnn.com,msnbc.com,theguardian.com,nbcnews.com,cbsnews.com',
  left_b:  'nytimes.com,washingtonpost.com,npr.org',
  center:  'reuters.com,apnews.com,bbc.com,thehill.com,axios.com',
  right:   'foxnews.com,nypost.com,breitbart.com,washingtontimes.com',
};

// ── Module-level cache ────────────────────────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── Cache version — bump to auto-invalidate stale Redis data ─────────────────
const CACHE_VERSION = 'v8';

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

// ── Fetch articles from a single NewsData.io URL ──────────────────────────────
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
    console.warn('fetchArticles failed:', err.message);
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
// max: cap articles per feed so ESPN doesn't flood the input and dominate clustering
async function fetchESPN(url, max = 5) {
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return (data.articles || [])
      .filter(a => a.headline)
      .slice(0, max)
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

// ── Cluster articles into ~45-50 categorized topics with Claude ───────────────
async function clusterArticles(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      const hint = a.fetchCategory ? ` [${a.fetchCategory}]` : '';
      const age  = a.publishedAt ? ` {${a.publishedAt.slice(0, 10)}}` : '';
      return `[${i}] ${tier}:${a.source}${hint}${age} | ${a.title}`;
    })
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `Cluster these ${articles.length} news articles into topics for a news app.

Return ONLY valid JSON, no markdown:
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"US Politics|World|Policy|Economy|National Security|Elections|Technology|Health|Sports & Culture","articleIndices":[0,1,2,3]}]}

TARGET TOPIC COUNTS (firm targets — hit as many as possible given available articles):
- Hard news total: 35-45 topics
  - National Security: 4-7 topics
  - World: 6-9 topics
  - US Politics: 6-9 topics
  - Economy: 5-8 topics
  - Policy: 3-5 topics
  - Elections: 2-4 topics (if relevant articles exist)
  - Health: 3-5 topics
  - Technology: 3-5 topics
- Sports & Culture: exactly 3-5 topics — no more, no fewer
- TOTAL TARGET: 40-50 topics

Rules:
- Each topic needs at least 1 article; single-article topics are fine for hard news
- Do NOT over-merge — keep related but distinct stories separate (e.g. two different bills = two topics)
- Merge only near-identical duplicate stories
- "category" must be exactly one of: US Politics, World, Policy, Economy, National Security, Elections, Technology, Health, Sports & Culture
  - US Politics: domestic government, Congress, White House, political conflicts
  - World: international news, foreign affairs
  - Policy: legislation, regulations, climate/environment law, domestic policy debates
  - Economy: markets, jobs, trade, inflation, corporate news
  - National Security: military, intelligence, terrorism, border, defense
  - Elections: campaigns, voting, candidates, electoral politics
  - Technology: tech companies, AI, science, space, cyber
  - Health: public health, medicine, FDA, healthcare
  - Sports & Culture: sports — only assign if article is tagged [Sports & Culture]
- Use [fetchCategory hints] shown in brackets when available
- Neutral factual titles only — no editorial spin
- For hard news: include any topic that plausibly belongs on the front page of NYT, WSJ, or BBC. Prefer more granular topics over merged mega-topics. Skip celebrity gossip, lifestyle fluff, product reviews.
- For sports: pick the 3-5 most significant games/events/stories from tagged articles. Do NOT list every single game.

Articles:
${list}`,
    }],
  });

  const text = msg.content[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Clustering returned no JSON');
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

// ── Serverless handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const newsdataKey = process.env.NEWSDATA_API_KEY;
  const gnewsKey    = process.env.GNEWS_API_KEY;

  if (!newsdataKey)                    return res.json({ error: 'NEWSDATA_API_KEY not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ error: 'ANTHROPIC_API_KEY not configured' });

  const forceRefresh = req.query?.refresh === '1';

  // ── Redis cache check (versioned — bump CACHE_VERSION to invalidate) ────────
  const REDIS_KEY    = `sn:topics:${CACHE_VERSION}`;
  const REDIS_TS_KEY = `sn:topics:ts:${CACHE_VERSION}`;

  if (!forceRefresh) {
    try {
      const rTopics = await redis.get(REDIS_KEY);
      const rTs     = await redis.get(REDIS_TS_KEY);
      if (rTopics) {
        const age       = rTs ? Date.now() - new Date(rTs).getTime() : Infinity;
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const catCounts = {};
        rTopics.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
        console.log(`Redis cache hit (age ${Math.round(age/60000)}min, ${rTopics.length} topics):`, catCounts);
        if (age < TWO_HOURS) {
          return res.json({ topics: rTopics, fromCache: true });
        }
        // Stale-while-revalidate: return old immediately, trigger background topic refresh
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        fetch(`${baseUrl}/api/clustered-news?refresh=1`).catch(() => {});
        return res.json({ topics: rTopics, fromCache: true, stale: true });
      }
      console.log('Redis cache miss — fetching fresh data');
    } catch (err) {
      console.warn('Redis topics read failed, falling back to generation:', err.message);
    }
  }

  // ── In-memory cache fallback ──────────────────────────────────────────────
  if (!forceRefresh && cachedTopics && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  try {
    const BASE = 'https://newsdata.io/api/1';
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const results = await Promise.allSettled([
      // ── NewsData.io — bias-grouped domain fetches ────────────────────────────
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.left_b}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&size=10`),
      // ── NewsData.io — category-specific fetches ──────────────────────────────
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=politics&language=en&size=10`,    'US Politics'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=business&language=en&size=10`,    'Economy'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=technology&language=en&size=10`,  'Technology'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=health&language=en&size=10`,      'Health'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=sports&language=en&size=10`,      'Sports & Culture'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=world&language=en&size=10`,       'World'),
      // ── NewsData.io — extra hard news fetches (replaces archive calls) ────────
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=crime&language=en&size=10`,      'National Security'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=top&language=en&size=10`,        'US Politics'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&category=politics&language=en&size=10`,              'World'),
      // ── GNews — conditional on key presence ──────────────────────────────────
      ...(gnewsKey ? [
        fetchGNews('nation',     gnewsKey, 'US Politics'),
        fetchGNews('world',      gnewsKey, 'World'),
        fetchGNews('business',   gnewsKey, 'Economy'),
        fetchGNews('technology', gnewsKey, 'Technology'),
        fetchGNews('health',     gnewsKey, 'Health'),
        fetchGNews('sports',     gnewsKey, 'Sports & Culture'),
      ] : []),
      // ── ESPN — no API key required ────────────────────────────────────────────
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/news'),
    ]);

    const BATCH_LABELS = [
      'ND:left_a','ND:left_b','ND:center','ND:right',
      'ND:politics','ND:business','ND:tech','ND:health','ND:sports','ND:world',
      'ND:crime','ND:top','ND:intl_politics',
      ...(gnewsKey ? ['GN:nation','GN:world','GN:business','GN:tech','GN:health','GN:sports'] : []),
      'ESPN:nfl','ESPN:nba','ESPN:mlb','ESPN:nhl','ESPN:soccer',
    ];

    const batches = results.map((r, i) => {
      const label = BATCH_LABELS[i] || `batch${i}`;
      if (r.status === 'rejected') {
        console.warn(`FETCH FAILED [${label}]:`, r.reason?.message || r.reason);
        return [];
      }
      console.log(`FETCH OK [${label}]: ${r.value.length} articles`);
      return r.value;
    });

    // Pass 1 — deduplicate by URL
    const urlSeen = new Set();
    const urlDeduped = batches.flat().filter(a => {
      if (!a.url || urlSeen.has(a.url)) return false;
      urlSeen.add(a.url);
      return true;
    });

    // Pass 2 — deduplicate by title similarity (Jaccard > 0.6)
    const titleSeen = [];
    const all = urlDeduped.filter(a => {
      if (titleSeen.some(t => titleSimilarity(t, a.title) > 0.6)) return false;
      titleSeen.push(a.title);
      return true;
    });

    // Pass 3 — sort by recency (newest first), articles without dates go last
    all.sort((a, b) => {
      if (!a.publishedAt && !b.publishedAt) return 0;
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

    // ── Diagnostic: count articles by fetchCategory before clustering ─────────
    const byCat = {};
    all.forEach(a => { const c = a.fetchCategory || '(none)'; byCat[c] = (byCat[c] || 0) + 1; });
    console.log(`Pre-clustering: ${all.length} unique articles by category:`, byCat);

    if (all.length < 5) throw new Error('Too few articles returned from news sources');

    // Cap at 200 to keep clustering prompt manageable (increased for richer pool)
    const trimmed = all.slice(0, 200);

    const clusters = await clusterArticles(trimmed);
    const clusterCats = {};
    clusters.forEach(c => { clusterCats[c.category || '?'] = (clusterCats[c.category || '?'] || 0) + 1; });
    console.log(`Claude returned ${clusters.length} clusters by category:`, clusterCats);

    // Drop topics whose newest article is older than 72 hours (stale content)
    const seventyTwoHoursAgoMs = Date.now() - 72 * 60 * 60 * 1000;

    const topics = clusters
      .map((cluster, i) => {
        const indices = (cluster.articleIndices || [])
          .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < trimmed.length);
        const articles = indices.map(idx => trimmed[idx]);

        if (articles.length < 1) return null;

        // Find the newest article timestamp; fall back to now if none have dates
        const latestPublishedAt = articles.reduce((max, a) =>
          a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '')
          || new Date().toISOString();

        const latestMs = new Date(latestPublishedAt).getTime();
        console.log(`Topic "${cluster.title}" latestPublishedAt=${latestPublishedAt} (${isNaN(latestMs) ? 'NaN' : Math.round((Date.now()-latestMs)/3600000)+'h ago'})`);

        if (!isNaN(latestMs) && latestMs < seventyTwoHoursAgoMs) {
          console.log(`  → DROPPED (older than 72h)`);
          return null;
        }

        const tiers = new Set(articles.map(a =>
          a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
        ));
        const perspectiveMode = (articles.length >= 3 && tiers.size >= 2) ? 'full' : 'limited';

        const img = articles.find(a => a.urlToImage);

        return {
          id:                `topic-${i}`,
          title:             cluster.title    || 'Untitled Story',
          summary:           cluster.summary  || '',
          category:          cluster.category || 'US Politics',
          urlToImage:        img?.urlToImage  || null,
          latestPublishedAt,
          perspectiveMode,
          articles: articles.map(a => ({
            title:       a.title,
            description: a.description,
            source:      a.source,
            url:         a.url,
            bias:        a.bias,
          })),
        };
      })
      .filter(Boolean);

    if (!topics.length) throw new Error('No valid topics passed quality filters');

    // Sort topics by recency — newest latestPublishedAt first, undated topics last
    topics.sort((a, b) => {
      if (!a.latestPublishedAt && !b.latestPublishedAt) return 0;
      if (!a.latestPublishedAt) return 1;
      if (!b.latestPublishedAt) return -1;
      return b.latestPublishedAt.localeCompare(a.latestPublishedAt);
    });

    const finalCats = {};
    topics.forEach(t => { finalCats[t.category] = (finalCats[t.category] || 0) + 1; });
    console.log(`Final: ${topics.length} topics by category:`, finalCats);

    // ── Quality gate: don't overwrite Redis with sports-only results ────────────
    // If all news APIs were rate-limited, we only get ESPN (sports). In that case,
    // serve existing Redis data (however old) rather than poisoning the cache.
    const hasNonSports = topics.some(t => t.category !== 'Sports & Culture');
    if (!hasNonSports) {
      console.log('Fresh fetch returned sports-only — news APIs likely rate-limited');
      try {
        const existing = await redis.get(REDIS_KEY);
        if (existing?.length && existing.some(t => t.category !== 'Sports & Culture')) {
          console.log(`Serving existing ${existing.length} Redis topics instead (sports-only not cached)`);
          return res.json({ topics: existing, fromCache: true, stale: true });
        }
      } catch { /* ignore Redis errors */ }
      console.log('No non-sports Redis fallback available — serving sports-only without caching');
      return res.json({ topics, fromCache: false, sportsOnly: true });
    }

    cachedTopics   = topics;
    cacheTimestamp = Date.now();
    try {
      await redis.set(REDIS_KEY,    topics,                  { ex: 8400 });
      await redis.set(REDIS_TS_KEY, new Date().toISOString());
    } catch (err) {
      console.warn('Redis topics write failed:', err.message);
    }
    return res.json({ topics, fromCache: false });

  } catch (err) {
    console.error('clustered-news error:', err);
    // Try in-memory cache first
    if (cachedTopics) return res.json({ topics: cachedTopics, fromCache: true, stale: true });
    // Try Redis stale data as last resort — never let a 500 reach the user
    try {
      const staleRedis = await redis.get(REDIS_KEY);
      if (staleRedis?.length) {
        console.log(`Error fallback: serving ${staleRedis.length} stale topics from Redis`);
        return res.json({ topics: staleRedis, fromCache: true, stale: true });
      }
    } catch { /* ignore Redis errors in fallback */ }
    // Nothing available — return 200 with error so the client shows its own error screen
    return res.json({ error: err.message || 'Failed to load news' });
  }
}
