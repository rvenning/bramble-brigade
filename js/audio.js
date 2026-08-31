// Sound. Everything is synthesized through GK.Sfx — no audio files, so the
// whole game stays a handful of scripts and works offline from the first load.
//
// The palette is deliberately soft and woody: this is a garden at the height
// of summer, not a shooter. Anything that fires is a short plucked note rather
// than a bang, and the only harsh sound in the game is the Beetroot Bomb,
// which is the point of it.

const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // Putting a plant in the ground: a soft double-thud, like a trowel.
  plant() {
    this.tone({ freq: 190, type: "sine", dur: 0.09, vol: 0.16, slide: 60 });
    this.noise({ dur: 0.07, vol: 0.05, when: 0.03 });
  },
  dig() {
    this.noise({ dur: 0.11, vol: 0.07 });
    this.tone({ freq: 150, type: "sine", dur: 0.1, vol: 0.11, slide: -50 });
  },
  // Water. Two quick rising notes — the sound the whole economy runs on, so
  // it wants to be the most pleasant thing in the game.
  drip() {
    this.tone({ freq: 720, type: "sine", dur: 0.07, vol: 0.13, slide: 300 });
  },
  splash() {
    this.tone({ freq: 540, type: "sine", dur: 0.09, vol: 0.15, slide: 420 });
    this.tone({ freq: 810, type: "sine", dur: 0.11, vol: 0.09, when: 0.05, slide: 240 });
  },

  shoot() { this.tone({ freq: 620, type: "triangle", dur: 0.05, vol: 0.07, slide: -160 }); },
  lob()   { this.tone({ freq: 330, type: "sine", dur: 0.13, vol: 0.09, slide: 190 }); },
  puff()  { this.noise({ dur: 0.09, vol: 0.045 }); this.tone({ freq: 900, type: "sine", dur: 0.08, vol: 0.05, slide: 260 }); },
  thump() {
    this.tone({ freq: 110, type: "sine", dur: 0.16, vol: 0.2, slide: -55 });
    this.noise({ dur: 0.09, vol: 0.07 });
  },
  // A shell giving way — the moment a Thumper pays for itself.
  crack() {
    this.noise({ dur: 0.07, vol: 0.11 });
    this.tone({ freq: 1300, type: "square", dur: 0.05, vol: 0.05, slide: -700 });
  },
  chew()  { this.noise({ dur: 0.06, vol: 0.055 }); },
  pop()   { this.tone({ freq: 400, type: "triangle", dur: 0.08, vol: 0.1, slide: -220 }); },

  boom() {
    this.noise({ dur: 0.42, vol: 0.28 });
    this.tone({ freq: 130, type: "sawtooth", dur: 0.36, vol: 0.2, slide: -105 });
    this.tone({ freq: 62, type: "sine", dur: 0.5, vol: 0.16, slide: -28 });
  },

  // A wave arriving. Two horn notes, and the boss version drops a fifth.
  wave() {
    this.tone({ freq: 330, type: "triangle", dur: 0.16, vol: 0.13 });
    this.tone({ freq: 494, type: "triangle", dur: 0.22, vol: 0.13, when: 0.14 });
  },
  bigwave() {
    this.tone({ freq: 196, type: "sawtooth", dur: 0.3, vol: 0.14 });
    this.tone({ freq: 147, type: "sawtooth", dur: 0.44, vol: 0.16, when: 0.26 });
    this.noise({ dur: 0.5, vol: 0.05, when: 0.26 });
  },
  boss() {
    [98, 123, 147, 196].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.34, vol: 0.15, when: i * 0.2 }));
  },

  // The scarecrow going off: relief, not failure. It has to sound like a
  // rescue or losing a row feels like a telling-off.
  scarecrow() {
    this.tone({ freq: 300, type: "square", dur: 0.1, vol: 0.12, slide: 500 });
    this.noise({ dur: 0.3, vol: 0.11, when: 0.06 });
    this.tone({ freq: 800, type: "triangle", dur: 0.2, vol: 0.09, when: 0.1, slide: -300 });
  },
  breach() {
    this.tone({ freq: 220, type: "sawtooth", dur: 0.5, vol: 0.18, slide: -150 });
    this.tone({ freq: 165, type: "sawtooth", dur: 0.7, vol: 0.15, when: 0.2, slide: -90 });
  },
  rally() {
    this.tone({ freq: 440, type: "square", dur: 0.09, vol: 0.11 });
    this.tone({ freq: 660, type: "square", dur: 0.14, vol: 0.11, when: 0.08 });
  },
  nope() { this.tone({ freq: 170, type: "sine", dur: 0.11, vol: 0.1, slide: -45 }); },

  levelwin() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.26, vol: 0.15, when: i * 0.11 }));
  },
  star() { this.tone({ freq: 880, type: "triangle", dur: 0.16, vol: 0.13, slide: 420 }); },
  buy() {
    this.tone({ freq: 660, type: "triangle", dur: 0.09, vol: 0.13 });
    this.tone({ freq: 990, type: "triangle", dur: 0.16, vol: 0.11, when: 0.08 });
  },
});
