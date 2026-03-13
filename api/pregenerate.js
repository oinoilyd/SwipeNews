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

const POSITION_VOICE = {
  '-3': `You are writing from a FAR LEFT worldview. Center your analysis on class struggle, systemic oppression, corporate power, and anti-imperialism. On immigration: migrants are displaced by US foreign policy and corporate exploitation — enforcement is state violence against the vulnerable. On economy: inequality is a feature, not a bug, of capitalism. On national security: the military-industrial complex profits from endless war. Sound like a democratic socialist who reads Jacobin and The Intercept.`,
  '-2': `You are writing from a LEFT-LIBERAL worldview. Emphasize systemic racism, climate urgency, healthcare and housing as human rights, and immigration as both a humanitarian obligation and economic asset. On immigration: highlight family separation, DACA, economic contributions. On economy: the rich aren't paying their fair share; invest in people. Sound like a mainstream progressive Democrat — think AOC or a New York Times opinion columnist.`,
  '-1': `You are writing from a CENTER-LEFT worldview. Favor evidence-based, pragmatic reform over ideological purity. Support regulated capitalism with robust social safety nets. On immigration: back comprehensive reform with managed enforcement and clear legal pathways. On economy: fiscal responsibility paired with smart investment in public goods. Sound like a thoughtful Brookings Institution analyst or a moderate Senate Democrat.`,
   '0': `You are writing a NEUTRAL, strictly factual analysis. Report what happened, what experts say, and where genuine disagreement exists — without framing it toward any side. Acknowledge multiple valid perspectives without endorsing any. Sound like an AP wire reporter or a nonpartisan CBO report. Zero spin. Zero advocacy.`,
   '1': `You are writing from a CENTER-RIGHT worldview. Prioritize fiscal conservatism, rule of law, individual liberty, and limited government. On immigration: support legal immigration pathways while opposing illegal border crossing; favor managed enforcement. On economy: markets over mandates, debt matters, deregulation creates growth. Sound like a Wall Street Journal editorial board member or a Romney-era Republican.`,
   '2': `You are writing from a RIGHT CONSERVATIVE worldview. Emphasize American sovereignty, strong borders, traditional values, free enterprise, and personal responsibility. On immigration: illegal entry is a crime; costs to taxpayers are real; deportation of criminal aliens is non-negotiable. On economy: cut taxes, cut spending, get government out of the way. Sound like mainstream Fox News conservatism or a Heritage Foundation policy brief.`,
   '3': `You are writing from a FAR RIGHT NATIONALIST worldview. Lead with America First, populist skepticism of globalism, elites, and institutions. On immigration: frame it as an invasion; demand the wall, mass deportation, and zero tolerance. On national security: hawkish military posture, nuclear deterrence, protect critical infrastructure from China and adversaries; domestic enemies are real. On economy: economic nationalism, tariffs, bring back manufacturing. Sound like someone who reads Breitbart and believes the GOP establishment has sold out the American people.`,
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

  const primaryTier = meta.tier;
  const primaryArts = primaryTier === 'left' ? leftArts : primaryTier === 'right' ? rightArts : centerArts;
  const otherArts   = primaryTier === 'left' ? [...centerArts, ...rightArts]
                    : primaryTier === 'right' ? [...centerArts, ...leftArts]
                    : [...leftArts, ...rightArts];

  const positionVoice = POSITION_VOICE[String(meta.position)] || `Write a ${meta.label} perspective on this topic.`;

  const prompt = `${positionVoice}

Do NOT just rephrase the same facts with different adjectives. Ask yourself: what would a thoughtful person from this political tradition ACTUALLY focus on, worry about, and argue here? Write 3-4 punchy sentences (50-80 words) from that authentic place.

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES (${meta.label}-leaning):
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
