// The simulation. No DOM, no canvas, no Math.random — anywhere.
//
// That purity is the point: tests/bot.test.js drives this exact file with no
// browser at all, and because there is not a single random draw in the engine
// (spawns are authored, targeting is "nearest", damage is flat) a replay is
// byte-exact. When a clear time changes, something real changed.
//
// The renderer and the audio layer never reach in here; they read `events`,
// which the frame loop drains. That keeps this file free of anything that
// would stop a bot running it.

const TICK = 1 / 60;
const GATE_X = -0.35;        // a pest that walks past this has reached the gate
const PEST_REACH = 0.30;     // how far in front of itself a pest can chew
const SPAWN_X = 9.55;        // just off the right edge
const SOUR_SECS = 18;        // how long a square stays barren in Garden 4
const SCARE_RANGE = 4.5;     // how far up its lane a triggered scarecrow reaches
const DROP_LIFE = 5.0;       // water auto-collects after this long, uncollected
const DROP_VALUE = 25;
const RALLY_RATE = 3.5;      // water per second of earliness, for calling a wave in
const RALLY_MAX = 130;       // ...capped, so a very long gap is not a jackpot
const RALLY_MIN_GAP = 4;     // ...and only if the wave was at least this far off

const Game = {
  /* ---------------- lifecycle ---------------- */

  start(level, loadout, stats) {
    this.level = level;
    this.loadout = loadout.slice();
    this.stats = { ...BASE_STATS, ...(stats || {}) };

    this.t = 0;
    this.running = true;
    this.paused = false;
    this.won = false;
    // These two MUST be cleared here. `breached` is sticky by design — the
    // step checks it before checking for a win — so a start() that leaves it
    // set from a previous attempt loses the next level on its first frame,
    // and every level after that. The bot sweep found it: one losing run by
    // the control bot marked all 23 remaining levels as losses.
    this.breached = null;
    this.result = null;
    this.events = [];

    this.water = level.water + this.stats.water0;
    this.grid = [];
    this.sour = [];
    for (let r = 0; r < ROWS; r++) {
      this.grid.push(new Array(COLS).fill(null));
      this.sour.push(new Array(COLS).fill(0));
    }
    this.stone = new Set((level.stone || []).map(([c, r]) => `${c},${r}`));

    this.pests = [];
    this.shots = [];
    this.drops = [];
    this.rings = [];                       // thumper shockwaves, purely cosmetic
    this.scarecrows = new Array(ROWS).fill(1 + this.stats.scarecrow);

    this.cool = {};                        // seed-packet cooldowns, by plant id
    for (const id of this.loadout) this.cool[id] = 0;

    this.waveIdx = 0;
    this.lost = 0;                         // plants eaten + 3 per scarecrow spent
    this.coins = 0;
    this.kills = 0;
    this.planted = 0;
    this.summonLane = 0;                   // deterministic cycle for boss summons

    this.emit({ type: "start" });
    return this;
  },

  emit(ev) { this.events.push(ev); },

  /* ---------------- queries the UI and the bots both use ---------------- */

  cellFree(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    if (this.stone.has(`${c},${r}`)) return false;
    if (this.sour[r][c] > 0) return false;
    return !this.grid[r][c];
  },

  isStone(c, r) { return this.stone.has(`${c},${r}`); },

  canAfford(id) {
    const def = PLANT_BY_ID[id];
    return def && this.water >= def.cost && (this.cool[id] || 0) <= 0;
  },

  // Fraction of this packet's cooldown still to run, 0 = ready. The renderer
  // draws it as a sweep across the seed packet.
  coolFrac(id) {
    const def = PLANT_BY_ID[id];
    if (!def) return 0;
    const full = def.cooldown * (1 - this.stats.cooldown);
    return full <= 0 ? 0 : Math.max(0, (this.cool[id] || 0) / full);
  },

  /* ---------------- player actions ---------------- */

  plant(c, r, id) {
    if (!this.running || this.paused) return false;
    if (!this.loadout.includes(id)) return false;
    if (!this.canAfford(id) || !this.cellFree(c, r)) return false;

    const def = PLANT_BY_ID[id];
    this.water -= def.cost;
    this.cool[id] = def.cooldown * (1 - this.stats.cooldown);

    const hp = Math.round(def.hp * (1 + this.stats.hp));
    const p = { id, def, c, r, hp, maxHp: hp, timer: 0, born: this.t, alive: true };
    // A bomb is armed the moment it goes in rather than waiting out an
    // attack interval, so "plant it on the thing eating you" actually works.
    if (def.kind === "bomb") p.timer = def.fuse;
    this.grid[r][c] = p;
    this.planted++;
    this.emit({ type: "plant", id, c, r });
    return true;
  },

  // The shovel. No refund — it exists so a misplaced plant is recoverable,
  // not as a way to bank water. Digging never sours the ground: that penalty
  // belongs to losing a plant, not to changing your mind.
  dig(c, r) {
    if (!this.running || this.paused) return false;
    const p = this.grid[r] && this.grid[r][c];
    if (!p) return false;
    this.grid[r][c] = null;
    this.emit({ type: "dig", c, r, id: p.id });
    return true;
  },

  collect(i) {
    const d = this.drops[i];
    if (!d) return false;
    this.water += d.value;
    this.drops.splice(i, 1);
    this.emit({ type: "collect", c: d.c, r: d.r, value: d.value });
    return true;
  },

  collectAll() { while (this.drops.length) this.collect(0); },

  // Call the next wave in early for bonus water. The confident player's way to
  // trade safety for economy — and the reason an adult and an eight-year-old
  // can play the same level at different intensities.
  canRally() {
    const w = this.level.waves[this.waveIdx];
    return !!(this.running && !this.paused && w && w.at - this.t > RALLY_MIN_GAP);
  },

  // The wave arrives NOW; every later wave keeps its original time. So the
  // schedule compresses — you will be fighting this wave and the next one
  // closer together — and that is the risk you are being paid for.
  //
  // It must NOT advance the clock. The first version did, and skipping twenty
  // seconds to collect a flat 30 water quietly threw away ~250 water of income
  // in the process: a strictly losing move dressed up as a bonus. The bots
  // proved it outright — the same brain cleared 24/24 with rallying switched
  // off and stalled on level 23 with it on. A reward the rest of the system
  // charges you more for is not a reward.
  rally() {
    if (!this.canRally()) return false;
    const w = this.level.waves[this.waveIdx];
    const early = w.at - this.t;
    const bonus = Math.round(Math.min(RALLY_MAX, RALLY_RATE * early));
    this.water += bonus;
    for (const [id, lane] of w.spawn) this.spawn(id, lane, SPAWN_X);
    this.waveIdx++;
    this.emit({ type: "rally", water: bonus, early });
    this.emit({
      type: "wave", n: this.waveIdx, total: this.level.endless ? 0 : this.level.waves.length,
      boss: w.spawn.some(([id]) => PEST_BY_ID[id].boss),
      last: !this.level.endless && this.waveIdx >= this.level.waves.length,
    });
    return true;
  },

  /* ---------------- the step ---------------- */

  update(dt) {
    if (!this.running || this.paused) return;
    // Defensive at both ends, and independently of the renderer: a backgrounded
    // tab must not teleport anything, and time must never run backwards no
    // matter what a caller hands in. (NaN fails `> 0` too, which is deliberate.)
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    this.t += dt;

    this.tickWater(dt);
    this.tickWaves();
    this.tickPlants(dt);
    this.tickShots(dt);
    this.tickPests(dt);
    this.tickDecay(dt);

    // Losing is checked before winning: both can become true in the same step
    // (the last pest takes the last scarecrow as the final wave empties) and
    // the wrong order ships a win nobody earned.
    if (this.breached) { this.finish(false); return; }
    // The Long Summer has no last wave, so it can only ever end in a breach.
    if (!this.level.endless && this.waveIdx >= this.level.waves.length && this.pests.length === 0) this.finish(true);
  },

  tickWater(dt) {
    const rate = this.level.trickle * (1 + this.stats.trickle);
    if (rate > 0) this.water += rate * dt;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.life <= 0) this.collect(i);       // never punish a missed tap
    }
  },

  tickWaves() {
    // Endless keeps exactly one wave ahead of the player, generated on demand
    // from the wave number alone — so the list grows but nothing is random.
    if (this.level.endless) {
      while (this.level.waves.length <= this.waveIdx + 1) {
        this.level.waves.push(this.level.nextWave(this.level.waves.length));
      }
    }
    while (this.waveIdx < this.level.waves.length && this.t >= this.level.waves[this.waveIdx].at) {
      const w = this.level.waves[this.waveIdx];
      let bigOne = false;
      for (const [id, lane] of w.spawn) {
        const p = this.spawn(id, lane, SPAWN_X);
        if (p.def.boss) bigOne = true;
      }
      this.waveIdx++;
      const last = this.waveIdx >= this.level.waves.length;
      this.emit({ type: "wave", n: this.waveIdx, total: this.level.waves.length, boss: bigOne, last });
    }
  },

  spawn(id, lane, x) {
    const def = PEST_BY_ID[id];
    const p = {
      id, def, r: lane, x,
      hp: def.hp, maxHp: def.hp,
      armour: def.armour || 0, maxArmour: def.armour || 0,
      state: def.burrow ? "under" : "walk",
      eating: null, slowT: 0, abilityT: (def.ability ? def.ability.every : 0),
      diveT: 0, boss: !!def.boss, hurtT: 0,
    };
    this.pests.push(p);
    this.emit({ type: "spawn", id, lane, boss: p.boss });
    return p;
  },

  tickPlants(dt) {
    for (const id of Object.keys(this.cool)) {
      if (this.cool[id] > 0) this.cool[id] = Math.max(0, this.cool[id] - dt);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (!p) continue;
        const def = p.def;
        p.timer -= dt;

        if (def.kind === "producer") {
          if (p.timer <= 0) {
            p.timer = def.every;
            this.drops.push({
              c: c + 0.5, r: r + 0.5, life: DROP_LIFE,
              value: def.yield + this.stats.wellspring,
            });
            this.emit({ type: "produce", c, r });
          }
        } else if (def.kind === "bomb") {
          if (p.timer <= 0) { this.detonate(p); }
        } else if (def.kind === "melee") {
          // Continuous, so it is scaled by dt rather than fired on a timer.
          const dmg = def.dps * (1 + this.stats.damage) * dt;
          // Snapshot: hurt() can kill, and killing splices this array.
          for (const q of this.pests.slice()) {
            if (q.r !== r || q.def.air || q.state === "under") continue;
            if (Math.abs(q.x - (c + 0.5)) <= def.reach) this.hurt(q, dmg, false, "melee");
          }
        } else if (def.kind === "slow") {
          for (const q of this.pests) {
            if (q.r !== r || q.def.air || q.state === "under") continue;
            if (q.x > c) q.slowT = Math.max(q.slowT, def.slow);
          }
        } else if (p.timer <= 0) {
          if (this.fire(p)) p.timer = def.every;
          else p.timer = 0.08;                 // nothing to shoot; look again shortly
        }
      }
    }
  },

  // Returns true if the plant actually found something to attack.
  fire(p) {
    const def = p.def, c = p.c, r = p.r;
    const mul = 1 + this.stats.damage;

    if (def.kind === "air") {
      // Anti-air reaches ACROSS lanes. A flyer ignores every ground plant in
      // the game, so a single-lane answer to it means covering all five rows
      // — 625 water on Dandelions alone, which made the level that introduces
      // wasps unwinnable by every bot. Three rows of cover means two plants
      // hold the whole patch, and "which two rows" is still a decision.
      const spread = def.spread || 0;
      let t = null;
      for (let rr = Math.max(0, r - spread); rr <= Math.min(ROWS - 1, r + spread); rr++) {
        const cand = this.nearestIn(rr, c, (q) => q.def.air);
        if (cand && (!t || cand.x < t.x)) t = cand;
      }
      if (!t) return false;
      this.shots.push({ x: c + 0.5, r: t.r, vx: 11, dmg: def.dmg * mul, kind: "puff", air: true });
      this.emit({ type: "shoot", kind: "puff", c, r, tr: t.r });
      return true;
    }

    if (def.kind === "lobber") {
      // A minimum range is the whole trade with Marigold: it out-damages
      // anything else at a distance and cannot defend its own square.
      const t = this.nearestIn(r, c, (q) => q.x - (c + 0.5) >= def.minRange);
      if (!t) return false;
      this.shots.push({
        x: c + 0.5, r, vx: 7.5, dmg: def.dmg * mul, kind: "lob",
        splash: def.splash, air: true, ground: true,
      });
      this.emit({ type: "shoot", kind: "lob", c, r });
      return true;
    }

    // Shooters. `instant` (Thumper) resolves immediately as a shockwave
    // rather than travelling — which is also why it is the one that goes
    // through shell: it hits the ground, not the pest's front.
    //
    // `both` means the shockwave travels in BOTH directions, and it is the
    // answer to the one hole every lane-defence game has: every other plant
    // fires up the board, so anything that gets BEHIND the line — a surfacing
    // Mole, a flyer that landed — cannot be touched by anything at all. A
    // Mole once sat at column 1.5 on 60 health, chewing replacement walls, for
    // nine minutes of simulated time, because not one plant on a full board
    // could shoot backwards. A thump hits all round itself, which is both
    // what a thump does and the thing this game needed.
    if (def.instant) {
      let t = null, bestD = Infinity;
      for (const q of this.pests) {
        if (q.r !== r || q.state === "under" || q.def.air) continue;
        const d = Math.abs(q.x - (c + 0.5));
        if (def.range && d > def.range) continue;
        if (!def.both && q.x < c + 0.2) continue;
        if (d < bestD) { bestD = d; t = q; }
      }
      if (!t) return false;
      this.hurt(t, def.dmg * mul, def.pierce, "thump");
      this.rings.push({ c: c + 0.5, r, t: 0 });
      this.emit({ type: "shoot", kind: "thump", c, r, tx: t.x });
      return true;
    }

    const within = def.range ? (q) => q.x - (c + 0.5) <= def.range : null;
    const t = this.nearestIn(r, c, (q) => !q.def.air && (!within || within(q)));
    if (!t) return false;

    for (let i = 0; i < (def.shots || 1); i++) {
      this.shots.push({
        x: c + 0.5, r, vx: 9, dmg: def.dmg * mul, kind: "seed",
        pierce: !!def.pierce, ground: true, delay: i * 0.12,
      });
    }
    this.emit({ type: "shoot", kind: "seed", c, r });
    return true;
  },

  // Nearest pest to the right of column `c` in row `r` that passes `ok`.
  // Deterministic by construction: "nearest" has exactly one answer.
  nearestIn(r, c, ok) {
    let best = null;
    for (const q of this.pests) {
      if (q.r !== r || q.state === "under") continue;
      if (q.x < c + 0.2) continue;
      if (ok && !ok(q)) continue;
      if (!best || q.x < best.x) best = q;
    }
    return best;
  },

  tickShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.x += s.vx * dt;

      if (s.x > COLS + 0.6) { this.shots.splice(i, 1); continue; }

      let hit = null;
      for (const q of this.pests) {
        if (q.r !== s.r || q.state === "under") continue;
        if (q.def.air && !s.air) continue;
        if (!q.def.air && !s.ground) continue;
        if (s.x + 0.22 < q.x) continue;
        if (q.x < s.x - 0.8) continue;
        if (!hit || q.x < hit.x) hit = q;
      }
      if (!hit) continue;

      if (s.splash) this.burst(hit.x, s.r, s.splash, s.dmg, false, "splash");
      else this.hurt(hit, s.dmg, s.pierce, s.kind);
      this.shots.splice(i, 1);
    }
  },

  // Area damage centred on a board position. Adjacent rows take half, which
  // is what makes Marigold the answer to a crowd without making it the answer
  // to everything.
  burst(x, r, radius, dmg, pierce, tag) {
    this.emit({ type: "burst", x, r, radius });
    for (const q of this.pests.slice()) {
      if (q.state === "under") continue;
      const dr = Math.abs(q.r - r);
      if (dr > 1 || Math.abs(q.x - x) > radius) continue;
      this.hurt(q, dr === 0 ? dmg : dmg * 0.5, pierce, tag);
    }
  },

  detonate(p) {
    const def = p.def;
    this.grid[p.r][p.c] = null;
    const x = p.c + 0.5;
    this.emit({ type: "boom", c: p.c, r: p.r, radius: def.splash });
    for (const q of this.pests.slice()) {
      if (q.state === "under") continue;
      const dr = Math.abs(q.r - p.r);
      const dx = Math.abs(q.x - x);
      if (dr > 1 || dx > def.splash) continue;
      this.hurt(q, def.dmg * (dr === 0 ? 1 : 0.6), true, "boom");
    }
  },

  hurt(pest, amount, pierce, tag) {
    if (pest.state === "under" || pest.dead) return 0;
    let left = amount, dealt = 0;

    // Shell soaks flat damage and overflow carries through, so chipping a
    // Snail with Peppershot works eventually — it is just a terrible use of
    // the row. Pierce skips the shell entirely, which is why Thumper turns a
    // 280-effective-HP Snail into a 110-HP one.
    if (!pierce && pest.armour > 0) {
      const a = Math.min(pest.armour, left);
      pest.armour -= a; left -= a; dealt += a;
      if (pest.armour <= 0) this.emit({ type: "crack", id: pest.id, x: pest.x, r: pest.r });
    }
    if (left > 0) { pest.hp -= left; dealt += left; }
    pest.hurtT = 0.12;
    if (amount >= 1) this.emit({ type: "hit", x: pest.x, r: pest.r, tag, dmg: Math.round(amount) });

    if (pest.hp <= 0) this.kill(pest);
    return dealt;
  },

  kill(pest) {
    if (pest.dead) return;
    pest.dead = true;
    this.kills++;
    this.coins += pest.def.coins || 0;
    this.emit({ type: "kill", id: pest.id, x: pest.x, r: pest.r, boss: pest.boss });

    // Splitters. Killing one late is strictly worse than killing it early,
    // because the halves start from wherever the parent fell.
    const split = pest.def.split;
    if (split) {
      const [id, n] = split;
      for (let i = 0; i < n; i++) {
        const child = this.spawn(id, pest.r, Math.min(SPAWN_X, pest.x + 0.25 + i * 0.45));
        child.x = Math.max(0.2, child.x);
      }
    }
    const i = this.pests.indexOf(pest);
    if (i >= 0) this.pests.splice(i, 1);
  },

  tickPests(dt) {
    for (let i = this.pests.length - 1; i >= 0; i--) {
      const p = this.pests[i];
      // A scarecrow going off removes several pests at once, so by the time
      // the loop reaches a lower index the array may be shorter than it was.
      if (!p) continue;
      const def = p.def;
      if (p.hurtT > 0) p.hurtT -= dt;

      if (def.ability) this.tickAbility(p, dt);

      // Burrowers are immune and ignore everything on the surface until they
      // reach their surfacing column — which is behind wherever a player has
      // stacked their front line, and that is the entire point of them.
      if (p.state === "under") {
        p.x -= def.speed * 1.35 * dt;
        if (p.x <= def.burrow) {
          p.state = "walk";
          this.emit({ type: "surface", id: p.id, x: p.x, r: p.r });
        }
        continue;
      }
      if (p.state === "dive") continue;      // handled in tickAbility

      const slow = p.slowT > 0 ? 1 - p.slowT : 1;
      p.slowT = 0;                            // re-applied each frame by any Ivy Net in range

      // Flyers pass over the whole board and only meet the gate.
      const target = def.air ? null : this.chewTarget(p);
      if (target) {
        p.eating = target;
        const bite = def.eat * dt;
        target.hp -= bite;
        if (!p.biteT || p.biteT <= 0) { this.emit({ type: "chew", x: p.x, r: p.r }); p.biteT = 0.45; }
        p.biteT -= dt;
        if (target.hp <= 0) this.eatPlant(target);
        continue;
      }

      p.eating = null;
      p.x -= def.speed * slow * dt;

      if (p.x <= GATE_X) this.reachGate(p, i);
    }
  },

  chewTarget(p) {
    const c = Math.floor(p.x - PEST_REACH);
    if (c < 0 || c >= COLS) return null;
    const plant = this.grid[p.r][c];
    return plant || null;
  },

  eatPlant(plant) {
    this.grid[plant.r][plant.c] = null;
    this.lost++;
    if (this.level.sour) this.sour[plant.r][plant.c] = SOUR_SECS;
    this.emit({ type: "eaten", c: plant.c, r: plant.r, id: plant.id, sour: !!this.level.sour });
  },

  reachGate(p, i) {
    if (this.scarecrows[p.r] > 0) {
      this.scarecrows[p.r]--;
      this.lost += 3;
      this.emit({ type: "scarecrow", r: p.r, left: this.scarecrows[p.r] });
      // It clears what has got CLOSE to the gate, flyers included — not the
      // whole lane. Clearing the entire lane made one scarecrow mop up three
      // waves at once, and the do-nothing control bot duly won the first two
      // levels by leaving the iPad on the table. Anything still up the board
      // keeps coming, so the save buys a breather rather than the level.
      for (let j = this.pests.length - 1; j >= 0; j--) {
        const q = this.pests[j];
        if (q.r === p.r && q.x <= SCARE_RANGE) { q.hp = 0; this.kill(q); }
      }
      return;
    }
    this.breached = { r: p.r, id: p.id };
    this.emit({ type: "breach", r: p.r, id: p.id });
  },

  tickAbility(p, dt) {
    const ab = p.def.ability;
    if (p.state === "dive") {
      p.diveT -= dt;
      p.x -= p.def.speed * 2.2 * dt;
      if (p.diveT <= 0) {
        p.state = "walk";
        this.emit({ type: "surface", id: p.id, x: p.x, r: p.r });
      }
      return;
    }

    p.abilityT -= dt;
    if (p.abilityT > 0) return;
    p.abilityT = ab.every;

    if (ab.kind === "spit") {
      // Hits the plant directly in front of it, which is what makes a boss
      // grind through a wall rather than stall on one.
      for (let c = Math.floor(p.x); c >= 0; c--) {
        const plant = this.grid[p.r][c];
        if (plant) {
          plant.hp -= ab.dmg;
          this.emit({ type: "spit", from: p.x, r: p.r, c });
          if (plant.hp <= 0) this.eatPlant(plant);
          break;
        }
      }
    } else if (ab.kind === "summon") {
      for (let i = 0; i < ab.n; i++) {
        this.summonLane = (this.summonLane + 2) % ROWS;   // deterministic spread
        this.spawn(ab.id, this.summonLane, SPAWN_X);
      }
      this.emit({ type: "summon", id: ab.id, n: ab.n });
    } else if (ab.kind === "dive") {
      p.state = "dive";
      p.diveT = ab.dur;
      p.r = (p.r + 2) % ROWS;
      this.emit({ type: "dive", id: p.id, r: p.r });
    }
  },

  tickDecay(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.sour[r][c] > 0) this.sour[r][c] = Math.max(0, this.sour[r][c] - dt);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t > 0.4) this.rings.splice(i, 1);
    }
  },

  finish(win) {
    if (!this.running) return;
    this.running = false;
    this.won = !!win && !this.breached;      // defensive: never report a win on a breach
    const endless = !!this.level.endless;
    const stars = this.won && !endless ? starsFor(this.level, this.lost) : 0;
    const bonus = this.won ? 10 + this.level.idx * 2 + stars * 5 : 0;
    const result = {
      win: this.won, stars, lost: this.lost, kills: this.kills,
      // The Long Summer always "loses", so it pays out on how far you got
      // rather than on a win that can never happen.
      coins: endless ? this.coins : (this.won ? this.coins + bonus : Math.floor(this.coins / 2)),
      time: this.t, levelIdx: this.level.idx,
      endless, wave: this.waveIdx,
      scarecrows: this.scarecrows.reduce((a, b) => a + b, 0),
    };
    this.result = result;
    this.emit({ type: "end", result });
    return result;
  },

  quit() {
    if (!this.running) return;
    this.running = false;
    this.emit({ type: "end", result: { win: false, quit: true, stars: 0, coins: 0, levelIdx: this.level.idx } });
  },
};

if (typeof module !== "undefined") module.exports = { Game, TICK, SOUR_SECS, DROP_VALUE, RALLY_RATE, RALLY_MAX };
