import Anthropic from '@anthropic-ai/sdk';

// ── Expanded media bias database ─────────────────────────────────────────────
const MEDIA_BIAS = {
  // Far Left / Left
  'MSNBC':                 { score: -3, label: 'Far Left',    color: '#2563eb' },
  'CNN':                   { score: -2, label: 'Left',        color: '#3b82f6' },
  'The Guardian':          { score: -2, label: 'Left',        color: '#3b82f6' },
  'The Guardian (US)':     { score: -2, label: 'Left',        color: '#3b82f6' },
  'The New York Times':    { score: -2, label: 'Left',        color: '#3b82f6' },
  'The Washington Post':   { score: -1, label: 'Left-Center', color: '#60a5fa' },
  'NPR':                   { score: -1, label: 'Left-Center', color: '#60a5fa' },
  'NBC News':              { score: -1, label: 'Left-Center', color: '#60a5fa' },
  'CBS News':              { score: -1, label: 'Left-Center', color: '#60a5fa' },
  // Center
  'Reuters':               { score:  0, label: 'Center',      color: '#a78bfa' },
  'Associated Press':      { score:  0, label: 'Center',      color: '#a78bfa' },
  'The Associated Press':  { score:  0, label: 'Center',      color: '#a78bfa' },
  'BBC News':              { score:  0, label: 'Center',      color: '#a78bfa' },
  'The Hill':              { score:  0, label: 'Center',      color: '#a78bfa' },
  'Axios':                 { score:  0, label: 'Center',      color: '#a78bfa' },
  // Right
  'Fox News':              { score:  3, label: 'Right',       color: '#ef4444' },
  'New York Post':         { score:  2, label: 'Right',       color: '#f87171' },
  'The New York Post':     { score:  2, label: 'Right',       color: '#f87171' },
  'Washington Times':      { score:  2, label: 'Right',       color: '#f87171' },
  'The Washington Times':  { score:  2, label: 'Right',       color: '#f87171' },
  'Breitbart News':        { score:  4, label: 'Far Right',   color: '#dc2626' },
  'Daily Caller':          { score:  3, label: 'Right',       color: '#ef4444' },
};

function getBias(name) {
  if (!name) return { score: 0, label: 'Unknown', color: '#6b7280' };
  if (MEDIA_BIAS[name]) return MEDIA_BIAS[name];
  for (const [k, v] of Object.entries(MEDIA_BIAS)) {
    if (name.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(name.toLowerCase())) return v;
  }
  return { score: 0, label: 'Unknown', color: '#6b7280' };
}

// ── NewsAPI source IDs (bias-grouped) ────────────────────────────────────────
const SOURCE_GROUPS = {
  left:   'cnn,msnbc,the-guardian-us,nbc-news,cbs-news,the-new-york-times,the-washington-post,npr',
  center: 'reuters,associated-press,bbc-news,the-hill,axios',
  right:  'fox-news,the-new-york-post,breitbart-news,the-washington-times',
};

// ── Module-level cache ────────────────────────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── Fetch articles from a single NewsAPI URL ──────────────────────────────────
async function fetchArticles(url, tagCategory = null) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'ok') {
      console.warn('NewsAPI warning:', data.message, url.split('?')[0]);
      return [];
    }
    return data.articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description)
      .map(a => ({
        title:         a.title,
        description:   a.description,
        source:        a.source?.name || 'Unknown',
        url:           a.url,
        urlToImage:    a.urlToImage || null,
        publishedAt:   a.publishedAt || null,
        bias:          getBias(a.source?.name),
        fetchCategory: tagCategory,
      }));
  } catch (err) {
    console.warn('fetchArticles failed:', err.message);
    return [];
  }
}

// ── Cluster articles into 15-25 categorized topics with Claude Haiku ─────────
async function clusterArticles(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Compact format — bias tier (L/C/R), source, optional fetch-category hint, headline
  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      const hint = a.fetchCategory ? ` [${a.fetchCategory}]` : '';
      return `[${i}] ${tier}:${a.source}${hint} | ${a.title}`;
    })
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Cluster these ${articles.length} news articles into 15-25 major ongoing topics.

Return ONLY valid JSON, no markdown:
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"Top US|World|Politics|Economy|Technology|Health|Military|Climate|Crime|Sports & Culture","articleIndices":[0,1,2,3]}]}

Rules:
- 15-25 topics total
- Each topic MUST have at least 3 articles from at least 2 DIFFERENT sources
- Skip topics with only 1-2 articles or from a single outlet
- Merge near-duplicate topics into one
- "category" must be exactly one of: Top US, World, Politics, Economy, Technology, Health, Military, Climate, Crime, Sports & Culture
- Use [fetchCategory hints] shown in brackets when available to guide category assignment
- Prefer topics with coverage from BOTH L (left) and R (right) sources
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

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey)                        return res.status(500).json({ error: 'NEWS_API_KEY not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const forceRefresh = req.query?.refresh === '1';
  if (!forceRefresh && cachedTopics && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  try {
    const BASE = 'https://newsapi.org/v2';

    // Fire all NewsAPI requests in parallel — source groups + category endpoints
    const results = await Promise.allSettled([
      // Bias-grouped source fetches
      fetchArticles(`${BASE}/top-headlines?sources=${SOURCE_GROUPS.left}&pageSize=20&apiKey=${apiKey}`),
      fetchArticles(`${BASE}/top-headlines?sources=${SOURCE_GROUPS.center}&pageSize=15&apiKey=${apiKey}`),
      fetchArticles(`${BASE}/top-headlines?sources=${SOURCE_GROUPS.right}&pageSize=15&apiKey=${apiKey}`),
      // Category-specific fetches (country=us unlocks NewsAPI categories)
      fetchArticles(`${BASE}/top-headlines?country=us&category=general&pageSize=20&apiKey=${apiKey}`,     'Top US'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=business&pageSize=15&apiKey=${apiKey}`,    'Economy'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=technology&pageSize=12&apiKey=${apiKey}`,  'Technology'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=health&pageSize=12&apiKey=${apiKey}`,      'Health'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=science&pageSize=10&apiKey=${apiKey}`,     'Health'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=sports&pageSize=12&apiKey=${apiKey}`,      'Sports & Culture'),
      fetchArticles(`${BASE}/top-headlines?country=us&category=entertainment&pageSize=10&apiKey=${apiKey}`, 'Sports & Culture'),
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

    console.log(`Fetched ${all.length} unique articles from ${batches.map((b,i)=>`batch${i}:${b.length}`).join(' ')}`);

    if (all.length < 10) throw new Error('Too few articles returned from NewsAPI');

    // Cap at 100 to keep the clustering prompt manageable
    const trimmed = all.slice(0, 100);

    const clusters = await clusterArticles(trimmed);
    console.log(`Claude identified ${clusters.length} clusters`);

    // Build and validate topics
    const topics = clusters
      .map((cluster, i) => {
        const indices = (cluster.articleIndices || [])
          .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < trimmed.length);
        const articles = indices.map(idx => trimmed[idx]);

        // Require ≥3 articles from ≥2 different sources
        const uniqueSources = new Set(articles.map(a => a.source));
        if (articles.length < 3 || uniqueSources.size < 2) return null;

        // Require coverage from at least 2 bias tiers
        const tiers = new Set(articles.map(a =>
          a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
        ));
        if (tiers.size < 2) return null;

        const img = articles.find(a => a.urlToImage);

        // Find the most recently published article date
        const latestPublishedAt = articles.reduce((max, a) =>
          a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '');

        return {
          id:               `topic-${i}`,
          title:            cluster.title    || 'Untitled Story',
          summary:          cluster.summary  || '',
          category:         cluster.category || 'Top US',
          urlToImage:       img?.urlToImage  || null,
          latestPublishedAt: latestPublishedAt || null,
          // Articles kept lean — only what generate-takes needs
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

    console.log(`Final: ${topics.length} quality topics`);
    cachedTopics   = topics;
    cacheTimestamp = Date.now();
    return res.json({ topics, fromCache: false });

  } catch (err) {
    console.error('clustered-news error:', err);
    if (cachedTopics) return res.json({ topics: cachedTopics, fromCache: true, stale: true });
    return res.status(500).json({ error: err.message || 'Failed to load news' });
  }
}
