// The board: canvas painting, pointer input, and the frame loop.
//
// THE GARDEN RUNS TOP TO BOTTOM. A nine-by-five vegetable patch is a landscape
// shape, and this family plays on phones and iPads held portrait — so the five
// lanes run ACROSS the screen and the pests march DOWN it toward the gate at
// the bottom. Turned this way a lane is ~71px wide on a 375px phone, which is
// a comfortable thumb target; laid out landscape the same board gives 41px
// cells in a thin band with two thirds of the screen empty. The simulation
// neither knows nor cares: a lane is a lane.
//
// Everything here is drawing and input. The simulation is game.js and it has
// no idea this file exists, which is what lets the bots run the real engine.

const COLORS = {
  soilA: "#6b4a2f", soilB: "#795437",
  // The lane stripes have to be genuinely distinguishable — five lanes are
  // only readable at a glance because of them, and the first pair (#8a6b45 /
  // #7d6040) were so close together the board looked like one flat field.
  bedA: "#8e6f48", bedB: "#6d5133",
  rim: "#4a331f",
  stone: "#8d8b86", stoneHi: "#a8a6a0",
  sour: "#4b3f2c", sourHi: "#6a5a3e",
  hedge: "#2f5d33", hedgeHi: "#3f7a44",
  fence: "#b98a52", fenceHi: "#d8a969",
  leaf: "#4e9c46", leafHi: "#6fc463", leafDk: "#356b30",
  water: "#5fc8f0", waterHi: "#bdefff",
  ink: "#2a1d10",
  danger: "#d9534a",
};

const MAX_CELL = 86;

const Render = {
  running: false,
  speed: 1,
  showHelp: false,

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.querySelector(".game-stage");
    this.W = 360; this.H = 640; this.cell = 60;
    this.boardX = 0; this.boardY = 0;
    this.dpr = 1;

    this.sel = null;          // selected tray item: a plant id, or "shovel"
    this.press = null;        // { c, r } the finger is currently over
    this.banner = null;       // { text, sub, t, big }
    this.floats = [];         // small "+25" style numbers we draw ourselves
    this.shakeUntil = 0;
    this.time = 0;
    this._last = 0;

    this.bindInput();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => { this.resize(); setTimeout(() => this.resize(), 350); });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  },

  /* ---------------- geometry ---------------- */

  resize() {
    if (!this.stage) return;
    const box = this.stage.getBoundingClientRect();
    if (box.width < 50 || box.height < 50) return;      // hidden screen reads 0x0; keep the last good layout

    this.W = box.width; this.H = box.height;
    this.dpr = window.devicePixelRatio || 1;
    // Display size comes from the STYLESHEET (width/height 100%). Only the
    // backing store is set here, or the canvas renders at its attribute size
    // and overflows every retina screen by the device pixel ratio.
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Both gaps are RESERVED, not leftovers. The band above the board is the
    // hedge the pests come out of, and the band below is the fence carrying
    // one scarecrow marker per remaining save — which is the player's lives,
    // and the single most important number on the screen. Sizing the board to
    // whatever was left over gave it 97% of the stage and squeezed both out of
    // existence: the garden had no edges and the lives were invisible.
    const topGap = 34, botGap = 32;
    const cell = Math.min(this.W / ROWS, (this.H - topGap - botGap) / COLS, MAX_CELL);
    this.cell = cell;
    this.boardX = (this.W - cell * ROWS) / 2;
    // Anchored low rather than centred: spare height on a tall phone belongs
    // above the board, so the gate being defended sits near the thumb.
    this.boardY = topGap + (this.H - topGap - botGap - cell * COLS) * 0.72;
  },

  cellRect(c, r) {
    return { x: this.boardX + r * this.cell, y: this.boardY + (COLS - 1 - c) * this.cell, w: this.cell, h: this.cell };
  },
  laneCx(r) { return this.boardX + (r + 0.5) * this.cell; },
  depthY(x) { return this.boardY + (COLS - x) * this.cell; },

  // Screen point -> board cell, or null outside the patch.
  hitCell(px, py) {
    const r = Math.floor((px - this.boardX) / this.cell);
    const d = Math.floor((py - this.boardY) / this.cell);
    if (r < 0 || r >= ROWS || d < 0 || d >= COLS) return null;
    return { r, c: COLS - 1 - d };
  },

  /* ---------------- input ---------------- */

  bindInput() {
    const cv = this.cv;
    const at = (e) => {
      const b = cv.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };

    cv.addEventListener("pointerdown", (e) => {
      if (!Game.running || Game.paused) return;
      const [x, y] = at(e);
      // Set the gesture state BEFORE capturing: setPointerCapture throws
      // whenever the browser does not consider that pointer active, and the
      // throw would take the rest of this handler with it.
      if (this.tapDrop(x, y)) { this.press = null; return; }
      this.press = this.hitCell(x, y);
      try { cv.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();
    }, { passive: false });

    // Press-slide-lift: nothing commits until the finger comes up, so a
    // mis-aimed thumb costs a slide rather than 200 water in the wrong square.
    const move = (x, y) => { if (this.press) this.press = this.hitCell(x, y); };
    cv.addEventListener("pointermove", (e) => {
      // iOS reports pressure 0 for ordinary touch, so gating on pressure here
      // would silently drop every move of a real drag.
      if (e.pointerType === "touch" || e.buttons || e.pointerType === "mouse") {
        const [x, y] = at(e); move(x, y); e.preventDefault();
      }
    }, { passive: false });
    cv.addEventListener("touchmove", (e) => {
      const t = e.touches[0]; if (!t) return;
      const b = cv.getBoundingClientRect();
      move(t.clientX - b.left, t.clientY - b.top); e.preventDefault();
    }, { passive: false });

    cv.addEventListener("pointerup", (e) => {
      const cell = this.press; this.press = null;
      if (!cell || !Game.running || Game.paused) return;
      const [x, y] = at(e);
      const now = this.hitCell(x, y);
      if (!now || now.c !== cell.c || now.r !== cell.r) return;   // slid off; no move
      this.commit(now.c, now.r);
    });
    cv.addEventListener("pointercancel", () => { this.press = null; });
  },

  tapDrop(px, py) {
    for (let i = Game.drops.length - 1; i >= 0; i--) {
      const d = Game.drops[i];
      const sx = this.laneCx(Math.floor(d.c) === d.c ? d.c : d.c - 0.5);
      const p = this.dropPos(d);
      if (Math.hypot(px - p.x, py - p.y) <= this.cell * 0.42) {
        Game.collect(i);
        return true;
      }
    }
    return false;
  },

  dropPos(d) {
    // Drops bob gently where they were drawn up, and drift down a little as
    // they age so an old one is visibly on its way out.
    const age = DROP_LIFE - d.life;
    return {
      x: this.boardX + d.r * this.cell,
      y: this.depthY(d.c) + Math.sin(this.time * 3 + d.c * 2) * 3 + age * 2,
    };
  },

  commit(c, r) {
    if (this.sel === "shovel") {
      if (Game.dig(c, r)) Sfx.dig(); else Sfx.nope();
      return;
    }
    if (!this.sel) { Sfx.nope(); GK.UI.toast("Pick a seed packet first"); return; }
    const def = PLANT_BY_ID[this.sel];
    if (Game.plant(c, r, this.sel)) {
      Sfx.plant();
      App.paintTray();
      if (def.kind === "bomb") this.shake(4);
    } else {
      Sfx.nope();
      if (!Game.cellFree(c, r)) {
        if (Game.isStone(c, r)) GK.UI.toast("🪨 Nothing grows on stone");
        else if (Game.sour[r][c] > 0) GK.UI.toast("🍂 That ground is still sour");
        else GK.UI.toast("Something is already growing there");
      } else if (Game.water < def.cost) GK.UI.toast(`💧 ${def.cost} needed`);
      else GK.UI.toast(`${def.icon} still growing…`);
    }
  },

  shake(n) { GK.Fx.addShake(n); },

  /* ---------------- the loop ---------------- */

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    // Clamp BOTH ends. `Math.min(0.05, …)` alone caps a long pause but happily
    // passes a NEGATIVE dt through, and a timestamp that goes backwards is not
    // hypothetical: it happens whenever the clock source changes under the loop
    // (a resumed tab, a hand-driven frame loop in a test). The whole simulation
    // then runs in reverse — pests walk back up the garden and seed-packet
    // cooldowns count upward, so nothing can ever be planted again. Silent, and
    // it looked exactly like a renderer that had stopped drawing pests.
    const dt = this._last ? Math.max(0, Math.min(0.05, (t - this._last) / 1000)) : 0;
    this._last = t;
    if (!this.running) return;

    if (Game.paused) {
      // A pause has to stop everything AROUND the simulation too, or the
      // effects keep animating and sounds keep firing behind the sheet.
      this.render(0);
      return;
    }

    const sdt = dt * this.speed;
    Game.update(sdt);
    GK.Fx.update(sdt);
    this.time += dt;
    this.drain();
    this.stepFloats(sdt);
    this.render(dt);

    // A stage can resize with no resize event — a web font landing, a HUD row
    // appearing. Notice the drift here rather than hunting every cause.
    const b = this.stage.getBoundingClientRect();
    if (b.width > 50 && b.height > 50 && (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();
  },

  // The event queue is the ONLY channel between the simulation and everything
  // else, so it is drained here, inside the real loop — never by hand from a
  // test, or the wiring is exactly what goes untested.
  drain() {
    const evs = Game.events;
    if (!evs.length) return;
    Game.events = [];
    for (const ev of evs) this.onEvent(ev);
  },

  onEvent(ev) {
    switch (ev.type) {
      case "produce": Sfx.drip(); break;
      case "collect": {
        Sfx.splash();
        this.floats.push({ x: this.boardX + ev.r * this.cell, y: this.depthY(ev.c), t: 0, text: `+${ev.value}`, col: COLORS.waterHi });
        App.paintHud();
        break;
      }
      case "shoot":
        if (ev.kind === "seed") Sfx.shoot();
        else if (ev.kind === "lob") Sfx.lob();
        else if (ev.kind === "puff") Sfx.puff();
        else if (ev.kind === "thump") { Sfx.thump(); this.shake(2.5); }
        break;
      case "crack": Sfx.crack(); GK.Fx.burst(this.laneCx(ev.r), this.depthY(ev.x), "#e8e2d4", 10, 120, 0.5, 2.4); break;
      case "chew": Sfx.chew(); break;
      case "kill": {
        Sfx.pop();
        const p = PEST_BY_ID[ev.id];
        GK.Fx.burst(this.laneCx(ev.r), this.depthY(ev.x), p && p.air ? "#d8c48a" : "#7fae55", ev.boss ? 34 : 12, ev.boss ? 210 : 130, 0.6, ev.boss ? 4 : 2.6);
        if (ev.boss) { this.shake(9); GK.Fx.addFlash(0.35, "#fff3c4"); }
        break;
      }
      case "boom":
        Sfx.boom(); this.shake(11); GK.Fx.addFlash(0.5, "#ffd0a0");
        GK.Fx.burst(this.laneCx(ev.r), this.depthY(ev.c + 0.5), "#ff8b4a", 40, 260, 0.7, 4.4);
        break;
      case "burst": GK.Fx.burst(this.laneCx(ev.r), this.depthY(ev.x), "#ffd76a", 12, 150, 0.45, 2.8); break;
      case "eaten":
        this.floats.push({ x: this.laneCx(ev.r), y: this.depthY(ev.c + 0.5), t: 0, text: "lost", col: COLORS.danger });
        GK.Fx.burst(this.laneCx(ev.r), this.depthY(ev.c + 0.5), COLORS.leafDk, 14, 130, 0.5, 2.6);
        this.shake(3);
        break;
      case "scarecrow":
        Sfx.scarecrow(); this.shake(8); GK.Fx.addFlash(0.3, "#ffe9a8");
        this.setBanner("🧑‍🌾 Scarecrow!", ev.left > 0 ? "That row has one more." : "That row has none left.", true);
        break;
      case "breach": Sfx.breach(); this.shake(14); GK.Fx.addFlash(0.55, "#d9534a"); break;
      case "rally": Sfx.rally(); this.setBanner("📣 Wave called in", `+${ev.water} water`); App.paintHud(); break;
      case "wave":
        if (ev.boss) { Sfx.boss(); this.setBanner("👑 " + (Game.level.name || "Boss"), "Something enormous is coming", true); this.shake(6); }
        else if (ev.last) { Sfx.bigwave(); this.setBanner("🌊 Final wave!", "Hold the gate", true); }
        else { Sfx.wave(); this.setBanner(`Wave ${ev.n}${ev.total ? " of " + ev.total : ""}`, ""); }
        App.paintHud();
        break;
      case "dive": case "surface": this.shake(3); break;
      case "end": App.onEnd(ev.result); break;
    }
  },

  setBanner(text, sub, big) { this.banner = { text, sub: sub || "", t: 0, big: !!big }; },

  stepFloats(dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 1.1) this.floats.splice(i, 1);
    }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.4) this.banner = null; }
  },

  /* ---------------- painting ---------------- */

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    this.drawGround();

    const [shx, shy] = GK.Fx.shakeOffset();     // a TUPLE — reading .x gives NaN and silently kills the transform
    ctx.save();
    ctx.translate(shx, shy);

    this.drawBeds();
    this.drawHedge();
    this.drawFence();
    this.drawPreview();
    this.drawPlants();
    this.drawRings();
    this.drawPests();
    this.drawShots();
    this.drawDrops();
    GK.Fx.render(ctx);
    this.drawFloats();
    ctx.restore();

    this.drawBanner();
  },

  drawGround() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#3d6b39");
    g.addColorStop(0.28, "#4b7d41");
    g.addColorStop(1, "#39632f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // Scattered grass tufts outside the beds so the surround reads as the
    // rest of the garden rather than as empty space around a floating board.
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const h = GK.util.hash2(i, 3);
      const x = h * this.W;
      const y = GK.util.hash2(i, 9) * this.H;
      if (x > this.boardX - 6 && x < this.boardX + this.cell * ROWS + 6 &&
          y > this.boardY - 6 && y < this.boardY + this.cell * COLS + 6) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 2, y - 7, x + 5, y - 9);
      ctx.stroke();
    }
  },

  drawBeds() {
    const ctx = this.ctx, cell = this.cell;
    const bw = cell * ROWS, bh = cell * COLS;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    this.roundRect(this.boardX - 5, this.boardY - 5, bw + 10, bh + 10, 12);
    ctx.fillStyle = COLORS.rim; ctx.fill();
    ctx.restore();

    // Lane stripes: the alternating bands are what make five lanes readable
    // at a glance, which matters more here than in a game with one playfield.
    for (let r = 0; r < ROWS; r++) {
      ctx.fillStyle = r % 2 === 0 ? COLORS.bedA : COLORS.bedB;
      ctx.fillRect(this.boardX + r * cell, this.boardY, cell, bh);
    }

    // Soil texture: fixed per cell via hash2 so it never shimmers frame to frame.
    ctx.fillStyle = "rgba(0,0,0,.07)";
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const rc = this.cellRect(c, r);
        for (let i = 0; i < 5; i++) {
          const hx = GK.util.hash2(r * 31 + c, i * 7 + 1);
          const hy = GK.util.hash2(c * 17 + r, i * 5 + 3);
          ctx.fillRect(rc.x + hx * (cell - 6) + 3, rc.y + hy * (cell - 6) + 3, 3, 2);
        }
      }
    }

    ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(this.boardX + r * cell, this.boardY);
      ctx.lineTo(this.boardX + r * cell, this.boardY + bh); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(this.boardX, this.boardY + c * cell);
      ctx.lineTo(this.boardX + bw, this.boardY + c * cell); ctx.stroke();
    }

    // Stone and sour squares.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const rc = this.cellRect(c, r);
        if (Game.isStone(c, r)) this.drawStone(rc);
        else if (Game.sour[r][c] > 0) this.drawSour(rc, Game.sour[r][c]);
      }
    }
  },

  drawStone(rc) {
    const ctx = this.ctx, m = rc.w * 0.07;
    ctx.save();
    this.roundRect(rc.x + m, rc.y + m, rc.w - m * 2, rc.h - m * 2, 8);
    const g = ctx.createLinearGradient(rc.x, rc.y, rc.x, rc.y + rc.h);
    g.addColorStop(0, COLORS.stoneHi); g.addColorStop(1, COLORS.stone);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.beginPath(); ctx.ellipse(rc.x + rc.w * 0.36, rc.y + rc.h * 0.6, rc.w * 0.13, rc.h * 0.09, 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rc.x + rc.w * 0.66, rc.y + rc.h * 0.38, rc.w * 0.09, rc.h * 0.07, -0.3, 0, 7); ctx.fill();
    ctx.restore();
  },

  drawSour(rc, left) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.min(1, left / SOUR_SECS);
    ctx.fillStyle = COLORS.sour;
    ctx.fillRect(rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2);
    ctx.globalAlpha = 1;
    // Curled leaves, so "sour" reads as compost rather than as a shadow.
    ctx.strokeStyle = COLORS.sourHi; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = rc.x + rc.w * (0.25 + i * 0.25), y = rc.y + rc.h * (0.35 + (i % 2) * 0.3);
      ctx.beginPath(); ctx.arc(x, y, rc.w * 0.1, 0.6, 4.2); ctx.stroke();
    }
    ctx.restore();
  },

  drawHedge() {
    const ctx = this.ctx;
    const y = this.boardY - 6;
    ctx.save();
    ctx.fillStyle = COLORS.hedge;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(this.W, 0); ctx.lineTo(this.W, y);
    // A bumpy hedge line rather than a straight edge — this is where the
    // pests come from, so it wants to look like somewhere they came from.
    for (let x = this.W; x >= 0; x -= 14) {
      ctx.lineTo(x, y - 5 - Math.sin(x * 0.09) * 4 - GK.util.hash2(Math.round(x), 5) * 5);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.hedgeHi;
    for (let i = 0; i < 46; i++) {
      const x = GK.util.hash2(i, 11) * this.W;
      const yy = y - 4 - GK.util.hash2(i, 13) * Math.max(6, y * 0.5);
      if (yy < 0) continue;
      ctx.beginPath(); ctx.ellipse(x, yy, 6, 4, GK.util.hash2(i, 17) * 3, 0, 7); ctx.fill();
    }
    ctx.restore();
  },

  drawFence() {
    const ctx = this.ctx, cell = this.cell;
    const y = this.boardY + cell * COLS + 4;
    ctx.save();
    ctx.fillStyle = COLORS.fence;
    ctx.fillRect(this.boardX - 6, y, cell * ROWS + 12, 9);
    ctx.fillStyle = COLORS.fenceHi;
    ctx.fillRect(this.boardX - 6, y, cell * ROWS + 12, 3);

    // One scarecrow marker per lane per remaining save. This is the clearest
    // statement of "how much trouble is this row in" on the whole screen.
    for (let r = 0; r < ROWS; r++) {
      const n = Game.scarecrows[r] || 0;
      const cx = this.laneCx(r);
      const size = Math.min(20, Math.round(cell * 0.26));
      for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * (size - 2);
        ctx.font = `${size}px 'Baloo 2', sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.globalAlpha = 0.95;
        ctx.fillText("🧑‍🌾", x, y + 9);
      }
      // A spent lane pulses red. This is the clearest "you are in trouble
      // here" the game has, and it is the only thing that says the NEXT pest
      // down this row ends the level.
      if (n === 0) {
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 5);
        ctx.fillStyle = COLORS.danger;
        this.roundRect(cx - cell * 0.3, y + 12, cell * 0.6, 6, 3); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },

  // A translucent ghost of what the finger is about to plant, plus the lane
  // it lands in. Showing the outcome before it commits is what makes
  // press-slide-lift worth having.
  drawPreview() {
    if (!this.press || !this.sel) return;
    const ctx = this.ctx;
    const { c, r } = this.press;
    const rc = this.cellRect(c, r);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(this.boardX + r * this.cell, this.boardY, this.cell, this.cell * COLS);
    ctx.restore();

    const ok = this.sel === "shovel" ? !!Game.grid[r][c] : (Game.cellFree(c, r) && Game.canAfford(this.sel));
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? "#ffe9a8" : COLORS.danger;
    this.roundRect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4, 9);
    ctx.stroke();
    if (this.sel !== "shovel" && ok) {
      ctx.globalAlpha = 0.45;
      this.drawPlantArt(PLANT_BY_ID[this.sel], rc, 1, 0);
    } else if (this.sel === "shovel") {
      ctx.globalAlpha = 0.8;
      ctx.font = `${Math.round(rc.w * 0.5)}px 'Baloo 2', sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🥄", rc.x + rc.w / 2, rc.y + rc.h / 2);
    }
    ctx.restore();
  },

  drawPlants() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = Game.grid[r][c];
        if (!p) continue;
        const rc = this.cellRect(c, r);
        const health = p.hp / p.maxHp;
        const sway = Math.sin(this.time * 1.6 + c * 0.7 + r * 1.3) * 0.05;
        const pop = Math.min(1, (this.time * 60 - 0) / 1);
        this.ctx.save();
        this.drawPlantArt(p.def, rc, health, sway, p);
        this.ctx.restore();
        if (health < 0.999) this.drawBar(rc, health, "#7ed957");
      }
    }
  },

  // One painter, switched on `kind` plus the plant's own id for the details.
  // Everything is drawn from the bottom of the square upward so a plant sits
  // ON its soil rather than floating in the middle of it.
  drawPlantArt(def, rc, health, sway, inst) {
    const ctx = this.ctx;
    const cx = rc.x + rc.w / 2, base = rc.y + rc.h * 0.86, s = rc.w;
    const droop = 1 - (1 - health) * 0.35;

    ctx.save();
    ctx.translate(cx, base);
    ctx.rotate(sway * droop);
    ctx.scale(droop, droop);

    // Shadow on the soil under everything.
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(0, 2, s * 0.26, s * 0.08, 0, 0, 7); ctx.fill();

    const leaf = (dx, dy, w, h, rot, col) => {
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(rot);
      ctx.fillStyle = col || COLORS.leaf;
      ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, 7); ctx.fill();
      ctx.restore();
    };
    const stem = (h, w) => {
      ctx.strokeStyle = COLORS.leafDk; ctx.lineWidth = w || s * 0.06;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
    };

    switch (def.id) {
      case "wellspring": {
        stem(s * 0.3);
        leaf(-s * 0.2, -s * 0.16, s * 0.16, s * 0.09, -0.5);
        leaf(s * 0.2, -s * 0.16, s * 0.16, s * 0.09, 0.5);
        // A cupped bloom holding a bead of water — the icon of the economy.
        ctx.fillStyle = "#f6d861";
        ctx.beginPath(); ctx.arc(0, -s * 0.42, s * 0.2, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#e8c23f";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.42, s * 0.2, s * 0.06, 0, 0, 7); ctx.fill();
        const bob = Math.sin(this.time * 3) * s * 0.02;
        ctx.fillStyle = COLORS.water;
        ctx.beginPath(); ctx.arc(0, -s * 0.46 + bob, s * 0.09, 0, 7); ctx.fill();
        ctx.fillStyle = COLORS.waterHi;
        ctx.beginPath(); ctx.arc(-s * 0.03, -s * 0.49 + bob, s * 0.03, 0, 7); ctx.fill();
        break;
      }
      case "nettle": {
        for (let i = -1; i <= 1; i++) {
          ctx.save(); ctx.rotate(i * 0.45);
          ctx.fillStyle = i === 0 ? COLORS.leafHi : COLORS.leaf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-s * 0.11, -s * 0.3);
          ctx.lineTo(0, -s * 0.24);
          ctx.lineTo(s * 0.11, -s * 0.3);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "bramble": {
        // A woody knot: reads as "this does not move" at a glance.
        ctx.fillStyle = "#6b4a30";
        this.roundRect(-s * 0.28, -s * 0.56, s * 0.56, s * 0.56, s * 0.14); ctx.fill();
        ctx.fillStyle = "#805937";
        this.roundRect(-s * 0.24, -s * 0.52, s * 0.48, s * 0.3, s * 0.11); ctx.fill();
        ctx.strokeStyle = "#4d3421"; ctx.lineWidth = s * 0.035;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * s * 0.15, -s * 0.5); ctx.lineTo(i * s * 0.15, -s * 0.06); ctx.stroke();
        }
        leaf(-s * 0.26, -s * 0.5, s * 0.11, s * 0.06, -0.7, COLORS.leafDk);
        leaf(s * 0.26, -s * 0.44, s * 0.11, s * 0.06, 0.7, COLORS.leafDk);
        break;
      }
      case "peppershot": case "twinshot": {
        stem(s * 0.26);
        leaf(-s * 0.22, -s * 0.14, s * 0.15, s * 0.08, -0.55);
        leaf(s * 0.22, -s * 0.14, s * 0.15, s * 0.08, 0.55);
        const heads = def.id === "twinshot" ? [-s * 0.13, s * 0.13] : [0];
        for (const hx of heads) {
          ctx.fillStyle = "#d94f3d";
          ctx.beginPath(); ctx.ellipse(hx, -s * 0.4, s * 0.13, s * 0.17, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#ee7059";
          ctx.beginPath(); ctx.ellipse(hx - s * 0.04, -s * 0.44, s * 0.05, s * 0.08, 0, 0, 7); ctx.fill();
          // The muzzle points UP the board, toward where the pests come from.
          ctx.fillStyle = "#8f2f22";
          ctx.beginPath(); ctx.ellipse(hx, -s * 0.56, s * 0.05, s * 0.04, 0, 0, 7); ctx.fill();
        }
        break;
      }
      case "dandelion": {
        stem(s * 0.44, s * 0.05);
        ctx.fillStyle = "#f2f0e4";
        ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.18, 0, 7); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + this.time * 0.4;
          ctx.beginPath(); ctx.moveTo(0, -s * 0.5);
          ctx.lineTo(Math.cos(a) * s * 0.25, -s * 0.5 + Math.sin(a) * s * 0.25); ctx.stroke();
        }
        break;
      }
      case "thumper": {
        ctx.fillStyle = "#7a5230";
        this.roundRect(-s * 0.26, -s * 0.42, s * 0.52, s * 0.42, s * 0.1); ctx.fill();
        ctx.fillStyle = "#c8a06a";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.42, s * 0.26, s * 0.08, 0, 0, 7); ctx.fill();
        // The mallet lifts as the thump comes round.
        const lift = inst ? Math.max(0, 1 - (inst.timer / (def.every || 1))) : 0.5;
        ctx.save(); ctx.translate(s * 0.2, -s * 0.5); ctx.rotate(-0.6 - lift * 0.7);
        ctx.strokeStyle = "#5d3f26"; ctx.lineWidth = s * 0.06;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.26); ctx.stroke();
        ctx.fillStyle = "#4e5a63";
        this.roundRect(-s * 0.09, -s * 0.36, s * 0.18, s * 0.13, s * 0.04); ctx.fill();
        ctx.restore();
        break;
      }
      case "ivynet": {
        ctx.strokeStyle = COLORS.leafDk; ctx.lineWidth = s * 0.035;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * s * 0.13, 0);
          ctx.quadraticCurveTo(i * s * 0.2, -s * 0.3, i * s * 0.1, -s * 0.52);
          ctx.stroke();
        }
        for (let i = -2; i <= 2; i++) leaf(i * s * 0.13, -s * 0.3 - (i % 2) * s * 0.12, s * 0.08, s * 0.05, i * 0.4, COLORS.leafHi);
        ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.14 - i * s * 0.16);
          ctx.lineTo(s * 0.28, -s * 0.2 - i * s * 0.16); ctx.stroke();
        }
        break;
      }
      case "marigold": {
        stem(s * 0.3);
        leaf(-s * 0.22, -s * 0.14, s * 0.14, s * 0.07, -0.5);
        leaf(s * 0.22, -s * 0.14, s * 0.14, s * 0.07, 0.5);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.fillStyle = i % 2 ? "#f0a63c" : "#ffc558";
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * s * 0.14, -s * 0.44 + Math.sin(a) * s * 0.14, s * 0.1, s * 0.07, a, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = "#8a4b1c";
        ctx.beginPath(); ctx.arc(0, -s * 0.44, s * 0.08, 0, 7); ctx.fill();
        break;
      }
      case "beetroot": {
        const fuse = inst ? Math.max(0, inst.timer / (def.fuse || 1)) : 1;
        const puff = 1 + (1 - fuse) * 0.25;
        ctx.scale(puff, puff);
        ctx.fillStyle = "#a32d55";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.26, s * 0.24, s * 0.26, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#c04670";
        ctx.beginPath(); ctx.ellipse(-s * 0.07, -s * 0.32, s * 0.08, s * 0.1, 0, 0, 7); ctx.fill();
        leaf(-s * 0.14, -s * 0.5, s * 0.1, s * 0.16, -0.5, COLORS.leafHi);
        leaf(s * 0.14, -s * 0.5, s * 0.1, s * 0.16, 0.5, COLORS.leafHi);
        if (inst) {
          ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 16));
          ctx.fillStyle = "#ffef9f";
          ctx.beginPath(); ctx.arc(0, -s * 0.26, s * 0.1, 0, 7); ctx.fill();
        }
        break;
      }
      default: {
        stem(s * 0.3);
        leaf(-s * 0.2, -s * 0.2, s * 0.16, s * 0.09, -0.5);
        leaf(s * 0.2, -s * 0.2, s * 0.16, s * 0.09, 0.5);
      }
    }
    ctx.restore();
  },

  drawPests() {
    const ctx = this.ctx;
    // Painted in board order so something nearer the gate overlaps what is
    // behind it, which is the only depth cue a top-down board gets.
    const list = Game.pests.slice().sort((a, b) => a.x - b.x);
    for (const p of list) {
      const x = this.laneCx(p.r);
      const y = this.depthY(p.x);
      if (y < -this.cell || y > this.H + this.cell) continue;
      const s = this.cell * (p.boss ? 1.35 : 0.78);
      const walk = Math.sin(this.time * (p.eating ? 14 : 7) + p.r * 2 + p.x);

      ctx.save();
      ctx.translate(x, y);

      if (p.state === "under" || p.state === "dive") {
        // A travelling mound of earth. It has to be visible or a burrower
        // arriving behind the line reads as a bug rather than a mechanic.
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.beginPath(); ctx.ellipse(0, 0, s * 0.4, s * 0.22, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#7b5836";
        ctx.beginPath(); ctx.ellipse(0, -2 + walk * 1.5, s * 0.34, s * 0.18, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#966c43";
        ctx.beginPath(); ctx.ellipse(0, -4 + walk * 1.5, s * 0.24, s * 0.11, 0, 0, 7); ctx.fill();
        ctx.restore();
        continue;
      }

      const fly = p.def.air ? -this.cell * 0.3 - Math.sin(this.time * 4 + p.r) * 3 : 0;
      ctx.fillStyle = "rgba(0,0,0,.24)";
      ctx.beginPath(); ctx.ellipse(0, 3, s * 0.3, s * 0.11, 0, 0, 7); ctx.fill();
      ctx.translate(0, fly);
      if (p.hurtT > 0) { ctx.globalAlpha = 0.65; }

      this.drawPestArt(p, s, walk);

      ctx.restore();

      // Health above the head, only once something has actually hurt it.
      const full = p.hp >= p.maxHp && p.armour >= p.maxArmour;
      if (!full) {
        const w = s * 0.62;
        const bx = x - w / 2, by = y + fly - s * (p.boss ? 0.75 : 0.62);
        ctx.fillStyle = "rgba(0,0,0,.4)"; this.roundRect(bx - 1, by - 1, w + 2, 6, 3); ctx.fill();
        ctx.fillStyle = "#d9534a"; this.roundRect(bx, by, w * Math.max(0, p.hp / p.maxHp), 4, 2); ctx.fill();
        if (p.maxArmour > 0 && p.armour > 0) {
          ctx.fillStyle = "#cfd6dd";
          this.roundRect(bx, by - 5, w * (p.armour / p.maxArmour), 3, 1.5); ctx.fill();
        }
      }
    }
  },

  drawPestArt(p, s, walk) {
    const ctx = this.ctx;
    const def = p.def;
    const body = (col, rx, ry) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, s * rx, s * ry, 0, 0, 7); ctx.fill();
    };
    const eyes = (dx, dy, rr) => {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-dx, dy, rr, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(dx, dy, rr, 0, 7); ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath(); ctx.arc(-dx, dy + rr * 0.25, rr * 0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(dx, dy + rr * 0.25, rr * 0.5, 0, 7); ctx.fill();
    };
    const legs = (n, col) => {
      ctx.strokeStyle = col || "#3c2b18"; ctx.lineWidth = Math.max(1.5, s * 0.045);
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) - 0.5;
        const ph = Math.sin(this.time * 9 + i * 1.4) * s * 0.06;
        ctx.beginPath();
        ctx.moveTo(t * s * 0.42, 0);
        ctx.lineTo(t * s * 0.6, s * 0.2 + ph);
        ctx.stroke();
      }
    };
    const wings = () => {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#dcefff";
      const f = Math.sin(this.time * 26) * 0.5;
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.translate(sgn * s * 0.2, -s * 0.1); ctx.rotate(sgn * (0.5 + f));
        ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.12, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };

    switch (def.id) {
      case "slug":
        body("#9a7fb8", 0.3, 0.22);
        ctx.fillStyle = "#b295d0";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.22, s * 0.13, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#7d64a0"; ctx.lineWidth = 2;
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sgn * s * 0.08, s * 0.16);
          ctx.lineTo(sgn * s * 0.12, s * 0.3); ctx.stroke();
        }
        eyes(s * 0.09, s * 0.16, s * 0.055);
        break;
      case "aphid":
        body("#8fd07a", 0.2, 0.18);
        eyes(s * 0.06, s * 0.06, s * 0.04);
        legs(4, "#4a7a3a");
        break;
      case "beetle":
        legs(6);
        body("#4a3f6b", 0.28, 0.24);
        ctx.fillStyle = "#655694";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.02, s * 0.24, s * 0.18, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#2e2647"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.2); ctx.stroke();
        eyes(s * 0.1, s * 0.18, s * 0.05);
        break;
      case "snail":
        body("#c8a878", 0.3, 0.2);
        eyes(s * 0.1, s * 0.2, s * 0.05);
        if (p.armour > 0) {
          ctx.fillStyle = "#a9743f";
          ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.26, 0, 7); ctx.fill();
          ctx.strokeStyle = "#7d5228"; ctx.lineWidth = Math.max(2, s * 0.05);
          ctx.beginPath();
          for (let a = 0; a < 10; a += 0.2) {
            const rr = s * 0.04 + a * s * 0.024;
            const px = Math.cos(a) * rr, py = -s * 0.05 + Math.sin(a) * rr;
            a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else {
          ctx.fillStyle = "#8e6a4a";
          ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.14, 0, 7); ctx.fill();
        }
        break;
      case "weevil":
        legs(6);
        body("#5c4633", 0.28, 0.23);
        if (p.armour > 0) {
          ctx.fillStyle = "#8c9196";
          this.roundRect(-s * 0.26, -s * 0.22, s * 0.52, s * 0.34, s * 0.08); ctx.fill();
          ctx.fillStyle = "#aab0b6";
          this.roundRect(-s * 0.22, -s * 0.19, s * 0.44, s * 0.12, s * 0.05); ctx.fill();
        }
        ctx.strokeStyle = "#3c2b18"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, s * 0.2); ctx.lineTo(0, s * 0.34); ctx.stroke();
        eyes(s * 0.09, s * 0.2, s * 0.045);
        break;
      case "wasp": case "queenwasp":
        wings();
        body("#f0c33c", 0.24, 0.2);
        ctx.fillStyle = "#2c2418";
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(0, i * s * 0.09, s * 0.24 * (1 - Math.abs(i) * 0.2), s * 0.035, 0, 0, 7);
          ctx.fill();
        }
        eyes(s * 0.08, s * 0.16, s * 0.045);
        if (def.id === "queenwasp") {
          ctx.fillStyle = "#ffd94a";
          ctx.beginPath();
          ctx.moveTo(-s * 0.16, -s * 0.2); ctx.lineTo(-s * 0.1, -s * 0.34);
          ctx.lineTo(0, -s * 0.22); ctx.lineTo(s * 0.1, -s * 0.34);
          ctx.lineTo(s * 0.16, -s * 0.2); ctx.closePath(); ctx.fill();
        }
        break;
      case "crow":
        wings();
        body("#2f3440", 0.28, 0.22);
        ctx.fillStyle = "#1e222b";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.04, s * 0.2, s * 0.15, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#e0a13c";
        ctx.beginPath();
        ctx.moveTo(-s * 0.05, s * 0.2); ctx.lineTo(s * 0.05, s * 0.2); ctx.lineTo(0, s * 0.34);
        ctx.closePath(); ctx.fill();
        eyes(s * 0.09, s * 0.1, s * 0.045);
        break;
      case "mole": case "moleking":
        body("#6a5442", 0.3, 0.25);
        ctx.fillStyle = "#8a7059";
        ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.22, s * 0.17, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#e0a7b0";
        ctx.beginPath(); ctx.ellipse(0, s * 0.22, s * 0.07, s * 0.05, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#efe6d8";
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sgn * s * 0.2, s * 0.06); ctx.lineTo(sgn * s * 0.34, s * 0.16);
          ctx.lineTo(sgn * s * 0.2, s * 0.18); ctx.closePath(); ctx.fill();
        }
        eyes(s * 0.08, s * 0.12, s * 0.035);
        break;
      case "clump":
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + this.time * 0.6;
          ctx.fillStyle = i % 2 ? "#7ec267" : "#96d47f";
          ctx.beginPath();
          ctx.arc(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.12, s * 0.13, 0, 7);
          ctx.fill();
        }
        eyes(s * 0.08, s * 0.02, s * 0.045);
        break;
      case "caterpillar": {
        // Segments trailing back UP the board, so a long body reads as
        // something slow rather than as something big.
        for (let i = 4; i >= 0; i--) {
          const off = -i * s * 0.2;
          const wob = Math.sin(this.time * 6 - i * 0.7) * s * 0.05;
          ctx.fillStyle = i % 2 ? "#8ab84a" : "#a2ce5c";
          ctx.beginPath(); ctx.arc(wob, off, s * (0.2 - i * 0.012), 0, 7); ctx.fill();
        }
        eyes(s * 0.08, s * 0.06, s * 0.05);
        ctx.strokeStyle = "#5f7f2e"; ctx.lineWidth = 2;
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sgn * s * 0.08, -s * 0.14);
          ctx.lineTo(sgn * s * 0.14, -s * 0.26); ctx.stroke();
        }
        break;
      }
      case "slimeking":
        ctx.fillStyle = "rgba(150,220,150,.3)";
        ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.44, s * 0.2, 0, 0, 7); ctx.fill();
        body("#7fae55", 0.4, 0.3);
        ctx.fillStyle = "#9dcb6e";
        ctx.beginPath(); ctx.ellipse(0, -s * 0.06, s * 0.32, s * 0.2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#5c8038"; ctx.lineWidth = 3;
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sgn * s * 0.1, s * 0.22);
          ctx.lineTo(sgn * s * 0.16, s * 0.4); ctx.stroke();
        }
        eyes(s * 0.13, s * 0.22, s * 0.07);
        this.crown(s);
        break;
      case "titan": case "titanling":
        body("#5f7d4a", 0.34, 0.3);
        ctx.strokeStyle = "#425c33"; ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.26);
          ctx.lineTo(Math.cos(a) * s * 0.44, Math.sin(a) * s * 0.4);
          ctx.stroke();
        }
        if (p.armour > 0) {
          ctx.fillStyle = "rgba(180,190,200,.85)";
          ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill();
        }
        ctx.fillStyle = "#8f5fa8";
        ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.11, 0, 7); ctx.fill();
        eyes(s * 0.11, s * 0.04, s * 0.06);
        if (def.id === "titan") this.crown(s);
        break;
      default:
        body("#8a7a5a", 0.28, 0.22);
        eyes(s * 0.09, s * 0.12, s * 0.05);
    }
  },

  crown(s) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffd34a";
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.3);
    ctx.lineTo(-s * 0.13, -s * 0.46); ctx.lineTo(-s * 0.05, -s * 0.32);
    ctx.lineTo(s * 0.05, -s * 0.46); ctx.lineTo(s * 0.13, -s * 0.32);
    ctx.lineTo(s * 0.2, -s * 0.46); ctx.lineTo(s * 0.22, -s * 0.28);
    ctx.closePath(); ctx.fill();
  },

  drawShots() {
    const ctx = this.ctx;
    for (const s of Game.shots) {
      if (s.delay > 0) continue;
      const x = this.laneCx(s.r), y = this.depthY(s.x);
      ctx.save();
      if (s.kind === "lob") {
        // An arc drawn as a rising-then-falling offset, so a lobbed shot
        // visibly goes over things rather than through them.
        ctx.fillStyle = "#ffbe4d";
        ctx.beginPath(); ctx.arc(x, y, this.cell * 0.13, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.beginPath(); ctx.arc(x - 2, y - 2, this.cell * 0.05, 0, 7); ctx.fill();
      } else if (s.kind === "puff") {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = "#f4f2e6";
        ctx.beginPath(); ctx.arc(x, y, this.cell * 0.11, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, this.cell * 0.17, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,190,90,.35)";
        ctx.beginPath(); ctx.ellipse(x, y + this.cell * 0.12, this.cell * 0.05, this.cell * 0.12, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#ffcf5f";
        ctx.beginPath(); ctx.arc(x, y, this.cell * 0.075, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath(); ctx.arc(x - 1, y - 1, this.cell * 0.032, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  },

  drawRings() {
    const ctx = this.ctx;
    for (const r of Game.rings) {
      const k = r.t / 0.4;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = "#e8c98a";
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(this.laneCx(r.r), this.depthY(r.c), this.cell * 0.2 + k * this.cell * 0.9,
                  this.cell * 0.12 + k * this.cell * 0.5, 0, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawDrops() {
    const ctx = this.ctx;
    for (const d of Game.drops) {
      const p = this.dropPos(d);
      const fading = d.life < 1.2;
      ctx.save();
      ctx.globalAlpha = fading ? 0.4 + 0.6 * Math.abs(Math.sin(this.time * 9)) : 1;
      const r = this.cell * 0.2;
      // A proper droplet: round bottom, pointed top, one highlight.
      ctx.fillStyle = COLORS.water;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * 1.5);
      ctx.quadraticCurveTo(p.x + r, p.y - r * 0.2, p.x + r * 0.72, p.y + r * 0.5);
      ctx.arc(p.x, p.y + r * 0.35, r * 0.85, 0.5, Math.PI - 0.5);
      ctx.quadraticCurveTo(p.x - r, p.y - r * 0.2, p.x, p.y - r * 1.5);
      ctx.fill();
      ctx.fillStyle = COLORS.waterHi;
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, p.y + r * 0.1, r * 0.22, r * 0.32, -0.3, 0, 7); ctx.fill();
      ctx.restore();
    }
  },

  drawFloats() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const f of this.floats) {
      const k = f.t / 1.1;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${Math.round(this.cell * 0.3)}px 'Baloo 2', sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.strokeText(f.text, f.x, f.y - k * 34);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, f.x, f.y - k * 34);
    }
    ctx.restore();
  },

  drawBanner() {
    if (!this.banner) return;
    const ctx = this.ctx, b = this.banner;
    // Slides in, holds, slides out — computed from its own age so a frozen
    // rAF cannot strand it half-open.
    const k = b.t < 0.25 ? b.t / 0.25 : b.t > 2.0 ? 1 - (b.t - 2.0) / 0.4 : 1;
    const ease = Math.max(0, Math.min(1, k));
    const h = b.big ? 74 : 54;
    const y = this.H * 0.3;

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(0, (1 - ease) * -26);
    ctx.fillStyle = b.big ? "rgba(120,28,28,.9)" : "rgba(32,44,26,.86)";
    ctx.fillRect(0, y, this.W, h);
    ctx.fillStyle = b.big ? "#ffd34a" : "#cfe6b4";
    ctx.fillRect(0, y, this.W, 3);
    ctx.fillRect(0, y + h - 3, this.W, 3);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff8e6";
    ctx.font = `800 ${b.big ? 26 : 21}px 'Baloo 2', sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(b.text, this.W / 2, y + (b.sub ? h * 0.36 : h * 0.5));
    if (b.sub) {
      ctx.font = "600 14px 'Baloo 2', sans-serif";
      ctx.fillStyle = "#e8dfc8";
      ctx.fillText(b.sub, this.W / 2, y + h * 0.72);
    }
    ctx.restore();
  },

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  drawBar(rc, frac, col) {
    const ctx = this.ctx;
    const w = rc.w * 0.62, x = rc.x + (rc.w - w) / 2, y = rc.y + rc.h * 0.94;
    ctx.fillStyle = "rgba(0,0,0,.4)"; this.roundRect(x - 1, y - 1, w + 2, 5, 2.5); ctx.fill();
    ctx.fillStyle = col; this.roundRect(x, y, w * Math.max(0, frac), 3, 1.5); ctx.fill();
  },
};
