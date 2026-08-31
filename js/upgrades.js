// The Potting Shed: permanent upgrades bought with coins between levels.
//
// Every upgrade writes ONE key into a stats object the engine reads by name
// (`stats.water0`, `stats.damage`, …). The vocabulary is closed, and
// tests/content.test.js asserts both directions against game.js's own source:
// no upgrade may name a stat the engine never reads, and no stat may sit in
// the list with nothing implementing it. A shop item that silently does
// nothing has no symptom at all — it just quietly costs the player 300 coins.
//
// Tiered rather than one-shot so the shop always has something affordable:
// the progression bot buys the cheapest thing it can afford after every level,
// which is what a person actually does, and tests/bot.test.js balances the
// campaign against exactly that shopper.

const STAT_KEYS = ["water0", "trickle", "wellspring", "hp", "damage", "cooldown", "slots", "scarecrow"];

const UPGRADES = [
  {
    id: "rainbarrel", name: "Rain Barrel", icon: "🛢️", stat: "water0",
    desc: "Start every level with more water in hand.",
    tiers: [{ cost: 60, val: 50 }, { cost: 150, val: 100 }, { cost: 320, val: 175 }],
    unit: (v) => `+${v} starting water`,
  },
  {
    id: "deeproots", name: "Deep Roots", icon: "🌱", stat: "wellspring",
    desc: "Wellsprings draw up more each time.",
    tiers: [{ cost: 90, val: 5 }, { cost: 220, val: 11 }, { cost: 460, val: 18 }],
    unit: (v) => `+${v} water per draw`,
  },
  {
    id: "guttering", name: "Guttering", icon: "🌧️", stat: "trickle",
    desc: "Catch more of what falls from the sky. Does nothing after dark.",
    tiers: [{ cost: 80, val: 0.25 }, { cost: 200, val: 0.55 }, { cost: 420, val: 0.9 }],
    unit: (v) => `+${Math.round(v * 100)}% sky water`,
  },
  {
    id: "compost", name: "Good Compost", icon: "🪱", stat: "hp",
    desc: "Every plant you put down is tougher.",
    tiers: [{ cost: 100, val: 0.2 }, { cost: 260, val: 0.45 }, { cost: 540, val: 0.75 }],
    unit: (v) => `+${Math.round(v * 100)}% plant health`,
  },
  {
    id: "sharpening", name: "Sharp Seeds", icon: "🔪", stat: "damage",
    desc: "Everything that shoots, shoots harder.",
    tiers: [{ cost: 130, val: 0.15 }, { cost: 320, val: 0.32 }, { cost: 660, val: 0.5 }],
    unit: (v) => `+${Math.round(v * 100)}% plant damage`,
  },
  {
    id: "seedtray", name: "Warm Seed Tray", icon: "♨️", stat: "cooldown",
    desc: "Plants come back off cooldown sooner.",
    tiers: [{ cost: 110, val: 0.12 }, { cost: 280, val: 0.26 }, { cost: 580, val: 0.4 }],
    unit: (v) => `−${Math.round(v * 100)}% cooldown`,
  },
  {
    id: "biggertray", name: "Bigger Tray", icon: "🧺", stat: "slots",
    desc: "Take more kinds of plant into a level with you.",
    tiers: [{ cost: 150, val: 1 }, { cost: 400, val: 2 }, { cost: 800, val: 3 }],
    unit: (v) => `+${v} seed slot${v > 1 ? "s" : ""}`,
  },
  {
    id: "scarecrow", name: "Spare Scarecrow", icon: "🧑‍🌾", stat: "scarecrow",
    desc: "A second scarecrow in every row, for when a row is already lost.",
    tiers: [{ cost: 350, val: 1 }],
    unit: (v) => `+${v} scarecrow per row`,
  },
];

const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// The base loadout everyone starts with, before a single coin is spent.
const BASE_STATS = {
  water0: 0, trickle: 0, wellspring: 0, hp: 0,
  damage: 0, cooldown: 0, slots: 0, scarecrow: 0,
};

const BASE_SLOTS = 5;      // seed kinds you may take in before Bigger Tray

// Fold an owned map ({ [upgradeId]: tiersBought }) down into the flat stats
// object the engine reads. Tiers are absolute, not cumulative — buying tier 3
// replaces tier 2's value rather than adding to it.
function statsFor(owned) {
  const s = { ...BASE_STATS };
  for (const [id, n] of Object.entries(owned || {})) {
    const up = UPGRADE_BY_ID[id];
    if (!up || !n) continue;
    const tier = up.tiers[Math.min(n, up.tiers.length) - 1];
    if (tier) s[up.stat] = tier.val;
  }
  return s;
}

function slotsFor(owned) {
  const stats = statsFor(owned);
  return BASE_SLOTS + stats.slots;
}

// What the shop should offer next for each upgrade: the next unbought tier,
// or null once it is maxed.
function nextTier(owned, id) {
  const up = UPGRADE_BY_ID[id];
  const n = (owned || {})[id] || 0;
  return n >= up.tiers.length ? null : { ...up.tiers[n], index: n + 1 };
}

if (typeof module !== "undefined") {
  module.exports = { UPGRADES, UPGRADE_BY_ID, STAT_KEYS, BASE_STATS, BASE_SLOTS, statsFor, slotsFor, nextTier };
}
