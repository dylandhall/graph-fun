const test = require('node:test');
const assert = require('node:assert/strict');
const { levels, engine, game, CE, curve, scoring, play, R } = require('./helpers.js');

const { LEVELS, SANDBOX, getLevel } = levels;

// Pars from PLAN.md §8; level 19 recomputed for its §13 viewport [−1,11]×[−4.5,4.5].
const PARS = {
  flat: 16.000, slope: 17.889, downhill: 23.416, abs: 21.383, parabola: 28.160, vertex: 31.196, cubic: 37.680,
  sqrt: 18.443, recip: 34.521, exp: 21.801, log: 16.526, sine: 35.237, period: 23.419, cosphase: 26.782,
  tan: 101.935, linewave: 37.303, semicircle: 21.698, gauss: 20.431, damped: 24.888
};

test('every level has a par within 0.5% of the plan', () => {
  assert.deepEqual(Object.keys(PARS), LEVELS.map((l) => l.id));
  for (const l of LEVELS) {
    const par = game.par(l);
    assert.ok(Math.abs(par / PARS[l.id] - 1) < 0.005, `${l.id}: par ${par} vs ${PARS[l.id]}`);
  }
});

test('both references score 3★/1000 on every level, cheaply', () => {
  for (const l of LEVELS) {
    for (const src of [l.ref.latex, l.ref.text]) {
      const ev = game.evaluate(l, src);
      assert.equal(ev.status, 'ok', `${l.id} ${src}`);
      assert.equal(ev.warning, null);
      assert.equal(ev.result.hitCount, l.targets.length, `${l.id} ${src} hits`);
      assert.equal(ev.result.wallsCrossedCount, 0);
      assert.equal(ev.result.score, 1000, `${l.id} ${src}`);
      assert.equal(ev.result.stars, 3, `${l.id} ${src}`);
      assert.ok(ev.curve.evals < curve.DEFAULTS.maxEvals / 10, `${l.id} used ${ev.curve.evals} evals`);
    }
  }
});

test('alternate correct answers also earn 3★', () => {
  const alternates = {
    slope: ['0.5x+1'], downhill: ['3-2x'], abs: ['|x-2|-1'], parabola: ['0.5x^2-3', R`\frac{x^2}{2}-3`],
    vertex: ['4-(x-2)^2', '-x^2+4x'], cubic: ['0.25x^3-3x'], recip: ['4x^{-1}'], exp: ['e^{0.693x}-3'],
    log: [R`\frac{\ln x}{\ln 2}`, R`1.4427\ln x`], period: [R`2\sin(0.785x)`, R`2\sin(0.8x)`],
    cosphase: [R`2\sin(x+0.5708)+1`], tan: [R`\tan(0.785x)`, R`-\frac{1}{\tan(\frac{\pi x}{4}+\frac{\pi}{2})}`],
    linewave: [R`0.5x+2\sin(1.5708x)`], gauss: [R`4\exp(-x^2/2)`, R`4e^{-0.5x^2}`],
    damped: [R`4e^{-0.25x}\cos(1.5708x)`]
  };
  for (const [id, list] of Object.entries(alternates)) {
    for (const src of list) assert.equal(play(id, src).stars, 3, `${id}: ${src}`);
  }
});

test('simpler-family decoys earn no stars', () => {
  const decoys = {
    flat: ['2', '4', 'x', '0.1x+3'],
    slope: ['3', '1', 'x+1', R`\frac{1}{2}x`],
    downhill: [R`\frac{1}{2}x+1`, '-x+3', '-2x', '3'],
    abs: ['-2x+3', 'x-3', '1', R`\left|x\right|-1`],
    parabola: [R`\left|x\right|-3`, R`2\left|x\right|-3`, 'x^2-3'],
    vertex: ['x^2-4', '-x^2+4', R`-3\left|x-2\right|+4`, R`\frac{1}{2}x^2-3`],
    cubic: ['x', '-2x', R`\frac{1}{2}x^2-4`, 'x^3', '-(x-2)^2+4'],
    sqrt: [R`\frac{1}{2}x+1`, 'x^2-3', R`\left|x+4\right|-3`, R`\sqrt{x}`, R`\sqrt{x+4}-3`],
    recip: ['x', 'x^3', R`\frac{1}{x}`, '4x'],
    exp: ['x-2', R`\frac{1}{2}x^2-2`, R`\sqrt{x+6}-3`, 'x^3-2', R`\frac{-6}{x-3.5}-3`, R`\frac{4}{x}`],
    log: [R`\sqrt{x}`, R`2\sqrt{x}-2`, R`\frac{1}{2}x-1`, R`\ln x`, '2^x'],
    sine: [R`\sin x`, 'x', R`\frac{1}{4}x^3-3x`, R`3\cos x`, R`3\sin(2x)`],
    period: [R`2\sin x`, R`2\sin(2x)`, R`\sin(\frac{\pi x}{2})`, R`3\sin x`],
    cosphase: [R`2\cos x+1`, R`2\cos(x-1)`, R`2\sin(x-1)+1`, R`2\cos(x+1)+1`],
    tan: [R`\tan x`, 'x', R`\sin(\frac{\pi x}{4})`, R`\frac{1}{x}`, R`\tan(\frac{x}{2})`],
    linewave: [R`\frac{x}{2}`, R`2\sin(\frac{\pi x}{2})`, R`x+2\sin x`, R`\frac{x}{2}+2\sin x`],
    semicircle: [R`4-\frac{1}{5}x^2`, R`5\cos(\frac{x}{3})-1`, R`-\left|x\right|+4`, R`4.84\cos(0.43x)+2.15`],
    gauss: ['4-x^2', R`2\cos(\frac{\pi x}{4})+2`, R`\frac{4}{1+x^2}`, R`4e^{-x^2}`, R`2.48\cos(0.87x)+1.3`,
      R`2.05\cos(0.947x)+1.70`],
    damped: [R`4\cos(\frac{\pi x}{2})`, R`4e^{-\frac{x}{4}}`, R`4e^{-\frac{x}{2}}\cos(\frac{\pi x}{2})`]
  };
  assert.deepEqual(Object.keys(decoys).sort(), LEVELS.map((l) => l.id).sort());
  for (const [id, list] of Object.entries(decoys)) {
    for (const src of list) {
      const r = play(id, src);
      assert.equal(r.stars, 0, `${id}: ${src} got ${r.stars}★ (${r.hitCount}/${r.total}, ratio ${r.ratio.toFixed(3)})`);
    }
  }
});

test('wiggle spam earns nothing', () => {
  for (const l of LEVELS) {
    for (const src of [R`10\sin(100x)`, R`5\sin(50x)`, R`\sin(200x)`]) {
      const r = game.evaluate(l, src).result;
      assert.equal(r.stars, 0, `${l.id} ${src}`);
      assert.ok(r.score <= 1, `${l.id} ${src} scored ${r.score}`);
    }
    for (const src of [R`3\sin(10x)`, R`6\sin(5x)`]) {
      const r = game.evaluate(l, src).result;
      assert.equal(r.stars, 0, `${l.id} ${src}`);
      assert.ok(r.score <= 25, `${l.id} ${src} scored ${r.score}`); // max 23 (tan: r ≈ 3 and 4 walls)
    }
  }
  assert.equal(play('flat', R`10\sin(100x)`).hitCount, 4, 'it does hit every dot');
});

test('clever and cheating curves', () => {
  const poly = play('parabola', R`\left|x\right|-3+\left|x-2\right|+\left|x+2\right|-4`);
  assert.ok(Math.abs(poly.length - 27.744) < 0.01, `polyline L=${poly.length}`);
  assert.ok(poly.length < poly.par);
  assert.equal(poly.score, 1000);
  assert.equal(poly.stars, 3);

  const stairs = play('slope', R`\frac{1}{2}\lfloor x\rfloor+1`);
  assert.equal(stairs.hitCount, 4);
  assert.ok(Math.abs(stairs.length - 23.5) < 0.01, `staircase L=${stairs.length}`);
  assert.equal(stairs.score, 961, 'all four dots: most of the points, but only 1★ for the 1.31 × par line');
  assert.equal(stairs.stars, 1);

  const fake = play('recip', R`\frac{4x}{x^2+0.01}`);
  assert.equal(fake.hitCount, 6);
  assert.equal(fake.wallsCrossedCount, 1);
  assert.equal(fake.score, 500);
  assert.equal(fake.stars, 0);
});

test('evaluate: statuses, messages and warnings', () => {
  const flat = getLevel('flat');
  const empty = game.evaluate(flat, '  ');
  assert.equal(empty.status, 'empty');
  assert.equal(empty.message, '');
  assert.equal(empty.curve, null);
  assert.equal(empty.result, null);

  const inc = game.evaluate(flat, R`x+\placeholder{}`);
  assert.equal(inc.status, 'incomplete');
  assert.equal(inc.message, 'Fill in the empty box.');

  for (const src of ['x+', 'kx', 'x=3', 'f(x)', R`\sin`]) {
    const ev = game.evaluate(flat, src);
    assert.equal(ev.status, 'error', src);
    assert.equal(ev.message, ev.formula.message);
    assert.equal(ev.warning, null);
    assert.equal(ev.curve, null);
    assert.equal(ev.result, null);
    assert.equal(ev.input, src);
  }

  const ok = game.evaluate(flat, '3');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.message, '');
  assert.equal(ok.warning, null);
  assert.equal(ok.formula.ok, true);
  assert.ok(Math.abs(ok.curve.length - 16) < 1e-9);
  assert.equal(ok.result.score, 1000);

  const w = (src) => game.evaluate(flat, src);
  assert.equal(w('100').warning, 'offscreen');
  assert.equal(w('100').message, "Your graph isn't visible anywhere in view.");
  assert.equal(w('6.3').warning, 'offscreen', 'drawn only in the clip margin');
  assert.equal(w(R`\sqrt{-1-x^2}`).warning, 'undefined');
  assert.equal(w(R`\sqrt{-1-x^2}`).message, 'Not defined anywhere in view.');
  assert.equal(w(R`\operatorname{sgn}x`).status, 'error', 'a bare function name asks for brackets');
  assert.equal(w(R`\operatorname{sgn}x`).message, 'Put brackets after sgn, e.g. sgn(x).');
  assert.equal(w(R`\sin(1000x)`).warning, 'saturated');
  assert.equal(w(R`\sin(1000x)`).message, 'Too wiggly to measure — length ∞.');
  assert.equal(w(R`\sin(1000x)`).result.score, 0);
  assert.deepEqual(engine.WARNINGS, {
    undefined: 'Not defined anywhere in view.',
    offscreen: "Your graph isn't visible anywhere in view.",
    saturated: 'Too wiggly to measure — length ∞.'
  });
});

test('evaluate passes sample options through', () => {
  let t = 0;
  const ev = game.evaluate(getLevel('flat'), 'x', { timeBudgetMs: 5, now: () => t++ });
  assert.equal(ev.curve.timedOut, true);
  assert.equal(ev.warning, 'saturated');
  assert.equal(ev.result.stars, 0);
});

test('the sandbox measures length only', () => {
  const ev = game.evaluate(SANDBOX, R`\sin x`);
  assert.equal(ev.status, 'ok');
  assert.equal(ev.result, null);
  assert.equal(ev.formula.size, 2, 'size is available for the Size chip');
  assert.equal(game.evaluate(SANDBOX, R`\lfloor x\rfloor`).status, 'ok', 'the sandbox is unrestricted');
  assert.ok(Math.abs(ev.curve.length - 19.394) < 0.002);
  assert.ok(Number.isNaN(game.par(SANDBOX)));
});

test('par is cached and does not depend on the targets', () => {
  const g = engine.createGame(CE);
  const l = getLevel('tan');
  const first = g.par(l);
  assert.equal(g.par(l), first);
  assert.equal(g.par({ ...l, targets: [] }), first);
  assert.equal(g.par(l), game.par(l));
  assert.equal(g.levels, LEVELS);
  assert.equal(typeof g.ce.parse, 'function');
  assert.equal(g.compiler.ce, g.ce);
});

test('challenges: par is the dot-to-dot length, cached', () => {
  const c01 = levels.getChallenge('c01');
  assert.ok(Math.abs(game.par(c01) - 27.022) < 5e-4, String(game.par(c01)));
  assert.equal(game.par(c01), scoring.polylinePar(c01.targets, c01.viewport));
  assert.equal(game.par(c01), game.par(c01));
  const moved = { ...c01, targets: [[-6, 0], [6, 0]] };
  assert.equal(game.par(moved), 16, 'the cache is keyed by the dots');
});

test('challenges: AttemptResult shape, stars vs the bot', () => {
  const ch = levels.getChallenge('c01');
  const best = game.evaluate(ch, ch.bot.latex);
  assert.equal(best.status, 'ok');
  const r = best.result;
  for (const k of ['hits', 'hitCount', 'total', 'walls', 'wallsCrossedCount', 'length', 'par', 'ratio', 'score', 'stars',
    'saturated', 'kind', 'size', 'lengthFactor', 'sizeFactor', 'wallFactor', 'bot', 'beatBot', 'matchedBot', 'thresholds']) {
    assert.ok(k in r, k);
  }
  assert.equal(r.kind, 'challenge');
  assert.equal(r.total, 5);
  assert.equal(r.par, game.par(ch));
  assert.equal(r.ratio, r.length / r.par);
  assert.equal(r.size, best.formula.size);
  assert.equal(r.bot, ch.bot.score);
  assert.equal(r.score, ch.bot.score);
  assert.equal(r.matchedBot, true);
  assert.equal(r.beatBot, false);
  assert.equal(r.stars, 3);
  assert.deepEqual(r.thresholds, scoring.challengeThresholds(ch.bot.score));
  assert.equal(r.score, scoring.challengeScore({ ...r, par: r.par }).score);

  const line = game.evaluate(ch, '0').result; // 1 of 5 dots, size 1
  assert.equal(line.hitCount, 1);
  assert.equal(line.size, 1);
  assert.equal(line.sizeFactor, 1);
  assert.equal(line.lengthFactor, 1);
  assert.equal(line.score, 200);
  assert.equal(line.stars, 0);
  assert.equal(line.beatBot, false);

  const big = game.evaluate(ch, R`0.06e^{1.14x}-0.58x-3.92+0.01x^3+0.01x^2`).result; // the old bot, padded
  assert.equal(big.size, 13 + 6 + 6);
  assert.equal(big.sizeFactor, scoring.sizeFactor(25));
  assert.ok(Math.abs(big.sizeFactor - 0.3679) < 1e-4);
  assert.equal(big.score, Math.round(1000 * big.hitCount / 5 * big.lengthFactor * big.sizeFactor));

  const fence = levels.getChallenge('c10'); // y = x crosses the wall at x = 4 inside the view
  const crossed = game.evaluate(fence, 'x').result;
  assert.equal(crossed.wallsCrossedCount, 1);
  assert.equal(crossed.wallFactor, 0.5);
  assert.equal(crossed.score, Math.round(1000 * crossed.hitCount / 7 * crossed.lengthFactor * 0.5));
});

test('lesson results are unchanged by the challenge code', () => {
  const r = play('abs', R`\left|x-2\right|-1`);
  assert.equal(r.kind, undefined);
  assert.equal(r.size, undefined);
  assert.equal(r.score, 1000);
  assert.equal(r.stars, 3);
  assert.equal(play('slope', R`\frac{1}{2}\lfloor x\rfloor+1`).score, 961, 'floor is fine in lessons');
});

// ---- PLAN-v3: gentler length factor and slider variables ----

test('one more dot with a somewhat longer line now scores more (it used to score less)', () => {
  // [level, fewer dots, one more dot with a longer line, v1 scores, v2 scores] — PLAN-v3 §B.4 with §L.1's g
  const pairs = [
    ['semicircle', R`1.64\sin\left(0.45x+1.57\right)+2.48`, R`2.42\sin\left(1.06x-1.71\right)+0.61`, [714, 385], [714, 790]],
    ['downhill', R`-2\left|x-1.75\right|+2\left|x-3.25\right|-2`, R`2\left|x-4\right|-5`, [750, 712], [750, 982]],
    ['sine', R`3\operatorname{sgn}\left(x-0.79\right)-1.91x+3`, R`6\operatorname{sgn}\left(x-0.79\right)-1.91x`, [667, 643], [667, 823]]
  ];
  for (const [id, a, b, , want] of pairs) {
    const ra = play(id, a), rb = play(id, b);
    assert.equal(rb.hitCount, ra.hitCount + 1, `${id} hits`);
    assert.ok(rb.length > ra.length, `${id} longer`);
    assert.deepEqual([ra.score, rb.score], want, id);
  }
  const ch = levels.getChallenge('c17');
  const seven = game.evaluate(ch, R`7.76\sin\left(0.77x-2.89\right)+4.37`).result;
  const eight = game.evaluate(ch, R`5.39\sin\left(1.54x+2.61\right)-0.06`).result;
  assert.deepEqual([seven.hitCount, eight.hitCount], [7, 8]);
  assert.deepEqual([seven.size, eight.size], [10, 10]);
  assert.deepEqual([seven.score, eight.score], [778, 796], 'was 778 → 558');
});

test('evaluate binds slider values without recompiling', () => {
  const l = getLevel('sine');
  const ev = game.evaluate(l, R`a\sin x`, undefined, { a: 3 });
  assert.equal(ev.status, 'ok');
  assert.deepEqual(ev.vars, { a: 3 });
  assert.deepEqual(ev.formula.params, ['a']);
  assert.equal(ev.result.score, 1000);
  assert.equal(ev.result.stars, 3);
  const ev2 = game.evaluate(l, R`a\sin x`, undefined, { a: 2 });
  assert.equal(ev2.formula, ev.formula, 'the compiled formula is reused');
  assert.ok(ev2.result.hitCount < 6);
  assert.deepEqual(game.evaluate(l, R`a\sin x`).vars, { a: 1 }, 'defaults when no values are given');
  assert.deepEqual(game.evaluate(l, R`3\sin x`, undefined, { a: 7 }).vars, {}, 'only the variables the formula uses');
  assert.deepEqual(game.evaluate(l, R`a\sin x`, undefined, { a: 'x' }).vars, { a: 1 }, 'bad values fall back to the default');
});

test('variables work in challenges and count 1 each', () => {
  // The first four numbers of a bot formula go on sliders a–d (a sign before a number moves into its value).
  for (const id of ['c02', 'c12', 'c15']) {
    const ch = levels.getChallenge(id), vals = {};
    let i = 0;
    const src = ch.bot.latex.replace(/(^|[+-])(\d+(?:\.\d+)?)(?![\d}])/g, (m, sign, num, at) => {
      if (i >= 4 || ch.bot.latex.charAt(at - 1) === '^') return m;
      const k = 'abcd'[i++];
      vals[k] = Number((sign === '-' ? '-' : '') + num);
      return (sign ? '+' : '') + k;
    });
    assert.equal(i, 4, `${id}: ${src}`);
    const ev = game.evaluate(ch, src, undefined, vals);
    assert.equal(ev.status, 'ok', `${src}: ${ev.message}`);
    assert.deepEqual(ev.formula.params, ['a', 'b', 'c', 'd']);
    assert.equal(ev.result.size, ch.bot.size, `${id} size`);
    assert.equal(ev.result.score, ch.bot.score, `${id}: the bot formula with its numbers on sliders scores the same`);
  }
  assert.equal(game.evaluate(levels.getChallenge('c01'), 'kx').formula.kind, 'variables');
});

test('a slider drag frame (40 ms budget) that finishes in time is exactly the full evaluation', () => {
  // The UI evaluates drag frames with a 40 ms budget and uses the 300 ms one for lock-in (app.js evaluateNow);
  // it relies on the sampler giving the same curve for any budget it doesn't run out of.
  const cases = [['sine', R`a\sin\left(bx\right)`, { a: 3, b: 1 }], ['vertex', R`a\left(x-b\right)^2+c`, { a: -1, b: 2, c: 4 }],
    ['c17', R`a\sin\left(bx+c\right)+d`, { a: 5.39, b: 1.54, c: 2.61, d: -0.06 }], ['sine', R`a\sin\left(100bx\right)`, { a: 1, b: 1 }]];
  for (const [id, src, vals] of cases) {
    const l = getLevel(id) || levels.getChallenge(id);
    const live = game.evaluate(l, src, { timeBudgetMs: 40 }, vals), full = game.evaluate(l, src, { timeBudgetMs: 300 }, vals);
    assert.equal(live.curve.timedOut, false, `${id} ${src}`);
    assert.equal(live.curve.length, full.curve.length, `${id} ${src}`);
    assert.deepEqual(live.result.hits, full.result.hits);
    assert.equal(live.result.score, full.result.score);
  }
  // one that runs out is flagged (and scores 0), so the UI can show "Measuring…" and evaluate again
  let t = 0;
  const slow = game.evaluate(getLevel('sine'), R`a\sin x`, { timeBudgetMs: 40, now: () => t++ }, { a: 3 });
  assert.equal(slow.curve.timedOut, true);
  assert.equal(slow.result.score, 0);
  assert.equal(game.evaluate(getLevel('sine'), R`a\sin x`, { timeBudgetMs: 300 }, { a: 3 }).result.score, 1000);
});
