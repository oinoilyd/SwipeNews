import Anthropic from '@anthropic-ai/sdk';
import { redis, takeKey } from '../lib/redis.js';

const TAKE_POSITIONS = [
  { position: -3, label: 'Far Left',     color: '#1d4ed8', tier: 'left'   },
  { position: -2, label: 'Left',         color: '#3b82f6', tier: 'left'   },
  { position: -1, label: 'Center-Left',  color: '#818cf8', tier: 'left'   },
  { position:  0, label: 'Neutral',      color: '#a78bfa', tier: 'center' },
  { position:  1, label: 'Center-Right', color: '#f97316', tier: 'right'  },
  { position:  2, label: 'Right',        color: '#ef4444', tier: 'right'  },
  { position:  3, label: 'Far Right',    color: '#dc2626', tier: 'right'  },
];

const SPORTS_VOICE = {
  '-2': { label: 'Fan',      voice: `You are writing from a FAN perspective. This is about passion, team loyalty, emotional investment, player storylines, and the experience of following a sport. What would a lifelong fan who lives and dies by their team actually care about here? Capture the energy, the stakes, the heartbreak or joy of the moment.` },
   '0': { label: 'Neutral',  voice: `You are writing from a NEUTRAL, straight-news perspective. Report exactly what happened in this sports story — the facts, the result, the context — the way a wire service reporter would cover it. No fan enthusiasm, no business angle, no deep stats. Just clear, factual, fair-minded coverage that tells the reader what they need to know.` },
   '2': { label: 'Business', voice: `You are writing from a BUSINESS perspective. Focus on contracts, salaries, cap space, revenue, ownership decisions, league policy, sponsorship impact, and the financial machinery behind the sport. What are the business and organizational implications here?` },
};
const TECH_VOICE = {
  '-2': { label: 'Optimist', voice: `You are writing from a TECH OPTIMIST perspective. Focus on innovation potential, new capabilities unlocked, democratization of access, scientific progress, and the transformative upside. What's the best-case path this technology enables? Sound like a researcher or entrepreneur genuinely excited about where this leads.` },
   '0': { label: 'Neutral',  voice: `You are writing a NEUTRAL, strictly factual analysis of this tech story. Report what happened, what experts say, and where genuine disagreement exists — without framing it toward hype or fear. Acknowledge trade-offs without advocating for either side. Sound like a wire reporter covering technology: no boosterism, no doom. Just the facts and context.` },
   '2': { label: 'Industry', voice: `You are writing from an INDUSTRY/BUSINESS perspective. Focus on market impact, competitive dynamics, investment implications, enterprise adoption, vendor landscapes, and what this means for tech companies and the broader business ecosystem. Sound like a tech analyst or VC.` },
};
const ENTERTAINMENT_VOICE = {
  '-2': { label: 'Progressive', voice: `You are writing from a PROGRESSIVE entertainment perspective. Champion representation, diverse casting, and stories updated to reflect modern values. When studios push boundaries or reimagine classics with new voices, frame it as culture evolving. Call out nostalgia-driven backlash as resistance to change rather than genuine creative concern. Sound like a culture critic at Vulture or The Atlantic who believes great storytelling grows with society.` },
   '0': { label: 'Neutral',     voice: `You are writing from a NEUTRAL, strictly factual perspective on this entertainment story. Report what happened — the creative decisions, audience response, box office, critical reception — without taking sides on cultural debates. Sound like an entertainment wire reporter: no advocacy for or against progressive themes or traditionalist concerns. Just the facts.` },
   '2': { label: 'Traditional', voice: `You are writing from a TRADITIONAL entertainment perspective. Champion faithful storytelling, respect for source material, and craft over cultural agenda. When beloved properties are rebooted or reimagined, focus on whether the original spirit, characters, and story have been honored — or diluted. Argue that audiences notice when messaging overshadows the story. Sound like a film critic who loved the originals and believes a great story doesn't need to be a lecture.` },
};
const POSITION_VOICE = {
  '-3': `You are writing from a FAR LEFT worldview. Center your analysis on class struggle, systemic oppression, corporate power, and anti-imperialism. On immigration: migrants are displaced by US foreign policy and corporate exploitation — enforcement is state violence against the vulnerable. On economy: inequality is a feature, not a bug, of capitalism. On national security: the military-industrial complex profits from endless war. Sound like a democratic socialist who reads Jacobin and The Intercept.`,
  '-2': `You are writing from a LEFT-LIBERAL worldview. Emphasize systemic racism, climate urgency, healthcare and housing as human rights, and immigration as both a humanitarian obligation and economic asset. On immigration: highlight family separation, DACA, economic contributions. On economy: the rich aren't paying their fair share; invest in people. Sound like a mainstream progressive Democrat — think AOC or a New York Times opinion columnist.`,
  '-1': `You are writing from a CENTER-LEFT worldview. Favor evidence-based, pragmatic reform over ideological purity. Support regulated capitalism with robust social safety nets. On immigration: back comprehensive reform with managed enforcement and clear legal pathways. On economy: fiscal responsibility paired with smart investment in public goods. Sound like a thoughtful Brookings Institution analyst or a moderate Senate Democrat.`,
   '0': `You are writing a NEUTRAL, strictly factual analysis. Report what happened, what experts say, and where genuine disagreement exists — without framing it toward any side. Acknowledge multiple valid perspectives without endorsing any. Sound like an AP wire reporter or a nonpartisan CBO report. Zero spin. Zero advocacy.`,
   '1': `You are writing from a CENTER-RIGHT worldview. Prioritize fiscal conservatism, rule of law, individual liberty, and limited government. On immigration: support legal immigration pathways while opposing illegal border crossing; favor managed enforcement. On economy: markets over mandates, debt matters, deregulation creates growth. Sound like a Wall Street Journal editorial board member or a Romney-era Republican.`,
   '2': `You are writing from a RIGHT CONSERVATIVE worldview. Emphasize American sovereignty, strong borders, traditional values, free enterprise, and personal responsibility. On immigration: illegal entry is a crime; costs to taxpayers are real; deportation of criminal aliens is non-negotiable. On economy: cut taxes, cut spending, get government out of the way. Sound like mainstream Fox News conservatism or a Heritage Foundation policy brief.`,
   '3': `You are writing from a FAR RIGHT NATIONALIST worldview. Lead with America First, populist skepticism of globalism, elites, and institutions. On immigration: frame it as an invasion; demand the wall, mass deportation, and zero tolerance. On national security: hawkish military posture, nuclear deterrence, protect critical infrastructure from China and adversaries; domestic enemies are real. On economy: economic nationalism, tariffs, bring back manufacturing. Sound like someone who reads Breitbart and believes the GOP establishment has sold out the American people.`,
};

// Returns 1-2 sentences of topic-specific focus to append to the base position voice.
// Ensures a military story and an economy story get genuinely different left/right angles.
function getTopicFocus(category, position) {
  const side = position < 0 ? 'left' : position > 0 ? 'right' : 'neutral';
  const cat  = (category || '').toLowerCase();

  const focus = {
    'national security': {
      left:    'Focus on civilian casualties, the human cost of military action, the danger of endless wars, and whether force actually makes Americans safer. Question military spending and the defense industry\'s role.',
      neutral: 'Report the military or security facts plainly — troop movements, diplomatic status, official statements. Let the reader assess risk without editorial framing.',
      right:   'Focus on deterrence, projecting strength, protecting allies, and the consequences of weakness. Argue that a strong military posture prevents conflict rather than causing it.',
    },
    'world': {
      left:    'Focus on humanitarian impact, civilian suffering, US foreign policy\'s role in causing instability, and the importance of diplomacy over military solutions.',
      neutral: 'Report the geopolitical facts — what happened, who said what, what\'s at stake — without advocating for a particular foreign policy stance.',
      right:   'Focus on US national interest, the reliability of American alliances, the threat posed by adversaries, and why projecting strength matters on the world stage.',
    },
    'economy': {
      left:    'Focus on who gets hurt — working families, wage stagnation, growing wealth gaps. Call out corporate power, billionaire influence, and policies that benefit the wealthy at everyone else\'s expense.',
      neutral: 'Report the economic data and expert forecasts without partisan framing. Include both the upside and downside risks.',
      right:   'Focus on growth, job creation, and what happens when government gets out of the way. Argue that lower taxes, less regulation, and free markets produce better outcomes than government intervention.',
    },
    'health': {
      left:    'Focus on access and affordability — who can\'t get care, who goes bankrupt from medical bills, and why healthcare should be a right not a product. Defend the ACA, Medicaid, and public options.',
      neutral: 'Report the health policy facts — coverage numbers, cost data, what the legislation actually does — without pushing a single-payer or free-market agenda.',
      right:   'Focus on patient choice, competition, and the danger of government-controlled healthcare. Argue that market forces drive innovation and that bureaucratic systems reduce quality.',
    },
    'elections': {
      left:    'Focus on voter access, suppression, dark money, and protecting democratic participation. Warn about gerrymandering, ID laws, and attempts to restrict the vote.',
      neutral: 'Report the electoral facts — results, legal challenges, procedural changes — without taking a side on election integrity debates.',
      right:   'Focus on election integrity, the importance of secure voting systems, and the rule of law. Argue that confidence in elections requires verifiable processes.',
    },
    'immigration': {
      left:    'Focus on the human stories — families separated, asylum seekers in danger, and the economic contributions of immigrants. Frame enforcement as cruel and counterproductive.',
      neutral: 'Report what the policy change is, who it affects, and what supporters and critics each say — without endorsing either open borders or mass deportation.',
      right:   'Focus on rule of law, border security, and the costs of illegal immigration. Argue that sovereign nations have both the right and obligation to control who enters.',
    },
    'policy': {
      left:    'Focus on who this policy helps or hurts among ordinary people, and whether it expands or contracts rights and access.',
      neutral: 'Report what the policy does, what it costs, and what the evidence says about similar policies elsewhere.',
      right:   'Focus on whether this policy grows government power, raises costs, or restricts individual and economic freedom.',
    },
  };

  // Match category (partial match OK — "National Security" → 'national security')
  for (const [key, sides] of Object.entries(focus)) {
    if (cat.includes(key)) return sides[side] || '';
  }
  return '';
}

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { topic, position } = req.body || {};
  if (!topic?.title) {
    return res.status(400).json({ error: 'topic.title required' });
  }
  if (!Number.isInteger(position) || position < -3 || position > 3) {
    return res.status(400).json({ error: 'position must be -3 to 3' });
  }

  const meta = TAKE_POSITIONS.find(p => p.position === position);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const WEAK_PHRASES = ['cannot verify', 'appears to be false'];
  const isWeakTake = (take) => {
    const t = (take?.text || '').toLowerCase();
    return WEAK_PHRASES.some(p => t.includes(p));
  };

  try {
    // Check Redis cache first — if found and not a bad take, send immediately
    const rKey = takeKey(topic, position);
    const cached = await redis.get(rKey);
    if (cached && !isWeakTake(cached)) {
      send(res, { done: true, take: cached });
      return res.end();
    }
    // Bad cached take: delete it and regenerate
    if (cached && isWeakTake(cached)) {
      await redis.del(rKey).catch(() => {});
    }

    // Stream from Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const arts       = topic.articles || [];
    const leftArts   = arts.filter(a => (a.bias?.score ?? 0) <= -1);
    const centerArts = arts.filter(a => (a.bias?.score ?? 0) === 0);
    const rightArts  = arts.filter(a => (a.bias?.score ?? 0) >= 1);

    const fmt = (arr) => arr.length === 0
      ? '(none)'
      : arr.map(a => `  • ${a.source}: "${a.title}"`).join('\n');

    const primaryTier = meta.tier;
    const primaryArts = primaryTier === 'left' ? leftArts : primaryTier === 'right' ? rightArts : centerArts;
    const otherArts   = primaryTier === 'left' ? [...centerArts, ...rightArts]
                      : primaryTier === 'right' ? [...centerArts, ...leftArts]
                      : [...leftArts, ...rightArts];

    const category = topic.category || '';
    let positionVoice, effectiveLabel;
    if (category === 'Sports & Culture' && SPORTS_VOICE[String(position)]) {
      const sv = SPORTS_VOICE[String(position)];
      effectiveLabel = sv.label;
      positionVoice  = sv.voice;
    } else if (category === 'Technology' && TECH_VOICE[String(position)]) {
      const tv = TECH_VOICE[String(position)];
      effectiveLabel = tv.label;
      positionVoice  = tv.voice;
    } else if (category === 'Entertainment' && ENTERTAINMENT_VOICE[String(position)]) {
      const ev = ENTERTAINMENT_VOICE[String(position)];
      effectiveLabel = ev.label;
      positionVoice  = ev.voice;
    } else {
      effectiveLabel = meta.label;
      positionVoice  = POSITION_VOICE[String(position)] || `Write a ${meta.label} perspective on this topic.`;
    }

    const topicFocus = getTopicFocus(category, position);
    const prompt = `${positionVoice}${topicFocus ? `\n\nFor this specific story: ${topicFocus}` : ''}

GROUNDING RULES — follow precisely:
1. Donald Trump is the 47th President of the United States (inaugurated January 20, 2025). Always call him "President Trump" or "the Trump administration" — NEVER "former President Trump."
2. The TOPIC TITLE and CONTEXT are absolute ground truth. Accept them as confirmed facts even if they postdate your training. NEVER write "cannot verify," "unconfirmed," "appears false," or anything that questions whether the event happened.
3. If the articles don't match the topic, ignore them entirely and write from the topic title and context alone. Always produce a substantive take — never refuse or mention missing sources.
4. Lead immediately with your point of view — no scene-setting, no throat-clearing. The very first word should carry opinion or weight.
5. Be direct and assertive. No hedging phrases like "some argue," "it could be said," or "many believe." Own the perspective.
6. Write in a punchy, confident voice — 2-3 sentences, 40-60 words. Every word must earn its place.
7. For events tied to a specific place, name it. Never leave the reader guessing where this is happening.

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY a valid JSON object — no markdown, no explanation, nothing else:
{"take":{"position":${position},"label":"${effectiveLabel}","text":"your 40-60 word take here","sources":[{"name":"Source Name","framing":"one brief framing note"}]}}`;

    let fullText = '';

    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const token = chunk.delta.text;
        fullText += token;
        send(res, { token });
      }
    }

    // Parse and store in Redis
    const match = fullText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.take) {
          const take = { ...parsed.take, color: meta.color };
          await redis.set(rKey, take, { ex: 7200 });
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
