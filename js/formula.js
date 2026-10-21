// Graph Fun — formula pipeline: normalise → CE parse → checks → CE.compile → size (PLAN.md §4, §13;
// PLAN-challenges.md §3, §11).
// The Compute Engine namespace is injected (window.ComputeEngine or require('@cortex-js/compute-engine')).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory();
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).formula = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MESSAGES = {
    incomplete: 'Fill in the empty box.',
    syntax: "Can't read this formula.",
    equation: 'Type just the right-hand side, e.g. 2x+1. (x = c is a vertical line — not a function.)',
    missing: "Something's missing.",
    operator: 'An operator is missing a side.',
    brackets: 'Check your brackets.',
    notNumber: "That isn't a number for each x — type a function of x, e.g. 2x+1.",
    argument: 'A function is missing its input, e.g. log₂(x).',
    compile: "Can't evaluate this formula.",
    sliderLetters: 'Use a, b, c or d to get a slider.'
  };

  function normalizeInput(src) {
    var s = String(src == null ? '' : src).trim()
      .replace(/[−–]/g, '-')
      .replace(/π/g, '\\pi ')
      .replace(/[×·]/g, '\\cdot ')
      .replace(/÷/g, '/')
      .replace(/\\mleft/g, '\\left').replace(/\\mright/g, '\\right')
      // MathLive's `dx` shortcut types \differentialD x and pasted LaTeX may have \mathrm{d}; d is a slider
      // variable here (PLAN-v3 §C, §L.8)
      .replace(/\\differentialD(?![A-Za-z])\s*/g, 'd ').replace(/\\mathrm\{\s*d\s*\}\s*/g, 'd ')
      // CE silently drops everything after a spacing command (x\,+1 → x), so turn them into spaces.
      .replace(/\\[,;:!]|\\q?quad|\\enspace|\\thinspace|~|\\ /g, ' ')
      .replace(/^\s*(?:y|[fgh]\s*(?:\\left)?\(\s*x\s*(?:\\right)?\))\s*=\s*/, '')
      // \left[ … \right] would parse as a list; bare [ is left alone for \sqrt[3]{x}.
      .replace(/\\left\[|\\left\\lbrack/g, '\\left(').replace(/\\right\]|\\right\\rbrack/g, '\\right)')
      .replace(/\\lbrack/g, '(').replace(/\\rbrack/g, ')')
      // plain sgn(…)/sign(…) (MathLive's smartFence makes it sgn\left(…\right)) is an unknown function to CE;
      // `sgn x` becomes \operatorname{sgn} x too, which compile() answers with "Put brackets after sgn".
      .replace(/(^|[^\\A-Za-z{])(?:sgn|sign)(?=\s*(?:\\left\s*)?\(|\s)/g, '$1\\operatorname{sgn}')
      // CE reads \operatorname{sgn} (x) as sgn × (x), so the space has to go
      .replace(/(\\(?:operatorname|mathrm)\{(?:\\mathrm\{[A-Za-z]+\}|[A-Za-z]+)\})\s+(?=\\left\b|\()/g, '$1');
    return s.trim();
  }

  // A function written without brackets (\operatorname{sgn}x) parses as a bare symbol times x, NaN everywhere.
  var FN_NAMES = { Sign: 'sgn' };
  function bareFunction(name) {
    var f = FN_NAMES[name] || name.toLowerCase();
    return fail('bare-function', 'Put brackets after ' + f + ', e.g. ' + f + '(x).', [name]);
  }

  // Challenges allow only ordinary functions: floor, mod, lists, sums, If… would let a formula store the dots.
  var CHALLENGE_OPS = Object.freeze(['Add', 'Subtract', 'Negate', 'Multiply', 'InvisibleOperator', 'Divide', 'Power',
    'Square', 'Sqrt', 'Root', 'Abs', 'Sign', 'Exp', 'Ln', 'Log', 'Lb', 'Sin', 'Cos', 'Tan', 'Sec', 'Csc', 'Cot',
    'Arcsin', 'Arccos', 'Arctan', 'Sinh', 'Cosh', 'Tanh', 'Max', 'Min', 'Delimiter', 'Apply', 'InverseFunction']);
  var CHALLENGE_SYMBOLS = Object.freeze(['x', 'Pi', 'e', 'ExponentialE', 'a', 'b', 'c', 'd']);

  // Slider variables (PLAN-v3 §C). e is Euler's number, so the letters stop at d.
  var VARIABLES = Object.freeze(['a', 'b', 'c', 'd']);
  var DEFAULT_VALUES = Object.freeze({ a: 1, b: 1, c: 0, d: 0 });

  var NARY = { Add: 1, Multiply: 1, InvisibleOperator: 1, Max: 1, Min: 1 };
  function isNumberJson(j) {
    return typeof j === 'number' || (j && typeof j === 'object' && !Array.isArray(j) && 'num' in j) ||
      (typeof j === 'string' && /^[+-]?(\d|\.\d|NaN|Infinity)/.test(j));
  }

  // Formula size = node count of the raw (non-canonical) MathJSON: every number, symbol, operator (incl. the
  // hidden × in 2x) and function counts 1, brackets are free, −3 is one number (PLAN-challenges.md §3, §11.F).
  // `seen` (optional) collects operator heads and symbols.
  function measure(j, seen) {
    if (Array.isArray(j)) {
      var op = j[0], args = j.slice(1), sum = 0, i;
      if (typeof op !== 'string') return measure(op, seen) + args.reduce(function (t, a) { return t + measure(a, seen); }, 0);
      if (seen) seen.ops[op] = 1;
      if (op === 'Delimiter') return args.length ? measure(args[0], seen) : 0;
      if (op === 'Negate' && args.length === 1 && isNumberJson(args[0])) return 1;
      if (op === 'InverseFunction') { // \cos^{-1}: Apply(InverseFunction(Cos), x) costs the same as \arccos x
        for (i = 0; i < args.length; i++) {
          if (typeof args[i] === 'string') { if (seen) seen.ops[args[i]] = 1; } else measure(args[i], seen);
        }
        return 1;
      }
      for (i = 0; i < args.length; i++) sum += measure(args[i], seen);
      if (op === 'Apply') return sum;
      if (NARY[op]) return Math.max(0, args.length - 1) + sum; // a+b+c = two operators
      if (op === 'Exp' || op === 'Lb') return 2 + sum;         // exp(a) ≡ e^a; log₂ ≡ log_□ with its base
      return 1 + sum;
    }
    if (j && typeof j === 'object') {
      if (Array.isArray(j.fn)) return measure(j.fn, seen);
      if (seen && typeof j.sym === 'string') seen.symbols[j.sym] = 1;
      return 1;
    }
    if (seen && typeof j === 'string' && !isNumberJson(j)) seen.symbols[j] = 1;
    return 1;
  }

  function formulaSize(json) { return measure(json); }

  // Operator heads and symbols of a successful FormulaResult that challenges don't allow.
  function disallowed(result) {
    var bad = [];
    (result.ops || []).forEach(function (o) { if (CHALLENGE_OPS.indexOf(o) < 0) bad.push(o); });
    (result.symbols || []).forEach(function (s) { if (CHALLENGE_SYMBOLS.indexOf(s) < 0) bad.push(s); });
    return bad;
  }

  function fail(kind, message, detail) {
    var r = { ok: false, kind: kind, message: message };
    if (detail) r.detail = detail;
    return r;
  }

  function str(e) { return e && typeof e.string === 'string' ? e.string : undefined; }

  function syntaxError(expr) {
    var err = expr.errors && expr.errors[0];
    var code = str(err && err.op1);
    if (code === 'missing') return fail('syntax', MESSAGES.missing);
    if (code === 'unexpected-operator') return fail('syntax', MESSAGES.operator);
    if (code === 'unexpected-delimiter' || /^expected-.*delimiter$/.test(code || '')) return fail('syntax', MESSAGES.brackets);
    if (code === 'unexpected-command') {
      var cmd = str(err.op2 && err.op2.op1); // e.g. "\\sinc"
      if (cmd === '\\left' || cmd === '\\right') return fail('syntax', MESSAGES.brackets);
      return fail('syntax', cmd ? 'Unknown command ' + cmd + '.' : 'Unknown command.', cmd ? [cmd] : undefined);
    }
    return fail('syntax', MESSAGES.syntax, code ? [code] : undefined);
  }

  // Plain text bsin(x) reads as one unknown function “bsin”: say how to write a slider times sin (PLAN-v3 §L.8).
  var GLUED_FN = /^([a-dx]+)(sin|cos|tan|sec|csc|cot|ln|log|exp|sqrt|abs|sgn)$/;
  function unknownOperator(error) {
    var m = /Unknown operator `([^`]+)`/.exec(error && error.message || '');
    if (!m) return null;
    var g = GLUED_FN.exec(m[1]);
    if (g) return fail('compile', 'Write ' + g[1] + '*' + g[2] + '(x) or ' + g[1] + ' ' + g[2] + '(x).', [m[1]]);
    return fail('compile', 'Unknown function “' + m[1] + '”.', [m[1]]);
  }

  // Compiled CE code may return complex {re,im} even in strict mode (e.g. arccos 2): keep reals only.
  // `values` gives the slider variables (missing ones use DEFAULT_VALUES); each bound fn has its own scope.
  function wrap(run, lambda, values) {
    var scope = { x: 0 };
    VARIABLES.forEach(function (k) {
      var v = values && Number(values[k]);
      scope[k] = values && isFinite(values[k]) && values[k] !== null && values[k] !== '' ? v : DEFAULT_VALUES[k];
    });
    return function (x) {
      try {
        scope.x = x;
        var v = lambda ? run(x) : run(scope);
        if (v && typeof v === 'object' && 'im' in v) v = Math.abs(v.im) < 1e-12 ? v.re : NaN;
        return typeof v === 'number' && isFinite(v) ? Math.max(-1e100, Math.min(1e100, v)) : NaN;
      } catch (e) { return NaN; }
    };
  }

  function createCompiler(CE, ce) {
    ce = ce || new CE.ComputeEngine();

    function compile(input) {
      var source = normalizeInput(input);
      if (!source) return fail('empty', '');
      if (source.indexOf('\\placeholder') >= 0) return fail('incomplete', MESSAGES.incomplete);
      ce.pushScope(); // so symbols auto-declared while parsing don't pile up
      try {
        ce.declare('x', 'real'); // otherwise a bare `x` has type "unknown" and fails the isNumber check
        VARIABLES.forEach(function (k) { ce.declare(k, 'real'); });
        var expr;
        try { expr = ce.parse(source, { strict: false }); } catch (e) { return fail('syntax', MESSAGES.syntax); }
        if (!expr) return fail('syntax', MESSAGES.syntax);
        if (expr.operator === 'Equal') return fail('equation', MESSAGES.equation);
        if (!expr.isValid) return syntaxError(expr);
        var vars = (expr.unknowns || []).filter(function (u) { return u !== 'x' && VARIABLES.indexOf(u) < 0; });
        // CE's stand-in for a missing argument (\log_2 with nothing after it) and a stray `_` are
        // typing slips, not variables.
        if (vars.indexOf('topic_marker') >= 0) return fail('syntax', MESSAGES.argument);
        if (vars.indexOf('_') >= 0) return fail('syntax', MESSAGES.syntax);
        // a2 reads as the subscript a₂: say how to write it
        if (vars.length && vars.every(function (u) { return /^[a-dx]_\d+$/.test(u); })) {
          return fail('variables', 'Write the number first: 2' + vars[0].charAt(0) + ', not ' + vars[0].replace('_', '') + '.', vars.slice());
        }
        if (vars.length) return fail('variables', 'Only x and a–d can be variables (found: ' + vars.join(', ') + '). ' + MESSAGES.sliderLetters, vars.slice());
        // Compile before the isNumber check so f(x) and xsin(x) report the unknown function.
        var isNumber = expr.isNumber === true, result;
        try { result = CE.compile(expr, { mode: 'strict', fallback: false }); } catch (e) {
          return unknownOperator(e) || (isNumber ? fail('compile', MESSAGES.compile) : fail('not-number', MESSAGES.notNumber));
        }
        if (!isNumber) return fail('not-number', MESSAGES.notNumber);
        if (!result || result.success === false || typeof result.run !== 'function') return fail('compile', MESSAGES.compile);
        var seen = { ops: {}, symbols: {} }, size;
        try { size = measure(ce.parse(source, { strict: false, canonical: false }).json, seen); } catch (e) { size = NaN; }
        if (!(size >= 1)) { seen = { ops: {}, symbols: {} }; size = Math.max(1, measure(expr.json, seen)); }
        var bare = (expr.symbols || []).filter(function (name) {
          var def = ce.lookupDefinition(name);
          return !!def && 'operator' in def;
        });
        if (bare.length) return bareFunction(bare[0]);
        var free = result.freeSymbols || expr.unknowns || [];
        var params = VARIABLES.filter(function (k) { return free.indexOf(k) >= 0; });
        var run = result.run, lambda = result.calling === 'lambda';
        return { ok: true, fn: wrap(run, lambda), bind: function (values) { return wrap(run, lambda, values); },
                 params: params, source: source, pretty: String(expr.toString()),
                 size: size, ops: Object.keys(seen.ops), symbols: Object.keys(seen.symbols) };
      } catch (e) {
        return fail('compile', MESSAGES.compile);
      } finally {
        ce.popScope();
      }
    }

    // Display only (PLAN-v3 §C.5): the player's formula with slider values written in, keeping its structure.
    // Scoring never uses this — sizes and curves always come from the formula plus its values.
    function substitute(input, values) {
      var source = normalizeInput(input);
      if (!source) return '';
      try {
        var parsed = ce.parse(source, { strict: false, canonical: false });
        if (!parsed.isValid) return source;
        // .latex would group digits (1.234\,5), turn x^{-1} into \frac{1}{x} and reorder terms (PLAN-v3 §L.6)
        return ce.box(tidy(subst(parsed.json, values || {})), { canonical: false })
          .toLatex({ prettify: false, digitGroupSeparator: '' });
      } catch (e) { return source; }
    }

    return { ce: ce, compile: compile, substitute: substitute };
  }

  function isNum(j) { return typeof j === 'number'; }
  function isNumLike(j) { return isNum(j) || (Array.isArray(j) && j[0] === 'Delimiter' && isNum(j[1])); }
  function subst(j, v) {
    if (typeof j === 'string' && VARIABLES.indexOf(j) >= 0 && isFinite(v[j])) return Number(v[j]);
    if (Array.isArray(j)) return j.map(function (k, i) { return i === 0 ? k : subst(k, v); });
    return j;
  }
  // x−(−2) → x+2, +0 and 1· dropped, −1· → −, 2·(−3) keeps a ×, (−2)² keeps its brackets.
  function tidy(j) {
    if (!Array.isArray(j)) return j;
    var op = j[0], args = j.slice(1).map(tidy);
    if (op === 'Delimiter' && args.length === 1 && isNum(args[0]) && args[0] >= 0) return args[0];
    if (op === 'Subtract' && args.length === 2) {
      var u = args[0], v = args[1], prod = Array.isArray(v) && (v[0] === 'Multiply' || v[0] === 'InvisibleOperator');
      if (isNum(v) && v === 0) return u;
      if (isNum(v) && v < 0) return ['Add', u, -v];                                         // x − (−2) → x + 2
      if (Array.isArray(v) && v[0] === 'Negate') return tidy(['Add', u, v[1]]);              // x − (−u) → x + u
      if (prod && isNum(v[1]) && v[1] < 0) return tidy(['Add', u, [v[0], -v[1]].concat(v.slice(2))]); // x − (−1.5x) → x + 1.5x
      if (u === 0) return tidy(['Negate', v]);                                                // 0 − x² → −x²
      // CE brackets a negative number or a sum before a minus ((-0.5)-x^2, (x+1.5x)-2): write one sum instead
      if ((isNum(u) && u < 0) || (Array.isArray(u) && u[0] === 'Add')) {
        return tidy(['Add'].concat(isNum(u) ? [u] : u.slice(1), [['Negate', v]]));
      }
    }
    if (op === 'Add') {
      args = args.filter(function (a) { return a !== 0; });
      if (!args.length) return 0;
      if (args.length === 1) return args[0];
    }
    if (op === 'Multiply' || op === 'InvisibleOperator') {
      if (args.length >= 2 && isNum(args[0]) && !args.slice(1).some(isNum)) {
        if (args[0] === 1) args = args.slice(1);
        else if (args[0] === -1) return ['Negate', args.length === 2 ? args[1] : [op].concat(args.slice(1))];
      }
      args = args.map(function (a, i) { return i && isNum(a) && a < 0 ? ['Delimiter', a] : a; });
      if (args.slice(1).some(isNumLike)) return ['Multiply'].concat(args);
      if (args.length === 1) return args[0];
    }
    if (op === 'Negate' && isNum(args[0])) return -args[0];
    if (op === 'Power' && isNum(args[0]) && args[0] < 0) return ['Power', ['Delimiter', args[0]], args[1]];
    return [op].concat(args);
  }

  // Top-level terms of a LaTeX sum, for wrapping long formulas between terms:
  // '2\sin\left(x-1\right)-0.5x+3' → ['2\sin\left(x-1\right)', '-0.5x', '+3']. Never splits inside (), [], {},
  // \left…\right or |…| / \vert…\vert bars, nor after ^ or _ (PLAN-v3 §L.6).
  function latexTerms(latex) {
    latex = String(latex == null ? '' : latex);
    var terms = [], depth = 0, bar = false, start = 0, i = 0, m;
    while (i < latex.length) {
      var c = latex.charAt(i);
      if (c === '\\') {
        if ((m = /^\\(left|right)(?![A-Za-z])\s*(\\[A-Za-z]+|\\.|.)?/.exec(latex.slice(i)))) {
          depth += m[1] === 'left' ? 1 : -1;
          i += m[0].length;
          continue;
        }
        m = /^\\([A-Za-z]+|.)/.exec(latex.slice(i)) || ['\\'];
        if (m[1] === 'vert' || m[1] === '|') bar = !bar;
        else if (m[1] === 'lvert' || m[1] === 'lVert') depth++;
        else if (m[1] === 'rvert' || m[1] === 'rVert') depth--;
        i += m[0].length;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '|') bar = !bar;
      else if ((c === '+' || c === '-') && depth <= 0 && !bar && i > start && !/[\^_]\s*$/.test(latex.slice(start, i))) {
        terms.push(latex.slice(start, i));
        start = i;
      }
      i++;
    }
    terms.push(latex.slice(start));
    return terms.filter(function (t) { return t !== ''; });
  }

  return { normalizeInput: normalizeInput, createCompiler: createCompiler, MESSAGES: MESSAGES, formulaSize: formulaSize,
           VARIABLES: VARIABLES, DEFAULT_VALUES: DEFAULT_VALUES, latexTerms: latexTerms,
           CHALLENGE_OPS: CHALLENGE_OPS, CHALLENGE_SYMBOLS: CHALLENGE_SYMBOLS, disallowed: disallowed };
});
