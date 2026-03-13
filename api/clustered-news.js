import Anthropic from '@anthropic-ai/sdk';

// ── Media bias database — keyed by newsdata.io source_id ─────────────────────
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
  // Normalize: lowercase, strip non-alphanumeric for fuzzy matching
  const id = sourceId.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (MEDIA_BIAS[id]) return MEDIA_BIAS[id];
  for (const [k, v] of Object.entries(MEDIA_BIAS)) {
    if (id.includes(k) || k.includes(id)) return v;
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
        // Normalize pubDate: newsdata.io returns "2026-03-12 14:30:00" — convert to ISO
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

// ── Cluster articles into 20-30 categorized topics with Claude Haiku ─────────
async function clusterArticles(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      const hint = a.fetchCategory ? ` [${a.fetchCategory}]` : '';
      return `[${i}] ${tier}:${a.source}${hint} | ${a.title}`;
    })
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Cluster these ${articles.length} news articles into 20-30 major ongoing topics.

Return ONLY valid JSON, no markdown:
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"Top US|World|Politics|Economy|Technology|Health|Military|Climate|Crime|Sports & Culture","articleIndices":[0,1,2,3]}]}

Rules:
- 20-30 topics total
- Each topic needs at least 1 article
- Prefer topics with 3+ articles from multiple bias tiers — these get the full 7-perspective treatment
- Topics with only 1-2 articles are still valuable — include them
- Merge near-duplicate topics into one
- "category" must be exactly one of: Top US, World, Politics, Economy, Technology, Health, Military, Climate, Crime, Sports & Culture
- Use [fetchCategory hints] shown in brackets when available to guide category assignment
- Neutral factual titles only — no editorial spin

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

  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey)                        return res.status(500).json({ error: 'NEWSDATA_API_KEY not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const forceRefresh = req.query?.refresh === '1';
  if (!forceRefresh && cachedTopics && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  try {
    const BASE = 'https://newsdata.io/api/1';
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]; // YYYY-MM-DD

    // Fire all NewsData.io requests in parallel
    const results = await Promise.allSettled([
      // Latest news — bias-grouped domain fetches
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_b}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&size=10`),
      // Category-specific fetches for breadth
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=politics&language=en&size=10`,    'Politics'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=business&language=en&size=10`,    'Economy'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=technology&language=en&size=10`,  'Technology'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=health&language=en&size=10`,      'Health'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=sports&language=en&size=10`,      'Sports & Culture'),
      fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=world&language=en&size=10`,       'World'),
      // 30-day archive — may fail on free tier, silently ignored
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&from_date=${thirtyDaysAgo}&size=10`),
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&from_date=${thirtyDaysAgo}&size=10`),
      fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&from_date=${thirtyDaysAgo}&size=10`),
    ]);

    const batches = results.map(r => r.status === 'fulfilled' ? r.value : []);

    // Deduplicate by URL
    const seen = new Set();
    const all = batches
      .flat()
      .filter(a => {
        if (!a.url || seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      });

    console.log(`Fetched ${all.length} unique articles from ${batches.length} batches (${batches.map((b,i)=>b.length).join('+')})`);

    if (all.length < 5) throw new Error('Too few articles returned from NewsData.io');

    // Cap at 120 to keep the clustering prompt manageable
    const trimmed = all.slice(0, 120);

    const clusters = await clusterArticles(trimmed);
    console.log(`Claude identified ${clusters.length} clusters`);

    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Build and validate topics
    const topics = clusters
      .map((cluster, i) => {
        const indices = (cluster.articleIndices || [])
          .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < trimmed.length);
        const articles = indices.map(idx => trimmed[idx]);

        if (articles.length < 1) return null;

        // Most recent article date
        const latestPublishedAt = articles.reduce((max, a) =>
          a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '');

        // Skip topics where the most recent article is older than 30 days
        if (latestPublishedAt) {
          const latestMs = new Date(latestPublishedAt).getTime();
          if (!isNaN(latestMs) && latestMs < thirtyDaysAgoMs) return null;
        }

        // Full vs limited perspective mode
        const tiers = new Set(articles.map(a =>
          a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
        ));
        const perspectiveMode = (articles.length >= 3 && tiers.size >= 2) ? 'full' : 'limited';

        const img = articles.find(a => a.urlToImage);

        return {
          id:               `topic-${i}`,
          title:            cluster.title    || 'Untitled Story',
          summary:          cluster.summary  || '',
          category:         cluster.category || 'Top US',
          urlToImage:       img?.urlToImage  || null,
          latestPublishedAt: latestPublishedAt || null,
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

    console.log(`Final: ${topics.length} topics (${topics.filter(t=>t.perspectiveMode==='full').length} full, ${topics.filter(t=>t.perspectiveMode==='limited').length} limited)`);
    cachedTopics   = topics;
    cacheTimestamp = Date.now();
    return res.json({ topics, fromCache: false });

  } catch (err) {
    console.error('clustered-news error:', err);
    if (cachedTopics) return res.json({ topics: cachedTopics, fromCache: true, stale: true });
    return res.status(500).json({ error: err.message || 'Failed to load news' });
  }
}
