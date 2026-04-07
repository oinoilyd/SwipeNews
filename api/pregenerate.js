// /api/pregenerate — full pipeline: fetch articles → cluster → build topic
// shells → save to Redis → pregenerate neutral takes for all topics.
//
// Triggered by:
//   1. Vercel cron at 6am daily ("0 6 * * *" in vercel.json)
//   2. Fire-and-forget from /api/clustered-news on cache miss
//
// RSS-only refresh (every 4h) runs separately in /api/refresh-rss and does
// NOT trigger pregeneration — takes are cached on-demand between 6am cycles.
export const maxDuration = 60; // Vercel hobby plan max (seconds)

import Anthropic from '@anthropic-ai/sdk';
import { redis, takeKey } from '../lib/redis.js';
import { TAKE_POSITIONS, isWeakTake, buildPrompt } from '../lib/perspectives.js';

// Positions to generate per category
function getPerspectivePositions(category) {
  if (['Sports & Culture', 'Technology', 'Entertainment'].includes(category)) {
    return [-2, 0, 2]; // 3 perspectives
  }
  return [-3, -2, -1, 0, 1, 2, 3]; // 7 political perspectives
}

async function batch(items, fn, concurrency = 10) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    results.push(...await Promise.all(slice.map(fn)));
  }
  return results;
}

async function generateTake(client, topic, meta) {
  const { prompt, singleSource, derivedSources } = buildPrompt(topic, meta);

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text  = msg.content[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(match[0]);
  if (!parsed.take) throw new Error('No take in response');

  const take = { ...parsed.take, color: meta.color, sources: derivedSources };
  if (singleSource) take.singleSource = true;
  return take;
}

// ── Cache keys — must match clustered-news.js and refresh-rss.js ─────────────
const CACHE_VERSION = 'v9';
const TOPICS_KEY    = `sn:topics:${CACHE_VERSION}`;
const TOPICS_TS_KEY = `sn:topics:ts:${CACHE_VERSION}`;
// Takes TTL: 26h — GitHub Actions runs every 6h, 26h = 4-cycle safety buffer
const TAKES_TTL_S   = 26 * 60 * 60;
// Topics TTL: 25h — survives a full missed day of crons without going empty
const TOPICS_TTL_S  = 25 * 60 * 60;
const WARM_TS_KEY   = 'sn:takes:warmed-at';

// ── Article fetch helpers (moved from clustered-news.js) ──────────────────────
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
  if (MEDIA_BIAS[id]) return MEDIA_BIAS[id];
  for (const [k, v] of Object.entries(MEDIA_BIAS)) { if (id.includes(k) || k.includes(id)) return v; }
  for (const v of Object.values(MEDIA_BIAS)) {
    const n = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n.includes(id) || id.includes(n)) return v;
  }
  return { score: 0, label: 'Unknown', color: '#6b7280', name: sourceId };
}
const DOMAIN_GROUPS = {
  left_a: 'edition.cnn.com,msnbc.com,theguardian.com,nbcnews.com,cbsnews.com',
  left_b: 'nytimes.com,washingtonpost.com,npr.org',
  center: 'reuters.com,apnews.com,bbc.com,thehill.com,axios.com',
  right:  'foxnews.com,nypost.com,breitbart.com,washingtontimes.com',
};
const RSS_SOURCES = [
  { name: 'MSNBC',               url: 'http://www.msnbc.com/feeds/latest',                         score: -3, label: 'Far Left',    color: '#2563eb' },
  { name: 'Mother Jones',        url: 'https://www.motherjones.com/feed/',                         score: -3, label: 'Far Left',    color: '#2563eb' },
  { name: 'CNN',                 url: 'http://rss.cnn.com/rss/cnn_topstories.rss',                 score: -2, label: 'Left',        color: '#3b82f6' },
  { name: 'Slate',               url: 'https://slate.com/feeds/all.rss',                           score: -2, label: 'Left',        color: '#3b82f6' },
  { name: 'NPR',                 url: 'https://feeds.npr.org/1001/rss.xml',                        score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The Atlantic',        url: 'https://feeds.feedburner.com/TheAtlantic',                  score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'Washington Post',     url: 'https://feeds.washingtonpost.com/rss/national',             score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'The New York Times',  url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'NBC News',            url: 'https://feeds.nbcnews.com/nbcnews/public/news',             score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'ABC News',            url: 'https://feeds.abcnews.com/abcnews/topstories',              score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'BBC',                 url: 'http://feeds.bbci.co.uk/news/rss.xml',                      score: -1, label: 'Center-Left', color: '#60a5fa' },
  { name: 'AP News',             url: 'https://feeds.apnews.com/rss/topnews',                      score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Reuters',             url: 'https://feeds.reuters.com/reuters/topNews',                 score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Axios',               url: 'https://api.axios.com/feed/',                               score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Politico',            url: 'https://www.politico.com/rss/politicopicks.xml',            score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'The Hill',            url: 'https://thehill.com/feed',                                  score:  0, label: 'Center',      color: '#a78bfa' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.wsj.com/rss/RSSWorldNews',                 score:  1, label: 'Center-Right', color: '#fb923c' },
  { name: 'New York Post',       url: 'https://nypost.com/feed/',                                  score:  2, label: 'Right',       color: '#ef4444' },
  { name: 'Fox News',            url: 'https://moxie.foxnews.com/google-publisher/latest.xml',    score:  2, label: 'Right',       color: '#ef4444' },
  { name: 'The Federalist',      url: 'https://thefederalist.com/feed/',                          score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Daily Wire',          url: 'https://www.dailywire.com/feeds/rss.xml',                  score:  3, label: 'Far Right',   color: '#dc2626' },
  { name: 'Breitbart',           url: 'https://feeds.feedburner.com/breitbart',                   score:  3, label: 'Far Right',   color: '#dc2626' },
];
// Pexels fallback image queries per category — fetched dynamically at runtime
const CATEGORY_PEXELS_QUERIES = {
  'US Politics':       'united states capitol congress washington',
  'World':             'world globe earth international',
  'Economy':           'stock market economy finance wall street',
  'National Security': 'military security defense soldier',
  'Health':            'healthcare medical hospital doctor',
  'Technology':        'technology computer digital innovation',
  'Sports & Culture':  'sports stadium athlete competition',
  'Entertainment':     'entertainment cinema film concert',
  'Elections':         'election voting ballot democracy',
  'Policy':            'government law policy capitol',
};

async function fetchPexelsPhoto(query) {
  const key = process.env.PEXELS_KEY;
  if (!key) return null;
  try {
    const q = encodeURIComponent(query.slice(0, 80));
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${q}&per_page=3&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.photos?.[0]?.src?.large2x || data.photos?.[0]?.src?.large || null;
  } catch { return null; }
}

const STOP_WORDS = new Set(['the','a','an','in','on','at','to','for','of','and','or','is','are','was','as','by','with','that','this','its','it','be','has','had','have','will','from','but','not','were']);
function titleWords(t) { return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))); }
function titleSim(a, b) { const sa=titleWords(a), sb=titleWords(b); const i=[...sa].filter(w=>sb.has(w)).length, u=new Set([...sa,...sb]).size; return u===0?0:i/u; }

function extractXMLTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  const cdata = m[1].trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1].trim() : m[1].trim();
}
function extractRSSLink(xml) {
  return (xml.match(/<link[^>]+href=["']([^"']+)["']/i) || xml.match(/<link>([^<]+)<\/link>/i) || [])[1]?.trim() || '';
}
function stripHtml(s) { return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }
function decodeEntities(s) { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function validImg(raw) { if (!raw) return null; const u=decodeEntities(raw.trim()); return u.startsWith('http')?u:null; }
const SMALL_IMG_RE = /thumb|thumbnail|icon|logo|avatar|16x9_120|16x9_240|_50x|_100x|_120x|_150x|_200x|width=1[0-9]{2}&|w=1[0-9]{2}&/i;
function isLargeImg(u) { return u && !SMALL_IMG_RE.test(u); }
function extractRSSImage(xml) {
  let m, u;
  // og:image first — full-size article hero
  if ((m=xml.match(/<og:image[^>]*>([^<]+)<\/og:image>/i)) && (u=validImg(m[1])) && isLargeImg(u)) return u;
  // media:content — prefer width >= 400
  const mcAll=[...xml.matchAll(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/gi)];
  for (const mc of mcAll) { const wm=mc[0].match(/width=["']?(\d+)/i); const w=wm?parseInt(wm[1],10):9999; if (w>=400&&(u=validImg(mc[1]))&&isLargeImg(u)) return u; }
  // enclosure
  m=xml.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]+url=["']([^"']+)["']/i)||xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']*["']/i);
  if (m&&(u=validImg(m[1]))&&isLargeImg(u)) return u;
  // content:encoded inline img
  const ce=decodeEntities(extractXMLTag(xml,'content:encoded')||'');
  if ((m=ce.match(/<img[^>]+src=["']([^"']+)["']/i))&&(u=validImg(m[1]))&&isLargeImg(u)) return u;
  // fallback: any media:content or thumbnail
  if ((m=xml.match(/<media:content[^>]+url=["']([^"']+)["']/i))&&(u=validImg(m[1]))) return u;
  if ((m=xml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i))&&(u=validImg(m[1]))) return u;
  return null;
}

async function fetchArticles(url, tagCategory=null) {
  try {
    const data = await fetch(url).then(r=>r.json());
    if (data.status !== 'success') return [];
    return (data.results||[]).filter(a=>a.title&&a.description).map(a => {
      const bias=getBias(a.source_id);
      return { title:a.title, description:a.description||'', source:bias.name||a.source_id||'Unknown', url:a.link, urlToImage:a.image_url||null, publishedAt:a.pubDate?a.pubDate.replace(' ','T')+'Z':null, bias:{score:bias.score,label:bias.label,color:bias.color}, fetchCategory:tagCategory };
    });
  } catch { return []; }
}
async function fetchGNews(topic, apiKey, tagCategory=null) {
  try {
    const data = await fetch(`https://gnews.io/api/v4/top-headlines?token=${apiKey}&lang=en&country=us&max=10&topic=${topic}`).then(r=>r.json());
    if (!data.articles) return [];
    return data.articles.filter(a=>a.title&&a.description).map(a => {
      const bias=getBias(a.source?.name||'');
      return { title:a.title, description:a.description||'', source:bias.name!=='Unknown'?bias.name:(a.source?.name||'Unknown'), url:a.url, urlToImage:a.image||null, publishedAt:a.publishedAt||null, bias:{score:bias.score,label:bias.label,color:bias.color}, fetchCategory:tagCategory };
    });
  } catch { return []; }
}
async function fetchESPN(url, max=5) {
  try {
    const data = await fetch(url).then(r=>r.json());
    return (data.articles||[]).filter(a=>a.headline).slice(0,max).map(a => ({
      title:a.headline, description:a.description||a.headline, source:'ESPN', url:a.links?.web?.href||'', urlToImage:a.images?.[0]?.url||null, publishedAt:a.published||null, bias:{score:0,label:'Neutral',color:'#a78bfa'}, fetchCategory:'Sports & Culture',
    }));
  } catch { return []; }
}
async function fetchRSS({name,url,score,label,color}, max=15) {
  try {
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),8000);
    const res=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Perspectiv/1.0 RSS Reader'}});
    clearTimeout(t);
    if (!res.ok) return [];
    const xml=await res.text(); const items=[]; const re=/<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi; let m;
    while ((m=re.exec(xml))!==null && items.length<max) {
      const chunk=m[1]||m[2];
      const title=stripHtml(extractXMLTag(chunk,'title')); const link=extractRSSLink(chunk);
      if (!title||!link) continue;
      const desc=stripHtml(extractXMLTag(chunk,'description')||extractXMLTag(chunk,'summary')||extractXMLTag(chunk,'content'))||title;
      const pubRaw=extractXMLTag(chunk,'pubDate')||extractXMLTag(chunk,'published')||extractXMLTag(chunk,'updated');
      let publishedAt=null; try { if (pubRaw) publishedAt=new Date(pubRaw).toISOString(); } catch {}
      items.push({ title, description:desc, source:name, url:link, urlToImage:extractRSSImage(chunk), publishedAt, bias:{score,label,color}, fetchCategory:null });
    }
    return items;
  } catch { return []; }
}

async function clusterArticles(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const list = articles.map((a,i) => {
    const tier=a.bias.score<=-1?'L':a.bias.score>=1?'R':'C';
    const hint=a.fetchCategory?` [${a.fetchCategory}]`:'';
    const age=a.publishedAt?` {${a.publishedAt.slice(0,10)}}`:'';
    return `[${i}] ${tier}:${a.source}${hint}${age} | ${a.title}`;
  }).join('\n');
  const msg = await client.messages.create({
    model:'claude-sonnet-4-6', max_tokens:6000,
    messages:[{ role:'user', content:`Cluster these ${articles.length} news articles into topics for a news app.\n\nReturn ONLY valid JSON, no markdown:\n{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"US Politics|World|Policy|Economy|National Security|Elections|Technology|Health|Sports & Culture|Entertainment","articleIndices":[0,1,2,3]}]}\n\nTARGET: 40-52 topics total. Categories: US Politics, World, Policy, Economy, National Security, Elections, Technology, Health, Sports & Culture (live sports only), Entertainment (movies/TV/awards/celebrity). Neutral factual titles only. Single-article topics are fine.\n\nArticles:\n${list}` }],
  });
  const text=msg.content[0]?.text||''; const m=text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Clustering returned no JSON');
  const p=JSON.parse(m[0]); return Array.isArray(p.topics)?p.topics:[];
}

function buildTopics(clusters, articles, categoryImages = {}) {
  const cutoff = Date.now() - 72*60*60*1000;
  return clusters.map((cluster,i) => {
    const arts=(cluster.articleIndices||[]).filter(idx=>Number.isInteger(idx)&&idx>=0&&idx<articles.length).map(idx=>articles[idx]);
    if (!arts.length) return null;
    const latest=arts.reduce((max,a)=>a.publishedAt&&a.publishedAt>max?a.publishedAt:max,'')||new Date().toISOString();
    const ms=new Date(latest).getTime(); if (!isNaN(ms)&&ms<cutoff) return null;
    const tiers=new Set(arts.map(a=>a.bias.score<=-1?'left':a.bias.score>=1?'right':'center'));
    const perspectiveMode=(arts.length>=3&&tiers.size>=2)?'full':'limited';
    const biasCounts={left:0,center:0,right:0};
    arts.forEach(a=>{ if(a.bias.score<=-1)biasCounts.left++; else if(a.bias.score>=1)biasCounts.right++; else biasCounts.center++; });
    const img=arts.find(a=>a.urlToImage);
    return {
      id:`topic-${i}`, title:cluster.title||'Untitled Story', summary:cluster.summary||'',
      category:cluster.category||'US Politics', urlToImage:img?.urlToImage||categoryImages[cluster.category]||null,
      latestPublishedAt:latest, perspectiveMode, biasCounts,
      articles:arts.map(a=>({title:a.title,description:a.description,source:a.source,url:a.url,bias:a.bias})),
    };
  }).filter(Boolean);
}

// ── Shared: generate all missing takes for a list of topics ──────────────────
// positionFilter: optional number[] — if provided, only generate those positions
async function seedAllTakes(client, topics, positionFilter = null) {
  const jobs = [];
  for (const topic of topics) {
    const positions = getPerspectivePositions(topic.category || '');
    const filtered  = positionFilter ? positions.filter(p => positionFilter.includes(p)) : positions;
    for (const pos of filtered) {
      const meta = TAKE_POSITIONS.find(p => p.position === pos);
      if (meta) jobs.push({ topic, meta });
    }
  }
  let generated = 0, alreadyCached = 0, errors = 0;
  await batch(jobs, async ({ topic, meta }) => {
    const rKey = takeKey(topic, meta.position);
    try {
      const existing = await redis.get(rKey);
      if (existing && !isWeakTake(existing)) { alreadyCached++; return; }
      const take = await generateTake(client, topic, meta);
      await redis.set(rKey, take, { ex: TAKES_TTL_S });
      generated++;
    } catch (err) {
      console.warn(`take failed "${topic.title}" pos=${meta.position}:`, err.message);
      errors++;
    }
  }, 15);
  return { generated, alreadyCached, errors, total: jobs.length };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.ANTHROPIC_API_KEY) return res.json({ ok:false, message:'ANTHROPIC_API_KEY not configured' });

  // ── Warm-only mode: fill missing takes for a chunk of cached topics ──────
  // Chunked so each request handles ~30 topics (~15s) — well within 60s limit.
  // clustered-news fires TOTAL_CHUNKS parallel requests to cover all topics.
  const warmOnly = req.query?.warm === '1' || req.body?.warm === true;
  if (warmOnly) {
    try {
      const allTopics = await redis.get(TOPICS_KEY);
      if (!allTopics?.length) return res.json({ ok: false, message: 'No cached topics to warm' });

      // Chunk support: ?chunk=0&chunks=3  (defaults to full list if omitted)
      const chunk  = parseInt(req.query.chunk  ?? '0');
      const chunks = parseInt(req.query.chunks ?? '1');
      const start  = Math.floor(chunk * allTopics.length / chunks);
      const end    = Math.floor((chunk + 1) * allTopics.length / chunks);
      const topics = allTopics.slice(start, end);

      // Optional position filter: ?positions=-1,1  or  ?positions=-2,2
      const positionsParam  = req.query.positions;
      const positionFilter  = positionsParam
        ? positionsParam.split(',').map(Number).filter(n => !isNaN(n))
        : null;

      console.log(`pregenerate warm chunk ${chunk}/${chunks}: topics ${start}-${end-1} (${topics.length} topics)${positionFilter ? ` positions=[${positionFilter}]` : ''}`);
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const stats  = await seedAllTakes(client, topics, positionFilter);
      if (chunk === 0) await redis.set(WARM_TS_KEY, new Date().toISOString(), { ex: 3600 });
      console.log(`pregenerate warm chunk ${chunk} done:`, stats);
      return res.json({ ok: true, warm: true, chunk, chunks, positions: positionFilter, ...stats });
    } catch (err) {
      console.error('pregenerate warm error:', err);
      return res.json({ ok: false, message: err.message });
    }
  }

  if (!process.env.NEWSDATA_API_KEY)  return res.json({ ok:false, message:'NEWSDATA_API_KEY not configured' });

  try {
    const newsdataKey = process.env.NEWSDATA_API_KEY;
    const gnewsKey    = process.env.GNEWS_API_KEY;
    const BASE        = 'https://newsdata.io/api/1';

    // ── 1. Fetch all articles in parallel ────────────────────────────────────
    console.log('pregenerate: fetching articles…');
    const results = await Promise.allSettled([
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.left_b}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&size=10`),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=politics&language=en&size=10`,    'US Politics'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=business&language=en&size=10`,    'Economy'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=technology&language=en&size=10`,  'Technology'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=health&language=en&size=10`,      'Health'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=sports&language=en&size=10`,      'Sports & Culture'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=world&language=en&size=10`,       'World'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=crime&language=en&size=10`,       'National Security'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&country=us&category=top&language=en&size=10`,         'US Politics'),
      fetchArticles(`${BASE}/latest?apikey=${newsdataKey}&category=politics&language=en&size=10`,               'World'),
      ...(gnewsKey ? [
        fetchGNews('nation',     gnewsKey, 'US Politics'),
        fetchGNews('world',      gnewsKey, 'World'),
        fetchGNews('business',   gnewsKey, 'Economy'),
        fetchGNews('technology', gnewsKey, 'Technology'),
        fetchGNews('health',     gnewsKey, 'Health'),
        fetchGNews('sports',     gnewsKey, 'Sports & Culture'),
      ] : []),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/news'),
      ...RSS_SOURCES.map(src => fetchRSS(src)),
    ]);

    const urlSeen=new Set(); const titleSeen=[];
    const all = results.flatMap(r=>r.status==='fulfilled'?r.value:[])
      .filter(a=>{ if(!a.url||urlSeen.has(a.url)) return false; urlSeen.add(a.url); return true; })
      .filter(a=>{ if(titleSeen.some(t=>titleSim(t,a.title)>0.6)) return false; titleSeen.push(a.title); return true; });
    all.sort((a,b)=>(!a.publishedAt?1:!b.publishedAt?-1:b.publishedAt.localeCompare(a.publishedAt)));
    console.log(`pregenerate: ${all.length} unique articles`);
    if (all.length < 5) throw new Error('Too few articles from news sources');

    // ── 2. Cluster with Claude ────────────────────────────────────────────────
    console.log('pregenerate: clustering with Claude…');
    const trimmed  = all.slice(0, 200);
    const clusters = await clusterArticles(trimmed);
    console.log(`pregenerate: ${clusters.length} clusters`);

    // ── 3. Fetch Pexels category fallback images + build topic shells ───────────
    const categoryImageEntries = await Promise.all(
      Object.entries(CATEGORY_PEXELS_QUERIES).map(async ([cat, q]) => [cat, await fetchPexelsPhoto(q)])
    );
    const categoryImages = Object.fromEntries(categoryImageEntries.filter(([, url]) => url));
    const topics = buildTopics(clusters, trimmed, categoryImages);
    console.log(`pregenerate: ${topics.length} topics built`);
    if (!topics.length) throw new Error('No valid topics after quality filter');

    const hasNonSports = topics.some(t => t.category !== 'Sports & Culture');
    if (!hasNonSports) {
      const stale = await redis.get(TOPICS_KEY);
      if (stale?.length && stale.some(t=>t.category!=='Sports & Culture')) {
        console.log('pregenerate: sports-only result — keeping existing Redis cache');
        return res.json({ ok:true, topics:stale.length, message:'Kept existing cache (sports-only fetch)' });
      }
    }

    // ── 4. Save slim topics to Redis immediately after clustering ────────────────
    // Do this BEFORE take generation so topics are always available even if
    // take generation times out. sourceTiers gives the frontend per-perspective
    // source info without needing the full articles array.
    const slimTopics = topics.map(({ articles, ...rest }) => {
      const left   = (articles||[]).filter(a => (a.bias?.score??0) <= -1).slice(0,3).map(a=>({name:a.source,label:a.bias?.label||null,url:a.url||null}));
      const center = (articles||[]).filter(a => (a.bias?.score??0) === 0).slice(0,3).map(a=>({name:a.source,label:a.bias?.label||null,url:a.url||null}));
      const right  = (articles||[]).filter(a => (a.bias?.score??0) >= 1).slice(0,3).map(a=>({name:a.source,label:a.bias?.label||null,url:a.url||null}));
      const all    = (articles||[]).slice(0,3).map(a=>({name:a.source,label:a.bias?.label||null,url:a.url||null}));
      return { ...rest, sourceTiers: { left, center, right, all } };
    });
    const slimJson = JSON.stringify(slimTopics);
    console.log(`pregenerate: saving ${slimTopics.length} slim topics (${Math.round(slimJson.length/1024)}KB) with sourceTiers`);
    await redis.set(TOPICS_KEY,    slimTopics,               { ex: TOPICS_TTL_S });
    await redis.set(TOPICS_TS_KEY, new Date().toISOString());
    await redis.set(WARM_TS_KEY,   new Date().toISOString(), { ex: 3600 });

    // topicsOnly mode: just fetch + cluster + save, no take generation.
    // Used to bootstrap sourceTiers into Redis without hitting the 60s timeout.
    if (req.query?.topicsOnly === '1' || req.body?.topicsOnly === true) {
      return res.json({ ok: true, topics: slimTopics.length, slimKB: Math.round(slimJson.length/1024), message: 'Topics saved, takes skipped' });
    }

    // ── 5. Seed Neutral + Far Left + Far Right while article data is in memory ──
    // These three are the highest-traffic positions. Generating them in the cron
    // means the most-swiped views are instant for every user.
    // 95 topics × 3 positions @ concurrency=20 ≈ 15 batches × ~1.4s = ~21s —
    // well within the 60s Vercel limit. Remaining positions (±1, ±2) are filled
    // by background warm chunks fired from clustered-news.js.
    const CRON_POSITIONS = [0, -3, 3];
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cronJobs = [];
    for (const topic of topics) {
      for (const pos of CRON_POSITIONS) {
        const meta = TAKE_POSITIONS.find(p => p.position === pos);
        if (meta) cronJobs.push({ topic, meta });
      }
    }
    let generated = 0, alreadyCached = 0, errors = 0;
    await batch(cronJobs, async ({ topic, meta }) => {
      const rKey = takeKey(topic, meta.position);
      try {
        const existing = await redis.get(rKey);
        if (existing && !isWeakTake(existing)) { alreadyCached++; return; }
        const take = await generateTake(client, topic, meta);
        await redis.set(rKey, take, { ex: TAKES_TTL_S });
        generated++;
      } catch (err) {
        console.warn(`cron take failed "${topic.title}" pos=${meta.position}:`, err.message);
        errors++;
      }
    }, 20);
    const stats = { generated, alreadyCached, errors, total: cronJobs.length };
    console.log('pregenerate cron takes [0,-3,3]:', stats);

    return res.json({ ok:true, topics:topics.length, slimKB: Math.round(slimJson.length/1024), takes: stats });

  } catch (err) {
    console.error('pregenerate error:', err);
    return res.json({ ok:false, message: err.message || 'Pregenerate failed' });
  }
}
