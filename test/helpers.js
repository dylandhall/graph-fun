// Shared test setup: one Compute Engine + the logic modules (not matched by the test glob).
const CE = require('@cortex-js/compute-engine');
const curve = require('../js/curve.js');
const scoring = require('../js/scoring.js');
const formula = require('../js/formula.js');
const levels = require('../js/levels.js');
const engine = require('../js/engine.js');
const storage = require('../js/storage.js');

const game = engine.createGame(CE);
const A = { xMin: -8, xMax: 8, yMin: -6, yMax: 6 };

// Compile a formula with the game's compiler; throws on failure so tests fail loudly.
function fnOf(src) {
  const f = game.compiler.compile(src);
  if (!f.ok) throw new Error(`"${src}" did not compile: ${f.kind} ${f.message}`);
  return f.fn;
}

function play(levelId, src) {
  const level = levels.getLevel(levelId);
  if (!level) throw new Error('no level ' + levelId);
  const ev = game.evaluate(level, src);
  if (ev.status !== 'ok') throw new Error(`"${src}" on ${levelId}: ${ev.status} ${ev.message}`);
  return ev.result;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

module.exports = { CE, curve, scoring, formula, levels, engine, storage, game, A, fnOf, play, near, R: String.raw };
