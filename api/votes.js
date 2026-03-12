// ── Upstash Redis REST client (no SDK needed — plain fetch) ───────────────────
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisPipe(commands) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`);
  const arr = await res.json();
  return arr.map(item => item.result);
}

function int(val) { return Math.max(0, parseInt(val ?? '0', 10) || 0); }

// ── Serverless handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Graceful degradation when Redis is not configured
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.json({ up: 0, down: 0, unavailable: true });
  }

  // ── GET /api/votes?topicId=... ────────────────────────────────────────────
  if (req.method === 'GET') {
    const { topicId } = req.query || {};
    if (!topicId) return res.status(400).json({ error: 'topicId query param required' });

    try {
      const [up, down] = await redisPipe([
        ['GET', `votes:up:${topicId}`],
        ['GET', `votes:down:${topicId}`],
      ]);
      return res.json({ up: int(up), down: int(down) });
    } catch (err) {
      console.error('votes GET error:', err.message);
      return res.json({ up: 0, down: 0 });
    }
  }

  // ── POST /api/votes  { topicId, vote: "up"|"down" } ──────────────────────
  if (req.method === 'POST') {
    const { topicId, vote } = req.body || {};
    if (!topicId || !['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: 'topicId and vote ("up" or "down") required' });
    }

    try {
      // INCR the chosen counter, then GET both for the response
      const results = await redisPipe([
        ['INCR', `votes:${vote}:${topicId}`],
        ['GET',  `votes:up:${topicId}`],
        ['GET',  `votes:down:${topicId}`],
      ]);
      return res.json({ up: int(results[1]), down: int(results[2]) });
    } catch (err) {
      console.error('votes POST error:', err.message);
      return res.status(500).json({ error: 'Vote could not be recorded' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
