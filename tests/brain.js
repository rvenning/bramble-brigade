// The bots. They drive the real engine through the same `Game.plant()` a
// finger reaches, so "can this level be held" is answered honestly.
//
// THE FACULTY THIS GAME TESTS is not reflexes — it is knowing what answers
// what, and affording it in time. So that is what the bots are imperfect at,
// and it is expressed as three numbers rather than as generic noise:
//
//   reaction — seconds before a newly-arrived pest is noticed at all
//   lore     — chance of reaching for the RIGHT counter rather than a
//              general-purpose shooter (this is the real skill of the genre)
//   apm      — how often a pair of hands can actually do something
//
// A bot perfect at all three would measure nothing: it would three-star the
// campaign and hand back clear times no person could meet.
//
// NOTE ON GEOMETRY: pests walk from high column numbers down to column 0,
// which is the gate. So low columns are the SAFE end — that is where economy
// goes — and the front line is around columns 5-7.

// `rally` is a POLICY, not a boolean, and separating it out matters: calling
// waves in early is a gamble, so a bot that always takes it is a risk-taker
// rather than a good player. "Perfect" means perfect at PLAYING as well as at
// perceiving, and a faultless player does not gamble when they do not need to
// — so the guardrail rallies only from a position of strength.
//   never  — bank it
//   safe   — only with the board clear, money in hand and a real defence up
//   always — take every gamble going
const BRAINS = {
  // Guardrail. Nothing in the campaign may be unwinnable by this one.
  perfect:  { reaction: 0.0, lore: 1.00, apm: 4.0, wells: 6, rally: "safe",   panic: true },

  // The tuning target — a competent adult who takes the odd sensible risk.
  ordinary: { reaction: 0.9, lore: 0.75, apm: 2.0, wells: 5, rally: "safe",   panic: true },

  // The bot the "never stuck" guarantee is really about. Every other brain
  // here is a completionist or a gambler; this one just banks the win, which
  // is what someone does when they only want to see the next level.
  careful:  { reaction: 1.2, lore: 0.70, apm: 1.8, wells: 5, rally: "never",  panic: true },

  // Rosalie at eight. She plants sensibly and enjoys herself, but she is not
  // cross-referencing shells against pierce damage, and her hands are slower.
  // The brief for this game is that she conquers the first handful of levels,
  // so THIS bot clearing Garden 1 is the assertion that matters most here.
  child:    { reaction: 2.2, lore: 0.20, apm: 1.1, wells: 4, rally: "never",  panic: false },

  // The risk-taker: rallies every single time it can. Exists to prove the
  // rally is a real trade rather than a trap — it should win FEWER levels and
  // finish them FASTER, and if it simply loses it is a trap again.
  greedy:   { reaction: 0.4, lore: 0.85, apm: 3.0, wells: 5, rally: "always", panic: true },

  // Control. Never plants anything; must win nothing at all.
  idle:     { reaction: 0, lore: 0, apm: 0, wells: 0, rally: "never", panic: false, dead: true },
};

// Plants the bot understands, best first.
//
// CHAFF IS SEPARATE FROM GUNS ON PURPOSE. The first version of this file had
// Nettle at the end of one GUNS list and picked "the cheapest affordable
// thing" every tick — so the bot spent every spare 25 water the instant it
// had it, never accumulated the 100 for a Peppershot, and reported the entire
// campaign as unwinnable by every brain including the guardrail. A person
// saves up. Chaff is now only ever bought against an immediate threat.
// Peppershot before Twinshot on purpose: a Twinshot is exactly two
// Peppershots in one square, so while there are free squares the cheaper one
// is better value, and the bot should only reach for the expensive one when
// it has run out of room. That makes Twinshot a convenience rather than an
// upgrade, which is what it is.
const GUNS = ["peppershot", "twinshot"];
const CHAFF = ["nettle"];
// Dandelion FIRST: it is cheaper (110 vs 200) and covers three rows against
// Marigold's one, so for the specific job of answering flyers it is simply the
// better buy. Ordering these the other way round made the bot spend twice as
// much for a third of the cover as soon as a six-slot tray put both in reach,
// and it lost a level with upgrades that it won without them.
const ANTI_AIR = ["dandelion", "marigold"];
const PIERCE = ["thumper"];

function makeBot(S, name, opts) {
  const { Game, PLANT_BY_ID, ROWS, COLS } = S;
  const b = { ...BRAINS[name], ...(opts || {}) };
  const rnd = () => S.__rand();

  return {
    name,
    nextAct: 0,

    // Everything the bot is allowed to know about a lane, subject to reaction.
    laneInfo(now) {
      const lanes = [];
      for (let r = 0; r < ROWS; r++) lanes.push({ r, hp: 0, air: 0, armour: 0, burrow: 0, nearest: 99, count: 0 });
      for (const p of Game.pests) {
        // Reaction: something that arrived a moment ago has not been noticed.
        if (now - (p.seenAt == null ? (p.seenAt = now) : p.seenAt) < b.reaction) continue;
        const L = lanes[p.r];
        L.hp += p.hp + p.armour;
        L.count++;
        if (p.def.air) L.air++;
        if (p.def.burrow) L.burrow++;
        if (p.armour > 0) L.armour++;
        L.nearest = Math.min(L.nearest, p.x);
      }
      return lanes;
    },

    has(r, pred) { return this.count(r, pred) > 0; },

    count(r, pred) {
      let n = 0;
      for (let c = 0; c < COLS; c++) {
        const p = Game.grid[r][c];
        if (p && pred(p)) n++;
      }
      return n;
    },

    // The first free square in a column range, working from the front line
    // backwards so guns end up ahead of the economy.
    freeIn(r, from, to) {
      const step = from <= to ? 1 : -1;
      for (let c = from; step > 0 ? c <= to : c >= to; c += step) {
        if (Game.cellFree(c, r)) return c;
      }
      return -1;
    },

    have(ids) { return ids.filter((id) => Game.loadout.includes(id)); },

    // Try a preferred stretch of the lane, then anywhere at all, ALWAYS
    // working up from the gate. Two things depend on that direction:
    // without a last resort a bot whose favourite columns are full simply
    // stops planting and then sits on thousands of unspent water; and because
    // nothing in this game shoots backwards, a plant low on the board covers
    // far more of the lane than a plant high on it. A Dandelion at column 8
    // gets seven seconds of fire at an incoming Crow; the same plant at column
    // 1 gets forty-eight. Falling back to the TOP of the board made anti-air
    // almost decorative.
    plantSomewhere(r, id, ranges) {
      for (const [from, to] of ranges.concat([[0, 8]])) {
        const c = this.freeIn(r, from, to);
        if (c >= 0 && Game.plant(c, r, id)) return true;
      }
      return false;
    },

    step(dt, now) {
      if (b.dead) return;
      // A real player taps drops as they appear; leaving them costs the five
      // seconds until they fall in on their own.
      Game.collectAll();

      this.nextAct -= dt;
      if (this.nextAct > 0) return;
      this.nextAct = 1 / b.apm;

      const lanes = this.laneInfo(now);
      const urgent = lanes.slice().sort((a, c) => a.nearest - c.nearest)[0];

      // WHICH LANE NEEDS A GUN is scored by threat divided by what is already
      // defending it, never by raw threat alone. Picking "the lane with the
      // most health in it" makes a bot stack its whole army into one lane and
      // leave the other four bare — so the guardrail bot lost levels the
      // low-lore child bot won, purely because her random lane choice
      // accidentally spread the defence out. In a five-lane game, spreading
      // IS the correct play, and the bot has to be allowed to know that.
      for (const L of lanes) {
        L.guns = 0;
        for (let c = 0; c < COLS; c++) {
          const p = Game.grid[L.r][c];
          if (p && p.def.kind !== "producer" && p.def.kind !== "wall") L.guns++;
        }
        // The 140 is a BASELINE, and it is load-bearing. Without it an empty
        // lane scores zero need and is never built in, so the bot only ever
        // reacts to lanes that already have something walking down them —
        // never prepares. That alone made the guardrail bot lose levels the
        // sloppier one won, purely because her random lane picks happened to
        // garrison quiet lanes ahead of time.
        L.need = (140 + L.hp + 60 * L.count + (L.nearest < 99 ? (9 - L.nearest) * 25 : 0)) / (1 + L.guns * 2.2);
      }
      const worst = lanes.slice().sort((a, c) => c.need - a.need)[0];

      // 1. Something is about to walk through the gate. Spend anything.
      if (b.panic && urgent && urgent.nearest < 2.2) {
        const bomb = this.have(["beetroot"])[0];
        if (bomb && Game.canAfford(bomb) && urgent.nearest > 0.6) {
          const c = this.freeIn(urgent.r, Math.max(0, Math.floor(urgent.nearest)), COLS - 1);
          if (c >= 0 && Game.plant(c, urgent.r, bomb)) return;
        }
        // Can anything in this lane still SHOOT it? A gun at column c only
        // reaches pests at x >= c + 0.2, so once something is past the whole
        // line nothing can. Walling in front of it then just feeds it: the
        // pest stops, eats, and the lane never resolves. Put a gun in its
        // path instead, and only wall when a gun can actually punish it.
        const reachable = this.has(urgent.r, (p) =>
          p.c + 0.2 <= urgent.nearest && p.def.kind !== "producer" && p.def.kind !== "wall");
        if (!reachable) {
          const g = this.have([...PIERCE, ...GUNS]).find((id) => Game.canAfford(id));
          if (g) {
            const c = this.freeIn(urgent.r, Math.max(0, Math.floor(urgent.nearest)), 0);
            if (c >= 0 && Game.plant(c, urgent.r, g)) return;
          }
        }
        const wall = this.have(["bramble"])[0];
        if (reachable && wall && Game.canAfford(wall)) {
          const c = this.freeIn(urgent.r, Math.max(0, Math.floor(urgent.nearest) - 1), COLS - 1);
          if (c >= 0 && Game.plant(c, urgent.r, wall)) return;
        }
      }

      // 2a. Anti-air is NOT gated by lore, because the game tells the player
      // outright: the level intro says only a Dandelion can touch a flyer, and
      // the seed screen refuses to let you walk in without one, naming the
      // exact plants. A bot that has to *work that out* is being tested on
      // knowledge the game hands over for free, which made Rosalie's bot stall
      // on the level that introduces wasps.
      for (const L of lanes) {
        const aa = [L.r - 1, L.r, L.r + 1]
          .filter((rr) => rr >= 0 && rr < ROWS)
          .reduce((n, rr) => n + this.count(rr, (p) => p.def.kind === "air" || p.def.kind === "lobber"), 0);
        const airNear = [L.r - 1, L.r, L.r + 1]
          .filter((rr) => rr >= 0 && rr < ROWS)
          .reduce((n, rr) => n + lanes[rr].air, 0);
        if (airNear > 0 && aa < Math.ceil(airNear / 2)) {
          const pick = this.have(ANTI_AIR).find((id) => Game.canAfford(id));
          if (pick && this.plantSomewhere(L.r, pick, [[1, 3]])) return;
        }
      }

      // 2b. The rest of the counters. This is the real skill of the genre, so
      // it is what `lore` gates: a player who has not worked out that a shell
      // needs pierce simply keeps planting peppers at it.
      if (rnd() < b.lore) {
        for (const L of lanes) {
          // A burrower travels UNDER the front line and surfaces at column
          // 3.4, so a lane defended only at columns 4-7 does literally nothing
          // to it. The answer the level's own intro text gives is "keep
          // something in the back rows", and the bot has to know it too.
          if (L.burrow > 0 && !this.has(L.r, (p) => p.c <= 4 && p.def.kind !== "producer" && p.def.kind !== "wall")) {
            const g = this.have([...PIERCE, ...GUNS]).find((id) => Game.canAfford(id));
            if (g && this.plantSomewhere(L.r, g, [[4, 1]])) return;
          }
          if (L.armour > 0 && !this.has(L.r, (p) => p.def.pierce)) {
            const th = this.have(PIERCE).find((id) => Game.canAfford(id));
            // Thumper has a short reach, so it wants to be near the front.
            if (th && this.plantSomewhere(L.r, th, [[3, 6]])) return;
          }
        }
      }

      // Count what is already in the ground, which is what the build order
      // below is really deciding between.
      let nWells = 0, nGuns = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = Game.grid[r][c];
          if (!p) continue;
          if (p.def.kind === "producer") nWells++;
          else if (p.def.kind !== "wall" && p.def.kind !== "melee") nGuns++;
        }
      }

      // 3. Economy, interleaved with guns rather than front-loaded — nobody
      // plants six Wellsprings before a single shooter, and doing so loses
      // Garden 1 outright.
      const wells = this.have(["wellspring"])[0];
      // Three Wellsprings go down before the first gun (the opening every
      // player of this genre already knows), and after that they interleave.
      if (wells && nWells < b.wells && nWells <= nGuns + 3 && Game.canAfford(wells)) {
        for (let c = 0; c < 2; c++) {
          for (let r = 0; r < ROWS; r++) {
            if (Game.cellFree(c, r) && Game.plant(c, r, wells)) return;
          }
        }
      }

      // 4. The best gun in the tray, into whichever lane is under most
      // pressure. If it is not affordable yet, SAVE — do not fall back to
      // something cheap and useless.
      const gun = this.have(GUNS)[0];
      if (gun && worst && Game.canAfford(gun)) {
        const target = rnd() < b.lore ? worst.r : Math.floor(rnd() * ROWS);
        // Front line first, then anywhere at all. Without the last fallback
        // the bot stops building the moment columns 2-7 are full and then
        // sits on thousands of unspent water while the board is half empty.
        for (const [from, to] of [[2, 5], [2, 8]]) {
          const c = this.freeIn(target, from, to);
          if (c >= 0 && Game.plant(c, target, gun)) return;
        }
      }

      // 5. Chaff, but only to buy time in a lane that is genuinely in trouble
      // and has nothing shooting in it.
      if (urgent && urgent.count > 0 && urgent.nearest < 5 && !this.has(urgent.r, (p) => p.def.kind !== "producer")) {
        const chaff = this.have(CHAFF).find((id) => Game.canAfford(id));
        if (chaff) {
          const c = this.freeIn(urgent.r, Math.max(1, Math.floor(urgent.nearest) - 1), 1);
          if (c >= 0 && Game.plant(c, urgent.r, chaff)) return;
        }
      }

      // 6. The gamble. Only from a position of strength unless the brain is
      // the deliberate risk-taker.
      if (b.rally === "never" || !Game.canRally() || Game.pests.length) return;
      if (b.rally === "always") { Game.rally(); return; }
      // Never in The Long Summer. Rallying a campaign level brings the end
      // closer; rallying an endless one only brings the escalation closer,
      // and there is no end to reach. Letting the guardrail do it made it
      // finish on wave 22 where the ordinary bot reached 69.
      if (Game.level.endless) return;
      const guns = lanes.reduce((n, L) => n + L.guns, 0);
      if (guns >= 9 && Game.water >= 220) Game.rally();
    },
  };
}

// Play one level to a conclusion. Returns the engine's own result object.
function playLevel(S, level, loadout, stats, brainName, opts) {
  const { Game } = S;
  Game.start(level, loadout, stats || {});
  const bot = makeBot(S, brainName, opts);
  const dt = 1 / 30;                 // half rate: twice as fast, same outcome
  let now = 0, frames = 0;
  const cap = (opts && opts.cap) || 60 * 30 * 12;    // twelve minutes of sim
  while (Game.running && frames < cap) {
    bot.step(dt, now);
    Game.update(dt);
    now += dt; frames++;
  }
  if (Game.running) { Game.finish(false); Game.result.timeout = true; }
  return Game.result;
}

// Play the whole campaign the way a person actually meets it: each level once,
// in order, banking the coins that level really paid and spending them in the
// shed before the next one.
//
// THIS IS THE RUN THE KINDNESS GUARANTEE IS ABOUT. Neither extreme is a
// situation anybody is ever in: "level 22 with no upgrades at all" cannot
// happen (you cleared twenty-one levels and were paid for every one), and
// "level 3 with the full shed" cannot either. Both extremes are kept as
// guardrails either side, but the campaign is tuned against this.
//
// The shopper is deliberately PESSIMISTIC — it buys the cheapest thing it can
// afford after every level, because nobody saves 800 coins for the top tier of
// Bigger Tray. If the campaign is winnable by a bot shopping badly, it is
// winnable.
function runCampaign(S, brainName, opts) {
  const { LEVELS, UPGRADES, statsFor, slotsFor, nextTier, suggestLoadout } = S;
  const o = opts || {};
  const owned = {};
  let coins = o.coins || 0;
  const rows = [];
  let cleared = 0;

  for (const lv of LEVELS) {
    S.__reseed((o.seed || 1000) + lv.idx);   // same mistakes whoever asks first
    const stats = statsFor(owned);
    const tray = suggestLoadout(lv, cleared, slotsFor(owned));

    // The ENGINE is deterministic, but these bots are not: `lore` and the lane
    // choice draw from the seeded stream, so a second attempt really is the
    // player having another go and doing it slightly differently. That makes
    // the honest guarantee "never STUCK" rather than "wins first time" — a
    // level you retry once is a game; one you retry six times is a grind, so
    // the mean attempts is reported and asserted on.
    let r = null, attempts = 0;
    const maxTries = o.tries || 5;
    while (attempts < maxTries) {
      attempts++;
      S.__reseed((o.seed || 1000) + lv.idx + (attempts - 1) * 997);
      r = playLevel(S, lv, tray, stats, brainName, o);
      if (r.win) break;
    }
    rows.push({ lv, r, coins, attempts, owned: { ...owned } });
    if (!r.win) return { rows, cleared, coins, owned, stuckAt: lv.idx, attempts };

    cleared++;
    coins += r.coins;

    // Shop: cheapest affordable tier, repeatedly, while anything is affordable.
    for (let guard = 0; guard < 40; guard++) {
      const options = UPGRADES
        .map((u) => ({ u, t: nextTier(owned, u.id) }))
        .filter((x) => x.t && x.t.cost <= coins)
        .sort((a, b) => a.t.cost - b.t.cost);
      if (!options.length) break;
      const pick = options[0];
      coins -= pick.t.cost;
      owned[pick.u.id] = (owned[pick.u.id] || 0) + 1;
    }
  }
  return { rows, cleared, coins, owned, stuckAt: -1 };
}

module.exports = { BRAINS, makeBot, playLevel, runCampaign };
