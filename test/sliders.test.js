// Slider maths for the variables a–d (PLAN-v3.md §C.3, typed step §L.9).
const test = require('node:test');
const assert = require('node:assert/strict');
const sliders = require('../js/sliders.js');
const { formula } = require('./helpers.js');

test('defaults: a = b = 1, c = d = 0, step 0.1, ±20 steps', () => {
  assert.deepEqual({ ...formula.DEFAULT_VALUES }, { a: 1, b: 1, c: 0, d: 0 });
  assert.deepEqual([...formula.VARIABLES], ['a', 'b', 'c', 'd']);
  assert.equal(sliders.STEPS, 20);
  assert.equal(sliders.DEFAULT_STEP, 0.1);
  assert.deepEqual([sliders.MIN_STEP, sliders.MAX_STEP], [1e-6, 1000]);
  assert.equal(sliders.STEP_OPTIONS, undefined, 'the step is typed, not picked from a list');
  const a = sliders.create('a'), c = sliders.create('c');
  assert.deepEqual(a, { name: 'a', offset: 1, step: 0.1, k: 0 });
  assert.equal(sliders.value(a), 1);
  assert.equal(sliders.min(a), -1);
  assert.equal(sliders.max(a), 3);
  assert.equal(sliders.min(c), -2);
  assert.equal(sliders.label(a), '1.0');
  assert.equal(sliders.label(c), '0.0');
});

test('values are clean decimals at every position', () => {
  for (const step of [1000, 5, 1, 0.5, 0.25, 0.3, 0.1, 0.05, 0.01, 0.003, 0.001, 0.0001, 1e-6]) {
    for (const offset of [0, 1, -0.7, 2.35, 0.1, 1e-3, -12.125, 0.000002]) {
      let s = sliders.create('a', { value: offset, offset, step });
      for (let k = -20; k <= 20; k++) {
        const v = sliders.value(sliders.setK(s, k));
        const d = Math.max(sliders.decimalsOf(offset), sliders.decimalsOf(step));
        assert.ok(sliders.decimalsOf(v) <= d, `${offset} + ${k}·${step} = ${v}`);
        assert.ok(Math.abs(v - (offset + k * step)) < 1e-9);
      }
    }
  }
  const s = sliders.setK(sliders.create('c'), 3); // 0 + 3·0.1 is 0.30000000000000004 in floating point
  assert.equal(sliders.value(s), 0.3);
  assert.equal(sliders.label(s), '0.3');
  assert.equal(sliders.label(sliders.setK(sliders.create('c'), -3)), '−0.3');
  assert.equal(sliders.setK(s, 99).k, 20, 'k is clamped');
  assert.equal(sliders.setK(s, -99).k, -20);
});

test('centre, step and offset', () => {
  let s = sliders.setK(sliders.create('a'), 7);            // 1.7
  s = sliders.centre(s);
  assert.deepEqual(s, { name: 'a', offset: 1.7, step: 0.1, k: 0 });
  s = sliders.setStep(sliders.setK(s, 3), 0.01);           // 2.0 → zoom in around it
  assert.deepEqual(s, { name: 'a', offset: 2, step: 0.01, k: 0 });
  assert.equal(sliders.label(sliders.setK(s, -4)), '1.96');
  assert.equal(sliders.max(s), 2.2);
  assert.deepEqual(sliders.setStep(s, '0,25'), { name: 'a', offset: 2, step: 0.25, k: 0 }, 'any typed step, comma decimals');
  assert.equal(sliders.label(sliders.setK(sliders.setStep(sliders.setK(s, 3), ' 0.5 '), -1)), '1.53', 're-centres on the value');
  assert.equal(sliders.setStep(s, 1000).step, 1000);
  assert.equal(sliders.setStep(s, '1e-6').step, 0.000001);
  assert.equal(sliders.setStep(s, 0.0000004), null, 'rounds to 6 decimals: 0 is not a step');
  for (const bad of ['', 'abc', '0', '−1', -0.5, 1001, '1e9', NaN, Infinity, null]) assert.equal(sliders.setStep(s, bad), null, String(bad));
  const t = sliders.setOffset(sliders.setK(s, 5), ' −2,5 ');
  assert.deepEqual(t, { name: 'a', offset: -2.5, step: 0.01, k: 0 });
  assert.equal(sliders.label(t), '−2.50');
  assert.equal(sliders.setOffset(s, 'abc'), null);
  assert.equal(sliders.setOffset(s, ''), null);
  assert.equal(sliders.setOffset(s, '1e9').offset, sliders.MAX_ABS);
  assert.equal(sliders.setOffset(s, '–0.5').offset, -0.5, 'en dash minus');
});

test('parseNumber accepts U+2212 and decimal commas', () => {
  assert.equal(sliders.parseNumber('−1,25'), -1.25);
  assert.equal(sliders.parseNumber(' 3 '), 3);
  assert.ok(Number.isNaN(sliders.parseNumber('')));
  assert.ok(Number.isNaN(sliders.parseNumber('1.2.3')));
  assert.equal(sliders.parseNumber(0.5), 0.5);
});

test('save and restore', () => {
  const s = sliders.setK(sliders.setStep(sliders.create('b'), 0.01), -6); // offset 1, 0.94
  const saved = sliders.save(s);
  assert.deepEqual(saved, { value: 0.94, offset: 1, step: 0.01 });
  assert.deepEqual(sliders.create('b', saved), s);
  // a value off the grid or out of reach re-centres on the value
  assert.deepEqual(sliders.create('b', { value: 7, offset: 1, step: 0.1 }), { name: 'b', offset: 7, step: 0.1, k: 0 });
  assert.deepEqual(sliders.create('b', { value: 1.234, offset: 1, step: 0.1 }), { name: 'b', offset: 1.234, step: 0.1, k: 0 });
  assert.deepEqual(sliders.create('d', { value: 'x' }), { name: 'd', offset: 0, step: 0.1, k: 0 });
  assert.deepEqual(sliders.create('d', { value: 1.75, offset: 1, step: 0.25 }), { name: 'd', offset: 1, step: 0.25, k: 3 });
  assert.deepEqual(sliders.create('d', { value: 2, offset: 2, step: -1 }), { name: 'd', offset: 2, step: 0.1, k: 0 }, 'bad step → 0.1');
  assert.deepEqual(sliders.create('d', { value: 2, offset: 2, step: 5000 }).step, 1000, 'clamped into range');
  assert.deepEqual(sliders.values({ a: s, c: sliders.create('c') }), { a: 0.94, c: 0 });
  assert.deepEqual(sliders.values({ a: s, c: sliders.create('c') }, ['c', 'd']), { c: 0 });
});
