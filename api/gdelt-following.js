// Standalone GDELT Following endpoint — fetches ongoing story threads and saves to Redis.
// Fast (~8-12s) since it only hits GDELT, no AI clustering or take generation.
// Called by the 6am cron AND can be triggered manually to seed Redis immediately.
import { redis } from '../lib/redis.js';
import { fetchGdeltFollowing } from '../lib/gdelt.js';

const FOLLOWING_KEY = 'sn:following:v1';
const FOLLOWING_TTL = 11 * 60 * 60; // 11h — matches topics TTL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const threads = await fetchGdeltFollowing();

    if (!threads.length) {
      return res.json({ ok: false, message: 'GDELT returned no threads' });
    }

    await redis.set(FOLLOWING_KEY, threads, { ex: FOLLOWING_TTL });
    console.log(`gdelt-following: saved ${threads.length} threads to Redis`);

    return res.json({ ok: true, threads: threads.length, labels: threads.map(t => t.title) });
  } catch (err) {
    console.error('gdelt-following error:', err);
    return res.json({ ok: false, message: err.message });
  }
}
