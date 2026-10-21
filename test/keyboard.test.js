// The virtual keyboard layout (PLAN-v3 §C.7 and §L.11): four rows of exactly 10 key-widths, with a–d keys,
// a visible clear key and e^□ as a long-press on e.
const test = require('node:test');
const assert = require('node:assert/strict');
const keyboard = require('../js/keyboard.js');

const WIDE = { '[backspace]': 1.5, '[hide-keyboard]': 1.5, '[return]': 1.5 }; // MathLive's default widths
const width = (k) => (typeof k === 'string' ? WIDE[k] || 1 : k.width != null ? k.width : WIDE[k.label] || 1);
const name = (k) => (typeof k === 'string' ? k : k.label || k.latex);

test('four rows of exactly 10 key-widths, every key one wide', () => {
  const L = keyboard.LAYOUT;
  assert.equal(L.rows.length, 4);
  L.rows.forEach((row, i) => {
    assert.equal(row.reduce((s, k) => s + width(k), 0), 10, `row ${i + 1}`);
    row.forEach((k) => assert.equal(width(k), 1, `row ${i + 1}: ${name(k)}`));
  });
  assert.equal(L.displayEditToolbar, false);
});

test('rows 3 and 4: e 1 2 3 − a b c d ⌫ / ( 0 . ) + ← → clear hide ↵', () => {
  const [, , r3, r4] = keyboard.LAYOUT.rows;
  assert.deepEqual(r3.map(name), ['e', '[1]', '[2]', '[3]', '[-]', 'a', 'b', 'c', 'd', '[backspace]']);
  assert.deepEqual(r4.map(name), ['[(]', '[0]', '[.]', '[)]', '[+]', '[left]', '[right]', 'clear', '[hide-keyboard]',
    '[return]']);
});

test('a–d keys, x, π, e and the editing keys are all there', () => {
  const keys = keyboard.LAYOUT.rows.flat();
  const latex = keys.filter((k) => typeof k === 'object' && k.latex).map((k) => k.latex);
  for (const v of ['x', 'a', 'b', 'c', 'd', '\\pi', '\\exponentialE']) assert.ok(latex.includes(v), v);
  for (const v of ['a', 'b', 'c', 'd']) {
    const key = keys.find((k) => k.latex === v);
    assert.match(key.class, /\bgf-param\b/, v + ' is styled as a slider variable');
  }
  const labels = keys.map(name);
  for (const l of ['[backspace]', '[return]', '[hide-keyboard]', '[left]', '[right]']) assert.ok(labels.includes(l), l);
});

test('clear is a visible key and e^□ is a long-press on e', () => {
  const keys = keyboard.LAYOUT.rows.flat();
  const clear = keys.find((k) => k.label === 'clear');
  assert.ok(clear, 'a visible clear key');
  assert.equal(clear.command, 'deleteAll');
  const e = keys.find((k) => k.latex === '\\exponentialE');
  assert.ok(Array.isArray(e.variants) && e.variants.some((v) => v.latex === '\\exponentialE^{#?}'), 'e^□ variant');
  assert.ok(!keys.some((k) => typeof k === 'object' && k.latex === '\\exponentialE^{#?}'), 'no separate e^□ key');
});

test('install sets the layout and hides the edit toolbar', () => {
  const vk = {};
  assert.equal(keyboard.install(vk), true);
  assert.deepEqual(vk.layouts, [keyboard.LAYOUT]);
  assert.equal(vk.editToolbar, 'none');
  assert.equal(keyboard.install(null), false);
});
