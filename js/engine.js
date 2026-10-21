// Graph Fun — game façade used by the UI and the tests (PLAN.md §3, §13).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode
    ? { curve: require('./curve.js'), scoring: require('./scoring.js'), formula: require('./formula.js'), levels: require('./levels.js') }
    : { curve: root.GF.curve, scoring: root.GF.scoring, formula: root.GF.formula, levels: root.GF.levels });
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var WARNINGS = {
    undefined: 'Not defined anywhere in view.',
    offscreen: "Your graph isn't visible anywhere in view.",
    saturated: 'Too wiggly to measure — length ∞.'
  };

  function warningFor(curve) {
    if (curve.saturated) return 'saturated';
    if (curve.pieceCount === 0) return 'undefined'; // NaN (or isolated points) everywhere in view
    if (curve.breakdown.ink === 0) return 'offscreen';
    return null;
  }

  function statusFor(kind) {
    return kind === 'empty' ? 'empty' : kind === 'incomplete' ? 'incomplete' : 'error';
  }

  var NOT_ALLOWED = 'Challenges use ordinary functions — no floor, mod, lists, sums or if.';

  function createGame(CE, options) {
    var compiler = deps.formula.createCompiler(CE);
    var parCache = new Map();

    function par(level) {
      var challenge = level.kind === 'challenge', ref = (level.ref && level.ref.latex) || '';
      var key = level.id + '|' + (challenge ? JSON.stringify(level.targets) : ref) + '|' + JSON.stringify(level.viewport);
      if (!parCache.has(key)) {
        var value = NaN; // no reference (e.g. the sandbox) → no par
        if (challenge) value = deps.scoring.polylinePar(level.targets, level.viewport); // dot-to-dot length
        else if (ref) {
          var f = compiler.compile(ref);
          if (!f.ok) throw new Error('Reference for level ' + level.id + ' does not compile: ' + f.message);
          value = deps.curve.sampleCurve(f.fn, level.viewport).length;
        }
        parCache.set(key, value);
      }
      return parCache.get(key);
    }

    // The last few compiles, keyed by the raw input: a slider drag re-samples without recompiling (PLAN-v3 §C).
    var compiled = new Map(), CACHE = 16;
    function compileCached(input) {
      if (compiled.has(input)) { var hit = compiled.get(input); compiled.delete(input); compiled.set(input, hit); return hit; }
      var f = compiler.compile(input);
      compiled.set(input, f);
      if (compiled.size > CACHE) compiled.delete(compiled.keys().next().value);
      return f;
    }

    function evaluate(level, input, sampleOpts, vars) {
      input = input == null ? '' : String(input);
      var formula = compileCached(input), challenge = level.kind === 'challenge';
      if (challenge && (formula.ok || formula.kind === 'bare-function')) {
        // a bare \operatorname{floor}x is turned down as floor, not sent off to add brackets first
        var bad = formula.ok ? deps.formula.disallowed(formula)
          : formula.detail.filter(function (op) { return deps.formula.CHALLENGE_OPS.indexOf(op) < 0; });
        if (bad.length) formula = { ok: false, kind: 'not-allowed', message: NOT_ALLOWED, detail: bad };
      }
      if (!formula.ok) {
        return { status: statusFor(formula.kind), message: formula.message, warning: null, input: input,
                 formula: formula, curve: null, result: null };
      }
      var used = {};
      (formula.params || []).forEach(function (k) {
        var v = vars && Number(vars[k]);
        used[k] = vars && vars[k] != null && isFinite(v) ? v : deps.formula.DEFAULT_VALUES[k];
      });
      var fn = formula.params && formula.params.length ? formula.bind(used) : formula.fn;
      var curve = deps.curve.sampleCurve(fn, level.viewport, sampleOpts);
      var warning = warningFor(curve);
      var result = !level.targets.length ? null : challenge
        ? deps.scoring.evaluateChallenge(curve, level, par(level), formula.size)
        : deps.scoring.evaluateAttempt(curve, level, par(level));
      return { status: 'ok', message: warning ? WARNINGS[warning] : '', warning: warning, input: input, vars: used,
               formula: formula, curve: curve, result: result };
    }

    // Re-scores a stored best under the current rules for store.migrate (PLAN-v3 §B.6, §L.5) → {score, stars}, or
    // null to keep the entry as it is: no dots (sandbox), the formula no longer evaluates, sampling ran out of time
    // (a slow phone must not re-score a heavy formula to 0), or it uses sliders whose values the entry lacks (an older
    // build's clean() drops bestVars). Challenge stars are 0: they are always recomputed against the bot.
    function rescore(level, entry, sampleOpts) {
      if (!level || !level.targets || !level.targets.length || !entry || !entry.bestFormula) return null;
      var saved = entry.bestVars || {};
      var ev = evaluate(level, entry.bestFormula, sampleOpts || { timeBudgetMs: 300 }, varValues(saved));
      if (ev.status !== 'ok' || !ev.result || (ev.curve && ev.curve.timedOut)) return null;
      if (ev.formula.params.some(function (k) { return !saved[k]; })) return null;
      return { score: ev.result.score, stars: level.kind === 'challenge' ? 0 : ev.result.stars };
    }

    return { ce: compiler.ce, compiler: compiler, levels: (options && options.levels) || deps.levels.LEVELS,
             par: par, evaluate: evaluate, rescore: rescore };
  }

  // Stored slider states {a: {value, offset, step}, …} → the values {a: 1.3, …} that evaluate() takes.
  function varValues(saved) {
    var out = {};
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(function (k) {
        var e = saved[k], v = e && typeof e === 'object' ? e.value : e;
        if (typeof v === 'number' && isFinite(v)) out[k] = v;
      });
    }
    return out;
  }

  return { createGame: createGame, varValues: varValues, WARNINGS: WARNINGS, NOT_ALLOWED: NOT_ALLOWED };
});
