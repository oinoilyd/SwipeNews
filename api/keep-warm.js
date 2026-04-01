// /api/keep-warm — lightweight ping to prevent Vercel cold starts.
//
// Hits the two slowest-to-cold-start functions (clustered-news + generate-takes)
// so Lambda containers stay alive between real user requests.
// Scheduled every 5 minutes via vercel.json cron.
//
// Each ping is a cheap Redis read — no Claude calls, no heavy work.
export const maxDuration = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
  const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
  const base  = `${proto}://${host}`;

  const start = Date.now();

  // Ping both endpoints in parallel — both are Redis-only reads when cache is warm
  const [newsResult, takesResult] = await Promise.allSettled([
    fetch(`${base}/api/clustered-news`, { method: 'GET' })
      .then(r => ({ status: r.status, ok: r.ok }))
      .catch(err => ({ error: err.message })),
    // Ping generate-takes with a minimal well-formed body so it hits
    // the in-memory cache path and returns immediately
    fetch(`${base}/api/generate-takes`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topic: { title: '__warmup__', id: '__warmup__' }, position: 0 }),
    })
      .then(r => ({ status: r.status, ok: r.ok }))
      .catch(err => ({ error: err.message })),
  ]);

  const elapsed = Date.now() - start;
  console.log(`keep-warm: done in ${elapsed}ms`, {
    clustered: newsResult.value ?? newsResult.reason,
    takes:     takesResult.value ?? takesResult.reason,
  });

  return res.json({
    ok:      true,
    elapsed,
    results: {
      clusteredNews: newsResult.value ?? { error: newsResult.reason?.message },
      generateTakes: takesResult.value ?? { error: takesResult.reason?.message },
    },
  });
}
