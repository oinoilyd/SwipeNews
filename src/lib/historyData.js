// ── Historical disputes — hardcoded perspectives ──────────────────────────────
// Each dispute has exactly 3 perspectives with case-specific labels.
// Left/right swipe navigates perspectives; up/down swipe navigates disputes.

export const HISTORY_DISPUTES = [
  {
    id:       'israel-palestine',
    title:    'Israel-Palestine Conflict',
    period:   '1948 – Present',
    gradient: ['#1e3a5f', '#2d6a9f'],   // blue
    perspectives: [
      {
        index:  0,
        label:  'Pro-Israel Perspective',
        color:  '#3b82f6',
        title:  'Legitimacy, Security, and the Right to Exist',
        paragraphs: [
          'Israel was established in 1948 under a UN partition plan in a region with deep Jewish historical and religious roots, following two thousand years of diaspora and the murder of six million Jews in the Holocaust. The state\'s creation represented the international community\'s recognition that the Jewish people required a homeland, and its declaration of independence was immediately followed by a joint Arab military invasion — establishing from the outset a pattern of existential threats.',
          'Israel has repeatedly pursued negotiated peace, including the Camp David proposals in 2000 that offered Palestinian statehood across most of the West Bank and Gaza. Military operations in Gaza and the West Bank are responses to sustained terrorism — rocket fire into civilian areas, suicide bombings, and coordinated attacks including the October 7, 2023 massacre. Every state has both the right and the obligation to defend its citizens from such attacks.',
          'The Palestinian Authority and Hamas have at different times controlled Palestinian territories and have made choices — rejecting peace proposals, initiating attacks, misappropriating aid — that have set back their own people. Israel\'s policies, however contested, are those of an accountable democracy operating under genuine security constraints that no other country is asked to simply absorb.',
        ],
      },
      {
        index:  1,
        label:  'Historical Overview',
        color:  '#a78bfa',
        title:  'Competing Claims to a Contested Land',
        paragraphs: [
          'The conflict\'s modern roots trace to late 19th-century Zionist immigration to Ottoman-controlled Palestine, where a substantial Arab population already lived. British promises during World War I — the Balfour Declaration supporting a Jewish homeland and the McMahon correspondence implying Arab independence — created contradictory commitments that shaped decades of conflict. The 1947 UN partition plan assigned roughly 56% of Mandatory Palestine to a Jewish state and 44% to an Arab state, with Jerusalem internationalized.',
          'The 1948 Arab-Israeli War resulted in Israeli statehood, the displacement of approximately 700,000 Palestinians (the Nakba), and the absorption of Palestinian territory by Jordan and Egypt. Subsequent wars in 1967 and 1973 dramatically altered the map: Israel captured the West Bank, Gaza, Sinai, and Golan Heights. The Oslo Accords of 1993 established the Palestinian Authority and a framework for eventual statehood, but final status negotiations on borders, Jerusalem, refugees, and settlements have never been resolved.',
          'Today, roughly 5 million Palestinians live under Israeli military administration in the West Bank or under Hamas governance in the blockaded Gaza Strip, while 2 million Palestinian citizens live in Israel with full citizenship. Israeli settlements house over 700,000 people in the West Bank. The conflict has produced multiple cycles of warfare, international diplomatic efforts, and persistent disagreement over which sequence of steps — security first or statehood first — can produce durable peace.',
        ],
      },
      {
        index:  2,
        label:  'Pro-Palestine Perspective',
        color:  '#22c55e',
        title:  'Displacement, Occupation, and the Right to Self-Determination',
        paragraphs: [
          'The Palestinian experience begins with the Nakba — the displacement of approximately 700,000 Palestinians from their homes, farms, and villages in 1948, which created a refugee population whose descendants now number in the millions. The villages they fled were destroyed or repopulated; the land became part of the Israeli state. UN Resolution 194 affirmed the right of return, which Israel has never implemented. Palestinian identity, culture, and national aspiration were forged partly in exile and under occupation.',
          'The 1967 Israeli occupation of the West Bank and Gaza placed millions of Palestinians under military rule without citizenship, voting rights in the state governing them, or freedom of movement. The continued expansion of Israeli settlements — declared illegal under international law by the UN Security Council and the International Court of Justice — has fragmented Palestinian land and dismantled the territorial basis of any viable state. Movement restrictions, checkpoints, home demolitions, and administrative detention have become features of daily life under occupation.',
          'The blockade of Gaza, imposed after Hamas took control in 2007, has been described by United Nations agencies and human rights organizations as a form of collective punishment. Israel controls Gaza\'s borders, airspace, and coastline, restricting the entry of goods, construction materials, and movement of people. The asymmetry of violence — the significant disproportion in Palestinian and Israeli casualties across multiple Gaza conflicts — has been documented by international human rights bodies including those that also document Hamas war crimes.',
        ],
      },
    ],
  },

  {
    id:       'us-russia',
    title:    'US–Russia Tensions',
    period:   'Cold War – Present',
    gradient: ['#1a1a2e', '#4a1942'],   // deep navy/purple
    perspectives: [
      {
        index:  0,
        label:  'US-Aligned Perspective',
        color:  '#60a5fa',
        title:  'Deterrence, Democracy, and the Defense of Sovereignty',
        paragraphs: [
          'American and Western policy toward Russia rests on principles established in the post-World War II international order: sovereignty, territorial integrity, and the right of nations to choose their own alliances and forms of government. NATO expansion to 32 members reflects the sovereign choices of European democracies — including former Warsaw Pact states that had direct experience of Soviet occupation — who sought the security guarantees of collective defense. Each member applied voluntarily, and NATO accepted no obligation to limit its membership.',
          'Russia\'s 2014 annexation of Crimea and subsequent support for separatists in Donetsk and Luhansk violated the Budapest Memorandum of 1994, through which Russia, the United States, and the United Kingdom had explicitly guaranteed Ukrainian sovereignty in exchange for Ukraine surrendering the world\'s third-largest nuclear arsenal. The 2022 full-scale invasion — targeting civilian infrastructure, hospitals, and residential areas — represented the largest land war in Europe since 1945 and a direct assault on the principle that borders cannot be changed by force.',
          'The Western response — sanctions, military assistance to Ukraine, and accelerated NATO expansion — reflects a considered judgment that tolerating such violations would invite further aggression and undermine the security architecture that has prevented great-power war in Europe for 80 years. The alternative, accommodating Russian demands, would reward precisely the behavior the postwar order was designed to deter.',
        ],
      },
      {
        index:  1,
        label:  'Historical Overview',
        color:  '#a78bfa',
        title:  'Competition, Mistrust, and the Architecture of Rivalry',
        paragraphs: [
          'The US-Russia rivalry was institutionalized during the Cold War (1947–1991), as the two superpowers competed for global influence through proxy wars in Korea, Vietnam, Angola, Afghanistan, and Central America, alongside nuclear arms races and ideological competition. The collapse of the Soviet Union created a brief cooperative interlude, but disagreements over NATO expansion, the 1999 Kosovo war, and growing Russian nationalism under Putin hardened positions on both sides.',
          'NATO\'s eastward expansion — incorporating Poland, Hungary, and the Czech Republic in 1999 and seven more states in 2004 — proceeded over Russian objections that have been documented since the early 1990s. Whether Western leaders made informal assurances against expansion (as some Russian officials claim) or no formal commitment existed (the Western position) remains disputed. The 2007 Munich Security Conference speech in which Putin outlined Russian security grievances is seen by analysts as a turning point in the relationship.',
          'The 2022 invasion of Ukraine has produced the deepest rupture in European security since World War II. Russian forces have committed documented war crimes; Ukrainian resistance has outperformed most predictions; Western unity has been stronger than Russia anticipated. The conflict has also accelerated NATO expansion (Finland and Sweden joined in 2023–24) and reshuffled global alignments, with China and India maintaining ambiguous positions. Both sides possess large nuclear arsenals, making the conflict one with consequences far beyond Ukraine.',
        ],
      },
      {
        index:  2,
        label:  'Russia-Aligned Perspective',
        color:  '#f87171',
        title:  'Security Concerns, Buffer States, and the NATO Question',
        paragraphs: [
          'From a Russian strategic perspective, NATO\'s expansion from 16 to 32 members since 1991 — incorporating countries on Russia\'s immediate borders including the Baltic states — represents a fundamental shift in European security that Western powers promised informally not to pursue. Russian officials, including those who engaged directly in 1990–91 negotiations, have consistently stated that James Baker\'s assurance that NATO would not expand "one inch eastward" was a genuine commitment, later violated by Western governments under pressure from Eastern European states.',
          'Russia\'s position is grounded in traditional great-power understandings of spheres of influence that have governed international relations for centuries. The United States has itself acted on similar logic throughout its history: the Monroe Doctrine excluded European powers from the Western Hemisphere; the Cuban Missile Crisis nearly produced nuclear war over Soviet missiles 90 miles from Florida. Whether or not one endorses Russian actions in Ukraine, the strategic logic driving them — preventing a hostile military alliance from operating on Russia\'s border — is historically comprehensible.',
          'The Russian view holds that Ukraine\'s NATO candidacy, announced at the Bucharest Summit in 2008, constituted an unacceptable threat — not because Russia sought to reconquer Ukraine, but because NATO membership would bring Western military infrastructure to within striking distance of Moscow. Russia\'s preferred outcome was a neutral Ukraine, on the Austrian or Finnish model, that maintained economic ties with both East and West without joining a military bloc directed against Russia.',
        ],
      },
    ],
  },

  {
    id:       'india-pakistan',
    title:    'India–Pakistan Conflict',
    period:   '1947 – Present',
    gradient: ['#14532d', '#1e3a5f'],   // green/blue
    perspectives: [
      {
        index:  0,
        label:  'India-Focused Perspective',
        color:  '#f97316',
        title:  'Legitimate Accession, Democracy, and Cross-Border Terror',
        paragraphs: [
          'Kashmir\'s accession to India in October 1947 was legally valid under the same Instrument of Accession used by hundreds of other princely states — signed by Maharaja Hari Singh when Pakistani-backed Pashtun tribal militias invaded and began advancing on Srinagar. The argument that the Muslim-majority population should have determined the outcome would, by identical logic, require reopening the accession of dozens of Muslim-majority regions that chose India, and ignores that accession was a decision of rulers, not referendums.',
          'India points to decades of documented cross-border terrorism from Pakistani territory: the 1999 Kargil intrusion by Pakistani forces disguised as militants, the 2001 attack on the Indian Parliament by Pakistan-based Lashkar-e-Taiba, and the 2008 Mumbai attacks that killed 166 people — carried out by Pakistani nationals with support from Pakistan\'s Inter-Services Intelligence. Pakistani officials\' denials of involvement have been contradicted by US intelligence findings, UN sanctions designations, and the operation that found Osama bin Laden living in a military cantonment city.',
          'Jammu and Kashmir has held state assembly elections and been represented in the Indian Parliament since the 1950s, however contested those elections have been. India\'s 2019 revocation of Article 370 is presented domestically as extending to all Indian citizens in J&K the same constitutional protections enjoyed elsewhere — including property rights for women and minority communities that the autonomous status had limited. Pakistan\'s own treatment of Balochistan and Pakistani-administered Kashmir, with documented suppression of political dissent, is rarely addressed in Pakistani criticism of Indian governance.',
        ],
      },
      {
        index:  1,
        label:  'Historical Overview',
        color:  '#a78bfa',
        title:  'Partition, Four Wars, and the Unresolved Kashmir Question',
        paragraphs: [
          'The 1947 partition of British India along religious lines created two independent states simultaneously and triggered one of history\'s largest forced migrations — an estimated 10–20 million people crossed the new borders — accompanied by communal violence that killed between 200,000 and 2 million. The partition was hastily executed over weeks, and the status of several princely states, including Jammu and Kashmir, was deliberately deferred. When fighting broke out, the Maharaja signed over to India, India airlifted troops, and the first Indo-Pakistani war began; the UN brokered a ceasefire leaving each side controlling portions of Kashmir.',
          'The two states have fought four wars: 1947–48, 1965, 1971, and the 1999 Kargil conflict. The 1971 war, in which India intervened in support of the Bengali independence movement in East Pakistan, created Bangladesh and produced the largest South Asian military victory of the 20th century. Both states conducted nuclear tests in 1998, making the Indo-Pakistani rivalry one of the most dangerous nuclear flashpoints in the world. The Line of Control dividing Indian-administered Jammu and Kashmir from Pakistani-administered Azad Kashmir has been stable since 1972 but is subject to regular cross-border firing.',
          'Economic development has diverged sharply since partition: India has grown into a $3.5 trillion economy and a major technology power; Pakistan faces recurring economic crises, military intervention in politics, and persistent internal security challenges. Normalization of trade and diplomatic relations, attempted several times, has repeatedly collapsed following terrorist attacks attributed to Pakistani-based groups. Water sharing from the Indus river system — governed by a 1960 treaty — and nuclear doctrine remain active strategic concerns.',
        ],
      },
      {
        index:  2,
        label:  'Pakistan-Focused Perspective',
        color:  '#22d3ee',
        title:  'Self-Determination, Occupation, and the Unfinished Partition',
        paragraphs: [
          'The United Nations Security Council resolutions of 1948 called for a free and impartial plebiscite to determine the future of Kashmir according to the wishes of its predominantly Muslim population — a plebiscite that India has prevented for over 75 years. Pakistan\'s consistent position is that the partition principle — that Muslim-majority regions should belong to the Muslim state — was violated in Kashmir\'s case, where a Hindu ruler\'s decision to accede to India overrode the demographic and expressed will of the population.',
          'India\'s 2019 revocation of Article 370, which had given Jammu and Kashmir constitutionally guaranteed special status and autonomy, and the region\'s division into two centrally administered union territories, represent in Pakistan\'s view an escalation that extinguishes the legal framework within which a plebiscite could have been held. The months-long lockdown that followed — communications blackout, mass detentions including of elected politicians, curfews — were documented by international journalists and human rights organizations as severely restricting basic freedoms.',
          'Pakistan characterizes Indian security operations in Kashmir as an occupation maintained through military force rather than popular consent. Human rights organizations including Amnesty International and Human Rights Watch have documented pellet gun injuries causing permanent blindness, extrajudicial killings, and widespread use of preventive detention laws against political activists. Pakistan\'s view is that the Kashmiri people\'s aspiration for self-determination — whether independence or accession to Pakistan — is a legitimate political goal that India suppresses through force rather than politics.',
        ],
      },
    ],
  },

  {
    id:       'china-taiwan',
    title:    'China–Taiwan Conflict',
    period:   '1949 – Present',
    gradient: ['#7f1d1d', '#1e3a5f'],   // red/blue
    perspectives: [
      {
        index:  0,
        label:  'Taiwan\'s Perspective',
        color:  '#3b82f6',
        title:  'De Facto Independence and the Democratic Choice',
        paragraphs: [
          'Taiwan has operated as a fully self-governing democracy since 1949, with its own elected president and legislature, military, currency, passport, foreign relations, and legal system. For the 23 million people who live there, Taiwan is a functioning state by every practical measure. Its democratic consolidation since the 1990s — competitive elections, peaceful transfers of power between opposing parties, a free press, and independent judiciary — has produced a distinctive Taiwanese civic identity that majorities now identify with over any pan-Chinese identity.',
          'Decades of polling by Taiwan\'s Election Study Center show consistent majorities preferring the status quo of de facto independence over either formal declaration of independence or unification. Support for unification under the current PRC system is consistently below 5%. The claim that Taiwan\'s 23 million people should be governed by Beijing, which has exercised no authority there since 1949 and whose government they have never elected, runs directly counter to the democratic principle that governments derive legitimacy from the consent of the governed.',
          'Taiwan\'s economy, democracy, and international role demonstrate that Chinese culture and democratic governance are fully compatible — a fact with implications Beijing finds uncomfortable. Taiwan\'s semiconductor industry, centered on TSMC, produces a substantial share of the world\'s most advanced chips. Its democracy offers a model for Chinese-speaking societies that the PRC\'s one-party system explicitly rejects. This ideological competition, as much as any military calculus, explains Beijing\'s urgency about Taiwan.',
        ],
      },
      {
        index:  1,
        label:  'Historical Overview',
        color:  '#a78bfa',
        title:  'The 1949 Split, the Status Quo, and Rising Tensions',
        paragraphs: [
          'The current cross-strait situation dates to the Chinese Civil War. In 1949, after its defeat by the Chinese Communist Party, the Nationalist government (Republic of China) under Chiang Kai-shek retreated to Taiwan with approximately 1.2 million soldiers and government personnel. Both the PRC in Beijing and the ROC in Taipei initially claimed to be the sole legitimate government of all China. Over subsequent decades, the PRC replaced the ROC at the UN (1971) and in most formal diplomatic relationships; the US switched recognition to Beijing in 1979 while maintaining informal ties with Taipei through the American Institute in Taiwan.',
          'Taiwan\'s economy and polity transformed dramatically from the 1980s onward: export-led industrialization produced rapid growth, and martial law lifted in 1987, setting off a political liberalization that produced the first direct presidential election in 1996 — which Beijing tried to influence by firing missiles near Taiwanese ports, prompting US carrier group deployments. Cross-strait economic integration deepened from the 1990s: Taiwan is one of the largest investors in mainland China, and hundreds of thousands of Taiwanese live and work on the mainland.',
          'China\'s military buildup over the past two decades has included capabilities specifically designed for a Taiwan contingency: anti-ship missiles, amphibious assault ships, fighter aircraft, and a rapid expansion of naval tonnage. China regularly conducts large-scale exercises simulating a blockade or invasion. The United States sells Taiwan defensive weapons under the Taiwan Relations Act and has made deliberately ambiguous statements about whether it would intervene militarily. The question of Taiwan\'s status is considered by analysts among the most likely causes of great-power conflict in the 21st century.',
        ],
      },
      {
        index:  2,
        label:  'PRC\'s Perspective',
        color:  '#f87171',
        title:  'One China, Reunification, and the End of a Civil War',
        paragraphs: [
          'China\'s position is that Taiwan is an inalienable part of Chinese territory — a principle recognized in varying formulations by most of the world\'s governments, including the United States\' "One China policy," and embodied in UN General Assembly Resolution 2758 (1971), which transferred China\'s seat from the ROC to the PRC. From Beijing\'s perspective, the current cross-strait separation is the unfinished result of a civil war, not a partition between two sovereign states, and foreign military support for Taiwan constitutes interference in China\'s internal affairs.',
          'China has offered Taiwan a "one country, two systems" framework — the same arrangement applied to Hong Kong — which would preserve Taiwan\'s capitalist economy, legal system, and way of life under a high degree of autonomy, while accepting PRC sovereignty. Beijing argues that Taiwan\'s democratic political system is not in principle incompatible with reunification, and that independence is the one outcome foreclosing peaceful resolution. The PRC Anti-Secession Law (2005) explicitly authorizes the use of force if Taiwan formally declares independence or if prospects for peaceful reunification are "completely exhausted."',
          'From China\'s strategic perspective, Taiwan also has significance beyond national sentiment: it sits at the first island chain, and a hostile or foreign-aligned Taiwan would place potential adversaries within striking distance of the Chinese mainland and interrupt critical sea lanes. The deep US-Taiwan security relationship — including weapons sales, military exchanges, and senior official visits — is viewed not as defensive but as a US strategic effort to maintain leverage over China by keeping Taiwan\'s status unresolved.',
        ],
      },
    ],
  },
];
