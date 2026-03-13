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

// ── Media Bias Database ────────────────────────────────────────────────────────
const MEDIA_BIAS = {
  'MSNBC':                   { score: -3, label: 'Far Left',    color: '#2563eb' },
  'HuffPost':                { score: -3, label: 'Far Left',    color: '#2563eb' },
  'CNN':                     { score: -2, label: 'Left',        color: '#3b82f6' },
  'The New York Times':      { score: -2, label: 'Left',        color: '#3b82f6' },
  'The Guardian':            { score: -2, label: 'Left',        color: '#3b82f6' },
  'NPR':                     { score: -2, label: 'Left',        color: '#3b82f6' },
  'CBS News':                { score: -1, label: 'Left-Center', color: '#60a5fa' },
  'The Washington Post':     { score: -1, label: 'Left-Center', color: '#60a5fa' },
  'NBC News':                { score: -1, label: 'Left-Center', color: '#818cf8' },
  'Reuters':                 { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'Associated Press':        { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'The Associated Press':    { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'AP':                      { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'BBC News':                { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'BBC':                     { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'The Hill':                { score: 0,  label: 'Neutral',     color: '#a78bfa' },
  'The Wall Street Journal': { score: 1,  label: 'Center-Right', color: '#fca5a5' },
  'Wall Street Journal':     { score: 1,  label: 'Center-Right', color: '#fca5a5' },
  'New York Post':           { score: 2,  label: 'Right',       color: '#f87171' },
  'The New York Post':       { score: 2,  label: 'Right',       color: '#f87171' },
  'Newsmax':                 { score: 2,  label: 'Right',       color: '#f87171' },
  'Fox News':                { score: 3,  label: 'Right',       color: '#ef4444' },
  'Daily Wire':              { score: 3,  label: 'Right',       color: '#ef4444' },
  'The Daily Wire':          { score: 3,  label: 'Right',       color: '#ef4444' },
  'Breitbart News':          { score: 4,  label: 'Far Right',   color: '#dc2626' },
  'Breitbart':               { score: 4,  label: 'Far Right',   color: '#dc2626' },
};

function getBias(sourceName) {
  if (!sourceName) return { score: 0, label: 'Unknown', color: '#6b7280' };
  if (MEDIA_BIAS[sourceName]) return MEDIA_BIAS[sourceName];
  for (const [key, val] of Object.entries(MEDIA_BIAS)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(sourceName.toLowerCase())) return val;
  }
  return { score: 0, label: 'Unknown', color: '#6b7280' };
}

// ── NewsAPI source groups ──────────────────────────────────────────────────────
const SOURCE_GROUPS = {
  left:   'cnn,msnbc,the-guardian-us,nbc-news,cbs-news',
  center: 'reuters,associated-press,bbc-news,the-hill',
  right:  'fox-news,the-new-york-post,breitbart-news',
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

// ── Server-side cache (15-min TTL) ─────────────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

let generationInFlight = null;

// ── Fetch headlines for one source group ──────────────────────────────────────
async function fetchSourceGroup(apiKey, sources, pageSize = 12) {
  const url = `https://newsapi.org/v2/top-headlines?sources=${sources}&pageSize=${pageSize}&apiKey=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'ok') {
      console.warn(`NewsAPI error for sources ${sources}:`, data.message);
      return [];
    }
    return data.articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description)
      .map(a => ({
        title:       a.title,
        description: a.description,
        source:      a.source?.name || 'Unknown',
        publishedAt: a.publishedAt,
        url:         a.url,
        urlToImage:  a.urlToImage,
        bias:        getBias(a.source?.name),
      }));
  } catch (err) {
    console.warn(`Failed to fetch source group ${sources}:`, err.message);
    return [];
  }
}

// ── Cluster articles into topics using Claude ─────────────────────────────────
async function clusterArticles(articles) {
  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      return `[${i}] ${tier}:${a.source} | ${a.title}`;
    })
    .join('\n');

  const prompt = `Cluster these ${articles.length} news articles into 20-30 major ongoing world news topics.

Return ONLY valid JSON, no markdown:
{
  "topics": [
    {
      "title": "Short neutral topic name (max 6 words)",
      "summary": "One neutral sentence describing what this story is about",
      "category": "Top US|World|Politics|Economy|Technology|Health|Military|Climate|Crime|Sports & Culture",
      "articleIndices": [0, 3, 7, 12]
    }
  ]
}

Rules:
- 20-30 topics total
- Each topic needs at least 1 article
- Topics with 3+ articles from multiple bias tiers get the full 7-perspective treatment
- Topics with only 1-2 articles are still valuable — include them
- Merge near-duplicate topics into one
- Title: short, factual, no editorializing
- Summary: one factual sentence only
- Neutral factual titles only — no editorial spin`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Clustering returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

// ── Build topic shells (no takes — generated on demand) ───────────────────────
async function buildTopicShells(clusters, allArticles) {
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return clusters
    .map((cluster, i) => {
      const clusterArticles = (cluster.articleIndices || [])
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < allArticles.length)
        .map(idx => allArticles[idx]);

      if (clusterArticles.length < 1) return null;

      // Find the most recently published article date
      const latestPublishedAt = clusterArticles.reduce((max, a) =>
        a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '');

      // Skip topics older than 30 days
      if (latestPublishedAt) {
        const latestMs = new Date(latestPublishedAt).getTime();
        if (latestMs > 0 && latestMs < thirtyDaysAgoMs) return null;
      }

      // Determine perspective mode
      const tiers = new Set(clusterArticles.map(a =>
        a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
      ));
      const perspectiveMode = (clusterArticles.length >= 3 && tiers.size >= 2) ? 'full' : 'limited';

      const imgArticle = clusterArticles.find(a => a.urlToImage);

      return {
        id:               `topic-${i}`,
        title:            cluster.title    || 'Untitled Story',
        summary:          cluster.summary  || '',
        category:         cluster.category || 'Top US',
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
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NEWS_API_KEY not set' });

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cachedTopics && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Serving from cache');
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  if (generationInFlight) {
    console.log('Generation in progress — waiting for existing request…');
    try {
      const topics = await generationInFlight;
      return res.json({ topics, fromCache: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Generation failed' });
    }
  }

  const doGenerate = async () => {
    console.log('Fetching fresh articles from all source groups…');
    const [left, center, right] = await Promise.all([
      fetchSourceGroup(apiKey, SOURCE_GROUPS.left,   15),
      fetchSourceGroup(apiKey, SOURCE_GROUPS.center, 12),
      fetchSourceGroup(apiKey, SOURCE_GROUPS.right,  12),
    ]);

    const all = [...left, ...center, ...right];
    console.log(`Fetched ${all.length} articles  (${left.length} left · ${center.length} center · ${right.length} right)`);

    if (all.length < 6) throw new Error('Too few articles returned from NewsAPI');

    // Deduplicate by URL
    const seen = new Set();
    const deduped = all.filter(a => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    console.log('Clustering articles with AI…');
    const clusters = await clusterArticles(deduped);
    console.log(`Identified ${clusters.length} topic clusters`);

    const topics = await buildTopicShells(clusters, deduped);
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

  try {
    const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(none available)'
      : arr.map(a => `  • ${a.source}: "${a.title}" — ${a.description}`).join('\n');

    const primaryTier  = meta.tier;
    const tierOutlets  = TIER_OUTLETS[primaryTier];
    const tierInstruct =
      primaryTier === 'left'   ? `Draw primarily from the LEFT-LEANING sources (${tierOutlets}). Emphasize systemic causes, social impact, equity, and progressive solutions.`
    : primaryTier === 'right'  ? `Draw primarily from the RIGHT-LEANING sources (${tierOutlets}). Emphasize individual liberty, traditional values, free markets, national security, and limited government.`
    :                            `Draw from CENTER/NEUTRAL sources (${tierOutlets}). Present factual, balanced analysis without ideological spin.`;

    const prompt = `You are writing a ${meta.label} opinion piece on the news topic below.

${tierInstruct}

TOPIC: ${topic.title}
CONTEXT: ${topic.summary || '(no summary)'}

─── SOURCE ARTICLES BY BIAS TIER ───

[LEFT-LEANING] (NYT, CNN, MSNBC, NPR, Washington Post, Guardian, CBS, NBC):
${fmt(leftArts)}

[CENTER/NEUTRAL] (Reuters, AP, BBC, Axios, The Hill):
${fmt(centerArts)}

[RIGHT-LEANING] (Fox News, NY Post, Washington Times, Breitbart, Daily Caller):
${fmt(rightArts)}

─── TASK ───
Write 2 paragraphs (~150-180 words total) that sound authentically ${meta.label}.
- Synthesize from the sources — do NOT copy sentences verbatim
- Use the framing, language, and emphasis of that political viewpoint
- Cite 1-3 source articles that most inform this perspective

Return ONLY valid JSON (no markdown, no commentary):
{"take":{"position":${position},"label":"${meta.label}","text":"paragraph one\\n\\nparagraph two","sources":[{"name":"Source Name","framing":"One sentence on their framing","url":"https://..."}]}}

Only include URLs that appear verbatim in the articles above. Omit the url field if uncertain.`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!parsed.take) throw new Error('No take in response');

    return res.json({ take: { ...parsed.take, color: meta.color } });
  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => console.log(`SwipeNews server running on :${PORT}`));
