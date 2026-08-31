// Generate icons/ — a sunflower standing its ground on a bed of soil, with one
// slug coming over the top: the whole game in one picture.
// Run: node tools/make-icons.js  (from the bramble-brigade folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                 // 1 unit = 1% of the icon

  const SKY = "#f7e9cf", SKY2 = "#fdf5e4";
  const SOIL = "#7a5432", SOIL2 = "#8f6640";
  const LEAF = "#3f7d3a", LEAF2 = "#5aa04e";
  const PETAL = "#f2b53c";
  const HEART = "#8a4b1c";
  const SLUG = "#9a7fb8", SLUG2 = "#b295d0", INK = "#33291a";

  cv.fillRect(0, 0, big, big, SKY);
  cv.fillCircle(50 * u, 22 * u, 34 * u, SKY2);

  // Maskable art keeps to the safe centre (~72%).
  const s = pad ? 0.74 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;

  // Two beds of soil, the darker one behind, so the bed reads as ground
  // rather than as a bar across the bottom.
  cv.fillRoundRect(at(4), at(66), sz(92), sz(32), sz(8), SOIL);
  cv.fillRoundRect(at(4), at(66), sz(92), sz(12), sz(6), SOIL2);

  // Stem and two leaves.
  cv.fillRect(at(47), at(40), sz(6), sz(34), LEAF);
  cv.fillEllipse(at(36), at(58), sz(12), sz(6), LEAF2);
  cv.fillEllipse(at(64), at(52), sz(12), sz(6), LEAF2);

  // Sunflower head: eight petals round a dark heart.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cv.fillEllipse(at(50 + Math.cos(a) * 15), at(36 + Math.sin(a) * 15), sz(9), sz(9), PETAL);
  }
  cv.fillCircle(at(50), at(36), sz(11), HEART);
  cv.fillCircle(at(46), at(32), sz(3), "#b06a2c");

  // One slug cresting the top corner — the trouble arriving.
  cv.fillEllipse(at(84), at(20), sz(13), sz(7), SLUG);
  cv.fillEllipse(at(84), at(18), sz(9), sz(4), SLUG2);
  cv.fillRect(at(78), at(9), sz(2), sz(6), SLUG);
  cv.fillRect(at(84), at(9), sz(2), sz(6), SLUG);
  cv.fillCircle(at(79), at(9), sz(2.2), INK);
  cv.fillCircle(at(85), at(9), sz(2.2), INK);

  return downsample(cv.px, big, SS);
}

for (const [name, size, pad] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
]) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, size, paint(size, pad)));
  console.log("wrote icons/" + name);
}
