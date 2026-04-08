import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../lib/redis.js';
import { TAKE_POSITIONS, buildPrompt } from '../lib/perspectives.js';

// ── Must match CACHE_VERSION in pregenerate.js ────────────────────────────────
const TOPICS_KEY = 'sn:topics:v9';

// ── Keyword helpers ───────────────────────────────────────────────────────────
const STOP = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','are','was','as',
  'by','with','that','this','its','it','be','has','had','have','will','from','but',
  'not','were','about','been','their','they','what','which','who','how','when',
  'where','why','can','says','said','after','over','into','than','also','amid',
]);
function extractKeywords(text) {
  return [...new Set(
    text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  )];
}
function scoreText(text, kws) {
  const lower = text.toLowerCase();
  return kws.filter(kw => lower.includes(kw)).length;
}

// ── Bias lookup (mirrors pregenerate.js) ─────────────────────────────────────
const MEDIA_BIAS = {
  'msnbc':           { score: -3, label: 'Far Left',     color: '#2563eb', name: 'MSNBC' },
  'cnn':             { score: -2, label: 'Left',         color: '#3b82f6', name: 'CNN' },
  'theguardian':     { score: -2, label: 'Left',         color: '#3b82f6', name: 'The Guardian' },
  'nytimes':         { score: -2, label: 'Left',         color: '#3b82f6', name: 'The New York Times' },
  'washingtonpost':  { score: -1, label: 'Center-Left',  color: '#60a5fa', name: 'The Washington Post' },
  'npr':             { score: -1, label: 'Center-Left',  color: '#60a5fa', name: 'NPR' },
  'nbcnews':         { score: -1, label: 'Center-Left',  color: '#60a5fa', name: 'NBC News' },
  'cbsnews':         { score: -1, label: 'Center-Left',  color: '#60a5fa', name: 'CBS News' },
  'abcnews':         { score: -1, label: 'Center-Left',  color: '#60a5fa', name: 'ABC News' },
  'bbc':             { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'BBC News' },
  'bbcnews':         { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'BBC News' },
  'reuters':         { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'Reuters' },
  'apnews':          { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'Associated Press' },
  'thehill':         { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'The Hill' },
  'axios':           { score:  0, label: 'Neutral',      color: '#a78bfa', name: 'Axios' },
  'foxnews':         { score:  3, label: 'Right',        color: '#ef4444', name: 'Fox News' },
  'nypost':          { score:  2, label: 'Right',        color: '#f87171', name: 'New York Post' },
  'breitbart':       { score:  4, label: 'Far Right',    color: '#dc2626', name: 'Breitbart News' },
  'washingtontimes': { score:  2, label: 'Right',        color: '#f87171', name: 'Washington Times' },
  'dailycaller':     { score:  3, label: 'Right',        color: '#ef4444', name: 'The Daily Caller' },
};
function getBias(sourceId) {
  if (!sourceId) return { score: 0, label: 'Neutral', color: '#a78bfa', name: 'Unknown' };
  const id = sourceId.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (MEDIA_BIAS[id]) return MEDIA_BIAS[id];
  for (const [k, v] of Object.entries(MEDIA_BIAS)) {
    if (id.includes(k) || k.includes(id)) return v;
  }
  return { score: 0, label: 'Neutral', color: '#a78bfa', name: sourceId };
}

// ── RSS fetch helpers (minimal set needed here) ───────────────────────────────
function extractXMLTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  const cdata = m[1].trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1].trim() : m[1].trim();
}
function extractRSSLink(xml) {
  return (xml.match(/<link[^>]+href=["']([^"']+)["']/i) ||
          xml.match(/<link>([^<]+)<\/link>/i) || [])[1]?.trim() || '';
}
function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function fetchRSSFiltered(source, keywords, timeoutMs = 4000) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), timeoutMs);
    const res  = await fetch(source.url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'Perspectiv/1.0 RSS Reader' },
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const xml   = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < 20) {
      const chunk = m[1] || m[2];
      const title = stripHtml(extractXMLTag(chunk, 'title'));
      const link  = extractRSSLink(chunk);
      if (!title || !link) continue;
      const desc  = stripHtml(
        extractXMLTag(chunk, 'description') ||
        extractXMLTag(chunk, 'summary')     ||
        extractXMLTag(chunk, 'content')
      ) || title;

      // Only keep articles that match at least one keyword
      if (scoreText(`${title} ${desc}`, keywords) === 0) continue;

      items.push({
        title,
        description: desc,
        source:      source.name,
        url:         link,
        bias:        { score: source.score, label: source.label, color: source.color },
      });
    }
    return items;
  } catch { return []; }
}

// ── NewsData.io search ────────────────────────────────────────────────────────
async function fetchNewsDataSearch(query, apiKey) {
  try {
    const q   = encodeURIComponent(query.slice(0, 100));
    const url = `https://newsdata.io/api/1/search?apikey=${apiKey}&q=${q}&language=en&size=10`;
    const data = await fetch(url).then(r => r.json());
    if (data.status !== 'success') return [];
    return (data.results || []).filter(a => a.title && a.description).map(a => {
      const bias = getBias(a.source_id);
      return {
        title:       a.title,
        description: a.description || '',
        source:      bias.name !== 'Unknown' ? bias.name : (a.source_id || 'Unknown'),
        url:         a.link || '',
        bias:        { score: bias.score, label: bias.label, color: bias.color },
      };
    });
  } catch { return []; }
}

// ── GNews search ──────────────────────────────────────────────────────────────
async function fetchGNewsSearch(query, apiKey) {
  try {
    const q   = encodeURIComponent(query.slice(0, 100));
    const url = `https://gnews.io/api/v4/search?q=${q}&token=${apiKey}&lang=en&max=10`;
    const data = await fetch(url).then(r => r.json());
    if (!data.articles) return [];
    return data.articles.filter(a => a.title && a.description).map(a => {
      const bias = getBias(a.source?.name || '');
      return {
        title:       a.title,
        description: a.description || '',
        source:      bias.name !== 'Unknown' ? bias.name : (a.source?.name || 'Unknown'),
        url:         a.url || '',
        bias:        { score: bias.score, label: bias.label, color: bias.color },
      };
    });
  } catch { return []; }
}

// ── Redis cached-topic search ─────────────────────────────────────────────────
async function searchRedisTopics(keywords) {
  try {
    const topics = await redis.get(TOPICS_KEY);
    if (!Array.isArray(topics) || !topics.length) return [];

    // Score each topic by keyword overlap with title + summary + article titles
    const scored = topics.map(topic => {
      const searchText = [
        topic.title || '',
        topic.summary || '',
        ...(topic.articles || []).map(a => a.title || ''),
      ].join(' ');
      return { topic, score: scoreText(searchText, keywords) };
    }).filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // top 5 matching topics

    // Collect articles from matching topics
    const articles = [];
    for (const { topic } of scored) {
      for (const art of (topic.articles || [])) {
        // Only include article if it also has some keyword overlap (or topic scored high)
        articles.push({
          title:       art.title || '',
          description: art.description || '',
          source:      art.source || 'Unknown',
          url:         art.url || '',
          bias:        art.bias || { score: 0, label: 'Neutral', color: '#a78bfa' },
        });
      }
    }
    return articles;
  } catch { return []; }
}

// ── Pexels photo ──────────────────────────────────────────────────────────────
async function fetchPexelsPhoto(query) {
  const key = process.env.PEXELS_KEY;
  if (!key) return null;
  try {
    const q   = encodeURIComponent(query.slice(0, 80));
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${q}&per_page=3&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.photos?.[0]?.src?.large2x || data.photos?.[0]?.src?.large || null;
  } catch { return null; }
}

// ── Deduplicate articles by URL then fuzzy-title ──────────────────────────────
function dedupeArticles(articles) {
  const urlSeen   = new Set();
  const titleSeen = [];
  const STOP_DUP  = new Set(['the','a','an','in','on','at','to','of','and','or','is']);
  const titleWords = (t) => new Set(
    t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_DUP.has(w))
  );
  const titleSim = (a, b) => {
    const sa = titleWords(a), sb = titleWords(b);
    const i  = [...sa].filter(w => sb.has(w)).length;
    const u  = new Set([...sa, ...sb]).size;
    return u === 0 ? 0 : i / u;
  };

  return articles.filter(a => {
    if (!a.title) return false;
    if (a.url && urlSeen.has(a.url)) return false;
    if (a.url) urlSeen.add(a.url);
    if (titleSeen.some(t => titleSim(t, a.title) > 0.6)) return false;
    titleSeen.push(a.title);
    return true;
  });
}

// ── Generate one take — real sources when available ───────────────────────────
async function generateOneTake(client, topic, meta, language) {
  try {
    const { prompt, derivedSources } = buildPrompt(topic, meta, language);
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    });
    const text  = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    const parsed = JSON.parse(match[0]);
    if (!parsed.take?.text) throw new Error('No take text');

    // Use real derived sources if available; fall back to AI Analysis label
    const sources = derivedSources?.length
      ? derivedSources
      : [{ name: 'AI Analysis — perspectives generated by Claude', framing: null, url: null }];

    return { ...parsed.take, color: meta.color, sources };
  } catch {
    return {
      position: meta.position,
      label:    meta.label,
      text:     `A ${meta.label.toLowerCase()} perspective on this topic.`,
      color:    meta.color,
      sources:  [{ name: 'AI Analysis — perspectives generated by Claude', framing: null, url: null }],
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { query, language = 'English' } = req.body || {};
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  const cleanQuery = query.trim().slice(0, 200);
  const keywords   = extractKeywords(cleanQuery);

  // ── RSS subset: bias-spanning feeds, filtered by keywords ────────────────────
  const RSS_SUBSET = [
    { name: 'CNN',        url: 'http://rss.cnn.com/rss/cnn_topstories.rss',                  score: -2, label: 'Left',         color: '#3b82f6' },
    { name: 'NPR',        url: 'https://feeds.npr.org/1001/rss.xml',                         score: -1, label: 'Center-Left',  color: '#60a5fa' },
    { name: 'BBC News',   url: 'http://feeds.bbci.co.uk/news/rss.xml',                       score:  0, label: 'Neutral',      color: '#a78bfa' },
    { name: 'AP News',    url: 'https://feeds.apnews.com/rss/topnews',                       score:  0, label: 'Neutral',      color: '#a78bfa' },
    { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/topNews',                  score:  0, label: 'Neutral',      color: '#a78bfa' },
    { name: 'Fox News',   url: 'https://moxie.foxnews.com/google-publisher/latest.xml',      score:  3, label: 'Right',        color: '#ef4444' },
    { name: 'NY Post',    url: 'https://nypost.com/feed/',                                   score:  2, label: 'Right',        color: '#f87171' },
    { name: 'The Hill',   url: 'https://thehill.com/feed',                                   score:  0, label: 'Neutral',      color: '#a78bfa' },
  ];

  // ── Fire all source searches + photo in parallel ──────────────────────────────
  const [
    photoUrl,
    redisArticles,
    newsdataArticles,
    gnewsArticles,
    ...rssResults
  ] = await Promise.all([
    fetchPexelsPhoto(cleanQuery),
    searchRedisTopics(keywords),
    process.env.NEWSDATA_API_KEY ? fetchNewsDataSearch(cleanQuery, process.env.NEWSDATA_API_KEY) : [],
    process.env.GNEWS_API_KEY    ? fetchGNewsSearch(cleanQuery, process.env.GNEWS_API_KEY)       : [],
    ...RSS_SUBSET.map(src => fetchRSSFiltered(src, keywords, 4000)),
  ]);

  // ── Pool, deduplicate, sort by recency-of-fetch ───────────────────────────────
  const rssArticles = rssResults.flat();
  const allArticles = dedupeArticles([
    ...newsdataArticles,  // search APIs first (most relevant)
    ...gnewsArticles,
    ...redisArticles,     // cached topics next
    ...rssArticles,       // RSS last (keyword-filtered)
  ]);

  console.log(`ask-topic: "${cleanQuery}" — ${allArticles.length} articles (newsdata:${newsdataArticles.length} gnews:${gnewsArticles.length} redis:${redisArticles.length} rss:${rssArticles.length})`);

  // ── Build synthetic topic — same shape as feed topics ────────────────────────
  const topic = {
    id:                `ask_${Date.now()}`,
    title:             cleanQuery,
    latestPublishedAt: new Date().toISOString(),
    urlToImage:        photoUrl,
    category:          'World', // triggers full 7-perspective mode
    summary:           null,
    articles:          allArticles.slice(0, 20), // cap at 20 for prompt size
    perspectiveMode:   'full',
    biasCounts: {
      left:   allArticles.filter(a => a.bias.score <= -1).length,
      center: allArticles.filter(a => a.bias.score === 0).length,
      right:  allArticles.filter(a => a.bias.score >= 1).length,
    },
    sourceTiers: null,
    isAskTopic:  true,
  };

  // ── Generate all 7 takes in parallel ─────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const takes  = await Promise.all(
    TAKE_POSITIONS.map(meta => generateOneTake(client, topic, meta, language))
  );

  const takesMap = {};
  for (const take of takes) takesMap[take.position] = take;

  return res.json({ topic, takes: takesMap, articleCount: allArticles.length });
}
