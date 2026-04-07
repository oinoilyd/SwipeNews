// /api/gdelt-following — builds Following threads using Claude to dynamically
// cluster related topics into named buckets (e.g. "Iran Conflict", "Gaza War").
// No hardcoded keywords — Claude reads all current topics and decides which ones
// belong together, names each cluster, and skips one-off stories.
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../lib/redis.js';

const TOPICS_KEY    = 'sn:topics:v9';
const FOLLOWING_KEY = 'sn:following:v1';
const FOLLOWING_TTL = 26 * 60 * 60;

const HARD_NEWS = new Set([
  'US Politics', 'World', 'National Security', 'Economy', 'Policy', 'Elections', 'Health',
]);

// ── Claude-powered clustering ─────────────────────────────────────────────────
async function clusterWithClaude(topics) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const topicList = topics
    .map(t => `${t.id}|||${t.title} (${t.category || 'World'})`)
    .join('\n');

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a news editor identifying major ongoing event clusters for a "Following" feed.

TOPICS (format: id|||title):
${topicList}

Your job:
1. Find groups of 2+ topics that are clearly about the SAME ongoing event or situation
2. Name each group with a short, punchy 2-3 word label (e.g. "Iran Conflict", "Gaza War", "Ukraine Talks", "Trump Trial", "China Tariffs", "Border Crisis")
3. Skip one-off news items — only include developing/ongoing situations
4. Maximum 8 clusters, sorted by how many topics they contain (most first)
5. A topic can only belong to ONE cluster

Respond with ONLY this JSON, no prose, no markdown:
{"clusters":[{"name":"Iran Conflict","topicIds":["id1","id2"]},...]}`
    }],
  });

  const raw   = msg.content[0]?.text?.trim() || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON');

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.clusters)) throw new Error('No clusters array in response');
  return parsed.clusters;
}

// ── Keyword fallback (used if Claude fails) ───────────────────────────────────
const GEO = ['Gaza','Israel','Iran','Hamas','Hezbollah','Lebanon','Syria',
  'Russia','Ukraine','NATO','China','Taiwan','North Korea','Venezuela',
  'Cuba','Afghanistan','Pakistan','India','Sudan','Yemen','Iraq','Turkey',
  'Mexico','Europe'];

function keywordLabel(title, category) {
  const geo = GEO.find(e => new RegExp(`\\b${e}\\b`, 'i').test(title));
  const lower = title.toLowerCase();
  const type =
    /ceasefire|peace|negotiat|accord|agreement|talks?/.test(lower) ? 'Talks' :
    /war|invasion|offensive/.test(lower)                           ? 'War'   :
    /strike|airstrike|bombing|raid|attack/.test(lower)             ? 'Strike':
    /conflict|battle|fighting|clash/.test(lower)                   ? 'Conflict':
    /sanction|tariff|trade.war|embargo/.test(lower)                ? 'Sanctions':
    /election|vote|ballot/.test(lower)                             ? 'Election':
    /trial|indictment|arrest|charged/.test(lower)                  ? 'Trial' :
    /crisis|coup|collapse|unrest/.test(lower)                      ? 'Crisis':
    category === 'Economy'                                         ? 'Economy':
                                                                     category.split(/[\s&]/)[0];
  return geo ? `${geo} ${type}` : null;
}

function fallbackCluster(topics) {
  const map = new Map();
  for (const t of topics) {
    const label = keywordLabel(t.title, t.category);
    if (!label) continue;
    if (map.has(label)) {
      map.get(label).push(t.id);
    } else {
      map.set(label, [t.id]);
    }
  }
  return [...map.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([name, topicIds]) => ({ name, topicIds }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const allTopics = await redis.get(TOPICS_KEY);
    if (!allTopics?.length) {
      return res.json({ ok: false, message: 'No topics in Redis — run pregenerate first' });
    }

    // Only hard-news topics are candidates for Following
    const hardNews = allTopics.filter(t => HARD_NEWS.has(t.category || 'US Politics'));
    if (!hardNews.length) {
      return res.json({ ok: false, message: 'No hard-news topics found' });
    }

    // Build a fast lookup for article counts
    const articleCount = (t) =>
      Object.values(t.biasCounts || {}).reduce((s, n) => s + n, 0);

    // ── Attempt Claude clustering, fall back to keywords on error ─────────────
    let rawClusters;
    try {
      rawClusters = await clusterWithClaude(hardNews);
      console.log(`gdelt-following: Claude returned ${rawClusters.length} clusters`);
    } catch (err) {
      console.warn('gdelt-following: Claude clustering failed, using keyword fallback:', err.message);
      rawClusters = fallbackCluster(hardNews);
    }

    // Validate + build final threads
    const validIds = new Set(hardNews.map(t => t.id));

    const threads = rawClusters
      .map((c, i) => {
        // Filter to IDs that actually exist in our topic pool
        const ids = (c.topicIds || []).filter(id => validIds.has(id));
        if (ids.length < 2) return null; // enforce minimum

        const totalArticles = ids.reduce((sum, id) => {
          const t = hardNews.find(x => x.id === id);
          return sum + articleCount(t || {});
        }, 0);

        return {
          id:           `following-${i}`,
          title:        c.name,
          topicIds:     ids,
          articleCount: totalArticles,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.topicIds.length - a.topicIds.length || b.articleCount - a.articleCount)
      .slice(0, 10);

    if (!threads.length) {
      return res.json({ ok: false, message: 'No clusters with 2+ topics found' });
    }

    await redis.set(FOLLOWING_KEY, threads, { ex: FOLLOWING_TTL });
    console.log(`gdelt-following: saved ${threads.length} threads:`, threads.map(t => `${t.title}(${t.topicIds.length})`).join(', '));

    return res.json({ ok: true, threads: threads.length, labels: threads.map(t => ({ name: t.title, cards: t.topicIds.length })) });

  } catch (err) {
    console.error('gdelt-following error:', err);
    return res.json({ ok: false, message: err.message });
  }
}
