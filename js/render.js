/*
 * Graph Fun — canvas renderer.
 *
 * Draws one level: grid, axes and labels, walls, the player's curve, pen-lift
 * connectors, targets and optional coordinate pills. The curve is drawn straight
 * from `curve.paths` (the same polylines scoring uses) and never resampled.
 *
 * createRenderer(canvas) -> { setLevel, setCurve, setResult, setOptions, draw, destroy }
 * set* calls schedule a redraw on the next animation frame; draw() redraws now.
 * Colours come from CSS custom properties on the canvas, read at draw time.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).render = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_RING_PX = 6;
  var GRID_STEPS = [1, 2, 5, 10, 20, 50];
  var LABEL_STEPS = [1, 2, 4, 5, 10, 20, 50, 100];
  var MINUS = '−';
  var FONT = '11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var HIT_ANIM_MS = 520;

  /* ---------- formatting helpers (exported for reuse) ---------- */

  function formatNumber(v, decimals) {
    if (decimals === undefined) decimals = 2;
    if (!isFinite(v)) return v > 0 ? '∞' : (v < 0 ? MINUS + '∞' : '?');
    var p = Math.pow(10, decimals);
    var r = Math.round(v * p) / p;
    if (r === 0) r = 0; // no "-0"
    var s = String(r);
    if (s.indexOf('e') !== -1) s = r.toFixed(decimals);
    return s.charAt(0) === '-' ? MINUS + s.slice(1) : s;
  }

  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }

  /** x as a multiple of π/4 when it is one (within 1e-3), else null. */
  function piMultiple(x) {
    var k = Math.round(x / (Math.PI / 4));
    if (k === 0 || Math.abs(x - k * Math.PI / 4) > 1e-3) return null;
    var g = gcd(Math.abs(k), 4);
    var num = k / g, den = 4 / g;
    var s = (Math.abs(num) === 1 ? '' : String(Math.abs(num))) + 'π' + (den === 1 ? '' : '/' + den);
    return (num < 0 ? MINUS : '') + s;
  }

  function formatX(x, piLabels) {
    if (piLabels) { var p = piMultiple(x); if (p) return p; }
    return formatNumber(x, 2);
  }

  function coordLabel(pt, piLabels) {
    return '(' + formatX(pt[0], piLabels) + ', ' + formatNumber(pt[1], 2) + ')';
  }

  function pickStep(steps, pxPerUnit, minPx, multipleOf) {
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (multipleOf && Math.abs(s / multipleOf - Math.round(s / multipleOf)) > 1e-9) continue;
      if (s * pxPerUnit >= minPx) return s;
    }
    return steps[steps.length - 1];
  }

  /* ---------- colours ---------- */

  function readColors(el) {
    var cs = (typeof getComputedStyle === 'function') ? getComputedStyle(el) : null;
    function v(name, fallback) {
      var s = cs ? cs.getPropertyValue(name).trim() : '';
      return s || fallback;
    }
    return {
      surface: v('--surface', '#ffffff'),
      text: v('--text', '#1b1e2b'),
      muted: v('--muted', '#5d6478'),
      border: v('--border', '#d9dce6'),
      grid: v('--grid', 'rgba(27,30,43,.07)'),
      axis: v('--axis', 'rgba(27,30,43,.55)'),
      curve: v('--curve', '#4f6bff'),
      target: v('--target', '#f59e0b'),
      hit: v('--hit', '#16a34a'),
      onHit: v('--on-hit', '#ffffff'),
      wall: v('--wall', '#e11d48')
    };
  }

  /* ---------- renderer ---------- */

  function createRenderer(canvas) {
    var ctx = canvas.getContext('2d');
    var level = null;
    var curve = null;
    var ghost = false;
    var result = null;
    var options = { showCoords: true };
    var cssW = 0, cssH = 0, dpr = 1;
    var raf = 0;
    var destroyed = false;
    var prevHits = null;
    var hitAnims = []; // {i, t0}
    var dprQuery = null;

    var reduceMotion = false;
    try { reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }

    function measure() {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
    }

    function schedule() {
      if (destroyed || raf) return;
      raf = requestAnimationFrame(function () { raf = 0; draw(); });
    }

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { measure(); draw(); });
      ro.observe(canvas);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', onWinResize);
    }
    function onWinResize() { measure(); draw(); }

    var schemeQuery = null;
    function onScheme() { schedule(); }
    try {
      schemeQuery = matchMedia('(prefers-color-scheme: dark)');
      if (schemeQuery.addEventListener) schemeQuery.addEventListener('change', onScheme);
      else schemeQuery.addListener(onScheme);
    } catch (e) { schemeQuery = null; }

    function watchDpr() {
      try {
        if (dprQuery) dprQuery.removeEventListener('change', onDpr);
        dprQuery = matchMedia('(resolution: ' + ((window.devicePixelRatio) || 1) + 'dppx)');
        dprQuery.addEventListener('change', onDpr);
      } catch (e) { dprQuery = null; }
    }
    function onDpr() { measure(); draw(); watchDpr(); }
    watchDpr();

    /* --- public setters --- */

    function setLevel(l) {
      level = l || null;
      curve = null; result = null; ghost = false;
      prevHits = level && level.targets ? level.targets.map(function () { return false; }) : null;
      hitAnims = [];
      schedule();
    }

    function setCurve(c, opts) {
      curve = c || null;
      ghost = !!(opts && opts.ghost);
      schedule();
    }

    function setResult(r) {
      result = r || null;
      var hits = result && result.hits ? result.hits : null;
      if (hits && prevHits && !reduceMotion) {
        var now = performance.now();
        for (var i = 0; i < hits.length; i++) {
          if (hits[i] && !prevHits[i]) hitAnims.push({ i: i, t0: now });
        }
      }
      // Keep the last real hits through error/ghost states so re-typing doesn't replay ripples.
      if (hits) prevHits = hits.slice();
      schedule();
    }

    function setOptions(o) {
      if (o) for (var k in o) options[k] = o[k];
      schedule();
    }

    /* --- drawing --- */

    function draw() {
      if (destroyed) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      measure();
      var w = cssW, h = cssH;
      if (!w || !h || !level) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      var vp = level.viewport;
      var W = vp.xMax - vp.xMin, H = vp.yMax - vp.yMin;
      var ppu = w / W; // px per world unit (viewports are 4:3, canvas is 4:3)
      var ppuY = h / H;
      var sx = function (x) { return (x - vp.xMin) * ppu; };
      var sy = function (y) { return (vp.yMax - y) * ppuY; };
      var col = readColors(canvas);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = col.surface;
      ctx.fillRect(0, 0, w, h);

      var grid = drawGrid(col, vp, w, h, ppu, sx, sy);
      drawWalls(col, vp, w, h, sx, sy);
      drawCurve(col, sx, sy, w, h);
      var animating = drawTargets(col, vp, ppu, sx, sy);
      drawAxisLabels(col, vp, w, h, ppu, sx, sy, grid);
      if (options.showCoords) drawPills(col, vp, w, h, ppu, sx, sy);

      if (animating) schedule();
    }

    function crisp(v, lw) {
      var d = Math.round(lw * dpr);
      return (Math.round(v * dpr) + (d % 2 ? 0.5 : 0)) / dpr;
    }

    function drawGrid(col, vp, w, h, ppu, sx, sy) {
      var step = pickStep(GRID_STEPS, ppu, 18);
      ctx.lineWidth = 1;
      ctx.strokeStyle = col.grid;
      ctx.beginPath();
      var k, x, y, px;
      for (k = Math.ceil(vp.xMin / step); (x = k * step) <= vp.xMax; k++) {
        if (x === 0) continue;
        px = crisp(sx(x), 1);
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (k = Math.ceil(vp.yMin / step); (y = k * step) <= vp.yMax; k++) {
        if (y === 0) continue;
        px = crisp(sy(y), 1);
        ctx.moveTo(0, px); ctx.lineTo(w, px);
      }
      ctx.stroke();

      // axes
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col.axis;
      ctx.beginPath();
      if (vp.xMin <= 0 && vp.xMax >= 0) { px = crisp(sx(0), 1.5); ctx.moveTo(px, 0); ctx.lineTo(px, h); }
      if (vp.yMin <= 0 && vp.yMax >= 0) { px = crisp(sy(0), 1.5); ctx.moveTo(0, px); ctx.lineTo(w, px); }
      ctx.stroke();
      return { step: step };
    }

    function drawWalls(col, vp, w, h, sx, sy) {
      var walls = (level && level.walls) || [];
      if (!walls.length) return;
      var crossed = (!ghost && result && result.walls) || [];
      for (var i = 0; i < walls.length; i++) {
        var c = walls[i];
        var px = crisp(sx(c), 2);
        var hit = !!crossed[i];
        ctx.save();
        // soft band so the wall reads as a barrier, not just a line
        ctx.globalAlpha = hit ? 0.16 : 0.07;
        ctx.fillStyle = col.wall;
        ctx.fillRect(px - 6, 0, 12, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col.wall;
        if (hit) {
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.shadowColor = col.wall;
          ctx.shadowBlur = 10;
        } else {
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
        }
        ctx.beginPath();
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
        ctx.stroke();
        ctx.restore();
        if (hit && curve && curve.paths) drawCrossMarks(col, c, vp, sx, sy);
      }
    }

    // Mark where the curve crosses a wall inside the view (up to 3 per wall).
    function drawCrossMarks(col, c, vp, sx, sy) {
      var marks = 0;
      var paths = curve.paths;
      for (var p = 0; p < paths.length && marks < 3; p++) {
        var path = paths[p];
        for (var i = 1; i < path.length && marks < 3; i++) {
          var x0 = path[i - 1][0], y0 = path[i - 1][1], x1 = path[i][0], y1 = path[i][1];
          if ((x0 - c) * (x1 - c) > 0 || x1 === x0) continue;
          var y = y0 + (y1 - y0) * (c - x0) / (x1 - x0);
          if (y < vp.yMin || y > vp.yMax) continue;
          var cx = sx(c), cy = sy(y);
          ctx.save();
          ctx.fillStyle = col.wall;
          ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col.onHit;
          ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 3.5, cy - 3.5); ctx.lineTo(cx + 3.5, cy + 3.5);
          ctx.moveTo(cx + 3.5, cy - 3.5); ctx.lineTo(cx - 3.5, cy + 3.5);
          ctx.stroke();
          ctx.restore();
          marks++;
          // skip ahead so one crossing isn't marked twice by adjacent segments
          while (i + 1 < path.length && Math.abs(path[i + 1][0] - c) < 1e-9) i++;
        }
      }
    }

    function drawCurve(col, sx, sy, w, h) {
      if (!curve) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      ctx.globalAlpha = ghost ? 0.3 : 1;

      // pen-lifts (jumps): faint dotted vertical connectors
      var lifts = curve.lifts || [];
      if (lifts.length) {
        ctx.strokeStyle = col.curve;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([1.5, 4.5]);
        ctx.lineCap = 'round';
        ctx.globalAlpha = ghost ? 0.18 : 0.55;
        ctx.beginPath();
        for (var j = 0; j < lifts.length; j++) {
          var a = lifts[j][0], b = lifts[j][1];
          if (!a || !b) continue;
          ctx.moveTo(sx(a[0]), sy(a[1]));
          ctx.lineTo(sx(b[0]), sy(b[1]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = ghost ? 0.3 : 1;
      }

      var paths = curve.paths || [];
      ctx.strokeStyle = col.curve;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var p = 0; p < paths.length; p++) {
        var path = paths[p];
        if (!path.length) continue;
        ctx.moveTo(sx(path[0][0]), sy(path[0][1]));
        if (path.length === 1) { ctx.lineTo(sx(path[0][0]) + 0.01, sy(path[0][1])); continue; }
        for (var i = 1; i < path.length; i++) ctx.lineTo(sx(path[i][0]), sy(path[i][1]));
      }
      ctx.stroke();
      ctx.restore();
    }

    function ringRadius(ppu) {
      var r = (level && level.hitRadius) || 0;
      if (!r && level && level.viewport) r = (level.viewport.xMax - level.viewport.xMin) / 64;
      return Math.max(r * ppu, MIN_RING_PX);
    }

    function drawTargets(col, vp, ppu, sx, sy) {
      var targets = (level && level.targets) || [];
      if (!targets.length) return false;
      var hits = (!ghost && result && result.hits) || [];
      var R = ringRadius(ppu);
      var now = (typeof performance !== 'undefined') ? performance.now() : 0;
      var animating = false;

      for (var i = 0; i < targets.length; i++) {
        var cx = sx(targets[i][0]), cy = sy(targets[i][1]);
        ctx.save();
        if (hits[i]) {
          // hit: solid disc + check mark
          ctx.fillStyle = col.hit;
          ctx.globalAlpha = 0.92;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          var s = Math.max(R, 6.5);
          ctx.strokeStyle = col.onHit;
          ctx.lineWidth = Math.max(1.75, s * 0.24);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.45, cy + s * 0.02);
          ctx.lineTo(cx - s * 0.12, cy + s * 0.34);
          ctx.lineTo(cx + s * 0.48, cy - s * 0.36);
          ctx.stroke();
        } else {
          // unhit: hollow ring (2px stroke inside radius R) + centre dot
          ctx.fillStyle = col.target;
          ctx.globalAlpha = 0.18;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = col.target;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(R - 1, 1), 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = col.target;
          ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // "just hit" ripple
      if (hitAnims.length) {
        var keep = [];
        for (var k = 0; k < hitAnims.length; k++) {
          var an = hitAnims[k];
          var t = (now - an.t0) / HIT_ANIM_MS;
          if (t >= 1 || !hits[an.i] || !targets[an.i]) continue;
          keep.push(an);
          var e = 1 - Math.pow(1 - t, 3);
          ctx.save();
          ctx.strokeStyle = col.hit;
          ctx.globalAlpha = 0.6 * (1 - t);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(sx(targets[an.i][0]), sy(targets[an.i][1]), R + 2 + e * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        hitAnims = keep;
        animating = keep.length > 0;
      }
      return animating;
    }

    function labelText(text, x, y, align, baseline, col) {
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col.surface;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = col.muted;
      ctx.fillText(text, x, y);
    }

    function drawAxisLabels(col, vp, w, h, ppu, sx, sy, grid) {
      var step = pickStep(LABEL_STEPS, ppu, 36, grid.step);
      ctx.save();
      ctx.font = FONT;
      // skip labels that would sit under a target ring
      var R = ringRadius(ppu) + 2;
      var discs = ((level && level.targets) || []).map(function (t) { return [sx(t[0]), sy(t[1])]; });
      function blocked(x0, y0, x1, y1) {
        for (var i = 0; i < discs.length; i++) {
          var cx = Math.max(x0, Math.min(discs[i][0], x1)), cy = Math.max(y0, Math.min(discs[i][1], y1));
          if (Math.hypot(cx - discs[i][0], cy - discs[i][1]) < R) return true;
        }
        return false;
      }
      function label(text, x, y, align, baseline) {
        var tw = ctx.measureText(text).width;
        var x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
        var y0 = baseline === 'top' ? y : y - 6;
        if (blocked(x0, y0, x0 + tw, y0 + 12)) return;
        labelText(text, x, y, align, baseline, col);
      }
      var yAxisIn = vp.xMin <= 0 && vp.xMax >= 0;
      var xAxisIn = vp.yMin <= 0 && vp.yMax >= 0;

      // x labels: under the x-axis, or pinned to the bottom edge when it's out of view
      var ly = xAxisIn ? sy(0) + 4 : h - 15;
      ly = Math.min(Math.max(ly, 3), h - 15);
      var k, v, px;
      for (k = Math.ceil(vp.xMin / step); (v = k * step) <= vp.xMax; k++) {
        if (v === 0 && yAxisIn) continue;
        px = sx(v);
        if (px < 10 || px > w - 10) continue;
        label(formatNumber(v, 2), px, ly, 'center', 'top');
      }

      // y labels: left of the y-axis, or pinned to an edge when it's out of view
      var lx, align;
      if (yAxisIn) { lx = sx(0) - 5; align = 'right'; if (lx < 22) { lx = sx(0) + 5; align = 'left'; } }
      else if (vp.xMin > 0) { lx = 4; align = 'left'; }
      else { lx = w - 4; align = 'right'; }
      for (k = Math.ceil(vp.yMin / step); (v = k * step) <= vp.yMax; k++) {
        if (v === 0 && xAxisIn) continue;
        px = sy(v);
        if (px < 8 || px > h - 8) continue;
        label(formatNumber(v, 2), lx, px, align, 'middle');
      }
      if (xAxisIn && yAxisIn) {
        label('0', sx(0) - 5, sy(0) + 4, 'right', 'top');
      }
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function overlaps(a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    }

    function drawPills(col, vp, w, h, ppu, sx, sy) {
      var targets = (level && level.targets) || [];
      if (!targets.length) return;
      var R = ringRadius(ppu);
      var piLabels = !!level.piLabels;
      ctx.save();
      ctx.font = FONT;
      var ph = 18, padX = 6, d = R + 4;
      var placed = [];
      var discs = targets.map(function (t) {
        var cx = sx(t[0]), cy = sy(t[1]);
        return { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R };
      });
      for (var i = 0; i < targets.length; i++) {
        var text = coordLabel(targets[i], piLabels);
        var pw = Math.ceil(ctx.measureText(text).width) + padX * 2;
        var cx = sx(targets[i][0]), cy = sy(targets[i][1]);
        var cands = [
          { x: cx - pw / 2, y: cy - d - ph },      // above
          { x: cx - pw / 2, y: cy + d },           // below
          { x: cx + d, y: cy - ph / 2 },           // right
          { x: cx - d - pw, y: cy - ph / 2 },      // left
          { x: cx + d * 0.7, y: cy - d * 0.7 - ph }, // above-right
          { x: cx - d * 0.7 - pw, y: cy - d * 0.7 - ph },
          { x: cx + d * 0.7, y: cy + d * 0.7 },
          { x: cx - d * 0.7 - pw, y: cy + d * 0.7 }
        ];
        var best = null;
        for (var c = 0; c < cands.length && !best; c++) {
          var r = { x: cands[c].x, y: cands[c].y, w: pw, h: ph };
          if (r.x < 2 || r.y < 2 || r.x + r.w > w - 2 || r.y + r.h > h - 2) continue;
          var ok = true;
          for (var p = 0; p < placed.length && ok; p++) if (overlaps(r, placed[p])) ok = false;
          for (var q = 0; q < discs.length && ok; q++) if (overlaps(r, discs[q])) ok = false;
          if (ok) best = r;
        }
        if (!best) {
          best = { x: Math.min(Math.max(cx - pw / 2, 2), w - pw - 2), y: Math.min(Math.max(cy - d - ph, 2), h - ph - 2), w: pw, h: ph };
        }
        placed.push(best);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = col.surface;
        roundRect(best.x, best.y, best.w, best.h, ph / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.strokeStyle = col.border;
        ctx.stroke();
        ctx.fillStyle = col.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, best.x + best.w / 2, best.y + ph / 2 + 0.5);
      }
      ctx.restore();
    }

    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else if (typeof window !== 'undefined') window.removeEventListener('resize', onWinResize);
      try {
        if (schemeQuery) {
          if (schemeQuery.removeEventListener) schemeQuery.removeEventListener('change', onScheme);
          else schemeQuery.removeListener(onScheme);
        }
        if (dprQuery) dprQuery.removeEventListener('change', onDpr);
      } catch (e) { /* ignore */ }
    }

    measure();

    return {
      setLevel: setLevel,
      setCurve: setCurve,
      setResult: setResult,
      setOptions: setOptions,
      draw: draw,
      destroy: destroy
    };
  }

  return {
    createRenderer: createRenderer,
    formatNumber: formatNumber,
    formatX: formatX,
    piMultiple: piMultiple,
    coordLabel: coordLabel,
    MIN_RING_PX: MIN_RING_PX
  };
});
