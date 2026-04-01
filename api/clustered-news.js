// /api/clustered-news — READ-ONLY Redis endpoint. Returns instantly.
//
// All heavy work (NewsData/GNews/RSS fetch, AI clustering, topic shells)
// lives in /api/pregenerate, triggered by Vercel cron at 6am daily.
// On cache miss we fire pregenerate in the background and return a 202
// loading state so the client retries after ~30 seconds.
//
// On cache HIT: if takes haven't been warmed in the last 30 min, fire
// a background warm so all perspectives are pre-cached silently.
import { redis, takeKey } from '../lib/redis.js';

// ── Must match CACHE_VERSION in pregenerate.js ────────────────────────────────
const CACHE_VERSION  = 'v9';
const REDIS_KEY      = `sn:topics:${CACHE_VERSION}`;
const REDIS_TS_KEY   = `sn:topics:ts:${CACHE_VERSION}`;
const WARM_TS_KEY    = `sn:takes:warmed-at`;          // tracks last warm run
const WARM_INTERVAL  = 30 * 60 * 1000;                // 30 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const [topics, ts, warmedAt] = await Promise.all([
      redis.get(REDIS_KEY),
      redis.get(REDIS_TS_KEY),
      redis.get(WARM_TS_KEY),
    ]);

    if (topics && Array.isArray(topics) && topics.length > 0) {
      const ageMin = ts
        ? Math.round((Date.now() - new Date(ts).getTime()) / 60000)
        : '?';
      console.log(`clustered-news: cache hit — ${topics.length} topics, ${ageMin}min old`);

      // ── Background take warm: fire if not warmed recently ─────────────────
      // Cron already generated [0, -3, 3]. Fire 2 position-targeted chunks
      // to fill the remaining positions:
      //   Chunk 0: positions -1, 1  (Center-Left / Center-Right)
      //   Chunk 1: positions -2, 2  (Left / Right)
      // Each runs all topics for its 2 positions — ~190 jobs @ concurrency=15
      // ≈ 13 batches × ~0.7s = ~10s, well within the 60s limit.
      const lastWarm  = warmedAt ? new Date(warmedAt).getTime() : 0;
      const needsWarm = (Date.now() - lastWarm) > WARM_INTERVAL;
      if (needsWarm) {
        const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
        const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
        console.log('clustered-news: firing 2 parallel warm chunks (positions ±1 and ±2)');
        // Stamp immediately so concurrent requests don't double-fire
        redis.set(WARM_TS_KEY, new Date().toISOString(), { ex: 3600 }).catch(() => {});
        const WARM_CHUNKS = [
          { chunk: 0, positions: '-1,1' },
          { chunk: 1, positions: '-2,2' },
        ];
        for (const { chunk, positions } of WARM_CHUNKS) {
          fetch(`${proto}://${host}/api/pregenerate?warm=1&chunk=${chunk}&chunks=1&positions=${positions}`, { method: 'POST' })
            .catch(err => console.warn(`Background warm chunk ${chunk} (${positions}) failed:`, err.message));
        }
      }

      // ── Bundle neutral takes for first 5 topics (Fix 2) ───────────────────
      // This eliminates the second round-trip for new users — they get topics
      // AND the first few cards' takes in a single response.
      // Cost: 5 parallel Redis reads (~5ms each) — negligible.
      const takes = {};
      try {
        const first5   = topics.slice(0, 5);
        const results  = await Promise.all(
          first5.map(t => redis.get(takeKey(t, 0)).catch(() => null))
        );
        first5.forEach((t, i) => {
          if (results[i]) takes[t.id] = { 0: results[i] };
        });
      } catch { /* non-fatal — client fetches on-demand if missing */ }

      return res.json({ topics, takes, fromCache: true });
    }

    // ── Cache miss: fire background pregenerate, return loading state ─────────
    console.log('clustered-news: cache miss — triggering background pregenerate');
    const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
    const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
    fetch(`${proto}://${host}/api/pregenerate`, { method: 'POST' })
      .catch(err => console.warn('Background pregenerate trigger failed:', err.message));

    return res.status(202).json({
      topics:  [],
      loading: true,
      message: 'Content is warming up — retrying in 30 seconds',
    });

  } catch (err) {
    console.error('clustered-news error:', err);
    return res.status(500).json({ error: err.message || 'Cache read failed' });
  }
}
