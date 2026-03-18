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

// ── Media Bias Database — keyed by newsdata.io source_id or normalized name ───
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
  for (const [k, v] of Object.entries(MEDIA_BIAS)) {
    if (id.includes(k) || k.includes(id)) return v;
  }
  for (const v of Object.values(MEDIA_BIAS)) {
    const normalizedName = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedName.includes(id) || id.includes(normalizedName)) return v;
  }
  return { score: 0, label: 'Unknown', color: '#6b7280', name: sourceId };
}

// ── NewsData.io domain groups (max 5 per request on free/basic plans) ─────────
const DOMAIN_GROUPS = {
  left_a:  'edition.cnn.com,msnbc.com,theguardian.com,nbcnews.com,cbsnews.com',
  left_b:  'nytimes.com,washingtonpost.com,npr.org',
  center:  'reuters.com,apnews.com,bbc.com,thehill.com,axios.com',
  right:   'foxnews.com,nypost.com,breitbart.com,washingtontimes.com',
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

const SPORTS_VOICE = {
  '-2': { label: 'Fan',      voice: `You are writing from a FAN perspective. This is about passion, team loyalty, emotional investment, player storylines, and the experience of following a sport. What would a lifelong fan who lives and dies by their team actually care about here? Capture the energy, the stakes, the heartbreak or joy of the moment.` },
   '0': { label: 'Neutral',  voice: `You are writing from a NEUTRAL, straight-news perspective. Report exactly what happened in this sports story — the facts, the result, the context — the way a wire service reporter would cover it. No fan enthusiasm, no business angle, no deep stats. Just clear, factual, fair-minded coverage that tells the reader what they need to know.` },
   '2': { label: 'Business', voice: `You are writing from a BUSINESS perspective. Focus on contracts, salaries, cap space, revenue, ownership decisions, league policy, sponsorship impact, and the financial machinery behind the sport. What are the business and organizational implications here?` },
};
const TECH_VOICE = {
  '-2': { label: 'Optimist', voice: `You are writing from a TECH OPTIMIST perspective. Focus on innovation potential, new capabilities unlocked, democratization of access, scientific progress, and the transformative upside. What's the best-case path this technology enables? Sound like a researcher or entrepreneur genuinely excited about where this leads.` },
   '0': { label: 'Skeptic',  voice: `You are writing from a TECH SKEPTIC perspective. Focus on privacy risks, surveillance concerns, job displacement, algorithmic bias, ethical blind spots, unintended consequences, and why the hype may be outpacing reality. What are the legitimate concerns being glossed over by optimists and industry alike?` },
   '2': { label: 'Industry', voice: `You are writing from an INDUSTRY/BUSINESS perspective. Focus on market impact, competitive dynamics, investment implications, enterprise adoption, vendor landscapes, and what this means for tech companies and the broader business ecosystem. Sound like a tech analyst or VC.` },
};
const ENTERTAINMENT_VOICE = {
  '-2': { label: 'Progressive', voice: `You are writing from a PROGRESSIVE cultural perspective. Champion diverse storytelling, inclusive casting, new voices, and the importance of representation in entertainment. Celebrate when studios take creative risks or challenge traditional narratives. Critique gatekeeping, legacy bias, and resistance to change in Hollywood and media. Sound like a critic who writes for Vulture or The Atlantic Culture section.` },
   '0': { label: 'Neutral',     voice: `You are writing a NEUTRAL cultural analysis. Report the facts of the story — what was made, released, or said — without framing it through a cultural values lens. Note where audiences or critics are divided. Sound like a straightforward entertainment journalist.` },
   '2': { label: 'Traditional', voice: `You are writing from a TRADITIONAL cultural perspective. Value faithful adaptations, classic storytelling craft, and the integrity of beloved source material. Critique when studios prioritize ideology over story quality, remake cherished properties poorly, or pander to trends at the expense of timeless narratives. Sound like a critic who mourns what Hollywood used to be and thinks Disney has lost its way.` },
};
const POSITION_VOICE = {
  '-3': `You are writing from a FAR LEFT worldview. Center your analysis on class struggle, systemic oppression, corporate power, and anti-imperialism. On immigration: migrants are displaced by US foreign policy and corporate exploitation — enforcement is state violence against the vulnerable. On economy: inequality is a feature, not a bug, of capitalism. On national security: the military-industrial complex profits from endless war. Sound like a democratic socialist who reads Jacobin and The Intercept.`,
  '-2': `You are writing from a LEFT-LIBERAL worldview. Emphasize systemic racism, climate urgency, healthcare and housing as human rights, and immigration as both a humanitarian obligation and economic asset. On immigration: highlight family separation, DACA, economic contributions. On economy: the rich aren't paying their fair share; invest in people. Sound like a mainstream progressive Democrat — think AOC or a New York Times opinion columnist.`,
  '-1': `You are writing from a CENTER-LEFT worldview. Favor evidence-based, pragmatic reform over ideological purity. Support regulated capitalism with robust social safety nets. On immigration: back comprehensive reform with managed enforcement and clear legal pathways. On economy: fiscal responsibility paired with smart investment in public goods. Sound like a thoughtful Brookings Institution analyst or a moderate Senate Democrat.`,
   '0': `You are writing a NEUTRAL, strictly factual analysis. Report what happened, what experts say, and where genuine disagreement exists — without framing it toward any side. Acknowledge multiple valid perspectives without endorsing any. Sound like an AP wire reporter or a nonpartisan CBO report. Zero spin. Zero advocacy.`,
   '1': `You are writing from a CENTER-RIGHT worldview. Prioritize fiscal conservatism, rule of law, individual liberty, and limited government. On immigration: support legal immigration pathways while opposing illegal border crossing; favor managed enforcement. On economy: markets over mandates, debt matters, deregulation creates growth. Sound like a Wall Street Journal editorial board member or a Romney-era Republican.`,
   '2': `You are writing from a RIGHT CONSERVATIVE worldview. Emphasize American sovereignty, strong borders, traditional values, free enterprise, and personal responsibility. On immigration: illegal entry is a crime; costs to taxpayers are real; deportation of criminal aliens is non-negotiable. On economy: cut taxes, cut spending, get government out of the way. Sound like mainstream Fox News conservatism or a Heritage Foundation policy brief.`,
   '3': `You are writing from a FAR RIGHT NATIONALIST worldview. Lead with America First, populist skepticism of globalism, elites, and institutions. On immigration: frame it as an invasion; demand the wall, mass deportation, and zero tolerance. On national security: hawkish military posture, nuclear deterrence, protect critical infrastructure from China and adversaries; domestic enemies are real. On economy: economic nationalism, tariffs, bring back manufacturing. Sound like someone who reads Breitbart and believes the GOP establishment has sold out the American people.`,
};

// ── Cache configuration ────────────────────────────────────────────────────────
// Takes: 24h TTL — pregenerated daily at 6am, on-demand cached between cycles
const takesCache = new Map();
const TAKES_CACHE_TTL = 24 * 60 * 60 * 1000;

// Topics: 24h TTL — full refresh at 6am; RSS updates article lists every 4h
let cachedTopics    = null;
let cacheTimestamp  = 0;
const CACHE_TTL     = 24 * 60 * 60 * 1000;
let generationInFlight = null;

// ── Refresh scheduling state ───────────────────────────────────────────────────
let lastFullRefreshDate = ''; // YYYY-MM-DD of last completed 6am refresh

// ── Takes cache helpers ────────────────────────────────────────────────────────
function takesCacheKey(topic, position) {
  const title = (topic.title || '').toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `${title}:${topic.latestPublishedAt || 'x'}:${position}`;
}
function getsCached(key) {
  const entry = takesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TAKES_CACHE_TTL) { takesCache.delete(key); return null; }
  return entry.take;
}
function setsCached(key, take) { takesCache.set(key, { take, ts: Date.now() }); }

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

// ── Fetch articles from NewsData.io ───────────────────────────────────────────
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
    console.warn(`fetchArticles failed:`, err.message);
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
async function fetchESPN(url) {
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return (data.articles || [])
      .filter(a => a.headline)
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

// ── RSS feed sources (4-hour lightweight refresh, no pregeneration) ────────────
const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/topNews',                         sourceId: 'reuters',       category: null          },
  { url: 'https://feeds.npr.org/1001/rss.xml',                                sourceId: 'npr',           category: 'US Politics'  },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml',                             sourceId: 'bbc',           category: 'World'        },
  { url: 'https://moxie.foxnews.com/google-publisher/latest.xml',             sourceId: 'foxnews',       category: null          },
  { url: 'https://feeds.washingtonpost.com/rss/national',                     sourceId: 'washingtonpost', category: 'US Politics' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',        sourceId: 'nytimes',       category: null          },
  { url: 'https://thehill.com/feed/',                                          sourceId: 'thehill',       category: null          },
  { url: 'https://feeds.feedburner.com/breitbart',                            sourceId: 'breitbart',     category: null          },
];

// ── Simple RSS/Atom XML parser (no extra packages) ────────────────────────────
function parseRSSXML(xml, sourceId, tagCategory) {
  const articles = [];
  const bias = getBias(sourceId);
  // Match <item> or <entry> blocks
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (
      block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || ''
    ).replace(/<[^>]+>/g, '').trim();
    const description = (
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ||
      block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/)?.[1] || ''
    ).replace(/<[^>]+>/g, '').trim().slice(0, 300);
    const link = (
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
      block.match(/<link[^>]+href="([^"]+)"/)?.[1] || ''
    ).trim();
    const pubDate = (
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ||
      block.match(/<published>([\s\S]*?)<\/published>/)?.[1] || ''
    ).trim();
    if (!title || !description) continue;
    articles.push({
      title,
      description,
      source:        bias.name || sourceId,
      url:           link,
      urlToImage:    null,
      publishedAt:   pubDate ? (new Date(pubDate).toISOString().startsWith('Invalid') ? null : new Date(pubDate).toISOString()) : null,
      bias:          { score: bias.score, label: bias.label, color: bias.color },
      fetchCategory: tagCategory,
    });
  }
  return articles;
}

async function fetchRSSFeed(url, sourceId, tagCategory) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Perspectiv/1.0 RSS Reader' }, timeout: 8000 });
    const xml = await res.text();
    return parseRSSXML(xml, sourceId, tagCategory);
  } catch (err) {
    console.warn(`RSS fetch failed [${sourceId}]:`, err.message);
    return [];
  }
}

// ── RSS refresh: update article lists on existing topics, no pregeneration ─────
async function rssRefresh() {
  if (!cachedTopics?.length) {
    console.log('RSS refresh: no topics cached yet, skipping');
    return;
  }

  console.log('RSS refresh: fetching article updates…');
  const results = await Promise.allSettled(
    RSS_FEEDS.map(f => fetchRSSFeed(f.url, f.sourceId, f.category))
  );
  const newArticles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Deduplicate new articles by URL
  const urlSeen = new Set(cachedTopics.flatMap(t => t.articles.map(a => a.url)));
  const fresh = newArticles.filter(a => a.url && !urlSeen.has(a.url));

  if (!fresh.length) {
    console.log('RSS refresh: no new articles found');
    return;
  }

  // Match each fresh article to the most similar existing topic
  let matched = 0;
  for (const article of fresh) {
    let bestTopic = null, bestScore = 0.35; // minimum similarity threshold
    for (const topic of cachedTopics) {
      const score = titleSimilarity(article.title, topic.title);
      if (score > bestScore) { bestScore = score; bestTopic = topic; }
      // Also check against existing article titles in the topic
      for (const existing of topic.articles) {
        const s2 = titleSimilarity(article.title, existing.title);
        if (s2 > bestScore) { bestScore = s2; bestTopic = topic; }
      }
    }
    if (bestTopic) {
      bestTopic.articles.push({
        title:       article.title,
        description: article.description,
        source:      article.source,
        url:         article.url,
        bias:        article.bias,
      });
      // Update image if topic has none
      if (!bestTopic.urlToImage && article.urlToImage) bestTopic.urlToImage = article.urlToImage;
      // Update latest published
      if (article.publishedAt && article.publishedAt > (bestTopic.latestPublishedAt || '')) {
        bestTopic.latestPublishedAt = article.publishedAt;
      }
      matched++;
    }
  }

  console.log(`RSS refresh: ${fresh.length} new articles, ${matched} matched to existing topics (no pregeneration)`);
}

// ── Cluster articles into topics using Claude ─────────────────────────────────
async function clusterArticles(articles) {
  const list = articles
    .map((a, i) => {
      const tier = a.bias.score <= -1 ? 'L' : a.bias.score >= 1 ? 'R' : 'C';
      const hint = a.fetchCategory ? ` [${a.fetchCategory}]` : '';
      return `[${i}] ${tier}:${a.source}${hint} | ${a.title}`;
    })
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Cluster these ${articles.length} news articles into 20-35 major ongoing topics.

Return ONLY valid JSON, no markdown:
{"topics":[{"title":"Short neutral topic (max 6 words)","summary":"One factual sentence","category":"US Politics|World|Policy|Economy|National Security|Elections|Technology|Health|Sports & Culture","articleIndices":[0,1,2,3]}]}

Rules:
- 20-35 topics total
- Each topic needs at least 1 article
- Prefer topics with 3+ articles from multiple bias tiers — these get the full 7-perspective treatment
- Topics with only 1-2 articles are still valuable — include them
- Merge near-duplicate topics into one
- "category" must be exactly one of: US Politics, World, Policy, Economy, National Security, Elections, Technology, Health, Sports & Culture
  - US Politics: domestic government, Congress, White House, political conflicts
  - World: international news, foreign affairs
  - Policy: legislation, regulations, climate/environment law, domestic policy debates
  - Economy: markets, jobs, trade, inflation, corporate news
  - National Security: military, intelligence, terrorism, border, defense
  - Elections: campaigns, voting, candidates, electoral politics
  - Technology: tech companies, AI, science, space, cyber
  - Health: public health, medicine, FDA, healthcare
  - Sports & Culture: sports, entertainment — only assign if article is tagged [Sports & Culture]
- Use [fetchCategory hints] shown in brackets when available to guide category assignment
- Neutral factual titles only — no editorial spin
- Order topics by descending newsworthiness (highest-priority first):
  1. National Security  2. Policy & Legislation  3. World  4. Economy
  5. Elections & Politics  6. US Politics  7. Technology  8. Health  9. Sports & Culture
- Minimum newsworthiness bar: only include topics that would plausibly appear on the front page of NYT, WSJ, or BBC. Skip celebrity gossip, lifestyle trends, parenting advice, entertainment opinions, product reviews, and human interest fluff. Merge trivial topics into broader ones or discard them. EXCEPTION: articles tagged [Sports & Culture] must always produce at least 3-5 Sports & Culture topics regardless of this filter — sports news belongs in the app even if it wouldn't make the front page.`,
    }],
  });

  const text = msg.content[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Clustering returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

// ── Build topic shells ────────────────────────────────────────────────────────
async function buildTopicShells(clusters, allArticles) {
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return clusters
    .map((cluster, i) => {
      const clusterArticles = (cluster.articleIndices || [])
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < allArticles.length)
        .map(idx => allArticles[idx]);

      if (clusterArticles.length < 1) return null;

      const latestPublishedAt = clusterArticles.reduce((max, a) =>
        a.publishedAt && a.publishedAt > max ? a.publishedAt : max, '');

      if (latestPublishedAt) {
        const latestMs = new Date(latestPublishedAt).getTime();
        if (!isNaN(latestMs) && latestMs < thirtyDaysAgoMs) return null;
      }

      const tiers = new Set(clusterArticles.map(a =>
        a.bias.score <= -1 ? 'left' : a.bias.score >= 1 ? 'right' : 'center'
      ));
      const perspectiveMode = (clusterArticles.length >= 3 && tiers.size >= 2) ? 'full' : 'limited';

      const imgArticle = clusterArticles.find(a => a.urlToImage);

      return {
        id:                `topic-${i}`,
        title:             cluster.title    || 'Untitled Story',
        summary:           cluster.summary  || '',
        category:          cluster.category || 'US Politics',
        urlToImage:        imgArticle?.urlToImage || null,
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

// ── Core take generation (shared by route + pregeneration) ────────────────────
async function generateTake(topic, position) {
  const meta = TAKE_POSITIONS.find(p => p.position === position);
  if (!meta) throw new Error(`Invalid position: ${position}`);

  const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
  const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
  const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

  const fmt = (arr) => arr.length === 0
    ? '(none)'
    : arr.map(a => `  • ${a.source}: "${a.title}"`).join('\n');

  const primaryTier = meta.tier;
  const primaryArts = primaryTier === 'left' ? leftArts : primaryTier === 'right' ? rightArts : centerArts;
  const otherArts   = primaryTier === 'left' ? [...centerArts, ...rightArts]
                    : primaryTier === 'right' ? [...centerArts, ...leftArts]
                    : [...leftArts, ...rightArts];

  const category = topic.category || '';
  let positionVoice, effectiveLabel;

  if (category === 'Sports & Culture' && SPORTS_VOICE[String(position)]) {
    const sv = SPORTS_VOICE[String(position)];
    effectiveLabel = sv.label;
    positionVoice  = sv.voice;
  } else if (category === 'Technology' && TECH_VOICE[String(position)]) {
    const tv = TECH_VOICE[String(position)];
    effectiveLabel = tv.label;
    positionVoice  = tv.voice;
  } else if (category === 'Entertainment' && ENTERTAINMENT_VOICE[String(position)]) {
    const ev = ENTERTAINMENT_VOICE[String(position)];
    effectiveLabel = ev.label;
    positionVoice  = ev.voice;
  } else {
    effectiveLabel = meta.label;
    positionVoice  = POSITION_VOICE[String(position)] || `Write a ${meta.label} perspective on this topic.`;
  }

  const prompt = `${positionVoice}

Do NOT just rephrase the same facts with different adjectives. Ask yourself: what would a thoughtful person from this perspective ACTUALLY focus on, worry about, and argue here? Write 3-4 punchy sentences (50-80 words) from that authentic place.

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY valid JSON:
{"take":{"position":${position},"label":"${effectiveLabel}","text":"3-4 sentence take here","sources":[{"name":"Source Name","framing":"Brief framing note"}]}}`;

  const msg  = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text  = msg.content[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(match[0]);
  if (!parsed.take) throw new Error('No take in response');

  return { ...parsed.take, color: meta.color };
}

// ── Pregenerate all takes for all topics (runs at 6am) ────────────────────────
// Politics (full mode): all 7 positions. Sports/Tech/Entertainment/limited: -2, 0, 2.
const FULL_POSITIONS    = [-3, -2, -1, 0, 1, 2, 3];
const REDUCED_POSITIONS = [-2, 0, 2];

async function pregenerateTopics(topics) {
  let generated = 0, alreadyCached = 0, errors = 0;
  console.log(`Pregenerating takes for ${topics.length} topics…`);

  for (const topic of topics) {
    const positions = topic.perspectiveMode === 'full' ? FULL_POSITIONS : REDUCED_POSITIONS;
    for (const pos of positions) {
      const key = takesCacheKey(topic, pos);
      if (getsCached(key)) { alreadyCached++; continue; }
      try {
        const take = await generateTake(topic, pos);
        setsCached(key, take);
        generated++;
        // Throttle: 200ms between API calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`Pregenerate "${topic.title}" @${pos}:`, err.message);
        errors++;
      }
    }
  }

  console.log(`Pregeneration done — generated: ${generated}, cached: ${alreadyCached}, errors: ${errors}`);
  return { generated, cached: alreadyCached, errors };
}

// ── Full refresh: fetch NewsData + GNews + ESPN → cluster → shell → pregenerate
async function doFullRefresh() {
  const apiKey   = process.env.NEWSDATA_API_KEY;
  const gnewsKey = process.env.GNEWS_API_KEY;
  if (!apiKey) throw new Error('NEWSDATA_API_KEY not set');

  const BASE = 'https://newsdata.io/api/1';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  console.log('Full refresh: fetching articles from NewsData.io, GNews, and ESPN…');
  const results = await Promise.allSettled([
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&size=10`),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_b}&size=10`),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&size=10`),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&size=10`),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=politics&language=en&size=10`,    'US Politics'),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=business&language=en&size=10`,    'Economy'),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=technology&language=en&size=10`,  'Technology'),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=health&language=en&size=10`,      'Health'),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=sports&language=en&size=10`,      'Sports & Culture'),
    fetchArticles(`${BASE}/latest?apikey=${apiKey}&country=us&category=world&language=en&size=10`,       'World'),
    fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.left_a}&from_date=${thirtyDaysAgo}&size=10`),
    fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.center}&from_date=${thirtyDaysAgo}&size=10`),
    fetchArticles(`${BASE}/archive?apikey=${apiKey}&language=en&domainurl=${DOMAIN_GROUPS.right}&from_date=${thirtyDaysAgo}&size=10`),
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
  ]);

  const batches = results.map(r => r.status === 'fulfilled' ? r.value : []);

  const urlSeen = new Set();
  const urlDeduped = batches.flat().filter(a => {
    if (!a.url || urlSeen.has(a.url)) return false;
    urlSeen.add(a.url);
    return true;
  });

  const titleSeenArr = [];
  const deduped = urlDeduped.filter(a => {
    if (titleSeenArr.some(t => titleSimilarity(t, a.title) > 0.6)) return false;
    titleSeenArr.push(a.title);
    return true;
  });

  console.log(`Fetched ${deduped.length} unique articles (${batches.map(b => b.length).join('+')})`);
  if (deduped.length < 5) throw new Error('Too few articles returned from news sources');

  console.log('Clustering articles with AI…');
  const trimmed  = deduped.slice(0, 150);
  const clusters = await clusterArticles(trimmed);
  console.log(`Identified ${clusters.length} clusters`);

  const topics = await buildTopicShells(clusters, trimmed);
  console.log(`Built ${topics.length} topic shells (${topics.filter(t => t.perspectiveMode === 'full').length} full, ${topics.filter(t => t.perspectiveMode === 'limited').length} limited)`);

  if (!topics.length) throw new Error('No topics could be generated');

  cachedTopics   = topics;
  cacheTimestamp = Date.now();
  lastFullRefreshDate = new Date().toISOString().split('T')[0];

  // Pregenerate takes for all topics after full refresh
  pregenerateTopics(topics).catch(err => console.error('Pregeneration error:', err));

  return topics;
}

// ── Schedule: 6am daily full refresh ─────────────────────────────────────────
function scheduleNextFullRefresh() {
  const now    = new Date();
  const next   = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next - now;
  const hUntil  = Math.round(msUntil / 3600000 * 10) / 10;
  console.log(`Next full refresh (NewsData+GNews+pregenerate) scheduled at 6am local (${hUntil}h from now)`);
  setTimeout(async () => {
    console.log('⏰ 6am full refresh triggered');
    try {
      if (generationInFlight) await generationInFlight;
      generationInFlight = doFullRefresh();
      await generationInFlight;
    } catch (err) {
      console.error('Scheduled full refresh failed:', err.message);
    } finally {
      generationInFlight = null;
    }
    scheduleNextFullRefresh(); // reschedule for next day
  }, msUntil);
}

// ── Schedule: RSS refresh every 4 hours (no pregeneration) ───────────────────
setInterval(() => {
  console.log('⏰ 4h RSS refresh triggered');
  rssRefresh().catch(err => console.error('RSS refresh error:', err));
}, 4 * 60 * 60 * 1000);

// Boot the scheduling
scheduleNextFullRefresh();

// ── /api/clustered-news ────────────────────────────────────────────────────────
app.get('/api/clustered-news', async (req, res) => {
  if (!process.env.NEWSDATA_API_KEY) return res.status(500).json({ error: 'NEWSDATA_API_KEY not set' });

  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cachedTopics && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('Serving from cache');
    return res.json({ topics: cachedTopics, fromCache: true });
  }

  if (generationInFlight) {
    console.log('Generation in progress — waiting…');
    try {
      const topics = await generationInFlight;
      return res.json({ topics, fromCache: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Generation failed' });
    }
  }

  generationInFlight = doFullRefresh();

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
// On-demand: generates and immediately caches for subsequent users
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

  // Cache hit — new topics between 6am cycles get cached immediately on first request
  const key    = takesCacheKey(topic, position);
  const cached = getsCached(key);
  if (cached) return res.json({ take: cached, fromCache: true });

  try {
    const take = await generateTake(topic, position);
    setsCached(key, take); // cache immediately for subsequent users
    return res.json({ take });
  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
});

// ── /api/pregenerate — manually trigger pregeneration for current topics ───────
app.post('/api/pregenerate', async (req, res) => {
  if (!cachedTopics?.length) {
    return res.status(400).json({ error: 'No topics cached yet — load /api/clustered-news first' });
  }
  // Kick off async, respond immediately
  pregenerateTopics(cachedTopics)
    .then(stats => console.log('Manual pregenerate complete:', stats))
    .catch(err  => console.error('Manual pregenerate failed:', err));
  res.json({ ok: true, message: `Pregeneration started for ${cachedTopics.length} topics`, topics: cachedTopics.length });
});

// ── Votes endpoint ─────────────────────────────────────────────────────────────
const devVotes = new Map(); // topicTitle → { up, down }

app.get('/api/votes', (req, res) => {
  const { topicTitle } = req.query;
  if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });
  const v = devVotes.get(topicTitle) || { up: 0, down: 0 };
  res.json(v);
});

app.post('/api/votes', (req, res) => {
  const { topicTitle, direction } = req.body || {};
  if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });
  const v = devVotes.get(topicTitle) || { up: 0, down: 0 };
  if      (direction === 'up')           v.up   = Math.max(0, v.up   + 1);
  else if (direction === 'down')         v.down = Math.max(0, v.down + 1);
  else if (direction === 'remove-up')    v.up   = Math.max(0, v.up   - 1);
  else if (direction === 'remove-down')  v.down = Math.max(0, v.down - 1);
  else if (direction === 'switch-to-up')   { v.up = Math.max(0, v.up + 1);   v.down = Math.max(0, v.down - 1); }
  else if (direction === 'switch-to-down') { v.down = Math.max(0, v.down + 1); v.up  = Math.max(0, v.up  - 1); }
  devVotes.set(topicTitle, v);
  res.json(v);
});

// ── /api/trending — ranks by net votes then article count ─────────────────────
app.post('/api/trending', (req, res) => {
  const { topics } = req.body || {};
  if (!Array.isArray(topics)) return res.status(400).json({ error: 'topics array required' });
  const withVotes = topics.map(t => {
    const v = devVotes.get(t.title) || { up: 0, down: 0 };
    return { title: t.title, net: v.up - v.down, articleCount: t.articleCount ?? 0 };
  });
  const trending = withVotes
    .sort((a, b) => b.net - a.net || b.articleCount - a.articleCount)
    .slice(0, 10);
  res.json({ trending });
});

// ── /api/refresh-status — useful for debugging / admin ────────────────────────
app.get('/api/refresh-status', (req, res) => {
  res.json({
    lastFullRefreshDate,
    cacheAgeMinutes:    cachedTopics ? Math.round((Date.now() - cacheTimestamp) / 60000) : null,
    topicCount:         cachedTopics?.length ?? 0,
    takesCacheSize:     takesCache.size,
    nextFullRefresh:    '6:00 AM local time daily',
    rssRefreshInterval: 'every 4 hours',
  });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => console.log(`Perspectiv server running on :${PORT}`));
