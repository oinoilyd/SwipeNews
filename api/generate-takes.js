import Anthropic from '@anthropic-ai/sdk';
import { redis, takeKey } from '../lib/redis.js';
import { TAKE_POSITIONS, isWeakTake, buildPrompt } from '../lib/perspectives.js';

// ── Server-side in-memory takes cache (warm Lambda instances share this) ──────
const takesCache  = new Map();
const CACHE_TTL   = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(topic, position) {
  const title = (topic.title || '').toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `${title}:${topic.latestPublishedAt || 'x'}:${position}`;
}
function getCached(key) {
  const entry = takesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { takesCache.delete(key); return null; }
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

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { topic, position, language = 'English' } = req.body || {};
  if (!topic?.title)
    return res.status(400).json({ error: 'Request body must include topic.title' });
  if (!Number.isInteger(position) || position < -3 || position > 3)
    return res.status(400).json({ error: 'position must be an integer from -3 to 3' });

  const meta      = TAKE_POSITIONS.find(p => p.position === position);
  const isEnglish = language === 'English';

  // ── Cache check: in-memory → Redis → Claude ─────────────────────────────────
  // Non-English takes use a language-scoped key and skip Redis (avoid pollution)
  const key   = isEnglish ? cacheKey(topic, position) : `${cacheKey(topic, position)}:${language}`;
  const inMem = getCached(key);
  if (inMem && !isWeakTake(inMem)) return res.json({ take: inMem, fromCache: true });
  if (inMem && isWeakTake(inMem))  takesCache.delete(key);

  // Only check Redis for English takes — translated takes are not cached in Redis
  const rKey = takeKey(topic, position);
  if (isEnglish) {
    try {
      const rCached = await redis.get(rKey);
      if (rCached && !isWeakTake(rCached)) {
        setCached(key, rCached);
        return res.json({ take: rCached, fromCache: true });
      }
      if (rCached && isWeakTake(rCached)) {
        await redis.del(rKey).catch(() => {});
      }
    } catch (err) {
      console.warn('Redis read failed, falling back to Claude:', err.message);
    }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { prompt, singleSource, derivedSources } = buildPrompt(topic, meta, language);

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text  = msg.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Claude response');

    const parsed = JSON.parse(match[0]);
    if (!parsed.take) throw new Error('No take in response');

    const take = { ...parsed.take, color: meta.color, sources: derivedSources };
    if (singleSource) take.singleSource = true;

    if (!isWeakTake(take)) {
      setCached(key, take);
      // Only persist English takes to Redis — translated takes live in client localStorage
      if (isEnglish) {
        try { await redis.set(rKey, take, { ex: 90000 }); } catch { /* ignore */ }
      }
    }

    return res.json({ take });

  } catch (err) {
    console.error('generate-takes error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate take' });
  }
}
