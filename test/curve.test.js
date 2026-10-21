const test = require('node:test');
const assert = require('node:assert/strict');
const { curve, fnOf, A, near, R } = require('./helpers.js');

const sample = (src, vp = A, opts) => curve.sampleCurve(fnOf(src), vp, opts);
const segments = (paths) => paths.flatMap((p) => p.slice(1).map((q, i) => [p[i], q]));

test('straight lines measure their exact length', () => {
  assert.ok(near(sample('3').length, 16, 1e-9));
  assert.ok(near(sample('0.5x').length, 16 * Math.sqrt(1.25), 1e-6));
  assert.ok(near(sample('x', { xMin: -4, xMax: 4, yMin: -5, yMax: 5 }).length, 8 * Math.SQRT2, 1e-6));
  const x = sample('x');
  assert.ok(near(x.length, 12 * Math.SQRT2 + 4, 1e-6), 'off-screen parts count their width');
  assert.ok(near(x.breakdown.offscreen, 4, 1e-6));
});

test('off-screen and undefined functions cost the full width', () => {
  const high = sample('100');
  assert.ok(near(high.length, 16, 1e-9));
  assert.equal(high.breakdown.ink, 0);
  assert.equal(high.paths.length, 0);
  for (const src of [R`\sqrt{-(x-2)^2}`, R`\sqrt{-1-x^2}`]) {
    const c = sample(src);
    assert.ok(near(c.length, 16, 1e-9), src);
    assert.equal(c.paths.length, 0, src);
    assert.equal(c.pieceCount, 0, src);
    assert.ok(near(c.breakdown.undefinedGap, 16, 1e-9), src);
  }
});

test('wiggles are measured, extreme wiggles saturate', () => {
  assert.ok(near(sample(R`\sin x`).length, 19.394, 0.002));
  const s200 = sample(R`\sin(200x)`);
  assert.equal(s200.saturated, false);
  assert.ok(near(s200.length, 2036, 2036 * 0.02), `sin(200x) L=${s200.length}`);
  const s100 = sample(R`10\sin(100x)`);
  assert.ok(near(s100.length, 6117, 6117 * 0.02), `10sin(100x) L=${s100.length}`);
  const s1000 = sample(R`\sin(1000x)`);
  assert.equal(s1000.saturated, true);
  assert.equal(s1000.length, Infinity);
  assert.ok(s1000.evals <= curve.DEFAULTS.maxEvals + 1);
});

test('asymptotes break the curve and cost their clamped height', () => {
  const r = sample(R`\frac{1}{x}`);
  assert.ok(near(r.length, 36.94, 0.01), `1/x L=${r.length}`);
  assert.ok(near(r.breakdown.penLift, 12, 1e-9));
  assert.equal(r.pieceCount, 2);
  for (const [[x0], [x1]] of segments(r.paths)) assert.ok(!(x0 < 0 && x1 > 0), 'no segment spans x=0');
  assert.equal(r.lifts.length, 1);
  const [[lx0, ly0], [lx1, ly1]] = r.lifts[0];
  assert.ok(Math.abs(lx0) < 1e-3 && Math.abs(lx1) < 1e-3);
  assert.deepEqual([ly0, ly1], [-6, 6], 'lift ends are clamped to the view');

  const t = sample(R`\tan x`);
  assert.ok(near(t.length, 137.41, 0.01), `tan L=${t.length}`);
  assert.ok(near(t.breakdown.penLift, 72, 1e-9));
  assert.equal(t.pieceCount, 7);
  assert.equal(t.lifts.length, 6);
});

test('jump functions are never cheaper than drawing the climb', () => {
  const floor = sample(R`\lfloor x\rfloor`);
  assert.ok(near(floor.length, 28, 0.01), `floor L=${floor.length}`);
  assert.ok(floor.length > sample('x').length);
  assert.ok(floor.lifts.every(([a, b]) => a[1] !== b[1]), 'zero-height lifts are omitted');
  assert.ok(near(sample(R`3\operatorname{sgn}(x)`).length, 22, 0.01));
});

test('a domain boundary is found precisely', () => {
  const c = sample(R`\sqrt{x}`);
  assert.ok(near(c.length, 16.731, 0.001), `sqrt L=${c.length}`);
  assert.ok(near(c.breakdown.undefinedGap, 8, 1e-3));
  const [x0, y0] = c.paths[0][0];
  assert.ok(x0 >= 0 && x0 < 1e-5 && y0 < 3e-3, `first point (${x0}, ${y0})`);
});

test('sampling is deterministic', () => {
  const a = sample(R`\sin(3x)+\frac{1}{x-1}`), b = sample(R`\sin(3x)+\frac{1}{x-1}`);
  assert.equal(a.length, b.length);
  assert.equal(a.evals, b.evals);
  assert.deepEqual(a.paths, b.paths);
});

test('a throwing function is treated as undefined', () => {
  const c = curve.sampleCurve((x) => { if (x > 0) throw new Error('boom'); return x; }, A);
  assert.ok(Number.isFinite(c.length));
  assert.ok(near(c.breakdown.undefinedGap, 8, 1e-3));
  assert.ok(c.paths.every((p) => p.every(([x]) => x <= 1e-3)));
  const junk = curve.sampleCurve(() => 'nope', A);
  assert.equal(junk.pieceCount, 0);
});

test('the time budget stops sampling', () => {
  let t = 0;
  const c = curve.sampleCurve((x) => x, A, { timeBudgetMs: 5, now: () => t++ });
  assert.equal(c.timedOut, true);
  assert.equal(c.saturated, true);
  assert.equal(c.length, Infinity);
  // a slow function is not called again once the budget is spent (not even for the initial grid)
  let clock = 0, calls = 0;
  const slow = curve.sampleCurve((x) => { calls++; clock += 10; return x; }, A, { timeBudgetMs: 300, now: () => clock });
  assert.equal(slow.timedOut, true);
  assert.ok(calls <= 31, `${calls} calls after the budget ran out`);
});

test('paths are clipped to the view plus a 5% margin', () => {
  const c = sample('x^2');
  assert.equal(c.paths.length, 1);
  for (const [x, y] of c.paths[0]) assert.ok(y <= 6.6 + 1e-9 && x >= -8 && x <= 8);
  const parts = sample(R`\tan x`).paths;
  for (const p of parts) for (const [, y] of p) assert.ok(Math.abs(y) <= 6.6 + 1e-9);
  assert.equal(sample(R`10\sin(x)`).paths.length, 5, 'a new path each time the curve re-enters');
});

test('clipSegmentT', () => {
  const R0 = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
  assert.deepEqual(curve.clipSegmentT(1, 1, 9, 9, R0), [0, 1]);
  assert.deepEqual(curve.clipSegmentT(-5, 5, 15, 5, R0), [0.25, 0.75]);
  assert.deepEqual(curve.clipSegmentT(5, -10, 5, 20, R0), [1 / 3, 2 / 3]);
  assert.equal(curve.clipSegmentT(-5, -5, -1, 20, R0), null);
  assert.equal(curve.clipSegmentT(0, 11, 10, 12, R0), null);
  assert.deepEqual(curve.clipSegmentT(0, 10, 10, 10, R0), [0, 1], 'on the edge counts as inside');
});

test('distPointSegment', () => {
  assert.equal(curve.distPointSegment(0, 1, -1, 0, 1, 0), 1);
  assert.equal(curve.distPointSegment(3, 4, 0, 0, 0, 0), 5);
  assert.equal(curve.distPointSegment(5, 0, 0, 0, 2, 0), 3);
  assert.ok(near(curve.distPointSegment(0, 0, 1, 0, 0, 1), Math.SQRT1_2, 1e-12));
});

test('constants', () => {
  assert.equal(curve.VPX, 1000);
  assert.deepEqual({ ...curve.DEFAULTS, now: null }, { initialIntervals: 1000, maxDepth: 12, maxEvals: 50000,
    flatTolPx: 0.5, jumpPx: 4, clipMargin: 0.05, timeBudgetMs: Infinity, now: null });
  assert.equal(curve.SLOW, undefined);
});
