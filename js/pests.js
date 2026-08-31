// Everything that wants to eat the vegetable patch.
//
// Four traits do all the work, and each one exists to INVALIDATE a plant that
// was working a moment ago. That is where the depth for an adult comes from —
// not from bigger numbers, but from each answer creating the next problem:
//
//   armour  — a shell soaks flat damage, so Peppershot (20 a shot) stops
//             mattering and you need Thumper's pierce or a bomb.
//   air     — flies straight over the ground line you spent the level building,
//             so a perfect wall-and-gun row does literally nothing.
//   burrow  — travels UNDER the first few columns and surfaces behind the front
//             line, punishing the player who stacked everything at column 1.
//   split   — dies into smaller, faster pieces, so killing it late (near the
//             gate) is much worse than killing it early.
//
// `speed` is columns per second. The board is nine columns deep, so a Slug at
// 0.112 takes about 80 seconds to walk the whole patch unopposed — that is the
// pace the whole economy is tuned against, and it is deliberately slow. An
// earlier draft ran everything 40% faster; a single gun then got only ten
// seconds of fire on an approaching Beetle, two in a lane beat any one plant,
// and the bots lost nineteen of twenty-four levels. Walking speed is the dial
// that decides whether a defence has time to exist at all.
//
// `eat` is damage per second dealt to whatever plant it is standing on.

const PEST_FLAGS = ["air", "burrow", "split", "armour"];

const PESTS = [
  {
    id: "slug", name: "Slug", icon: "🐌",
    hp: 100, speed: 0.112, eat: 30, coins: 1,
    blurb: "Slow, soft, and there are always more.",
  },
  {
    id: "beetle", name: "Beetle", icon: "🪲",
    hp: 90, speed: 0.21, eat: 30, coins: 1,
    blurb: "Half the patience of a slug and twice the legs.",
  },
  {
    id: "snail", name: "Snail", icon: "🐚",
    hp: 110, armour: 170, speed: 0.098, eat: 30, coins: 2,
    blurb: "The shell soaks up ordinary shots. Crack it or go through it.",
  },
  {
    id: "wasp", name: "Wasp", icon: "🐝",
    hp: 90, speed: 0.235, eat: 34, air: true, coins: 2,
    blurb: "Flies clean over everything you planted.",
  },
  {
    id: "mole", name: "Mole", icon: "🦫",
    hp: 140, speed: 0.182, eat: 32, burrow: 5.0, coins: 2,
    blurb: "Tunnels under your front line and comes up behind it.",
  },
  {
    id: "clump", name: "Aphid Clump", icon: "🟢",
    hp: 160, speed: 0.133, eat: 28, split: ["aphid", 2], coins: 2,
    blurb: "Bursts into two smaller ones. Deal with it early, not late.",
  },
  {
    id: "aphid", name: "Aphid", icon: "🫧",
    hp: 45, speed: 0.224, eat: 18, coins: 0, spawned: true,
    blurb: "What's left of a clump. Small, quick, annoying.",
  },
  {
    id: "caterpillar", name: "Caterpillar", icon: "🐛",
    hp: 320, speed: 0.091, eat: 74, coins: 3,
    blurb: "Barely moves. Chews through a plant in seconds.",
  },
  {
    id: "crow", name: "Crow", icon: "🐦‍⬛",
    hp: 200, speed: 0.196, eat: 40, air: true, coins: 3,
    blurb: "A wasp that took itself seriously.",
  },
  {
    id: "weevil", name: "Armoured Weevil", icon: "🪳",
    hp: 150, armour: 240, speed: 0.154, eat: 36, coins: 3,
    blurb: "Snail-plating on beetle legs.",
  },

  /* ----- Bosses: one per garden, each a straight escalation of that
     garden's own lesson rather than a new mechanic to learn at the worst
     possible moment. ----- */
  {
    id: "slimeking", name: "The Slimeking", icon: "👑", boss: true, garden: 0,
    hp: 2600, speed: 0.052, eat: 90, coins: 25,
    ability: { kind: "spit", every: 8.5, dmg: 90 },
    blurb: "An enormous slug. Spits at whatever is in front of it.",
  },
  {
    id: "queenwasp", name: "The Queen Wasp", icon: "👑", boss: true, garden: 1,
    hp: 3100, speed: 0.068, eat: 80, air: true, coins: 35,
    ability: { kind: "summon", every: 9, id: "wasp", n: 2 },
    blurb: "Flies over the lot and keeps calling for more.",
  },
  {
    id: "moleking", name: "The Mole King", icon: "👑", boss: true, garden: 2,
    hp: 3800, speed: 0.091, eat: 90, coins: 45,
    ability: { kind: "dive", every: 8, dur: 3.2 },
    blurb: "Dives whenever it is losing and comes up somewhere else.",
  },
  {
    id: "titan", name: "The Thistle Titan", icon: "👑", boss: true, garden: 3,
    hp: 4200, armour: 1400, speed: 0.068, eat: 100, coins: 70,
    ability: { kind: "spit", every: 7.5, dmg: 105 },
    split: ["titanling", 2],
    blurb: "Armoured to the eyeballs, and it does not die all at once.",
  },
  {
    id: "titanling", name: "Thistle Shard", icon: "🌵", boss: true, garden: 3,
    hp: 900, speed: 0.119, eat: 70, coins: 10, spawned: true,
    blurb: "Half a Titan, in a hurry.",
  },
];

const PEST_BY_ID = Object.fromEntries(PESTS.map((p) => [p.id, p]));

// Which plant answers which pest. Read by tests/content.test.js to prove no
// level fields a pest before its counter is in the tray, and by the almanac
// screen so a stuck player can look it up rather than guess.
const COUNTERS = {
  snail: ["thumper", "beetroot"],
  weevil: ["thumper", "beetroot"],
  wasp: ["dandelion", "marigold"],
  crow: ["dandelion", "marigold"],
  queenwasp: ["dandelion", "marigold"],
  titan: ["thumper", "beetroot"],
  clump: ["marigold", "beetroot"],
  mole: ["thumper", "peppershot"],
  caterpillar: ["ivynet", "bramble"],
};

if (typeof module !== "undefined") module.exports = { PESTS, PEST_BY_ID, PEST_FLAGS, COUNTERS };
