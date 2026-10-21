// Graph Fun — curve sampler and length metric (PLAN.md §5).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).curve = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VPX = 1000; // virtual pixels across the viewport width
  var DEFAULTS = Object.freeze({
    initialIntervals: 1000, maxDepth: 12, maxEvals: 50000, flatTolPx: 0.5, jumpPx: 4,
    clipMargin: 0.05, timeBudgetMs: Infinity, now: function () { return Date.now(); }
  });
  var PHI = 0.6180339887498949;

  // Liang–Barsky: parameter range [t0,t1] of the segment inside rect, or null.
  function clipSegmentT(x0, y0, x1, y1, rect) {
    var dx = x1 - x0, dy = y1 - y0, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x0 - rect.xMin, rect.xMax - x0, y0 - rect.yMin, rect.yMax - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [t0, t1];
  }

  function distPointSegment(px, py, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
    var t = len2 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }

  function safe(fn) {
    return function (x) {
      try {
        var v = fn(x);
        return typeof v === 'number' && isFinite(v) ? Math.max(-1e100, Math.min(1e100, v)) : NaN;
      } catch (e) { return NaN; }
    };
  }

  function sampleCurve(fn0, vp, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var fn = safe(fn0);
    var W = vp.xMax - vp.xMin, s = VPX / W;
    var tol = o.flatTolPx / s, jump = o.jumpPx / s;
    var ink = 0, offscreen = 0, gap = 0, evals = 0, saturated = false, timedOut = false;
    var start = o.now(), checkTime = o.timeBudgetMs !== Infinity;
    var pieces = [], cur = null;

    // Once over budget, stop calling fn: one call to e.g. \sum_{n=1}^{10^7} can take 10 ms, and the
    // initial grid alone would otherwise make 1001 of them. The clock is cheap next to fn, so check it
    // on every call.
    function ev(x) {
      if (timedOut) return NaN;
      evals++;
      if (checkTime && o.now() - start > o.timeBudgetMs) { timedOut = true; return NaN; }
      return fn(x);
    }
    function brk(a, b) { cur = null; gap += b - a; }
    function emit(x0, y0, x1, y1) {
      var c = clipSegmentT(x0, y0, x1, y1, vp), inside = c ? c[1] - c[0] : 0;
      ink += inside * Math.hypot(x1 - x0, y1 - y0);
      offscreen += (1 - inside) * (x1 - x0); // off-screen stretches are billed by their width
      if (!cur) { cur = [[x0, y0]]; pieces.push(cur); }
      cur.push([x1, y1]);
    }
    // Branch order matters: it reproduces the level pars in PLAN.md §8.
    function refine(a, ya, b, yb, d) {
      var na = isNaN(ya), nb = isNaN(yb), m, ym;
      if (na && nb) { brk(a, b); return; }
      if (evals >= o.maxEvals || timedOut) {
        saturated = true;
        if (!na && !nb) emit(a, ya, b, yb); else brk(a, b);
        return;
      }
      if (na !== nb) { // domain boundary: bisect down to maxDepth
        if (d === o.maxDepth) { brk(a, b); return; }
        m = (a + b) / 2; ym = ev(m);
        refine(a, ya, m, ym, d + 1); refine(m, ym, b, yb, d + 1);
        return;
      }
      if (d === o.maxDepth) {
        if (Math.abs(yb - ya) > jump) brk(a, b); else emit(a, ya, b, yb);
        return;
      }
      m = (a + b) / 2; ym = ev(m);
      if (!isNaN(ym) && ((ya > vp.yMax && ym > vp.yMax && yb > vp.yMax) ||
          (ya < vp.yMin && ym < vp.yMin && yb < vp.yMin) || Math.abs(ym - (ya + yb) / 2) <= tol)) {
        emit(a, ya, m, ym); emit(m, ym, b, yb);
        return;
      }
      refine(a, ya, m, ym, d + 1); refine(m, ym, b, yb, d + 1);
    }

    // Deterministically jittered grid: defeats aliasing tricks such as sin(64πx).
    var N = o.initialIntervals, xs = new Array(N + 1), ys = new Array(N + 1), k;
    for (k = 0; k <= N; k++) {
      var t = k === 0 ? 0 : k === N ? 1 : k / N + 0.4 * ((k * PHI) % 1 - 0.5) / N;
      xs[k] = vp.xMin + W * t;
    }
    for (k = 0; k <= N; k++) ys[k] = ev(xs[k]);
    for (k = 0; k < N; k++) refine(xs[k], ys[k], xs[k + 1], ys[k + 1], 0);
    if (timedOut) saturated = true;

    // Every pen-lift costs the vertical distance between piece ends (clamped to the view), so a
    // jump function can never be cheaper than drawing the climb.
    var clampY = function (y) { return Math.max(vp.yMin, Math.min(vp.yMax, y)); };
    var penLift = 0, lifts = [];
    for (var i = 1; i < pieces.length; i++) {
      var prev = pieces[i - 1], p0 = prev[prev.length - 1], p1 = pieces[i][0];
      var ya0 = clampY(p0[1]), yb0 = clampY(p1[1]), dy = Math.abs(yb0 - ya0);
      penLift += dy;
      if (dy > 0) lifts.push([[p0[0], ya0], [p1[0], yb0]]);
    }

    return {
      paths: clipPieces(pieces, vp, o.clipMargin),
      length: saturated ? Infinity : ink + offscreen + gap + penLift,
      breakdown: { ink: ink, offscreen: offscreen, undefinedGap: gap, penLift: penLift },
      lifts: lifts, pieceCount: pieces.length, evals: evals,
      saturated: saturated, timedOut: timedOut, viewport: vp
    };
  }

  // Clip pieces to the viewport grown by `margin` on each side; a new path starts whenever the
  // curve re-enters the rect.
  function clipPieces(pieces, vp, margin) {
    var mx = (vp.xMax - vp.xMin) * margin, my = (vp.yMax - vp.yMin) * margin;
    var R = { xMin: vp.xMin - mx, xMax: vp.xMax + mx, yMin: vp.yMin - my, yMax: vp.yMax + my };
    var paths = [];
    pieces.forEach(function (p) {
      var path = null, clippedEnd = true;
      for (var i = 1; i < p.length; i++) {
        var x0 = p[i - 1][0], y0 = p[i - 1][1], x1 = p[i][0], y1 = p[i][1];
        var c = clipSegmentT(x0, y0, x1, y1, R);
        if (!c) { clippedEnd = true; continue; }
        if (c[0] > 0 || clippedEnd || !path) {
          path = [[x0 + c[0] * (x1 - x0), y0 + c[0] * (y1 - y0)]];
          paths.push(path);
        }
        path.push([x0 + c[1] * (x1 - x0), y0 + c[1] * (y1 - y0)]);
        clippedEnd = c[1] < 1;
      }
    });
    return paths;
  }

  return { VPX: VPX, DEFAULTS: DEFAULTS, sampleCurve: sampleCurve, clipSegmentT: clipSegmentT,
           distPointSegment: distPointSegment };
});
