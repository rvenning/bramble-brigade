// App shell: screens, the garden map, the seed picker, the Potting Shed and
// the results card. Profiles, PINs, family sync and the install button all
// come from gamekit — this file only wires them to Bramble Brigade's flow.

const AVATARS = ["🐝", "🦋", "🐞", "🌻", "🦔", "🐿️", "🦉", "🐸", "🦊", "🐢", "🌷", "⭐"];

const App = {
  profile: null,
  prog: null,
  levelIdx: 0,
  endless: false,
  token: 0,           // bumped on every entry/exit, so a delayed transition
                      // belonging to an abandoned run can never fire

  el(id) { return document.getElementById(id); },

  init() {
    const settings = Storage.getSettings();
    Sfx.enabled = settings.sound !== false;
    Render.speed = settings.speed === 2 ? 2 : 1;

    GK.UI.onScreenChange = (name) => {
      Render.running = name === "game";
      if (name === "splash") this.refreshSplash();
      if (name === "game") Render.resize();
    };
    GK.UI.bindSoundToggle(Storage);
    GK.UI.bindMenuClicks();

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => `⭐ ${Storage.totalStars(prog)}/${LEVELS.length * 3} · 🪙 ${Storage.coins(prog)}`,
      onEnter: (p) => { this.profile = p; this.prog = Storage.getProgress(p.id); this.showMap(); },
      addLabel: "New Gardener",
    });

    GK.initPWA({ appName: "Bramble Brigade" });
    Render.boot();

    GK.Debug.init({ storage: Storage, title: "BRAMBLE BRIGADE" })
      .jump("level", LEVELS.length, (n) => this.startLevel(n - 1))
      .action("+500 water", () => { Game.water += 500; this.paintHud(); })
      .action("kill all", () => { Game.pests.slice().forEach((p) => { p.hp = 0; Game.kill(p); }); })
      .action("win now", () => Game.finish(true));

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🌱 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.classList.add("ghost");
      start.textContent = "👥 Switch Gardener";
    } else {
      cont.style.display = "none";
      start.classList.remove("ghost");
      start.textContent = "🌱 Play";
    }
  },

  play() { Sfx.init(); this.showScreen("profiles"); GK.Profiles.renderList(); },

  reload() { this.prog = Storage.getProgress(this.profile.id); return this.prog; },

  /* ---------------- the garden map ---------------- */

  showMap() {
    this.reload();
    this.showScreen("map");
    const open = unlockedLevel(this.prog);
    this.el("map-player").innerHTML =
      `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("map-stars").textContent = `⭐ ${Storage.totalStars(this.prog)}`;
    this.el("map-coins").textContent = `🪙 ${Storage.coins(this.prog)}`;

    const cont = this.el("btn-continue");
    cont.textContent = `${LEVELS[open].garden === 3 ? "🍂" : GARDENS[LEVELS[open].garden].icon} ${open + 1}. ${LEVELS[open].name}`;
    cont.onclick = () => this.showSeeds(open);

    // The Long Summer opens once the first garden is behind you, so a new
    // player is never offered the endless mode as their first experience.
    const endlessBtn = this.el("btn-endless");
    const endlessOpen = Storage.cleared(this.prog) >= 6;
    endlessBtn.disabled = !endlessOpen;
    endlessBtn.textContent = endlessOpen
      ? `☀️ The Long Summer${this.prog.endlessBest ? ` · best wave ${this.prog.endlessBest}` : ""}`
      : "☀️ The Long Summer (clear the Kitchen Garden)";

    let html = "";
    GARDENS.forEach((g, gi) => {
      const levels = LEVELS.filter((l) => l.garden === gi);
      const done = levels.filter((l) => this.prog.levels[l.idx]).length;
      html += `<div class="garden">
        <div class="garden-head"><span class="garden-icon">${g.icon}</span>
          <div><h3>${g.name}</h3><p>${g.blurb}</p></div>
          <span class="garden-done">${done}/${levels.length}</span></div>
        <div class="level-row">`;
      for (const lv of levels) {
        const rec = this.prog.levels[lv.idx];
        const locked = lv.idx > open;
        const stars = rec ? rec.stars : 0;
        html += `<button class="lvl${locked ? " locked" : ""}${lv.boss ? " boss" : ""}${lv.idx === open ? " next" : ""}"
          ${locked ? "disabled" : `onclick="App.showSeeds(${lv.idx})"`}
          aria-label="Level ${lv.idx + 1}, ${GK.util.esc(lv.name)}${locked ? ", locked" : `, ${stars} of 3 stars`}">
          <span class="lvl-n">${locked ? "🔒" : lv.boss ? "👑" : lv.idx + 1}</span>
          <span class="lvl-name">${GK.util.esc(lv.name)}</span>
          <span class="lvl-stars">${locked ? "" : "★★★".slice(0, stars).padEnd(3, "☆")}</span>
        </button>`;
      }
      html += `</div></div>`;
    });
    this.el("level-grid").innerHTML = html;
  },

  /* ---------------- the seed picker ---------------- */

  showSeeds(idx) {
    this.reload();
    this.levelIdx = idx;
    this.endless = false;
    this.buildSeeds(LEVELS[idx]);
  },

  showEndless() {
    this.reload();
    if (Storage.cleared(this.prog) < 6) return;
    this.endless = true;
    this.buildSeeds(Endless.level());
  },

  buildSeeds(level) {
    this.pickLevel = level;
    const slots = slotsFor(this.prog.owned);
    this.picked = Storage.loadout(this.prog, slots);
    this.showScreen("seeds");
    this.el("seeds-title").textContent = this.endless
      ? "☀️ The Long Summer"
      : `${GARDENS[level.garden].icon} ${level.idx + 1}. ${level.name}`;
    this.el("seeds-intro").textContent = this.endless
      ? "Endless waves, closer and closer together. How long can you hold the patch?"
      : (level.intro || "");
    this.paintSeeds();
  },

  paintSeeds() {
    const slots = slotsFor(this.prog.owned);
    const open = unlockedPlants(Storage.cleared(this.prog));
    this.el("seeds-count").textContent = `${this.picked.length} / ${slots}`;

    this.el("seed-choices").innerHTML = PLANTS.map((p) => {
      const locked = !open.includes(p.id);
      const on = this.picked.includes(p.id);
      const full = this.picked.length >= slots && !on;
      return `<button class="seedcard${on ? " on" : ""}${locked ? " locked" : ""}${full ? " full" : ""}"
        ${locked ? "disabled" : `onclick="App.toggleSeed('${p.id}')"`}
        aria-label="${GK.util.esc(p.name)}, ${p.cost} water${locked ? `, locked until ${p.unlock} levels cleared` : on ? ", chosen" : ""}">
        <span class="seed-ico">${locked ? "🔒" : p.icon}</span>
        <span class="seed-name">${locked ? "Locked" : GK.util.esc(p.name)}</span>
        <span class="seed-cost">${locked ? `clear ${p.unlock}` : `💧 ${p.cost}`}</span>
        ${locked ? "" : `<span class="seed-tip">${GK.util.esc(p.tip)}</span>`}
      </button>`;
    }).join("");

    // The one piece of hand-holding in the game: if this level fields
    // something the chosen tray simply cannot hurt, say so BEFORE the level
    // starts. Losing to a bad plan is fair; losing to a plan that was never
    // going to work, with no way to know, is not.
    const warn = this.missingCounter();
    const w = this.el("seeds-warn");
    w.style.display = warn ? "" : "none";
    w.innerHTML = warn || "";
    this.el("btn-sow").disabled = this.picked.length === 0;
  },

  missingCounter() {
    const lv = this.pickLevel;
    if (!lv || lv.endless) return "";
    const ids = new Set();
    for (const wv of lv.waves) for (const [id] of wv.spawn) ids.add(id);
    const gaps = [];
    for (const id of ids) {
      const need = COUNTERS[id];
      if (!need) continue;
      const pest = PEST_BY_ID[id];
      // Only warn about the genuinely unanswerable case: something that flies.
      // A Snail with no Thumper is merely expensive, and that is a fair lesson.
      if (!pest.air) continue;
      if (need.some((c) => this.picked.includes(c))) continue;
      gaps.push(`${pest.icon} ${pest.name}`);
    }
    if (!gaps.length) return "";
    return `⚠️ Nothing in your tray can reach ${gaps.join(" or ")}. Take a 🌼 Dandelion or a 🌻 Marigold.`;
  },

  toggleSeed(id) {
    const slots = slotsFor(this.prog.owned);
    const i = this.picked.indexOf(id);
    if (i >= 0) this.picked.splice(i, 1);
    else if (this.picked.length < slots) this.picked.push(id);
    else { Sfx.nope(); GK.UI.toast(`Only ${slots} kinds fit in the tray`); return; }
    Sfx.click();
    this.paintSeeds();
  },

  autoSeeds() {
    const slots = slotsFor(this.prog.owned);
    this.picked = defaultLoadout(Storage.cleared(this.prog), slots);
    Sfx.click();
    this.paintSeeds();
  },

  sow() {
    Storage.saveLoadout(this.profile.id, this.picked);
    this.reload();
    if (this.endless) this.startEndless();
    else this.startLevel(this.levelIdx);
  },

  /* ---------------- playing ---------------- */

  startLevel(idx) {
    this.token++;
    this.levelIdx = idx;
    this.endless = false;
    const slots = slotsFor(this.prog.owned);
    const loadout = this.picked && this.picked.length ? this.picked : Storage.loadout(this.prog, slots);
    Game.start(LEVELS[idx], loadout, statsFor(this.prog.owned));
    this.enterGame();
  },

  startEndless() {
    this.token++;
    this.endless = true;
    const slots = slotsFor(this.prog.owned);
    const loadout = this.picked && this.picked.length ? this.picked : Storage.loadout(this.prog, slots);
    Game.start(Endless.level(), loadout, statsFor(this.prog.owned));
    this.enterGame();
  },

  enterGame() {
    // Nothing is pre-selected. Pre-arming the first packet sounds helpful and
    // is a trap: the how-to says "pick a seed packet, then tap a square", so
    // the player's first action is to tap that packet — which, if it was
    // already selected, silently turns it OFF and the next tap on the bed does
    // nothing at all.
    Render.sel = null;
    Render.banner = null;
    Render.floats = [];
    GK.Fx.reset();
    this.showScreen("game");
    Render.resize();
    Render._last = 0;
    this.buildTray();
    this.paintHud();
    if (!this.prog.seenHelp) {
      Game.paused = true;
      GK.UI.openModal("modal-help");
    }
  },

  buildTray() {
    const tray = this.el("tray");
    tray.innerHTML = Game.loadout.map((id) => {
      const p = PLANT_BY_ID[id];
      return `<button class="packet" data-id="${id}" onclick="App.pick('${id}')"
        aria-label="${GK.util.esc(p.name)}, costs ${p.cost} water">
        <span class="pk-ico">${p.icon}</span>
        <span class="pk-cost">${p.cost}</span>
        <span class="pk-cool"></span>
      </button>`;
    }).join("") +
      `<button class="packet shovel" data-id="shovel" onclick="App.pick('shovel')" aria-label="Shovel: dig a plant up">
        <span class="pk-ico">🥄</span><span class="pk-cost">dig</span><span class="pk-cool"></span>
      </button>`;
    this.paintTray();
  },

  pick(id) {
    Render.sel = Render.sel === id ? null : id;
    Sfx.click();
    this.paintTray();
  },

  paintTray() {
    for (const btn of document.querySelectorAll("#tray .packet")) {
      const id = btn.dataset.id;
      btn.classList.toggle("on", Render.sel === id);
      if (id === "shovel") continue;
      const ready = Game.canAfford(id);
      btn.classList.toggle("cant", !ready);
      // The cooldown sweep: a solid mask that retreats as the packet refills.
      btn.querySelector(".pk-cool").style.height = `${Math.round(Game.coolFrac(id) * 100)}%`;
    }
  },

  paintHud() {
    this.el("hud-water").textContent = Math.floor(Game.water);
    const lv = Game.level;
    this.el("hud-level").textContent = lv.endless ? "☀️ Long Summer" : `${lv.idx + 1}. ${lv.name}`;
    const total = lv.endless ? 0 : lv.waves.length;
    this.el("hud-wave").textContent = lv.endless
      ? `wave ${Game.waveIdx}`
      : `wave ${Math.min(Game.waveIdx, total)}/${total}`;
    const bar = this.el("wave-fill");
    if (bar) bar.style.width = total ? `${Math.min(100, (Game.waveIdx / total) * 100)}%` : "100%";
    const rally = this.el("btn-rally");
    if (rally) rally.disabled = !Game.canRally();
  },

  toggleSpeed() {
    Render.speed = Render.speed === 1 ? 2 : 1;
    const s = Storage.getSettings(); s.speed = Render.speed; Storage.saveSettings(s);
    this.el("btn-speed").textContent = Render.speed === 2 ? "⏩ 2×" : "▶️ 1×";
    Sfx.click();
  },

  rally() { if (Game.rally()) this.paintHud(); else Sfx.nope(); },

  pause() {
    if (!Game.running) return;
    Game.paused = true;
    GK.UI.openModal("modal-pause");
  },

  resume() {
    GK.UI.closeModal("modal-pause");
    GK.UI.closeModal("modal-help");
    Game.paused = false;
    Render._last = 0;         // don't hand the loop the whole paused gap as one dt
    if (!this.prog.seenHelp) {
      this.prog.seenHelp = true;
      Storage.saveProgress(this.profile.id, this.prog);
    }
  },

  quit() {
    this.token++;
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    Game.quit();
    this.showMap();
  },

  onEnd(result) {
    if (result.quit) return;
    const token = this.token;
    const later = (fn, ms) => setTimeout(() => { if (this.token === token) fn(); }, ms);

    if (result.endless) {
      Storage.recordEndless(this.profile.id, result.wave, result.coins);
    } else {
      Storage.recordResult(this.profile.id, result);
    }
    this.reload();
    if (result.win) Sfx.levelwin();
    later(() => this.showResults(result), 1100);
  },

  showResults(result) {
    this.showScreen("results");
    const win = result.win;
    this.el("res-emoji").textContent = result.endless ? "☀️" : win ? "🌻" : "🐌";
    this.el("res-title").textContent = result.endless
      ? `Wave ${result.wave}`
      : win ? "The patch is safe!" : "They got through";

    const stars = result.stars;
    this.el("res-stars").innerHTML = result.endless ? "" :
      [0, 1, 2].map((i) => `<span class="star${i < stars ? " on" : ""}">${i < stars ? "★" : "☆"}</span>`).join("");
    if (win && stars) for (let i = 0; i < stars; i++) setTimeout(() => Sfx.star(), 300 + i * 220);

    const bits = [];
    if (result.endless) {
      bits.push(`Survived <b>${result.wave}</b> wave${result.wave === 1 ? "" : "s"}`);
      if (result.wave > (this.prog.endlessBest || 0) - 1 && result.wave >= (this.prog.endlessBest || 0)) {
        bits.push("<b>🏅 New personal best</b>");
      }
    } else {
      bits.push(`Pests seen off: <b>${result.kills}</b>`);
      bits.push(`Plants lost: <b>${result.lost}</b>`);
      if (win && !result.endless) bits.push(`Three stars needs <b>${Game.level.ace}</b> or fewer`);
    }
    bits.push(`🪙 <b>+${result.coins}</b> coins`);
    this.el("res-detail").innerHTML = bits.join("<br>");

    // A newly unlocked plant is the best moment in the whole loop, so it gets
    // its own line rather than being left for the player to notice.
    const before = Storage.cleared(this.prog) - (win && !result.endless ? 1 : 0);
    const newly = PLANTS.filter((p) => p.unlock > before && p.unlock <= Storage.cleared(this.prog));
    const un = this.el("res-unlock");
    if (newly.length) {
      un.style.display = "";
      un.innerHTML = newly.map((p) => `<div class="unlock"><span>${p.icon}</span><div><b>${GK.util.esc(p.name)} unlocked</b><br>${GK.util.esc(p.blurb)}</div></div>`).join("");
      setTimeout(() => { Sfx.buy(); GK.Fx.confetti(Render.W, Render.H, ["#ffd34a", "#7ed957", "#5fc8f0"], 40); }, 700);
    } else un.style.display = "none";

    const next = this.el("res-next");
    const retry = this.el("res-retry");
    retry.textContent = result.endless ? "☀️ Again" : win ? "↻ Replay" : "↻ Try again";
    retry.onclick = () => (result.endless ? this.showEndless() : this.showSeeds(result.levelIdx));
    const hasNext = !result.endless && win && result.levelIdx + 1 < LEVELS.length;
    next.style.display = hasNext ? "" : "none";
    if (hasNext) {
      next.textContent = `▶ ${LEVELS[result.levelIdx + 1].name}`;
      next.onclick = () => this.showSeeds(result.levelIdx + 1);
    }
    this.el("res-finished").style.display =
      (!result.endless && win && result.levelIdx === LEVELS.length - 1) ? "" : "none";
  },

  /* ---------------- the shed ---------------- */

  showShop() {
    this.reload();
    this.showScreen("shop");
    this.paintShop();
  },

  paintShop() {
    this.el("shop-coins").textContent = `🪙 ${Storage.coins(this.prog)}`;
    const coins = Storage.coins(this.prog);
    this.el("shop-list").innerHTML = UPGRADES.map((u) => {
      const have = (this.prog.owned || {})[u.id] || 0;
      const tier = nextTier(this.prog.owned, u.id);
      const afford = tier && coins >= tier.cost;
      const pips = u.tiers.map((_, i) => `<span class="pip${i < have ? " on" : ""}"></span>`).join("");
      return `<div class="shopitem${tier ? "" : " maxed"}">
        <span class="shop-ico">${u.icon}</span>
        <div class="shop-body">
          <b>${GK.util.esc(u.name)}</b>
          <p>${GK.util.esc(u.desc)}</p>
          <span class="shop-now">${have ? `now: ${u.unit(u.tiers[have - 1].val)}` : "not bought yet"}</span>
          <div class="pips">${pips}</div>
        </div>
        ${tier
          ? `<button class="btn small ${afford ? "green" : "grey"}" ${afford ? "" : "disabled"}
               onclick="App.buy('${u.id}')"
               aria-label="Buy ${GK.util.esc(u.name)} for ${tier.cost} coins">
               🪙 ${tier.cost}<br><small>${u.unit(tier.val)}</small></button>`
          : `<span class="shop-max">✔ maxed</span>`}
      </div>`;
    }).join("");
  },

  buy(id) {
    const p = Storage.buy(this.profile.id, id);
    if (!p) { Sfx.nope(); return; }
    this.prog = p;
    Sfx.buy();
    GK.UI.toast(`${UPGRADE_BY_ID[id].icon} ${UPGRADE_BY_ID[id].name} improved`);
    this.paintShop();
  },

  /* ---------------- the almanac ---------------- */

  showAlmanac() {
    this.reload();
    this.showScreen("almanac");
    const cleared = Storage.cleared(this.prog);
    const open = unlockedPlants(cleared);
    const seen = new Set();
    LEVELS.slice(0, Math.max(1, unlockedLevel(this.prog) + 1))
      .forEach((l) => l.waves.forEach((w) => w.spawn.forEach(([id]) => seen.add(id))));

    this.el("almanac-plants").innerHTML = PLANTS.map((p) => {
      const locked = !open.includes(p.id);
      return `<div class="alm${locked ? " locked" : ""}">
        <span class="alm-ico">${locked ? "🔒" : p.icon}</span>
        <div><b>${locked ? "Not yet" : GK.util.esc(p.name)}</b>
        <p>${locked ? `Unlocks after ${p.unlock} levels.` : GK.util.esc(p.blurb)}</p>
        ${locked ? "" : `<span class="alm-stat">💧 ${p.cost} · ${p.cooldown}s regrow</span>`}</div></div>`;
    }).join("");

    this.el("almanac-pests").innerHTML = PESTS.filter((p) => !p.spawned).map((p) => {
      const locked = !seen.has(p.id);
      const counters = (COUNTERS[p.id] || []).map((c) => PLANT_BY_ID[c].icon).join(" ");
      return `<div class="alm${locked ? " locked" : ""}">
        <span class="alm-ico">${locked ? "❔" : p.icon}</span>
        <div><b>${locked ? "Not met yet" : GK.util.esc(p.name)}</b>
        <p>${locked ? "You will know it when you see it." : GK.util.esc(p.blurb)}</p>
        ${locked || !counters ? "" : `<span class="alm-stat">Beaten by ${counters}</span>`}</div></div>`;
    }).join("");
  },

  showLeaderboard() {
    this.showScreen("leaderboard");
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">☀️ wave ${r.progress.endlessBest || 0}</span>` +
                   `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.endlessBest || 0) - (a.progress.endlessBest || 0) ||
                      (Storage.totalStars(b.progress) - Storage.totalStars(a.progress)),
      meId: this.profile && this.profile.id,
      empty: "Nobody has braved the Long Summer yet.",
    });
  },

  showHelp() { GK.UI.closeModal("modal-pause"); GK.UI.openModal("modal-help"); },
};

// Init on DOMContentLoaded rather than at the bottom of <body>: a first render
// before layout settles resolves viewport-relative clamp() font sizes against
// the inherited value, and only on that first screen.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
