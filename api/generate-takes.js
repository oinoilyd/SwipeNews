import Anthropic from '@anthropic-ai/sdk';

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

// ── Server-side takes cache (warm Lambda instances share this) ────────────────
const takesCache = new Map();
const TAKES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(topic, position) {
  const title = (topic.title || '').toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `${title}:${topic.latestPublishedAt || 'x'}:${position}`;
}

function getCached(key) {
  const entry = takesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TAKES_CACHE_TTL) { takesCache.delete(key); return null; }
  return entry.take;
}

function setCached(key, take) {
  takesCache.set(key, { take, ts: Date.now() });
}

// Generates ONE take at ONE position
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { topic, position } = req.body || {};

  if (!topic?.title || !Array.isArray(topic?.articles)) {
    return res.status(400).json({ error: 'Request body must include topic.title and topic.articles[]' });
  }
  if (!Number.isInteger(position) || position < -3 || position > 3) {
    return res.status(400).json({ error: 'position must be an integer from -3 to 3' });
  }

  const meta = TAKE_POSITIONS.find(p => p.position === position);

  // ── Cache hit — return immediately ───────────────────────────────────────
  const key = cacheKey(topic, position);
  const cached = getCached(key);
  if (cached) return res.json({ take: cached, fromCache: true });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
{"take":{"position":${position},"label":"${meta.label}","text":"3-4 sentence take here","sources":[{"name":"Source Name","framing":"One brief framing note"}]}}`;

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

    const take = { ...parsed.take, color: meta.color };
    setCached(key, take);
    return res.json({ take });

  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
}
