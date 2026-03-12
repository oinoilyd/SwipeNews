import Anthropic from '@anthropic-ai/sdk';

const TAKE_POSITIONS = [
  { position: -3, label: 'Far Left',     color: '#1d4ed8' },
  { position: -2, label: 'Left',         color: '#3b82f6' },
  { position: -1, label: 'Center-Left',  color: '#818cf8' },
  { position:  0, label: 'Neutral',      color: '#a78bfa' },
  { position:  1, label: 'Center-Right', color: '#f97316' },
  { position:  2, label: 'Right',        color: '#ef4444' },
  { position:  3, label: 'Far Right',    color: '#dc2626' },
];

// ── Generates ONE take for ONE position — stays well under 10s Vercel timeout ─
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

    const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(none)'
      : arr.map(a => `  - ${a.source}: "${a.title}" — ${a.description}`).join('\n');

    const prompt = `Write a single 2-paragraph opinion piece (150-200 words) on this news topic from a ${meta.label} political perspective. Synthesize the sources — do NOT copy them verbatim.

TOPIC: ${topic.title}
SUMMARY: ${topic.summary || ''}

SOURCES:
[LEFT] ${fmt(leftArts)}
[CENTER] ${fmt(centerArts)}
[RIGHT] ${fmt(rightArts)}

The writing must sound authentically ${meta.label}: use the framing, language, and emphasis that genuinely reflects that political stance.

Return ONLY valid JSON, no markdown:
{"take":{"position":${position},"label":"${meta.label}","text":"paragraph one\\n\\nparagraph two","sources":[{"name":"Source Name","framing":"One sentence on how they framed it","url":"https://..."}]}}

1-3 sources. Only use URLs from the articles above — omit the url field if uncertain.`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!parsed.take) throw new Error('No take in response');

    return res.json({ take: { ...parsed.take, color: meta.color } });

  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
}
