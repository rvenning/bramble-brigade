// Per-level diagnostic. Play ONE level (or sweep the campaign) and print where
// the time and the water actually went.
//
//   node tests/diag.js            sweep every level with every brain
//   node tests/diag.js 14         one level, in detail, with an event tail
//
// Built before the tuning rather than after it: the questions this answers in
// one run are the ones that otherwise survive several passes of dialling.

const { load } = require("./load.js");
const { playLevel, makeBot, BRAINS } = require("./brain.js");

const S = load();
const { LEVELS, GARDENS, PLANT_BY_ID, PEST_BY_ID, Game, statsFor, suggestLoadout, slotsFor } = S;

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

function loadoutFor(idx) {
  return suggestLoadout(LEVELS[idx], idx, slotsFor({}));
}

function sweep() {
  const brains = ["perfect", "ordinary", "child", "idle"];
  console.log("\n  BRAMBLE BRIGADE — campaign sweep (no upgrades, default tray)\n");
  console.log("  " + pad("lvl", 4) + pad("name", 22) +
    brains.map((b) => num(b, 11)).join("") + "   (win · stars · lost)");
  console.log("  " + "-".repeat(4 + 22 + 11 * brains.length + 22));

  const totals = {};
  for (const b of brains) totals[b] = { win: 0, stars: 0 };

  for (const lv of LEVELS) {
    let row = "  " + pad(lv.idx + 1, 4) + pad(lv.name.slice(0, 21), 22);
    for (const b of brains) {
      S.__reseed(1000 + lv.idx);            // same seed for every brain, or the table measures order
      const r = playLevel(S, lv, loadoutFor(lv.idx), statsFor({}), b);
      if (r.win) { totals[b].win++; totals[b].stars += r.stars; }
      const tag = r.win ? `${r.stars}★ l${r.lost}` : (r.timeout ? "TIMEOUT" : "lose");
      row += num(tag, 11);
    }
    console.log(row);
  }
  console.log("  " + "-".repeat(4 + 22 + 11 * brains.length + 22));
  let foot = "  " + pad("", 26);
  for (const b of brains) foot += num(`${totals[b].win}/${LEVELS.length} ${totals[b].stars}★`, 11);
  console.log(foot + "\n");
}

function detail(idx) {
  const lv = LEVELS[idx];
  const brain = process.argv[3] || "ordinary";
  S.__reseed(1000 + idx);
  console.log(`\n  ${lv.idx + 1}. ${lv.name}  (${GARDENS[lv.garden].name}, ${brain})`);
  console.log(`  water ${lv.water} · trickle ${lv.trickle}/s · ${lv.waves.length} waves` +
    `${lv.sour ? " · SOUR" : ""}${(lv.stone || []).length ? ` · ${lv.stone.length} stone` : ""}`);
  console.log(`  tray: ${loadoutFor(idx).map((id) => PLANT_BY_ID[id].name).join(", ")}\n`);

  Game.start(lv, loadoutFor(idx), statsFor({}));
  const bot = makeBot(S, brain);
  const dt = 1 / 30;
  let now = 0, frames = 0;
  const ring = [];
  const marks = [];
  let peakWater = 0, spent = 0, lastWater = Game.water;

  while (Game.running && frames < 60 * 30 * 12) {
    const before = Game.water;
    bot.step(dt, now);
    if (Game.water < before) spent += before - Game.water;
    Game.update(dt);
    peakWater = Math.max(peakWater, Game.water);

    for (const ev of Game.events) {
      if (["plant", "eaten", "scarecrow", "breach", "wave", "kill"].includes(ev.type)) {
        ring.push(`${now.toFixed(0)}s ${ev.type}${ev.id ? " " + ev.id : ""}${ev.c != null ? ` @${ev.c},${ev.r}` : ""}`);
        if (ring.length > 26) ring.shift();
      }
    }
    Game.events = [];

    if (frames % (30 * 20) === 0) {
      marks.push(`  ${num(now.toFixed(0), 4)}s  water ${num(Math.floor(Game.water), 4)}` +
        `  plants ${num(countPlants(), 2)}  pests ${num(Game.pests.length, 2)}` +
        `  lost ${num(Game.lost, 2)}  scarecrows ${Game.scarecrows.join("")}`);
    }
    now += dt; frames++;
  }
  if (Game.running) Game.finish(false);
  const r = Game.result;

  console.log(marks.join("\n"));
  console.log(`\n  RESULT ${r.win ? `WIN ${r.stars}★` : "LOSS"} · ${r.time.toFixed(0)}s · lost ${r.lost}` +
    ` · kills ${r.kills} · coins ${r.coins}`);
  console.log(`  water: peak ${Math.floor(peakWater)}, spent ${Math.floor(spent)}` +
    ` · ace ${lv.ace} / par ${lv.par}`);
  console.log("\n  tail:\n    " + ring.join("\n    ") + "\n");

  function countPlants() {
    let n = 0;
    for (let rr = 0; rr < S.ROWS; rr++) for (let cc = 0; cc < S.COLS; cc++) if (Game.grid[rr][cc]) n++;
    return n;
  }
}

// The run that actually matters: each level once, in order, spending what it
// earned. Prints the purse alongside, because a big unspent balance at the end
// means the shed ran out of things to sell half way through.
function progression(brainName) {
  const { runCampaign } = require("./brain.js");
  const res = runCampaign(S, brainName);
  console.log(`\n  PROGRESSION — ${brainName}: each level once, shopping as it goes\n`);
  console.log("  lvl  name                  result      lost  time  coins  purse  try  shed");
  console.log("  " + "-".repeat(74));
  for (const row of res.rows) {
    const r = row.r;
    const shed = Object.entries(row.owned).map(([k, v]) => `${k[0]}${v}`).join("");
    console.log("  " + pad(row.lv.idx + 1, 5) + pad(row.lv.name.slice(0, 21), 22) +
      pad(r.win ? `WIN ${r.stars}★` : (r.timeout ? "TIMEOUT" : "LOSS"), 12) +
      num(r.lost, 4) + num(Math.round(r.time) + "s", 6) + num(r.coins, 7) +
      num(row.coins, 7) + num(row.attempts, 5) + "  " + shed);
  }
  console.log("  " + "-".repeat(74));
  console.log(res.stuckAt < 0
    ? `  cleared all ${res.cleared} levels, ${res.coins} coins left over\n`
    : `  STUCK at level ${res.stuckAt + 1} (${LEVELS[res.stuckAt].name}) with ${res.coins} coins\n`);
}

const arg = process.argv[2];
if (arg === "prog") progression(process.argv[3] || "ordinary");
else if (arg == null) sweep();
else detail(Math.max(0, Math.min(LEVELS.length - 1, Number(arg) - 1)));
