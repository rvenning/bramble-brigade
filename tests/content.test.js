// Content linter. Everything here is a property of the DATA, checkable
// without playing: it runs in milliseconds and catches the class of fault
// that has no symptom in play — an unanswerable level, a shop item wired to
// nothing, a star band that cannot be earned.
//
// Failures are collected into arrays and asserted with deepEqual, so one run
// names every offender rather than stopping at the first.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { load, ROOT } = require("./load.js");

const S = load();
const { PLANTS, PLANT_BY_ID, PLANT_KEYS, PESTS, PEST_BY_ID, COUNTERS,
        LEVELS, GARDENS, ROWS, COLS, starsFor, UPGRADES, STAT_KEYS,
        statsFor, slotsFor, BASE_SLOTS, Endless } = S;

const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
// A source lint has to strip comments first or it fails on its own subject —
// game.js's own header promises "no Math.random", which is the very phrase.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ENGINE = ["js/game.js", "js/levels.js", "js/endless.js", "js/plants.js", "js/pests.js", "js/upgrades.js"];

/* ---------------- structure ---------------- */

test("every level is well formed and its waves are in order", () => {
  const bad = [];
  LEVELS.forEach((lv, i) => {
    if (lv.idx !== i) bad.push(`${lv.name}: idx ${lv.idx} != position ${i}`);
    if (!lv.waves.length) bad.push(`${lv.name}: no waves`);
    if (!(lv.water > 0)) bad.push(`${lv.name}: no starting water`);
    if (lv.trickle == null) bad.push(`${lv.name}: no trickle set`);
    let last = -1;
    lv.waves.forEach((w, wi) => {
      if (w.at <= last) bad.push(`${lv.name}: wave ${wi} at ${w.at} is not after ${last}`);
      last = w.at;
      if (!w.spawn.length) bad.push(`${lv.name}: wave ${wi} is empty`);
      for (const [id, lane] of w.spawn) {
        if (!PEST_BY_ID[id]) bad.push(`${lv.name}: unknown pest ${id}`);
        if (!(lane >= 0 && lane < ROWS)) bad.push(`${lv.name}: lane ${lane} out of range`);
        if (PEST_BY_ID[id] && PEST_BY_ID[id].spawned) {
          bad.push(`${lv.name}: ${id} is spawned by something else and must not be authored directly`);
        }
      }
    });
    for (const [c, r] of lv.stone || []) {
      if (!(c >= 0 && c < COLS && r >= 0 && r < ROWS)) bad.push(`${lv.name}: stone ${c},${r} off the board`);
    }
  });
  assert.deepStrictEqual(bad, []);
});

test("four gardens of six, with the boss last in each", () => {
  const bad = [];
  GARDENS.forEach((g, gi) => {
    const ls = LEVELS.filter((l) => l.garden === gi);
    if (ls.length !== 6) bad.push(`${g.name}: ${ls.length} levels, expected 6`);
    const bosses = ls.filter((l) => l.boss);
    if (bosses.length !== 1) bad.push(`${g.name}: ${bosses.length} boss levels`);
    if (bosses[0] && bosses[0].idx !== ls[ls.length - 1].idx) bad.push(`${g.name}: the boss is not last`);
  });
  assert.deepStrictEqual(bad, []);
  assert.strictEqual(LEVELS.length, 24);
});

test("each garden's rule is actually applied to its levels", () => {
  const bad = [];
  for (const lv of LEVELS) {
    if (lv.garden === 1 && lv.trickle !== 0) bad.push(`${lv.name}: the Orchard is at dusk, trickle must be 0`);
    if (lv.garden === 2 && !(lv.stone || []).length) bad.push(`${lv.name}: the Rockery needs stone`);
    if (lv.garden === 3 && !lv.sour) bad.push(`${lv.name}: the Compost Heap must be sour`);
    // ...and the rule must not leak into gardens that have not taught it yet.
    if (lv.garden < 2 && (lv.stone || []).length) bad.push(`${lv.name}: stone before the Rockery`);
    if (lv.garden < 3 && lv.sour) bad.push(`${lv.name}: sour ground before the Compost Heap`);
  }
  assert.deepStrictEqual(bad, []);
});

/* ---------------- the fairness invariant ---------------- */

test("no level fields a pest before its counter is unlocked", () => {
  // The claim that matters: a flyer arriving before Dandelion is not a hard
  // level, it is an unanswerable one. Unlock N means "available once N levels
  // are cleared", so on level index i the player has cleared i of them.
  const bad = [];
  for (const lv of LEVELS) {
    const ids = new Set();
    for (const w of lv.waves) for (const [id] of w.spawn) {
      ids.add(id);
      // A splitter's children arrive in the same level, so they count too.
      const sp = PEST_BY_ID[id].split;
      if (sp) ids.add(sp[0]);
    }
    for (const id of ids) {
      const need = COUNTERS[id];
      if (!need) continue;
      const open = need.filter((c) => PLANT_BY_ID[c].unlock <= lv.idx);
      if (!open.length) {
        bad.push(`level ${lv.idx + 1} (${lv.name}): ${id} has no unlocked counter (needs one of ${need})`);
      }
      // A flyer is the strict case: the counter must be unlocked STRICTLY
      // before, so the level that introduces it is not also the level that
      // hands you the answer for the first time.
      if (PEST_BY_ID[id].air && !need.some((c) => PLANT_BY_ID[c].unlock <= lv.idx)) {
        bad.push(`level ${lv.idx + 1}: flyer ${id} arrives with nothing that can reach it`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("every counter names a real plant, and every listed pest exists", () => {
  const bad = [];
  for (const [pid, list] of Object.entries(COUNTERS)) {
    if (!PEST_BY_ID[pid]) bad.push(`COUNTERS names unknown pest ${pid}`);
    for (const c of list) if (!PLANT_BY_ID[c]) bad.push(`COUNTERS[${pid}] names unknown plant ${c}`);
  }
  assert.deepStrictEqual(bad, []);
});

test("every plant unlocks inside the campaign and every pest is used", () => {
  const bad = [];
  for (const p of PLANTS) {
    if (p.unlock >= LEVELS.length) bad.push(`${p.name} unlocks at ${p.unlock}, past the end of the campaign`);
    if (!PLANT_KEYS.includes(p.kind)) bad.push(`${p.name}: unknown kind ${p.kind}`);
    if (!(p.cost > 0)) bad.push(`${p.name}: no cost`);
  }
  const used = new Set();
  for (const lv of LEVELS) for (const w of lv.waves) for (const [id] of w.spawn) {
    used.add(id);
    const sp = PEST_BY_ID[id].split; if (sp) used.add(sp[0]);
  }
  for (const p of PESTS) if (!used.has(p.id)) bad.push(`${p.name} never appears in any level`);
  assert.deepStrictEqual(bad, []);
});

test("there is always a plantable square, even on the stoniest board", () => {
  // The Rockery could in principle be authored into a level with nowhere to
  // build. Stone is fixed, so this is a pure data property.
  const bad = [];
  for (const lv of LEVELS) {
    const free = ROWS * COLS - (lv.stone || []).length;
    if (free < ROWS * COLS * 0.6) bad.push(`${lv.name}: only ${free} of ${ROWS * COLS} squares are open`);
    // Every lane needs somewhere to put a defender, or that lane is a gift.
    for (let r = 0; r < ROWS; r++) {
      const blocked = (lv.stone || []).filter(([, rr]) => rr === r).length;
      if (blocked >= COLS - 3) bad.push(`${lv.name}: lane ${r} has ${COLS - blocked} open squares`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

/* ---------------- grades ---------------- */

test("star bands are earnable and never inverted", () => {
  // A generated band can come out ace >= par at the easy end, which silently
  // deletes the middle grade. Assert on the finished table, not the formula.
  const bad = [];
  for (const lv of LEVELS) {
    if (!(lv.ace < lv.par)) bad.push(`${lv.name}: ace ${lv.ace} is not below par ${lv.par}`);
    if (starsFor(lv, lv.ace) !== 3) bad.push(`${lv.name}: ace does not award 3`);
    if (starsFor(lv, lv.par) !== 2) bad.push(`${lv.name}: par does not award 2`);
    if (starsFor(lv, lv.par + 1) !== 1) bad.push(`${lv.name}: over par does not award 1`);
  }
  assert.deepStrictEqual(bad, []);
});

test("pressure rises across the campaign, garden by garden", () => {
  // NOT "every level is heavier than the last" — that assertion was wrong and
  // this test caught it. A level that introduces a new pest or a new garden
  // rule deliberately eases off on tonnage, because its difficulty is the
  // thing you have to learn, not the weight: Wings drops 42% against the level
  // before it precisely so that meeting a flyer for the first time is not also
  // the heaviest wave you have seen. Six levels do this on purpose.
  //
  // What must be true is the shape one level up: each garden out-weighs the
  // last, the boss is the peak of its own garden, and nothing sags backwards
  // across a garden boundary.
  const weight = (lv) => {
    let hp = 0;
    for (const w of lv.waves) for (const [id] of w.spawn) {
      const p = PEST_BY_ID[id];
      hp += p.hp + (p.armour || 0);
    }
    return hp;
  };
  const bad = [];
  const peaks = [], means = [];
  GARDENS.forEach((g, gi) => {
    const ws = LEVELS.filter((l) => l.garden === gi).map(weight);
    const boss = weight(LEVELS.filter((l) => l.garden === gi).find((l) => l.boss));
    peaks.push(Math.max(...ws));
    means.push(ws.reduce((a, b) => a + b, 0) / ws.length);
    if (boss !== Math.max(...ws)) bad.push(`${g.name}: the boss level is not the heaviest in its garden`);
  });
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i] <= peaks[i - 1]) bad.push(`${GARDENS[i].name}: peak ${peaks[i]} does not exceed ${peaks[i - 1]}`);
    if (means[i] <= means[i - 1]) bad.push(`${GARDENS[i].name}: mean ${Math.round(means[i])} does not exceed ${Math.round(means[i - 1])}`);
  }
  assert.deepStrictEqual(bad, []);

  const all = LEVELS.map(weight);
  assert.ok(all[all.length - 1] > all[0] * 6, "the last level should be far heavier than the first");
});

/* ---------------- upgrades ---------------- */

test("every upgrade names a stat the engine actually reads", () => {
  // Both directions. An upgrade naming a stat nothing reads costs the player
  // coins and does nothing, and a stat in the list with no implementation is
  // just as dead — neither has any symptom in play.
  const engineSrc = ENGINE.map(src).join("\n") + src("js/main.js");
  const bad = [];
  for (const u of UPGRADES) {
    if (!STAT_KEYS.includes(u.stat)) bad.push(`${u.name}: stat "${u.stat}" is not in STAT_KEYS`);
    if (!u.tiers.length) bad.push(`${u.name}: no tiers`);
    let lastCost = 0, lastVal = 0;
    for (const t of u.tiers) {
      if (t.cost <= lastCost) bad.push(`${u.name}: tier costs must rise (${t.cost} after ${lastCost})`);
      if (t.val <= lastVal) bad.push(`${u.name}: tier values must rise (${t.val} after ${lastVal})`);
      lastCost = t.cost; lastVal = t.val;
    }
  }
  for (const k of STAT_KEYS) {
    if (!engineSrc.includes(`stats.${k}`)) bad.push(`stat "${k}" is never read by the engine`);
    if (!UPGRADES.some((u) => u.stat === k)) bad.push(`stat "${k}" has no upgrade selling it`);
  }
  assert.deepStrictEqual(bad, []);
});

test("statsFor folds tiers absolutely, not cumulatively", () => {
  const one = statsFor({ rainbarrel: 1 });
  const three = statsFor({ rainbarrel: 3 });
  assert.strictEqual(one.water0, 50);
  assert.strictEqual(three.water0, 175);          // the tier value, not 50+100+175
  assert.strictEqual(slotsFor({}), BASE_SLOTS);
  assert.strictEqual(slotsFor({ biggertray: 2 }), BASE_SLOTS + 2);
  // A tier count past the end must clamp rather than read undefined.
  assert.strictEqual(statsFor({ rainbarrel: 9 }).water0, 175);
});

/* ---------------- determinism ---------------- */

test("the engine contains no randomness at all", () => {
  const bad = [];
  for (const f of ENGINE) {
    const s = stripComments(src(f));
    if (/Math\.random\s*\(/.test(s)) bad.push(`${f} calls Math.random`);
    if (/Date\.now\s*\(/.test(s)) bad.push(`${f} reads the clock`);
  }
  assert.deepStrictEqual(bad, []);
});

test("game.js touches neither the DOM nor the canvas", () => {
  // This is what lets the bots run the real engine headless. It is also the
  // property most easily lost to one convenient line.
  const s = stripComments(src("js/game.js"));
  const bad = [];
  for (const forbidden of ["document.", "window.", "getElementById", "getContext", "requestAnimationFrame"]) {
    if (s.includes(forbidden)) bad.push(`game.js references ${forbidden}`);
  }
  assert.deepStrictEqual(bad, []);
});

/* ---------------- engine robustness ---------------- */

test("time never runs backwards, however bad the frame clock is", () => {
  // A negative dt is not hypothetical — a timestamp can go backwards when the
  // clock source changes under the loop — and `Math.min(0.05, dt)` clamps only
  // the top end. Unguarded, the whole simulation reverses: pests walk back up
  // the garden and seed-packet cooldowns count UP, so nothing can ever be
  // planted again. It shipped past every engine-level check and only showed up
  // in a screenshot, as pests that were not drawn.
  const { Game, LEVELS, statsFor, suggestLoadout } = S;
  Game.start(LEVELS[0], suggestLoadout(LEVELS[0], 0, 5), statsFor({}));
  Game.update(1 / 60);
  Game.update(20);                       // wind on until pests are walking
  const before = Game.pests.map((p) => p.x);
  const t0 = Game.t;

  for (const bad of [-1, -0.016, 0, NaN, undefined]) Game.update(bad);

  assert.strictEqual(Game.t, t0, "the clock moved on a bad dt");
  assert.deepStrictEqual(Game.pests.map((p) => p.x), before, "a pest moved on a bad dt");

  // And a huge dt must be clamped rather than teleporting anything.
  Game.update(60);
  const moved = Math.max(...Game.pests.map((p, i) => Math.abs(before[i] - p.x)));
  assert.ok(moved < 0.05, `a 60-second frame moved a pest ${moved.toFixed(3)} columns`);
});

/* ---------------- the endless mode ---------------- */

test("The Long Summer closes in without ever levelling off", () => {
  // Two properties, and they pull against each other. The gap must keep
  // shrinking for ever (a floor lets a good adult play until they get bored,
  // which is not a score) — but the total time must still DIVERGE, or every
  // wave that will ever exist arrives inside a few minutes. A geometric decay
  // satisfies the first and fails the second: it summed to 489 seconds, and a
  // perfect player duly "reached wave 1777". Harmonic decay does both.
  assert.ok(Endless.gapAfter(0) > 20, "the first waves should be leisurely");
  assert.ok(Endless.gapAfter(60) < 6, `wave 60 gap is ${Endless.gapAfter(60).toFixed(1)}s`);
  assert.ok(Endless.gapAfter(300) < 1.5, "the gap must keep shrinking, not level off");
  assert.ok(Endless.gapAfter(3000) > 0, "the gap must stay positive");

  const bad = [];
  for (let n = 1; n < 400; n++) {
    if (Endless.gapAfter(n) >= Endless.gapAfter(n - 1)) bad.push(`gap did not shrink at ${n}`);
    if (Endless.timeOf(n) <= Endless.timeOf(n - 1)) bad.push(`wave ${n} does not arrive after ${n - 1}`);
  }
  assert.deepStrictEqual(bad, []);

  // Divergence, stated as the thing that actually matters: reaching a high
  // wave has to take real time rather than arriving all at once, and the
  // total must keep growing without limit. A harmonic gap sums like a
  // logarithm, so ten times the waves is a bit under twice the clock — slow,
  // but genuinely unbounded, which a geometric gap is not.
  assert.ok(Endless.timeOf(200) > 600,
    `wave 200 arrives at ${Math.round(Endless.timeOf(200))}s — the schedule collapses`);
  assert.ok(Endless.timeOf(4000) > Endless.timeOf(400) * 1.3,
    "the total elapsed time stops growing — the schedule has an upper bound");
});

test("every endless wave is non-empty and made of real pests", () => {
  const bad = [];
  let lastWeight = 0;
  for (let n = 0; n < 60; n++) {
    const w = Endless.wave(n);
    if (!w.spawn.length) bad.push(`endless wave ${n} is empty`);
    for (const [id, lane] of w.spawn) {
      if (!PEST_BY_ID[id]) bad.push(`endless wave ${n}: unknown pest ${id}`);
      if (!(lane >= 0 && lane < ROWS)) bad.push(`endless wave ${n}: bad lane ${lane}`);
    }
    const weight = w.spawn.reduce((s, [id]) => s + PEST_BY_ID[id].hp + (PEST_BY_ID[id].armour || 0), 0);
    if (n > 12 && weight < lastWeight * 0.5) bad.push(`endless wave ${n} collapsed in weight`);
    lastWeight = Math.max(lastWeight, weight);
  }
  assert.deepStrictEqual(bad, []);
  // Generation must be a pure function of the wave number, or no two players
  // face the same summer and the leaderboard means nothing.
  assert.deepStrictEqual(Endless.wave(21), Endless.wave(21));
});
