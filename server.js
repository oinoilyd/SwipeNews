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
  'MSNBC':                   { score: -3, label: 'Left',         color: '#2563eb' },
  'HuffPost':                { score: -3, label: 'Left',         color: '#2563eb' },
  'CNN':                     { score: -2, label: 'Left',         color: '#3b82f6' },
  'The New York Times':      { score: -2, label: 'Left',         color: '#3b82f6' },
  'The Guardian':            { score: -2, label: 'Left',         color: '#3b82f6' },
  'NPR':                     { score: -2, label: 'Left',         color: '#3b82f6' },
  'CBS News':                { score: -1, label: 'Left-Center',  color: '#60a5fa' },
  'The Washington Post':     { score: -1, label: 'Left-Center',  color: '#60a5fa' },
  'NBC News':                { score: -1, label: 'Left-Center',  color: '#818cf8' },
  'Reuters':                 { score: 0,  label: 'Center',       color: '#a78bfa' },
  'Associated Press':        { score: 0,  label: 'Center',       color: '#a78bfa' },
  'The Associated Press':    { score: 0,  label: 'Center',       color: '#a78bfa' },
  'AP':                      { score: 0,  label: 'Center',       color: '#a78bfa' },
  'BBC News':                { score: 0,  label: 'Center',       color: '#a78bfa' },
  'BBC':                     { score: 0,  label: 'Center',       color: '#a78bfa' },
  'The Hill':                { score: 0,  label: 'Center',       color: '#a78bfa' },
  'The Wall Street Journal': { score: 1,  label: 'Center-Right', color: '#fca5a5' },
  'Wall Street Journal':     { score: 1,  label: 'Center-Right', color: '#fca5a5' },
  'New York Post':           { score: 2,  label: 'Right',        color: '#f87171' },
  'The New York Post':       { score: 2,  label: 'Right',        color: '#f87171' },
  'Newsmax':                 { score: 2,  label: 'Right',        color: '#f87171' },
  'Fox News':                { score: 3,  label: 'Right',        color: '#ef4444' },
  'Daily Wire':              { score: 3,  label: 'Right',        color: '#ef4444' },
  'The Daily Wire':          { score: 3,  label: 'Right',        color: '#ef4444' },
  'Breitbart News':          { score: 4,  label: 'Far Right',    color: '#dc2626' },
  'Breitbart':               { score: 4,  label: 'Far Right',    color: '#dc2626' },
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
  { position: -3, label: 'Far Left',     color: '#1d4ed8' },
  { position: -2, label: 'Left',         color: '#3b82f6' },
  { position: -1, label: 'Center-Left',  color: '#818cf8' },
  { position:  0, label: 'Neutral',      color: '#a78bfa' },
  { position:  1, label: 'Center-Right', color: '#f97316' },
  { position:  2, label: 'Right',        color: '#ef4444' },
  { position:  3, label: 'Far Right',    color: '#dc2626' },
];

// ── Server-side cache (15-min TTL) ─────────────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

// In-flight generation lock: prevent concurrent expensive Claude calls
let generationInFlight = null; // Promise | null

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
    .map((a, i) => `[${i}] ${a.source} | ${a.title}`)
    .join('\n');

  const prompt = `You are analyzing news articles from outlets across the political spectrum to identify 6-8 major ongoing world news topics.

Articles (format: [INDEX] SOURCE | HEADLINE):
${list}

Return ONLY valid JSON, no markdown:
{
  "topics": [
    {
      "title": "Short neutral topic name (max 6 words, e.g. 'US-Iran Military Tensions')",
      "summary": "One neutral sentence describing what this story is about",
      "articleIndices": [0, 3, 7, 12]
    }
  ]
}

Rules:
- Create exactly 6-8 topics
- Prefer big ongoing stories covered by multiple outlets across the spectrum
- Title: short, factual, no editorializing (think newspaper section header)
- Summary: one factual sentence only
- Each article index may appear in at most one topic
- Prioritize stories where left AND right outlets are both covering the event`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Clustering returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

// ── Generate all 7 takes for one topic ────────────────────────────────────────
async function generateTakesForTopic(topic, articles) {
  // Group source articles by bias tier for the prompt
  const leftArticles   = articles.filter(a => a.bias.score <= -1);
  const centerArticles = articles.filter(a => a.bias.score === 0);
  const rightArticles  = articles.filter(a => a.bias.score >= 1);

  const formatArticles = (arr) => arr.length === 0
    ? '(no articles from this tier)'
    : arr.map(a => `  - ${a.source}: "${a.title}" — ${a.description}`).join('\n');

  const prompt = `You are generating 7 different political takes on the same news topic. Each take synthesizes multiple news sources into a coherent perspective — do NOT copy any article verbatim.

TOPIC: ${topic.title}
TOPIC SUMMARY: ${topic.summary}

SOURCE ARTICLES:

[LEFT-LEANING OUTLETS]
${formatArticles(leftArticles)}

[CENTER/NEUTRAL OUTLETS]
${formatArticles(centerArticles)}

[RIGHT-LEANING OUTLETS]
${formatArticles(rightArticles)}

Write 7 takes on this topic. Each take is a 2-3 paragraph synthesized opinion piece (150-200 words) written from that political perspective. The writing should feel authentic to that viewpoint — use language, framing, and emphasis that genuinely reflects that political stance.

For each take, also identify which of the source articles above most informed that perspective (list 1-3 sources with a one-line description of how they framed it).

Return ONLY valid JSON:
{
  "takes": [
    {
      "position": -3,
      "label": "Far Left",
      "text": "2-3 paragraphs synthesized from a far-left perspective...",
      "sources": [
        {
          "name": "CNN",
          "framing": "One sentence describing how CNN framed this story",
          "url": "https://..."
        }
      ]
    },
    { "position": -2, "label": "Left", "text": "...", "sources": [...] },
    { "position": -1, "label": "Center-Left", "text": "...", "sources": [...] },
    { "position": 0,  "label": "Neutral", "text": "...", "sources": [...] },
    { "position": 1,  "label": "Center-Right", "text": "...", "sources": [...] },
    { "position": 2,  "label": "Right", "text": "...", "sources": [...] },
    { "position": 3,  "label": "Far Right", "text": "...", "sources": [...] }
  ]
}

Use only URLs from the source articles listed above (or omit url if uncertain). Do not invent URLs.`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in takes response for topic: ${topic.title}`);
  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed.takes) || parsed.takes.length !== 7) {
    throw new Error(`Expected 7 takes, got ${parsed.takes?.length} for: ${topic.title}`);
  }

  // Merge position metadata from TAKE_POSITIONS
  return parsed.takes.map(t => {
    const meta = TAKE_POSITIONS.find(p => p.position === t.position) || TAKE_POSITIONS[3];
    return { ...t, color: meta.color };
  });
}

// ── Build full topic objects with takes ────────────────────────────────────────
async function buildTopicsWithTakes(clusters, allArticles) {
  // First build raw topic objects (same as before)
  const rawTopics = clusters
    .map((cluster, i) => {
      const clusterArticles = (cluster.articleIndices || [])
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < allArticles.length)
        .map(idx => allArticles[idx]);

      if (clusterArticles.length < 2) return null;

      const imgArticle = clusterArticles.find(a => a.urlToImage);

      return {
        id:         `topic-${i}`,
        title:      cluster.title || 'Untitled Story',
        summary:    cluster.summary || '',
        urlToImage: imgArticle?.urlToImage || null,
        articles:   clusterArticles, // keep for takes generation
      };
    })
    .filter(Boolean);

  console.log(`Generating takes for ${rawTopics.length} topics…`);

  // Generate takes for each topic sequentially (avoid rate limits)
  const topicsWithTakes = [];
  for (let i = 0; i < rawTopics.length; i++) {
    const topic = rawTopics[i];
    console.log(`  [${i + 1}/${rawTopics.length}] Generating 7 takes for: ${topic.title}`);
    try {
      const takes = await generateTakesForTopic(topic, topic.articles);
      topicsWithTakes.push({
        id:         topic.id,
        title:      topic.title,
        summary:    topic.summary,
        urlToImage: topic.urlToImage,
        takes,
      });
    } catch (err) {
      console.warn(`  Failed to generate takes for "${topic.title}":`, err.message);
      // Skip topics where takes generation fails
    }
  }

  return topicsWithTakes;
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

  // If a generation is already in flight, wait for it instead of starting another
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
      fetchSourceGroup(apiKey, SOURCE_GROUPS.left,   12),
      fetchSourceGroup(apiKey, SOURCE_GROUPS.center, 10),
      fetchSourceGroup(apiKey, SOURCE_GROUPS.right,  10),
    ]);

    const all = [...left, ...center, ...right];
    console.log(`Fetched ${all.length} articles  (${left.length} left · ${center.length} center · ${right.length} right)`);

    if (all.length < 6) throw new Error('Too few articles returned from NewsAPI');

    console.log('Clustering articles with AI…');
    const clusters = await clusterArticles(all);
    console.log(`Identified ${clusters.length} topic clusters`);

    const topics = await buildTopicsWithTakes(clusters, all);
    console.log(`Built ${topics.length} topics with full takes`);

    if (!topics.length) throw new Error('No topics with takes could be generated');

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

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => console.log(`SwipeNews server running on :${PORT}`));
