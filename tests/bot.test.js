// Balance. Every assertion here drives the real engine through the real
// `Game.plant()`, so a failure is a statement about the game rather than about
// a model of it.
//
// Print the table behind an ENVIRONMENT VARIABLE, never process.argv:
// `node --test` runs each file in a child process, so the obvious
// `node --test tests/bot.test.js -- --report` silently prints nothing.
//
//   BB_REPORT=1 node --test tests/bot.test.js

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");
const { runCampaign, playLevel, BRAINS } = require("./brain.js");

const S = load();
const { LEVELS, GARDENS, Game, statsFor, slotsFor, suggestLoadout, Endless, starsFor } = S;
const REPORT = !!process.env.BB_REPORT;

// One campaign per brain, computed once and shared — each is ~24 full levels
// of simulation and the assertions below all read the same runs.
const RUNS = {};
for (const brain of ["perfect", "ordinary", "careful", "child", "greedy"]) {
  RUNS[brain] = runCampaign(S, brain);
}

const won = (r) => r.rows.filter((x) => x.r.win);
const stars = (r) => won(r).reduce((a, x) => a + x.r.stars, 0);
const meanTries = (r) => r.rows.reduce((a, x) => a + x.attempts, 0) / r.rows.length;
const meanTime = (r) => won(r).reduce((a, x) => a + x.r.time, 0) / Math.max(1, won(r).length);

if (REPORT) {
  console.log("\n  BRAMBLE BRIGADE — campaign, each brain playing every level once and shopping as it goes\n");
  console.log("  brain      cleared  stars   tries   avg time   purse");
  console.log("  " + "-".repeat(52));
  for (const [name, r] of Object.entries(RUNS)) {
    console.log("  " + name.padEnd(11) + `${r.cleared}/24`.padStart(7) +
      `${stars(r)}/72`.padStart(8) + meanTries(r).toFixed(2).padStart(8) +
      `${meanTime(r).toFixed(0)}s`.padStart(11) + String(r.coins).padStart(8) +
      (r.stuckAt < 0 ? "" : `   stuck at ${r.stuckAt + 1}`));
  }
  console.log("  " + "-".repeat(52) + "\n");
  for (const row of RUNS.ordinary.rows) {
    console.log("  " + String(row.lv.idx + 1).padStart(3) + " " + row.lv.name.padEnd(22) +
      (row.r.win ? `${row.r.stars}*` : "LOSS").padStart(5) +
      ` lost ${String(row.r.lost).padStart(2)}/${row.lv.ace}/${row.lv.par}` +
      ` ${String(Math.round(row.r.time)).padStart(3)}s`);
  }
  console.log("");
}

/* ---------------- the kindness guarantee ---------------- */

test("nobody is ever stuck: an ordinary player clears the whole campaign", () => {
  // THE headline claim. Losing a level is fine; being unable to get past one
  // is not. This is measured at the power a player actually has — each level
  // once, in order, banking what it really paid and spending it on the
  // cheapest thing affordable, because nobody saves 800 coins for a top tier.
  for (const brain of ["ordinary", "careful"]) {
    const r = RUNS[brain];
    assert.strictEqual(r.stuckAt, -1,
      `${brain} got stuck at level ${r.stuckAt + 1} (${r.stuckAt >= 0 ? LEVELS[r.stuckAt].name : ""})`);
    assert.strictEqual(r.cleared, LEVELS.length);
  }
});

test("and does not have to grind: mean attempts stays near one", () => {
  // A level you retry once is a game. One you might retry six times is a
  // grind, and the difference does not show up in a pass rate.
  for (const brain of ["ordinary", "careful"]) {
    const m = meanTries(RUNS[brain]);
    assert.ok(m <= 1.5, `${brain} averaged ${m.toFixed(2)} attempts per level`);
  }
});

test("guardrail: nothing in the campaign is unwinnable by perfect play", () => {
  const r = RUNS.perfect;
  assert.strictEqual(r.stuckAt, -1, `perfect stuck at level ${r.stuckAt + 1}`);
  assert.strictEqual(r.cleared, LEVELS.length);
});

test("the perfect bot is the best bot — no inversion", () => {
  // If the faultless player is losing to the sloppy one, the bot is broken and
  // every difficulty conclusion drawn from the table is backwards. This has
  // caught four separate defects on this build, so it stays.
  assert.ok(stars(RUNS.perfect) >= stars(RUNS.ordinary),
    `perfect scored ${stars(RUNS.perfect)} against ordinary's ${stars(RUNS.ordinary)}`);
  assert.ok(RUNS.perfect.cleared >= RUNS.child.cleared,
    `Rosalie's bot cleared more levels (${RUNS.child.cleared}) than the guardrail (${RUNS.perfect.cleared})`);
});

/* ---------------- the control ---------------- */

test("doing nothing wins nothing, anywhere", () => {
  // The controls here are IMPULSES — you plant or you do not — so an idle bot
  // really is a passive player, and it must never take a level. Garden 1 was
  // winnable by putting the iPad down until the scarecrow stopped clearing a
  // whole lane at once.
  const fails = [];
  for (const lv of LEVELS) {
    S.__reseed(4000 + lv.idx);
    const r = playLevel(S, lv, suggestLoadout(lv, lv.idx, slotsFor({})), statsFor({}), "idle");
    if (r.win) fails.push(`${lv.idx + 1}. ${lv.name}`);
  }
  assert.deepStrictEqual(fails, []);
});

/* ---------------- who the game is for ---------------- */

test("Rosalie conquers the Kitchen Garden", () => {
  // Robert's brief: she should take the first handful of levels and grow into
  // the rest. Her bot is slow to notice (2.2s), rarely works out which plant
  // answers which pest (lore 0.20), and has a child's hands (1.1 actions a
  // second) — but the game TELLS her about flyers outright, in the level intro
  // and again on the seed screen, so that one counter is not gated behind
  // working it out.
  const r = RUNS.child;
  const g1 = r.rows.filter((x) => x.lv.garden === 0);
  assert.strictEqual(g1.length, 6, "she did not even reach the end of Garden 1");
  for (const row of g1) {
    assert.ok(row.r.win, `Rosalie could not clear ${row.lv.idx + 1}. ${row.lv.name}`);
  }
  // ...and she should genuinely have somewhere to grow into.
  assert.ok(r.cleared >= 6, `Rosalie cleared only ${r.cleared}`);
});

test("the campaign gets harder: later gardens cost more ground", () => {
  const byGarden = GARDENS.map((_, gi) =>
    RUNS.ordinary.rows.filter((x) => x.lv.garden === gi && x.r.win));
  const lost = byGarden.map((rows) =>
    rows.reduce((a, x) => a + x.r.lost, 0) / Math.max(1, rows.length));
  assert.ok(lost[3] > lost[0],
    `Garden 4 costs ${lost[3].toFixed(1)} plants a level against Garden 1's ${lost[0].toFixed(1)}`);
});

/* ---------------- the rally is a real trade ---------------- */

test("calling waves in early buys speed and costs safety", () => {
  // A reward the rest of the system charges you more for is not a reward. The
  // first version of the rally advanced the CLOCK, so it handed over 30 water
  // while skipping ~250 water of income — a strictly losing move that the bots
  // exposed at once (24/24 with rallying off, stuck on 23 with it on). It now
  // brings the wave forward and leaves the schedule alone, so the gamble is
  // real in both directions: the greedy bot must finish levels FASTER, and
  // must not simply be better.
  const g = RUNS.greedy, c = RUNS.careful;
  assert.ok(meanTime(g) < meanTime(c) * 0.85,
    `greedy averaged ${meanTime(g).toFixed(0)}s against careful's ${meanTime(c).toFixed(0)}s — the rally is not buying tempo`);
  assert.ok(g.cleared <= c.cleared,
    "rallying every time should not be strictly better than banking it");
});

/* ---------------- the shop ---------------- */

test("the shed keeps selling to the end of the campaign", () => {
  // A big unspent balance at the end means the shop emptied half way through
  // and the currency died with it.
  const r = RUNS.ordinary;
  const spent = Object.entries(r.owned).length;
  assert.ok(spent >= 6, `only ${spent} kinds of upgrade were ever bought`);
  const earned = r.rows.reduce((a, x) => a + (x.r.win ? x.r.coins : 0), 0);
  assert.ok(r.coins < earned * 0.25,
    `finished holding ${r.coins} of ${earned} coins earned — the shed ran out of things to sell`);
});

/* ---------------- levels are the right length ---------------- */

test("no level drags, and none is over before it starts", () => {
  const bad = [];
  for (const row of RUNS.ordinary.rows) {
    if (!row.r.win) continue;
    if (row.r.time > 330) bad.push(`${row.lv.name} took ${Math.round(row.r.time)}s`);
    if (row.r.time < 55) bad.push(`${row.lv.name} was over in ${Math.round(row.r.time)}s`);
  }
  assert.deepStrictEqual(bad, []);
});

test("every level's star bands are reachable by somebody", () => {
  // The bands are generated by tools/calibrate.js from these same bots, so
  // this asserts the generator's output actually lands where it claims.
  const bad = [];
  for (const row of RUNS.perfect.rows) {
    if (!row.r.win) continue;
    const s = starsFor(row.lv, row.r.lost);
    if (s < 2) bad.push(`perfect only managed ${s} stars on ${row.lv.name} (lost ${row.r.lost}, ace ${row.lv.ace})`);
  }
  assert.deepStrictEqual(bad, []);
});

/* ---------------- the endless mode ---------------- */

test("The Long Summer ends, even for a perfect player", () => {
  // The gap between waves decays geometrically with no floor, so being good
  // buys depth rather than immortality. Asserted against the STRONGEST bot,
  // because a mode bounded by mistakes never ends for someone who makes none.
  S.__reseed(7777);
  const lv = Endless.level();
  const r = playLevel(S, lv, suggestLoadout(lv, LEVELS.length, 8), statsFor({
    rainbarrel: 3, deeproots: 3, guttering: 3, compost: 3, sharpening: 3, seedtray: 3,
  }), "perfect", { cap: 60 * 30 * 25 });
  assert.ok(!r.timeout, "a perfect player was still going after 25 minutes");
  assert.ok(r.wave >= 20, `the summer ended at wave ${r.wave} — too soon to be a score`);
  assert.ok(r.wave <= 160, `the summer reached wave ${r.wave} — the squeeze is not biting`);
  assert.ok(r.time <= 20 * 60, `the run took ${Math.round(r.time)}s — too long for one sitting`);
  if (REPORT) console.log(`  Long Summer: perfect play reached wave ${r.wave} in ${Math.round(r.time)}s\n`);
});

test("The Long Summer separates good play from bad", () => {
  const reach = {};
  for (const brain of ["perfect", "ordinary", "child", "idle"]) {
    S.__reseed(7777);
    const lv = Endless.level();
    reach[brain] = playLevel(S, lv, suggestLoadout(lv, LEVELS.length, 6), statsFor({}), brain,
      { cap: 60 * 30 * 25 }).wave;
  }
  if (REPORT) console.log("  Long Summer waves:", JSON.stringify(reach), "\n");
  assert.ok(reach.perfect >= reach.ordinary, `perfect reached ${reach.perfect}, ordinary ${reach.ordinary}`);
  assert.ok(reach.perfect > reach.child, `perfect reached ${reach.perfect}, Rosalie ${reach.child}`);
  // The gap between skilled and unskilled is narrow at the top and enormous
  // at the bottom, and that is honest rather than a tuning failure: on a board
  // this size everyone's defence is complete by wave 40, so what separates
  // good play from great is a handful of waves — while playing at ALL is worth
  // eight times doing nothing.
  assert.ok(reach.child > reach.idle * 4, `Rosalie reached ${reach.child}, doing nothing ${reach.idle}`);
  assert.ok(reach.idle <= 12, `doing nothing survived to wave ${reach.idle}`);
});
