import { redis, normKey } from '../lib/redis.js';

function getKey(title) {
  return `sn:votes:${normKey(title)}`;
}

function int(val) {
  return Math.max(0, parseInt(val ?? '0', 10) || 0);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /api/votes?topicTitle=xxx ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { topicTitle } = req.query || {};
    if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });

    try {
      const raw = await redis.hgetall(getKey(topicTitle));
      return res.json({ up: int(raw?.up), down: int(raw?.down) });
    } catch (err) {
      console.error('votes GET error:', err.message);
      return res.json({ up: 0, down: 0 });
    }
  }

  // ── POST /api/votes { topicTitle, direction } ─────────────────────────────
  // direction: 'up' | 'down' | 'remove-up' | 'remove-down' | 'switch-to-up' | 'switch-to-down'
  if (req.method === 'POST') {
    const { topicTitle, direction } = req.body || {};
    if (!topicTitle) return res.status(400).json({ error: 'topicTitle required' });

    const validDirections = ['up', 'down', 'remove-up', 'remove-down', 'switch-to-up', 'switch-to-down'];
    if (!validDirections.includes(direction)) {
      return res.status(400).json({ error: 'invalid direction' });
    }

    try {
      const key = getKey(topicTitle);

      if (direction === 'up')            await redis.hincrby(key, 'up',    1);
      else if (direction === 'down')     await redis.hincrby(key, 'down',  1);
      else if (direction === 'remove-up')   await redis.hincrby(key, 'up',   -1);
      else if (direction === 'remove-down') await redis.hincrby(key, 'down', -1);
      else if (direction === 'switch-to-up')   { await redis.hincrby(key, 'up', 1);   await redis.hincrby(key, 'down', -1); }
      else if (direction === 'switch-to-down') { await redis.hincrby(key, 'down', 1); await redis.hincrby(key, 'up',   -1); }

      const raw  = await redis.hgetall(key);
      return res.json({ up: int(raw?.up), down: int(raw?.down) });
    } catch (err) {
      console.error('votes POST error:', err.message);
      return res.status(500).json({ error: err.message || 'Failed to record vote' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
