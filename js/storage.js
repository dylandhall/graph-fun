// Graph Fun — progress store (PLAN.md §3, §7). The backend (localStorage-like) is injected; if it is
// missing, throws, or holds bad JSON, the store keeps working in memory.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).storage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_KEY = 'graph-fun.progress.v1';
  var VAR_NAMES = ['a', 'b', 'c', 'd'];
  var MIN_STEP = 1e-6, MAX_STEP = 1000, DEFAULT_STEP = 0.1; // as in sliders.js (PLAN-v3 §L.9)

  function defaultBackend() {
    try { return globalThis.localStorage || null; } catch (e) { return null; } // access itself can throw
  }

  function blank() { return { bestScore: 0, stars: 0, bestFormula: '', bestVars: null, lastFormula: '', lastVars: null, hints: 0 }; }

  // Any positive step, clamped into [MIN_STEP, MAX_STEP]; anything else → DEFAULT_STEP.
  function cleanStep(step) {
    var v = Number(step);
    if (step === null || step === '' || !isFinite(v) || !(v > 0)) return DEFAULT_STEP;
    return Math.max(MIN_STEP, Math.min(MAX_STEP, Number(v.toFixed(6)) || MIN_STEP));
  }

  // {a: {value, offset, step}, …} with finite numbers and a valid step; anything else → null.
  function cleanVars(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    var out = {}, any = false;
    VAR_NAMES.forEach(function (k) {
      var e = v[k];
      if (!e || typeof e !== 'object' || typeof e.value !== 'number' || !isFinite(e.value)) return;
      out[k] = { value: e.value, offset: typeof e.offset === 'number' && isFinite(e.offset) ? e.offset : e.value,
                 step: cleanStep(e.step) };
      any = true;
    });
    return any ? out : null;
  }

  function clean(entry) {
    var e = blank();
    if (entry && typeof entry === 'object') {
      if (isFinite(entry.bestScore)) e.bestScore = Math.max(0, Number(entry.bestScore));
      if (isFinite(entry.stars)) e.stars = Math.max(0, Math.min(3, Math.floor(Number(entry.stars))));
      if (typeof entry.bestFormula === 'string') e.bestFormula = entry.bestFormula;
      if (typeof entry.lastFormula === 'string') e.lastFormula = entry.lastFormula;
      e.bestVars = cleanVars(entry.bestVars);
      e.lastVars = cleanVars(entry.lastVars);
      if (isFinite(entry.hints)) e.hints = Math.max(0, Math.min(2, Math.floor(Number(entry.hints))));
    }
    return e;
  }

  // Attempts rank by stars first, then score: a 0★ attempt that scores 800 by hitting 4 of 5 dots
  // never displaces a 1★ attempt worth 510.
  function beats(stars, score, best) {
    return stars > best.stars || (stars === best.stars && score > best.bestScore);
  }

  // → {levels, rules}. `rules` is the scoring-rules version the scores were computed under (absent = 1).
  function parse(raw) {
    var out = {}, data = null, rules = 1;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; } // corrupt → start afresh
    if (data && data.version === 1 && data.levels && typeof data.levels === 'object') {
      Object.keys(data.levels).forEach(function (id) { out[id] = clean(data.levels[id]); });
      if (isFinite(data.rules) && data.rules >= 1) rules = Math.floor(data.rules);
    } else if (raw == null) rules = 0; // nothing stored yet: any rules version applies
    return { levels: out, rules: rules };
  }

  function createStore(backend, key) {
    if (backend === undefined) backend = defaultBackend();
    key = key || DEFAULT_KEY;
    var lastRaw, levels = {}, rules = 0, current = 0; // current: the rules version migrate() brought us to
    sync();

    // Re-read the backend when another tab has written to it, so a stale copy in this tab never
    // overwrites newer progress.
    function sync() {
      if (!backend) return;
      var raw;
      try { raw = backend.getItem(key); } catch (e) { backend = null; return; } // unreadable → memory only
      if (raw === lastRaw) return;
      lastRaw = raw;
      var p = parse(raw);
      levels = p.levels; rules = p.rules;
    }

    function save() {
      if (!backend) return;
      var raw = JSON.stringify({ version: 1, rules: rules, levels: levels });
      try { backend.setItem(key, raw); lastRaw = raw; } catch (e) { backend = null; }
    }

    function get(id) {
      sync();
      return Object.prototype.hasOwnProperty.call(levels, id) ? Object.assign({}, levels[id]) : blank();
    }

    function record(id, attempt) {
      attempt = attempt || {};
      var prev = get(id), score = Number(attempt.score) || 0, formula = String(attempt.formula || ''), vars = cleanVars(attempt.vars);
      var stars = Math.max(0, Math.min(3, Math.floor(Number(attempt.stars) || 0)));
      var isNewBest = beats(stars, score, prev);
      var next = Object.assign({}, prev, { lastFormula: formula, lastVars: vars });
      // bestScore, stars and bestFormula always describe the same attempt (the first one counts as played)
      if (isNewBest || (!prev.bestFormula && !prev.stars && !prev.bestScore)) {
        next.bestScore = score;
        next.stars = stars;
        next.bestFormula = formula;
        next.bestVars = vars;
      }
      levels[id] = next;
      save();
      return { isNewBest: isNewBest };
    }

    function setLast(id, formula, vars) {
      var next = Object.assign(get(id), { lastFormula: String(formula == null ? '' : formula), lastVars: cleanVars(vars) }); // get() may re-read `levels`
      levels[id] = next;
      save();
    }

    function revealHint(id, n) {
      var next = get(id);
      next.hints = Math.max(next.hints, Math.max(0, Math.min(2, Math.floor(Number(n) || 0))));
      levels[id] = next;
      save();
      return next.hints;
    }

    function rulesVersion() { sync(); return rules; }

    // Re-score every stored best once when the scoring rules change (PLAN-v3 §B.6). `rescore(id, entry)` returns
    // {score, stars} or null (unknown level, formula no longer evaluates: keep the entry as it is). Stars never drop.
    function migrate(version, rescore) {
      sync();
      current = Math.max(current, version);
      if (rules >= version) return 0;
      var n = 0;
      Object.keys(levels).forEach(function (id) {
        var e = levels[id];
        if (!e.bestFormula) return;
        var r = null;
        try { r = rescore(id, Object.assign({}, e)); } catch (err) { r = null; }
        if (!r || !isFinite(r.score)) return;
        levels[id] = Object.assign({}, e, { bestScore: Math.max(0, Number(r.score)),
          stars: Math.max(e.stars, Math.max(0, Math.min(3, Math.floor(Number(r.stars) || 0)))) });
        n++;
      });
      rules = version;
      save();
      return n;
    }

    function isUnlocked(index, list, opts) {
      if ((opts && opts.unlockAll) || index === 0) return true;
      var prev = list && list[index - 1];
      return !!prev && get(prev.id).stars >= 1;
    }

    function reset() {
      levels = {};
      lastRaw = null;
      rules = current; // a reset store is scored under the current rules
      if (!backend) return;
      try { backend.removeItem(key); } catch (e) { backend = null; }
    }

    function all() {
      sync();
      var out = {};
      Object.keys(levels).forEach(function (id) { out[id] = Object.assign({}, levels[id]); });
      return out;
    }

    return { get: get, record: record, setLast: setLast, revealHint: revealHint, rulesVersion: rulesVersion, migrate: migrate,
             isUnlocked: isUnlocked, reset: reset, all: all,
             isPersistent: function () { return !!backend; } };
  }

  return { createStore: createStore, DEFAULT_KEY: DEFAULT_KEY };
});
