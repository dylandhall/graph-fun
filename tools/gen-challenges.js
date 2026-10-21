#!/usr/bin/env node
// Graph Fun — free-play challenge generator (PLAN-challenges.md §4, §5, §11).
//   node tools/gen-challenges.js            print the dots and the bot's best formula for every challenge
//   node tools/gen-challenges.js --write    also rewrite js/challenges.js (refuses to move the dots of an existing id)
//   node tools/gen-challenges.js --only c07,c12 [--write]   re-search just these bots (others are kept from the file)
//   node tools/gen-challenges.js --seeds other/challenges.js [--write]   also climb that file's bots as candidates
// The bots already in js/challenges.js are always re-judged and climbed too, so a re-bake never scores below them.
// Dots come from a seeded PRNG (no Math.random); the bot is scored through the same pipeline as engine.evaluate.
'use strict';
const fs = require('fs');
const path = require('path');
const curve = require('../js/curve.js');
const scoring = require('../js/scoring.js');
const formula = require('../js/formula.js');

const OUT = path.join(__dirname, '..', 'js', 'challenges.js');

// ---------------------------------------------------------------- dots

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWPORTS = {
  A: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
  S: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 },
  Q: { xMin: 0, xMax: 12, yMin: 0, yMax: 9 },
  W: { xMin: -10, xMax: 10, yMin: -7.5, yMax: 7.5 },
  O: { xMin: -2, xMax: 14, yMin: -3, yMax: 9 }
};

const SPECS = [
  { id: 'c01', title: 'Scatter', n: 5, vp: 'A', layout: 'scatter' },
  { id: 'c02', title: 'Uphill Drift', n: 5, vp: 'A', layout: 'trend', dir: 1 },
  { id: 'c03', title: 'Swell', n: 5, vp: 'A', layout: 'wave' },
  { id: 'c04', title: 'Valley Floor', n: 6, vp: 'A', layout: 'bowl', dir: 1 },
  { id: 'c05', title: 'Pocket', n: 6, vp: 'S', layout: 'scatter' },
  { id: 'c06', title: 'Zigzag Alley', n: 6, vp: 'A', layout: 'zigzag' },
  { id: 'c07', title: 'Two Islands', n: 6, vp: 'A', layout: 'clusters', k: 2 },
  { id: 'c08', title: 'Morning Climb', n: 7, vp: 'Q', layout: 'trend', dir: 1 },
  { id: 'c09', title: 'Hilltop', n: 7, vp: 'A', layout: 'bowl', dir: -1 },
  { id: 'c10', title: 'The Fence', n: 7, vp: 'A', layout: 'steps', walls: 1 },
  { id: 'c11', title: 'Confetti', n: 7, vp: 'W', layout: 'scatter' },
  { id: 'c12', title: 'Choppy Water', n: 8, vp: 'A', layout: 'wavetrend', dir: 1 },
  { id: 'c13', title: 'Landslide', n: 8, vp: 'O', layout: 'trend', dir: -1 },
  { id: 'c14', title: 'Archipelago', n: 8, vp: 'A', layout: 'clusters', k: 3 },
  { id: 'c15', title: 'Hurdles', n: 8, vp: 'A', layout: 'scatter', walls: 2 },
  { id: 'c16', title: 'Starfield', n: 9, vp: 'A', layout: 'scatter' },
  { id: 'c17', title: 'Switchback', n: 9, vp: 'W', layout: 'zigzag', dir: 1 },
  { id: 'c18', title: 'Rapids', n: 9, vp: 'S', layout: 'wave' },
  { id: 'c19', title: 'Split Decision', n: 10, vp: 'A', layout: 'steps', walls: 1 },
  { id: 'c20', title: 'Pandemonium', n: 10, vp: 'A', layout: 'scatter', walls: 1 }
];
const BASE_SEED = 20261018;

const JUMP = ', so make your graph jump — try sgn (long-press the |x| key).';
function blurbOf(spec) {
  switch (spec.layout) {
    case 'scatter':
      if (!spec.walls) return 'No pattern at all. How many dots can one short formula catch?';
      return spec.walls > 1 ? 'Random dots and red walls. Crossing a wall inside the view halves your score' + JUMP
        : 'Random dots and a red wall. Crossing it inside the view halves your score' + JUMP;
    case 'trend': return spec.dir > 0 ? 'The dots drift uphill, with a wobble.' : 'Everything slides downhill, unevenly.';
    case 'wave': return 'Something wavy is going on.';
    case 'wavetrend': return 'Waves on a slope.';
    case 'bowl': return spec.dir > 0 ? 'The dots sag in the middle.' : 'The dots bulge in the middle.';
    case 'zigzag': return 'Up, down, up, down…';
    case 'clusters': return 'The dots huddle in groups.';
    case 'steps': return 'A red wall splits the dots in two. Crossing it inside the view halves your score' + JUMP;
  }
  throw new Error('layout ' + spec.layout);
}

// Port of the prototype gen.js: the PRNG call order (per attempt: x positions, wall picks, φ, cyc, t0, flip,
// cluster y/tilt, then y values) is what the baked dots depend on.
function generateDots(spec) {
  const seed = BASE_SEED + Number(spec.id.slice(1)) * 7919;
  const rnd = mulberry32(seed);
  const U = (a, b) => a + (b - a) * rnd();
  const N = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const vp = VIEWPORTS[spec.vp], W = vp.xMax - vp.xMin, H = vp.yMax - vp.yMin, r = W / 64, s = W / 16;
  const m = 3 * r;
  const x0 = vp.xMin + m, x1 = vp.xMax - m;
  const cx = (vp.xMin + vp.xMax) / 2, cy = (vp.yMin + vp.yMax) / 2, hw = W / 2 - m, hh = H / 2 - m;
  const round1 = (v) => Math.round(v * 10) / 10;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const n = spec.n;
    let xs = [];
    if (spec.layout === 'clusters') {
      const k = spec.k, bw = (x1 - x0) / k;
      const centers = Array.from({ length: k }, (_, j) => x0 + bw * (j + U(0.3, 0.7)));
      for (let i = 0; i < n; i++) xs.push(centers[Math.floor(i * k / n)] + U(-1, 1) * 1.6 * s);
    } else {
      const bw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) xs.push(x0 + bw * (i + U(0.1, 0.9)));
    }
    xs = xs.map(round1).sort((a, b) => a - b);
    // walls: midpoints (rounded to 0.5) of wide gaps near the middle, with >= 2 dots each side
    const walls = [];
    if (spec.walls) {
      const gaps = [];
      for (let i = 2; i <= n - 2; i++) {
        const a = xs[i - 1], b = xs[i], w = Math.round((a + b)) / 2;
        if (b - a >= 1.6 * s && Math.abs(w - cx) <= 0.7 * hw && w - a >= 3 * r && b - w >= 3 * r) gaps.push(w);
      }
      if (gaps.length < spec.walls) continue;
      while (walls.length < spec.walls) walls.push(gaps.splice(Math.floor(rnd() * gaps.length), 1)[0]);
      walls.sort((a, b) => a - b);
    }
    const phase = U(0, 2 * Math.PI), cyc = U(1.0, 2.0), t0 = U(-0.3, 0.3), flip = rnd() < 0.5 ? -1 : 1;
    const cl = spec.layout === 'clusters';
    const cyl = cl ? Array.from({ length: spec.k }, () => cy + U(-0.7, 0.7) * hh) : null;
    const tilt = cl ? Array.from({ length: spec.k }, () => (rnd() < 0.5 ? -1 : 1) * U(0.4, 1.2)) : null;
    const xc = cl ? Array.from({ length: spec.k }, (_, j) => {
      const g = xs.filter((_, i) => Math.floor(i * spec.k / n) === j);
      return g.reduce((a, b) => a + b, 0) / g.length;
    }) : null;
    const ys = xs.map((x, i) => {
      const t = (x - cx) / hw;
      switch (spec.layout) {
        case 'scatter': return cy + U(-1, 1) * hh;
        case 'trend': return cy + spec.dir * 0.7 * hh * t + N() * 0.22 * hh;
        case 'wave': return cy + 0.65 * hh * Math.sin(Math.PI * cyc * (t + 1) + phase) + N() * 0.12 * hh;
        case 'wavetrend': return cy + spec.dir * 0.45 * hh * t + 0.45 * hh * Math.sin(Math.PI * cyc * 1.4 * (t + 1) + phase) + N() * 0.1 * hh;
        case 'bowl': return cy + spec.dir * hh * (1.6 * (t - t0) * (t - t0) - 0.65) + N() * 0.15 * hh;
        case 'zigzag': return cy + (i % 2 ? 1 : -1) * flip * U(0.3, 0.9) * hh + (spec.dir ? spec.dir * 0.3 * hh * t : 0);
        case 'clusters': { const j = Math.floor(i * spec.k / n); return cyl[j] + tilt[j] * (x - xc[j]) + N() * 0.3 * s; }
        case 'steps': return cy + (x < walls[0] ? -1 : 1) * flip * 0.5 * hh + N() * 0.3 * hh;
      }
      throw new Error('layout ' + spec.layout);
    });
    const pts = xs.map((x, i) => [x, round1(Math.max(cy - hh, Math.min(cy + hh, ys[i])))]);
    if (validateDots(pts, vp, walls, spec)) return { seed, attempt, viewport: vp, walls, targets: pts };
  }
  throw new Error('no layout for ' + spec.id);
}

// Most dots one horizontal line can hit (a 2r window on y).
function maxConstHits(pts, r) {
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < ys.length; i++) {
    let j = i;
    while (j < ys.length && ys[j] - ys[i] <= 2 * r + 1e-9) j++;
    best = Math.max(best, j - i);
  }
  return best;
}

// Most dots one straight line can hit: lines through pairs of dot centres and their ±0.98r band edges.
function maxLineHits(pts, r) {
  let best = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    const x0 = pts[i][0], y0 = pts[i][1] + a * r * 0.98, x1 = pts[j][0], y1 = pts[j][1] + b * r * 0.98;
    const m = (y1 - y0) / (x1 - x0), c = y0 - m * x0, k = Math.sqrt(1 + m * m);
    let h = 0;
    for (const p of pts) if (Math.abs(p[1] - (m * p[0] + c)) / k <= r) h++;
    best = Math.max(best, h);
  }
  return best;
}

function lineCap(spec) { return Math.floor(spec.n / 2) + (spec.layout === 'trend' ? 1 : 0); }

function validateDots(pts, vp, walls, spec) {
  const W = vp.xMax - vp.xMin, r = W / 64, s = W / 16;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (Math.min(x - vp.xMin, vp.xMax - x, y - vp.yMin, vp.yMax - y) < 3 * r - 1e-9) return false;
    if (i && x - pts[i - 1][0] < 0.8 * s - 1e-9) return false;
    if (i && Math.abs(y - pts[i - 1][1]) / (x - pts[i - 1][0]) > 5) return false;
    for (let j = 0; j < i; j++) if (Math.hypot(x - pts[j][0], y - pts[j][1]) < 3 * r) return false;
    for (const w of walls) if (Math.abs(x - w) < 3 * r) return false;
  }
  // every wall separates dots, and two walls have a dot between them
  for (const w of walls) if (!pts.some((p) => p[0] < w) || !pts.some((p) => p[0] > w)) return false;
  if (walls.length === 2 && !pts.some((p) => p[0] > walls[0] && p[0] < walls[1])) return false;
  if (spec) {
    if (maxConstHits(pts, r) > (pts.length <= 6 ? 1 : 2)) return false;
    if (maxLineHits(pts, r) > lineCap(spec)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- bot search (RANSAC over linear families)

function solve(A, b) { // Gaussian elimination with partial pivoting; null if singular
  const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function lsq(rows, ys) { // normal equations
  const k = rows[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  rows.forEach((r, i) => { for (let a = 0; a < k; a++) { b[a] += r[a] * ys[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; } });
  return solve(A, b);
}
function binom(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
function combos(n, k, max, rnd) {
  const out = [];
  if (binom(n, k) <= max) {
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }
  const seen = new Set();
  while (out.length < max) {
    const s = new Set();
    while (s.size < k) s.add(Math.floor(rnd() * n));
    const c = [...s].sort((a, b) => a - b), key = c.join();
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  }
  return out;
}
const range = (a, b, st) => { const o = []; for (let v = a; v <= b + 1e-9; v += st) o.push(Math.round(v * 1000) / 1000); return o; };
const pairs = (k) => { const o = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) o.push([k[i], k[j]]); return o; };
const sg = (x, c) => Math.sign(x - c);

const LABELS = {
  const: 'constant', line: 'line', quad: 'parabola', cubic: 'cubic', quartic: 'quartic', V: 'V', Vline: 'V + line',
  W2: 'two Vs', sin: 'wave', sinline: 'wave + line', exp: 'exponential', expline: 'exponential + line',
  gauss: 'bell', rat: 'reciprocal', ratline: 'reciprocal + line', rat2: 'two reciprocals',
  rat2line: 'two reciprocals + line', tan: 'tangent', tan2: 'tangent', step: 'step', stepline: 'step + line',
  stepsin: 'step + wave', stepquad: 'step + parabola', step2: 'two steps', step2line: 'two steps + line'
};

// Families (nominal size), linear in their coefficients for fixed shape parameters `th`.
function families(level) {
  const vp = level.viewport, W = vp.xMax - vp.xMin, s = 16 / W, xs = level.targets.map((t) => t[0]), w = level.walls;
  const knots = [];
  xs.forEach((x, i) => { knots.push(x); if (i) knots.push((x + xs[i - 1]) / 2); });
  const bs = range(0.15, 4, 0.01).map((b) => b * s);
  const ebs = range(-1.5, 1.5, 0.02).filter((b) => Math.abs(b) > 0.01).map((b) => b * s);
  const gauss = [];
  for (let h = vp.xMin; h <= vp.xMax; h += 0.25 / s) for (const g of [0.5, 1, 2, 4, 8, 16]) gauss.push([h, g / (s * s)]);
  const F = [
    { name: 'const', size: 1, grid: [null], basis: () => [1] },
    { name: 'line', size: 5, grid: [null], basis: (x) => [x, 1] },
    { name: 'quad', size: 11, grid: [null], basis: (x) => [x * x, x, 1] },
    { name: 'cubic', size: 17, grid: [null], basis: (x) => [x * x * x, x * x, x, 1] },
    { name: 'quartic', size: 23, grid: [null], basis: (x) => [x ** 4, x ** 3, x * x, x, 1] },
    { name: 'V', size: 8, grid: knots, basis: (x, h) => [Math.abs(x - h), 1] },
    { name: 'Vline', size: 12, grid: knots, basis: (x, h) => [Math.abs(x - h), x, 1] },
    { name: 'W2', size: 15, grid: pairs(knots), basis: (x, h) => [Math.abs(x - h[0]), Math.abs(x - h[1]), 1] },
    { name: 'sin', size: 10, grid: bs, basis: (x, b) => [Math.sin(b * x), Math.cos(b * x), 1] },
    { name: 'sinline', size: 14, grid: bs, basis: (x, b) => [Math.sin(b * x), Math.cos(b * x), x, 1] },
    { name: 'exp', size: 9, grid: ebs, basis: (x, b) => [Math.exp(b * x), 1] },
    { name: 'expline', size: 13, grid: ebs, basis: (x, b) => [Math.exp(b * x), x, 1] },
    { name: 'gauss', size: 14, grid: gauss, basis: (x, g) => [Math.exp(-((x - g[0]) ** 2) / g[1]), 1] }
  ];
  for (const wall of w) {
    F.push({ name: 'rat', size: 7, grid: [wall], basis: (x, c) => [1 / (x - c), 1] });
    F.push({ name: 'ratline', size: 11, grid: [wall], basis: (x, c) => [1 / (x - c), x, 1] });
    F.push({ name: 'tan', size: 10, grid: range(0.1, 3, 0.01).map((b) => [b * s, wall]), basis: (x, g) => [-1 / Math.tan(g[0] * (x - g[1])), 1] });
  }
  for (const wall of w) {
    F.push({ name: 'step', size: 8, grid: [wall], basis: (x, c) => [sg(x, c), 1] });
    F.push({ name: 'stepline', size: 12, grid: [wall], basis: (x, c) => [sg(x, c), x, 1] });
    F.push({ name: 'stepsin', size: 17, grid: bs.filter((_, i) => i % 3 === 0).map((b) => [b, wall]), basis: (x, g) => [sg(x, g[1]), Math.sin(g[0] * x), Math.cos(g[0] * x), 1] });
    F.push({ name: 'stepquad', size: 18, grid: [wall], basis: (x, c) => [sg(x, c), x * x, x, 1] });
  }
  if (w.length === 2) {
    F.push({ name: 'step2', size: 15, grid: [w], basis: (x, c) => [sg(x, c[0]), sg(x, c[1]), 1] });
    F.push({ name: 'step2line', size: 19, grid: [w], basis: (x, c) => [sg(x, c[0]), sg(x, c[1]), x, 1] });
    F.push({ name: 'rat2', size: 13, grid: [w], basis: (x, c) => [1 / (x - c[0]), 1 / (x - c[1]), 1] });
    F.push({ name: 'rat2line', size: 17, grid: [w], basis: (x, c) => [1 / (x - c[0]), 1 / (x - c[1]), x, 1] });
    const b0 = Math.PI / (w[1] - w[0]);
    F.push({ name: 'tan2', size: 10, grid: [1, 2, 3].map((k) => [b0 * k, w[0]]), basis: (x, g) => [-1 / Math.tan(g[0] * (x - g[1])), 1] });
  }
  // §11.C: sgn steps on every level, jumping between neighbouring dots (at the wall where one splits them).
  // Appended last so the families above keep their share of the RANSAC random stream.
  const jumps = [];
  for (let i = 1; i < xs.length; i++) {
    const wall = w.find((c) => c > xs[i - 1] && c < xs[i]);
    jumps.push(wall != null ? wall : (xs[i - 1] + xs[i]) / 2);
  }
  const free = jumps.filter((j) => w.indexOf(j) < 0);
  const jumpPairs = pairs(jumps).filter((p) => !(w.length === 2 && p[0] === w[0] && p[1] === w[1]));
  if (free.length) {
    F.push({ name: 'step', size: 8, grid: free, basis: (x, c) => [sg(x, c), 1] });
    F.push({ name: 'stepline', size: 12, grid: free, basis: (x, c) => [sg(x, c), x, 1] });
  }
  if (jumpPairs.length) {
    F.push({ name: 'step2', size: 15, grid: jumpPairs, basis: (x, c) => [sg(x, c[0]), sg(x, c[1]), 1] });
    F.push({ name: 'step2line', size: 19, grid: jumpPairs, basis: (x, c) => [sg(x, c[0]), sg(x, c[1]), x, 1] });
  }
  return F;
}

function fnOf(fam, coefs, th) {
  return (x) => { const b = fam.basis(x, th); let v = 0; for (let i = 0; i < b.length; i++) v += coefs[i] * b[i]; return v; };
}

function realEval(f, level) {
  const c = curve.sampleCurve(f, level.viewport);
  const h = scoring.hitTargets(c.paths, level.targets, level.hitRadius).filter(Boolean).length;
  const w = scoring.crossedWalls(c.paths, level.walls, level.viewport).filter(Boolean).length;
  return { h, w, L: c.length };
}

// Quick length: 400-segment polyline, off-screen and NaN billed by width (no pen-lifts).
function quickLength(f, vp) {
  const N = 400, W = vp.xMax - vp.xMin;
  let L = 0, px = vp.xMin, py = f(px);
  for (let i = 1; i <= N; i++) {
    const x = vp.xMin + W * i / N, y = f(x);
    if (!isFinite(y) || !isFinite(py)) L += x - px;
    else {
      const c = curve.clipSegmentT(px, py, x, y, vp), inn = c ? c[1] - c[0] : 0;
      L += inn * Math.hypot(x - px, y - py) + (1 - inn) * (x - px);
    }
    px = x; py = y;
  }
  return L;
}

// The same length and size factors as scoring.challengeScore (PLAN-v3 §B.1, §L.1, §L.2).
const LF = (L, P) => scoring.lengthFactor(L / P), SF = scoring.sizeFactor;
function scoreOf(c, level, P) {
  const n = level.targets.length;
  return Math.round(1000 * (c.h / n) * LF(c.L, P) * SF(c.size) * Math.pow(0.5, c.w));
}

// One family: solve every k-subset of dots exactly (sampled when there are too many), refit on the hit set,
// rank by quick length, then real-sample the best and keep the shortest per (hits, walls).
function searchFamily(fam, level, rnd, P) {
  const T = level.targets, n = T.length, r = level.hitRadius, k = fam.basis(0, fam.grid[0]).length;
  const subsets = combos(n, k, 150, rnd), pool = new Map(), eps = 1e-4;
  for (const th of fam.grid) {
    const B = T.map((t) => fam.basis(t[0], th)), Bp = T.map((t) => fam.basis(t[0] + eps, th)), Bm = T.map((t) => fam.basis(t[0] - eps, th));
    if (B.some((row) => row.some((v) => !isFinite(v)))) continue;
    const hitsOf = (c) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        let v = 0, vp = 0, vm = 0;
        for (let j = 0; j < k; j++) { v += c[j] * B[i][j]; vp += c[j] * Bp[i][j]; vm += c[j] * Bm[i][j]; }
        const sl = (vp - vm) / (2 * eps);
        if (Math.abs(v - T[i][1]) / Math.sqrt(1 + sl * sl) <= 0.9 * r) out.push(i);
      }
      return out;
    };
    for (const sub of subsets) {
      let c = solve(sub.map((i) => B[i]), sub.map((i) => T[i][1]));
      if (!c || c.some((v) => !isFinite(v) || Math.abs(v) > 1e4)) continue;
      let hitIdx = hitsOf(c);
      if (hitIdx.length > k) {
        const c2 = lsq(hitIdx.map((i) => B[i]), hitIdx.map((i) => T[i][1]));
        if (c2 && c2.every(isFinite)) { const h2 = hitsOf(c2); if (h2.length >= hitIdx.length) { c = c2; hitIdx = h2; } }
      }
      const key = hitIdx.join(',') + '|' + JSON.stringify(th);
      if (!pool.has(key)) pool.set(key, { coefs: c, th, hq: hitIdx.length });
    }
  }
  const list = [...pool.values()], hmax = list.reduce((m, c) => Math.max(m, c.hq), 0), sizeF = SF(fam.size);
  const est = list.filter((c) => c.hq >= hmax - 2).map((c) => {
    const Lq = quickLength(fnOf(fam, c.coefs, c.th), level.viewport);
    return Object.assign(c, { est: (c.hq / n) * LF(Lq, P) * sizeF });
  }).sort((a, b) => b.est - a.est).slice(0, 150);
  const best = new Map();
  for (const c of est) {
    const e = realEval(fnOf(fam, c.coefs, c.th), level);
    if (!isFinite(e.L)) continue;
    const key = e.h + '|' + e.w, prev = best.get(key);
    if (!prev || e.L < prev.L) best.set(key, { fam, size: fam.size, coefs: c.coefs, th: c.th, h: e.h, w: e.w, L: e.L });
  }
  return [...best.values()];
}

// Coordinate search on the JS closure: real score + a small centring bonus (keeps hits robust to rounding).
const NOTUNE = { V: 1, Vline: 1, W2: 1, rat: 1, ratline: 1, rat2: 1, rat2line: 1, step: 1, stepline: 1, stepquad: 1, step2: 1, step2line: 1 };
const flat = (th) => th == null ? [] : Array.isArray(th) ? th.slice() : [th];
const unflat = (th, v) => th == null ? null : Array.isArray(th) ? v : v[0];
function objective(fam, coefs, th, level, P, size) {
  const f = fnOf(fam, coefs, th), e = realEval(f, level), n = level.targets.length;
  const s = 1000 * (e.h / n) * LF(e.L, P) * SF(size) * Math.pow(0.5, e.w);
  let bonus = 0;
  for (const t of level.targets) bonus += Math.max(-1, Math.min(0.6, 1 - Math.abs(f(t[0]) - t[1]) / level.hitRadius));
  return isFinite(s) ? s + 0.5 * bonus : -1;
}
function refine(c, level, P) {
  const name = c.fam.name, thv = flat(c.th);
  const tunable = NOTUNE[name] ? [] : thv.map((_, i) => i).filter((i) => !(name.startsWith('tan') || name === 'stepsin') || i === 0);
  let coefs = c.coefs.slice(), th = thv.slice();
  let best = objective(c.fam, coefs, unflat(c.th, th), level, P, c.size);
  for (const step of [0.05, 0.01, 0.003]) {
    let improved = true, guard = 0;
    while (improved && guard++ < 6) {
      improved = false;
      const dims = coefs.map((_, i) => ['c', i]).concat(tunable.map((i) => ['t', i]));
      for (const [kind, i] of dims) for (const sgn of [1, -1]) {
        const cc = coefs.slice(), tt = th.slice();
        if (kind === 'c') cc[i] += sgn * step * Math.max(0.2, Math.abs(cc[i])); else tt[i] += sgn * step * Math.max(0.2, Math.abs(tt[i]));
        const o = objective(c.fam, cc, unflat(c.th, tt), level, P, c.size);
        if (o > best + 1e-9) { best = o; coefs = cc; th = tt; improved = true; }
      }
    }
  }
  return Object.assign({}, c, { coefs, th: unflat(c.th, th) });
}

// ---------------------------------------------------------------- LaTeX formatting

function num(v, d) {
  let s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
function join(terms) { // signed terms; '+-' folded
  terms = terms.filter((t) => t && t !== '0');
  if (!terms.length) return '0';
  return terms.map((t, i) => (i === 0 || t[0] === '-' ? t : '+' + t)).join('');
}
function coef(c, body, d) { // c·body with 1 / −1 elided
  const s = num(c, d);
  return s === '0' ? '' : s === '1' ? body : s === '-1' ? '-' + body : s + body;
}
function shift(h, d) { const s = num(-h, d); return s === '0' ? 'x' : (s[0] === '-' ? 'x' + s : 'x+' + s); } // x − h
function lin(b, c, d) { const cs = num(c, d); return join([coef(b, 'x', d), cs === '0' ? '' : cs]); }
function wrapAngle(c, period) { while (c > period / 2) c -= period; while (c <= -period / 2) c += period; return c; }
function frac(a, w, d) {
  const s = num(a, d);
  if (s === '0') return '';
  const neg = s[0] === '-';
  return (neg ? '-' : '') + '\\frac{' + (neg ? s.slice(1) : s) + '}{' + shift(w, d) + '}';
}

function latexOf(fam, coefs, th, d) {
  const C = (i, body) => coef(coefs[i], body, d), Kc = (i) => num(coefs[i], d);
  const abs = (h) => '\\left|' + shift(h, d) + '\\right|';
  const sgn = (w) => '\\operatorname{sgn}\\left(' + shift(w, d) + '\\right)';
  const sinT = (p, q, b) => {
    const A = Math.hypot(p, q), ph = wrapAngle(Math.atan2(q, p), 2 * Math.PI);
    return coef(A, '\\sin\\left(' + lin(b, ph, d) + '\\right)', d);
  };
  switch (fam) {
    case 'const': return Kc(0);
    case 'line': return join([C(0, 'x'), Kc(1)]);
    case 'quad': return join([C(0, 'x^2'), C(1, 'x'), Kc(2)]);
    case 'cubic': return join([C(0, 'x^3'), C(1, 'x^2'), C(2, 'x'), Kc(3)]);
    case 'quartic': return join([C(0, 'x^4'), C(1, 'x^3'), C(2, 'x^2'), C(3, 'x'), Kc(4)]);
    case 'V': return join([C(0, abs(th)), Kc(1)]);
    case 'Vline': return join([C(0, abs(th)), C(1, 'x'), Kc(2)]);
    case 'W2': return join([C(0, abs(th[0])), C(1, abs(th[1])), Kc(2)]);
    case 'sin': return join([sinT(coefs[0], coefs[1], th), Kc(2)]);
    case 'sinline': return join([sinT(coefs[0], coefs[1], th), C(2, 'x'), Kc(3)]);
    case 'exp': return join([C(0, 'e^{' + coef(th, 'x', d) + '}'), Kc(1)]);
    case 'expline': return join([C(0, 'e^{' + coef(th, 'x', d) + '}'), C(1, 'x'), Kc(2)]);
    case 'gauss': return join([C(0, 'e^{-\\frac{\\left(' + shift(th[0], d) + '\\right)^2}{' + num(th[1], d) + '}}'), Kc(1)]);
    case 'rat': return join([frac(coefs[0], th, d), Kc(1)]);
    case 'ratline': return join([frac(coefs[0], th, d), C(1, 'x'), Kc(2)]);
    case 'rat2': return join([frac(coefs[0], th[0], d), frac(coefs[1], th[1], d), Kc(2)]);
    case 'rat2line': return join([frac(coefs[0], th[0], d), frac(coefs[1], th[1], d), C(2, 'x'), Kc(3)]);
    case 'tan': case 'tan2': {
      const b = th[0], c = wrapAngle(Math.PI / 2 - b * th[1], Math.PI);
      return join([coef(coefs[0], '\\tan\\left(' + lin(b, c, d) + '\\right)', d), Kc(1)]);
    }
    case 'step': return join([C(0, sgn(th)), Kc(1)]);
    case 'stepline': return join([C(0, sgn(th)), C(1, 'x'), Kc(2)]);
    case 'stepquad': return join([C(0, sgn(th)), C(1, 'x^2'), C(2, 'x'), Kc(3)]);
    case 'stepsin': return join([C(0, sgn(th[1])), sinT(coefs[1], coefs[2], th[0]), Kc(3)]);
    case 'step2': return join([C(0, sgn(th[0])), C(1, sgn(th[1])), Kc(2)]);
    case 'step2line': return join([C(0, sgn(th[0])), C(1, sgn(th[1])), C(2, 'x'), Kc(3)]);
  }
  throw new Error('family ' + fam);
}

// The mechanical answer the size factor exists to stop: c + mx + Σ k|x − xᵢ| through every dot (2 decimals).
// variant 'lin' (default) bends at the interior dots; 'flat' also bends at the end dots and runs flat outside.
function chainLatex(level, variant) {
  const T = level.targets.slice().sort((a, b) => a[0] - b[0]), n = T.length, s = [], terms = [];
  for (let i = 1; i < n; i++) s.push((T[i][1] - T[i - 1][1]) / (T[i][0] - T[i - 1][0]));
  let m = 0;
  if (variant === 'flat') {
    terms.push([s[0] / 2, T[0][0]]);
    for (let i = 1; i < n - 1; i++) terms.push([(s[i] - s[i - 1]) / 2, T[i][0]]);
    terms.push([-s[n - 2] / 2, T[n - 1][0]]);
  } else {
    m = (s[0] + s[n - 2]) / 2;
    for (let i = 1; i < n - 1; i++) terms.push([(s[i] - s[i - 1]) / 2, T[i][0]]);
  }
  const base = (x) => m * x + terms.reduce((v, [k, a]) => v + k * Math.abs(x - a), 0);
  const parts = terms.map(([k, a]) => coef(k, '\\left|' + shift(a, 2) + '\\right|', 2));
  if (variant !== 'flat') parts.push(coef(m, 'x', 2));
  parts.push(num(T[0][1] - base(T[0][0]), 2));
  return join(parts);
}

// Every formula one ±1 step in the last printed digit of one of its numbers away (positive numbers only).
// A coefficient that becomes 1 is dropped, as the formatter does (0.9x → x, not 1x).
function nudges(latex) {
  const out = [], re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(latex))) {
    const s = m[0], dec = (s.split('.')[1] || '').length, unit = Math.pow(10, -dec);
    const before = latex.slice(0, m.index), after = latex.slice(m.index + s.length);
    for (const dir of [-1, 1]) {
      const v = Math.round((parseFloat(s) + dir * unit) * Math.pow(10, dec)) / Math.pow(10, dec);
      if (!(v > 0)) continue;
      const t = num(v, dec);
      out.push(before + (t === '1' && /^(?:[A-Za-z]|\\(?!right))/.test(after) ? '' : t) + after);
    }
  }
  return out;
}

// ---------------------------------------------------------------- search driver

// Scores LaTeX exactly as engine.evaluate does for a challenge (compile → allowlist → sample → evaluateChallenge).
function makeJudge(CE) {
  const compiler = formula.createCompiler(CE);
  return function judge(level, P, latex) {
    const f = compiler.compile(latex);
    if (!f.ok || formula.disallowed(f).length) return null;
    const c = curve.sampleCurve(f.fn, level.viewport);
    const r = scoring.evaluateChallenge(c, level, P, f.size);
    return { latex, score: r.score, hits: r.hitCount, size: r.size, length: c.length, walls: r.wallsCrossedCount };
  };
}

// Most digits after the point in any printed number (trailing zeros are never printed).
function decimals(latex) { return (latex.match(/\.\d+/g) || []).reduce((m, s) => Math.max(m, s.length - 1), 0); }

function better(a, b) { // higher score; tie → fewer decimals, smaller, shorter
  return a.score - b.score || decimals(b.latex) - decimals(a.latex) || b.size - a.size || b.latex.length - a.latex.length;
}

// Nudge the printed digits while any single nudge raises the real score.
function climb(judge, level, P, start) {
  let best = start;
  for (let round = 0; round < 500; round++) {
    let next = null;
    for (const lx of nudges(best.latex)) {
      const r = judge(level, P, lx);
      if (r && r.score > (next || best).score) next = Object.assign(r, { fam: best.fam, d: best.d, family: best.family });
    }
    if (!next) return best;
    best = next;
  }
  return best;
}

// `baked` (optional: a bot record or a list of them) is the bot already in js/challenges.js, plus any --seeds: each is
// judged and climbed under the current rules too, so a re-bake never picks a formula that scores below them (PLAN-v3 §L.3).
function searchBot(judge, level, baked) {
  const P = scoring.polylinePar(level.targets, level.viewport), rnd = mulberry32(42);
  let cands = [];
  for (const fam of families(level)) cands.push(...searchFamily(fam, level, rnd, P));
  cands.sort((a, b) => scoreOf(b, level, P) - scoreOf(a, level, P));
  const pick = cands.slice(0, 10);
  for (const name of ['const', 'line', 'quad', 'sin', 'sinline', 'cubic']) pick.push(...cands.filter((c) => c.fam.name === name).slice(0, 2));
  const verified = [];
  for (const c of pick) {
    const rc = refine(c, level, P);
    for (const d of [1, 2, 3]) {
      const v = judge(level, P, latexOf(rc.fam.name, rc.coefs, rc.th, d));
      if (v) verified.push(Object.assign(v, { fam: rc.fam.name, d }));
    }
  }
  verified.sort((a, b) => better(b, a));
  // hill-climb the three best distinct formulas and keep the best result
  const seen = new Set(), finals = [];
  for (const v of verified) {
    if (seen.has(v.latex)) continue;
    seen.add(v.latex);
    finals.push(climb(judge, level, P, v));
    if (finals.length === 3) break;
  }
  finals.sort((a, b) => better(b, a));
  // A simpler formula (fewer decimals, or as many and smaller) often loses a dot to rounding and is then a nudge
  // or two from the best score: climb those within one dot of it too, so that a tie goes to the simpler formula.
  const top = finals[0], dTop = decimals(top.latex), floor = top.score - 1000 / level.targets.length - 1;
  let extra = 0;
  for (const v of verified) {
    if (extra === 6) break;
    const dv = decimals(v.latex);
    if (seen.has(v.latex) || v.score < floor || !(dv < dTop || (dv === dTop && v.size < top.size))) continue;
    seen.add(v.latex);
    finals.push(climb(judge, level, P, v));
    extra++;
  }
  for (const bb of [].concat(baked || [])) {
    const old = bb && bb.latex ? judge(level, P, bb.latex) : null;
    if (old) finals.push(climb(judge, level, P, Object.assign(old, { fam: null, d: decimals(old.latex), family: bb.family })));
  }
  finals.sort((a, b) => better(b, a));
  const b = finals[0];
  return { score: b.score, hits: b.hits, size: b.size, length: Math.round(b.length * 1000) / 1000, latex: b.latex,
           family: b.fam ? LABELS[b.fam] : b.family };
}

function levelOf(spec, dots) {
  const vp = dots.viewport;
  return { id: spec.id, kind: 'challenge', viewport: vp, targets: dots.targets, walls: dots.walls, hitRadius: (vp.xMax - vp.xMin) / 64 };
}

// ---------------------------------------------------------------- output

function lit(v) { // compact JS literal, single-quoted strings
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
  if (v && typeof v === 'object') return '{ ' + Object.keys(v).map((k) => k + ': ' + lit(v[k])).join(', ') + ' }';
  return String(v);
}

function render(data) {
  const rows = data.map((d) => '    { id: ' + lit(d.id) + ', title: ' + lit(d.title) + ', layout: ' + lit(d.layout) + ', seed: ' + d.seed +
    ', viewport: ' + lit(d.viewport) + ', walls: ' + lit(d.walls) + ',\n      targets: ' + lit(d.targets) +
    ',\n      blurb: ' + lit(d.blurb) + ',\n      bot: ' + lit(d.bot) + ' }');
  return [
    '// Graph Fun — free-play challenge data. GENERATED by `node tools/gen-challenges.js --write`; do not edit by hand.',
    '// Ids are storage keys: the generator never changes the dots or walls of an existing id (the bot may be re-baked).',
    '(function (root, factory) {',
    "  var isNode = typeof module === 'object' && module.exports;",
    '  var api = factory();',
    '  if (isNode) module.exports = api; else (root.GF = root.GF || {}).challenges = api;',
    "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {",
    "  'use strict';",
    '',
    '  var DATA = [',
    rows.join(',\n'),
    '  ];',
    '',
    '  return { DATA: DATA };',
    '});',
    ''
  ].join('\n');
}

function readExisting(file) {
  file = file || OUT;
  if (!fs.existsSync(file)) { if (file !== OUT) throw new Error('no such file ' + file); return []; }
  delete require.cache[require.resolve(file)];
  return require(file).DATA || [];
}

function main(argv) {
  const write = argv.includes('--write'), oi = argv.indexOf('--only');
  const only = oi >= 0 ? (argv[oi + 1] || '').split(',').filter(Boolean) : null;
  if (only) for (const id of only) if (!SPECS.some((s) => s.id === id)) throw new Error('unknown challenge ' + id);
  const si = argv.indexOf('--seeds');
  const seeds = new Map(si >= 0 ? readExisting(path.resolve(argv[si + 1] || '')).map((d) => [d.id, d.bot]) : []);
  const judge = makeJudge(require('@cortex-js/compute-engine'));
  const existing = new Map(readExisting().map((d) => [d.id, d]));
  const t0 = Date.now(), data = [];
  for (const spec of SPECS) {
    const dots = generateDots(spec), old = existing.get(spec.id);
    if (old && (JSON.stringify(old.targets) !== JSON.stringify(dots.targets) || JSON.stringify(old.walls) !== JSON.stringify(dots.walls))) {
      throw new Error(spec.id + ': the generator now makes different dots than js/challenges.js has. Ids are storage ' +
        'keys, so existing dots never change: restore the old generator behaviour or add the level under a new id.');
    }
    let bot;
    if (only && !only.includes(spec.id)) {
      if (!old) throw new Error(spec.id + ' is not in js/challenges.js yet: run without --only first.');
      bot = old.bot;
    } else {
      bot = searchBot(judge, levelOf(spec, dots), [old && old.bot, seeds.get(spec.id)]);
    }
    data.push({ id: spec.id, title: spec.title, layout: spec.layout, seed: dots.seed, viewport: dots.viewport,
                walls: dots.walls, targets: dots.targets, blurb: blurbOf(spec), bot });
    if (!only || only.includes(spec.id)) {
      const P = scoring.polylinePar(dots.targets, dots.viewport);
      console.log([spec.id, spec.title.padEnd(14), 'n ' + spec.n, 'P ' + P.toFixed(3), 'bot ' + bot.score,
        bot.hits + '/' + spec.n, 's' + bot.size, 'L ' + bot.length.toFixed(3), bot.family.padEnd(18), bot.latex,
        ((Date.now() - t0) / 1000).toFixed(1) + 's'].join('  '));
    }
  }
  if (write) { fs.writeFileSync(OUT, render(data)); console.log('wrote ' + path.relative(process.cwd(), OUT)); }
  console.log('total ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

module.exports = { SPECS, VIEWPORTS, BASE_SEED, mulberry32, generateDots, validateDots, maxConstHits, maxLineHits, lineCap,
                   blurbOf, chainLatex, nudges, families, searchFamily, refine, scoreOf, latexOf, makeJudge, searchBot,
                   better, decimals };

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('gen-challenges: ' + e.message); process.exit(1); }
}
