const test = require('node:test');
const assert = require('node:assert/strict');
const { formula, game, R } = require('./helpers.js');

const compile = (s) => game.compiler.compile(s);

function value(src, x) {
  const f = compile(src);
  assert.ok(f.ok, `"${src}" should compile, got ${f.kind}: ${f.message}`);
  assert.ok(Number.isInteger(f.size) && f.size >= 1, `${src}: size ${f.size}`);
  assert.ok(Array.isArray(f.ops) && Array.isArray(f.symbols), src);
  return f.fn(x);
}
const size = (src) => {
  const f = compile(src);
  assert.ok(f.ok, `"${src}" should compile, got ${f.kind}: ${f.message}`);
  return f.size;
};

test('MathLive-style LaTeX evaluates correctly', () => {
  const cases = [
    [R`\sin 2x`, 0.5, 0.8415], [R`\sin^2 x`, 0.5, 0.2298], [R`\sin x^2`, 2, -0.7568], [R`\sin(x)^2`, 2, 0.8268],
    [R`\left|x-2\right|+1`, 0.5, 2.5], ['|x|', -2, 2], [R`\operatorname{abs}(x)`, -2, 2], [R`\mathrm{abs}(x)`, -2, 2],
    [R`\sqrt[3]{x}`, -8, -2], [R`\log x`, 2, 0.30103], [R`\log_{2}x`, 2, 1], [R`\ln x`, 2, 0.6931],
    ['e^x', 2, 7.3891], [R`\exponentialE^{x}`, 2, 7.3891], [R`\mathrm{e}^{x}`, 2, 7.3891], [R`\exp(x)`, 2, 7.3891],
    [R`\pi`, 0, 3.14159], [R`2\pi x`, 0.5, 3.1416], ['(x+1)(x-1)', 2, 3], [R`x\sin x`, 2, 1.8186],
    [R`\frac12x`, 2, 1], [R`x\div 2`, 2, 1], [R`x\cdot 2`, 2, 4], [R`x\times 2`, 2, 4], ['-x^2', 2, -4],
    ['.5x', 2, 1], [R`x\,+\;1\ +\:2`, 2, 5], [R`\left[x+1\right]^2`, 2, 9],
    ['y=x^2', 2, 4], ['f(x)=x^2', 2, 4], [R`f\left(x\right)=x^2`, 2, 4],
    ['x', 3, 3], [R`\left(x\right)`, -1.5, -1.5], [R`\sin\left(x\right)`, 2, 0.9093]
  ];
  for (const [src, x, want] of cases) {
    const got = value(src, x);
    assert.ok(Math.abs(got - want) < 1e-4, `${src} @ ${x}: got ${got}, want ${want}`);
  }
});

test('outside the real domain gives NaN', () => {
  for (const [src, x] of [[R`\sqrt{x}`, -1], [R`\ln x`, -1], [R`\frac{1}{x}`, 0], [R`\arcsin x`, 2],
    [R`\cos^{-1}x`, 2], ['ix', 1]]) {
    assert.ok(Number.isNaN(value(src, x)), `${src} @ ${x} should be NaN`);
  }
});

test('plain-text input evaluates correctly', () => {
  const cases = [
    ['2sin(3x)+x^2', 2, 3.4412], ['sqrt(x)', 2, 1.4142], ['x^(1/2)', 2, 1.4142], ['abs(x)', -2, 2], ['1/x', 2, 0.5],
    ['exp(-x^2)', 0.5, 0.7788], ['sin x', 2, 0.9093], ['x**2', 2, 4], ['cos(x)^2', 2, 0.1732],
    ['sin^2(x)', 2, 0.8268], ['3e^(0.5x)', 2, 8.1548], ['x sin(x)', 2, 1.8186], ['0.25(x-1)^2-2', 2, -1.75],
    ['log_2(x)', 8, 3]
  ];
  for (const [src, x, want] of cases) {
    const got = value(src, x);
    assert.ok(Math.abs(got - want) < 1e-4, `${src} @ ${x}: got ${got}, want ${want}`);
  }
});

test('spacing commands do not swallow the rest of the formula', () => {
  for (const sp of [R`\,`, R`\;`, R`\:`, R`\!`, R`\ `, R`\quad`, R`\qquad`, R`\enspace`, R`\thinspace`, '~']) {
    assert.equal(value(`x${sp}+1`, 2), 3, `x${sp}+1`);
    assert.equal(value(`2${sp}x`, 2), 4, `2${sp}x`);
  }
});

test('normalizeInput', () => {
  const n = formula.normalizeInput;
  assert.equal(n('  x−1 '), 'x-1');
  assert.equal(n('x–1'), 'x-1');
  assert.equal(n('2π'), R`2\pi`);
  assert.equal(n('2×x'), R`2\cdot x`);
  assert.equal(n('2·x'), R`2\cdot x`);
  assert.equal(n('6÷x'), '6/x');
  assert.equal(n(R`\mleft(x\mright)`), R`\left(x\right)`);
  assert.equal(n('y=x^2'), 'x^2');
  assert.equal(n(' y = x^2'), 'x^2');
  assert.equal(n('f(x)=x^2'), 'x^2');
  assert.equal(n('g( x ) = x'), 'x');
  assert.equal(n(R`f\left(x\right)=x^2`), 'x^2');
  assert.equal(n(R`\left[x+1\right]^2`), R`\left(x+1\right)^2`);
  assert.equal(n(R`\left\lbrack x\right\rbrack`), R`\left( x\right)`);
  assert.equal(n(R`\lbrack x\rbrack`), '( x)');
  assert.equal(n(R`\sqrt[3]{x}`), R`\sqrt[3]{x}`, 'bare [ is left alone');
  for (const sp of [R`\,`, R`\;`, R`\:`, R`\!`, R`\ `, R`\quad`, R`\qquad`, R`\enspace`, R`\thinspace`, '~']) {
    assert.equal(n(`x${sp}+1`), 'x +1', sp);
  }
  assert.equal(n('x=3'), 'x=3', 'x = c is not a prefix');
  assert.equal(n(null), '');
});

test('sgn and sign become \\operatorname{sgn}', () => {
  const n = formula.normalizeInput;
  assert.equal(n('sgn(x-4)'), R`\operatorname{sgn}(x-4)`);
  assert.equal(n('2sgn(x)'), R`2\operatorname{sgn}(x)`);
  assert.equal(n(R`2sgn\left(x-4\right)`), R`2\operatorname{sgn}\left(x-4\right)`, 'MathLive smartFence form');
  assert.equal(n('sign (x)'), R`\operatorname{sgn}(x)`);
  assert.equal(n('sgn x'), R`\operatorname{sgn} x`, 'no brackets: compile() asks for them');
  assert.equal(n(R`\operatorname{sgn} \left(x\right)+\mathrm{abs} (x)`), R`\operatorname{sgn}\left(x\right)+\mathrm{abs}(x)`,
    'CE reads a space before the bracket as a product');
  assert.equal(n('x+sgn(x)'), R`x+\operatorname{sgn}(x)`);
  for (const same of [R`\operatorname{sgn}(x)`, R`\mathrm{sgn}(x)`, R`\operatorname{sign}(x)`, 'xsgn(x)', 'sgnx']) {
    assert.equal(n(same), same);
  }
  for (const src of ['sgn(x-4)', '2sgn(x)', R`2sgn\left(x-4\right)`, 'sign(x)', R`\operatorname{sgn}(x)`, R`\mathrm{sgn}(x)`]) {
    const f = compile(src);
    assert.ok(f.ok, `${src}: ${f.message}`);
    assert.equal(f.fn(5), src.startsWith('2') ? 2 : 1, src);
    assert.equal(f.fn(-5), src.startsWith('2') ? -2 : -1, src);
  }
  assert.equal(compile(R`2sgn\left(x-4\right)`).fn(3), -2);
  for (const src of ['sign (x)', R`\operatorname{sgn} (x)`, R`\mathrm{sgn} \left(x\right)`, R`\operatorname{\mathrm{sgn}} \left(x\right)`]) {
    assert.equal(compile(src).fn(-5), -1, src);
    assert.deepEqual(compile(src).ops, ['Sign'], src);
  }
});

test('a function name without brackets asks for them', () => {
  // MathLive's sgn shortcut gives \operatorname{\mathrm{sgn}}
  for (const src of [R`\operatorname{sgn}x`, R`\mathrm{sgn}x`, R`2\operatorname{\mathrm{sgn}}x`, 'sgn x', '2sgn x+1', 'sign x',
    R`x\operatorname{sgn}`]) {
    const f = compile(src);
    assert.equal(f.ok, false, src);
    assert.equal(f.kind, 'bare-function', src);
    assert.equal(f.message, 'Put brackets after sgn, e.g. sgn(x).', src);
    assert.deepEqual(f.detail, ['Sign'], src);
  }
  assert.equal(compile(R`\operatorname{abs}x`).message, 'Put brackets after abs, e.g. abs(x).');
  assert.deepEqual(compile(R`\operatorname{floor}x`).detail, ['Floor']);
  // function applications whose raw parse has a bare name are fine (CE's canonical form applies it)
  assert.ok(compile(R`\Gamma(x)`).ok);
  assert.ok(compile(R`\operatorname{sgn}(x)`).ok);
});

test('formula size counts numbers, symbols, operators and functions (brackets free)', () => {
  const table = {
    1: ['3', '-3', 'x', R`\pi`, '123456.789', R`\left(\left(x\right)\right)`],
    2: ['-x', R`\sqrt{x}`, R`\sin x`, R`\sin\left(x\right)`, R`\ln(x)`, R`\lfloor x\rfloor`, R`\cos^{-1}x`, R`\arccos x`,
      R`\sin^{-1}(x)`],
    3: ['x-1', '2x', '0.5x', 'x/2', R`\frac{x}{2}`, R`x\cdot 2`, 'x^2', 'x^{2}', 'x^{-1}', R`\frac{4}{x}`, '2^x', 'e^{x}',
      R`\exponentialE^{x}`, R`\exp(x)`, R`\sqrt[3]{x}`, R`x\,+\;1`, 'f(x)=x^2', 'y=x^2', R`\log_{3}\left(x\right)`,
      R`\log_{2}\left(x\right)`, '123456.789x', R`\max(x,1)`],
    4: [R`\sin^2 x`, '-x^2', R`\operatorname{sgn}\left(x-4\right)`, 'sgn(x-4)', R`\tan^{-1}x+1`],
    5: [R`\frac{1}{2}x`, '-2x+3', R`x^{\frac{1}{3}}`, 'x+1+2', R`\min(x,1,2)`],
    6: [R`\left|x-2\right|-1`, 'abs(x-2)-1', '|x - 2| - 1', R`2sgn\left(x-4\right)`],
    7: [R`\left(x+1\right)\left(x-1\right)`, R`\max\left(x,0.5x,1\right)`],
    8: ['-(x-2)^2+4', R`2\sin\left(\frac{\pi x}{4}\right)`, R`\sqrt{25-x^2}-1`],
    9: ['0.25x^3-3x'],
    10: [R`4e^{-\frac{x^2}{2}}`],
    11: [R`\frac{1}{4}x^3-3x`, R`\frac{1.5}{x-2}+0.3x-1`],
    14: [R`2\sin\left(3x+1\right)+0.5x-1`],
    17: ['0.1x^3+0.2x^2-1.3x+2'],
    22: [R`1.5\left|x+3\right|-2\left|x-1\right|+0.5\left|x-4\right|+1`, '1.5|x+3|-2|x-1|+0.5|x-4|+1']
  };
  for (const [want, list] of Object.entries(table)) {
    for (const src of list) assert.equal(size(src), Number(want), src);
  }
});

test('formula size does not depend on spelling', () => {
  const groups = [
    [R`\left(x+1\right)^2`, '(x+1)^2', R`\left[x+1\right]^2`],
    ['|x|', R`\left|x\right|`, 'abs(x)', R`\operatorname{abs}(x)`],
    ['x+1', R`x\,+1`, R`x\;+\;1`, R`x\quad+1`, ' x + 1 '],
    [R`\operatorname{sgn}(x)`, R`\mathrm{sgn}(x)`, 'sgn(x)', 'sign(x)', R`sgn\left(x\right)`, R`\operatorname{\mathrm{sgn}}\left(x\right)`,
      'sign (x)'],
    [R`\arcsin x`, R`\sin^{-1}x`], [R`\exp(x)`, 'e^x', R`\exponentialE^{x}`]
  ];
  for (const g of groups) for (const src of g) assert.equal(size(src), size(g[0]), `${src} vs ${g[0]}`);
});

test('formulaSize on raw MathJSON', () => {
  const s = formula.formulaSize;
  assert.equal(s(3), 1);
  assert.equal(s('x'), 1);
  assert.equal(s({ num: '123456789012345678901234567890' }), 1);
  assert.equal(s(['Negate', 3]), 1);
  assert.equal(s(['Negate', 'x']), 2);
  assert.equal(s(['Delimiter']), 0);
  assert.equal(s(['Delimiter', ['Add', 'x', 1]]), 3);
  assert.equal(s(['Add', 'x', 1, 2]), 5);
  assert.equal(s(['Max', 'x', 1, 2]), 5);
  assert.equal(s(['Exp', 'x']), 3);
  assert.equal(s(['Lb', 'x']), 3);
  assert.equal(s(['Apply', ['InverseFunction', 'Cos'], 'x']), 2);
});

test('a successful compile lists its operators and symbols', () => {
  const f = compile(R`2\sin\left(\pi x\right)+e^{x}`);
  assert.deepEqual([...f.ops].sort(), ['Add', 'InvisibleOperator', 'Power', 'Sin']);
  assert.deepEqual([...f.symbols].sort(), ['Pi', 'e', 'x']);
  assert.deepEqual(compile('3').ops, []);
  assert.deepEqual(compile('3').symbols, []);
  assert.deepEqual([...compile(R`\cos^{-1}x`).ops].sort(), ['Apply', 'Cos', 'InverseFunction']);
  assert.deepEqual(compile(R`\lfloor x\rfloor`).ops, ['Floor']);
});

test('the challenge allowlist', () => {
  assert.deepEqual([...formula.CHALLENGE_SYMBOLS], ['x', 'Pi', 'e', 'ExponentialE', 'a', 'b', 'c', 'd']);
  for (const op of ['Add', 'Subtract', 'Negate', 'Multiply', 'InvisibleOperator', 'Divide', 'Power', 'Sqrt', 'Root', 'Abs',
    'Sign', 'Exp', 'Ln', 'Log', 'Lb', 'Sin', 'Cos', 'Tan', 'Arcsin', 'Max', 'Min', 'Delimiter', 'Apply', 'InverseFunction']) {
    assert.ok(formula.CHALLENGE_OPS.includes(op), op);
  }
  const bad = (src) => formula.disallowed(compile(src));
  for (const src of [R`\frac{1}{2}x`, R`\sqrt[3]{x}`, R`\exponentialE^{x}`, R`\mathrm{e}^{x}`, R`\cos^{-1}x`, R`\log_{3}x`,
    R`\log x`, R`\log_2 x`, R`\exp(-x^2)`, R`\sec x+\csc x+\cot x`, R`\tanh x+\sinh x+\cosh x`, R`\arctan x`,
    R`\max(x,1)-\min(x,2)`, R`\operatorname{sgn}(x)`, 'sgn(x)', '|x|', R`2\pi x`, 'x**2', 'x^(1/2)']) {
    assert.deepEqual(bad(src), [], src);
  }
  assert.deepEqual(bad(R`\lfloor x\rfloor`), ['Floor']);
  assert.deepEqual(bad(R`x\bmod 2`), ['Mod']);
  assert.deepEqual(bad(R`[1,2,3]_{\lfloor x\rfloor}`), ['At', 'List', 'Floor']);
  assert.deepEqual(bad(R`\operatorname{If}(x>1,x,-x)`), ['If', 'Greater']);
  assert.ok(bad(R`\sum_{k=1}^{9}\left|x-k\right|`).includes('Sum'));
  assert.ok(bad(R`\infty`).includes('PositiveInfinity'));
});

test('errors are classified, never thrown', () => {
  const kinds = {
    empty: ['', '   ', 'y='],
    incomplete: [R`x+\placeholder{}`, R`\sqrt{\placeholder{}}`],
    syntax: ['x+', R`\frac{}{x}`, '(x', R`\sinc x`, R`\left(x+1`, '&', R`\operatorname{}`],
    variables: ['kx', 'x^2y', R`\theta`, 'sinx', 'cosx', 'a2'],
    equation: ['x=3'],
    'not-number': ['x>2', R`\text{hi}`, R`\sin`, '[x+1]^2'],
    compile: ['f(x)', 'xsin(x)', R`\mathrm{mod}(x,2)`]
  };
  for (const [kind, inputs] of Object.entries(kinds)) {
    for (const src of inputs) {
      const f = compile(src);
      assert.equal(f.ok, false, `${JSON.stringify(src)} should fail`);
      assert.equal(f.kind, kind, `${JSON.stringify(src)}: ${f.message}`);
      assert.equal(typeof f.message, 'string');
    }
  }
});

test('error messages', () => {
  assert.equal(compile('').message, '');
  assert.equal(compile(R`x+\placeholder{}`).message, 'Fill in the empty box.');
  assert.equal(compile('x+').message, 'An operator is missing a side.');
  assert.equal(compile(R`\frac{}{x}`).message, "Something's missing.");
  assert.equal(compile('(x').message, 'Check your brackets.');
  assert.equal(compile(R`\left(x+1`).message, 'Check your brackets.');
  assert.equal(compile(R`\sinc x`).message, R`Unknown command \sinc.`);
  assert.equal(compile('kx').message, 'Only x and a–d can be variables (found: k). Use a, b, c or d to get a slider.');
  assert.equal(compile('hx+k').message, 'Only x and a–d can be variables (found: h, k). Use a, b, c or d to get a slider.');
  assert.deepEqual(compile('hx+k').detail, ['h', 'k']);
  assert.deepEqual(compile('cosx').detail, ['o', 's'], 'c is a variable now; o and s are not');
  assert.equal(compile('a2').message, 'Write the number first: 2a, not a2.');
  assert.equal(compile('x2').message, 'Write the number first: 2x, not x2.');
  assert.deepEqual(compile('sinx').detail, ['n', 's']);
  assert.match(compile('x=3').message, /^Type just the right-hand side/);
  // a log with a base but no input: CE's internal placeholder name must not leak into the message
  for (const src of [R`\log_2`, R`\log_{2}`, R`\log_{2\left(x\right)}`]) {
    assert.equal(compile(src).kind, 'syntax', src);
    assert.equal(compile(src).message, 'A function is missing its input, e.g. log₂(x).', src);
  }
  assert.equal(compile(R`\log_{_2}x`).kind, 'syntax', 'a stray _ is a slip, not a variable');
  assert.ok(!/topic_marker|found: _/.test(compile(R`\log_{_2}x`).message));
  assert.equal(compile('f(x)').message, 'Unknown function “f”.');
  assert.equal(compile('ksin(x)').message, 'Unknown function “ksin”.');
  // plain text: a slider letter glued to a function name reads as one unknown function (PLAN-v3 §L.8)
  assert.equal(compile('bsin(x)').message, 'Write b*sin(x) or b sin(x).');
  assert.deepEqual(compile('bsin(x)').detail, ['bsin']);
  assert.equal(compile('absqrt(x)').message, 'Write ab*sqrt(x) or ab sqrt(x).');
  assert.equal(compile('dln(x)').message, 'Write d*ln(x) or d ln(x).');
  assert.equal(compile('csgn(x-1)').message, 'Write c*sgn(x) or c sgn(x).');
  assert.equal(compile('xsin(x)').message, 'Write x*sin(x) or x sin(x).');
  for (const src of ['bsin(x)', 'cabs(x)', 'aexp(x)', 'blog(x)', 'dcot(x)']) assert.equal(compile(src).kind, 'compile', src);
  assert.ok(compile('asin(x)').ok, 'asin is arcsin, as before');
});

test('a successful result carries source and pretty forms', () => {
  const f = compile(' y = 2−x ');
  assert.equal(f.ok, true);
  assert.equal(f.source, '2-x');
  assert.equal(typeof f.pretty, 'string');
  assert.equal(f.compiled, undefined, 'no interpreted fallback any more');
});

test('fn never throws and only returns finite numbers or NaN', () => {
  for (const src of [R`\frac{1}{x}`, R`\sqrt{x}`, R`\ln x`, 'e^{1000x}', R`\tan x`, R`\operatorname{sgn}(x)`, 'x!']) {
    const { fn } = compile(src);
    for (const x of [-1e308, -2, -1, 0, 1e-320, 0.5, 2, 1e308, NaN, Infinity, -Infinity, '2', undefined]) {
      const v = fn(x);
      assert.equal(typeof v, 'number');
      assert.ok(Number.isNaN(v) || (Number.isFinite(v) && Math.abs(v) <= 1e100), `${src} @ ${x} → ${v}`);
    }
  }
  assert.ok(Number.isNaN(compile('e^{1000x}').fn(1)), 'overflow becomes NaN');
});

test('a compiler can share an existing engine', () => {
  const { CE } = require('./helpers.js');
  const ce = new CE.ComputeEngine();
  const c = formula.createCompiler(CE, ce);
  assert.equal(c.ce, ce);
  assert.equal(c.compile('x^2').fn(3), 9);
});

// ---- slider variables a–d (PLAN-v3 §C) ----

test('a–d are variables: params, bind and defaults', () => {
  const f = compile(R`a\sin\left(bx+c\right)+d`);
  assert.ok(f.ok);
  assert.deepEqual(f.params, ['a', 'b', 'c', 'd']);
  assert.equal(f.size, 10, 'each variable counts 1, like a number');
  assert.equal(f.size, compile(R`2.7\sin\left(0.5x+2.2\right)-1`).size);
  for (const [src, num] of [['ax+b', '2x+1'], ['abx', '2\\cdot3x'], [R`\frac{a}{x-b}`, R`\frac{2}{x-1}`], [R`a\left|x-b\right|+c`, R`2\left|x-1\right|+3`]]) {
    assert.equal(compile(src).size, compile(num).size, `${src} vs ${num}`);
  }
  assert.deepEqual(formula.disallowed(f), [], 'a–d are allowed in challenges');
  assert.equal(compile('kx+a').kind, 'variables', 'other letters are still not allowed');
  assert.ok(Math.abs(f.fn(2) - Math.sin(2)) < 1e-12, 'fn uses the defaults a = b = 1, c = d = 0');
  const g = f.bind({ a: 2, b: 0.5, c: -1, d: 3 });
  assert.ok(Math.abs(g(2) - (2 * Math.sin(0) + 3)) < 1e-12);
  assert.ok(Math.abs(f.bind({ a: 2 })(2) - 2 * Math.sin(2)) < 1e-12, 'missing values use the defaults');
  assert.ok(Math.abs(f.fn(2) - Math.sin(2)) < 1e-12, 'binding does not change fn');
  assert.deepEqual(compile('3x').params, []);
  const cases = [['ax', { a: 3 }, 2, 6], ['abx', { a: 2, b: 3 }, 1, 6], [R`a\cdot b`, { a: 2, b: -3 }, 0, -6], ['ab', { a: 2, b: 5 }, 0, 10],
    [R`\sin(bx)`, { b: 2 }, 1, Math.sin(2)], ['a(x-b)^2+c', { a: -1, b: 2, c: 4 }, 0, 0], ['x^a', { a: 2 }, 3, 9],
    [R`\frac{a}{x-b}`, { a: 4, b: 1 }, 3, 2], ['c(x)', { c: 3 }, 2, 6], ['a sin(bx)', { a: 2, b: 1 }, 1, 2 * Math.sin(1)],
    ['a*sin(b*x)+c', { a: 2, b: 1, c: 1 }, 0, 1], ['abs(x-a)', { a: 2 }, 0, 2], ['dx', { d: 3 }, 2, 6]];
  for (const [src, vals, x, want] of cases) {
    const r = compile(src);
    assert.ok(r.ok, `${src}: ${r.message}`);
    assert.ok(Math.abs(r.bind(vals)(x) - want) < 1e-9, `${src} @ ${x} with ${JSON.stringify(vals)}: ${r.bind(vals)(x)}`);
  }
});

test('function names that contain a–d still work', () => {
  for (const [src, x, want] of [['cos(x)', 0, 1], ['sec(x)', 0, 1], ['csc(x)', 1, 1 / Math.sin(1)], ['cosh(x)', 0, 1], ['abs(x)', -2, 2],
    ['acos(x)', 1, 0], ['asin(x)', 1, Math.PI / 2], ['atan(x)', 1, Math.PI / 4], ['ceil(x)', 1.5, 2], [R`\arccos(x)`, 1, 0], ['exp(x)', 0, 1]]) {
    const f = compile(src);
    assert.ok(f.ok, `${src}: ${f.message}`);
    assert.deepEqual(f.params, [], src);
    assert.ok(Math.abs(f.fn(x) - want) < 1e-9, `${src} @ ${x}`);
  }
  // derivatives and integrals keep their d (lessons only; challenges turn them down)
  assert.deepEqual(compile(R`\frac{d}{dx}x^2`).params, []);
  assert.equal(compile(R`\frac{d}{dx}x^2`).fn(3), 6);
  assert.deepEqual(compile(R`\int_0^x t\,dt`).params, []);
});

test("MathLive's dx shortcut (\\differentialD) and \\mathrm{d} are the variable d", () => {
  assert.equal(formula.normalizeInput(R`2\differentialD x+1`), '2d x+1');
  assert.equal(formula.normalizeInput(R`2\mathrm{d}x+1`), '2d x+1');
  assert.equal(formula.normalizeInput(R`\mathrm{ d }`), 'd');
  for (const src of [R`2\mathrm{d}x+1`, R`2\differentialD\,x+1`, R`2\mathrm{d}\cdot x+1`]) {
    const g = compile(src);
    assert.ok(g.ok, `${src}: ${g.message}`);
    assert.deepEqual(g.params, ['d'], src);
    assert.equal(g.bind({ d: 3 })(1), 7, src);
  }
  assert.ok(compile(R`\mathrm{dx}`).ok === false, 'only a lone upright d');
  const f = compile(R`2\differentialD x+1`);
  assert.ok(f.ok);
  assert.deepEqual(f.params, ['d']);
  assert.equal(f.bind({ d: 3 })(1), 7);
});

test('substitute writes slider values into the formula (display only)', () => {
  const S = (src, v) => game.compiler.substitute(src, v);
  assert.equal(S(R`a\sin\left(bx+c\right)+d`, { a: 1.3, b: 0.79, c: -0.5, d: -2 }), R`1.3\sin(0.79x-0.5)-2`);
  assert.equal(S('ax^2+bx+c', { a: -0.5, b: 1, c: 0 }), '-0.5x^2+x');
  assert.equal(S(R`a\left|x-b\right|+c`, { a: 1.2, b: -0.2, c: -5.2 }), R`1.2\vert x+0.2\vert-5.2`);
  assert.equal(S('2a', { a: -1.5 }), '2(-1.5)');
  assert.equal(S('a*sin(b*x)', { a: 2, b: 3 }), R`2\sin(3x)`);
  assert.equal(S('x+', { a: 1 }), 'x+', 'an invalid formula comes back unchanged');
  assert.equal(S('', {}), '');
  // toLatex without prettify (PLAN-v3 §L.6): no digit grouping, no x^{-1} → \frac{1}{x}, terms keep their order
  assert.equal(S('ax+b', { a: 1.2345, b: 12345 }), '1.2345x+12345');
  assert.equal(S('x^a', { a: -1 }), 'x^{-1}');
  assert.equal(S(R`\frac{a}{x-b}+c`, { a: -2, b: -1, c: 0.5 }), R`\frac{-2}{x+1}+0.5`);
  assert.equal(S(R`a\left(x-b\right)^2+c`, { a: 1, b: -2, c: -3 }), '(x+2)^2-3');
  assert.equal(S(R`e^{ax}`, { a: -0.3 }), 'e^{-0.3x}');
  assert.equal(S('ax+b', { a: 1000000, b: -0.000001 }), '1000000x-0.000001');
  assert.equal(S('3x+1', { a: 2 }), '3x+1', 'no variables: unchanged');
  // subtractions: no brackets around a leading negative number or sum, and no "minus a negative"
  assert.equal(S('c-x^2', { c: -0.5 }), '-0.5-x^2');
  assert.equal(S('c-x^2', { c: 0 }), '-x^2');
  assert.equal(S('a-b-c-d', { a: -1.5, b: 0.79, c: -0.5, d: -2 }), '-1.5-0.79+0.5+2');
  assert.equal(S('x-ax-b', { a: -1.5, b: 0.79 }), 'x+1.5x-0.79');
  assert.equal(S(R`x-a\sin(x)`, { a: -1 }), R`x+\sin(x)`);
  assert.equal(S(R`d-a\left(x-b\right)^2`, { a: -1.5, b: 0.79, d: -2 }), '-2+1.5(x-0.79)^2');
  // whatever the display, it must still mean the formula with its values
  const vals = [{ a: -1.5, b: 0.79, c: -0.5, d: -2 }, { a: -1, b: -1, c: 2, d: 1 }, { a: 2, b: 1, c: 0, d: 0 }];
  for (const src of ['a-b-c-d', 'c-ax', 'x-ax', R`x-a\sin(x)`, 'x-ab', R`d-a\left(x-b\right)^2`, R`\sqrt{c-x^2}`, 'x-(a-b)',
    R`a-\left(b-c\right)-d`, R`\frac{x-a}{b-x}`, 'x^{a-b}', R`e^{-ax}-b`]) {
    for (const v of vals) {
      const f = game.compiler.compile(src).bind(v), g = game.compiler.compile(S(src, v));
      assert.ok(g.ok, `${src} with ${JSON.stringify(v)} → ${S(src, v)}`);
      for (const x of [-2.3, 0.4, 1.7, 3.3]) {
        const y1 = f(x), y2 = g.fn(x);
        assert.ok(Math.abs(y1 - y2) < 1e-9 || (Number.isNaN(y1) && Number.isNaN(y2)), `${src} ${JSON.stringify(v)} at ${x}`);
      }
    }
  }
});

test('latexTerms splits a sum at top level only', () => {
  const T = formula.latexTerms;
  assert.deepEqual(T(R`2\sin\left(x-1\right)-0.5x+3`), [R`2\sin\left(x-1\right)`, '-0.5x', '+3']);
  assert.deepEqual(T(R`1.3\sin(0.79x-0.5)-2`), [R`1.3\sin(0.79x-0.5)`, '-2']);
  assert.deepEqual(T(R`1.2\vert x+0.2\vert-5.2`), [R`1.2\vert x+0.2\vert`, '-5.2'], 'never inside \vert bars');
  assert.deepEqual(T('|x-1|+|x+2|-3'), ['|x-1|', '+|x+2|', '-3'], 'never inside | bars');
  assert.deepEqual(T(R`\left|x-b\right|+c`), [R`\left|x-b\right|`, '+c']);
  assert.deepEqual(T(R`-\frac{x+1}{x-1}+e^{-x}-[x+1]^2`), [R`-\frac{x+1}{x-1}`, '+e^{-x}', '-[x+1]^2']);
  assert.deepEqual(T(R`\sqrt{(x+1)(x-[2+x])}-x^-2+1`), [R`\sqrt{(x+1)(x-[2+x])}`, '-x^-2', '+1'], 'nested brackets; a bare ^- sign');
  assert.deepEqual(T(R`\lvert x-1\rvert+2`), [R`\lvert x-1\rvert`, '+2']);
  assert.deepEqual(T(R`2\mathrm{sgn}(x-1)-\sin(0.5x)`), [R`2\mathrm{sgn}(x-1)`, R`-\sin(0.5x)`]);
  assert.deepEqual(T('-x'), ['-x']);
  assert.deepEqual(T(''), []);
  const S = (src, v) => game.compiler.substitute(src, v);
  for (const [src, v] of [[R`a\sin\left(bx+c\right)+d`, { a: 1.3, b: 0.79, c: -0.5, d: -2 }], ['ax^2+bx+c', { a: -0.5, b: 1, c: 0 }],
    [R`a\left|x-b\right|+c`, { a: 1.2, b: -0.2, c: -5.2 }], ['2a', { a: -1.5 }], [R`\left|ax-b\right|-\left|x+c\right|`, { a: 2, b: -1, c: 3 }]]) {
    const out = S(src, v);
    assert.equal(T(out).join(''), out, 'the terms rebuild the formula');
  }
  assert.deepEqual(T(S(R`\left|ax-b\right|-\left|x+c\right|`, { a: 2, b: -1, c: 3 })), [R`\vert2x+1\vert`, R`-\vert x+3\vert`]);
});
