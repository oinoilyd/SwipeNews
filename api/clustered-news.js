import Anthropic from '@anthropic-ai/sdk';

// ── Media bias database ────────────────────────────────────────────────────────
const MEDIA_BIAS = {
  'CNN':                  { score: -2, label: 'Left',         color: '#3b82f6' },
  'MSNBC':               { score: -3, label: 'Left',         color: '#2563eb' },
  'The Guardian':        { score: -2, label: 'Left',         color: '#3b82f6' },
  'NBC News':            { score: -1, label: 'Left-Center',  color: '#60a5fa' },
  'CBS News':            { score: -1, label: 'Left-Center',  color: '#60a5fa' },
  'Reuters':             { score:  0, label: 'Center',       color: '#a78bfa' },
  'Associated Press':    { score:  0, label: 'Center',       color: '#a78bfa' },
  'The Associated Press':{ score:  0, label: 'Center',       color: '#a78bfa' },
  'BBC News':            { score:  0, label: 'Center',       color: '#a78bfa' },
  'The Hill':            { score:  0, label: 'Center',       color: '#a78bfa' },
  'Fox News':            { score:  3, label: 'Right',        color: '#ef4444' },
  'New York Post':       { score:  2, label: 'Right',        color: '#f87171' },
  'The New York Post':   { score:  2, label: 'Right',        color: '#f87171' },
  'Breitbart News':      { score:  4, label: 'Far Right',    color: '#dc2626' },
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

const SOURCE_GROUPS = {
  left:   'cnn,msnbc,the-guardian-us,nbc-news,cbs-news',
  center: 'reuters,associated-press,bbc-news,the-hill',
  right:  'fox-news,the-new-york-post,breitbart-news',
};

// ── Module-level cache (warm Lambda instances reuse this) ─────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── Fetch one source group from NewsAPI ───────────────────────────────────────
async function fetchGroup(apiKey, sources, pageSize = 10) {
  const url = `https://newsapi.org/v2/top-headlines?sources=${sources}&pageSize=${pageSize}&apiKey=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'ok') {
      console.warn('NewsAPI error:', data.message);
      return [];
    }
    return data.articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description)
      .map(a => ({
        title:       a.title,
        description: a.description,
        source:      a.source?.name || 'Unknown',
        url:         a.url,
        urlToImage:  a.urlToImage || null,
        bias:        getBias(a.source?.name),
      }));
  } catch (err) {
    console.warn('fetchGroup failed:', err.message);
    return [];
  }
}

// ── Cluster articles into 5-7 topics using fast Haiku model ──────────────────
async function clusterArticles(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const list = articles.map((a, i) => `[${i}] ${a.source} | ${a.title}`).join('\n');

  const msg = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Identify 5-7 major ongoing news topics from these articles. Return ONLY valid JSON with no markdown:
{"topics":[{"title":"Short neutral topic name (max 5 words)","summary":"One factual sentence","articleIndices":[0,1,2]}]}

Articles:
${list}

Rules: 5-7 topics, prefer stories covered by outlets across the political spectrum, factual titles only.`,
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
  if (!apiKey) return res.status(500).json({ error: 'NEWS_API_KEY not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const forceRefresh = req.query?.refresh === '1';
  if (!forceRefresh && cachedTopics && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  try {
    const [left, center, right] = await Promise.all([
      fetchGroup(apiKey, SOURCE_GROUPS.left,   10),
      fetchGroup(apiKey, SOURCE_GROUPS.center,  8),
      fetchGroup(apiKey, SOURCE_GROUPS.right,   8),
    ]);

    const all = [...left, ...center, ...right];
    console.log(`Fetched ${all.length} articles (${left.length}L · ${center.length}C · ${right.length}R)`);

    if (all.length < 5) throw new Error('Too few articles returned from NewsAPI');

    const clusters = await clusterArticles(all);
    console.log(`Identified ${clusters.length} clusters`);

    const topics = clusters
      .map((cluster, i) => {
        const articles = (cluster.articleIndices || [])
          .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < all.length)
          .map(idx => all[idx]);

        if (articles.length < 2) return null;

        const img = articles.find(a => a.urlToImage);

        return {
          id:         `topic-${i}`,
          title:      cluster.title  || 'Untitled Story',
          summary:    cluster.summary || '',
          urlToImage: img?.urlToImage || null,
          // Trimmed articles — sent back to frontend for takes generation
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

    if (!topics.length) throw new Error('No valid topics could be identified');

    cachedTopics   = topics;
    cacheTimestamp = Date.now();
    return res.json({ topics, fromCache: false });

  } catch (err) {
    console.error('clustered-news error:', err);
    if (cachedTopics) return res.json({ topics: cachedTopics, fromCache: true, stale: true });
    return res.status(500).json({ error: err.message || 'Failed to load news' });
  }
}
