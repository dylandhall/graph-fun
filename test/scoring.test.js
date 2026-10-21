const test = require('node:test');
const assert = require('node:assert/strict');
const { scoring, curve, fnOf, A, R, near } = require('./helpers.js');

const flat = [[[-8, 0], [8, 0]]];

test('hits: on, near and beyond the radius', () => {
  const r = 0.25;
  assert.deepEqual(scoring.hitTargets(flat, [[0, 0], [3, 0.25], [3, -0.2], [-2, 0.2501], [9, 0]], r),
    [true, true, true, false, false]);
  assert.deepEqual(scoring.hitTargets(flat, [[8.2, 0.1]], r), [true], 'within r of the end point');
  assert.deepEqual(scoring.hitTargets([], [[0, 0]], r), [false]);
  const steep = [[[0, -6], [0.01, 6]]];
  assert.deepEqual(scoring.hitTargets(steep, [[0.2, 0]], r), [true], 'perpendicular distance, not vertical');
});

test('a target beside a jump is not hit', () => {
  const c = curve.sampleCurve(fnOf(R`3\operatorname{sgn}(x)`), A);
  assert.deepEqual(scoring.hitTargets(c.paths, [[0, 0], [0, 1.5], [0, -1.5], [1, 3], [-1, -3]], 0.25),
    [false, false, false, true, true]);
});

test('walls: only on-screen crossings count', () => {
  const vp = A;
  assert.deepEqual(scoring.crossedWalls([[[-1, 0], [1, 0]]], [0], vp), [true]);
  assert.deepEqual(scoring.crossedWalls([[[-1, 6.5], [1, 6.5]]], [0], vp), [false], 'above yMax is allowed');
  assert.deepEqual(scoring.crossedWalls([[[-1, 0], [0, 0]]], [0], vp), [true], 'touching counts');
  assert.deepEqual(scoring.crossedWalls([[[-1, 0], [1, 0]]], [2, -0.5], vp), [false, true]);
  const recip = curve.sampleCurve(fnOf(R`\frac{4}{x}`), vp);
  assert.deepEqual(scoring.crossedWalls(recip.paths, [0], vp), [false], 'a true asymptote never crosses');
  const fake = curve.sampleCurve(fnOf(R`\frac{4x}{x^2+0.01}`), vp);
  assert.deepEqual(scoring.crossedWalls(fake.paths, [0], vp), [true]);
});

test('lengthFactor: 1 up to the reference, then exp(−0.056(r−1) − 0.222(r−1)²)', () => {
  const g = scoring.lengthFactor;
  const table = [[0, 1], [0.5, 1], [1, 1], [1.04, 0.9974], [1.1, 0.9922], [1.25, 0.9725], [1.5, 0.9199], [2, 0.7573],
    [2.5, 0.5579], [3, 0.3679], [5, 0.0229], [10, 9.4e-9], [100, 0]];
  for (const [r, want] of table) assert.ok(Math.abs(g(r) - want) < 5e-5, `g(${r}) = ${g(r)}`);
  for (const r of [Infinity, NaN, -1, undefined]) assert.equal(g(r), 0, String(r));
  assert.deepEqual({ ...scoring.LENGTH }, { linear: 0.056, quadratic: 0.222 });
  assert.equal(scoring.RULES_VERSION, 2);
  let prev = 1;
  for (let r = 1; r < 12; r += 0.01) { assert.ok(g(r) < prev + 1e-15, `monotone at ${r}`); prev = g(r); }
  assert.ok(g(1.01) < 1 && g(1.04) < g(1.02), 'a slightly shorter line still scores a little more near the reference');
});

// One more dot beats the best possible score with one dot fewer while g(r₂) > (n−1)/n (PLAN-v3 §L.1); these bounds
// also hold after rounding.
const GUARANTEE = { 2: 2.64, 3: 2.22, 4: 2.01, 5: 1.88, 6: 1.78, 7: 1.71, 8: 1.65, 9: 1.61, 10: 1.57 };

test('one more dot always pays while the line stays within the per-n bound (≥ 1.57 × the reference)', () => {
  const g = scoring.lengthFactor;
  for (let n = 2; n <= 10; n++) {
    assert.ok(g(GUARANTEE[n]) > (n - 1) / n, `n = ${n} holds at ${GUARANTEE[n]}`);
    assert.ok(g(GUARANTEE[n] + 0.02) < (n - 1) / n, `n = ${n} stops just above ${GUARANTEE[n]}`);
  }
  const s = (h, n, r) => scoring.scoreAttempt({ hitCount: h, total: n, length: r * 20, par: 20, wallsCrossedCount: 0 }).score;
  for (let n = 2; n <= 10; n++) for (let h = 0; h < n; h++) for (let r1 = 0.5; r1 <= 3; r1 += 0.05) {
    for (let r2 = 0.5; r2 <= GUARANTEE[n] + 1e-9; r2 += 0.01) {
      const before = s(h, n, r1), after = s(h + 1, n, r2);
      assert.ok(after > before, `${h}/${n} at ${r1.toFixed(2)} → ${h + 1}/${n} at ${r2.toFixed(2)}: ${before} → ${after}`);
    }
  }
});

test('challenges: one more dot pays at the same size, and up to 3 more symbols past 15', () => {
  const s = (o) => scoring.challengeScore(Object.assign({ total: 7, par: 20, size: 14, wallsCrossedCount: 0 }, o)).score;
  for (let n = 4; n <= 10; n++) for (let size = 1; size <= 30; size++) for (let r2 = 0.5; r2 <= 1.5; r2 += 0.05) {
    const before = s({ total: n, hitCount: n - 1, length: 20, size }), after = s({ total: n, hitCount: n, length: r2 * 20, size });
    if (before > 0) assert.ok(after > before, `n ${n} size ${size} r ${r2.toFixed(2)}: ${before} → ${after}`);
  }
  // The reviewer's c08 case (PLAN-v3 §L.2): 5/7 at size 14 → 6/7 at size 17 used to drop 714 → 676.
  assert.equal(s({ hitCount: 5, length: 20, size: 14 }), 714);
  assert.equal(s({ hitCount: 6, length: 20, size: 17 }), 824);
  for (let n = 2; n <= 10; n++) for (let size = 1; size <= 15; size++) for (let extra = 1; size + extra <= 18; extra++) {
    const before = s({ total: n, hitCount: n - 1, length: 20, size }), after = s({ total: n, hitCount: n, length: 20, size: size + extra });
    assert.ok(after > before, `n ${n}: size ${size} → ${size + extra}: ${before} → ${after}`);
  }
});

test('scoreAttempt table', () => {
  const s = (o) => scoring.scoreAttempt(Object.assign({ hitCount: 4, total: 4, par: 20, wallsCrossedCount: 0 }, o));
  const ss = (o) => { const r = s(o); return { score: r.score, stars: r.stars }; };
  assert.deepEqual(s({ length: 20 }), { score: 1000, stars: 3, lengthFactor: 1 });
  assert.deepEqual(ss({ length: 10 }), { score: 1000, stars: 3 }, 'shorter than par is capped at 1000');
  assert.deepEqual(ss({ length: 20 * 1.05 }), { score: 997, stars: 3 });
  assert.deepEqual(ss({ length: 20 * 1.06 }), { score: 996, stars: 2 }, 'stars still follow the length');
  assert.deepEqual(ss({ length: 20 * 1.2 }), { score: 980, stars: 2 });
  assert.deepEqual(ss({ length: 20 * 1.25 }), { score: 973, stars: 2 });
  assert.deepEqual(ss({ length: 20 * 1.3 }), { score: 964, stars: 1 });
  assert.deepEqual(ss({ length: 20 * 1.415 }), { score: 940, stars: 1 });
  assert.deepEqual(ss({ length: 20 * 1.42 }), { score: 939, stars: 0 }, 'points for dots, stars for a short line');
  assert.deepEqual(ss({ length: 20 * 1.5 }), { score: 920, stars: 0 });
  assert.deepEqual(ss({ length: 20 * 2 }), { score: 757, stars: 0 });
  assert.deepEqual(ss({ length: 20 * 3 }), { score: 368, stars: 0 });
  assert.deepEqual(ss({ length: 20 * 10 }), { score: 0, stars: 0 });
  assert.deepEqual(ss({ length: 20, hitCount: 2 }), { score: 500, stars: 0 }, 'stars need every dot');
  assert.deepEqual(ss({ length: 20, wallsCrossedCount: 1 }), { score: 500, stars: 0 }, 'stars need no walls');
  assert.deepEqual(ss({ length: 20, wallsCrossedCount: 2 }), { score: 250, stars: 0 });
  assert.deepEqual(s({ length: Infinity }), { score: 0, stars: 0, lengthFactor: 0 });
  assert.deepEqual(ss({ length: 20, hitCount: 0, total: 0 }), { score: 0, stars: 0 });
});

test('RULES', () => {
  assert.deepEqual({ ...scoring.RULES }, { three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5 });
});

test('evaluateAttempt reads hitRadius and walls from the level', () => {
  const level = { viewport: A, targets: [[-1, -4], [1, 4], [2, 3]], walls: [0], hitRadius: 0.25 };
  const c = curve.sampleCurve(fnOf(R`\frac{4}{x}`), A);
  const r = scoring.evaluateAttempt(c, level, c.length);
  assert.deepEqual(r.hits, [true, true, false]);
  assert.deepEqual(r.walls, [false]);
  assert.equal(r.hitCount, 2);
  assert.equal(r.total, 3);
  assert.equal(r.wallsCrossedCount, 0);
  assert.equal(r.length, c.length);
  assert.equal(r.par, c.length);
  assert.equal(r.ratio, 1);
  assert.equal(r.score, 667);
  assert.equal(r.stars, 0);
  assert.equal(r.lengthFactor, 1);
  assert.equal(r.saturated, false);
  const wide = scoring.evaluateAttempt(c, { ...level, hitRadius: 1.2 }, c.length);
  assert.equal(wide.hitCount, 3);
});

// ---- free-play challenges (PLAN-challenges.md §1, §9, §11.E) ----

test('CHALLENGE constants', () => {
  assert.deepEqual({ ...scoring.CHALLENGE }, { freeSize: 15, sizeScale: 10, wallPenalty: 0.5, oneStar: 0.6, twoStar: 0.85 });
  assert.ok(Object.isFrozen(scoring.CHALLENGE));
});

test('sizeFactor: the first 15 are free, then exp(−((size−15)/10)²)', () => {
  const f = scoring.sizeFactor;
  const table = [[1, 1], [14, 1], [15, 1], [16, 0.9900], [17, 0.9608], [19, 0.8521], [21, 0.6977], [25, 0.3679], [30, 0.1054],
    [35, 0.0183], [45, 0.0001]];
  for (const [size, want] of table) assert.ok(Math.abs(f(size) - want) < 5e-5, `sizeFactor(${size}) = ${f(size)}`);
  assert.equal(f(Infinity), 0);
  let prev = 1;
  for (let size = 15; size < 60; size++) { assert.ok(f(size + 1) < prev, `monotone at ${size}`); prev = f(size + 1); }
});

test('polylinePar: dot to dot plus flat runs to both edges', () => {
  assert.equal(scoring.polylinePar([[-6, 0], [6, 0]], A), 16);
  assert.equal(scoring.polylinePar([[3, 4], [0, 0]], A), 18, 'unsorted input');
  assert.equal(scoring.polylinePar([], A), 16);
  const t = [[3, 4], [0, 0]];
  scoring.polylinePar(t, A);
  assert.deepEqual(t, [[3, 4], [0, 0]], 'does not sort in place');
});

test('challengeScore table', () => {
  const s = (o) => scoring.challengeScore(Object.assign({ hitCount: 4, total: 5, length: 20, par: 20, size: 13, wallsCrossedCount: 0 }, o));
  assert.deepEqual(s({}), { score: 800, lengthFactor: 1, sizeFactor: 1, wallFactor: 1 });
  assert.equal(s({ length: 10 }).score, 800, 'shorter than the dot-to-dot path is capped');
  assert.equal(s({ length: 30 }).score, 736);
  assert.equal(s({ length: 40 }).score, 606);
  assert.equal(s({ length: 40 }).lengthFactor, scoring.lengthFactor(2));
  assert.equal(s({ length: 60 }).score, 294);
  assert.equal(s({ size: 15 }).score, 800, 'the first 15 are free');
  assert.equal(s({ size: 16 }).score, 792);
  assert.equal(s({ size: 17 }).score, 769);
  assert.equal(s({ size: 20 }).score, 623);
  assert.equal(s({ size: 20 }).sizeFactor, scoring.sizeFactor(20));
  assert.equal(s({ size: 25 }).score, 294);
  assert.equal(s({ size: 30 }).score, 84);
  assert.equal(s({ wallsCrossedCount: 1 }).score, 400);
  assert.equal(s({ wallsCrossedCount: 2 }).score, 200);
  assert.equal(s({ wallsCrossedCount: 2 }).wallFactor, 0.25);
  assert.equal(s({ length: Infinity }).score, 0);
  assert.equal(s({ length: Infinity }).lengthFactor, 0);
  assert.equal(s({ hitCount: 0, total: 0 }).score, 0);
  assert.equal(s({ hitCount: 0 }).score, 0);
  assert.equal(s({ hitCount: 5 }).score, 1000);
  for (const size of [undefined, NaN, 0, -3]) assert.equal(s({ size }).score, 800, `size ${size} counts as 1`);
});

test('challengeThresholds and challengeStars are relative to the bot', () => {
  assert.deepEqual(scoring.challengeThresholds(800), { one: 480, two: 680, three: 800 });
  assert.deepEqual(scoring.challengeThresholds(881), { one: 529, two: 749, three: 881 });
  assert.deepEqual(scoring.challengeThresholds(700), { one: 420, two: 595, three: 700 }, 'exact products are not bumped up');
  const cases = [[480, 1], [479, 0], [680, 2], [679, 1], [800, 3], [801, 3], [0, 0], [1000, 3]];
  for (const [score, stars] of cases) assert.equal(scoring.challengeStars(score, 800), stars, `${score}`);
  assert.equal(scoring.challengeStars(500, 0), 0, 'no bot, no stars');
  assert.equal(scoring.challengeStars(500, undefined), 0);
  for (const bot of [593, 618, 706, 827, 974]) {
    const t = scoring.challengeThresholds(bot);
    assert.equal(scoring.challengeStars(t.one, bot), 1);
    assert.equal(scoring.challengeStars(t.one - 1, bot), 0);
    assert.equal(scoring.challengeStars(t.two, bot), 2);
    assert.equal(scoring.challengeStars(t.two - 1, bot), 1);
    assert.equal(scoring.challengeStars(bot, bot), 3);
    assert.equal(scoring.challengeStars(bot - 1, bot), 2);
  }
});

test('evaluateChallenge adds the challenge fields to an AttemptResult', () => {
  const level = { kind: 'challenge', viewport: A, targets: [[-4, 0], [0, 0], [4, 1]], walls: [2], hitRadius: 0.25,
                  bot: { score: 500 } };
  const c = curve.sampleCurve(fnOf('0'), A);
  const r = scoring.evaluateChallenge(c, level, 20, 20);
  assert.deepEqual(r.hits, [true, true, false]);
  assert.deepEqual(r.walls, [true]);
  assert.equal(r.hitCount, 2);
  assert.equal(r.total, 3);
  assert.equal(r.wallsCrossedCount, 1);
  assert.ok(near(r.length, 16, 1e-9));
  assert.equal(r.par, 20);
  assert.equal(r.ratio, r.length / 20);
  assert.equal(r.lengthFactor, 1);
  assert.equal(r.sizeFactor, scoring.sizeFactor(20));
  assert.equal(r.wallFactor, 0.5);
  assert.equal(r.score, 260); // 1000 · 2/3 · 1 · e^(−1/4) · 0.5
  assert.equal(r.stars, 0);
  assert.equal(r.kind, 'challenge');
  assert.equal(r.size, 20);
  assert.equal(r.bot, 500);
  assert.equal(r.beatBot, false);
  assert.equal(r.matchedBot, false);
  assert.deepEqual(r.thresholds, { one: 300, two: 425, three: 500 });
  assert.equal(r.saturated, false);
  const beat = scoring.evaluateChallenge(c, { ...level, walls: [], bot: { score: 600 } }, 20, 1);
  assert.equal(beat.score, 667);
  assert.equal(beat.stars, 3);
  assert.equal(beat.beatBot, true);
  const match = scoring.evaluateChallenge(c, { ...level, walls: [], bot: { score: 667 } }, 20, 1);
  assert.equal(match.matchedBot, true);
  assert.equal(match.beatBot, false);
  assert.equal(match.stars, 3);
  const noBot = scoring.evaluateChallenge(c, { ...level, bot: undefined }, 20, 0);
  assert.equal(noBot.bot, 0);
  assert.equal(noBot.stars, 0);
  assert.equal(noBot.beatBot, false);
  assert.equal(noBot.size, 1);
});

test('beatsBot and matchesBot', () => {
  assert.equal(scoring.beatsBot(801, 800), true);
  assert.equal(scoring.beatsBot(800, 800), false);
  assert.equal(scoring.beatsBot(1000, 998), true);
  assert.equal(scoring.beatsBot(500, 0), false, 'no bot, nothing to beat');
  assert.equal(scoring.matchesBot(800, 800), true);
  assert.equal(scoring.matchesBot(801, 800), false);
  assert.equal(scoring.matchesBot(799, 800), false);
  assert.equal(scoring.matchesBot(0, 0), false);
});
