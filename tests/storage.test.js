// The cross-device merge. This is the one function in the game that can
// permanently destroy a save, so it is defined as a named object in
// storage.js rather than inlined into createStorage (which would keep it in a
// closure where no test could reach it).
//
// Every assertion runs in BOTH argument orders, because which device syncs
// first is a coin toss and an order-dependent merge is a bug that only shows
// up on somebody else's iPad.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

const S = loadScripts({
  baseDir: ROOT,
  files: [
    "lib/gk-util.js", "lib/gk-storage.js",
    "js/plants.js", "js/pests.js", "js/levels.js", "js/upgrades.js",
    "js/endless.js", "js/game.js", "js/storage.js",
  ],
  exports: ["PROGRESS", "Storage", "statsFor", "slotsFor", "nextTier"],
  browser: true,
  globals: { FIREBASE_CONFIG: null },
});

const { PROGRESS } = S;

// Assert a property of the merge in both directions at once.
function bothWays(a, b, check) {
  check(PROGRESS.merge(a, b), "a,b");
  check(PROGRESS.merge(b, a), "b,a");
}

test("a blank progress has everything the game reads", () => {
  const p = PROGRESS.blank();
  for (const k of ["levels", "coinsEarned", "coinsSpent", "owned", "endlessBest", "updated"]) {
    assert.ok(k in p, `blank progress is missing ${k}`);
  }
});

test("spent coins never come back from the dead", () => {
  // THE reason there is no `coins` field. A balance merged with max() would
  // resurrect every coin the player had already spent the moment a stale
  // device synced — so two monotonic counters are stored and the balance is
  // derived from them.
  const rich = { ...PROGRESS.blank(), coinsEarned: 500, coinsSpent: 0 };   // stale device
  const spent = { ...PROGRESS.blank(), coinsEarned: 500, coinsSpent: 450 }; // up to date
  bothWays(rich, spent, (m, dir) => {
    assert.strictEqual(m.coinsEarned, 500, dir);
    assert.strictEqual(m.coinsSpent, 450, dir);
    assert.strictEqual(S.Storage.coins(m), 50, `balance wrong merging ${dir}`);
  });
});

test("both coin counters only ever go up", () => {
  const a = { ...PROGRESS.blank(), coinsEarned: 120, coinsSpent: 90 };
  const b = { ...PROGRESS.blank(), coinsEarned: 300, coinsSpent: 60 };
  bothWays(a, b, (m, dir) => {
    assert.strictEqual(m.coinsEarned, 300, dir);
    assert.strictEqual(m.coinsSpent, 90, dir);
  });
});

test("a level keeps its best stars and its fewest losses", () => {
  // These two move in OPPOSITE directions — more stars is better, fewer
  // plants lost is better — so a blanket max() would be wrong for one of them.
  const a = { ...PROGRESS.blank(), levels: { 3: { stars: 3, lost: 9 }, 5: { stars: 1, lost: 2 } } };
  const b = { ...PROGRESS.blank(), levels: { 3: { stars: 1, lost: 1 }, 7: { stars: 2, lost: 4 } } };
  bothWays(a, b, (m, dir) => {
    assert.strictEqual(m.levels[3].stars, 3, `stars merging ${dir}`);
    assert.strictEqual(m.levels[3].lost, 1, `lost merging ${dir}`);
    assert.strictEqual(m.levels[5].stars, 1, dir);
    assert.strictEqual(m.levels[7].stars, 2, dir);
  });
});

test("upgrades are a ratchet", () => {
  const a = { ...PROGRESS.blank(), owned: { rainbarrel: 2, compost: 1 } };
  const b = { ...PROGRESS.blank(), owned: { rainbarrel: 1, biggertray: 3 } };
  bothWays(a, b, (m, dir) => {
    assert.strictEqual(m.owned.rainbarrel, 2, dir);
    assert.strictEqual(m.owned.compost, 1, dir);
    assert.strictEqual(m.owned.biggertray, 3, dir);
  });
});

test("the best Long Summer survives, and the newest seed tray wins", () => {
  const a = { ...PROGRESS.blank(), endlessBest: 41, loadout: ["wellspring", "peppershot"] };
  const b = { ...PROGRESS.blank(), endlessBest: 12, loadout: ["marigold", "thumper"] };
  assert.strictEqual(PROGRESS.merge(a, b).endlessBest, 41);
  assert.strictEqual(PROGRESS.merge(b, a).endlessBest, 41);
  // The tray is a preference rather than an achievement, so the newer write
  // wins outright — merging it by "best" would mean a device could never
  // change its mind.
  assert.deepStrictEqual([...PROGRESS.merge(a, b).loadout], ["marigold", "thumper"]);
  assert.deepStrictEqual([...PROGRESS.merge(b, a).loadout], ["wellspring", "peppershot"]);
});

test("a field a newer build added survives an older client's merge", () => {
  // The spread order in the merge is what protects this: an old device that
  // knows nothing about a new field must not delete it.
  const oldDevice = PROGRESS.blank();
  const newDevice = { ...PROGRESS.blank(), somethingNew: 7 };
  assert.strictEqual(PROGRESS.merge(oldDevice, newDevice).somethingNew, 7);
});

test("merging a save with itself changes nothing", () => {
  const p = {
    ...PROGRESS.blank(),
    levels: { 0: { stars: 3, lost: 0 }, 1: { stars: 2, lost: 4 } },
    coinsEarned: 210, coinsSpent: 150, owned: { rainbarrel: 2 }, endlessBest: 30,
  };
  const m = PROGRESS.merge(p, p);
  assert.deepStrictEqual([...Object.keys(m.levels)], ["0", "1"]);
  assert.strictEqual(S.Storage.coins(m), 60);
  assert.strictEqual(m.endlessBest, 30);
});

test("the seed tray never hands back a locked plant or a short tray", () => {
  // A save written by a later build, or by a profile that has since been
  // reset, must not be able to deploy something the player has not unlocked.
  const prog = { ...PROGRESS.blank(), loadout: ["beetroot", "marigold", "wellspring"], levels: {} };
  const tray = S.Storage.loadout(prog, 5);
  // A brand-new gardener has cleared nothing, so only four plants exist at
  // all — the tray is filled as far as it can be, not padded to the slot count.
  assert.strictEqual(tray.length, 4, "tray was not topped up to everything unlocked");
  assert.ok(!tray.includes("beetroot"), "a locked plant survived into the tray");
  assert.ok(!tray.includes("marigold"), "a locked plant survived into the tray");
  assert.ok(tray.includes("wellspring"));
  assert.strictEqual(new Set(tray).size, tray.length, "the tray contains a duplicate");
});
