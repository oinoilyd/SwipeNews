// GDELT v2 Doc API — completely free, no key required.
// Fetches top ongoing hard-news narratives for the "Following" feature.
const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Hard-news theme queries — each targets a distinct ongoing-story type.
// GDELT's "sourcelang:english" filter restricts to English-language articles.
const GDELT_QUERIES = [
  'war conflict "military operation"',
  'nuclear missile "weapons program"',
  'sanctions "trade war" tariffs',
  'election vote referendum',
  '"economic crisis" recession inflation',
  'earthquake hurricane flood wildfire',
  'ceasefire "peace talks" diplomacy',
  'refugee migration "border crisis"',
  'terrorism attack bombing',
  'coup protest "civil unrest"',
  'pandemic outbreak "public health emergency"',
  'hostage kidnapping crisis',
];

// Soft-news/sports/entertainment domains to exclude from Following
const EXCLUDE_DOMAINS = new Set([
  'people.com','tmz.com','eonline.com','espn.com','bleacherreport.com',
  'sbnation.com','theonion.com','buzzfeed.com','rollingstone.com',
  'variety.com','hollywoodreporter.com','usmagazine.com','ew.com',
  'sportingnews.com','cbssports.com','nfl.com','nba.com','mlb.com',
  'nhl.com','pagesix.com','dailymail.co.uk','mirror.co.uk','thesun.co.uk',
]);

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','are','was',
  'as','by','with','that','this','its','it','be','has','had','have','will',
  'from','but','not','were','after','over','says','amid','new','how','why',
  'what','who','when','where','more','than','amid','say','said','says',
]);

function titleWords(t) {
  return new Set(
    (t || '').toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function titleSim(a, b) {
  const sa = titleWords(a), sb = titleWords(b);
  const intersection = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

async function fetchGdeltQuery(query) {
  try {
    const params = new URLSearchParams({
      query:      `${query} sourcelang:english`,
      mode:       'ArtList',
      maxrecords: '25',
      timespan:   '7d',
      sort:       'HybridRel',
      format:     'json',
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${GDELT_BASE}?${params}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || [])
      .map(a => ({
        title:    a.title    || '',
        url:      a.url      || '',
        domain:   a.domain   || '',
        seendate: a.seendate || '',
        image:    a.socialimage || null,
      }))
      .filter(a => a.title && a.url && !EXCLUDE_DOMAINS.has(a.domain));
  } catch {
    return [];
  }
}

function clusterGdelt(articles) {
  const clusters = [];
  for (const art of articles) {
    let bestIdx = -1, bestSim = 0;
    for (let i = 0; i < clusters.length; i++) {
      const sim = titleSim(art.title, clusters[i].title);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    }
    if (bestSim >= 0.22 && bestIdx >= 0) {
      clusters[bestIdx].articles.push(art);
      // Update representative image if not set
      if (!clusters[bestIdx].image && art.image) clusters[bestIdx].image = art.image;
    } else {
      clusters.push({ title: art.title, articles: [art], image: art.image });
    }
  }
  // Only keep clusters with ≥2 sources — single article = not truly "ongoing"
  return clusters
    .filter(c => c.articles.length >= 2)
    .sort((a, b) => b.articles.length - a.articles.length);
}

// Generate a short broad label ("Iran Conflict", "Gaza Ceasefire", "Venezuela Crisis")
// from the representative articles in a cluster — no API call needed.
function generateLabel(cluster) {
  const allText = cluster.articles.map(a => a.title).join(' ');
  const lower   = allText.toLowerCase();

  // Determine the story type from keywords
  let type = '';
  if (/ceasefire|peace.talks|negotiat|accord|deal/.test(lower))          type = 'Talks';
  else if (/war|invasion|offensive|battle|airstrike|bombardment/.test(lower)) type = 'War';
  else if (/conflict|fighting|clash|skirmish|attack/.test(lower))        type = 'Conflict';
  else if (/nuclear|missile|ballistic|warhead|weapons.program/.test(lower)) type = 'Threat';
  else if (/sanction|tariff|trade.war|embargo/.test(lower))               type = 'Sanctions';
  else if (/election|vote|ballot|referendum|campaign/.test(lower))        type = 'Election';
  else if (/crisis|collapse|emergency|coup|unrest|protest/.test(lower))  type = 'Crisis';
  else if (/disaster|earthquake|hurricane|flood|wildfire/.test(lower))   type = 'Disaster';
  else if (/outbreak|pandemic|epidemic|disease/.test(lower))             type = 'Outbreak';
  else if (/hostage|kidnap/.test(lower))                                  type = 'Hostage Crisis';

  // Extract proper-noun sequences (runs of Title-Cased words)
  const entities = (allText.match(/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,2})\b/g) || [])
    .filter(e => !STOP_WORDS.has(e.toLowerCase()) && e.length > 2);

  // Count frequency, skip generic words
  const SKIP = new Set(['The','This','His','Her','Its','Our','New','More','Last','First','US','UN','EU','UK','NATO']);
  const freq = {};
  for (const e of entities) {
    if (SKIP.has(e)) continue;
    freq[e] = (freq[e] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([e]) => e);

  // Build label: top entity + type
  if (top.length > 0) {
    // Prefer the shortest meaningful entity (avoids "The United States Congress")
    const entity = top.find(e => e.split(' ').length <= 2) || top[0];
    return type ? `${entity} ${type}` : entity;
  }

  // Fallback: first 3 words of cluster title
  return cluster.title.split(' ').slice(0, 3).join(' ');
}

export async function fetchGdeltFollowing() {
  const results = await Promise.allSettled(
    GDELT_QUERIES.map(q => fetchGdeltQuery(q))
  );

  // Deduplicate across query results by URL
  const seen = new Set();
  const allArticles = results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

  console.log(`gdelt: ${allArticles.length} unique articles from ${GDELT_QUERIES.length} queries`);
  const clusters = clusterGdelt(allArticles);
  console.log(`gdelt: ${clusters.length} clusters, keeping top 12`);

  return clusters.slice(0, 12).map((c, i) => ({
    id:           `following-${i}`,
    title:        generateLabel(c),
    articleCount: c.articles.length,
    image:        c.image || null,
    gdeltArticles: c.articles.slice(0, 5).map(a => ({
      title:    a.title,
      url:      a.url,
      domain:   a.domain,
      seendate: a.seendate,
    })),
    keywords: [...titleWords(c.title)].slice(0, 10),
    topicIds: [], // filled in by pregenerate cross-referencing
  }));
}

// Cross-reference a list of topic shells with following threads.
// Mutates both: sets topic.isDeveloping + topic.followingThreadId, and pushes into thread.topicIds.
export function crossReferenceFollowing(topics, threads) {
  if (!threads.length) return;
  for (const topic of topics) {
    const topicWords = new Set([
      ...titleWords(topic.title),
      ...titleWords(topic.summary || ''),
    ]);
    for (const thread of threads) {
      const sim = titleSim(topic.title, thread.title);
      const keywordOverlap = thread.keywords.filter(w => topicWords.has(w)).length;
      if (sim >= 0.18 || keywordOverlap >= 3) {
        topic.isDeveloping      = true;
        topic.followingThreadId = thread.id;
        thread.topicIds.push(topic.id);
        break; // one thread per topic
      }
    }
  }
}
