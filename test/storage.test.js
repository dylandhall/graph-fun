const test = require('node:test');
const assert = require('node:assert/strict');
const { storage, levels, engine, game } = require('./helpers.js');

const KEY = 'graph-fun.progress.v1';

function fakeBackend(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

const throwing = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); }
};

test('unknown levels have empty progress', () => {
  const s = storage.createStore(fakeBackend());
  assert.deepEqual(s.get('flat'), { bestScore: 0, stars: 0, bestFormula: '', bestVars: null, lastFormula: '', lastVars: null, hints: 0 });
  assert.deepEqual(s.all(), {});
});

test('record keeps the best score, max stars and the best formula', () => {
  const b = fakeBackend();
  const s = storage.createStore(b);
  assert.deepEqual(s.record('flat', { score: 700, stars: 2, formula: '3.1' }), { isNewBest: true });
  assert.deepEqual(s.record('flat', { score: 500, stars: 1, formula: '2.9' }), { isNewBest: false });
  assert.deepEqual(s.get('flat'), { bestScore: 700, stars: 2, bestFormula: '3.1', bestVars: null, lastFormula: '2.9', lastVars: null, hints: 0 });
  assert.deepEqual(s.record('flat', { score: 1000, stars: 3, formula: '3' }), { isNewBest: true });
  assert.deepEqual(s.get('flat'), { bestScore: 1000, stars: 3, bestFormula: '3', bestVars: null, lastFormula: '3', lastVars: null, hints: 0 });
  assert.deepEqual(JSON.parse(b.data[KEY]), {
    version: 1, rules: 0, levels: { flat: { bestScore: 1000, stars: 3, bestFormula: '3', bestVars: null, lastFormula: '3', lastVars: null, hints: 0 } }
  });
  // A fresh store over the same backend sees the saved progress.
  assert.equal(storage.createStore(b).get('flat').bestScore, 1000);
});

test('attempts rank by stars, then score, and the best fields stay together', () => {
  const s = storage.createStore(fakeBackend());
  assert.deepEqual(s.record('abs', { score: 510, stars: 1, formula: 'starred' }), { isNewBest: true });
  // 4 of 5 dots at par scores 800 but earns no star: it must not displace the starred attempt
  assert.deepEqual(s.record('abs', { score: 800, stars: 0, formula: 'four dots' }), { isNewBest: false });
  assert.deepEqual(s.get('abs'), { bestScore: 510, stars: 1, bestFormula: 'starred', bestVars: null, lastFormula: 'four dots', lastVars: null, hints: 0 });
  assert.deepEqual(s.record('abs', { score: 505, stars: 1, formula: 'worse' }), { isNewBest: false });
  assert.deepEqual(s.record('abs', { score: 640, stars: 2, formula: 'two' }), { isNewBest: true });
  assert.deepEqual(s.get('abs'), { bestScore: 640, stars: 2, bestFormula: 'two', bestVars: null, lastFormula: 'two', lastVars: null, hints: 0 });

  // the other order: a 0★ attempt first, then a starred one with a lower score
  s.record('sqrt', { score: 800, stars: 0, formula: 'four dots' });
  assert.deepEqual(s.get('sqrt'), { bestScore: 800, stars: 0, bestFormula: 'four dots', bestVars: null, lastFormula: 'four dots', lastVars: null, hints: 0 });
  assert.deepEqual(s.record('sqrt', { score: 510, stars: 1, formula: 'starred' }), { isNewBest: true });
  assert.deepEqual(s.get('sqrt'), { bestScore: 510, stars: 1, bestFormula: 'starred', bestVars: null, lastFormula: 'starred', lastVars: null, hints: 0 });

  // a first attempt worth nothing still counts as played
  assert.deepEqual(s.record('exp', { score: 0, stars: 0, formula: 'x' }), { isNewBest: false });
  assert.deepEqual(s.get('exp'), { bestScore: 0, stars: 0, bestFormula: 'x', bestVars: null, lastFormula: 'x', lastVars: null, hints: 0 });
  s.record('exp', { score: 0, stars: 0, formula: 'y' });
  assert.equal(s.get('exp').bestFormula, 'x');
});

test('challenge attempts are recorded with stars 0, so they rank by score only', () => {
  const s = storage.createStore(fakeBackend());
  assert.deepEqual(s.record('c01', { score: 640, stars: 0, formula: 'a' }), { isNewBest: true });
  assert.deepEqual(s.record('c01', { score: 600, stars: 0, formula: 'b' }), { isNewBest: false });
  assert.deepEqual(s.record('c01', { score: 640, stars: 0, formula: 'c' }), { isNewBest: false }, 'a tie keeps the first');
  assert.deepEqual(s.record('c01', { score: 801, stars: 0, formula: 'd' }), { isNewBest: true });
  assert.deepEqual(s.get('c01'), { bestScore: 801, stars: 0, bestFormula: 'd', bestVars: null, lastFormula: 'd', lastVars: null, hints: 0 });
});

test('a second tab never overwrites newer progress with a stale copy', () => {
  const b = fakeBackend();
  const tabA = storage.createStore(b), tabB = storage.createStore(b);
  tabA.record('flat', { score: 1000, stars: 3, formula: '3' });
  tabB.setLast('slope', 'x/2');
  assert.equal(tabB.get('flat').stars, 3, 'tab B sees tab A’s progress');
  assert.equal(storage.createStore(b).get('flat').bestScore, 1000);
  assert.equal(tabA.get('slope').lastFormula, 'x/2');
  assert.equal(tabA.isUnlocked(1, levels.LEVELS), true);
  tabB.reset();
  assert.deepEqual(tabA.all(), {}, 'a reset in one tab reaches the other');
});

test('setLast remembers the last formula only', () => {
  const b = fakeBackend();
  const s = storage.createStore(b);
  s.setLast('slope', 'x/2');
  assert.deepEqual(s.get('slope'), { bestScore: 0, stars: 0, bestFormula: '', bestVars: null, lastFormula: 'x/2', lastVars: null, hints: 0 });
  assert.equal(storage.createStore(b).get('slope').lastFormula, 'x/2');
});

test('unlock chain and unlockAll', () => {
  const s = storage.createStore(fakeBackend());
  const L = levels.LEVELS;
  assert.equal(s.isUnlocked(0, L), true);
  assert.equal(s.isUnlocked(1, L), false);
  s.record(L[0].id, { score: 400, stars: 0, formula: 'x' });
  assert.equal(s.isUnlocked(1, L), false, '0★ does not unlock');
  s.record(L[0].id, { score: 600, stars: 1, formula: '3' });
  assert.equal(s.isUnlocked(1, L), true);
  assert.equal(s.isUnlocked(2, L), false);
  assert.equal(s.isUnlocked(5, L, { unlockAll: true }), true);
  assert.equal(s.get(L[5].id).stars, 0, 'unlockAll does not persist anything');
});

test('reset clears everything', () => {
  const b = fakeBackend();
  const s = storage.createStore(b);
  s.record('flat', { score: 1000, stars: 3, formula: '3' });
  s.reset();
  assert.deepEqual(s.all(), {});
  assert.equal(b.data[KEY], undefined);
});

test('corrupt or foreign data resets', () => {
  for (const raw of ['{not json', '[]', '{"version":2,"levels":{"flat":{"stars":3}}}', 'null', '"x"']) {
    const s = storage.createStore(fakeBackend({ [KEY]: raw }));
    assert.deepEqual(s.all(), {}, raw);
    s.record('flat', { score: 10, stars: 0, formula: 'x' });
    assert.equal(s.get('flat').bestScore, 10);
  }
  const s = storage.createStore(fakeBackend({ [KEY]: JSON.stringify({ version: 1, levels: { flat: { bestScore: 'x', stars: 9 } } }) }));
  assert.deepEqual(s.get('flat'), { bestScore: 0, stars: 3, bestFormula: '', bestVars: null, lastFormula: '', lastVars: null, hints: 0 });
});

test('a throwing or missing backend falls back to memory', () => {
  for (const backend of [throwing, null]) {
    const s = storage.createStore(backend);
    assert.deepEqual(s.record('flat', { score: 900, stars: 2, formula: '3' }), { isNewBest: true });
    s.setLast('flat', '3.01');
    assert.deepEqual(s.get('flat'), { bestScore: 900, stars: 2, bestFormula: '3', bestVars: null, lastFormula: '3.01', lastVars: null, hints: 0 });
    assert.equal(s.isUnlocked(1, levels.LEVELS), true);
    s.reset();
    assert.deepEqual(s.all(), {});
    assert.equal(s.isPersistent(), false);
  }
  let calls = 0;
  const flaky = { getItem: () => null, setItem() { calls++; throw new Error('quota'); }, removeItem() {} };
  const s = storage.createStore(flaky);
  s.record('flat', { score: 1, stars: 0, formula: 'x' });
  s.record('flat', { score: 2, stars: 0, formula: 'x' });
  assert.equal(s.get('flat').bestScore, 2);
  assert.equal(calls, 1, 'stops using a backend once it throws');
});

test('custom key and default backend', () => {
  const b = fakeBackend();
  storage.createStore(b, 'other').record('flat', { score: 5, stars: 0, formula: 'x' });
  assert.ok('other' in b.data);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const local = fakeBackend();
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
    storage.createStore().record('flat', { score: 5, stars: 0, formula: 'x' });
    assert.equal(JSON.parse(local.data[KEY]).levels.flat.bestScore, 5);
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    const s = storage.createStore();
    s.record('flat', { score: 7, stars: 0, formula: 'x' });
    assert.equal(s.get('flat').bestScore, 7);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage;
  }
});

// ---- PLAN-v3: slider values, hints, scoring-rules version and the one-off re-score ----

test('record and setLast keep slider values with their formula', () => {
  const s = storage.createStore(fakeBackend());
  const v1 = { a: { value: 1.3, offset: 1, step: 0.1 } }, v2 = { a: { value: 1.2, offset: 1, step: 0.1 } };
  s.record('sine', { score: 900, stars: 2, formula: 'a\\sin x', vars: v1 });
  s.record('sine', { score: 800, stars: 1, formula: 'a\\sin x', vars: v2 });
  assert.deepEqual(s.get('sine').bestVars, v1);
  assert.deepEqual(s.get('sine').lastVars, v2);
  s.setLast('sine', '3\\sin x');
  assert.equal(s.get('sine').lastVars, null, 'a formula without variables clears lastVars');
  s.setLast('sine', 'a\\sin(bx)', { a: { value: 3, offset: 3, step: 1 }, b: { value: 'x' }, c: { value: true }, k: { value: 1 } });
  assert.deepEqual(s.get('sine').lastVars, { a: { value: 3, offset: 3, step: 1 } }, 'invalid and unknown entries are dropped');
  s.setLast('sine', 'a', { a: { value: 2 } });
  assert.deepEqual(s.get('sine').lastVars, { a: { value: 2, offset: 2, step: 0.1 } }, 'offset defaults to the value, step to 0.1');
  s.setLast('sine', 'a', {});
  assert.equal(s.get('sine').lastVars, null, 'empty → null');
});

test('any positive step is kept (clamped to [1e-6, 1000]); anything else becomes 0.1', () => {
  const s = storage.createStore(fakeBackend());
  const step = (st) => { s.setLast('sine', 'a', { a: { value: 2, offset: 2, step: st } }); return s.get('sine').lastVars.a.step; };
  assert.equal(step(0.25), 0.25);
  assert.equal(step(5), 5);
  assert.equal(step(0.000001), 0.000001);
  assert.equal(step(5000), 1000);
  assert.equal(step(1e-9), 1e-6);
  for (const bad of [0, -1, NaN, Infinity, null, '', 'x', undefined]) assert.equal(step(bad), 0.1, String(bad));
});

test('hints only go up and survive a reload; reset clears them', () => {
  const b = fakeBackend(), s = storage.createStore(b);
  assert.equal(s.revealHint('sine', 1), 1);
  assert.equal(s.revealHint('sine', 0), 1);
  assert.equal(s.revealHint('sine', 2), 2);
  assert.equal(s.revealHint('sine', 7), 2);
  assert.equal(storage.createStore(b).get('sine').hints, 2);
  assert.equal(storage.createStore(fakeBackend({ [KEY]: JSON.stringify({ version: 1, levels: { sine: { hints: 9 } } }) })).get('sine').hints, 2,
    'clamped to 0–2 when read');
  s.reset();
  assert.equal(s.get('sine').hints, 0);
});

test('old data (no rules field) is version 1; an empty store is 0', () => {
  const old = JSON.stringify({ version: 1, levels: { flat: { bestScore: 640, stars: 2, bestFormula: '3.4', lastFormula: '3.4' } } });
  assert.equal(storage.createStore(fakeBackend({ [KEY]: old })).rulesVersion(), 1);
  assert.equal(storage.createStore(fakeBackend()).rulesVersion(), 0);
  assert.deepEqual(storage.createStore(fakeBackend({ [KEY]: old })).get('flat'),
    { bestScore: 640, stars: 2, bestFormula: '3.4', bestVars: null, lastFormula: '3.4', lastVars: null, hints: 0 });
});

// What app.js boot() passes to migrate (PLAN-v3 §B.6, §L.5).
const rescoreEntry = (id, e) => game.rescore(levels.getLevel(id) || levels.getChallenge(id), e);

test('migrate re-scores every stored best once, through the engine', () => {
  const stored = {
    slope: { bestScore: 579, stars: 1, bestFormula: '\\frac{1}{2}\\lfloor x\\rfloor+1', lastFormula: 'x' }, // old rules: 579
    sine: { bestScore: 444, stars: 0, bestFormula: 'a\\sin x', bestVars: { a: { value: 3, offset: 3, step: 0.1 } }, lastFormula: '' },
    c07: { bestScore: 974, stars: 3, bestFormula: '2.92\\sin\\left(0.4x-1.41\\right)-0.31x+0.08', lastFormula: '' },
    sandbox: { bestScore: 0, stars: 0, bestFormula: 'x^2', lastFormula: 'x^2' },
    gone: { bestScore: 10, stars: 1, bestFormula: 'x', lastFormula: 'x' },
    flat: { bestScore: 640, stars: 2, bestFormula: '', lastFormula: '3.4' }
  };
  const b = fakeBackend({ [KEY]: JSON.stringify({ version: 1, levels: stored }) });
  const s = storage.createStore(b);
  const calls = [];
  assert.equal(s.migrate(2, (id, e) => { calls.push(id); return rescoreEntry(id, e); }), 3);
  assert.deepEqual(calls, ['slope', 'sine', 'c07', 'sandbox', 'gone'], 'only entries with a best formula');
  assert.equal(s.get('slope').bestScore, game.evaluate(levels.getLevel('slope'), stored.slope.bestFormula).result.score);
  assert.equal(s.get('slope').bestScore, 961);
  assert.equal(s.get('slope').stars, 1);
  assert.equal(s.get('sine').bestScore, 1000, 'variables are bound from bestVars (a = 3 is the reference)');
  assert.equal(s.get('sine').stars, 3, 'stars can go up');
  const c07 = game.evaluate(levels.getChallenge('c07'), stored.c07.bestFormula).result.score;
  assert.deepEqual([s.get('c07').bestScore, s.get('c07').stars], [c07, 3], 'challenge scores are redone; stored stars kept');
  assert.deepEqual(s.get('sandbox'), { ...s.get('sandbox'), bestScore: 0, stars: 0, bestFormula: 'x^2' }, 'the sandbox has no score');
  assert.deepEqual(s.get('gone'), { ...s.get('gone'), bestScore: 10, stars: 1 }, 'unknown ids are kept as they are');
  assert.deepEqual(s.get('flat'), { ...s.get('flat'), bestScore: 640, stars: 2 });
  assert.equal(s.rulesVersion(), 2);
  assert.equal(JSON.parse(b.data[KEY]).rules, 2);
  assert.equal(storage.createStore(b).migrate(2, () => { throw new Error('must not run twice'); }), 0);
  // stars never drop, even if a re-score says so; a throw keeps the entry
  const t = storage.createStore(fakeBackend({ [KEY]: JSON.stringify({ version: 1, levels: {
    flat: { bestScore: 900, stars: 3, bestFormula: '3', lastFormula: '' }, line: { bestScore: 700, stars: 1, bestFormula: 'x', lastFormula: '' } } }) }));
  assert.equal(t.migrate(2, (id) => { if (id === 'line') throw new Error('boom'); return { score: 400, stars: 1 }; }), 1);
  assert.deepEqual([t.get('flat').bestScore, t.get('flat').stars], [400, 3]);
  assert.deepEqual([t.get('line').bestScore, t.get('line').stars], [700, 1]);
});

test('rescore guards: keep entries that timed out, lost their slider values, or no longer evaluate', () => {
  const sine = levels.getLevel('sine');
  assert.equal(game.rescore(sine, { bestFormula: 'a\\sin x' }), null, 'variables without bestVars (an older build dropped them)');
  assert.equal(game.rescore(sine, { bestFormula: 'a\\sin(bx)', bestVars: { a: { value: 3, offset: 3, step: 0.1 } } }), null,
    'a used variable is missing');
  assert.deepEqual(game.rescore(sine, { bestFormula: 'a\\sin x', bestVars: { a: { value: 3, offset: 3, step: 0.1 } } }), { score: 1000, stars: 3 });
  assert.equal(game.rescore(sine, { bestFormula: '\\sin(' }), null, 'does not parse any more');
  assert.equal(game.rescore(sine, { bestFormula: '' }), null);
  assert.equal(game.rescore(levels.SANDBOX, { bestFormula: 'x' }), null, 'no dots');
  assert.equal(game.rescore(undefined, { bestFormula: 'x' }), null, 'unknown level');
  let t = 0;
  const slowClock = { timeBudgetMs: 300, now: () => (t += 50) };
  assert.equal(game.rescore(sine, { bestFormula: '3\\sin x' }, slowClock), null, 'ran out of time (a slow phone)');
  assert.deepEqual(game.rescore(levels.getChallenge('c01'), { bestFormula: levels.getChallenge('c01').bot.latex }),
    { score: levels.getChallenge('c01').bot.score, stars: 0 }, 'challenge stars are always recomputed from the score');
  assert.deepEqual(engine.varValues({ a: { value: 1.3, offset: 1, step: 0.1 }, b: { value: 'x' }, c: 2 }), { a: 1.3, c: 2 });
  assert.deepEqual(engine.varValues(null), {});
});

test('a fresh store migrates to the current rules without calling rescore', () => {
  const b = fakeBackend(), s = storage.createStore(b);
  assert.equal(s.migrate(2, () => { throw new Error('nothing to re-score'); }), 0);
  s.record('flat', { score: 1000, stars: 3, formula: '3' });
  assert.equal(JSON.parse(b.data[KEY]).rules, 2);
});

test('reset keeps the current rules version', () => {
  const b = fakeBackend(), s = storage.createStore(b);
  s.migrate(2, () => null);
  s.reset();
  s.record('flat', { score: 1000, stars: 3, formula: '3' });
  assert.equal(JSON.parse(b.data[KEY]).rules, 2);
});
