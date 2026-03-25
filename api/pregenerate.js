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
   '0': { label: 'Neutral',  voice: `You are writing a NEUTRAL, strictly factual analysis of this tech story. Report what happened, what experts say, and where genuine disagreement exists — without framing it toward hype or fear. Acknowledge trade-offs without advocating for either side. Sound like a wire reporter covering technology: no boosterism, no doom. Just the facts and context.` },
   '2': { label: 'Industry', voice: `You are writing from an INDUSTRY/BUSINESS perspective. Focus on market impact, competitive dynamics, investment implications, enterprise adoption, vendor landscapes, and what this means for tech companies and the broader business ecosystem. Sound like a tech analyst or VC.` },
};
const ENTERTAINMENT_VOICE = {
  '-2': { label: 'Progressive', voice: `You are writing from a PROGRESSIVE entertainment perspective. Champion representation, diverse casting, and stories updated to reflect modern values. When studios push boundaries or reimagine classics with new voices, frame it as culture evolving. Call out nostalgia-driven backlash as resistance to change. Sound like a culture critic at Vulture or The Atlantic.` },
   '0': { label: 'Neutral',     voice: `You are writing from a NEUTRAL, strictly factual perspective on this entertainment story. Report what happened — the creative decisions, audience response, box office, critical reception — without taking sides on cultural debates. Sound like an entertainment wire reporter: no advocacy, just the facts.` },
   '2': { label: 'Traditional', voice: `You are writing from a TRADITIONAL entertainment perspective. Champion faithful storytelling, respect for source material, and craft over cultural agenda. When beloved properties are rebooted, focus on whether the original spirit has been honored — or diluted. Sound like a film critic who loved the originals and believes a great story doesn't need to be a lecture.` },
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

// Positions to generate per category
function getPerspectivePositions(category) {
  if (['Sports & Culture', 'Technology', 'Entertainment'].includes(category)) {
    return [-2, 0, 2]; // 3 perspectives
  }
  return [-3, -2, -1, 0, 1, 2, 3]; // 7 political perspectives
}

const WEAK_TAKE_PHRASES = ['cannot verify', 'appears to be false'];
function isWeakTake(take) {
  const t = (take?.text || '').toLowerCase();
  return WEAK_TAKE_PHRASES.some(p => t.includes(p));
}

function getTopicFocus(category, position) {
  const side = position < 0 ? 'left' : position > 0 ? 'right' : 'neutral';
  const cat  = (category || '').toLowerCase();
  const focus = {
    'national security': { left: 'Focus on civilian casualties, the human cost of military action, endless wars, and defense industry profits. Question whether force actually creates safety.', neutral: 'Report the military or security facts plainly — troop movements, diplomatic status, official statements — without editorial framing.', right: 'Focus on deterrence, projecting strength, protecting allies, and the consequences of weakness. A strong military posture prevents conflict.' },
    'world':             { left: 'Focus on humanitarian impact, civilian suffering, US foreign policy\'s role in instability, and diplomacy over military solutions.', neutral: 'Report the geopolitical facts — what happened, who said what, what\'s at stake — without advocating for a particular stance.', right: 'Focus on US national interest, alliance reliability, adversary threats, and why projecting strength matters globally.' },
    'economy':           { left: 'Focus on working families, wage stagnation, growing wealth gaps, and corporate power. Call out policies that benefit the wealthy at everyone else\'s expense.', neutral: 'Report the economic data and expert forecasts without partisan framing. Include both upside and downside risks.', right: 'Focus on growth, job creation, and what happens when government steps back. Lower taxes and less regulation produce better outcomes than intervention.' },
    'health':            { left: 'Focus on access and affordability — who can\'t get care, who goes bankrupt. Healthcare is a right, not a product. Defend the ACA, Medicaid, and public options.', neutral: 'Report the health policy facts — coverage numbers, cost data, what the legislation does — without pushing single-payer or free-market agendas.', right: 'Focus on patient choice and competition. Government-controlled healthcare reduces quality and innovation; markets deliver better outcomes.' },
    'elections':         { left: 'Focus on voter access, suppression, dark money, and protecting democratic participation. Warn about gerrymandering and ID laws that restrict the vote.', neutral: 'Report electoral facts — results, legal challenges, procedural changes — without taking a side on integrity debates.', right: 'Focus on election integrity, secure voting systems, and rule of law. Confidence in elections requires verifiable, fraud-resistant processes.' },
    'immigration':       { left: 'Focus on human stories — families separated, asylum seekers at risk, and immigrants\' economic contributions. Frame aggressive enforcement as cruel and counterproductive.', neutral: 'Report what the policy change is, who it affects, and what supporters and critics each say without endorsing either extreme.', right: 'Focus on rule of law, border security, and the costs of illegal immigration. Sovereign nations have the right and obligation to control entry.' },
    'policy':            { left: 'Focus on who this policy helps or hurts among ordinary people, and whether it expands or contracts rights and access.', neutral: 'Report what the policy does, what it costs, and what evidence from similar policies shows.', right: 'Focus on whether this policy grows government power, raises costs, or restricts individual and economic freedom.' },
  };
  for (const [key, sides] of Object.entries(focus)) {
    if (cat.includes(key)) return sides[side] || '';
  }
  return '';
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
  const arts       = topic.articles || [];
  const leftArts   = arts.filter(a => (a.bias?.score ?? 0) <= -1);
  const centerArts = arts.filter(a => (a.bias?.score ?? 0) === 0);
  const rightArts  = arts.filter(a => (a.bias?.score ?? 0) >= 1);

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
  if (category === 'Sports & Culture' && SPORTS_VOICE[String(meta.position)]) {
    const sv = SPORTS_VOICE[String(meta.position)];
    effectiveLabel = sv.label; positionVoice = sv.voice;
  } else if (category === 'Technology' && TECH_VOICE[String(meta.position)]) {
    const tv = TECH_VOICE[String(meta.position)];
    effectiveLabel = tv.label; positionVoice = tv.voice;
  } else if (category === 'Entertainment' && ENTERTAINMENT_VOICE[String(meta.position)]) {
    const ev = ENTERTAINMENT_VOICE[String(meta.position)];
    effectiveLabel = ev.label; positionVoice = ev.voice;
  } else {
    effectiveLabel = meta.label;
    positionVoice  = POSITION_VOICE[String(meta.position)] || `Write a ${meta.label} perspective on this topic.`;
  }

  const topicFocus = getTopicFocus(category, meta.position);
  const prompt = `${positionVoice}${topicFocus ? `\n\nFor this specific story: ${topicFocus}` : ''}

GROUNDING RULES — follow precisely:
1. Donald Trump is the 47th President (inaugurated Jan 20, 2025). Always "President Trump" — NEVER "former President Trump."
2. The TOPIC TITLE and CONTEXT are absolute ground truth — even if after your training cutoff. NEVER write "cannot verify," "unconfirmed," "appears false," or anything doubting the event.
2b. If provided articles don't match this topic, ignore them and write from general knowledge. Always produce a substantive take — never refuse.
3. Be direct and assertive. No hedging ("some argue," "it could be said"). Lead with the point. No throat-clearing opener.
4. Write 2-3 punchy sentences (40-60 words).
5. For events tied to a specific place, name the location.

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY valid JSON, nothing else:
{"take":{"position":${meta.position},"label":"${effectiveLabel}","text":"2-3 sentence take here","sources":[{"name":"Source Name","framing":"One brief framing note"}]}}`;

  const msg  = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text  = msg.content[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(match[0]);
  if (!parsed.take) throw new Error('No take in response');

  return { ...parsed.take, color: meta.color };
}

// ── Cache keys — must match clustered-news.js and refresh-rss.js ─────────────
const CACHE_VERSION = 'v9';
const TOPICS_KEY    = `sn:topics:${CACHE_VERSION}`;
const TOPICS_TS_KEY = `sn:topics:ts:${CACHE_VERSION}`;
// Takes TTL: 25h (refreshed daily at 6am, with buffer for cron variance)
const TAKES_TTL_S   = 25 * 60 * 60;
// Topics TTL: 25h (RSS refresh resets to 4h each cycle)
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
const CATEGORY_FALLBACK_IMAGES = {
  'US Politics':       'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&auto=format&fit=crop',
  'World':             'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop',
  'Economy':           'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop',
  'National Security': 'https://images.unsplash.com/photo-1562408590-e32931084e23?w=1200&auto=format&fit=crop',
  'Health':            'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200&auto=format&fit=crop',
  'Technology':        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop',
  'Sports & Culture':  'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&auto=format&fit=crop',
  'Entertainment':     'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1200&auto=format&fit=crop',
  'Elections':         'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=1200&auto=format&fit=crop',
  'Policy':            'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&auto=format&fit=crop',
};

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

function buildTopics(clusters, articles) {
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
      category:cluster.category||'US Politics', urlToImage:img?.urlToImage||CATEGORY_FALLBACK_IMAGES[cluster.category]||null,
      latestPublishedAt:latest, perspectiveMode, biasCounts,
      articles:arts.map(a=>({title:a.title,description:a.description,source:a.source,url:a.url,bias:a.bias})),
    };
  }).filter(Boolean);
}

// ── Shared: generate all missing takes for a list of topics ──────────────────
async function seedAllTakes(client, topics) {
  const jobs = [];
  for (const topic of topics) {
    const positions = getPerspectivePositions(topic.category || '');
    for (const pos of positions) {
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
  }, 15); // high concurrency — Haiku is fast
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

      console.log(`pregenerate warm chunk ${chunk}/${chunks}: topics ${start}-${end-1} (${topics.length} topics)`);
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const stats  = await seedAllTakes(client, topics);
      if (chunk === 0) await redis.set(WARM_TS_KEY, new Date().toISOString(), { ex: 3600 });
      console.log(`pregenerate warm chunk ${chunk} done:`, stats);
      return res.json({ ok: true, warm: true, chunk, chunks, ...stats });
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

    // ── 3. Build topic shells ─────────────────────────────────────────────────
    const topics = buildTopics(clusters, trimmed);
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

    // ── 4. Seed Neutral takes while article data is in memory ────────────────
    // Neutral (pos=0) is the default view — pre-warm it now with real articles.
    // All other positions are filled by background warm chunks (no article data
    // needed — they use general knowledge via grounding rule 2b).
    // This keeps the cron well within the 60s limit: 95 × 1 pos @ concurrency=15
    // = 7 batches × ~1.4s = ~10s, vs 44s for all positions.
    const client     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const neutralMeta = TAKE_POSITIONS.find(p => p.position === 0);
    let generated = 0, alreadyCached = 0, errors = 0;
    await batch(topics, async (topic) => {
      const rKey = takeKey(topic, 0);
      try {
        const existing = await redis.get(rKey);
        if (existing && !isWeakTake(existing)) { alreadyCached++; return; }
        const take = await generateTake(client, topic, neutralMeta);
        await redis.set(rKey, take, { ex: TAKES_TTL_S });
        generated++;
      } catch (err) {
        console.warn(`neutral take failed "${topic.title}":`, err.message);
        errors++;
      }
    }, 15);
    const stats = { generated, alreadyCached, errors, total: topics.length };
    console.log('pregenerate neutral takes:', stats);

    // ── 5. Save slim topics to Redis (strip articles — avoids 1MB entry limit)
    // Articles are only needed for take generation (done above). Stored topics
    // are display-only shells; stream-take receives full topic from client anyway.
    const slimTopics = topics.map(({ articles: _a, ...rest }) => rest);
    const slimJson   = JSON.stringify(slimTopics);
    console.log(`pregenerate: saving ${slimTopics.length} slim topics (${Math.round(slimJson.length/1024)}KB)`);
    await redis.set(TOPICS_KEY,    slimTopics,               { ex: TOPICS_TTL_S });
    await redis.set(TOPICS_TS_KEY, new Date().toISOString());
    await redis.set(WARM_TS_KEY,   new Date().toISOString(), { ex: 3600 });

    return res.json({ ok:true, topics:topics.length, slimKB: Math.round(slimJson.length/1024), takes: stats });

  } catch (err) {
    console.error('pregenerate error:', err);
    return res.json({ ok:false, message: err.message || 'Pregenerate failed' });
  }
}
