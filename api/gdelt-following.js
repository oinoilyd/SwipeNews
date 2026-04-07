// /api/gdelt-following — builds Following threads from existing Redis topics.
// No external API needed — uses topics already clustered by Claude in pregenerate.
// "Following" = hard-news topics covered by multiple bias tiers (contested = developing).
import { redis } from '../lib/redis.js';

const TOPICS_KEY    = 'sn:topics:v9';
const FOLLOWING_KEY = 'sn:following:v1';
const FOLLOWING_TTL = 11 * 60 * 60;

const HARD_NEWS = new Set([
  'US Politics', 'World', 'National Security', 'Economy', 'Policy', 'Elections', 'Health',
]);

const SKIP_ENTITIES = new Set([
  'Trump', 'Biden', 'Harris', 'Obama', 'White', 'House', 'Senate', 'Congress',
  'Republican', 'Democrat', 'President', 'Federal', 'Administration',
  'United', 'States', 'American', 'Government', 'Officials',
  // days & months
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'January','February','March','April','June','July','August',
  'September','October','November','December',
  // holidays & generic words that make bad labels
  'Easter','Christmas','Thanksgiving','Holiday',
  'Amendment','Section','Article','Report','Law','Bill','Act','Plan',
  'Budget','Defense','Security','Policy','Committee','Court','Judge',
  'Party','State','City','County','Agency','Office','Department',
  'Vote','Rally','Deal','Move','Push','Call','Says','News','Week',
  // common first names that slip through
  'Steve','John','Mike','Chris','James','Robert','David','Richard','Mark',
  'Scott','Brian','Kevin','Paul','George','Jack','Peter',
]);

// Known geographic / geopolitical entities — checked first for better labels
const GEO_ENTITIES = [
  'Gaza', 'Israel', 'Hamas', 'Hezbollah', 'Iran', 'Lebanon', 'Syria',
  'Russia', 'Ukraine', 'NATO', 'Putin', 'Zelensky',
  'China', 'Taiwan', 'Beijing', 'Hong Kong',
  'North Korea', 'Kim', 'South Korea',
  'Venezuela', 'Cuba', 'Nicaragua', 'Haiti', 'Peru', 'Colombia', 'Brazil',
  'Afghanistan', 'Pakistan', 'India', 'Myanmar', 'Philippines',
  'Saudi', 'Yemen', 'Iraq', 'Turkey', 'Egypt', 'Sudan', 'Libya', 'Ethiopia',
  'Mexico', 'Canada', 'Europe', 'Arctic', 'Japan',
];

function topicToLabel(title, category) {
  const lower = title.toLowerCase();

  // Type detection
  let type = '';
  if (/ceasefire|peace.talks?|negotiat|accord|agreement/.test(lower))      type = 'Talks';
  else if (/war|invasion|offensive/.test(lower))                            type = 'War';
  else if (/airstrike|bombing|strike|raid/.test(lower))                     type = 'Strike';
  else if (/battle|combat|fighting|clash|conflict|attack/.test(lower))      type = 'Conflict';
  else if (/nuclear|missile|ballistic|warhead/.test(lower))                 type = 'Threat';
  else if (/sanction|tariff|trade.war|embargo/.test(lower))                 type = 'Sanctions';
  else if (/election|vote|ballot|referendum/.test(lower))                   type = 'Election';
  else if (/coup|unrest|protest|riot/.test(lower))                          type = 'Crisis';
  else if (/crisis|collapse/.test(lower))                                   type = 'Crisis';
  else if (/disaster|earthquake|hurricane|flood|wildfire/.test(lower))      type = 'Disaster';
  else if (/outbreak|pandemic|epidemic/.test(lower))                        type = 'Outbreak';
  else if (/trial|indictment|arrest|charged/.test(lower))                   type = 'Trial';
  else if (/deal|agreement|summit|treaty/.test(lower))                      type = 'Deal';
  else if (category === 'Economy')                                           type = 'Economy';
  else if (category === 'National Security')                                 type = 'Security';
  else                                                                       type = category.split(/[\s&]/)[0];

  // 1. Known geo entity match — most reliable
  const geoMatch = GEO_ENTITIES.find(e => new RegExp(`\\b${e}\\b`, 'i').test(title));
  if (geoMatch) return `${geoMatch} ${type}`.trim();

  // 2. First Title-Case word not in skip list and long enough
  const words = title.replace(/[—–-]/g, ' ').split(/\s+/);
  const entity = words.find(w => {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    return /^[A-Z]/.test(w) && clean.length > 3 && !SKIP_ENTITIES.has(clean);
  });
  if (entity) return `${entity.replace(/[^a-zA-Z]/g, '')} ${type}`.trim();

  // Final fallback: first two words
  return title.split(' ').slice(0, 2).join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const topics = await redis.get(TOPICS_KEY);
    if (!topics?.length) {
      return res.json({ ok: false, message: 'No topics in Redis yet — run pregenerate first' });
    }

    // Filter to hard news only
    const hardNews = topics.filter(t => HARD_NEWS.has(t.category || 'US Politics'));

    // Score by cross-tier coverage: stories covered left AND right are most contested/developing
    const scored = hardNews.map(t => {
      const c = t.biasCounts || {};
      const total = (c.left || 0) + (c.center || 0) + (c.right || 0);
      const tiers  = (c.left > 0 ? 1 : 0) + (c.center > 0 ? 1 : 0) + (c.right > 0 ? 1 : 0);
      return { topic: t, score: total * tiers };
    });

    scored.sort((a, b) => b.score - a.score);

    // Build threads from top 15 — deduplicate labels
    const usedLabels = new Set();
    const threads = [];

    for (const { topic } of scored) {
      if (threads.length >= 15) break;
      const label = topicToLabel(topic.title, topic.category);
      if (usedLabels.has(label)) continue;
      usedLabels.add(label);

      threads.push({
        id:           `following-${threads.length}`,
        title:        label,
        fullTitle:    topic.title,
        topicIds:     [topic.id],
        articleCount: Object.values(topic.biasCounts || {}).reduce((s, n) => s + n, 0),
        image:        topic.urlToImage || null,
        keywords:     label.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean),
      });
    }

    if (!threads.length) {
      return res.json({ ok: false, message: 'No qualifying hard-news topics found' });
    }

    await redis.set(FOLLOWING_KEY, threads, { ex: FOLLOWING_TTL });
    console.log(`gdelt-following: saved ${threads.length} threads`);

    return res.json({ ok: true, threads: threads.length, labels: threads.map(t => t.title) });
  } catch (err) {
    console.error('gdelt-following error:', err);
    return res.json({ ok: false, message: err.message });
  }
}
