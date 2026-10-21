const test = require('node:test');
const assert = require('node:assert/strict');
const { levels, curve, fnOf } = require('./helpers.js');

const { LEVELS, SANDBOX } = levels;
const W = (vp) => vp.xMax - vp.xMin;

test('level list shape', () => {
  assert.ok(LEVELS.length >= 15 && LEVELS.length <= 20);
  assert.equal(LEVELS.length, 19);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length, 'unique ids');
  LEVELS.forEach((l, i) => assert.equal(l.n, i + 1));
  for (const l of LEVELS) {
    for (const k of ['id', 'title', 'family', 'blurb', 'hint', 'whyNot']) {
      assert.equal(typeof l[k], 'string', `${l.id}.${k}`);
      assert.ok(l[k].length > 0, `${l.id}.${k} is empty`);
    }
    assert.equal(typeof l.ref.latex, 'string');
    assert.equal(typeof l.ref.text, 'string');
    assert.ok(Array.isArray(l.walls), `${l.id}.walls`);
    assert.equal(typeof l.hitRadius, 'number');
    assert.equal(l.hitRadius, levels.hitRadius(l));
    assert.equal(l.hitRadius, W(l.viewport) / 64);
    assert.equal(typeof l.piLabels, 'boolean');
    assert.equal(l.kind, 'lesson');
    assert.equal(levels.getLevel(l.id), l);
    assert.equal(levels.getChallenge(l.id), undefined);
  }
  assert.equal(levels.getLevel('nope'), undefined);
  assert.deepEqual(LEVELS.filter((l) => l.piLabels).map((l) => l.n), [12, 13, 14, 15, 16]);
  assert.deepEqual(LEVELS.filter((l) => l.walls.length).map((l) => l.id), ['recip', 'tan']);
});

test('blurbs and hints are balanced HTML with <math-span> formulas', () => {
  for (const l of [...LEVELS, SANDBOX]) {
    for (const html of [l.blurb, l.hint]) {
      const open = (html.match(/<math-span>/g) || []).length;
      const close = (html.match(/<\/math-span>/g) || []).length;
      assert.equal(open, close, `${l.id}: ${html}`);
      assert.ok(!/<(?!\/?math-span>)/.test(html), `${l.id}: only <math-span> tags: ${html}`);
      assert.ok(!/&(?![a-z]+;)/.test(html), `${l.id}: bare &`);
    }
    assert.ok(!/[<>&]/.test(l.whyNot), `${l.id}: whyNot is plain text`);
  }
  assert.match(levels.getLevel('vertex').hint, /two steps aside it drops 4/);
  for (const id of ['recip', 'tan']) assert.match(levels.getLevel(id).blurb, /inside the view/);
});

test('viewports are exactly 4:3 and walls lie inside them', () => {
  for (const l of LEVELS) {
    const vp = l.viewport;
    assert.equal(W(vp) * 3, (vp.yMax - vp.yMin) * 4, l.id);
    for (const c of l.walls) assert.ok(c > vp.xMin && c < vp.xMax, `${l.id} wall ${c}`);
  }
  assert.deepEqual(levels.getLevel('log').viewport, { xMin: -2, xMax: 10, yMin: -4.5, yMax: 4.5 });
  assert.deepEqual(levels.getLevel('damped').viewport, { xMin: -1, xMax: 11, yMin: -4.5, yMax: 4.5 });
  assert.equal(levels.getLevel('damped').hitRadius, 0.1875);
  assert.equal(levels.getLevel('gauss').targets.length, 9);
});

test('targets: at least 4, well inside the view, on the reference curve', () => {
  for (const l of LEVELS) {
    const vp = l.viewport, r = l.hitRadius;
    assert.ok(l.targets.length >= 4, l.id);
    const c = curve.sampleCurve(fnOf(l.ref.latex), vp);
    for (const [x, y] of l.targets) {
      const edge = Math.min(x - vp.xMin, vp.xMax - x, y - vp.yMin, vp.yMax - y);
      assert.ok(edge >= 2 * r, `${l.id} target (${x},${y}) is ${edge} from the edge`);
      let d = Infinity;
      for (const p of c.paths) for (let i = 1; i < p.length; i++) d = Math.min(d, curve.distPointSegment(x, y, ...p[i - 1], ...p[i]));
      assert.ok(d <= r / 10, `${l.id} target (${x},${y}) is ${d} from the reference`);
    }
  }
});

test('LaTeX and text references agree', () => {
  for (const l of LEVELS) {
    const a = fnOf(l.ref.latex), b = fnOf(l.ref.text);
    for (const x of [-3.7, -1.3, 0.3, 1.7, 2.9, 4.4]) {
      const va = a(x), vb = b(x);
      if (Number.isNaN(va) || Number.isNaN(vb)) assert.ok(Number.isNaN(va) && Number.isNaN(vb), `${l.id} @ ${x}`);
      else assert.ok(Math.abs(va - vb) < 1e-9, `${l.id} @ ${x}: ${va} vs ${vb}`);
    }
  }
});

test('SANDBOX is a target-free level outside LEVELS', () => {
  assert.equal(SANDBOX.id, 'sandbox');
  assert.equal(SANDBOX.n, 0);
  assert.equal(SANDBOX.title, 'Sandbox');
  assert.equal(SANDBOX.kind, 'sandbox');
  assert.deepEqual(SANDBOX.viewport, { xMin: -8, xMax: 8, yMin: -6, yMax: 6 });
  assert.deepEqual(SANDBOX.targets, []);
  assert.deepEqual(SANDBOX.walls, []);
  assert.equal(SANDBOX.hitRadius, 0.25);
  assert.ok(!LEVELS.includes(SANDBOX));
  assert.equal(levels.getLevel('sandbox'), undefined);
});

test('lessons open with a neutral prompt that names no family (PLAN-v3 §A)', () => {
  const words = /sin|cos|tan|log|ln|sqrt|root|parabol|line|slope|absolute|\|x|x\^|x²|e\^|exp|circle|bell|gauss|wave|cubic|recip|1\/x|<math-span>/i;
  for (const l of LEVELS) {
    assert.match(l.prompt, new RegExp('^Find a function whose graph goes through all ' + l.targets.length + ' dots\\.'), l.id);
    assert.ok(!words.test(l.prompt), `${l.id}: ${l.prompt}`);
    assert.equal(/red walls? inside the view/.test(l.prompt), l.walls.length > 0, l.id);
  }
  assert.equal(levels.getLevel('tan').prompt,
    'Find a function whose graph goes through all 7 dots. It can’t cross the red walls inside the view, so it has to jump.');
});
