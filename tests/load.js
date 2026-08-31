// One loader shared by every suite. Concatenation order must match
// index.html's, or a file that reads another's top-level `const` crashes.
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

function load() {
  return loadScripts({
    baseDir: ROOT,
    files: [
      "tests/seed.js",
      "lib/gk-util.js",
      "js/plants.js",
      "js/pests.js",
      "js/levels.js",
      "js/upgrades.js",
      "js/endless.js",
      "js/game.js",
    ],
    exports: [
      "PLANTS", "PLANT_BY_ID", "PLANT_KEYS", "unlockedPlants", "defaultLoadout",
      "PESTS", "PEST_BY_ID", "PEST_FLAGS", "COUNTERS",
      "LEVELS", "GARDENS", "ROWS", "COLS", "unlockedLevel", "starsFor", "suggestLoadout",
      "UPGRADES", "UPGRADE_BY_ID", "STAT_KEYS", "BASE_STATS", "BASE_SLOTS",
      "statsFor", "slotsFor", "nextTier",
      "Endless", "ENDLESS_POOL",
      "Game", "TICK", "SOUR_SECS", "DROP_VALUE", "RALLY_RATE", "RALLY_MAX",
      "__reseed", "__rand",
    ],
    browser: true,
    globals: {
      GK: { UI: { toast() {}, showScreen() {}, openModal() {}, closeModal() {} } },
      App: { paintTray() {}, paintHud() {}, onEnd() {} },
      performance: { now: () => 0 },
      requestAnimationFrame() {},
    },
  });
}

module.exports = { load, ROOT };
