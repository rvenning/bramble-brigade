// Set every level's star bands from what the bots actually score.
//
//   node tools/calibrate.js            print the proposed table
//   node tools/calibrate.js --write    write it into js/levels.js
//
// Star targets picked by eye are how a campaign ends up with a wall in it —
// the hand-authored `ace: 1, par: 4` values this replaced were unreachable
// almost everywhere, because they were guesses made before a single level had
// been played. `lost` is plants eaten plus three per scarecrow spent, so it is
// "how much ground did this cost you", and lower is better.
//
// The demanded fraction TIGHTENS across the campaign: garden 1 gives you the
// guardrail's own result plus a wide margin, garden 4 barely any. That is what
// makes three stars mean more later without making the level itself harder.

const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../tests/load.js");
const { runCampaign } = require("../tests/brain.js");

const S = load();
const { LEVELS } = S;
const ROOT = path.join(__dirname, "..");

const runs = {};
for (const brain of ["perfect", "careful", "ordinary"]) {
  runs[brain] = {};
  const res = runCampaign(S, brain);
  for (const row of res.rows) if (row.r.win) runs[brain][row.lv.idx] = row.r.lost;
}

const rows = [];
for (const lv of LEVELS) {
  const best = runs.perfect[lv.idx];
  const mid = runs.careful[lv.idx];
  const ord = runs.ordinary[lv.idx];
  const known = [best, mid, ord].filter((v) => v != null);
  if (!known.length) { rows.push({ lv, ace: lv.ace, par: lv.par, note: "no data — kept" }); continue; }

  // Slack shrinks from generous in the Kitchen Garden to tight in the Compost
  // Heap, so the same performance earns fewer stars later on.
  const t = lv.idx / (LEVELS.length - 1);
  const aceSlack = 3 - 2 * t;          // 3 -> 1
  const parSlack = 8 - 3 * t;          // 8 -> 5

  let ace = Math.round((best != null ? best : Math.min(...known)) + aceSlack);
  let par = Math.round(Math.max(mid != null ? mid : 0, ord != null ? ord : 0) + parSlack);
  // Clamp in the generator as well as asserting on the table: at the easy end
  // every bot scores 0 and an unclamped formula can emit ace >= par, which
  // silently deletes the two-star band on exactly the levels a beginner plays.
  ace = Math.max(0, ace);
  par = Math.max(ace + 2, par);
  rows.push({ lv, ace, par, best, mid, ord });
}

console.log("\n  lvl  name                  perfect careful ordinary   ace  par");
console.log("  " + "-".repeat(62));
for (const r of rows) {
  console.log("  " + String(r.lv.idx + 1).padEnd(5) + r.lv.name.slice(0, 21).padEnd(22) +
    String(r.best ?? "-").padStart(7) + String(r.mid ?? "-").padStart(8) +
    String(r.ord ?? "-").padStart(9) + String(r.ace).padStart(6) + String(r.par).padStart(5) +
    (r.note ? "   " + r.note : ""));
}
console.log("  " + "-".repeat(62) + "\n");

if (process.argv.includes("--write")) {
  const file = path.join(ROOT, "js", "levels.js");
  let src = fs.readFileSync(file, "utf8");
  // Each level's bands are the only `ace: N, par: N` line in its block, and
  // they appear in level order, so replace them in sequence.
  let i = 0;
  src = src.replace(/ace: -?\d+, par: -?\d+,/g, () => {
    const r = rows[i++];
    return `ace: ${r.ace}, par: ${r.par},`;
  });
  if (i !== rows.length) {
    console.error(`refusing to write: matched ${i} band lines for ${rows.length} levels`);
    process.exit(1);
  }
  fs.writeFileSync(file, src);
  console.log(`  wrote ${i} star bands into js/levels.js\n`);
}
