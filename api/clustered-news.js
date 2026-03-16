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

// ── RSS feed sources — no API key required ────────────────────────────────────
// score: -3=Far Left, -2=Left, -1=Center-Left, 0=Center, 1=Center-Right, 2=Right, 3=Far Right
const RSS_SOURCES = [
  // Far Left
  { name: 'MSNBC',               url: 'http://www.msnbc.com/feeds/latest',                               score: -3, label: 'Far Left',    color: '#2563eb' },
  { name: 'Mother Jones',        url: 'https://www.motherjones.com/feed/',                               score: -3, label: 'Far Left',    color: '#2563eb' },
  // Left
  { name: 'CNN',                 url: 'http://rss.cnn.com/rss/cnn_topstories.rss',                       score: -2, label: 'Left',        color: '#3b82f6' },
  { name: 'Slate',               url: 'https://slate.com/feeds/all.rss',                                 score: -2, label: 'Left',        color: '#3b82f6' },
  // Center-Left
  { name: 'NPR',                 url: 'https://feeds.npr.org/1001/rss.xml',                              score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The Atlantic',        url: 'https://feeds.feedburner.com/TheAtlantic',                        score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'Washington Post',     url: 'https://feeds.washingtonpost.com/rss/national',                   score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The New York Times',  url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',       score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'NBC News',            url: 'https://feeds.nbcnews.com/nbcnews/public/news',                   score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'ABC News',            url: 'https://feeds.abcnews.com/abcnews/topstories',                    score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'BBC',                 url: 'http://feeds.bbci.co.uk/news/rss.xml',                            score: -1, label: 'Center-Left', color: '#60a5fa' },
  // Center
  { name: 'AP News',             url: 'https://feeds.apnews.com/rss/topnews',                            score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Reuters',             url: 'https://feeds.reuters.com/reuters/topNews',                       score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Axios',               url: 'https://api.axios.com/feed/',                                     score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Politico',            url: 'https://www.politico.com/rss/politicopicks.xml',                  score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'The Hill',            url: 'https://thehill.com/feed',                                        score:  0, label: 'Center',      color: '#a78bfa' },
  // Center-Right
  { name: 'Wall Street Journal', url: 'https://feeds.a.wsj.com/rss/RSSWorldNews',                       score:  1, label: 'Center-Right', color: '#fb923c' },
  // Right
  { name: 'New York Post',       url: 'https://nypost.com/feed/',                                        score:  2, label: 'Right',       color: '#ef4444' },
  { name: 'Fox News',            url: 'https://moxie.foxnews.com/google-publisher/latest.xml',           score:  2, label: 'Right',       color: '#ef4444' },
  // Far Right
  { name: 'The Federalist',      url: 'https://thefederalist.com/feed/',                                 score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Daily Wire',          url: 'https://www.dailywire.com/feeds/rss.xml',                         score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Breitbart',           url: 'https://feeds.feedburner.com/breitbart',                          score:  3, label: 'Far Right',   color: '#dc2626' },
];

// ── Module-level cache ────────────────────────────────────────────────────────
let cachedTopics = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000;

// ── Cache version — bump to auto-invalidate stale Redis data ─────────────────
const CACHE_VERSION = 'v9';

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

// ── RSS helpers ───────────────────────────────────────────────────────────────
function extractXMLTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  const raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1].trim() : raw;
}

function extractRSSLink(itemXml) {
  // Atom: <link href="url"/>
  const atom = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  // RSS 2.0: <link>url</link>
  const rss = itemXml.match(/<link>([^<]+)<\/link>/i);
  if (rss) return rss[1].trim();
  return '';
}

function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function validImageUrl(raw) {
  if (!raw) return null;
  const url = decodeEntities(raw.trim());
  return url.startsWith('http') ? url : null;
}

function extractRSSImage(itemXml) {
  let m, url;

  // 1. <media:content url="..."> — covers Fox, NYT, CNN (may be inside <media:group>)
  m = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  // 2. <media:thumbnail url="...">
  m = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  // 3. <enclosure type="image/..."> — both attribute orderings
  m = itemXml.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]+url=["']([^"']+)["']/i)
    || itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']*["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  // 4. <og:image> tag
  m = itemXml.match(/<og:image[^>]*>([^<]+)<\/og:image>/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  // 5. <img src="..."> inside description (decode HTML entities in content first)
  const rawDesc = extractXMLTag(itemXml, 'description') || '';
  const decodedDesc = decodeEntities(rawDesc);
  m = decodedDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  // 6. <img src="..."> inside content:encoded (HTML-encoded in many feeds)
  const rawCE = extractXMLTag(itemXml, 'content:encoded') || '';
  const decodedCE = decodeEntities(rawCE);
  m = decodedCE.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;

  return null;
}

// ── Static fallback images per category (Unsplash, no API key needed) ────────
const CATEGORY_FALLBACK_IMAGES = {
  'US Politics':       'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&auto=format&fit=crop',
  'World':             'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop',
  'Economy':           'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop',
  'National Security': 'https://images.unsplash.com/photo-1562408590-e32931084e23?w=800&auto=format&fit=crop',
  'Health':            'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=800&auto=format&fit=crop',
  'Technology':        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop',
  'Sports & Culture':  'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop',
  'Entertainment':     'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&auto=format&fit=crop',
  'Elections':         'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&auto=format&fit=crop',
  'Policy':            'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop',
};

async function fetchRSS({ name, url, score, label, color }, max = 15) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SwipeNews/1.0 RSS Reader' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`RSS [${name}]: HTTP ${res.status}`);
      return [];
    }

    const xml   = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < max) {
      const chunk = m[1] || m[2];
      const title = stripHtml(extractXMLTag(chunk, 'title'));
      const link  = extractRSSLink(chunk);
      if (!title || !link) continue;

      const desc     = stripHtml(
        extractXMLTag(chunk, 'description') ||
        extractXMLTag(chunk, 'summary')     ||
        extractXMLTag(chunk, 'content')
      ) || title;
      const pubRaw   = extractXMLTag(chunk, 'pubDate')   ||
                       extractXMLTag(chunk, 'published') ||
                       extractXMLTag(chunk, 'updated');
      let publishedAt = null;
      try { if (pubRaw) publishedAt = new Date(pubRaw).toISOString(); } catch { /* ignore */ }

      items.push({
        title, description: desc, source: name, url: link,
        urlToImage:  extractRSSImage(chunk),
        publishedAt,
        bias:        { score, label, color },
        fetchCategory: null,
      });
    }
    console.log(`RSS [${name}]: ${items.length} articles`);
    return items;
  } catch (err) {
    console.warn(`RSS [${name}]: ${err.message}`);
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
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"US Politics|World|Policy|Economy|National Security|Elections|Technology|Health|Sports & Culture|Entertainment","articleIndices":[0,1,2,3]}]}

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
- Sports & Culture: exactly 3-5 topics (live sports only)
- Entertainment: 2-4 topics (movies, TV, awards, celebrity, music)
- TOTAL TARGET: 40-52 topics

CATEGORY DEFINITIONS — assign each article to EXACTLY ONE:
  - US Politics: domestic government, Congress, White House, political conflicts, political figures
  - World: international news, foreign governments, geopolitics, foreign affairs
  - Policy: legislation, regulations, climate/environment law, domestic policy debates, new laws
  - Economy: markets, jobs, trade, inflation, tariffs, corporate earnings, economic data
  - National Security: military operations, intelligence, terrorism, border security, defense spending
  - Elections: campaigns, voting rights, candidates, polling, electoral politics, election results
  - Technology: tech companies, AI/ML, software, hardware, science breakthroughs, space, cybersecurity
  - Health: public health, medicine, FDA approvals, healthcare policy, disease, drugs
  - Sports & Culture: ONLY live sports — games, scores, trades, athlete news, team standings, leagues, championships. DO NOT assign Oscars, awards shows, movies, TV, music, or celebrity news here.
  - Entertainment: Oscars, film, TV shows, streaming, celebrity news, music, awards shows, pop culture, cultural events. NOT sports.

ASSIGNMENT RULES:
- Use [fetchCategory hints] shown in brackets when available — they are reliable signals
- If an article mentions BOTH sports AND entertainment, prefer the dominant angle
- Neutral factual titles only — no editorial spin
- Each topic needs at least 1 article; single-article topics are fine for hard news
- Do NOT over-merge — keep related but distinct stories separate
- Merge only near-identical duplicate stories
- For hard news: include anything that belongs on the front page of NYT, WSJ, or BBC
- For sports: pick the 3-5 most significant games/events. Do NOT list every single game.
- For entertainment: group by film/show/event, not by individual celebrity

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
      // ── RSS — no API key required ─────────────────────────────────────────────
      ...RSS_SOURCES.map(src => fetchRSS(src)),
    ]);

    const BATCH_LABELS = [
      'ND:left_a','ND:left_b','ND:center','ND:right',
      'ND:politics','ND:business','ND:tech','ND:health','ND:sports','ND:world',
      'ND:crime','ND:top','ND:intl_politics',
      ...(gnewsKey ? ['GN:nation','GN:world','GN:business','GN:tech','GN:health','GN:sports'] : []),
      'ESPN:nfl','ESPN:nba','ESPN:mlb','ESPN:nhl','ESPN:soccer',
      ...RSS_SOURCES.map(src => `RSS:${src.name}`),
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

        // ── Bias distribution — stored per topic for transparency & ranking ────
        const biasCounts = { left: 0, center: 0, right: 0 };
        articles.forEach(a => {
          if      (a.bias.score <= -1) biasCounts.left++;
          else if (a.bias.score >=  1) biasCounts.right++;
          else                         biasCounts.center++;
        });

        const img         = articles.find(a => a.urlToImage);
        const fallbackImg = CATEGORY_FALLBACK_IMAGES[cluster.category] || null;
        const finalImage  = img?.urlToImage || fallbackImg;
        if (!img?.urlToImage && fallbackImg) {
          console.log(`IMAGE FALLBACK [${cluster.category}]: "${cluster.title?.slice(0, 40)}"`);
        } else if (!finalImage) {
          console.log(`IMAGE MISSING [${cluster.category}]: "${cluster.title?.slice(0, 40)}" — no article image and no fallback`);
        }

        return {
          id:                `topic-${i}`,
          title:             cluster.title    || 'Untitled Story',
          summary:           cluster.summary  || '',
          category:          cluster.category || 'US Politics',
          urlToImage:        finalImage,
          latestPublishedAt,
          perspectiveMode,
          biasCounts,
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

    // Sort topics by recency + bias spread bonus
    // Cross-spectrum coverage (both left & right sources) boosts a topic as if
    // it were 2h newer per cross-spectrum source pair — keeps trending relevant
    // while surfacing stories that the full spectrum is covering.
    topics.sort((a, b) => {
      const aMs = a.latestPublishedAt ? new Date(a.latestPublishedAt).getTime() : 0;
      const bMs = b.latestPublishedAt ? new Date(b.latestPublishedAt).getTime() : 0;
      // Spread = number of matched left+right source pairs (min of each side)
      const aSpread = Math.min(a.biasCounts?.left || 0, a.biasCounts?.right || 0);
      const bSpread = Math.min(b.biasCounts?.left || 0, b.biasCounts?.right || 0);
      // Each spread pair = 2h boost (in ms)
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      const aScore = aMs + aSpread * TWO_HOURS_MS;
      const bScore = bMs + bSpread * TWO_HOURS_MS;
      if (bScore !== aScore) return bScore - aScore;
      // Tiebreak: undated last
      if (!a.latestPublishedAt) return 1;
      if (!b.latestPublishedAt) return -1;
      return 0;
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
