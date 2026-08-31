// The brigade: every plant you can put in the ground.
//
// One entry per plant, and the engine reads nothing about a plant that isn't
// declared here — `kind` picks which behaviour runs, and everything else is a
// number. Adding a plant is one entry plus (only if it is a genuinely new
// behaviour) one branch in game.js.
//
// COSTS ARE THE DIFFICULTY DIAL. Water income is deliberately tight, so the
// question every level asks is "which two of these can I afford right now",
// not "have I unlocked the good one yet". Nothing here is strictly better than
// anything else: the premium plants answer a specific pest and are wasted
// against the rest, which is what stops one loadout solving the campaign.
//
// `unlock` is the number of levels that must be CLEARED before it appears in
// the seed tray. tests/content.test.js asserts every pest's counter is unlocked
// strictly before the first level that fields that pest — a flyer arriving
// before Dandelion would be an unanswerable level, not a hard one.

const PLANT_KEYS = ["producer", "wall", "melee", "shooter", "air", "lobber", "slow", "bomb"];

const PLANTS = [
  {
    id: "nettle", name: "Nettle", icon: "🌿", kind: "melee",
    cost: 25, cooldown: 5, hp: 70,
    dps: 14, reach: 0.75,
    blurb: "Cheap and prickly. Stings whatever walks into it.",
    tip: "Costs almost nothing — use it to buy a few seconds anywhere.",
    unlock: 0,
  },
  {
    id: "wellspring", name: "Wellspring", icon: "💧", kind: "producer",
    cost: 50, cooldown: 7, hp: 130,
    every: 8, yield: 25,
    blurb: "Draws water up from deep down. Your whole economy.",
    tip: "Plant these first. Every level you win starts with getting these down.",
    unlock: 0,
  },
  {
    id: "bramble", name: "Bramble", icon: "🪵", kind: "wall",
    cost: 50, cooldown: 20, hp: 900,
    blurb: "Doesn't fight. Just refuses to move.",
    tip: "Put it one square in front of a shooter to buy it time.",
    unlock: 0,
  },
  {
    id: "peppershot", name: "Peppershot", icon: "🌶️", kind: "shooter",
    cost: 100, cooldown: 5, hp: 130,
    dmg: 20, every: 1.4, shots: 1,
    blurb: "Spits a hot seed straight down its row.",
    tip: "Your bread and butter. Two in a row beats one of anything else early on.",
    unlock: 0,
  },
  {
    id: "dandelion", name: "Dandelion", icon: "🌼", kind: "air",
    cost: 110, cooldown: 7, hp: 130,
    dmg: 32, every: 1.2, spread: 1,
    blurb: "Puffs seeds on the wind, across its own row and the two either side. Only ever hits things that fly.",
    tip: "Covers THREE rows, so two of them cover the whole patch. Useless against anything walking.",
    unlock: 4,
  },
  {
    id: "thumper", name: "Thumper", icon: "🥁", kind: "shooter",
    cost: 160, cooldown: 12, hp: 170,
    dmg: 58, every: 2.2, range: 3.5, pierce: true, instant: true, both: true,
    blurb: "A heavy, slow root-thump that goes straight through shell — and thumps all round itself, not just ahead.",
    tip: "The only cheap answer to Snails, and the only thing that can hit something that got BEHIND your line. Short reach.",
    unlock: 7,
  },
  {
    id: "ivynet", name: "Ivy Net", icon: "🕸️", kind: "slow",
    cost: 150, cooldown: 20, hp: 150,
    slow: 0.45,
    blurb: "Tangles everything in the row ahead of it.",
    tip: "Doesn't kill anything. Makes everything else in the row twice as good.",
    unlock: 9,
  },
  {
    id: "marigold", name: "Marigold", icon: "🌻", kind: "lobber",
    cost: 200, cooldown: 12, hp: 130,
    dmg: 46, every: 2.6, splash: 1.2, minRange: 1.5,
    blurb: "Lobs a heavy seedhead that bursts over a whole patch.",
    tip: "Catches flyers, and the burst spills into the rows either side. Can't defend its own square — keep it back.",
    unlock: 12,
  },
  {
    id: "twinshot", name: "Twinshot", icon: "🫑", kind: "shooter",
    cost: 250, cooldown: 8, hp: 130,
    dmg: 20, every: 1.4, shots: 2,
    blurb: "Two barrels, twice the pepper.",
    tip: "Exactly two Peppershots in one square. Buy it when you've run out of room.",
    unlock: 14,
  },
  {
    id: "beetroot", name: "Beetroot Bomb", icon: "💥", kind: "bomb",
    cost: 150, cooldown: 30, hp: 999,
    dmg: 340, splash: 1.6, fuse: 0.8, pierce: true,
    blurb: "Goes off once, takes the whole corner with it, and is gone.",
    tip: "Saves a row that's already lost. Goes through shell. You only get one every half-minute.",
    unlock: 17,
  },
];

const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p]));

// What the seed tray offers, in registry order, for a profile that has cleared
// `cleared` levels. Order is fixed so the tray never reshuffles under a player
// who has learned where things are.
function unlockedPlants(cleared) {
  return PLANTS.filter((p) => p.unlock <= cleared).map((p) => p.id);
}

// The tray a player gets if they never touch the picker — the cheapest honest
// loadout that can actually hold a line: economy, a wall, a gun, and whatever
// the newest unlock is so a first-timer meets it without going looking.
function defaultLoadout(cleared, slots) {
  const open = unlockedPlants(cleared);
  const core = ["wellspring", "peppershot", "bramble", "nettle"].filter((id) => open.includes(id));
  const rest = open.filter((id) => !core.includes(id)).reverse();
  return [...core, ...rest].slice(0, slots);
}

if (typeof module !== "undefined") module.exports = { PLANTS, PLANT_BY_ID, PLANT_KEYS, unlockedPlants, defaultLoadout };
