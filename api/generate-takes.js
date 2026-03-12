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

// Example outlets per tier — injected into prompt for guidance
const TIER_OUTLETS = {
  left:   'NYT, CNN, MSNBC, NPR, Washington Post, Guardian, CBS News, NBC News',
  center: 'Reuters, AP, BBC, Axios, The Hill',
  right:  'Fox News, NY Post, Washington Times, Breitbart, Daily Caller',
};

// Generates ONE take at ONE position — stays well under 10s Vercel timeout
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

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Group articles by bias tier
    const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(none available)'
      : arr.map(a => `  • ${a.source}: "${a.title}" — ${a.description}`).join('\n');

    // Which source tier to draw from for this perspective
    const primaryTier   = meta.tier;
    const tierOutlets   = TIER_OUTLETS[primaryTier];
    const tierInstruct  =
      primaryTier === 'left'   ? `Draw primarily from the LEFT-LEANING sources (${tierOutlets}). Emphasize systemic causes, social impact, equity, and progressive solutions. Be skeptical of corporate/government power.`
    : primaryTier === 'right'  ? `Draw primarily from the RIGHT-LEANING sources (${tierOutlets}). Emphasize individual liberty, traditional values, free markets, national security, and limited government.`
    :                            `Draw from CENTER/NEUTRAL sources (${tierOutlets}). Present factual, balanced analysis without ideological spin.`;

    const prompt = `You are writing a ${meta.label} opinion piece on the news topic below.

${tierInstruct}

TOPIC: ${topic.title}
CONTEXT: ${topic.summary || '(no summary)'}

─── SOURCE ARTICLES BY BIAS TIER ───

[LEFT-LEANING] (NYT, CNN, MSNBC, NPR, Washington Post, Guardian, CBS, NBC):
${fmt(leftArts)}

[CENTER/NEUTRAL] (Reuters, AP, BBC, Axios, The Hill):
${fmt(centerArts)}

[RIGHT-LEANING] (Fox News, NY Post, Washington Times, Breitbart, Daily Caller):
${fmt(rightArts)}

─── TASK ───
Write 2 paragraphs (~150-180 words total) that sound authentically ${meta.label}.
- Synthesize from the sources — do NOT copy sentences verbatim
- Use the framing, language, and emphasis of that political viewpoint
- Cite 1-3 source articles that most inform this perspective

Return ONLY valid JSON (no markdown, no commentary):
{"take":{"position":${position},"label":"${meta.label}","text":"paragraph one\\n\\nparagraph two","sources":[{"name":"Source Name","framing":"One sentence on their framing","url":"https://..."}]}}

Only include URLs that appear verbatim in the articles above. Omit the url field if uncertain.`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!parsed.take) throw new Error('No take in response');

    return res.json({ take: { ...parsed.take, color: meta.color } });

  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
}
