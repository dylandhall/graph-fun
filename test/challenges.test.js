// Free-play challenges (PLAN-challenges.md §4–§6, §9, §11). Reads the baked data in js/challenges.js; the bot
// search itself (tools/gen-challenges.js) is not re-run here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { levels, game, formula, engine, R } = require('./helpers.js');
const gen = require('../tools/gen-challenges.js');
const challenges = require('../js/challenges.js');

const { CHALLENGES, LEVELS, SANDBOX, getChallenge, getLevel } = levels;
const W = (vp) => vp.xMax - vp.xMin;
const H = (vp) => vp.yMax - vp.yMin;

function run(ch, src) {
  const ev = game.evaluate(ch, src);
  assert.equal(ev.status, 'ok', `${ch.id} ${src}: ${ev.message}`);
  return ev.result;
}

test('20 challenges c01–c20, outside the lesson list', () => {
  assert.equal(CHALLENGES.length, 20);
  assert.equal(challenges.DATA.length, 20);
  CHALLENGES.forEach((ch, i) => {
    assert.equal(ch.id, 'c' + String(i + 1).padStart(2, '0'));
    assert.equal(ch.n, i + 1);
    assert.equal(ch.kind, 'challenge');
    assert.equal(getChallenge(ch.id), ch);
    assert.equal(getLevel(ch.id), undefined, 'getLevel stays lessons-only');
    assert.ok(!LEVELS.includes(ch));
    for (const k of ['title', 'blurb', 'layout', 'family']) assert.ok(typeof ch[k] === 'string' && ch[k].length > 0, `${ch.id}.${k}`);
    assert.ok(!/[<>&]/.test(ch.blurb), `${ch.id}: plain-text blurb`);
    assert.equal(ch.hint, '');
    assert.equal(ch.whyNot, '');
    assert.deepEqual(ch.ref, { latex: '', text: '' });
    assert.equal(ch.piLabels, false);
    assert.equal(ch.seed, 20261018 + 7919 * (i + 1));
    const w = ch.walls.length;
    assert.equal(ch.family, `${ch.targets.length} dots` + (w ? ` · ${w} wall${w > 1 ? 's' : ''}` : ''));
    if (w) assert.match(ch.blurb, /try sgn \(long-press the \|x\| key\)/, ch.id);
    const b = ch.bot;
    assert.ok(Number.isInteger(b.score) && b.score > 0 && b.score <= 1000, `${ch.id} bot score`);
    assert.ok(Number.isInteger(b.hits) && b.hits >= 1 && b.hits <= ch.targets.length, `${ch.id} bot hits`);
    assert.ok(Number.isInteger(b.size) && b.size >= 1, `${ch.id} bot size`);
    assert.ok(b.length > 0, `${ch.id} bot length`);
    assert.ok(typeof b.latex === 'string' && b.latex && typeof b.family === 'string' && b.family, `${ch.id} bot`);
  });
  assert.equal(getChallenge('flat'), undefined);
  assert.equal(getChallenge('nope'), undefined);
  assert.equal(getChallenge('sandbox'), undefined);
  for (const l of LEVELS) assert.equal(l.kind, 'lesson');
  assert.equal(SANDBOX.kind, 'sandbox');
});

test('viewports, dots and walls follow the generator rules', () => {
  const vps = new Set();
  let wallLevels = 0, prevN = 0;
  CHALLENGES.forEach((ch, i) => {
    const vp = ch.viewport, r = ch.hitRadius, T = ch.targets, n = T.length, spec = gen.SPECS[i];
    vps.add(JSON.stringify(vp));
    assert.equal(W(vp) * 3, H(vp) * 4, `${ch.id} is 4:3`);
    assert.equal(r, W(vp) / 64);
    assert.ok(n >= 5 && n <= 10 && n >= prevN, `${ch.id}: ${n} dots`);
    assert.equal(n, spec.n);
    prevN = n;
    for (let k = 0; k < n; k++) {
      const [x, y] = T[k];
      assert.ok(Math.min(x - vp.xMin, vp.xMax - x, y - vp.yMin, vp.yMax - y) >= 2 * r, `${ch.id} dot ${k} near the edge`);
      if (k) {
        assert.ok(x > T[k - 1][0], `${ch.id} sorted by x`);
        assert.ok(x - T[k - 1][0] >= 0.8 * W(vp) / 16 - 1e-9, `${ch.id} x-gap before dot ${k}`);
      }
      for (let j = 0; j < k; j++) assert.ok(Math.hypot(x - T[j][0], y - T[j][1]) >= 3 * r, `${ch.id} dots ${j},${k} too close`);
    }
    for (const c of ch.walls) {
      assert.ok(c > vp.xMin && c < vp.xMax, `${ch.id} wall ${c} in view`);
      for (const [x] of T) assert.ok(Math.abs(x - c) >= 3 * r, `${ch.id} wall ${c} next to a dot`);
      assert.ok(T.some((t) => t[0] < c) && T.some((t) => t[0] > c), `${ch.id} wall ${c} splits the dots`);
    }
    if (ch.walls.length) wallLevels++;
    assert.ok(gen.maxConstHits(T, r) <= (n <= 6 ? 1 : 2), `${ch.id} flat line hits too many`);
    assert.ok(gen.maxLineHits(T, r) <= gen.lineCap(spec), `${ch.id} straight line hits too many`);
    assert.ok(gen.validateDots(T, vp, ch.walls, spec), ch.id);
  });
  assert.ok(vps.size >= 4, `${vps.size} distinct viewports`);
  assert.ok(wallLevels >= 3, `${wallLevels} wall levels`);
});

test('the generator reproduces the baked dots', () => {
  assert.deepEqual(gen.SPECS.map((s) => s.id), CHALLENGES.map((c) => c.id));
  gen.SPECS.forEach((spec, i) => {
    const d = challenges.DATA[i], g = gen.generateDots(spec);
    assert.deepEqual(g.targets, d.targets, spec.id);
    assert.deepEqual(g.walls, d.walls, spec.id);
    assert.deepEqual(g.viewport, d.viewport, spec.id);
    assert.equal(g.seed, d.seed, spec.id);
    assert.equal(spec.title, d.title);
    assert.equal(spec.layout, d.layout);
    assert.equal(gen.blurbOf(spec), d.blurb);
  });
  // pinned to PLAN-challenges.md §4 (ids are storage keys: these dots must never move)
  assert.deepEqual(getChallenge('c01').targets, [[-6.9, 0], [-2.4, 1.2], [-0.1, -3.7], [2.8, -4.3], [4.7, 5.1]]);
  assert.deepEqual(getChallenge('c20').targets, [[-6.7, 3.8], [-4.5, 3.1], [-3.5, 2.2], [-2.6, 2.4], [-0.6, -4.5],
    [0.4, -5], [2.2, 3.1], [3.6, 0.4], [5, -0.3], [7, 3.7]]);
  assert.deepEqual(CHALLENGES.filter((c) => c.walls.length).map((c) => [c.id, c.walls]),
    [['c10', [4]], ['c15', [1.5, 4]], ['c19', [-3]], ['c20', [-1.5]]]);
  const pars = { c01: 27.022, c07: 20.024, c13: 19.765, c17: 67.894, c20: 32.554 };
  for (const [id, P] of Object.entries(pars)) assert.ok(Math.abs(game.par(getChallenge(id)) - P) < 5e-4, id);
});

test('the bot reproduces its baked score', () => {
  for (const ch of CHALLENGES) {
    const f = game.compiler.compile(ch.bot.latex);
    assert.ok(f.ok, `${ch.id} bot compiles`);
    assert.deepEqual(formula.disallowed(f), [], `${ch.id} bot uses only ordinary functions`);
    const r = run(ch, ch.bot.latex);
    assert.ok(Math.abs(r.score - ch.bot.score) <= 1, `${ch.id}: ${r.score} vs ${ch.bot.score}`);
    assert.equal(r.hitCount, ch.bot.hits, ch.id);
    assert.equal(r.size, ch.bot.size, ch.id);
    assert.ok(Math.abs(r.length - ch.bot.length) < 0.01, `${ch.id} length ${r.length}`);
    assert.equal(r.stars, 3, ch.id);
    assert.deepEqual(f.params, [], `${ch.id} bot uses no slider variables`);
  }
  // No bot is perfect, so every bot can be beaten and beatsBot needs no special case (PLAN-v3 §L.7). If a re-bake ever
  // produces a 1000 bot, bring back "1000 against a perfect bot counts as beating it".
  for (const ch of CHALLENGES) assert.ok(ch.bot.score < 1000, `${ch.id} bot ${ch.bot.score}`);
  const c07 = getChallenge('c07'), best = run(c07, c07.bot.latex);
  assert.deepEqual([best.matchedBot, best.beatBot], [true, false]);
});

test('a tie goes to the simpler formula', () => {
  const f = (score, latex, size) => ({ score, latex, size });
  const pick = (a, b) => (gen.better(a, b) > 0 ? a : b);
  assert.equal(pick(f(800, '2.7x', 3), f(800, '2.71x', 3)).latex, '2.7x', 'fewer decimals');
  assert.equal(pick(f(800, '2x+1', 5), f(800, '2x+1+0', 7)).latex, '2x+1', 'then smaller');
  assert.equal(pick(f(801, '2.71x', 3), f(800, '2.7x', 3)).latex, '2.71x', 'a higher score always wins');
  for (const ch of CHALLENGES) assert.ok(gen.decimals(ch.bot.latex) <= 3, ch.id);
});

test('nudges: ±1 in the last printed digit of each number', () => {
  assert.deepEqual(gen.nudges('2.42x-3'), ['2.41x-3', '2.43x-3', '2.42x-2', '2.42x-4']);
  assert.deepEqual(gen.nudges('0.1x+1.50'), ['0.2x+1.50', '0.1x+1.49', '0.1x+1.51'], 'no zero or negative numbers');
  assert.deepEqual(gen.nudges('2.41x').slice(0, 1), ['2.4x'], 'trailing zeros are dropped');
  assert.deepEqual(gen.nudges('x'), []);
  assert.deepEqual(gen.nudges(R`0.9x+2\sin\left(1.1x\right)`), [R`0.8x+2\sin\left(1.1x\right)`, R`x+2\sin\left(1.1x\right)`,
    R`0.9x+\sin\left(1.1x\right)`, R`0.9x+3\sin\left(1.1x\right)`, R`0.9x+2\sin\left(x\right)`, R`0.9x+2\sin\left(1.2x\right)`],
    'a coefficient of 1 is not written');
  assert.deepEqual(gen.nudges(R`\left|x-1.1\right|`), [R`\left|x-1\right|`, R`\left|x-1.2\right|`]);
});

test('no single last-digit nudge of the bot formula beats the bot', () => {
  for (const ch of CHALLENGES) {
    const list = gen.nudges(ch.bot.latex);
    assert.ok(list.length >= 4, ch.id);
    for (const src of list) {
      const ev = game.evaluate(ch, src);
      if (ev.status === 'ok') assert.ok(ev.result.score <= ch.bot.score, `${ch.id}: ${src} scores ${ev.result.score} > ${ch.bot.score}`);
    }
  }
});

test('a flat line scores low', () => {
  for (const ch of CHALLENGES) {
    const n = ch.targets.length, r = ch.hitRadius;
    const h = gen.maxConstHits(ch.targets, r);
    assert.ok(1000 * h / n < 0.45 * ch.bot.score, `${ch.id}: best flat line ${h}/${n}`);
    const res = run(ch, '0');
    const hits = ch.targets.filter((t) => Math.abs(t[1]) <= r).length;
    assert.equal(res.hitCount, hits, ch.id);
    assert.equal(res.score, Math.round(1000 * hits / n * Math.pow(0.5, res.wallsCrossedCount)), ch.id);
    assert.equal(res.wallsCrossedCount, ch.walls.filter((c) => ch.viewport.yMin <= 0 && ch.viewport.yMax >= 0).length);
  }
});

test('the |x − a| chain through every dot is crushed by the size factor', () => {
  const ratios = CHALLENGES.map((ch) => {
    let best = 0;
    for (const variant of ['lin', 'flat']) {
      const r = run(ch, gen.chainLatex(ch, variant));
      if (variant === 'lin') assert.equal(r.size, 7 * ch.targets.length - 9, `${ch.id} chain size`);
      best = Math.max(best, r.score);
    }
    assert.ok(best < 0.35 * ch.bot.score, `${ch.id}: chain ${best} vs bot ${ch.bot.score}`); // max 0.33 (c01)
    return best / ch.bot.score;
  });
  assert.ok(ratios.filter((q) => q < 0.05).length >= 15, ratios.map((q) => q.toFixed(2)).join(' ')); // 17 of 20
});

test('wiggle spam scores next to nothing', () => {
  for (const ch of CHALLENGES) {
    assert.equal(run(ch, R`10\sin(100x)`).score, 0, ch.id);
    assert.ok(run(ch, R`6\sin(5x)`).score < 0.25 * ch.bot.score, ch.id);
  }
});

test('exploits are rejected on challenges and still work in lessons', () => {
  const ch = getChallenge('c01'), lesson = getLevel('slope');
  const exploits = {
    // lookup table / packed number (reviewer's lookup.js / pack.js on c01: 842 and 745 with no maths)
    At: R`[0,0,1.2,-3.7,-4.3,5.1,5.1]_{\left\lfloor 0.43x+4.48\right\rfloor}`,
    Mod: R`\frac{\left\lfloor\frac{2185383355304687}{25^{\left\lfloor 0.67x+5.38\right\rfloor}}\right\rfloor\bmod 25}{2}-6`,
    Sum: R`\sum_{k=1}^{9}\left|x-k\right|`,
    Floor: R`\lfloor x\rfloor`,
    If: R`\operatorname{If}(x>1,x,-x)`,
    Round: 'round(x)', Ceil: 'ceil(x)', Integrate: R`\int_0^x t\,dt`, D: R`\frac{d}{dx}x^2`, Factorial: 'x!'
  };
  for (const [name, src] of Object.entries(exploits)) {
    const ev = game.evaluate(ch, src);
    assert.equal(ev.status, 'error', src);
    assert.equal(ev.formula.ok, false);
    assert.equal(ev.formula.kind, 'not-allowed', src);
    assert.equal(ev.message, 'Challenges use ordinary functions — no floor, mod, lists, sums or if.');
    assert.equal(ev.message, engine.NOT_ALLOWED);
    assert.ok(ev.formula.detail.includes(name), `${src}: ${ev.formula.detail}`);
    assert.equal(ev.curve, null);
    assert.equal(ev.result, null);
    assert.equal(game.evaluate(lesson, src).status, 'ok', `${src} in a lesson`);
    assert.equal(game.evaluate(SANDBOX, src).status, 'ok', `${src} in the sandbox`);
  }
  // ordinary functions, inverse-function notation and sgn are fine
  for (const src of [R`\max(x,1)-\min(x,2)`, R`\cos^{-1}(x/8)`, R`\arcsin\left(\sin\left(x\right)\right)`, 'sgn(x-4)',
    R`2sgn\left(x-4\right)`, R`\sqrt[3]{x}+\log_{3}\left(x\right)+e^{-x^2}`, R`\frac{1}{2}x+\tanh x`]) {
    assert.equal(game.evaluate(ch, src).status, 'ok', src);
  }
  // every lesson reference is an ordinary formula too
  for (const l of LEVELS) for (const src of [l.ref.latex, l.ref.text]) assert.equal(game.evaluate(ch, src).status, 'ok', src);
});

test('a function name without brackets: brackets message, or turned down if it is not ordinary', () => {
  const ch = getChallenge('c10'), lesson = getLevel('slope');
  for (const level of [ch, lesson, SANDBOX]) {
    const ev = game.evaluate(level, R`2\operatorname{sgn}x`);
    assert.equal(ev.status, 'error', level.id);
    assert.equal(ev.formula.kind, 'bare-function', level.id);
    assert.equal(ev.message, 'Put brackets after sgn, e.g. sgn(x).', level.id);
    assert.equal(game.evaluate(level, 'sign (x-4)').status, 'ok', level.id);
  }
  const floor = game.evaluate(ch, R`\operatorname{floor}x`);
  assert.equal(floor.formula.kind, 'not-allowed');
  assert.equal(floor.message, engine.NOT_ALLOWED);
  assert.deepEqual(floor.formula.detail, ['Floor']);
  assert.equal(game.evaluate(lesson, R`\operatorname{floor}x`).formula.kind, 'bare-function');
});

test('generic recipes stay well below the bot (PLAN-v3 §B.5, §L.2)', () => {
  for (const ch of CHALLENGES) {
    // a sgn staircase through every dot: flat steps, jumps halfway between dots (or on a wall)
    const T = ch.targets, terms = [];
    let c = T[0][1];
    for (let i = 1; i < T.length; i++) {
      const wall = ch.walls.find((w) => w > T[i - 1][0] && w < T[i][0]), m = wall != null ? wall : (T[i - 1][0] + T[i][0]) / 2, k = (T[i][1] - T[i - 1][1]) / 2;
      terms.push(`${k.toFixed(2)}\\operatorname{sgn}\\left(x-${m.toFixed(2)}\\right)`);
      c += k;
    }
    const stairs = run(ch, (c.toFixed(2) + '+' + terms.join('+')).replace(/\+-/g, '-').replace(/x--/g, 'x+'));
    assert.equal(stairs.hitCount, T.length, `${ch.id}: the staircase hits every dot`);
    assert.ok(stairs.score < 0.2 * ch.bot.score, `${ch.id}: staircase ${stairs.score} vs bot ${ch.bot.score}`); // max 0.15
    for (const src of [R`3\sin(10x)`, R`6\sin(5x)`]) assert.ok(run(ch, src).score <= 0.02 * ch.bot.score, `${ch.id} ${src}`);
  }
});
