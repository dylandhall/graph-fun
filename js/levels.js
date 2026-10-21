// Graph Fun — level data (PLAN.md §8, §13; challenges: PLAN-challenges.md §6, §11.H). Blurbs and hints are
// HTML; formulas sit in <math-span>. Challenge data comes from the generated js/challenges.js.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports, challenges = null;
  if (isNode) { try { challenges = require('./challenges.js'); } catch (e) { challenges = null; } }
  else challenges = (root.GF && root.GF.challenges) || null;
  var api = factory({ challenges: challenges });
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).levels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var A = { xMin: -8, xMax: 8, yMin: -6, yMax: 6 };
  var M = function (tex) { return '<math-span>' + tex + '</math-span>'; };

  var DATA = [
    { id: 'flat', title: 'Flat Line', family: 'y = c',
      ref: { latex: '3', text: '3' },
      targets: [[-6, 3], [-2, 3], [2, 3], [6, 3]],
      blurb: 'A constant function gives every x the same y — a horizontal line ' + M('y=c') + '.',
      hint: 'All the dots share one height.',
      whyNot: "It doesn't get any simpler than a constant!" },
    { id: 'slope', title: 'Rise over Run', family: 'y = mx + b',
      ref: { latex: '\\frac{1}{2}x+1', text: 'x/2+1' },
      targets: [[-6, -2], [-2, 0], [2, 2], [6, 4]],
      blurb: 'In ' + M('y=mx+b') + ', ' + M('b') + ' is where the line crosses the y-axis and ' + M('m') +
        ' is how much it rises for each step right.',
      hint: 'Read the height at ' + M('x=0') + ', then rise ÷ run between two dots.',
      whyNot: 'A constant hits at most 1 of these dots — the line has to slope.' },
    { id: 'downhill', title: 'Downhill', family: 'm < 0',
      ref: { latex: '-2x+3', text: '-2x+3' },
      targets: [[-1, 5], [1, 1], [2.5, -2], [4, -5]],
      blurb: 'A negative ' + M('m') + ' makes the line fall as you go right.',
      hint: 'From (1, 1) to (2.5, −2): down 3 over 1.5.',
      whyNot: 'Every rising line misses all of these dots.' },
    { id: 'abs', title: 'V for Absolute', family: 'a|x − h| + k',
      ref: { latex: '\\left|x-2\\right|-1', text: 'abs(x-2)-1' },
      targets: [[-3, 4], [0, 1], [2, -1], [4, 1], [7, 4]],
      blurb: M('|x|') + ' makes a V; ' + M('|x-h|+k') + ' moves its tip to (h, k), and ' + M('a') +
        ' stretches or flips it.',
      hint: 'The tip is the lowest dot.',
      whyNot: 'No straight line hits more than 3 of the 5 dots.' },
    { id: 'parabola', title: 'The Parabola', family: 'ax² + c',
      ref: { latex: '\\frac{1}{2}x^2-3', text: '0.5x^2-3' },
      targets: [[-4, 5], [-2, -1], [0, -3], [2, -1], [4, 5]],
      blurb: M('x^2') + ' curves up from its vertex; ' + M('a') + ' stretches or flattens it and ' + M('c') +
        ' moves it up or down.',
      hint: 'Vertex (0, −3); at x = 2 it has risen 2 — so ' + M('a\\cdot 4=2') + '.',
      whyNot: 'The best line hits 2 of 5 and the best V 4 of 5 — it takes a curve.' },
    { id: 'vertex', title: 'Vertex Form', family: 'a(x − h)² + k',
      ref: { latex: '-(x-2)^2+4', text: '-(x-2)^2+4' },
      targets: [[-1, -5], [0, 0], [2, 4], [4, 0], [5, -5]],
      blurb: M('a(x-h)^2+k') + ' puts the vertex at (h, k); a negative ' + M('a') + ' opens it downward.',
      hint: 'The highest dot is the vertex; two steps aside it drops 4.',
      whyNot: 'The best V hits 3 of 5, and an unshifted parabola like x² − 4 hits none.' },
    { id: 'cubic', title: 'S-Curve', family: 'ax³ + bx',
      ref: { latex: '\\frac{1}{4}x^3-3x', text: 'x^3/4-3x' },
      targets: [[-4, -4], [-2, 4], [0, 0], [2, -4], [4, 4]],
      blurb: 'Cubics can rise, fall and rise again.',
      hint: 'The dots are symmetric through the origin: try ' + M('ax^3+bx') + ' and solve with two dots.',
      whyNot: 'The best line, V or parabola hits only 3 of 5: these dots are symmetric through a point, not mirrored.' },
    { id: 'sqrt', title: 'Square Root', family: 'a√(x − h) + k',
      ref: { latex: '2\\sqrt{x+4}-3', text: '2sqrt(x+4)-3' },
      targets: [[-4, -3], [-3, -1], [0, 1], [5, 3]],
      blurb: M('\\sqrt{x}') + ' only exists for ' + M('x\\ge 0') + ': it starts at a point and then flattens out.',
      hint: 'It starts at (−4, −3); 1 step right it has risen 2, 4 steps right it has risen 4.',
      whyNot: 'The best line or parabola hits only 3 of the 4 dots.' },
    { id: 'recip', title: 'Two Branches', family: 'k / x',
      ref: { latex: '\\frac{4}{x}', text: '4/x' },
      targets: [[-4, -1], [-2, -2], [-1, -4], [1, 4], [2, 2], [4, 1]],
      walls: [0],
      blurb: M('\\frac{1}{x}') + ' is undefined at 0 and shoots off to ±∞ there (an asymptote). ' +
        "Your curve can't cross the red wall inside the view — it has to jump.",
      hint: 'Every dot has ' + M('x\\cdot y=4') + '.',
      whyNot: 'A continuous curve can only get past the wall by leaving the screen, which costs a lot of length; the best parabola hits 3 of 6.' },
    { id: 'exp', title: 'Doubling', family: 'a·bˣ + c',
      ref: { latex: '2^x-3', text: '2^x-3' },
      targets: [[-6, -2.9844], [-2, -2.75], [0, -2], [1, -1], [2, 1], [3, 5]],
      blurb: 'In ' + M('2^x') + ' each step right doubles the height; far to the left it fades towards an asymptote.',
      hint: 'The height above ' + M('y=-3') + ' goes 2, 4, 8 at x = 1, 2, 3.',
      whyNot: 'The best parabola hits 5 of 6 and the best square root 3 of 6.' },
    { id: 'log', title: 'Logarithm', family: 'log_b(x)',
      ref: { latex: '\\log_2 x', text: 'log_2(x)' },
      viewport: { xMin: -2, xMax: 10, yMin: -4.5, yMax: 4.5 },
      targets: [[0.25, -2], [0.5, -1], [1, 0], [2, 1], [4, 2], [8, 3]],
      blurb: M('\\log_2 x') + ' answers “which power of 2 gives x?” — it undoes ' + M('2^x') +
        '. Use the log□ key, or ' + M('\\frac{\\ln x}{\\ln 2}') + '.',
      hint: 'x = 1, 2, 4, 8 give 0, 1, 2, 3.',
      whyNot: 'The best square root or parabola hits 5 of 6, and a·e^(bx) + c only 4 of 6.' },
    { id: 'sine', title: 'Sine Wave', family: 'A sin x', piLabels: true,
      ref: { latex: '3\\sin x', text: '3sin(x)' },
      targets: [[-4.7124, 3], [-1.5708, -3], [0, 0], [1.5708, 3], [3.1416, 0], [4.7124, -3]],
      blurb: M('\\sin x') + ' repeats every ' + M('2\\pi') + '; ' + M('A') + ' sets the height of its peaks.',
      hint: 'The peaks are at ±3.',
      whyNot: 'The best V hits 5 of 6 and the best cubic just 1 of 6.' },
    { id: 'period', title: 'Change the Period', family: 'A sin(Bx)', piLabels: true,
      ref: { latex: '2\\sin\\left(\\frac{\\pi x}{4}\\right)', text: '2sin(pi x/4)' },
      targets: [[-6, 2], [-4, 0], [-2, -2], [0, 0], [2, 2], [6, -2]],
      blurb: M('\\sin(Bx)') + ' repeats every ' + M('\\frac{2\\pi}{B}') + ' units.',
      hint: 'Trough to trough is 8 units.',
      whyNot: '2 sin x hits only 3 of 6 — its period is wrong.' },
    { id: 'cosphase', title: 'Shift and Lift', family: 'A cos(x − h) + k', piLabels: true,
      ref: { latex: '2\\cos\\left(x-1\\right)+1', text: '2cos(x-1)+1' },
      targets: [[-5.2832, 3], [-2.1416, -1], [1, 3], [2.5708, 1], [4.1416, -1], [7.2832, 3]],
      blurb: M('\\cos') + ' is ' + M('\\sin') + ' shifted; ' + M('(x-h)') + ' slides it right and ' + M('+k') +
        ' lifts its midline.',
      hint: 'Peak at x = 1, midline y = 1, amplitude 2.',
      whyNot: 'Waves that are not shifted hit none of the 6 dots.' },
    { id: 'tan', title: 'Tangent', family: 'tan(Bx)', piLabels: true,
      ref: { latex: '\\tan\\left(\\frac{\\pi x}{4}\\right)', text: 'tan(pi x/4)' },
      targets: [[-4, 0], [-3, 1], [-1, -1], [0, 0], [1.5, 2.4142], [3, -1], [5, 1]],
      walls: [-6, -2, 2, 6],
      blurb: M('\\tan=\\frac{\\sin}{\\cos}') + ' blows up wherever ' + M('\\cos=0') + ' and repeats every ' +
        M('\\frac{\\pi}{B}') + '. The red walls are its asymptotes — no crossing them inside the view.',
      hint: 'The walls are 4 apart, so the period is 4.',
      whyNot: 'A continuous curve can only get past the walls by leaving the screen, which costs a lot of length; tan x hits 2 of 7.' },
    { id: 'linewave', title: 'Wave on a Slope', family: 'mx + A sin(Bx)', piLabels: true,
      ref: { latex: '\\frac{x}{2}+2\\sin\\left(\\frac{\\pi x}{2}\\right)', text: 'x/2+2sin(pi x/2)' },
      targets: [[-5, -4.5], [-3, 0.5], [0, 0], [1, 2.5], [3, -0.5], [5, 4.5]],
      blurb: 'Adding functions adds their heights — here a sine wave rides on a line.',
      hint: 'Midline ' + M('y=\\frac{x}{2}') + ', amplitude 2, period 4.',
      whyNot: 'A pure sine wave only hits all six with a very fast wiggle (B ≈ 2.95), far longer than par.' },
    { id: 'semicircle', title: 'Half a Circle', family: '√(r² − x²)',
      ref: { latex: '\\sqrt{25-x^2}-1', text: 'sqrt(25-x^2)-1' },
      targets: [[-5, -1], [-4, 2], [-3, 3], [0, 4], [3, 3], [4, 2], [5, -1]],
      blurb: 'The top half of the circle ' + M('x^2+y^2=r^2') + ' is ' + M('y=\\sqrt{r^2-x^2}') + '.',
      hint: 'Centre (0, −1), radius 5 — think of a 3-4-5 triangle.',
      whyNot: 'The best parabola and the best cosine dome hit 6 of 7, a Gaussian bell 5 of 7.' },
    { id: 'gauss', title: 'Bell Curve', family: 'Ae^(−x²/(2σ²))',
      ref: { latex: '4e^{-\\frac{x^2}{2}}', text: '4e^(-x^2/2)' },
      targets: [[-6, 0], [-3, 0.0444], [-2, 0.5413], [-1, 2.4261], [0, 4], [1, 2.4261], [2, 0.5413], [3, 0.0444], [6, 0]],
      blurb: M('e^{-x^2}') + ' is the Gaussian bell: a rounded top and tails that vanish fast.',
      hint: 'Peak 4; at x = ±1 it is ' + M('4e^{-1/2}\\approx 2.43') + '.',
      whyNot: 'No cosine bump reaches all 9 dots, the best parabola hits 5 and the best V 6. (Other bell shapes, like a tuned 4/(1 + 0.62x²) − 0.3, can work too.)' },
    { id: 'damped', title: 'Fading Echo', family: 'Ae^(−kx)·cos(Bx)',
      ref: { latex: '4e^{-\\frac{x}{4}}\\cos\\left(\\frac{\\pi x}{2}\\right)', text: '4e^(-x/4)cos(pi x/2)' },
      viewport: { xMin: -1, xMax: 11, yMin: -4.5, yMax: 4.5 },
      targets: [[0, 4], [1, 0], [2, -2.4261], [4, 1.4715], [6, -0.8925], [8, 0.5413]],
      blurb: 'A wave times a decaying exponential: every swing is a little smaller.',
      hint: 'Period 4; the envelope shrinks by ' + M('e^{-1/2}') + ' every 2 units.',
      whyNot: 'A wave that never fades, like 4 cos(πx/2), hits only 2 of 6, and the fading envelope on its own hits 3 of 6.' }
  ];

  function hitRadius(level) {
    if (level.hitRadius != null) return level.hitRadius;
    return (level.viewport.xMax - level.viewport.xMin) / 64;
  }

  // What a lesson shows before any hint (PLAN-v3 §A): no family, no formula.
  function promptOf(d) {
    var n = d.targets.length, w = (d.walls || []).length;
    return 'Find a function whose graph goes through all ' + n + ' dots.' + (w ? ' It can’t cross the red ' +
      (w > 1 ? 'walls' : 'wall') + ' inside the view, so it has to jump.' : '');
  }

  function build(d, n) {
    var level = {
      id: d.id, n: n, kind: 'lesson', title: d.title, family: d.family, prompt: promptOf(d), blurb: d.blurb, hint: d.hint, ref: d.ref,
      viewport: Object.assign({}, d.viewport || A), targets: d.targets, walls: d.walls || [], hitRadius: d.hitRadius,
      piLabels: !!d.piLabels, whyNot: d.whyNot
    };
    level.hitRadius = hitRadius(level);
    return level;
  }

  var LEVELS = DATA.map(function (d, i) { return build(d, i + 1); });

  var SANDBOX = build({
    id: 'sandbox', title: 'Sandbox', family: 'Anything goes',
    ref: { latex: '', text: '' }, targets: [],
    blurb: 'No dots here — graph whatever you like and see how long its line is.',
    hint: 'Try ' + M('\\sin x') + ', ' + M('x^2') + ' or ' + M('\\frac{1}{x}') + '.',
    whyNot: ''
  }, 0);
  SANDBOX.kind = 'sandbox';

  function buildChallenge(d, n) {
    var vp = Object.assign({}, d.viewport), walls = (d.walls || []).slice(), w = walls.length;
    return {
      id: d.id, n: n, kind: 'challenge', title: d.title,
      family: d.targets.length + ' dots' + (w ? ' · ' + w + (w > 1 ? ' walls' : ' wall') : ''),
      blurb: d.blurb, hint: '', whyNot: '', ref: { latex: '', text: '' },
      viewport: vp, targets: d.targets, walls: walls, hitRadius: (vp.xMax - vp.xMin) / 64, piLabels: false,
      layout: d.layout, seed: d.seed, bot: Object.assign({}, d.bot)
    };
  }

  var CHALLENGES = ((deps.challenges && deps.challenges.DATA) || []).map(function (d, i) { return buildChallenge(d, i + 1); });

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return undefined;
  }
  function getLevel(id) { return find(LEVELS, id); } // lessons only
  function getChallenge(id) { return find(CHALLENGES, id); }

  return { LEVELS: LEVELS, SANDBOX: SANDBOX, CHALLENGES: CHALLENGES, getLevel: getLevel, getChallenge: getChallenge,
           hitRadius: hitRadius };
});
