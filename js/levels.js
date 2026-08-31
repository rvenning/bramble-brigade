// The campaign: four gardens of six levels each, boss on every sixth.
//
// WAVES ARE FULLY AUTHORED AND FULLY DETERMINISTIC. There is no `Math.random`
// anywhere in this game — every spawn is a fixed pest in a fixed lane at a
// fixed second — so the bots replay the whole campaign byte-exactly and a
// changed clear time is always a real balance change, never a bad roll.
//
// A wave is written as `W(at, "slug@0 slug@2 beetle@4")`: the second at which
// it arrives, then whitespace-separated `pestId@lane` pairs. Lanes are 0-4 from
// the top. The parser is strict — an unknown pest id or an out-of-range lane
// throws at load rather than quietly spawning nothing — and it is what
// tests/content.test.js reads, so the linter checks the same structure the
// engine plays.
//
// EACH GARDEN CHANGES ONE RULE, and the rule is what makes the garden hard
// rather than the pest count:
//   1 Kitchen Garden — nothing. The plain game, so it can be learned.
//   2 Orchard at Dusk — `trickle: 0`. No water falls from the sky at dusk, so
//     the whole economy is Wellsprings you had to choose to plant.
//   3 The Rockery — `stone` cells cannot be planted, so the tidy grid you have
//     been building for two gardens has holes in exactly the wrong places.
//   4 The Compost Heap — `sour: true`. A square where a plant DIES goes barren
//     for a while, so losing ground compounds instead of resetting.

const ROWS = 5;
const COLS = 9;

function W(at, spec) {
  const spawn = spec.trim().split(/\s+/).map((tok) => {
    const [id, lane] = tok.split("@");
    const n = Number(lane);
    if (!PEST_BY_ID[id]) throw new Error(`levels.js: unknown pest "${id}"`);
    if (!(n >= 0 && n < ROWS)) throw new Error(`levels.js: lane ${lane} out of range in "${tok}"`);
    return [id, n];
  });
  return { at, spawn };
}

const GARDENS = [
  { name: "The Kitchen Garden", icon: "🥕", blurb: "Neat rows, soft ground, and the first slugs of the year." },
  { name: "The Orchard at Dusk", icon: "🌙", blurb: "No sun means no free water. Everything comes from your Wellsprings." },
  { name: "The Rockery", icon: "🪨", blurb: "Half the good squares are stone. Build around the gaps." },
  { name: "The Compost Heap", icon: "🍂", blurb: "Ground that loses a plant turns sour and stays sour." },
];

const LEVELS = [
  /* ============ GARDEN 1 — THE KITCHEN GARDEN ============
     Deliberately gentle. An eight-year-old should finish this garden.
     One new idea per level, and the first two cannot really be lost. */
  {
    name: "First Slugs", garden: 0, water: 200, trickle: 1.4,
    intro: "Plant a Wellspring or two, then a Peppershot in front of it.",
    waves: [
      W(12, "slug@2"),
      W(30, "slug@1 slug@3"),
      W(52, "slug@0 slug@2 slug@4"),
      W(76, "slug@1 slug@2 slug@3"),
    ],
    ace: 3, par: 8,
  },
  {
    name: "Beetle Drive", garden: 0, water: 200, trickle: 1.4,
    intro: "Beetles are twice as quick. A Bramble in front buys you the time.",
    waves: [
      W(12, "slug@2"),
      W(28, "beetle@0 slug@3"),
      W(48, "beetle@1 beetle@4 slug@2"),
      W(70, "beetle@0 beetle@2 slug@1 slug@3"),
      W(94, "beetle@1 beetle@2 beetle@3 slug@4"),
    ],
    ace: 3, par: 8,
  },
  {
    name: "Both Sides", garden: 0, water: 200, trickle: 1.4,
    intro: "They come down every row now. Spread out — don't stack one column.",
    waves: [
      W(10, "slug@0 slug@4"),
      W(28, "beetle@1 beetle@3"),
      W(46, "slug@0 slug@2 slug@4 beetle@1"),
      W(68, "beetle@0 beetle@2 beetle@4 slug@1 slug@3"),
      W(92, "beetle@0 beetle@1 beetle@3 beetle@4 slug@2"),
      W(118, "beetle@1 beetle@2 beetle@3 slug@0 slug@4"),
    ],
    ace: 3, par: 8,
  },
  {
    name: "Slow and Hungry", garden: 0, water: 225, trickle: 1.4,
    intro: "A Caterpillar barely moves, but it chews a plant to nothing in seconds.",
    waves: [
      W(12, "slug@2 slug@3"),
      W(30, "caterpillar@1"),
      W(52, "beetle@0 beetle@4 caterpillar@3"),
      W(76, "slug@1 slug@2 beetle@3 caterpillar@0"),
      W(102, "beetle@0 beetle@2 beetle@4 caterpillar@1 caterpillar@3"),
      W(130, "slug@0 slug@1 slug@3 slug@4 caterpillar@2"),
    ],
    ace: 3, par: 8,
  },
  {
    name: "Wings", garden: 0, water: 225, trickle: 1.4,
    intro: "Wasps fly clean over everything on the ground. Only a Dandelion can touch them.",
    waves: [
      W(12, "slug@1 slug@3"),
      W(28, "wasp@2"),
      W(48, "beetle@0 beetle@4 wasp@1"),
      W(70, "wasp@0 wasp@3 slug@2"),
      W(96, "beetle@1 beetle@3 caterpillar@2 wasp@4"),
      W(124, "wasp@0 wasp@2 wasp@4 beetle@1 beetle@3"),
    ],
    ace: 3, par: 7,
  },
  {
    name: "The Slimeking", garden: 0, boss: true, water: 250, trickle: 1.4,
    intro: "Something enormous is coming up the middle row. Everything else is a distraction.",
    waves: [
      W(10, "slug@0 slug@4"),
      W(26, "beetle@1 beetle@3"),
      W(44, "slug@0 slug@2 slug@4 wasp@1"),
      W(64, "slimeking@2"),
      W(86, "beetle@0 beetle@4 wasp@3"),
      W(112, "beetle@1 beetle@3 slug@0 slug@4"),
      W(140, "wasp@0 wasp@4 caterpillar@2 beetle@1 beetle@3"),
    ],
    ace: 6, par: 11,
  },

  /* ============ GARDEN 2 — THE ORCHARD AT DUSK ============
     `trickle: 0`. Nothing falls from the sky. Every drop is a Wellspring you
     chose to plant instead of a gun, which is the first real economic
     decision in the game — and Snails arrive to punish under-building. */
  {
    name: "Last Light", garden: 1, water: 300, trickle: 0,
    intro: "No water falls at dusk. Wellsprings are the only income you have.",
    waves: [
      W(16, "slug@2"),
      W(36, "slug@1 slug@3"),
      W(58, "beetle@0 beetle@4 slug@2"),
      W(84, "beetle@1 beetle@3 slug@0 slug@4"),
      W(112, "beetle@0 beetle@2 beetle@4 caterpillar@1"),
      W(142, "beetle@1 beetle@3 slug@0 slug@2 slug@4"),
    ],
    ace: 2, par: 7,
  },
  {
    name: "Shell Game", garden: 1, water: 300, trickle: 0,
    intro: "A Snail's shell soaks up ordinary shots. Thumper goes straight through it.",
    waves: [
      W(16, "slug@1 slug@3"),
      W(36, "snail@2"),
      W(58, "snail@0 snail@4 beetle@2"),
      W(84, "beetle@1 beetle@3 snail@2 slug@0"),
      W(112, "snail@1 snail@3 caterpillar@2 beetle@0 beetle@4"),
      W(142, "snail@0 snail@2 snail@4 beetle@1 beetle@3"),
    ],
    ace: 2, par: 7,
  },
  {
    name: "Underground", garden: 1, water: 300, trickle: 0,
    intro: "Moles tunnel under your front line and surface behind it. Keep something in the back rows.",
    waves: [
      W(16, "slug@0 slug@4"),
      W(34, "mole@2"),
      W(54, "mole@1 mole@3 beetle@2"),
      W(80, "snail@0 snail@4 mole@2"),
      W(108, "mole@0 mole@2 mole@4 beetle@1 beetle@3"),
      W(138, "snail@1 snail@3 mole@2 caterpillar@0 beetle@4"),
      W(170, "mole@1 mole@3 snail@0 snail@2 snail@4"),
    ],
    ace: 4, par: 11,
  },
  {
    name: "Nightjar", garden: 1, water: 325, trickle: 0,
    intro: "Wasps in the dark. You still need a Dandelion, and it still costs water you haven't got.",
    waves: [
      W(14, "slug@1 slug@3"),
      W(32, "wasp@0 wasp@4"),
      W(54, "snail@2 beetle@1 beetle@3"),
      W(80, "wasp@1 wasp@3 mole@2"),
      W(108, "snail@0 snail@4 wasp@2 caterpillar@1"),
      W(138, "wasp@0 wasp@2 wasp@4 snail@1 snail@3"),
      W(172, "mole@0 mole@4 caterpillar@2 wasp@1 wasp@3 beetle@2"),
    ],
    ace: 2, par: 7,
  },
  {
    name: "The Long Row", garden: 1, water: 325, trickle: 0,
    intro: "Nothing new. Just more of it, for longer, on the water you can make.",
    waves: [
      W(14, "slug@0 slug@2 slug@4"),
      W(32, "beetle@1 beetle@3 snail@2"),
      W(54, "mole@0 mole@4 wasp@2"),
      W(78, "snail@1 snail@3 caterpillar@2 beetle@0"),
      W(106, "wasp@0 wasp@4 mole@2 snail@1 snail@3"),
      W(136, "caterpillar@1 caterpillar@3 beetle@0 beetle@2 beetle@4"),
      W(168, "snail@0 snail@2 snail@4 wasp@1 wasp@3 mole@2"),
      W(202, "mole@1 mole@3 caterpillar@2 snail@0 snail@4 beetle@1 beetle@3"),
    ],
    ace: 3, par: 8,
  },
  {
    name: "The Queen Wasp", garden: 1, boss: true, water: 350, trickle: 0,
    intro: "She flies over the lot and keeps calling for more. Dandelions or nothing.",
    waves: [
      W(14, "slug@0 slug@4 beetle@2"),
      W(34, "wasp@1 wasp@3"),
      W(56, "snail@0 snail@4 mole@2"),
      W(76, "queenwasp@2"),
      W(100, "wasp@0 wasp@4 beetle@1 beetle@3"),
      W(130, "snail@1 snail@3 caterpillar@2"),
      W(162, "wasp@0 wasp@2 wasp@4 mole@1 mole@3"),
      W(196, "snail@0 snail@2 snail@4 caterpillar@1 caterpillar@3"),
    ],
    ace: 2, par: 7,
  },

  /* ============ GARDEN 3 — THE ROCKERY ============
     `stone` cells cannot be planted. The player has spent twelve levels
     learning a tidy back-to-front build order; here the squares that build
     order needs are simply missing, and Aphid Clumps punish killing late. */
  {
    name: "Stony Ground", garden: 2, water: 325, trickle: 1.4,
    stone: [[1, 0], [2, 2], [1, 4], [4, 1], [4, 3]],
    intro: "Grey squares are stone. Nothing grows there — build around them.",
    waves: [
      W(14, "slug@0 slug@2 slug@4"),
      W(32, "beetle@1 beetle@3"),
      W(54, "snail@2 beetle@0 beetle@4"),
      W(80, "caterpillar@1 caterpillar@3 slug@2"),
      W(108, "snail@0 snail@4 beetle@1 beetle@2 beetle@3"),
      W(138, "snail@1 snail@3 caterpillar@2 beetle@0 beetle@4"),
    ],
    ace: 2, par: 6,
  },
  {
    name: "Clump", garden: 2, water: 350, trickle: 1.4,
    stone: [[2, 1], [2, 3], [5, 0], [5, 2], [5, 4]],
    intro: "An Aphid Clump bursts into two when it dies. Kill it early, out at the front.",
    waves: [
      W(14, "slug@1 slug@3"),
      W(32, "clump@2"),
      W(54, "clump@0 clump@4 beetle@2"),
      W(80, "snail@1 snail@3 clump@2"),
      W(108, "clump@0 clump@2 clump@4 beetle@1 beetle@3"),
      W(138, "caterpillar@1 caterpillar@3 clump@0 clump@4 snail@2"),
      W(170, "clump@1 clump@3 snail@0 snail@2 snail@4"),
    ],
    ace: 2, par: 6,
  },
  {
    name: "Crows", garden: 2, water: 350, trickle: 1.4,
    stone: [[1, 1], [1, 3], [3, 0], [3, 4], [6, 2]],
    intro: "Crows are wasps that took themselves seriously. One Dandelion will not be enough.",
    waves: [
      W(14, "beetle@0 beetle@2 beetle@4"),
      W(32, "crow@1 crow@3"),
      W(56, "clump@2 snail@0 snail@4"),
      W(82, "crow@0 crow@2 crow@4"),
      W(110, "snail@1 snail@3 caterpillar@2 crow@0"),
      W(140, "crow@1 crow@3 clump@0 clump@4 mole@2"),
      W(174, "crow@0 crow@2 crow@4 snail@1 snail@3 caterpillar@2"),
    ],
    ace: 2, par: 6,
  },
  {
    name: "Split the Difference", garden: 2, water: 350, trickle: 1.4,
    stone: [[2, 0], [2, 2], [2, 4], [5, 1], [5, 3], [7, 2]],
    intro: "Marigold lobs over walls and bursts over a patch. It is the answer to a crowd.",
    waves: [
      W(14, "clump@1 clump@3"),
      W(34, "snail@0 snail@2 snail@4"),
      W(58, "clump@0 clump@2 clump@4 crow@1"),
      W(84, "mole@1 mole@3 caterpillar@2 crow@0 crow@4"),
      W(114, "clump@1 clump@3 snail@0 snail@4 beetle@2"),
      W(146, "crow@0 crow@2 crow@4 clump@1 clump@3"),
      W(180, "caterpillar@0 caterpillar@4 clump@2 snail@1 snail@3 mole@2"),
    ],
    ace: 2, par: 6,
  },
  {
    name: "Scree", garden: 2, water: 375, trickle: 1.4,
    stone: [[1, 0], [1, 2], [1, 4], [3, 1], [3, 3], [5, 0], [5, 2], [5, 4], [7, 1], [7, 3]],
    intro: "Barely a square left. Every plant you put down has to be worth its spot.",
    waves: [
      W(14, "beetle@1 beetle@3 slug@2"),
      W(34, "snail@0 snail@4 clump@2"),
      W(58, "crow@1 crow@3 mole@2"),
      W(84, "clump@0 clump@2 clump@4 caterpillar@1"),
      W(114, "snail@1 snail@3 crow@0 crow@4 beetle@2"),
      W(146, "caterpillar@0 caterpillar@2 caterpillar@4 clump@1 clump@3"),
      W(180, "crow@1 crow@3 snail@0 snail@2 snail@4 mole@1 mole@3"),
      W(216, "clump@0 clump@2 clump@4 crow@1 crow@3 caterpillar@2"),
    ],
    ace: 4, par: 12,
  },
  {
    name: "The Mole King", garden: 2, boss: true, water: 400, trickle: 1.4,
    stone: [[2, 1], [2, 3], [4, 0], [4, 4], [6, 2]],
    intro: "It dives whenever it is losing, and comes up somewhere you were not looking.",
    waves: [
      W(14, "beetle@0 beetle@2 beetle@4"),
      W(34, "clump@1 clump@3 snail@2"),
      W(56, "crow@0 crow@4 mole@2"),
      W(78, "moleking@2"),
      W(104, "snail@1 snail@3 clump@0 clump@4"),
      W(134, "crow@1 crow@3 caterpillar@2 mole@0 mole@4"),
      W(168, "clump@0 clump@2 clump@4 crow@1 crow@3"),
      W(204, "snail@0 snail@2 snail@4 caterpillar@1 caterpillar@3 mole@2"),
    ],
    ace: 11, par: 17,
  },

  /* ============ GARDEN 4 — THE COMPOST HEAP ============
     `sour: true`. A square where a plant dies is barren for SOUR_SECS, so a
     breach does not reset — it takes the ground with it. This is the only
     garden where falling behind compounds, which is exactly what makes it the
     adult end of the campaign. Armoured Weevils and the Beetroot Bomb arrive
     together: the level that hands you the bomb is the level that needs it. */
  {
    name: "Turning the Heap", garden: 3, water: 375, trickle: 1.4,
    sour: true,
    intro: "Where a plant dies, the ground goes sour and nothing will grow for a while.",
    waves: [
      W(14, "slug@0 slug@2 slug@4"),
      W(34, "beetle@1 beetle@3 snail@2"),
      W(58, "clump@0 clump@4 caterpillar@2"),
      W(84, "snail@1 snail@3 crow@0 crow@4"),
      W(114, "caterpillar@1 caterpillar@3 clump@2 beetle@0 beetle@4"),
      W(146, "snail@0 snail@2 snail@4 crow@1 crow@3"),
      W(180, "clump@1 clump@3 caterpillar@2 mole@0 mole@4 beetle@2"),
    ],
    ace: 4, par: 9,
  },
  {
    name: "Weevils", garden: 3, water: 400, trickle: 1.4,
    sour: true,
    intro: "Snail plating on beetle legs. Thumper, or the Beetroot Bomb.",
    waves: [
      W(14, "beetle@1 beetle@3 slug@2"),
      W(32, "weevil@2"),
      W(54, "weevil@0 weevil@4 clump@2"),
      W(80, "weevil@1 weevil@3 crow@0 crow@4"),
      W(110, "weevil@0 weevil@2 weevil@4 caterpillar@1 caterpillar@3"),
      W(142, "crow@1 crow@3 weevil@2 clump@0 clump@4"),
      W(176, "weevil@0 weevil@2 weevil@4 crow@1 crow@3 mole@2"),
      W(212, "weevil@1 weevil@3 caterpillar@0 caterpillar@4 clump@2 snail@1 snail@3"),
    ],
    ace: 1, par: 8,
  },
  {
    name: "Everything At Once", garden: 3, water: 400, trickle: 1.4,
    sour: true,
    stone: [[3, 0], [3, 4], [6, 2]],
    intro: "One of everything, on sour ground, with stone in the way.",
    waves: [
      W(14, "weevil@0 weevil@4 crow@2"),
      W(34, "clump@1 clump@3 mole@2"),
      W(56, "caterpillar@0 caterpillar@2 caterpillar@4"),
      W(82, "crow@1 crow@3 weevil@2 snail@0 snail@4"),
      W(112, "clump@0 clump@2 clump@4 mole@1 mole@3"),
      W(144, "weevil@1 weevil@3 crow@0 crow@4 caterpillar@2"),
      W(178, "snail@0 snail@2 snail@4 crow@1 crow@3 weevil@2"),
      W(214, "clump@1 clump@3 caterpillar@0 caterpillar@4 weevil@2 mole@1 mole@3"),
    ],
    ace: 2, par: 6,
  },
  {
    name: "Thin Soil", garden: 3, water: 425, trickle: 1.4,
    sour: true,
    stone: [[1, 1], [1, 3], [3, 2], [5, 1], [5, 3], [7, 4]],
    intro: "Sour ground and stone together. You will not get a second go at a square.",
    waves: [
      W(14, "beetle@0 beetle@2 beetle@4"),
      W(32, "weevil@1 weevil@3 crow@2"),
      W(56, "clump@0 clump@4 caterpillar@2 mole@1"),
      W(82, "weevil@0 weevil@2 weevil@4 crow@1 crow@3"),
      W(112, "caterpillar@1 caterpillar@3 clump@2 snail@0 snail@4"),
      W(144, "crow@0 crow@2 crow@4 weevil@1 weevil@3"),
      W(178, "mole@0 mole@2 mole@4 caterpillar@1 caterpillar@3 clump@2"),
      W(214, "weevil@0 weevil@2 weevil@4 crow@1 crow@3 snail@0 snail@4"),
      W(252, "clump@1 clump@3 caterpillar@2 weevil@0 weevil@4 crow@1 crow@3"),
    ],
    ace: 4, par: 9,
  },
  {
    name: "The Last Warm Week", garden: 3, water: 425, trickle: 1.4,
    sour: true,
    stone: [[2, 2], [4, 0], [4, 4], [6, 1], [6, 3]],
    intro: "The longest week of the year. Hold the patch until the frost comes.",
    waves: [
      W(12, "weevil@1 weevil@3 crow@2"),
      W(30, "clump@0 clump@2 clump@4"),
      W(52, "caterpillar@1 caterpillar@3 weevil@2 mole@0 mole@4"),
      W(78, "crow@0 crow@2 crow@4 snail@1 snail@3"),
      W(108, "weevil@0 weevil@2 weevil@4 clump@1 clump@3"),
      W(140, "caterpillar@0 caterpillar@2 caterpillar@4 crow@1 crow@3"),
      W(174, "weevil@1 weevil@3 mole@0 mole@2 mole@4 clump@2"),
      W(216, "crow@0 crow@2 crow@4 weevil@1 weevil@3"),
      W(258, "clump@0 clump@2 clump@4 weevil@1 weevil@3 crow@0 crow@4"),
    ],
    ace: 3, par: 7,
  },
  {
    name: "The Thistle Titan", garden: 3, boss: true, water: 450, trickle: 1.4,
    sour: true,
    stone: [[3, 1], [3, 3], [6, 0], [6, 4]],
    intro: "Armoured to the eyeballs, and it does not die all at once.",
    waves: [
      W(12, "weevil@0 weevil@4 crow@2"),
      W(32, "clump@1 clump@3 caterpillar@2"),
      W(54, "crow@0 crow@2 crow@4 weevil@1 weevil@3"),
      W(80, "titan@2"),
      W(108, "weevil@0 weevil@4 clump@1 clump@3"),
      W(140, "crow@1 crow@3 caterpillar@0 caterpillar@4 mole@2"),
      W(176, "weevil@0 weevil@2 weevil@4 crow@1 crow@3"),
      W(214, "clump@0 clump@2 clump@4 caterpillar@1 caterpillar@3 weevil@2"),
      W(254, "crow@0 crow@2 crow@4 weevil@1 weevil@3 snail@0 snail@4 mole@2"),
    ],
    ace: 17, par: 27,
  },
];

LEVELS.forEach((lv, i) => { lv.idx = i; });

// What tray this level actually wants — used by the "Pick for me" button and
// by the bots, which is the same decision a player makes on the seed screen
// after reading what is coming.
//
// This exists because the naive version (economy, a gun, a wall, then whatever
// unlocked most recently) filled the last slot with Twinshot from level 15 on
// and pushed the anti-air out — so the tray handed to a player walking into a
// level full of Crows contained nothing that could reach one. The bots lost
// every flyer level from there to the end of the campaign, which read as a
// brutal difficulty curve and was a broken default kit.
function suggestLoadout(level, cleared, slots) {
  const open = unlockedPlants(cleared);
  const ids = new Set();
  if (level && level.waves) {
    for (const w of level.waves) for (const [id] of w.spawn) {
      ids.add(id);
      const sp = PEST_BY_ID[id].split;
      if (sp) ids.add(sp[0]);
    }
  }
  const any = (f) => [...ids].some((id) => f(PEST_BY_ID[id]));
  const endless = !level || level.endless;

  // Ordered by how much the level needs it, not by how new it is.
  const want = ["wellspring", "peppershot"];
  if (endless || any((p) => p.air)) want.push("dandelion");
  if (endless || any((p) => p.armour)) want.push("thumper");
  want.push("bramble");
  // The bomb outranks the nice-to-haves on a boss level: it is the only thing
  // that answers the Titan's 1400 of armour in one go, and ranking it below
  // Marigold pushed it out of a six-slot tray on the final level of the game.
  if (endless || any((p) => p.boss)) want.push("beetroot");
  if (endless || any((p) => p.split) || any((p) => p.air)) want.push("marigold");
  if (endless || any((p) => p.eat >= 70)) want.push("ivynet");
  want.push("twinshot", "nettle");

  const out = [];
  for (const id of want) {
    if (out.length >= slots) break;
    if (open.includes(id) && !out.includes(id)) out.push(id);
  }
  // Top up from anything still unlocked, so a big tray is never left short.
  for (const id of open) {
    if (out.length >= slots) break;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, slots);
}

// Levels unlock in order: the one after the highest you have finished.
function unlockedLevel(progress) {
  let max = -1;
  for (const k of Object.keys(progress.levels || {})) max = Math.max(max, Number(k));
  return Math.min(max + 1, LEVELS.length - 1);
}

// `lost` is plants eaten + 3 per scarecrow spent — one number for "how much
// ground did this cost you". Graded on damage taken rather than on a clock, so
// a careful eight-year-old can three-star a level a hurried adult cannot.
function starsFor(level, lost) {
  if (lost <= level.ace) return 3;
  if (lost <= level.par) return 2;
  return 1;
}

if (typeof module !== "undefined") module.exports = { LEVELS, GARDENS, ROWS, COLS, unlockedLevel, starsFor, suggestLoadout };
