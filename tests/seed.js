// Seeds Math.random for the test sandbox. The engine itself never calls it —
// tests/content.test.js asserts that, because determinism is the whole reason
// the bot table means anything — but a stray call from anywhere else would
// otherwise make a balance failure depend on the afternoon.
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  globalThis.__reseed = function (n) { Math.random = mulberry32(n >>> 0); };
  // The seeded RNG only exists INSIDE the sandbox: a bot living in the test
  // file's own realm would draw from Node's unseeded one and the suite would
  // pass and fail at random. Every bot routes its randomness through here.
  globalThis.__rand = function () { return Math.random(); };
  globalThis.__reseed(20260831);
})();
