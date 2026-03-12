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

// ── Serverless handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { topic } = req.body || {};
  if (!topic?.title || !Array.isArray(topic?.articles)) {
    return res.status(400).json({ error: 'Request body must include topic.title and topic.articles[]' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const leftArts   = topic.articles.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = topic.articles.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = topic.articles.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(no articles from this tier)'
      : arr.map(a => `  - ${a.source}: "${a.title}" — ${a.description}`).join('\n');

    const prompt = `Generate 7 distinct political perspectives on this news topic. Each perspective is a 2-paragraph synthesized opinion (NOT copied verbatim from any source — Claude should synthesize and write its own take).

TOPIC: ${topic.title}
TOPIC SUMMARY: ${topic.summary || ''}

SOURCE ARTICLES BY BIAS TIER:

[LEFT-LEANING SOURCES]
${fmt(leftArts)}

[CENTER/NEUTRAL SOURCES]
${fmt(centerArts)}

[RIGHT-LEANING SOURCES]
${fmt(rightArts)}

Return ONLY valid JSON with no markdown:
{"takes":[
  {"position":-3,"label":"Far Left","text":"2 paragraphs from far-left viewpoint...","sources":[{"name":"CNN","framing":"One sentence describing how they framed it","url":"https://..."}]},
  {"position":-2,"label":"Left","text":"...","sources":[...]},
  {"position":-1,"label":"Center-Left","text":"...","sources":[...]},
  {"position":0,"label":"Neutral","text":"...","sources":[...]},
  {"position":1,"label":"Center-Right","text":"...","sources":[...]},
  {"position":2,"label":"Right","text":"...","sources":[...]},
  {"position":3,"label":"Far Right","text":"...","sources":[...]}
]}

Each take must sound authentic to that political viewpoint — use language, framing, and emphasis that genuinely reflects that stance. 1-3 sources per take. Only use URLs from the articles above (omit url field if uncertain).`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.takes) || parsed.takes.length !== 7) {
      throw new Error(`Expected 7 takes, got ${parsed.takes?.length ?? 0}`);
    }

    // Merge colors from TAKE_POSITIONS
    const takes = parsed.takes.map(t => ({
      ...t,
      color: TAKE_POSITIONS.find(p => p.position === t.position)?.color || '#a78bfa',
    }));

    return res.json({ takes });

  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate takes' });
  }
}
