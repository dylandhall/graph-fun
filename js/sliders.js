// Graph Fun — slider maths for the variables a–d (PLAN-v3.md §C). Pure and DOM-free: the UI keeps one Slider per
// variable and asks this module for values and labels. value = offset + k·step, k ∈ [−STEPS, STEPS].
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? { formula: require('./formula.js') } : { formula: root.GF.formula });
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).sliders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var STEPS = 20;                                      // positions either side of the offset
  var DEFAULT_STEP = 0.1;
  var MIN_STEP = 1e-6, MAX_STEP = 1000;                // a typed step must lie in [MIN_STEP, MAX_STEP] (PLAN-v3 §L.9)
  var MAX_ABS = 1e6;                                   // offsets and values are clamped to ±MAX_ABS
  var MAX_DECIMALS = 6;
  var MINUS = '−';

  // Decimal places of a number as written (0.1 → 1, 2.35 → 2, 1e-7 → capped at MAX_DECIMALS).
  function decimalsOf(v) {
    if (!isFinite(v)) return 0;
    var s = String(Math.abs(v));
    if (s.indexOf('e-') >= 0) return MAX_DECIMALS;
    var i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(MAX_DECIMALS, s.length - i - 1);
  }

  function roundTo(v, d) { return Number(v.toFixed(d)); }
  function clampAbs(v) { return Math.max(-MAX_ABS, Math.min(MAX_ABS, v)); }
  function clampK(k) { return Math.max(-STEPS, Math.min(STEPS, Math.round(k) || 0)); }
  // Typed numbers: U+2212 / en dash minus and a decimal comma are fine; anything else that isn't a number → NaN.
  function parseNumber(text) {
    if (typeof text === 'number') return text;
    var t = String(text == null ? '' : text).trim().replace(/[−–]/g, '-').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  // A step as typed, rounded to MAX_DECIMALS: NaN unless it lies in [MIN_STEP, MAX_STEP].
  function parseStep(step) {
    var v = parseNumber(step);
    if (!isFinite(v)) return NaN;
    v = roundTo(v, MAX_DECIMALS);
    return v >= MIN_STEP && v <= MAX_STEP ? v : NaN;
  }
  // A stored step: any positive number is clamped into range; anything else → DEFAULT_STEP.
  function validStep(step) {
    var v = Number(step);
    if (step === null || step === '' || !isFinite(v) || !(v > 0)) return DEFAULT_STEP;
    return Math.max(MIN_STEP, Math.min(MAX_STEP, roundTo(v, MAX_DECIMALS) || MIN_STEP));
  }

  function decimals(s) { return Math.max(decimalsOf(s.offset), decimalsOf(s.step)); }
  function value(s) { return roundTo(clampAbs(s.offset + s.k * s.step), decimals(s)); }
  function min(s) { return roundTo(clampAbs(s.offset - STEPS * s.step), decimals(s)); }
  function max(s) { return roundTo(clampAbs(s.offset + STEPS * s.step), decimals(s)); }

  // "1.30", "−0.5": a fixed number of decimals so the label doesn't jitter while dragging.
  function format(v, d) {
    var t = (v === 0 ? 0 : v).toFixed(d == null ? decimalsOf(v) : d);
    if (/^-0(?:\.0*)?$/.test(t)) t = t.slice(1);
    return t.charAt(0) === '-' ? MINUS + t.slice(1) : t;
  }
  function label(s) { return format(value(s), decimals(s)); }

  function create(name, saved) {
    var dflt = deps.formula.DEFAULT_VALUES[name];
    var s = { name: name, offset: dflt != null ? dflt : 0, step: DEFAULT_STEP, k: 0 };
    return saved ? restore(s, saved) : s;
  }

  // A saved {value, offset, step}: keep the offset if the value lies on its grid within reach, else centre on it.
  function restore(s, saved) {
    var step = validStep(saved.step), off = Number(saved.offset), v = Number(saved.value);
    if (!isFinite(v)) v = isFinite(off) ? off : s.offset;
    v = clampAbs(roundTo(v, MAX_DECIMALS));
    off = isFinite(off) ? clampAbs(roundTo(off, MAX_DECIMALS)) : v;
    var k = Math.round((v - off) / step), next = { name: s.name, offset: off, step: step, k: k };
    if (Math.abs(k) > STEPS || value(next) !== v) next = { name: s.name, offset: v, step: step, k: 0 };
    return next;
  }

  function setK(s, k) { return { name: s.name, offset: s.offset, step: s.step, k: clampK(k) }; }
  function centre(s) { return { name: s.name, offset: value(s), step: s.step, k: 0 }; }
  // A new step (typed, or a number) zooms in or out around the current value. null when it isn't a number in
  // [MIN_STEP, MAX_STEP], so the field can revert.
  function setStep(s, step) {
    var v = parseStep(step);
    return isFinite(v) ? { name: s.name, offset: value(s), step: v, k: 0 } : null;
  }
  // Typing an offset sets the value to it (k = 0). Returns null for text that isn't a number.
  function setOffset(s, text) {
    var v = parseNumber(text);
    if (!isFinite(v)) return null;
    return { name: s.name, offset: clampAbs(roundTo(v, MAX_DECIMALS)), step: s.step, k: 0 };
  }
  function save(s) { return { value: value(s), offset: s.offset, step: s.step }; }

  // {a: Slider, …} → {a: 1.3, …} for engine.evaluate; only the names asked for (default: all present).
  function values(map, names) {
    var out = {};
    (names || Object.keys(map)).forEach(function (n) { if (map[n]) out[n] = value(map[n]); });
    return out;
  }

  return { STEPS: STEPS, DEFAULT_STEP: DEFAULT_STEP, MIN_STEP: MIN_STEP, MAX_STEP: MAX_STEP, MAX_ABS: MAX_ABS,
           MAX_DECIMALS: MAX_DECIMALS, parseNumber: parseNumber, parseStep: parseStep, validStep: validStep,
           decimalsOf: decimalsOf, decimals: decimals, value: value, min: min, max: max, format: format, label: label,
           create: create, restore: restore, setK: setK, centre: centre, setStep: setStep, setOffset: setOffset,
           save: save, values: values };
});
