# Bramble Brigade 🌻

Five beds. One gate. Everything in the garden wants your vegetables.

A lane-defence game — plant a brigade of defenders across five beds, spend
water, and hold the vegetable patch against slugs, snails, moles, wasps and
four increasingly unreasonable bosses. Built for Rosalie (8) and up, and meant
to be a real game for an adult too: the first garden is gentle, and by the
fourth the ground itself is working against you.

**[▶ Play it](https://rvenning.github.io/bramble-brigade/)**

## The game

The patch runs **top to bottom** — five lanes across the screen, nine squares
deep, pests marching down toward the gate at the bottom. Portrait, because
that is how this family holds a phone.

- **24 levels across four gardens**, with a boss at the end of each.
- **10 plants.** Wellsprings make the water everything else costs; Peppershot
  and Twinshot shoot; Bramble blocks; Nettle is cheap chaff; Thumper punches
  through shell *and* thumps behind itself; Dandelion covers three rows but
  only ever hits things that fly; Marigold bursts over a patch; Ivy Net slows a
  row; the Beetroot Bomb saves a row that is already lost.
- **10 pests and 5 bosses.** Four traits do the work, and each one exists to
  invalidate a plant that was working a moment ago — armour shrugs off ordinary
  shots, flyers ignore the ground line entirely, burrowers surface *behind*
  your front line, and splitters punish killing them late.
- **Each garden changes one rule.** The Orchard at Dusk gives you no water from
  the sky, so your whole economy is Wellsprings you chose over guns. The
  Rockery puts stone where you wanted to build. The Compost Heap turns any
  square that loses a plant sour, so falling behind compounds.
- **Every row has a scarecrow** that saves it once. After that, one pest
  through the gate ends the level.
- **The Potting Shed** sells eight permanent upgrades, bought with coins.
- **📣 Call a wave in early** for bonus water — the schedule compresses but
  never shifts, so it buys tempo and costs safety. **⏩ 2× speed** for adults.
- **The Long Summer** is the endless mode, and what the family leaderboard
  ranks. The gap between waves shrinks for ever, so being good buys depth
  rather than immortality.

## Built on gamekit

Profiles, PINs, family sync, sounds, the install button and the shared look all
come from [gamekit](https://github.com/rvenning/gamekit), vendored into `lib/`.
To pull in a newer kit:

```
node tools/sync-to-game.js "D:\OneDrive\Documents\Claude Code\bramble-brigade"
```

Then test, and bump the cache name in `sw.js`.

## How it is put together

No build step — plain `<script>` tags. Data registries first, then systems:

| File | What it holds |
|---|---|
| `js/plants.js` | the ten plants; `kind` picks the behaviour, everything else is a number |
| `js/pests.js` | pests and bosses, plus `COUNTERS` — which plant answers which pest |
| `js/levels.js` | 24 levels as authored waves, and `suggestLoadout` (the "Pick for me" button) |
| `js/upgrades.js` | the Potting Shed, and the closed `STAT_KEYS` vocabulary |
| `js/endless.js` | The Long Summer, generated from the wave number alone |
| `js/game.js` | the simulation — **no DOM, no canvas, no `Math.random`** |
| `js/render.js` | the board, the pointer input and the frame loop |
| `js/main.js` | screens, the garden map, the seed picker, results |

`game.js` has no randomness in it at all — spawns are authored, targeting is
"nearest", damage is flat — so the bots replay the whole campaign byte-exactly
and a changed clear time is always a real balance change.

## Tests

```
npm test                       # 39 tests: content linter, balance bots, save merge
BB_REPORT=1 node --test tests/bot.test.js    # print the balance table
node tests/diag.js             # campaign sweep, every brain
node tests/diag.js prog child  # one brain, playing the campaign and shopping
node tests/diag.js 14          # one level in detail, with an event tail
node tools/calibrate.js --write  # set every star band from the bots
```

The bots drive the real engine through the same `Game.plant()` a finger
reaches. The campaign is balanced against a **progression** run — each level
once, in order, banking the coins that level really paid and spending them on
the cheapest thing affordable — because neither "level 22 with no upgrades" nor
"level 3 with the full shed" is a situation anybody is ever in.

## Local development

```
npx http-server . -p 8126 -c-1
```

## Storage

`bram_*` in localStorage, `bramblebrigade` in Firestore (the shared
`wordvoyage-e5a5c` project — the API key in `js/firebase-config.js` is a public
client config, not a secret). Coins are stored as two monotonic counters,
`coinsEarned` and `coinsSpent`, and the balance is derived: a balance merged
across devices with `max()` would resurrect every coin you had spent.
