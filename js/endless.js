// The Long Summer — the endless mode, and the only thing in the game the whole
// family can compare, so it is what the leaderboard ranks.
//
// Generated with NO RANDOMNESS: wave `n`'s composition and lanes are pure
// functions of `n`, so every player on every device faces the identical
// summer and a score means something. It is also why the bots can assert the
// mode terminates.
//
// TERMINATION IS A GUARANTEE, NOT A HOPE — but the obvious way to get it is
// wrong. A GEOMETRIC decay on the gap between waves (`22 * 0.955^n`) has no
// floor, which is the usual advice, and it also SUMS TO A FINITE TIME: every
// wave that will ever exist arrives inside 489 seconds, so the mode fires
// waves faster than one a frame and a perfect player "reached wave 1777" in
// eight minutes. The wave number stopped being a score.
//
// The gap decays HARMONICALLY instead (`22 / (1 + 0.06n)`): it still shrinks
// without ever levelling off, so being good never becomes immortality, but the
// series diverges so wave N always arrives at a sane time. The thing that
// actually ends a run is the wave BUDGET, which grows without bound.

const ENDLESS_POOL = [
  { at: 1, id: "slug", w: 3 },
  { at: 1, id: "beetle", w: 3 },
  { at: 3, id: "caterpillar", w: 5 },
  { at: 5, id: "snail", w: 5 },
  { at: 6, id: "wasp", w: 4 },
  { at: 8, id: "mole", w: 5 },
  { at: 10, id: "clump", w: 6 },
  { at: 13, id: "crow", w: 8 },
  { at: 16, id: "weevil", w: 9 },
];

const Endless = {
  // Seconds from the start of the run at which wave `n` (0-based) arrives.
  timeOf(n) {
    let t = 14;
    for (let i = 0; i < n; i++) t += this.gapAfter(i);
    return t;
  },

  gapAfter(n) { return 22 / (1 + 0.08 * n); },

  // The wave itself. A budget that grows with `n` is spent on the toughest
  // pests unlocked so far, walking the pool backwards so late waves are made
  // of late pests rather than a hundred slugs.
  wave(n) {
    const wave = n + 1;
    let budget = 4 + wave * 1.4;
    const pool = ENDLESS_POOL.filter((p) => p.at <= wave);
    const spawn = [];
    let i = 0;

    for (let pass = 0; pass < 40 && budget > 0; pass++) {
      // Deterministic walk: alternate from the expensive end so the mix
      // shifts steadily rather than jumping when a new pest unlocks.
      const pick = pool[(pool.length - 1 - ((pass + wave) % pool.length))];
      if (!pick || pick.w > budget) {
        const cheap = pool.find((p) => p.w <= budget);
        if (!cheap) break;
        spawn.push([cheap.id, (wave * 2 + i * 3) % ROWS]);
        budget -= cheap.w; i++;
        continue;
      }
      spawn.push([pick.id, (wave * 2 + i * 3) % ROWS]);
      budget -= pick.w; i++;
    }
    return { at: this.timeOf(n), spawn };
  },

  // A level object shaped exactly like a campaign level, so game.js needs no
  // special case beyond topping the wave list up as it goes.
  level() {
    return {
      idx: -1, name: "The Long Summer", garden: -1, endless: true,
      water: 250, trickle: 0.9, stone: [], sour: false,
      waves: [],
      nextWave: (n) => this.wave(n),
      ace: 0, par: 0,
    };
  },
};

if (typeof module !== "undefined") module.exports = { Endless, ENDLESS_POOL };
