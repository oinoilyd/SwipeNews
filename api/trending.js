import { redis, normKey } from '../lib/redis.js';

function int(val) {
  return Math.max(0, parseInt(val ?? '0', 10) || 0);
}

// POST /api/trending
// body: { topics: [{ title, articleCount }] }
// Returns top 10 sorted by net votes (up - down), article count as tiebreaker
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topics } = req.body || {};
  if (!Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'topics array required' });
  }

  try {
    const withVotes = await Promise.all(
      topics.map(async (t) => {
        try {
          const raw = await redis.hgetall(`sn:votes:${normKey(t.title)}`);
          const up   = int(raw?.up);
          const down = int(raw?.down);
          return { title: t.title, up, down, net: up - down, articleCount: t.articleCount ?? 0 };
        } catch {
          return { title: t.title, up: 0, down: 0, net: 0, articleCount: t.articleCount ?? 0 };
        }
      })
    );

    const trending = withVotes
      .sort((a, b) => b.net - a.net || b.articleCount - a.articleCount)
      .slice(0, 10);

    return res.json({ trending });
  } catch (err) {
    console.error('trending error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch trending' });
  }
}
