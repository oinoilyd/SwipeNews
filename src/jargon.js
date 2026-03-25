// Plain-English definitions for political / legal / economic jargon.
// Keys are lowercase for case-insensitive matching.
export const JARGON = {
  // ── Political process ─────────────────────────────────────────────────────
  'filibuster':         'A tactic where a senator talks at length to delay or block a vote on a bill.',
  'cloture':            'A Senate vote (60 votes needed) to end a filibuster and force a final vote.',
  'reconciliation':     'A fast-track Senate procedure that lets budget bills pass with just 51 votes, bypassing the filibuster.',
  'omnibus bill':       'A single massive piece of legislation that bundles many unrelated issues together.',
  'markup':             'The committee process where a bill is reviewed, amended, and approved before a full floor vote.',
  'earmark':            'Spending set aside for a specific project in a specific lawmaker\'s district.',
  'gerrymandering':     'Drawing voting district boundaries to favor one party over another.',
  'electoral college':  'The 538-member body that formally elects the president — each state gets electors equal to its congressional seats.',
  'caucus':             'A closed meeting of party members to make decisions, or a group of lawmakers with shared interests.',
  'primary':            'An election where a party\'s voters choose their candidate before the general election.',
  'superdelegate':      'A Democratic party official who can vote for any presidential candidate at the convention, regardless of primary results.',
  'lame duck':          'An officeholder in their final term or after losing re-election, with reduced political power.',
  'whip':               'A party official in Congress whose job is to count votes and keep members in line.',
  'pork barrel':        'Government spending on local projects designed to benefit a politician\'s home district.',
  'bipartisan':         'Supported by members of both major political parties.',
  'cloakroom':          'Private rooms near the Senate and House floors where lawmakers gather to talk strategy.',

  // ── Legislative ────────────────────────────────────────────────────────────
  'cloture vote':       'A Senate vote requiring 60 senators to end debate and proceed to a final vote.',
  'floor vote':         'A vote taken by the full chamber (all senators or all House members).',
  'conference committee': 'A joint House-Senate committee that resolves differences between two versions of a bill.',
  'veto':               'The president\'s power to reject a bill passed by Congress.',
  'pocket veto':        'When the president ignores a bill for 10 days near the end of Congress, killing it without a formal veto.',
  'override':           'Congress can reverse a presidential veto with a two-thirds vote in both chambers.',
  'rider':              'An unrelated provision added to a bill to help it pass or force a president into a tough choice.',

  // ── Legal / Courts ─────────────────────────────────────────────────────────
  'certiorari':         'Latin for "to be informed." The Supreme Court\'s process of agreeing to hear a case.',
  'writ of certiorari': 'A formal order by the Supreme Court agreeing to review a lower court\'s ruling.',
  'injunction':         'A court order requiring someone to do something, or stop doing something.',
  'habeas corpus':      'A legal right requiring the government to justify why someone is being held in custody.',
  'due process':        'The constitutional guarantee that the government must follow fair legal procedures before taking action against a person.',
  'amicus brief':       'A "friend of the court" document filed by an outside party sharing legal arguments in a major case.',
  'standing':           'The legal requirement that a person must be directly affected by an issue to sue over it.',
  'subpoena':           'A legal order requiring someone to testify or produce documents.',
  'indictment':         'A formal charge by a grand jury that there is enough evidence to put someone on trial.',
  'contempt of court':  'Disobeying or disrespecting a court order or judge, which can result in fines or jail.',
  'plea deal':          'An agreement where a defendant pleads guilty to a lesser charge in exchange for a lighter sentence.',
  'SCOTUS':             'Supreme Court of the United States.',
  'POTUS':              'President of the United States.',
  'FLOTUS':             'First Lady of the United States.',

  // ── Economic ───────────────────────────────────────────────────────────────
  'GDP':                'Gross Domestic Product — the total value of all goods and services produced in a country in a year.',
  'CPI':                'Consumer Price Index — a measure of how much everyday goods and services cost, used to track inflation.',
  'inflation':          'The rate at which prices rise over time, reducing purchasing power.',
  'recession':          'Two consecutive quarters of economic decline (shrinking GDP).',
  'quantitative easing':'When a central bank buys financial assets to inject money into the economy and lower interest rates.',
  'federal funds rate': 'The interest rate at which banks lend money to each other overnight, set by the Federal Reserve.',
  'tariff':             'A tax placed on imported goods, often to protect domestic industries or pressure foreign countries.',
  'trade deficit':      'When a country imports more goods and services than it exports.',
  'fiscal policy':      'Government use of spending and taxes to influence the economy.',
  'monetary policy':    'Central bank actions (like raising interest rates) to control inflation and stabilize the economy.',
  'debt ceiling':       'The legal limit on how much money the U.S. government can borrow.',
  'deficit spending':   'When the government spends more than it collects in taxes.',
  'DOGE':               'Department of Government Efficiency — an advisory body created to identify government waste and spending cuts.',
  'sanctions':          'Economic penalties (trade restrictions, asset freezes) imposed on a country or individual to change their behavior.',

  // ── Foreign policy / Military ──────────────────────────────────────────────
  'two-state solution': 'The proposed resolution to the Israeli-Palestinian conflict: an independent Israeli state alongside an independent Palestinian state.',
  'NATO':               'North Atlantic Treaty Organization — a military alliance of 32 countries that agree to defend each other from attack.',
  'G7':                 'A group of 7 major democracies (US, UK, Canada, France, Germany, Italy, Japan) that coordinate on global economic policy.',
  'UN Security Council':'A 15-member UN body with power to authorize military action and impose sanctions. The US, UK, France, China, and Russia have veto power.',
  'AUMF':               'Authorization for Use of Military Force — a congressional resolution giving the president power to use the military in a specific conflict.',
  'deterrence':         'The strategy of threatening military retaliation to discourage an adversary from attacking.',
  'ceasefire':          'A temporary halt to fighting agreed upon by warring parties, not a permanent peace deal.',
  'classified':         'Government information restricted from public release due to national security concerns.',
  'intelligence':       'In a government context: information gathered about foreign threats, adversaries, or security risks, often by agencies like the CIA or NSA.',
  'IAEA':               'International Atomic Energy Agency — the UN body that monitors nuclear programs worldwide to prevent weapons development.',

  // ── Healthcare ─────────────────────────────────────────────────────────────
  'ACA':                'Affordable Care Act (also called Obamacare) — the 2010 law that expanded health insurance coverage and added consumer protections.',
  'Medicaid':           'Government health insurance for low-income Americans, jointly funded by states and the federal government.',
  'Medicare':           'Federal health insurance for Americans 65 and older, and for some people with disabilities.',
  'single-payer':       'A healthcare system where one government entity (instead of private insurers) pays all medical bills.',
  'public option':      'A government-run health insurance plan that would compete alongside private insurance.',
  'FDA':                'Food and Drug Administration — the federal agency that approves and regulates drugs, medical devices, and food safety.',

  // ── Immigration ────────────────────────────────────────────────────────────
  'DACA':               'Deferred Action for Childhood Arrivals — an Obama-era program protecting undocumented immigrants brought to the US as children ("Dreamers") from deportation.',
  'asylum':             'Legal protection granted to someone who has fled their home country due to persecution, war, or violence.',
  'TPS':                'Temporary Protected Status — allows nationals of certain crisis-hit countries to live and work in the US temporarily.',
  'sanctuary city':     'A city that limits cooperation with federal immigration enforcement to protect undocumented residents.',
  'expedited removal':  'A fast-track deportation process that allows immigration officials to remove certain people without a court hearing.',

  // ── Environment ────────────────────────────────────────────────────────────
  'Paris Agreement':    'A 2015 international treaty where countries committed to limiting global warming to 1.5–2°C above pre-industrial levels.',
  'carbon credit':      'A permit allowing a company to emit one ton of CO₂, which can be bought and sold — meant to create a market incentive to reduce emissions.',
  'ESG':                'Environmental, Social, and Governance — investment criteria measuring a company\'s ethics and sustainability, increasingly politicized.',
  'EPA':                'Environmental Protection Agency — the federal agency that sets and enforces pollution and environmental standards.',

  // ── Elections ──────────────────────────────────────────────────────────────
  'ranked choice':      'A voting method where voters rank candidates by preference. If no one wins outright, the lowest vote-getter is eliminated and their voters\' second choices are counted.',
  'voter ID':           'Laws requiring voters to show identification at the polls — supporters call it fraud prevention, critics call it voter suppression.',
  'dark money':         'Political spending by nonprofits that don\'t have to disclose their donors, making the funding source anonymous.',

  // ── Media / DC ─────────────────────────────────────────────────────────────
  'deep state':         'A theory that career government officials secretly work against elected leaders. Used as a political term, its meaning varies widely.',
  'executive order':    'A presidential directive that has the force of law without requiring Congressional approval.',
  'executive privilege':'The president\'s claimed right to keep some White House communications confidential from Congress or courts.',
  'emoluments clause':  'A constitutional rule banning federal officials from accepting gifts or payments from foreign governments.',
};

// Pre-build a sorted list of terms (longest first) for efficient matching
export const JARGON_TERMS = Object.keys(JARGON).sort((a, b) => b.length - a.length);
