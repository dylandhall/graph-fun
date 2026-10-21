// Graph Fun — hits, walls, score and stars (PLAN.md §6, §7, §13; challenges: PLAN-challenges.md §1, §11).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? { curve: require('./curve.js') } : { curve: root.GF.curve });
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).scoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var distPointSegment = deps.curve.distPointSegment;
  // Scoring-rules version: storage re-scores saved bests when it goes up (PLAN-v3 §B.6). v1 = (par/L)², 1/r and
  // min(1, 15/size); v2 = the gentler length and size factors below.
  var RULES_VERSION = 2;

  // Length factor g(r), r = L/ref (ref = par in lessons, the dot-to-dot length in challenges): 1 up to the reference,
  // then exp(−0.056(r−1) − 0.222(r−1)²): ×0.97 at 1.25, ×0.92 at 1.5, ×0.76 at 2, ×0.37 at 3, ×0.02 at 5. The small
  // linear term keeps shorter lines ahead near the reference (PLAN-v3 §B.1, §L.1).
  var LENGTH = Object.freeze({ linear: 0.056, quadratic: 0.222 });
  function lengthFactor(ratio) {
    if (!(ratio < Infinity) || !(ratio >= 0)) return 0;
    if (ratio <= 1) return 1;
    var t = ratio - 1;
    return Math.exp(-LENGTH.linear * t - LENGTH.quadratic * t * t);
  }

  // Lesson stars stay tied to L/par: every dot, no wall, and L ≤ 1.05 / 1.25 / 1.415 × par. (1.415 keeps every
  // attempt that had 1★ under v1, whose ★ was "score ≥ 500", i.e. L ≤ 1.41492·par.)
  var RULES = Object.freeze({ three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5 });

  // A target is hit when some drawn segment passes within r of it (jumps and gaps have no segments).
  function hitTargets(paths, targets, r) {
    return targets.map(function (t) {
      var px = t[0], py = t[1];
      for (var j = 0; j < paths.length; j++) {
        var p = paths[j];
        for (var i = 1; i < p.length; i++) {
          var x0 = p[i - 1][0], y0 = p[i - 1][1], x1 = p[i][0], y1 = p[i][1];
          if (Math.max(x0, x1) < px - r || Math.min(x0, x1) > px + r) continue;
          if (distPointSegment(px, py, x0, y0, x1, y1) <= r) return true;
        }
      }
      return false;
    });
  }

  // A wall at x=c is crossed only by a drawn segment that passes c inside the view.
  function crossedWalls(paths, walls, vp) {
    return walls.map(function (c) {
      for (var j = 0; j < paths.length; j++) {
        var p = paths[j];
        for (var i = 1; i < p.length; i++) {
          var x0 = p[i - 1][0], y0 = p[i - 1][1], x1 = p[i][0], y1 = p[i][1];
          if (x1 === x0 || (x0 - c) * (x1 - c) > 0) continue;
          var y = y0 + (y1 - y0) * (c - x0) / (x1 - x0);
          if (y >= vp.yMin && y <= vp.yMax) return true;
        }
      }
      return false;
    });
  }

  function scoreAttempt(a) {
    if (!(a.length < Infinity) || !(a.total > 0)) return { score: 0, stars: 0, lengthFactor: 0 };
    var q = lengthFactor(a.length / a.par);
    var score = Math.round(1000 * (a.hitCount / a.total) * q * Math.pow(RULES.wallPenalty, a.wallsCrossedCount));
    var stars = 0;
    if (a.hitCount === a.total && a.wallsCrossedCount === 0) {
      if (a.length <= RULES.three * a.par) stars = 3;
      else if (a.length <= RULES.two * a.par) stars = 2;
      else if (a.length <= RULES.one * a.par) stars = 1;
    }
    return { score: score, stars: stars, lengthFactor: q };
  }

  function count(flags) { return flags.filter(Boolean).length; }

  // The AttemptResult fields shared by lessons and challenges (score and stars are filled in by the caller).
  function measure(curve, level, par) {
    var vp = level.viewport;
    var r = level.hitRadius != null ? level.hitRadius : (vp.xMax - vp.xMin) / 64;
    var hits = hitTargets(curve.paths, level.targets, r);
    var walls = crossedWalls(curve.paths, level.walls || [], vp);
    return { hits: hits, hitCount: count(hits), total: level.targets.length, walls: walls,
             wallsCrossedCount: count(walls), length: curve.length, par: par, ratio: curve.length / par,
             score: 0, stars: 0, saturated: curve.saturated };
  }

  var lengthFactorFn = lengthFactor;
  function evaluateAttempt(curve, level, par) {
    var a = measure(curve, level, par), s = scoreAttempt(a);
    a.score = s.score; a.stars = s.stars; a.lengthFactor = s.lengthFactor;
    return a;
  }

  // ---- Free-play challenges (PLAN-challenges.md §1, §7, §11) ----
  var CHALLENGE = Object.freeze({ freeSize: 15, sizeScale: 10, wallPenalty: 0.5, oneStar: 0.6, twoStar: 0.85 });

  // Formula-size factor: the first 15 units are free, then exp(−((size−15)/10)²): ×0.99 at 16, ×0.96 at 17, ×0.85 at
  // 19, ×0.70 at 21, ×0.37 at 25, so one extra term costs little and big mechanical chains cost a lot (PLAN-v3 §L.2).
  function sizeFactor(size) {
    if (!(size < Infinity)) return 0;
    if (!(size > CHALLENGE.freeSize)) return 1;
    var t = (size - CHALLENGE.freeSize) / CHALLENGE.sizeScale;
    return Math.exp(-t * t);
  }

  // Dot-to-dot polyline (dots by x) plus flat runs to both edges: no curve through every dot is shorter.
  function polylinePar(targets, vp) {
    var t = targets.slice().sort(function (a, b) { return a[0] - b[0]; });
    if (!t.length) return vp.xMax - vp.xMin;
    var L = (t[0][0] - vp.xMin) + (vp.xMax - t[t.length - 1][0]);
    for (var i = 1; i < t.length; i++) L += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]);
    return L;
  }

  // score = 1000 · hits/n · g(L/P) · sizeFactor(size) · 0.5^walls
  function challengeScore(a) {
    var size = a.size >= 1 ? a.size : 1;
    var lengthFactor = a.par > 0 ? lengthFactorFn(a.length / a.par) : 0;
    var sf = sizeFactor(size);
    var wallFactor = Math.pow(CHALLENGE.wallPenalty, a.wallsCrossedCount || 0);
    var score = a.total > 0 ? Math.round(1000 * (a.hitCount / a.total) * lengthFactor * sf * wallFactor) : 0;
    return { score: score, lengthFactor: lengthFactor, sizeFactor: sf, wallFactor: wallFactor };
  }

  function challengeThresholds(botScore) {
    return { one: Math.ceil(CHALLENGE.oneStar * botScore - 1e-9), two: Math.ceil(CHALLENGE.twoStar * botScore - 1e-9),
             three: botScore };
  }

  // Beating the bot means scoring more than it; matching means the same score. No bot scores 1000 under these rules
  // (a test checks), so every bot can be beaten (PLAN-v3 §L.7).
  function beatsBot(score, botScore) { return botScore > 0 && score > botScore; }
  function matchesBot(score, botScore) { return botScore > 0 && score === botScore; }

  function challengeStars(score, botScore) {
    if (!(score > 0) || !(botScore > 0)) return 0;
    var t = challengeThresholds(botScore);
    return score >= t.three ? 3 : score >= t.two ? 2 : score >= t.one ? 1 : 0;
  }

  function evaluateChallenge(curve, level, par, size) {
    var a = measure(curve, level, par);
    var s = challengeScore({ hitCount: a.hitCount, total: a.total, length: a.length, par: par, size: size,
                             wallsCrossedCount: a.wallsCrossedCount });
    var bot = level.bot && level.bot.score > 0 ? level.bot.score : 0;
    a.score = s.score;
    a.stars = challengeStars(s.score, bot);
    a.kind = 'challenge';
    a.size = size >= 1 ? size : 1;
    a.lengthFactor = s.lengthFactor; a.sizeFactor = s.sizeFactor; a.wallFactor = s.wallFactor;
    a.bot = bot;
    a.beatBot = beatsBot(s.score, bot);
    a.matchedBot = matchesBot(s.score, bot);
    a.thresholds = challengeThresholds(bot);
    return a;
  }

  return { RULES_VERSION: RULES_VERSION, LENGTH: LENGTH, lengthFactor: lengthFactor, RULES: RULES,
           hitTargets: hitTargets, crossedWalls: crossedWalls, scoreAttempt: scoreAttempt, evaluateAttempt: evaluateAttempt,
           CHALLENGE: CHALLENGE, sizeFactor: sizeFactor, polylinePar: polylinePar, challengeScore: challengeScore,
           challengeThresholds: challengeThresholds, challengeStars: challengeStars, beatsBot: beatsBot,
           matchesBot: matchesBot, evaluateChallenge: evaluateChallenge };
});
