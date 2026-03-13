import { Redis } from '@upstash/redis';

// Gracefully degrade if env vars are missing (local dev without Redis)
let redis;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} else {
  // No-op stub — all methods return null/undefined so callers treat it as a cache miss
  redis = {
    get:      async () => null,
    set:      async () => null,
    hgetall:  async () => null,
    hincrby:  async () => 0,
    exists:   async () => 0,
  };
}

export { redis };

export function normKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
}

export function takeKey(topic, position) {
  return `sn:take:${normKey(topic.title)}:${topic.latestPublishedAt || 'x'}:${position}`;
}

export function voteKey(topic) {
  return `sn:votes:${normKey(topic.title)}`;
}
