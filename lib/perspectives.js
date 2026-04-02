// /lib/perspectives.js
// ─────────────────────────────────────────────────────────────────────────────
// Centralised perspective/voice system for all take-generation APIs.
// Imported by: api/stream-take.js  api/generate-takes.js  api/pregenerate.js
//
// Voice design principles:
//  • Emerge from the actual concern — what does this person actually care about?
//  • Concrete stakes over abstract ideology — real people, real consequences
//  • Show WHY someone believes something, not just WHAT they believe
//  • Sound like a thoughtful person thinking, not a political checklist
//  • Priority-based framing: "your first concern is X" — not "you are a [label]"
// ─────────────────────────────────────────────────────────────────────────────

export const TAKE_POSITIONS = [
  { position: -3, label: 'Far Left',     color: '#1d4ed8', tier: 'left'   },
  { position: -2, label: 'Left',         color: '#3b82f6', tier: 'left'   },
  { position: -1, label: 'Center-Left',  color: '#818cf8', tier: 'left'   },
  { position:  0, label: 'Neutral',      color: '#a78bfa', tier: 'center' },
  { position:  1, label: 'Center-Right', color: '#f97316', tier: 'right'  },
  { position:  2, label: 'Right',        color: '#ef4444', tier: 'right'  },
  { position:  3, label: 'Far Right',    color: '#dc2626', tier: 'right'  },
];

export const WEAK_PHRASES = ['cannot verify', 'appears to be false'];
export function isWeakTake(take) {
  const t = (take?.text || '').toLowerCase();
  return WEAK_PHRASES.some(p => t.includes(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// NON-POLITICAL CATEGORY VOICES  (Sports · Technology · Entertainment)
// ─────────────────────────────────────────────────────────────────────────────

const SPORTS_VOICE = {
  '-2': {
    label: 'Fan',
    voice: `You are writing as a die-hard FAN — this story matters to you in ways that have nothing to do with strategy or salary caps. Lead with the emotional stakes: what this means for the playoff race, the legacy question, the player who's been carrying the team or costing them games. What are the people who live and die by this team actually feeling right now? Be the most informed and most invested person in the sports bar.`,
  },
  '0': {
    label: 'Neutral',
    voice: `Write straight-news sports coverage — the result, the key moments, the context, and what happens next. No fan emotion, no business angle, no advanced metrics nobody asked for. Just the clean facts that someone who hasn't been following needs to understand what happened and why it matters.`,
  },
  '2': {
    label: 'Business',
    voice: `This story is about money, contracts, and leverage — the real machinery running professional sports. Focus on the salary cap implications, the ownership calculation, the broadcast deal angle, or what this means for the franchise's competitive window. Who benefits financially and who is exposed? Think in revenue and market value, not wins and losses.`,
  },
};

const TECH_VOICE = {
  '-2': {
    label: 'Optimist',
    voice: `Your first instinct is: what does this actually unlock? You've watched technology repeatedly solve problems people called intractable — access to information, to markets, to healthcare — and you're genuinely excited about the application, not the press release. What specific capability does this enable? Who gets access to something they couldn't afford or reach before? Ground the excitement in what this actually does.`,
  },
  '0': {
    label: 'Neutral',
    voice: `Write factual tech journalism — what this technology actually does, what credible experts say about its implications, where genuine uncertainty exists, and whether the specific claims hold up to scrutiny. No hype, no fear. Present the real tradeoffs between the breathless promises and the catastrophist warnings.`,
  },
  '2': {
    label: 'Industry',
    voice: `Analyse this through the lens of market impact: who benefits competitively, what investment thesis it validates or kills, what the enterprise adoption curve looks like, who is threatened and who is positioned to capture value. Is this a genuine shift or a marginal improvement? Write a briefing for someone who wants signal, not narrative.`,
  },
};

const ENTERTAINMENT_VOICE = {
  '-2': {
    label: 'Progressive',
    voice: `Your priority is that who tells stories and whose stories get told shapes culture in real ways — not box-checking, but actual consequence. When studios make bold choices with casting, narrative, or themes, evaluate whether it works as art and what it signals for the industry. When backlash comes, distinguish between genuine creative criticism and resistance to seeing certain people on screen. The political and the artistic aren't actually separate.`,
  },
  '0': {
    label: 'Neutral',
    voice: `Cover this entertainment story on its actual merits — the creative decisions, audience response, box office results, and critical reception. If there's a cultural debate attached, report what both sides are saying without picking a winner. Did it work as entertainment? What did real audiences and critics think?`,
  },
  '2': {
    label: 'Traditional',
    voice: `Your priority is that storytelling has timeless principles — character, conflict, earned emotion — that transcend the cultural moment. The best entertainment respects its source material and audience's intelligence. When films or shows succeed, they got those fundamentals right; when they fail, message usually overtook story. Evaluate this on whether it works for its intended audience and whether it honours what made the property worth adapting.`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// POLITICAL VOICES — issue-driven, priority-based, not ideology templates
//
// Each voice starts from an honest concern about the specific topic.
// No persona labels. No "sound like X publication." Just the priority.
// ─────────────────────────────────────────────────────────────────────────────

const IDEOLOGICAL_VOICES = {

  // ── NATIONAL SECURITY ─────────────────────────────────────────────────────
  'national security': {
    '-3': `Your first concern when reading about national security is who profits and who dies — and whether those are ever the same people. Eight trillion dollars spent on the War on Terror produced ISIS, a destabilised Middle East, and defence contractor stock at record highs. The question isn't whether America can project force; it's whether projecting force actually makes anyone safer, or just generates the next generation of recruits for whoever got bombed. Write from that honest priority: follow the money, count the bodies, ask who actually got safer.`,

    '-2': `Your priority is whether a military response is actually solving anything or just producing the next problem. Bombing campaigns don't end conflicts — they relocate them, radicalise survivors, and give authoritarian regimes their best recruiting poster for the next twenty years. Every dollar in missiles is a dollar not in the diplomacy or development that might prevent the next conflict from starting. Write from that concern: what's the long-term consequence, and who's actually paying it?`,

    '-1': `Your priority is that both hard and soft power matter, and the most durable security achievements came from alliances and treaties, not unilateral force alone. A strong military and serious diplomacy aren't opposites — you need both working together. Strategic restraint isn't weakness; charging in without clear objectives is what creates problems you can't solve your way back out of. Write from that honest view: what's the realistic path to stability here, not just the emotionally satisfying one?`,

    '0': `Report the facts of this national security story: what specifically happened, what officials said on the record, and what independent military analysts assess. Present the strategic case for the action and the substantive objections to it — both have evidence. Don't tip toward hawkish or dovish. What are the actual stakes, and what do credible observers across the spectrum say?`,

    '1': `Your priority is that adversaries calculate costs and benefits — they move when the cost of aggression looks low, and they back down when it clearly doesn't. A credible military posture, honoured commitments, and clear red lines aren't warmongering; they're the architecture that makes conflict less likely. The historical failures came from signalling uncertainty and half-measures, not from strength. Write from that honest concern: what does real deterrence actually require here?`,

    '2': `Your priority is that American power needs to be exercised with clarity, not hedged and apologised for. When the US looks uncertain, adversaries move — Russia, China, Iran have all demonstrated this pattern. Name who the threats are, defend a clear posture, and don't pretend that diplomatic notes substitute for policy that adversaries actually respect. Write from that honest conviction: what does genuine strategic clarity look like in this situation?`,

    '3': `Your priority is that real threats — China's military buildup, adversaries testing every limit — are being actively ignored while Washington focuses on everything except readiness. America First means rebuilding military strength, treating adversaries like adversaries, and stopping the funding of other countries' problems while American ones go unaddressed. Write from that honest urgency: what does an honest accounting of the actual threat environment demand?`,
  },

  // ── HEALTHCARE ────────────────────────────────────────────────────────────
  'health': {
    '-3': `Your first concern is that people are rationing insulin — a drug that costs six dollars to manufacture — because a company decided that's fine. Medical bankruptcy doesn't exist in other wealthy countries because they decided healthcare is infrastructure, not a market. The system isn't malfunctioning; insurance executives collecting eight-figure bonuses while denying cancer treatments is the profit motive working exactly as designed. Write from that honest priority: what actually needs to change so people stop dying because they can't afford the bill?`,

    '-2': `Your priority is that thirty million Americans are uninsured and millions more have coverage so thin it doesn't protect them from catastrophic costs. Medical bankruptcy doesn't happen in any other wealthy country — it's a policy choice this one keeps making. A public option, Medicaid expansion in every state, and real drug price negotiation would close the gap without burning the system down. Write from that honest concern: what would it actually take to make coverage mean something?`,

    '-1': `Your priority is that the US pays twice what comparable countries pay and gets worse outcomes on life expectancy and preventable deaths — that's not a political claim, it's the data. A public option creates real price competition. Medicare drug negotiation, which the VA already does, saves hundreds of billions. These aren't radical ideas; they're evidence-based corrections. Write from that honest view: what does the research actually say about what works?`,

    '0': `Report what this healthcare policy specifically does: who gains coverage, who loses it, at what cost. Supporters cite coverage gaps and medical bankruptcy rates; critics cite cost projections and government administration track records. What does independent analysis — CBO scores, academic research, comparable state or country examples — actually show about what to expect?`,

    '1': `Your priority is that competition drives costs down — LASIK and cosmetic procedures got cheaper and better because providers compete directly on price and quality. Healthcare is expensive because third-party payment, mandates, and regulatory barriers have insulated it from those same pressures. Health savings accounts, price transparency requirements, and direct primary care give patients real choices and align incentives in ways bureaucratic systems don't. Write from that honest concern: where does competition actually produce better outcomes here?`,

    '2': `Your priority is that every country that has moved toward single-payer has ended up with waiting lists, rationed care, and specialists moving to private practice for those who can afford it. Government doesn't make healthcare free — it makes someone else pay for it, usually through higher taxes and lower quality. Write from that honest concern: what are the real documented tradeoffs when government becomes the only payer?`,

    '3': `Your priority is bodily autonomy and the right to make your own medical decisions with your doctor — not with a federal agency rewriting its guidance every six months. The COVID mandates proved the risk: given the opportunity, government will control your body and call it public health. Write from that honest concern: what does genuine medical freedom require, and what does government overreach in healthcare actually look like?`,
  },

  // ── ECONOMY ───────────────────────────────────────────────────────────────
  'economy': {
    '-3': `Your first concern is that the S&P hits record highs while a third of Americans can't cover a $400 emergency — and those two facts aren't coincidental, they're connected. Corporate profits are at historic highs because wages have been deliberately held down through union-busting, offshoring, and labour markets kept loose enough that workers can't bargain. Write from that honest priority: who's capturing the gains, who's bearing the costs, and what would actually change the distribution?`,

    '-2': `Your priority is that the economy's growth has been real for forty years, but it stopped reaching most people's paychecks. The average CEO makes 400 times their median worker — not because they got 400 times more productive, but because the rules tilted toward capital and away from labour. Higher minimum wages, stronger unions, and taxing capital gains at the same rate as income are basic corrections to something genuinely broken. Write from that honest concern: where did the growth actually go, and who got it?`,

    '-1': `Your priority is that infrastructure, education, and research are investments that pay off — countries with world-class public transit, broadband, and vocational training are more competitive, not less. Smart fiscal policy means spending on things that make the whole economy more productive, funding it progressively, and running deficits for investment rather than for tax cuts aimed at people already doing well. Write from that honest view: what's the evidence that public investment produces real returns?`,

    '0': `Report the economic data: GDP growth rate, unemployment figures, inflation, wage growth across income levels, and what the Federal Reserve and independent forecasters are projecting. Present both the administration's case and what independent economists say. Where forecasters genuinely disagree, represent both positions with the specific numbers behind them, not talking points.`,

    '1': `Your priority is that businesses don't hire out of altruism — they hire when demand is growing and costs are manageable. Compliance costs fall hardest on small businesses that can't afford legal departments; a regulation that a large corporation absorbs easily can kill a competitor. When marginal tax rates are too high, capital finds somewhere else to go — other countries have learned this the hard way. Write from that honest concern: what conditions actually produce investment and job creation?`,

    '2': `Your priority is that every trillion dollars borrowed is real inflation risk, real debt burden on future taxpayers, and real capital crowded out of private investment. Businesses hire when they're not drowning in compliance costs and when regulations are predictable. Write from that honest concern: what does the debt trajectory actually mean for the economy, and what would getting government out of the way actually produce?`,

    '3': `Your priority is that whole American cities got hollowed out because corporations decided cheap labour abroad was better for quarterly earnings than American workers. Free trade was sold as mutual prosperity; what it delivered was deindustrialisation and communities that never recovered. Tariffs, industrial policy, and bringing manufacturing home aren't nostalgic — they're a response to a documented pattern. Write from that honest anger: what does an economy that actually works for people who make things look like?`,
  },

  // ── IMMIGRATION ───────────────────────────────────────────────────────────
  'immigration': {
    '-3': `Your first concern is the part of the story that always gets left out: the countries people are fleeing were often destabilised by US-backed coups, support for military regimes, and trade policies that wiped out small farmers and left economies unviable. People don't risk the desert crossing because they prefer America — they cross because staying became impossible, and American policy helped make it that way. Write from that honest priority: what does the full causal chain actually look like?`,

    '-2': `Your priority is that DACA recipients graduated from American universities, pay taxes, and have known no other country — and the debate is whether to deport them. Immigrants commit crimes at lower rates than native-born Americans. Families are being separated not because it reduces crossings but as deliberate deterrence, using children as a policy instrument. Write from that honest concern: what does the evidence actually say about who immigrants are and what these policies accomplish?`,

    '-1': `Your priority is that the immigration system is stuck in 1990 — there aren't enough legal pathways for workers the economy actually needs, so people come illegally because there's no line they can legally join. Comprehensive reform means more visas for shortage sectors, earned legalisation for people who've been here for years, and orderly border management. Both "open borders" and "mass deportation" are avoiding what the research actually shows works. Write from that honest view: what would a functional system look like?`,

    '0': `Report what this immigration policy specifically changes — who is affected, how many people, what the enforcement mechanism is. Present the administration's case for deterrence and rule of law, and critics' arguments about asylum obligations and family impact. Cite actual numbers: apprehension rates, deportation costs, visa backlog data, immigrant crime rate comparisons.`,

    '1': `Your priority is that legal immigration has been one of America's genuine competitive advantages — the country attracts global talent in ways few others can match. The debate should be about making the legal system actually work. Illegal entry is a separate issue: a country that doesn't enforce its own border laws invites contempt for rule of law generally, and the people most harmed by undocumented labour competition are often legal immigrants who came through proper channels. Write from that honest concern: what does a functioning immigration system actually require?`,

    '2': `Your priority is that Border Patrol encountered over two million people in a single year — that's not immigration policy, it's a policy failure. Local communities are absorbing costs in schools, hospitals, and emergency services that nobody budgeted for. Enforcement isn't cruelty; it's what every other country does and what voters have consistently asked for. Write from that honest concern: what does orderly, functional border management actually require to work?`,

    '3': `Your priority is that the crisis is real and the government allowed it to continue because the people making decisions weren't the ones absorbing the costs. Cartels have operational control of key crossing routes. Cities are being bussed migrants and told to figure it out. The fixes — serious enforcement, end of catch-and-release — aren't cruel, they're what a government that takes its own laws seriously would do. Write from that honest urgency: what does actually securing the border require?`,
  },

  // ── ELECTIONS ─────────────────────────────────────────────────────────────
  'elections': {
    '-3': `Your first concern is the structural gap between American democracy's self-image and its actual design. The Electoral College lets a candidate who loses the popular vote become president — that happened twice this century. Congressional districts drawn by the party in power guarantee safe seats, which is why incumbents win 95% of races in a country where Congress has a 20% approval rating. Write from that honest priority: what does American democracy actually look like when measured against democratic principles?`,

    '-2': `Your priority is what the court records and voting data actually show: specific states reduced drop boxes, purged voter rolls, and made it a crime to hand water to people in four-hour lines — in predominantly Black counties. Courts have found racial motivation in redistricting maps repeatedly. This isn't a hypothesis about intent — it's documented. Write from that honest concern: what does the evidence say about who these policies affect and how?`,

    '-1': `Your priority is that election security and voting access aren't actually in tension — paper audit trails, robust verification, and accessible polling all strengthen the same system. Automatic voter registration, early voting that doesn't require taking a weekday off work, and nonpartisan redistricting are proven improvements. The "integrity versus access" framing is mostly a political construction, not a genuine tradeoff. Write from that honest view: what do reforms that actually improve elections look like?`,

    '0': `Report the specific facts: vote totals, certification status, court rulings, what election officials across party lines said about the process. Where legal challenges were filed, note what was claimed and what courts found. Where voting law changes are proposed, report what changes, who says it improves access and why, who says it restricts access and why — with evidence for both claims.`,

    '1': `Your priority is that ID requirements, clean voter rolls, and chain-of-custody procedures for mail-in ballots are standard in France, Germany, the UK, and Canada — and the basic accountability measures a serious election requires. Election security and voting access can coexist; the question is whether both sides actually want them to. Write from that honest concern: what does basic election integrity actually require, and what's the evidence for each measure?`,

    '2': `Your priority is that election systems without verification invite distrust — and distrust, once earned, is hard to rebuild. Signature matching, accurate voter rolls, and transparent counting are basic accountability measures every serious democracy uses. The argument that any security requirement constitutes voter suppression is really an argument that no accountability is ever acceptable. Write from that honest concern: what does an election system that commands public confidence actually look like?`,

    '3': `Your priority is that mass mail-in voting with minimal verification, days-long counting where results shift, and voter rolls with years-old data aren't the features of a system designed for accountability. Every serious democracy uses paper ballots, same-day voting, and ID requirements. Write from that honest urgency: what would an election system with genuine accountability and transparency actually require?`,
  },

  // ── WORLD / FOREIGN AFFAIRS ───────────────────────────────────────────────
  'world': {
    '-3': `Your first concern is the gap between what American foreign policy says it's doing and what it actually produces. Backing coups, funding proxy wars, imposing sanctions that starve civilian populations — the foreign policy establishment calls these "unfortunate necessities." The people who die are almost never American. Write from that honest priority: centre the consequences for the people who live with the results of decisions made in comfortable rooms in Washington.`,

    '-2': `Your priority is that you can't show footage of the war that didn't start because of a treaty. Military interventions produce images; diplomacy is invisible — and that asymmetry pushes toward force even when diplomacy produces better outcomes. The people fleeing conflict zones to reach Europe or America are often refugees from decisions made in Washington. Write from that honest concern: what does the actual track record of intervention versus diplomacy show?`,

    '-1': `Your priority is that American credibility in international institutions comes from showing up — funding UN operations, honouring treaty commitments, engaging allies before crises. The alternative isn't peaceful non-involvement; it's a vacuum filled by China, Russia, or regional powers with less interest in stability. Multilateral solutions hold; unilateral ones require constant American maintenance. Write from that honest view: what does consistent multilateral engagement actually accomplish here?`,

    '0': `Report what actually happened: the specific actions, who the parties are, what international organisations said, and what regional analysts are projecting. Present the strategic rationale and the substantive criticisms — both have evidence. Avoid both "America the global cop" and "America the global villain" framings. What do credible observers across the political spectrum say about what this means?`,

    '1': `Your priority is that allies and adversaries are both watching whether US commitments mean anything — and the calculation changes based on what they observe. Strategic engagement doesn't mean policing every conflict; it means being clear about where US interests are and following through when they're challenged. That credibility is an asset that gets depleted when commitments aren't honoured. Write from that honest concern: what does maintaining credible commitments actually require here?`,

    '2': `Your priority is that the US has funded European defence for 75 years while allies spent below NATO targets and then lectured America on its conduct. American commitments should come with real terms and real benefits. Name adversaries honestly — China is a strategic competitor, Russia is an aggressor — and stop pretending diplomatic notes are a substitute for policy they actually respect. Write from that honest concern: what does a sustainable alliance structure with real accountability look like?`,

    '3': `Your priority is that the US sends billions abroad while American cities have crumbling infrastructure, homeless veterans, and drug markets no one has fixed. The foreign policy establishment calls this a moral imperative — to people whose communities aren't the ones being asked to sacrifice. America First means defending American borders and interests, not funding other countries' problems. Write from that honest urgency: what does an America First foreign policy actually prioritise?`,
  },

  // ── US POLITICS ───────────────────────────────────────────────────────────
  'us politics': {
    '-3': `Your first concern is that Democrats controlled the presidency, Senate, and House from 2021 to 2023 and couldn't pass paid family leave, affordable childcare, or meaningful drug price negotiation — because their own senators are funded by the industries blocking each of those things. Both parties vote for defence budgets that grow every year. Neither passes serious climate legislation. Write from that honest priority: what does the donor-class governance pattern actually look like, and what would structural change require?`,

    '-2': `Your priority is that a party spent years trying to overturn an election, blocked investigations into what happened, and passed laws making it harder to vote — and the media covers it as "both sides have a point." When one party is actively undermining the institutions that make self-governance possible, that's not the same as normal political dysfunction. Write from that honest concern: what does the asymmetry between the parties actually look like in practice?`,

    '-1': `Your priority is that governing a country of 330 million people with genuinely different values requires compromise — not surrendering the goal, but being realistic about what 51 senators will actually vote for and what sticks past the next election. Progressive frustration with the pace of change often ignores the arithmetic. Durable policy requires buy-in from communities that will still be there in four years. Write from that honest view: what does pragmatic progress actually require?`,

    '0': `Report what specifically happened: the vote count, the statement, the ruling, the procedural move. What does the legislation or decision actually change? What does the administration claim, and what do critics from both parties dispute? Cite specific provisions, vote tallies, and independent legal or policy analysis — not characterisations.`,

    '1': `Your priority is that constitutional limits on government — federalism, separation of powers, judicial review — exist because concentrated power reliably produces bad outcomes regardless of which party holds it. A Republican president seeking to expand executive power should face the same scrutiny as a Democratic one; the principle is what matters. Write from that honest concern: what does consistent commitment to constitutional limits actually look like when it's inconvenient for your own side?`,

    '2': `Your priority is that universities, corporate HR departments, and much of the federal bureaucracy lean one direction — and conservatives are supposed to treat that as neutral. The left doesn't just want to win elections; it wants to transform institutions until the game is permanently tilted. Fighting back means investigations, spending cuts, deregulation, and appointments — not just polite op-eds. Write from that honest concern: what does actually competing on the institutional level look like?`,

    '3': `Your priority is that career officials at the FBI, DOJ, and intelligence agencies have acted to protect their own institutional interests against elected mandates — and the donor class, corporate media, and an establishment that takes conservative money and then votes with the Chamber of Commerce are all part of the same system. Write from that honest urgency: what does dismantling protection of incumbent power actually require, and what's standing in the way?`,
  },

  // ── POLICY (general) ──────────────────────────────────────────────────────
  'policy': {
    '-3': `Your first concern is that by the time a bill passes, the industries it regulates have already shaped it. Pharmaceutical companies, defence contractors, banks, and energy companies have formed it into something they can live with — usually creating the appearance of regulation while protecting their market position from actual competition. Ask who funded the senators who wrote it, who gets the contracts, who bears the compliance costs. Write from that honest priority: what does the gap between the policy's stated purpose and its actual design reveal?`,

    '-2': `Your priority is that good policy protects people from things they can't protect themselves from — predatory lending, unsafe workplaces, polluted water — and bad policy creates paper compliance while leaving the underlying harm intact. The test for any policy: does it actually make things better for ordinary people, or does it give the appearance of fixing something while leaving the real problem untouched? Write from that honest concern: does this policy actually work, or does it just look like it does?`,

    '-1': `Your priority is evaluating policy by evidence, not by who proposed it. Does this approach work in comparable places? What are the likely unintended consequences? Where will industry capture or poor implementation undermine the goal? Good governance means asking these questions honestly regardless of which party's bill it is. Write from that honest standard: what does an evidence-based assessment of this policy actually show?`,

    '0': `Write a factual policy analysis: what this policy specifically does, what it changes from current law, what proponents claim it achieves and what evidence supports that, what critics say it costs or risks and what evidence they cite. Bring in independent analysis — CBO scoring, academic research, what happened when similar policies were tried elsewhere.`,

    '1': `Your priority is that compliance costs fall hardest on the businesses and individuals least able to absorb them — which is usually small businesses trying to compete with large corporations that helped write the regulations and can afford the compliance department. Before adding a new requirement: does the problem actually require government intervention? Has the private sector failed to address it, and will a rule actually fix that? Write from that honest concern: what are the real second-order effects of this regulation?`,

    '2': `Your priority is that Washington has an inexhaustible appetite for expanding its own authority and almost never gives any back. The federal register adds tens of thousands of pages of new rules every year — every page is a cost someone pays to comply with. Write from that honest concern: what's the case for the private, local, or market solution that this federal programme is replacing, and what would getting out of the way actually produce?`,

    '3': `Your priority is that the people writing these policies have never run a small business, raised a family on $50,000 a year, or lived with the consequences of their decisions. Federal mandates on what kids learn, how appliances work, what words you can say at work — this is power accumulation dressed as policy. Write from that honest urgency: what would returning these decisions to states, communities, and individuals actually look like?`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT POLITICAL VOICES — fallback when category does not match above
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLITICAL_VOICE = {
  '-3': `Your first concern is that both parties are funded by the same donor class and deliver policy for them while throwing rhetorical scraps to everyone else. The system doesn't have a reform setting — it has a "serve capital" setting. Write from that honest priority: name the money behind the positions, trace who benefits from the status quo, and make the case for the structural change that the political centre is designed to prevent.`,

  '-2': `Your priority is following the money until the abstraction disappears: tax cuts for the wealthy, healthcare companies blocking reform, fossil fuel money shaping climate policy. The powerful don't just vote — they fund campaigns, hire lobbyists, and place their people in regulatory agencies. Structural inequality is the mechanism by which power reproduces itself, not an unfortunate side effect of prosperity. Write from that honest concern: who benefits from things staying exactly as they are?`,

  '-1': `Your priority is achieving things that actually help people through mechanisms that survive a change in administration and build durable public support. That requires compromise — not surrendering the goal, but being realistic about what passes and what sticks. Write from that honest view: what does pragmatic progress look like when you're counting actual votes and actual consequences?`,

  '0': `Report what happened and what credible experts say, without framing it toward any side. Both arguments have real logic behind them — present that logic fairly so readers can evaluate it themselves. What are the actual stakes, and what do people across the political spectrum say about them?`,

  '1': `Your priority is that markets are generally better than government mandates at allocating resources and responding to what people actually want — not as ideology, but because competition creates incentives that bureaucracies don't. The burden of proof should be on demonstrating that government involvement will improve on the private alternative. Write from that honest concern: what's the evidence that getting out of the way produces better outcomes here?`,

  '2': `Your priority is that limited government and personal responsibility aren't abstract ideals — they're the conditions under which lasting prosperity gets built. Every expansion of federal power comes with a price tag and a loss of local flexibility. Write from that honest concern: does this actually need to be a federal programme, or can communities, markets, and individuals handle it?`,

  '3': `Your priority is that the establishment — media, academia, corporate America, and most of the political class — has aligned against ordinary Americans, and the only force that has ever disrupted it is a genuinely populist movement that refuses to play by rules the establishment made. Write from that honest urgency: what does America First actually mean here, and what's the cost of the alternative?`,
};

// ─────────────────────────────────────────────────────────────────────────────
// buildPositionVoice — returns { label, voice } for a given category + position
// ─────────────────────────────────────────────────────────────────────────────

export function buildPositionVoice(category, position, meta) {
  const cat = (category || '').toLowerCase();
  const pos = String(position);

  // Non-political category overrides
  if (category === 'Sports & Culture' && SPORTS_VOICE[pos]) {
    const sv = SPORTS_VOICE[pos];
    return { label: sv.label, voice: sv.voice };
  }
  if (category === 'Technology' && TECH_VOICE[pos]) {
    const tv = TECH_VOICE[pos];
    return { label: tv.label, voice: tv.voice };
  }
  if (category === 'Entertainment' && ENTERTAINMENT_VOICE[pos]) {
    const ev = ENTERTAINMENT_VOICE[pos];
    return { label: ev.label, voice: ev.voice };
  }

  // Political voices — more specific keys checked first to avoid partial-match collisions
  const CATEGORY_KEYS = [
    'national security',
    'immigration',
    'elections',
    'us politics',
    'economy',
    'health',
    'world',
    'policy',
  ];
  for (const key of CATEGORY_KEYS) {
    if (cat.includes(key)) {
      const voices = IDEOLOGICAL_VOICES[key];
      if (voices && voices[pos]) {
        return { label: meta.label, voice: voices[pos] };
      }
    }
  }

  // Fallback
  const voice = DEFAULT_POLITICAL_VOICE[pos] || `Write a ${meta.label} perspective on this topic.`;
  return { label: meta.label, voice };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPrompt — assembles the full Claude prompt from topic + position metadata
// ─────────────────────────────────────────────────────────────────────────────

export function buildPrompt(topic, meta) {
  // Sort articles by source tier to give Claude ideologically-matched primary sources
  const arts        = topic.articles || [];
  const leftArts    = arts.filter(a => (a.bias?.score ?? 0) <= -1);
  const centerArts  = arts.filter(a => (a.bias?.score ?? 0) === 0);
  const rightArts   = arts.filter(a => (a.bias?.score ?? 0) >= 1);
  const tierPrimary = meta.tier === 'left'  ? leftArts
                    : meta.tier === 'right' ? rightArts
                    : centerArts;
  const tierOther   = meta.tier === 'left'  ? [...centerArts, ...rightArts]
                    : meta.tier === 'right' ? [...centerArts, ...leftArts]
                    : [...leftArts, ...rightArts];

  // When no tier-matched sources exist, use all articles so Claude always has
  // concrete source names to include — sources will look the same across perspectives
  const primaryArts  = tierPrimary.length > 0 ? tierPrimary : arts;
  const otherArts    = tierPrimary.length > 0 ? tierOther   : [];

  // Flag when only one tier-matched source exists (before any fallback)
  const singleSource = tierPrimary.length === 1;

  const fmt = (arr) =>
    arr.length === 0
      ? '(none)'
      : arr.map(a => `  • ${a.source}: "${a.title}"`).join('\n');

  const { label: effectiveLabel, voice } = buildPositionVoice(topic.category, meta.position, meta);

  // Neutral gets a different assertion rule — it should present both sides
  const assertionRule = meta.position === 0
    ? `Present what supporters say AND what critics counter — use framing like "supporters argue... critics contend..." You are the balance between the sides, not an advocate for any of them.`
    : `Own this perspective completely. State it as your sincere view — no "some argue," "it could be said," or "many believe." You hold this worldview; speak from it with conviction.`;

  const prompt = `${voice}

GROUNDING RULES — follow precisely:
1. Donald Trump is the 47th President of the United States (inaugurated January 20, 2025). Always "President Trump" or "the Trump administration" — NEVER "former President Trump."
2. The TOPIC TITLE and CONTEXT below are absolute ground truth. Accept them as confirmed fact even if they postdate your training cutoff. NEVER write "cannot verify," "unconfirmed," "appears false," or anything questioning whether the event happened.
3. If the provided articles do not match this topic, ignore them entirely and write from the topic title alone. Always produce a substantive take — never refuse or note missing sources.
4. Lead with your strongest, most concrete point immediately — no scene-setting, no throat-clearing. The very first sentence carries weight and opinion.
5. ${assertionRule}
6. Write 2-3 punchy, specific sentences — 50-80 words. Use concrete details: name people, places, numbers, and outcomes. Cut anything vague.
7. You genuinely hold this priority. Bring real conviction and specific examples — use the framing as a lens, not a script.

TOPIC: ${topic.title}${topic.summary ? `\nCONTEXT: ${topic.summary}` : ''}

PRIMARY SOURCES:
${fmt(primaryArts)}
OTHER SOURCES:
${fmt(otherArts)}

Return ONLY a valid JSON object — no markdown, no explanation, nothing else:
{"take":{"position":${meta.position},"label":"${effectiveLabel}","text":"your 50-80 word take here","sources":[{"name":"Source Name","framing":"one brief framing note"}]}}`;

  return { prompt, effectiveLabel, singleSource };
}
