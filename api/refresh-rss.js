/**
 * /api/refresh-rss
 *
 * Runs every 4 hours via Vercel cron ("0 *\/4 * * *").
 * Fetches RSS + ESPN articles and merges them into the existing Redis topic
 * cache so articles stay fresh between the daily 6 AM full refresh.
 *
 * Does NOT trigger pregeneration — takes are generated on-demand for
 * any new topics that appear here and cached immediately for subsequent users.
 */

import { redis } from '../lib/redis.js';

// ── Must match CACHE_VERSION in clustered-news.js ─────────────────────────────
const TOPICS_CACHE_KEY = 'sn:topics:v9';
const TOPICS_TS_KEY    = 'sn:topics:ts:v9';

// ── Title-similarity helpers (mirrors clustered-news.js) ──────────────────────
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

// ── RSS sources (mirrors clustered-news.js) ───────────────────────────────────
const RSS_SOURCES = [
  { name: 'MSNBC',               url: 'http://www.msnbc.com/feeds/latest',                               score: -3, label: 'Far Left',    color: '#2563eb' },
  { name: 'Mother Jones',        url: 'https://www.motherjones.com/feed/',                               score: -3, label: 'Far Left',    color: '#2563eb' },
  { name: 'CNN',                 url: 'http://rss.cnn.com/rss/cnn_topstories.rss',                       score: -2, label: 'Left',        color: '#3b82f6' },
  { name: 'Slate',               url: 'https://slate.com/feeds/all.rss',                                 score: -2, label: 'Left',        color: '#3b82f6' },
  { name: 'NPR',                 url: 'https://feeds.npr.org/1001/rss.xml',                              score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The Atlantic',        url: 'https://feeds.feedburner.com/TheAtlantic',                        score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'Washington Post',     url: 'https://feeds.washingtonpost.com/rss/national',                   score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The New York Times',  url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',       score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'NBC News',            url: 'https://feeds.nbcnews.com/nbcnews/public/news',                   score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'ABC News',            url: 'https://feeds.abcnews.com/abcnews/topstories',                    score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'BBC',                 url: 'http://feeds.bbci.co.uk/news/rss.xml',                            score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'AP News',             url: 'https://feeds.apnews.com/rss/topnews',                            score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Reuters',             url: 'https://feeds.reuters.com/reuters/topNews',                       score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Axios',               url: 'https://api.axios.com/feed/',                                     score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Politico',            url: 'https://www.politico.com/rss/politicopicks.xml',                  score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'The Hill',            url: 'https://thehill.com/feed',                                        score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.wsj.com/rss/RSSWorldNews',                       score:  1, label: 'Center-Right', color: '#fb923c' },
  { name: 'New York Post',       url: 'https://nypost.com/feed/',                                        score:  2, label: 'Right',       color: '#ef4444' },
  { name: 'Fox News',            url: 'https://moxie.foxnews.com/google-publisher/latest.xml',           score:  2, label: 'Right',       color: '#ef4444' },
  { name: 'The Federalist',      url: 'https://thefederalist.com/feed/',                                 score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Daily Wire',          url: 'https://www.dailywire.com/feeds/rss.xml',                         score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Breitbart',           url: 'https://feeds.feedburner.com/breitbart',                          score:  3, label: 'Far Right',   color: '#dc2626' },
];

// ── RSS helpers (mirrors clustered-news.js) ───────────────────────────────────
function extractXMLTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  const raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1].trim() : raw;
}

function extractRSSLink(itemXml) {
  const atom = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1];
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

const SMALL_IMAGE_RE = /thumb|thumbnail|icon|logo|avatar|16x9_120|16x9_240|_50x|_100x|_120x|_150x|_200x|width=1[0-9]{2}&|w=1[0-9]{2}&/i;
function isLargeEnough(u) { return u && !SMALL_IMAGE_RE.test(u); }

function extractRSSImage(itemXml) {
  let m, url;
  // og:image first — usually the full-size article hero
  m = itemXml.match(/<og:image[^>]*>([^<]+)<\/og:image>/i);
  if (m && (url = validImageUrl(m[1])) && isLargeEnough(url)) return url;
  // media:content — prefer ones with a width attribute >= 400
  const mcMatches = [...itemXml.matchAll(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/gi)];
  for (const mc of mcMatches) {
    const wm = mc[0].match(/width=["']?(\d+)/i);
    const w = wm ? parseInt(wm[1], 10) : 9999;
    if (w >= 400 && (url = validImageUrl(mc[1])) && isLargeEnough(url)) return url;
  }
  // enclosure image
  m = itemXml.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]+url=["']([^"']+)["']/i)
    || itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']*["']/i);
  if (m && (url = validImageUrl(m[1])) && isLargeEnough(url)) return url;
  // content:encoded inline img — often a large image
  const rawCE = extractXMLTag(itemXml, 'content:encoded') || '';
  m = decodeEntities(rawCE).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1])) && isLargeEnough(url)) return url;
  // fallback: any media:content or media:thumbnail
  m = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;
  m = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (m && (url = validImageUrl(m[1]))) return url;
  return null;
}

async function fetchRSS({ name, url, score, label, color }, max = 15) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Perspectiv/1.0 RSS Reader' },
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
    return items;
  } catch (err) {
    console.warn(`RSS [${name}]: ${err.message}`);
    return [];
  }
}

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

// ── Merge articles into existing topics ───────────────────────────────────────
// Match threshold: 0.35 Jaccard on normalized title words.
// We do NOT update latestPublishedAt so pre-generated take cache keys stay valid.
const MATCH_THRESHOLD = 0.35;

function mergeArticlesIntoTopics(topics, freshArticles) {
  const seenUrls = new Set(topics.flatMap(t => (t.articles || []).map(a => a.url)));
  let added   = 0;
  let matched = 0;

  for (const article of freshArticles) {
    if (!article.url || seenUrls.has(article.url)) continue;

    // Find best-matching existing topic
    let bestTopic = null;
    let bestScore = 0;
    for (const topic of topics) {
      const sim = titleSimilarity(article.title, topic.title);
      if (sim > bestScore) { bestScore = sim; bestTopic = topic; }
    }

    if (bestTopic && bestScore >= MATCH_THRESHOLD) {
      bestTopic.articles = bestTopic.articles || [];
      bestTopic.articles.push(article);
      seenUrls.add(article.url);
      added++;
      matched++;
    }
    // Unmatched articles are not added — new full topics only form at the daily 6 AM refresh
  }

  return { topics, added, matched };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Load existing topics from Redis
    const existing = await redis.get(TOPICS_CACHE_KEY);
    if (!existing || !Array.isArray(existing) || existing.length === 0) {
      console.log('refresh-rss: no topics in Redis yet, skipping');
      return res.json({ ok: false, message: 'No topics cached yet — run /api/clustered-news first', skipped: true });
    }
    const topics = existing;
    console.log(`refresh-rss: loaded ${topics.length} existing topics`);

    // 2. Fetch fresh RSS + ESPN articles in parallel
    const rssResults = await Promise.allSettled([
      ...RSS_SOURCES.map(src => fetchRSS(src)),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/news'),
    ]);

    const freshArticles = rssResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
    console.log(`refresh-rss: fetched ${freshArticles.length} fresh RSS/ESPN articles`);

    // 3. Merge articles into existing topics (no pregeneration, take keys unchanged)
    const { topics: updatedTopics, added, matched } = mergeArticlesIntoTopics(topics, freshArticles);

    // 4. Write updated topics back to Redis with a fresh 4-hour TTL
    //    (preserves existing takes — same latestPublishedAt on each topic)
    await redis.set(TOPICS_CACHE_KEY, updatedTopics, { ex: 14400 }); // 4 hours
    await redis.set(TOPICS_TS_KEY, new Date().toISOString());

    console.log(`refresh-rss: merged ${added} new articles into ${matched} topics`);
    return res.json({
      ok:            true,
      existingTopics: topics.length,
      freshArticles:  freshArticles.length,
      articlesAdded:  added,
      topicsUpdated:  matched,
      nextRefresh:    '4 hours',
    });

  } catch (err) {
    console.error('refresh-rss error:', err);
    return res.json({ ok: false, message: err.message || 'RSS refresh failed' });
  }
}
