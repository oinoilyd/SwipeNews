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

const TIER_OUTLETS = {
  left:   'NYT, CNN, MSNBC, NPR, Washington Post, Guardian, CBS News, NBC News',
  center: 'Reuters, AP, BBC, Axios, The Hill',
  right:  'Fox News, NY Post, Washington Times, Breitbart, Daily Caller',
};

async function batch(items, fn, concurrency = 10) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    results.push(...await Promise.all(slice.map(fn)));
  }
  return results;
}

async function generateTake(client, topic, meta) {
  const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
  const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
  const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

  const fmt = (arr) => arr.length === 0
    ? '(none)'
    : arr.map(a => `  • ${a.source}: "${a.title}"`).join('\n');

  const primaryTier  = meta.tier;
  const tierInstruct =
    primaryTier === 'left'   ? `Emphasize systemic causes, equity, and progressive framing. Draw from ${TIER_OUTLETS.left}.`
  : primaryTier === 'right'  ? `Emphasize individual liberty, free markets, and conservative framing. Draw from ${TIER_OUTLETS.right}.`
  :                            `Present balanced, factual analysis without spin. Draw from ${TIER_OUTLETS.center}.`;

  const primaryArts = primaryTier === 'left' ? leftArts : primaryTier === 'right' ? rightArts : centerArts;
  const otherArts   = primaryTier === 'left' ? [...centerArts, ...rightArts]
                    : primaryTier === 'right' ? [...centerArts, ...leftArts]
                    : [...leftArts, ...rightArts];

  const prompt = `Write a ${meta.label} perspective on this news topic in exactly 3-4 sentences (50-80 words). Be direct and punchy. ${tierInstruct}

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY valid JSON:
{"take":{"position":${meta.position},"label":"${meta.label}","text":"3-4 sentence take here","sources":[{"name":"Source Name","framing":"One brief framing note"}]}}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    // Fetch current topics from Redis or live endpoint
    let topics;
    const cachedTopics = await redis.get('sn:topics');
    if (cachedTopics) {
      topics = cachedTopics;
    } else {
      // Fallback: hit clustered-news to generate topics
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
      const newsRes = await fetch(`${baseUrl}/api/clustered-news`);
      if (!newsRes.ok) throw new Error(`clustered-news returned ${newsRes.status}`);
      const newsData = await newsRes.json();
      if (!newsData.topics?.length) throw new Error('No topics from clustered-news');
      topics = newsData.topics;
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let generated = 0;
    let cached    = 0;
    let errors    = 0;

    // Build all (topic, position) pairs
    const pairs = [];
    for (const topic of topics) {
      for (const meta of TAKE_POSITIONS) {
        pairs.push({ topic, meta });
      }
    }

    await batch(pairs, async ({ topic, meta }) => {
      const rKey = takeKey(topic, meta.position);
      try {
        const existing = await redis.get(rKey);
        if (existing) {
          cached++;
          return;
        }

        const take = await generateTake(client, topic, meta);
        await redis.set(rKey, take, { ex: 7200 });
        generated++;
      } catch (err) {
        console.warn(`pregenerate: failed ${topic.title} pos ${meta.position}:`, err.message);
        errors++;
      }
    }, 10);

    return res.json({
      ok: true,
      topics:    topics.length,
      generated,
      cached,
      errors,
    });

  } catch (err) {
    console.error('pregenerate error:', err);
    return res.status(500).json({ error: err.message || 'Failed to pregenerate' });
  }
}
