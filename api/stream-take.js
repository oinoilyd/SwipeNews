import Anthropic from '@anthropic-ai/sdk';
import { redis, takeKey } from '../lib/redis.js';
import { TAKE_POSITIONS, isWeakTake, buildPrompt } from '../lib/perspectives.js';

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { topic, position } = req.body || {};
  if (!topic?.title)
    return res.status(400).json({ error: 'topic.title required' });
  if (!Number.isInteger(position) || position < -3 || position > 3)
    return res.status(400).json({ error: 'position must be -3 to 3' });

  const meta = TAKE_POSITIONS.find(p => p.position === position);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    // Check Redis cache — if found and valid, return immediately
    const rKey   = takeKey(topic, position);
    const cached = await redis.get(rKey);
    if (cached && !isWeakTake(cached)) {
      send(res, { done: true, take: cached });
      return res.end();
    }
    if (cached && isWeakTake(cached)) {
      await redis.del(rKey).catch(() => {});
    }

    // Build prompt via shared perspectives module
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { prompt, effectiveLabel, singleSource, derivedSources } = buildPrompt(topic, meta);

    let fullText = '';

    const stream = await client.messages.stream({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const token = chunk.delta.text;
        fullText += token;
        send(res, { token });
      }
    }

    // Parse and cache result
    const match = fullText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.take) {
          const take = { ...parsed.take, color: meta.color, sources: derivedSources };
          if (singleSource) take.singleSource = true;
          if (!isWeakTake(take)) {
            await redis.set(rKey, take, { ex: 90000 }); // 25h — matches cron TTL
          }
          send(res, { done: true, take });
        }
      } catch {
        send(res, { done: true, take: null, error: 'JSON parse failed' });
      }
    } else {
      send(res, { done: true, take: null, error: 'No JSON in response' });
    }

    return res.end();

  } catch (err) {
    console.error('stream-take error:', err);
    try {
      send(res, { done: true, take: null, error: err.message });
      res.end();
    } catch { /* response already ended */ }
  }
}
