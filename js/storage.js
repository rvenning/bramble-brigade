// Persistence: gamekit storage configured for Bramble Brigade.
// bram_* localStorage keys, "bramblebrigade" Firestore collection.
//
// The prefix has to be unique across EVERY family game, not merely
// descriptive: they all serve from https://rvenning.github.io, and
// localStorage is scoped to the origin rather than the path, so a collision
// means two games silently sharing one profile roster and one set of saves.
// gamekit/tests/prefixes.test.js fails if that ever happens again.
//
// COINS ARE SPENDABLE, so there is no `coins` field to merge. A balance
// merged with max() would resurrect every coin the player had spent the
// moment a stale device synced. Two monotonic counters instead —
// `coinsEarned` and `coinsSpent`, each safe under max() — and the balance is
// derived. tests/storage.test.js asserts that in both argument orders.

// Named rather than inlined, because createStorage keeps these in a closure
// and the merge is the one function that can permanently destroy a save.
const PROGRESS = {
  blank: () => ({
    levels: {},            // { [idx]: { stars, lost } } best result per level
    coinsEarned: 0,
    coinsSpent: 0,
    owned: {},             // { [upgradeId]: tiers bought }
    loadout: null,         // last seed tray the player chose
    endlessBest: 0,        // furthest wave survived in The Long Summer
    seenHelp: false,
    updated: 0,
  }),

  merge: (a, b) => {
    const levels = { ...(a.levels || {}) };
    for (const [idx, lv] of Object.entries(b.levels || {})) {
      const cur = levels[idx];
      levels[idx] = !cur ? lv : {
        stars: Math.max(cur.stars || 0, lv.stars || 0),
        lost: Math.min(cur.lost != null ? cur.lost : 999, lv.lost != null ? lv.lost : 999),
      };
    }
    // Upgrades are a ratchet: you can only ever have bought more tiers.
    const owned = { ...(a.owned || {}) };
    for (const [id, n] of Object.entries(b.owned || {})) owned[id] = Math.max(owned[id] || 0, n || 0);

    return {
      ...a, ...b,          // spread first so a field a newer build added survives an older client
      levels, owned,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent: Math.max(a.coinsSpent || 0, b.coinsSpent || 0),
      endlessBest: Math.max(a.endlessBest || 0, b.endlessBest || 0),
      seenHelp: !!(a.seenHelp || b.seenHelp),
      // The seed tray is a preference, not an achievement: the newer write wins.
      loadout: b.loadout || a.loadout,
    };
  },
};

const Storage = GK.createStorage({
  prefix: "bram",
  collection: "bramblebrigade",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

Object.assign(Storage, {
  coins(prog) { return Math.max(0, (prog.coinsEarned || 0) - (prog.coinsSpent || 0)); },

  totalStars(prog) {
    return Object.values(prog.levels || {}).reduce((s, l) => s + (l.stars || 0), 0);
  },

  cleared(prog) { return Object.keys(prog.levels || {}).length; },

  // The tray, filtered to what is actually unlocked and topped up to `slots`,
  // so a save from a later build can never deploy a locked plant or a short tray.
  loadout(prog, slots) {
    const open = unlockedPlants(this.cleared(prog));
    const out = (prog.loadout || []).filter((id) => open.includes(id));
    for (const id of defaultLoadout(this.cleared(prog), slots)) {
      if (out.length >= slots) break;
      if (!out.includes(id)) out.push(id);
    }
    return out.slice(0, slots);
  },

  saveLoadout(profileId, loadout) {
    const prog = this.getProgress(profileId);
    prog.loadout = loadout.slice();
    this.saveProgress(profileId, prog);
    return prog;
  },

  buy(profileId, upgradeId) {
    const prog = this.getProgress(profileId);
    const tier = nextTier(prog.owned, upgradeId);
    if (!tier || this.coins(prog) < tier.cost) return null;
    prog.owned = { ...(prog.owned || {}) };
    prog.owned[upgradeId] = (prog.owned[upgradeId] || 0) + 1;
    prog.coinsSpent = (prog.coinsSpent || 0) + tier.cost;
    this.saveProgress(profileId, prog);
    return prog;
  },

  recordResult(profileId, result) {
    const prog = this.getProgress(profileId);
    if (result.coins > 0) prog.coinsEarned = (prog.coinsEarned || 0) + result.coins;
    if (result.win) {
      const cur = prog.levels[result.levelIdx];
      prog.levels[result.levelIdx] = {
        stars: Math.max(result.stars, (cur && cur.stars) || 0),
        lost: Math.min(result.lost, (cur && cur.lost) != null ? cur.lost : 999),
      };
    }
    this.saveProgress(profileId, prog);
    return prog;
  },

  recordEndless(profileId, wave, coins) {
    const prog = this.getProgress(profileId);
    prog.endlessBest = Math.max(prog.endlessBest || 0, wave);
    if (coins > 0) prog.coinsEarned = (prog.coinsEarned || 0) + coins;
    this.saveProgress(profileId, prog);
    return prog;
  },
});
