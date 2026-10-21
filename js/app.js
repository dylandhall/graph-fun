/*
 * Graph Fun — app shell: boot, routing, screens and wiring.
 * Browser only. Talks to the logic modules strictly through their public APIs
 * (GF.engine, GF.levels, GF.storage, GF.scoring) and draws with GF.render.
 * Three kinds of level: lessons (GF.levels.LEVELS, unlocked in order), the sandbox
 * (no dots, no score) and free-play challenges (GF.levels.CHALLENGES, always open,
 * scored against the bot; see PLAN-challenges.md §8, §11).
 *
 * Lessons hide the family until you ask (Hint 1 = family + blurb, Hint 2 = the hint; PLAN-v3 §A).
 * The letters a–d are slider variables (PLAN-v3 §C, §L.9–L.10): one slider state per letter per visit,
 * evaluated with requestAnimationFrame while dragging; scores always come from formula + values.
 *
 * For tests: GF.app.state = {game, store, level, evaluation, sliders, ...},
 * GF.app.setFormula(text) (sets the field and evaluates immediately) and
 * GF.app.setVar(name, value) (offset := value, k := 0, then evaluates).
 */
(function (root) {
  'use strict';

  var GF = root.GF = root.GF || {};
  var doc = root.document;

  var params = new URLSearchParams(root.location.search);
  var FLAGS = { unlockAll: params.get('unlock') === 'all', plain: params.has('plain') };

  var state = {
    game: null, store: null, level: null, evaluation: null,
    screen: null, inputKind: null, flags: FLAGS,
    sliders: {} // name → GF.sliders state, all four letters, for the level being played
  };

  var app = GF.app = {
    state: state,
    boot: boot,
    setFormula: setFormula,
    setVar: setVar,
    lockIn: lockIn,
    evaluateNow: evaluateNow
  };

  var MINUS = '\u2212';
  var STAR_ON = '\u2605', STAR_OFF = '\u2606';
  var WARNINGS = {
    offscreen: "Your graph isn't visible anywhere in view.",
    'undefined': 'Not defined anywhere in view.',
    saturated: 'Too wiggly to measure \u2014 length \u221e.'
  };
  var FN_LETTERS = 'sincotalgqrbxpeh'; // letters of sin cos tan ln log sqrt abs exp sinh …
  var PREFS_KEY = 'graph-fun.prefs.v1';

  var els = {};
  var LEVELS = [];
  var CHALLENGES = [];
  var SANDBOX = null;
  var SANDBOX_TITLE = 'Sandbox';
  var FREE_SIZE = 15;
  var RULES = { three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5 };
  var VARS = ['a', 'b', 'c', 'd'];
  var renderer = null;
  var input = null;
  var evalTimer = null;
  var saveTimer = null;
  var pendingSave = null;
  var lastGood = null;
  var prefs = { showCoords: true, varsTip: true, rulesNoticeSeen: 0 };
  var lastLevelId = null;
  var thumbCache = {};
  var thumbQueue = [];
  var thumbTimer = null;
  var finePointer = true;
  var hintsShown = 0;        // lessons: hints revealed on this level (0–2); sandbox: 0/1 toggle
  var varRows = {};          // name → {row, range, val, step, offset, centre}, built once per visit
  var shownVars = [];        // the letters that have a row, in a–d order
  var sliderRaf = 0;         // pending requestAnimationFrame evaluation (coalesced slider input)
  var sliderDrag = false;    // a pointer is down in the slider panel: keyboard geometry is frozen
  var pendingGeometry = false;
  var statusLive = false;    // a slider drag frame: #status (aria-live) changes at most every 500 ms
  var statusAt = 0, statusPending = null, statusTimer = null;
  var kbTipShown = false;    // "Slider for a below — hide the keyboard" shown this visit
  var rulesNotice = false;   // show the one-time rules notice on the levels screen

  /* ================= boot ================= */

  function boot() {
    if (app._booted) return;
    app._booted = true;
    try {
      collectEls();
      try { finePointer = root.matchMedia('(pointer: fine)').matches; } catch (e) { /* keep default */ }

      var CE = root.ComputeEngine;
      if (!CE || typeof CE.ComputeEngine !== 'function') return fatalNoCe();

      var need = ['curve', 'scoring', 'formula', 'sliders', 'levels', 'engine', 'storage', 'render', 'keyboard'];
      var missing = need.filter(function (n) { return !GF[n]; });
      if (missing.length) {
        return fatal('error', '<p>Some game files didn\u2019t load: ' + missing.map(function (n) {
          return '<code>js/' + n + '.js</code>';
        }).join(', ') + '.</p><p>Make sure the whole project folder is present, then reload.</p>');
      }

      LEVELS = GF.levels.LEVELS || [];
      CHALLENGES = (GF.levels.CHALLENGES || []).filter(function (c) { return c && c.bot; });
      SANDBOX = GF.levels.SANDBOX || makeSandbox();
      if (GF.scoring.RULES) RULES = GF.scoring.RULES;
      if (GF.scoring.CHALLENGE && GF.scoring.CHALLENGE.freeSize > 0) FREE_SIZE = GF.scoring.CHALLENGE.freeSize;
      if (GF.formula.VARIABLES && GF.formula.VARIABLES.length) VARS = GF.formula.VARIABLES.slice();
      state.game = GF.engine.createGame(CE);
      state.store = GF.storage.createStore();
      loadPrefs();
      migrateProgress();

      setupInput();
      fillLengthFactors();
      renderer = GF.render.createRenderer(els.canvas);
      renderer.setOptions({ showCoords: prefs.showCoords });
      els.showCoords.checked = prefs.showCoords;
      wireUi();

      root.addEventListener('hashchange', route);
      route();
      doc.documentElement.setAttribute('data-boot', state.inputKind === 'mathlive' ? 'ok' : 'plain');
    } catch (err) {
      if (root.console) console.error('Graph Fun failed to start', err);
      fatal('error', '<p>Something went wrong while starting:</p><p><code>' +
        escapeHtml(String(err && err.message || err)) + '</code></p><p>Try reloading the page.</p>');
    }
  }

  function collectEls() {
    var ids = ['boot-msg', 'fatal', 'fatal-body', 'screen-levels', 'screen-game', 'level-grid', 'challenge-grid',
      'freeplay-intro', 'progress-summary',
      'reset-progress', 'reset-dialog', 'back-to-levels', 'level-num', 'level-name', 'level-best', 'plot-wrap', 'plot',
      'stats', 'stat-hits', 'stat-length', 'stat-par', 'stat-size', 'stat-score', 'stat-stars', 'stat-bot',
      'stat-hits-wrap', 'stat-length-wrap', 'stat-par-wrap', 'stat-size-wrap', 'stat-score-wrap', 'stat-stars-wrap',
      'stat-bot-wrap', 'formula-bar', 'formula-slot', 'y-eq', 'lock-in', 'status', 'wall-warning', 'vars-tip',
      'vars-panel', 'vars-howto', 'vars-rows', 'level-prompt', 'hints', 'hint-1', 'hint-2',
      'level-family', 'level-blurb', 'hint-wrap', 'hint-btn', 'level-hint', 'whynot', 'level-whynot', 'how',
      'how-challenge', 'bot-wrap', 'bot-score', 'bot-thresholds', 'bot-teaser', 'bot-lock-note', 'bot-btn', 'bot-answer',
      'rules-notice', 'rules-notice-close',
      'show-coords', 'result-dialog', 'result-stars', 'result-title', 'result-score', 'result-best', 'result-formula',
      'result-formula-math', 'result-vars', 'result-facts',
      'split-bar', 'split-legend', 'result-split', 'result-note', 'result-bot-teaser', 'result-bot', 'result-bot-answer',
      'result-levels', 'result-retry', 'result-next'];
    ids.forEach(function (id) { els[camel(id)] = doc.getElementById(id); });
    els.canvas = els.plot;
  }

  function camel(s) { return s.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); }); }

  function makeSandbox() {
    return {
      id: 'sandbox', n: 0, kind: 'sandbox', title: 'Sandbox', family: 'anything goes',
      blurb: 'No dots and no score: type any function of <i>x</i> and see its graph and its length.',
      hint: '', ref: { latex: '', text: '' },
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      targets: [], walls: [], hitRadius: 0.25, whyNot: ''
    };
  }

  function fatalNoCe() {
    var fileMode = root.location.protocol === 'file:';
    fatal('no-ce',
      '<p>The maths engine didn\u2019t load. Its files live in <code>node_modules/</code>, which is missing or was blocked by the browser.</p>' +
      '<ol><li>In the project folder, run <code>npm install</code> (only needed if <code>node_modules/</code> is missing).</li>' +
      '<li>Run <code>npm start</code>, then open <code>http://localhost:8080</code>.</li></ol>' +
      (fileMode ? '<p class="muted small">Some browsers block scripts on pages opened straight from disk; the local server avoids that.</p>' : ''));
  }

  function fatal(kind, html) {
    doc.documentElement.setAttribute('data-boot', kind);
    var body = doc.getElementById('fatal-body');
    var box = doc.getElementById('fatal');
    if (body) body.innerHTML = html;
    if (box) box.hidden = false;
    ['screen-levels', 'screen-game'].forEach(function (id) { var e = doc.getElementById(id); if (e) e.hidden = true; });
  }

  /* ================= scoring-rules migration (PLAN-v3 §B.6, §L.4, §L.5) ================= */

  // Re-score every stored best once when the scoring rules change. Runs before the first screen, behind
  // "Loading…". Lesson stars never drop (storage keeps the max); challenge stars are always recomputed
  // against the (retrained) bots from the re-scored best.
  function migrateProgress() {
    var version = GF.scoring.RULES_VERSION;
    var store = state.store;
    if (!(version > 0) || !store || typeof store.migrate !== 'function') return;
    try {
      var before = typeof store.rulesVersion === 'function' ? store.rulesVersion() : version;
      var hadChallengeBests = before < version && CHALLENGES.some(function (c) {
        var r = safeGet(c.id);
        return r.bestScore > 0 || !!r.bestFormula;
      });
      store.migrate(version, rescoreEntry);
      if (hadChallengeBests && (prefs.rulesNoticeSeen || 0) < version) rulesNotice = true;
    } catch (e) {
      if (root.console) console.warn('Graph Fun: could not re-score saved progress', e);
    }
  }

  // {score, stars} under the current rules, or null to keep the entry unchanged (engine.rescore has the guards:
  // sandbox and unknown ids, formulas that no longer evaluate, timed-out curves, lost slider values).
  function rescoreEntry(id, e) {
    var level = GF.levels.getLevel(id) || getChallenge(id);
    return level ? state.game.rescore(level, e, { timeBudgetMs: 300 }) : null;
  }

  // {a: {value, offset, step}, …} (stored) → {a: 1.3, …}
  function varValues(saved) { return GF.engine.varValues(saved); }

  // The how-to copy quotes the length factor (×0.92 at 1.5×…): take the numbers from the rules themselves.
  function fillLengthFactors() {
    if (typeof GF.scoring.lengthFactor !== 'function') return;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-g]'), function (el) {
      var g = GF.scoring.lengthFactor(Number(el.getAttribute('data-g')));
      if (isFinite(g)) el.textContent = '\u00d7' + fmtFactor(g);
    });
  }

  /* ================= input adapters ================= */

  function isLineBreak(e) { return (e.inputType || e.data) === 'insertLineBreak'; }

  function setupInput() {
    if (root.MathfieldElement && !FLAGS.plain) {
      try { input = createMathliveInput(); } catch (e) {
        if (root.console) console.warn('Graph Fun: MathLive setup failed, using plain input', e);
        input = null;
        els.formulaSlot.textContent = '';
      }
    }
    if (!input) input = createPlainInput();
    state.inputKind = input.kind;
    input.onInput(scheduleEvaluate);
    input.onEnter(lockIn);
  }

  function createMathliveInput() {
    var MFE = root.MathfieldElement;
    // Must happen before the first field/span is created (see PLAN §1).
    MFE.fontsDirectory = new URL('node_modules/mathlive/fonts/', doc.baseURI).href;
    MFE.soundsDirectory = null;
    MFE.keypressSound = null;
    MFE.plonkSound = null;
    MFE.computeEngine = state.game.ce;

    var vk = root.mathVirtualKeyboard;
    if (vk) GF.keyboard.install(vk);

    var mf = new MFE();
    mf.id = 'formula';
    mf.setAttribute('math-virtual-keyboard-policy', 'auto');
    var narrow = false;
    try { narrow = root.matchMedia('(max-width: 480px)').matches; } catch (e) { /* keep the long one */ }
    mf.setAttribute('placeholder', narrow ? '\\text{function of }x' : '\\text{type a function of }x');
    mf.setAttribute('aria-label', 'Your function: y equals');
    mf.smartFence = true;
    els.formulaSlot.appendChild(mf);
    mf.addEventListener('mount', function () {
      mf.smartFence = true;
      mf.mathVirtualKeyboardPolicy = 'auto';
      // MathLive's default shortcut turns a typed `log` into \log_{#?} with the caret in the base,
      // so typing log_2 x gave \log_{_2x}. Plain \log lets `_` start the base as usual.
      // `sgn` becomes \operatorname{sgn} (MathLive has no shortcut for it, so it stayed s·g·n).
      // `dx` would turn into \differentialD x, but d is a slider variable here (2dx was a syntax error).
      try {
        var shortcuts = Object.assign({}, mf.inlineShortcuts, { log: '\\log', sgn: '\\operatorname{sgn}' });
        delete shortcuts.dx;
        mf.inlineShortcuts = shortcuts;
      } catch (e) { /* keep defaults */ }
    }, { once: true });

    if (vk) {
      vk.addEventListener('geometrychange', onKeyboardGeometry);
      vk.addEventListener('virtual-keyboard-toggle', onKeyboardGeometry);
    }

    return {
      kind: 'mathlive',
      el: mf,
      getValue: function () { return mf.value || ''; },
      setValue: function (v) { mf.value = v || ''; },
      focus: function () { try { mf.focus(); } catch (e) { /* ignore */ } },
      blur: function () { try { mf.blur(); } catch (e) { /* ignore */ } },
      onInput: function (cb) {
        mf.addEventListener('input', function (e) { if (!isLineBreak(e)) cb(); });
      },
      onEnter: function (cb) {
        mf.addEventListener('beforeinput', function (e) {
          if (isLineBreak(e)) { e.preventDefault(); cb(); }
        });
      },
      hideKeyboard: function () {
        try { if (vk && vk.visible) vk.hide(); } catch (e) { /* ignore */ }
      }
    };
  }

  function createPlainInput() {
    var inp = doc.createElement('input');
    inp.id = 'formula-plain';
    inp.type = 'text';
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('spellcheck', 'false');
    inp.setAttribute('enterkeyhint', 'done');
    inp.setAttribute('placeholder', 'e.g. 2sin(3x)+1');
    inp.setAttribute('aria-label', 'Your function: y equals');
    els.formulaSlot.appendChild(inp);

    var tip = doc.createElement('p');
    tip.className = 'plain-tip';
    tip.textContent = 'Plain-text mode: write (1/2)x or x/2, sin(x), sqrt(x), abs(x), sgn(x), x^2, e^x, pi. ' +
      'a, b, c and d get sliders: a*sin(b*x) (asin is arcsin).';
    els.formulaBar.insertAdjacentElement('afterend', tip);

    return {
      kind: 'plain',
      el: inp,
      getValue: function () { return inp.value; },
      setValue: function (v) { inp.value = v || ''; },
      focus: function () { inp.focus(); },
      blur: function () { inp.blur(); },
      onInput: function (cb) { inp.addEventListener('input', cb); },
      onEnter: function (cb) {
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); cb(); }
        });
      },
      hideKeyboard: function () { /* the OS keyboard hides on blur */ }
    };
  }

  /* ================= virtual keyboard geometry ================= */

  // While a slider is being dragged the layout must not move under the finger: the range took focus, so
  // MathLive hides its keyboard ~300 ms later. Keep the old geometry until the pointer is released.
  function onKeyboardGeometry() {
    if (sliderDrag) { pendingGeometry = true; return; }
    var vk = root.mathVirtualKeyboard;
    var h = 0;
    try { h = vk && vk.visible ? Math.round(vk.boundingRect.height) : 0; } catch (e) { h = 0; }
    doc.documentElement.style.setProperty('--kb-h', h + 'px');
    doc.documentElement.classList.toggle('kb-open', h > 0);
    if (!h) updateVarsTip();
    if (h > 0 && state.screen === 'game') {
      // wait for the plot to shrink (layout uses --kb-h), then make sure the field is visible
      root.requestAnimationFrame(function () { root.requestAnimationFrame(keepFormulaVisible); });
    }
  }

  function keepFormulaVisible() {
    if (sliderDrag) return;
    var vk = root.mathVirtualKeyboard;
    var h = 0;
    try { h = vk && vk.visible ? vk.boundingRect.height : 0; } catch (e) { /* ignore */ }
    if (!h) return;
    var limit = root.innerHeight - h - 8;
    var bottom = (els.varsTip.hidden ? els.status : els.varsTip).getBoundingClientRect().bottom;
    var plotTop = els.plotWrap.getBoundingClientRect().top;
    if (bottom > limit) {
      // scroll down just enough, but never past the top of the plot
      var delta = Math.min(bottom - limit, plotTop - 8);
      if (delta > 0) root.scrollBy({ top: delta, behavior: 'smooth' });
    } else if (plotTop < 0) {
      root.scrollBy({ top: Math.max(plotTop - 8, -(limit - bottom)), behavior: 'smooth' });
    }
  }

  /* ================= wiring ================= */

  function wireUi() {
    els.screenLevels.addEventListener('click', function (e) {
      var card = e.target.closest('.level-card');
      if (!card || card.disabled) return;
      var id = card.getAttribute('data-level-id');
      go(id === SANDBOX.id ? 'sandbox' : 'play/' + encodeURIComponent(id));
    });

    els.backToLevels.addEventListener('click', function () { go('levels'); });

    els.lockIn.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // keep the field focused
    els.lockIn.addEventListener('click', lockIn);
    els.yEq.addEventListener('click', function (e) { e.preventDefault(); focusInput(); });

    els.hintBtn.addEventListener('click', onHintClick);

    els.rulesNoticeClose.addEventListener('click', function () {
      rulesNotice = false;
      els.rulesNotice.hidden = true;
      var first = els.levelGrid.querySelector('.level-card:not(:disabled)');
      if (first) first.focus();
    });

    // Slider panel: freeze the keyboard geometry while a pointer is down in it (see onKeyboardGeometry).
    els.varsPanel.addEventListener('pointerdown', function () { sliderDrag = true; });
    var endDrag = function () {
      if (!sliderDrag) return;
      sliderDrag = false;
      if (pendingGeometry) { pendingGeometry = false; onKeyboardGeometry(); }
      updateVarsTip();
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    els.botBtn.addEventListener('click', function () {
      setBotAnswerOpen(els.botAnswer.hidden);
    });

    els.showCoords.addEventListener('change', function () {
      prefs.showCoords = els.showCoords.checked;
      savePrefs();
      renderer.setOptions({ showCoords: prefs.showCoords });
    });

    els.resetProgress.addEventListener('click', function () {
      var dlg = els.resetDialog;
      dlg.returnValue = '';
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else if (root.confirm('Reset all progress?')) doReset();
    });
    els.resetDialog.addEventListener('close', function () {
      if (els.resetDialog.returnValue === 'reset') doReset();
    });

    els.resultRetry.addEventListener('click', function (e) {
      if (freshKeyClick(e)) return;
      closeResult();
      if (finePointer) focusInput();
    });
    // Esc closes the result dialog: go back to editing, like Retry.
    els.resultDialog.addEventListener('cancel', function () {
      if (finePointer) root.setTimeout(function () { if (state.screen === 'game') focusInput(); }, 0);
    });
    els.resultLevels.addEventListener('click', function (e) { if (freshKeyClick(e)) return; closeResult(); go('levels'); });
    els.resultNext.addEventListener('click', function (e) {
      if (freshKeyClick(e)) return;
      var next = els.resultNext.getAttribute('data-next');
      closeResult();
      if (next) go('play/' + encodeURIComponent(next));
    });

    root.addEventListener('pagehide', flushSave);
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') flushSave(); });
  }

  function doReset() {
    state.store.reset();
    thumbCache = {};
    thumbQueue = [];
    renderLevelGrid();
  }

  function go(hash) {
    if (root.location.hash === '#' + hash) route();
    else root.location.hash = hash;
  }

  function replaceHash(hash) {
    try {
      root.history.replaceState(null, '', root.location.pathname + root.location.search + '#' + hash);
    } catch (e) {
      root.location.replace('#' + hash);
    }
  }

  /* ================= routing ================= */

  function levelIndex(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
    return -1;
  }

  function challengeIndex(id) {
    for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === id) return i;
    return -1;
  }

  function getChallenge(id) {
    var ch = null;
    try { ch = GF.levels.getChallenge ? GF.levels.getChallenge(id) : null; } catch (e) { ch = null; }
    return ch && ch.bot ? ch : null;
  }

  function isUnlocked(i) {
    try { return !!state.store.isUnlocked(i, LEVELS, { unlockAll: FLAGS.unlockAll }); } catch (e) { return i === 0; }
  }

  function route() {
    closeDialogs();
    var h = (root.location.hash || '').replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* malformed %-escape: treat as unknown */ }
    if (h.indexOf('play/') === 0) {
      var ch = getChallenge(h.slice(5));
      if (ch) return showGame(ch); // challenges are always open
      var idx = levelIndex(h.slice(5));
      if (idx >= 0 && isUnlocked(idx)) return showGame(LEVELS[idx]);
      replaceHash('levels');
      return showLevels();
    }
    if (h === 'sandbox') return showGame(SANDBOX);
    if (h !== '' && h !== 'levels') replaceHash('levels');
    showLevels();
  }

  function closeDialogs() {
    [els.resultDialog, els.resetDialog].forEach(function (d) { if (d && d.open) d.close(); });
  }

  function setScreen(name) {
    state.screen = name;
    els.screenLevels.hidden = name !== 'levels';
    els.screenGame.hidden = name !== 'game';
  }

  function leaveGame() {
    if (!state.level) return;
    commitActiveVarField(); // a step or offset typed without Enter (e.g. the browser's Back button)
    if (evalTimer || sliderRaf) evaluateNow();
    flushSave();
    input.hideKeyboard();
    input.blur();
    lastLevelId = state.level.id;
    state.level = null;
    state.evaluation = null;
    lastGood = null;
    resetVarPanel();
  }

  /* ================= level select ================= */

  function showLevels() {
    var cameFrom = state.level ? state.level.id : lastLevelId;
    leaveGame();
    setScreen('levels');
    doc.title = 'Graph Fun';
    renderLevelGrid();
    showRulesNotice();
    root.scrollTo(0, 0);
    if (cameFrom) {
      var card = els.screenLevels.querySelector('.level-card[data-level-id="' + cssEscape(cameFrom) + '"]');
      if (card && !card.disabled) {
        try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
        if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function renderLevelGrid() {
    var grid = els.levelGrid;
    grid.textContent = '';
    var totalStars = 0, cleared = 0;
    var frag = doc.createDocumentFragment();

    LEVELS.forEach(function (lv, i) {
      var rec = safeGet(lv.id);
      var unlocked = isUnlocked(i);
      var stars = rec.stars || 0;
      totalStars += stars;
      if (stars > 0) cleared++;
      var played = (rec.bestScore > 0) || !!rec.bestFormula;

      var btn = h('button', { type: 'button', 'class': 'level-card', 'data-level-id': lv.id });
      if (!unlocked) { btn.disabled = true; btn.setAttribute('data-locked', ''); }

      var thumb = h('span', { 'class': 'thumb' });
      thumb.appendChild(thumbSvg(lv, rec));
      if (!unlocked) thumb.appendChild(iconWrap('lock', 'i-lock'));
      btn.appendChild(thumb);

      var head = h('span', { 'class': 'card-head' }, [
        h('span', { 'class': 'card-n' }, String(lv.n)),
        h('span', { 'class': 'card-title' }, lv.title)
      ]);
      btn.appendChild(head);
      // the family is Hint 1, so it stays hidden until the level has a star
      btn.appendChild(stars > 0 ? h('span', { 'class': 'chip card-family' }, lv.family || '')
        : h('span', { 'class': 'chip card-family unknown' }, [h('i', null, 'y'), ' = ?']));
      var foot = h('span', { 'class': 'card-foot' });
      foot.appendChild(starsEl(stars));
      foot.appendChild(h('span', { 'class': 'card-best' }, unlocked ? (played ? 'best ' + rec.bestScore : 'new') : 'locked'));
      btn.appendChild(foot);

      btn.setAttribute('aria-label', 'Level ' + lv.n + ': ' + lv.title + '. ' +
        (unlocked ? (stars + ' of 3 stars' + (played ? ', best ' + rec.bestScore : ', not played yet')) :
          'Locked: get a star on level ' + (lv.n - 1) + ' first') + '.');
      frag.appendChild(btn);

      if (stars > 0 && rec.bestFormula) queueThumbCurve(lv, rec.bestFormula, varValues(rec.bestVars));
    });
    grid.appendChild(frag);

    var ch = renderFreePlay();

    var ps = els.progressSummary;
    ps.textContent = '';
    var c1 = h('span', { 'class': 'chip' });
    c1.appendChild(h('span', { 'class': 'star on', 'aria-hidden': 'true' }, STAR_ON));
    c1.appendChild(doc.createTextNode(' ' + totalStars + ' / ' + LEVELS.length * 3 + ' stars'));
    ps.appendChild(c1);
    ps.appendChild(h('span', { 'class': 'chip' }, cleared + ' / ' + LEVELS.length + ' levels cleared'));
    if (CHALLENGES.length) {
      var c3 = h('span', { 'class': 'chip chip-challenges',
        'aria-label': 'Challenges: ' + ch.stars + ' of ' + CHALLENGES.length * 3 + ' stars, bot beaten on ' +
          ch.beaten + ' of ' + CHALLENGES.length });
      c3.appendChild(doc.createTextNode('Challenges '));
      c3.appendChild(h('span', { 'class': 'star on', 'aria-hidden': 'true' }, STAR_ON));
      c3.appendChild(doc.createTextNode(' ' + ch.stars + '/' + CHALLENGES.length * 3 + ' \u00b7 bot beaten ' +
        ch.beaten + '/' + CHALLENGES.length));
      ps.appendChild(c3);
    }
    if (FLAGS.unlockAll) ps.appendChild(h('span', { 'class': 'chip' }, 'all levels unlocked'));

    pumpThumbs();
  }

  // Free play section: the sandbox card, then one card per challenge. Returns the challenge totals.
  function renderFreePlay() {
    var grid = els.challengeGrid;
    grid.textContent = '';
    var frag = doc.createDocumentFragment();
    var totals = { stars: 0, beaten: 0 };

    var sb = h('button', { type: 'button', 'class': 'level-card sandbox', 'data-level-id': SANDBOX.id,
      'aria-label': SANDBOX_TITLE + ': draw any function, no dots and no score.' });
    var sbThumb = h('span', { 'class': 'thumb' });
    sbThumb.appendChild(svgIcon('i-squiggle'));
    sb.appendChild(sbThumb);
    sb.appendChild(h('span', { 'class': 'card-head' }, [h('span', { 'class': 'card-title' }, SANDBOX_TITLE)]));
    sb.appendChild(h('span', { 'class': 'chip card-family' }, 'no dots, no score'));
    sb.appendChild(h('span', { 'class': 'card-foot' }, [h('span', { 'class': 'card-best' }, 'try anything')]));
    frag.appendChild(sb);

    CHALLENGES.forEach(function (lv) {
      var rec = safeGet(lv.id);
      var bot = lv.bot.score;
      var best = rec.bestScore || 0;
      var stars = challengeStars(best, lv);
      var played = best > 0 || !!rec.bestFormula;
      totals.stars += stars;
      var beaten = beatsBot(best, bot);
      if (beaten) totals.beaten++;

      var btn = h('button', { type: 'button', 'class': 'level-card challenge', 'data-level-id': lv.id });
      if (beaten) btn.setAttribute('data-beaten', '');
      var thumb = h('span', { 'class': 'thumb' });
      thumb.appendChild(thumbSvg(lv, rec));
      btn.appendChild(thumb);
      btn.appendChild(h('span', { 'class': 'card-head' }, [
        h('span', { 'class': 'card-n' }, challengeTag(lv)),
        h('span', { 'class': 'card-title' }, lv.title)
      ]));
      btn.appendChild(h('span', { 'class': 'chip card-family' }, lv.family || (lv.targets.length + ' dots')));
      var foot = h('span', { 'class': 'card-foot' });
      foot.appendChild(starsEl(stars));
      var bestTxt = h('span', { 'class': 'card-best' });
      if (played) {
        bestTxt.appendChild(h('b', { 'class': beaten || matchesBot(best, bot) ? 'beat' : null }, String(best)));
        bestTxt.appendChild(doc.createTextNode(' / bot ' + bot));
      } else bestTxt.textContent = 'bot ' + bot;
      foot.appendChild(bestTxt);
      btn.appendChild(foot);

      btn.setAttribute('aria-label', 'Challenge ' + challengeTag(lv) + ': ' + lv.title + '. ' + (lv.family || '') + '. ' +
        (played ? stars + ' of 3 stars, best ' + best : 'Not played yet') + '. The bot scored ' + bot + '.');
      frag.appendChild(btn);

      if (best > 0 && rec.bestFormula) queueThumbCurve(lv, rec.bestFormula, varValues(rec.bestVars));
    });

    grid.appendChild(frag);
    els.freeplayIntro.hidden = !CHALLENGES.length;
    if (CHALLENGES.length) {
      els.freeplayIntro.textContent = CHALLENGES.length + ' random-dot challenges with no single right answer. ' +
        'Hit as many dots as you can with a short formula and a short line, and try to beat the bot.';
    }
    return totals;
  }

  // Shown on the levels screen in the session whose boot re-scored challenge bests (PLAN-v3 §L.4), until dismissed.
  function showRulesNotice() {
    els.rulesNotice.hidden = !rulesNotice;
    if (rulesNotice && (prefs.rulesNoticeSeen || 0) < GF.scoring.RULES_VERSION) {
      prefs.rulesNoticeSeen = GF.scoring.RULES_VERSION;
      savePrefs();
    }
  }

  function iconWrap(cls, symbol) {
    var s = h('span', { 'class': cls, 'aria-hidden': 'true' });
    s.appendChild(svgIcon(symbol));
    return s;
  }

  function svgIcon(symbol) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    var use = doc.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + symbol);
    svg.appendChild(use);
    return svg;
  }

  /* ---- level thumbnails (dots, walls; your best curve once cleared) ---- */

  // `rec` is the level's progress. A starred best attempt hits every dot by definition (stars,
  // bestScore and bestFormula come from the same attempt), so cleared levels show all dots green.
  // A challenge's best attempt may miss dots: it shows once it scores, with the hits the thumbnail
  // evaluation found (dots stay amber until that has run).
  function thumbSvg(level, rec) {
    var challenge = isChallenge(level);
    var cleared = challenge ? (rec.bestScore || 0) > 0 : (rec.stars || 0) > 0;
    var NS = 'http://www.w3.org/2000/svg';
    var vp = level.viewport;
    var W = vp.xMax - vp.xMin, H = vp.yMax - vp.yMin;
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', vp.xMin + ' ' + (-vp.yMax) + ' ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    var step = W > 20 ? 4 : 2;
    var d = '';
    var k, v;
    for (k = Math.ceil(vp.xMin / step); (v = k * step) <= vp.xMax; k++) if (v) d += 'M' + v + ' ' + (-vp.yMax) + 'V' + (-vp.yMin);
    for (k = Math.ceil(vp.yMin / step); (v = k * step) <= vp.yMax; k++) if (v) d += 'M' + vp.xMin + ' ' + (-v) + 'H' + vp.xMax;
    svg.appendChild(svgEl('path', { d: d, 'class': 't-grid' }));
    var ax = '';
    if (vp.xMin <= 0 && vp.xMax >= 0) ax += 'M0 ' + (-vp.yMax) + 'V' + (-vp.yMin);
    if (vp.yMin <= 0 && vp.yMax >= 0) ax += 'M' + vp.xMin + ' 0H' + vp.xMax;
    if (ax) svg.appendChild(svgEl('path', { d: ax, 'class': 't-axis' }));
    (level.walls || []).forEach(function (c) {
      svg.appendChild(svgEl('path', { d: 'M' + c + ' ' + (-vp.yMax) + 'V' + (-vp.yMin), 'class': 't-wall',
        'stroke-dasharray': (W / 45) + ' ' + (W / 60) }));
    });
    var cached = thumbCache[level.id];
    var fresh = cleared && cached && cached.key === thumbKey(rec.bestFormula, varValues(rec.bestVars));
    if (fresh && cached.d) {
      svg.appendChild(svgEl('path', { d: cached.d, 'class': 't-curve' }));
    }
    var r = W / 44;
    (level.targets || []).forEach(function (t, i) {
      var hit = challenge ? !!(fresh && cached.hits && cached.hits[i]) : cleared;
      svg.appendChild(svgEl('circle', { cx: t[0], cy: -t[1], r: r, 'class': 't-dot' + (hit ? ' hit' : '') }));
    });
    return svg;
  }

  function svgEl(name, attrs) {
    var e = doc.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // A best attempt is its formula plus the slider values it was locked in with.
  function thumbKey(formula, values) { return formula + '|' + JSON.stringify(values || {}); }

  function queueThumbCurve(level, formula, values) {
    var key = thumbKey(formula, values);
    var c = thumbCache[level.id];
    if (c && c.key === key) return;
    var queued = thumbQueue.some(function (j) { return j.level.id === level.id && j.key === key; });
    if (!queued) thumbQueue.push({ level: level, formula: formula, values: values || {}, key: key });
  }

  function pumpThumbs() {
    if (thumbTimer || !thumbQueue.length) return;
    var idle = root.requestIdleCallback || function (cb) { return root.setTimeout(cb, 30); };
    thumbTimer = idle(function () {
      thumbTimer = null;
      var job = thumbQueue.shift();
      if (!job) return;
      try {
        var ev = state.game.evaluate(job.level, job.formula, { timeBudgetMs: 120 }, job.values);
        thumbCache[job.level.id] = { key: job.key, d: ev && ev.curve ? pathsToD(ev.curve.paths, job.level.viewport) : '',
          hits: ev && ev.result && ev.result.hits ? ev.result.hits.slice() : null };
        if (state.screen === 'levels') {
          var card = els.screenLevels.querySelector('.level-card[data-level-id="' + cssEscape(job.level.id) + '"] .thumb svg');
          if (card) card.parentNode.replaceChild(thumbSvg(job.level, safeGet(job.level.id)), card);
        }
      } catch (e) { thumbCache[job.level.id] = { key: job.key, d: '' }; }
      pumpThumbs();
    });
  }

  // Thin the polyline to ~1/200 of the width per step; y is flipped for SVG.
  function pathsToD(paths, vp) {
    var tol = (vp.xMax - vp.xMin) / 200;
    var out = '';
    (paths || []).forEach(function (p) {
      if (!p.length) return;
      var lx = p[0][0], ly = p[0][1];
      out += 'M' + r3(lx) + ' ' + r3(-ly);
      for (var i = 1; i < p.length; i++) {
        var x = p[i][0], y = p[i][1];
        if (i < p.length - 1 && Math.abs(x - lx) < tol && Math.abs(y - ly) < tol) continue;
        out += 'L' + r3(x) + ' ' + r3(-y);
        lx = x; ly = y;
      }
    });
    return out;
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  /* ================= game screen ================= */

  function isSandbox(level) { return !!level && (!level.targets || level.targets.length === 0); }
  function isChallenge(level) { return !!level && level.kind === 'challenge' && !!level.bot; }

  /* ---- challenge helpers (stars are always recomputed from the best score; PLAN-challenges §11.D) ---- */

  function challengeTag(level) { return 'C' + level.n; }

  function challengeStars(score, level) {
    try { return GF.scoring.challengeStars(score || 0, level.bot.score) || 0; } catch (e) { return 0; }
  }

  function thresholds(level) {
    return GF.scoring.challengeThresholds(level.bot.score);
  }

  // Every comparison with the bot goes through these (PLAN-v3 §L.7), so chips, cards, headlines and notes agree
  // with the scoring rules.
  function beatsBot(score, bot) {
    try { if (typeof GF.scoring.beatsBot === 'function') return !!GF.scoring.beatsBot(score, bot); } catch (e) { /* below */ }
    return bot > 0 && score > bot;
  }
  function matchesBot(score, bot) {
    try { if (typeof GF.scoring.matchesBot === 'function') return !!GF.scoring.matchesBot(score, bot); } catch (e) { /* below */ }
    return bot > 0 && score === bot && !beatsBot(score, bot);
  }

  // The bot's formula stays hidden until your best reaches the ★★ threshold.
  function botRevealed(level, rec) {
    return (rec.bestScore || 0) >= thresholds(level).two;
  }

  function botTeaser(level) {
    var b = level.bot;
    return 'Bot: ' + (b.family ? b.family + ' · ' : '') + b.hits + '/' + level.targets.length + ' dots · size ' + b.size;
  }

  function botMeta(level) {
    var b = level.bot;
    return (b.family ? b.family + ' · ' : '') + b.hits + '/' + level.targets.length + ' dots · size ' + b.size +
      ' · length ' + fmtLen(b.length);
  }

  // Top-level terms of a LaTeX sum (formula.js's bracket-aware splitter, PLAN-v3 §L.6).
  function latexTerms(latex) {
    try { if (typeof GF.formula.latexTerms === 'function') return GF.formula.latexTerms(latex); } catch (e) { /* below */ }
    return [String(latex == null ? '' : latex)];
  }

  // A formula typeset by MathLive when it's loaded (raw LaTeX in <code> otherwise). It can be wider than a
  // phone, so each term is its own math-span and the line wraps between terms. A term's sign gets the space
  // after it that a + between terms would have (the space before it is the CSS column gap).
  function formulaEl(latex) {
    if (root.customElements && root.customElements.get('math-span')) {
      var math = h('span', { 'class': 'bot-formula' });
      latexTerms(latex).forEach(function (t, i) {
        t = t.trim();
        var m = h('math-span');
        m.textContent = i && (t.charAt(0) === '+' || t.charAt(0) === '-') ? t.charAt(0) + '\\:' + t.slice(1) : t;
        math.appendChild(m);
      });
      return math;
    }
    return h('code', { 'class': 'bot-formula' }, latex);
  }

  function formulaLineEl(latex) {
    var line = h('p', { 'class': 'bot-formula-line' });
    line.appendChild(h('span', { 'class': 'bot-y' }, 'y ='));
    line.appendChild(formulaEl(latex));
    return line;
  }

  // The bot's formula (it never uses slider variables).
  function botAnswerEl(level) {
    var wrap = h('div', { 'class': 'bot-answer-inner' });
    wrap.appendChild(formulaLineEl(level.bot.latex || ''));
    wrap.appendChild(h('p', { 'class': 'bot-meta' }, botMeta(level) + ' · score ' + level.bot.score));
    return wrap;
  }

  function thresholdsEl(level, best) {
    var t = thresholds(level);
    var frag = doc.createDocumentFragment();
    [[1, t.one], [2, t.two], [3, t.three]].forEach(function (p, i) {
      if (i) frag.appendChild(h('span', { 'class': 'sep', 'aria-hidden': 'true' }, ' · '));
      var item = h('span', { 'class': 'thr' + (best >= p[1] ? ' reached' : '') });
      item.appendChild(h('span', { 'class': 'star on', 'aria-hidden': 'true' }, stars(p[0])));
      item.appendChild(doc.createTextNode(' ' + p[1]));
      item.setAttribute('aria-label', p[0] + (p[0] === 1 ? ' star' : ' stars') + ' at ' + p[1] + (best >= p[1] ? ', reached' : ''));
      frag.appendChild(item);
    });
    return frag;
  }

  function renderBotPanel(level) {
    var on = isChallenge(level);
    els.botWrap.hidden = !on;
    if (!on) return;
    var rec = safeGet(level.id);
    var best = rec.bestScore || 0;
    var t = thresholds(level);
    els.botScore.textContent = String(level.bot.score);
    els.botThresholds.textContent = '';
    els.botThresholds.appendChild(thresholdsEl(level, best));
    var revealed = botRevealed(level, rec);
    els.botTeaser.textContent = botTeaser(level);
    els.botTeaser.hidden = revealed;
    els.botLockNote.textContent = 'Score ' + t.two + ' (' + stars(2) + ') to unlock the bot’s formula.';
    els.botLockNote.hidden = revealed;
    els.botBtn.hidden = !revealed;
    els.botAnswer.textContent = '';
    if (revealed) els.botAnswer.appendChild(botAnswerEl(level));
    setBotAnswerOpen(revealed && (beatsBot(best, level.bot.score) || matchesBot(best, level.bot.score)));
  }

  function setBotAnswerOpen(open) {
    var level = state.level;
    open = !!open && isChallenge(level) && botRevealed(level, safeGet(level.id));
    els.botAnswer.hidden = !open;
    els.botBtn.setAttribute('aria-expanded', String(open));
    els.botBtn.querySelector('span').textContent = open ? 'Hide the bot’s answer' : 'Show the bot’s answer (spoiler)';
  }

  function anyChallengePlayed() {
    return CHALLENGES.some(function (c) { var r = safeGet(c.id); return r.bestScore > 0 || !!r.bestFormula; });
  }

  function showGame(level) {
    if (state.level) leaveGame(); // flushes the pending lastFormula save first
    setScreen('game');
    root.scrollTo(0, 0);
    var sandbox = isSandbox(level);
    var challenge = isChallenge(level);
    state.level = level;
    state.evaluation = null;
    lastGood = null;

    var title = sandbox ? SANDBOX_TITLE : (level.title || 'Level');
    doc.title = (challenge ? challengeTag(level) + ' · ' : '') + title + ' · Graph Fun';
    els.levelNum.textContent = sandbox ? '' : challenge ? challengeTag(level) : level.n + '/' + LEVELS.length;
    els.levelName.textContent = title;
    updateTopbarBest();

    var rec = safeGet(level.id);
    els.levelFamily.textContent = level.family || '';
    els.levelFamily.hidden = !level.family;
    els.levelBlurb.innerHTML = blurbFor(level);
    els.levelHint.innerHTML = challenge ? '' : level.hint || '';
    var lesson = !sandbox && !challenge;
    els.levelPrompt.textContent = lesson ? level.prompt || promptFallback(level) : '';
    els.levelPrompt.hidden = !lesson;
    // Lessons open with the prompt only; once cleared, Hint 1 (the family) is the lesson's explanation.
    hintsShown = lesson ? Math.max(rec.hints || 0, (rec.stars || 0) > 0 ? 1 : 0) : 0;
    renderHints(level);
    els.levelWhynot.textContent = challenge ? '' : level.whyNot || '';
    els.whynot.hidden = challenge || !(level.whyNot && (rec.stars || 0) > 0);
    els.whynot.open = false;
    els.how.hidden = sandbox || challenge;
    els.how.open = !sandbox && !challenge && totalStars() === 0;
    els.howChallenge.hidden = !challenge;
    els.howChallenge.open = challenge && !anyChallengePlayed();
    renderBotPanel(level);

    // Lessons: Dots Length Par Score Stars. Challenges: Dots Length Size Score Bot. Sandbox: Length Size.
    els.stats.classList.toggle('sandbox', sandbox);
    els.stats.classList.toggle('challenge', challenge);
    els.statHitsWrap.hidden = sandbox;
    els.statParWrap.hidden = sandbox || challenge;
    els.statStarsWrap.hidden = sandbox || challenge;
    els.statScoreWrap.hidden = sandbox;
    els.statSizeWrap.hidden = !(sandbox || challenge);
    els.statBotWrap.hidden = !challenge;
    els.statBot.textContent = challenge ? String(level.bot.score) : '—';
    els.statLengthWrap.title = challenge ? 'Length of your line · dot-to-dot ' + fmtLen(parOf(level))
      : 'Length of your line in grid units';
    els.statSizeWrap.title = challenge ? 'Formula size · first ' + FREE_SIZE + ' are free'
      : 'Formula size: each number, x, operator and function counts 1';
    els.statScoreWrap.title = 'Score if you lock in now';
    els.lockIn.hidden = sandbox;

    initSliders(rec);

    renderer.setLevel(level);
    input.setValue(rec.lastFormula || '');
    evaluateNow();

    if (finePointer) root.setTimeout(function () { if (state.level === level) focusInput(); }, 0);
  }

  /* ---- hints (PLAN-v3 §A) ---- */

  // Only if levels.js has no prompt for this lesson (it always should).
  function promptFallback(level) {
    var n = (level.targets || []).length, w = (level.walls || []).length;
    return 'Find a function whose graph goes through all ' + n + ' dots.' +
      (w ? ' It can’t cross the red wall' + (w > 1 ? 's' : '') + ' inside the view, so it has to jump.' : '');
  }

  function hintCount(level) { return level && level.hint ? 2 : 1; }

  // Lessons: Hint 1 (family + blurb) and Hint 2 (the hint) open one at a time and stay open (stored per level).
  // The sandbox: the family and blurb are always shown and one button toggles the hint. Challenges: no hints.
  function renderHints(level) {
    var sandbox = isSandbox(level), challenge = isChallenge(level), lesson = !sandbox && !challenge;
    var max = hintCount(level);
    els.hints.classList.toggle('lesson', lesson);
    var one = !lesson || hintsShown >= 1;
    var two = !challenge && !!level.hint && (lesson ? hintsShown >= 2 : hintsShown > 0);
    els.hint1.hidden = !one;
    els.hint2.hidden = !two;
    els.hints.classList.toggle('is-empty', !one && !two);
    var btnLabel = els.hintBtn.querySelector('span');
    if (lesson) {
      els.hintBtn.removeAttribute('aria-expanded');
      els.hintWrap.hidden = hintsShown >= max;
      btnLabel.textContent = max > 1 ? 'Show hint ' + (hintsShown + 1) + ' of ' + max : 'Show hint';
    } else {
      els.hintWrap.hidden = challenge || !level.hint;
      els.hintBtn.setAttribute('aria-expanded', String(two));
      btnLabel.textContent = two ? 'Hide hint' : 'Show hint';
    }
  }

  function onHintClick() {
    var level = state.level;
    if (!level || isChallenge(level)) return;
    if (isSandbox(level)) {
      hintsShown = hintsShown ? 0 : 1;
      renderHints(level);
      return;
    }
    var n = Math.min(hintCount(level), hintsShown + 1);
    var stored = null;
    try { stored = state.store.revealHint ? state.store.revealHint(level.id, n) : null; } catch (e) { stored = null; }
    hintsShown = Math.max(n, stored || 0);
    renderHints(level);
    // the button is gone once every hint is open: move focus to the last one instead of losing it
    if (els.hintWrap.hidden) (hintsShown >= 2 ? els.hint2 : els.hint1).focus();
  }

  // Wall challenges point at the keyboard's sgn key; the plain text box has no keys.
  function blurbFor(level) {
    var b = level.blurb || '';
    return state.inputKind === 'plain' ? b.replace('try sgn (long-press the |x| key)', 'try typing sgn(x)') : b;
  }

  // MathLive drops a focus() if the page's active element changes before its own timer runs, which
  // happens when the clicked level card or dialog button is hidden. Blur that element first.
  function focusInput() {
    var a = doc.activeElement;
    if (a && a !== input.el && a !== doc.body && typeof a.blur === 'function') a.blur();
    input.focus();
  }

  function updateTopbarBest() {
    var level = state.level;
    var lb = els.levelBest;
    lb.textContent = '';
    lb.removeAttribute('title');
    if (!level || isSandbox(level)) return;
    var rec = safeGet(level.id);
    var played = !!rec.bestFormula || rec.bestScore > 0;
    if (isChallenge(level)) {
      var n = challengeStars(rec.bestScore, level);
      if (played) lb.appendChild(h('span', { 'class': 'best-score', 'aria-hidden': 'true' }, String(rec.bestScore || 0)));
      var cs = starsEl(n);
      cs.setAttribute('aria-label', played ? 'Your best: ' + (rec.bestScore || 0) + ' points, ' + n + ' of 3 stars'
        : 'Not played yet');
      lb.appendChild(cs);
      lb.title = (played ? 'Your best: ' + (rec.bestScore || 0) + ' points' : 'Not played yet') +
        ' · the bot’s score: ' + level.bot.score;
      return;
    }
    var s = starsEl(rec.stars || 0);
    s.setAttribute('aria-label', 'Best: ' + (rec.stars || 0) + ' of 3 stars');
    lb.appendChild(s);
    lb.title = played ? 'Your best: ' + (rec.bestScore || 0) + ' points' : 'Not played yet';
  }

  /* ================= live evaluation ================= */

  function scheduleEvaluate() {
    if (!state.level) return;
    if (evalTimer) root.clearTimeout(evalTimer);
    evalTimer = root.setTimeout(evaluateNow, 120);
  }

  // Sampling budgets: a full evaluation may take up to 300 ms on a heavy formula, which would freeze a slider drag,
  // so drag frames get 40 ms. A frame that finishes in time is exactly the full evaluation (the sampler is
  // deterministic); one that runs out shows "Measuring…" and is marked `live`, and the full-budget evaluation follows
  // 150 ms after the last such frame. Lock-in never uses a `live` evaluation, so scores are unchanged.
  var FULL_BUDGET_MS = 300, LIVE_BUDGET_MS = 40;
  var lastEvalMs = 0; // how long the last evaluation took

  // opts.live: a slider drag frame (reduced budget; the aria-live status is throttled, PLAN-v3 §L.10).
  function evaluateNow(opts) {
    var live = !!(opts && opts.live === true);
    if (evalTimer && !live) { root.clearTimeout(evalTimer); evalTimer = null; } // a drag frame keeps a full one due
    if (sliderRaf) { root.cancelAnimationFrame(sliderRaf); sliderRaf = 0; }
    var level = state.level;
    if (!level) return null;
    var text = input.getValue();
    var ev;
    try {
      var t0 = performance.now();
      // all four letters, so a newly typed variable uses its remembered slider on the first frame
      ev = state.game.evaluate(level, text, { timeBudgetMs: live ? LIVE_BUDGET_MS : FULL_BUDGET_MS }, sliderValues());
      lastEvalMs = performance.now() - t0;
      if (live && ev.curve && ev.curve.timedOut) {
        ev.live = true;
        if (evalTimer) root.clearTimeout(evalTimer);
        evalTimer = root.setTimeout(evaluateNow, 150);
      }
    } catch (err) {
      if (root.console) console.error('evaluate failed', err);
      ev = { status: 'error', message: "Can't evaluate this formula.", warning: null, input: text,
        formula: null, curve: null, result: null };
    }
    state.evaluation = ev;
    // the panel keeps its rows while the formula is temporarily invalid
    if (ev.status === 'ok') syncVarRows(ev.formula && ev.formula.params);
    else if (ev.status === 'empty') syncVarRows([]);
    applyEvaluation(ev, live);
    if (ev.status === 'ok') { lastGood = ev; scheduleSave(level.id, text, savedVars(ev)); }
    else if (ev.status === 'empty') scheduleSave(level.id, '', null);
    return ev;
  }

  function setFormula(text) {
    if (!input) return null;
    input.setValue(text == null ? '' : String(text));
    return evaluateNow();
  }

  // Test hook: set a slider to a value (offset := value, k := 0) and evaluate.
  function setVar(name, value) {
    if (!state.level || !state.sliders[name]) return null;
    var next = GF.sliders.setOffset(state.sliders[name], String(value));
    if (!next) return null;
    state.sliders[name] = next;
    renderVarRow(name, false, true);
    return evaluateNow();
  }

  /* ================= slider variables a–d (PLAN-v3 §C.3–C.6, §L.9, §L.10) ================= */

  // One slider state per letter for the whole visit, from the level's lastVars (else the defaults), so deleting
  // and retyping b brings its slider back. Rows exist only for the letters the formula uses.
  function initSliders(rec) {
    resetVarPanel();
    var saved = (rec && rec.lastVars) || {};
    state.sliders = {};
    VARS.forEach(function (n) {
      var sl = null;
      try { sl = saved[n] ? GF.sliders.create(n, saved[n]) : GF.sliders.create(n); } catch (e) { sl = null; }
      state.sliders[n] = sl || GF.sliders.create(n);
    });
    kbTipShown = false;
    kbTip = '';
    els.varsHowto.textContent = finePointer ? 'drag, or use \u2190 \u2192' : 'drag to tweak';
  }

  function resetVarPanel() {
    if (sliderRaf) { root.cancelAnimationFrame(sliderRaf); sliderRaf = 0; }
    flushLiveStatus(false);
    varRows = {};
    shownVars = [];
    kbTip = '';
    els.varsRows.textContent = '';
    els.varsPanel.hidden = true;
    els.varsTip.hidden = true;
    if (sliderDrag) {
      sliderDrag = false;
      if (pendingGeometry) { pendingGeometry = false; onKeyboardGeometry(); }
    }
  }

  // "1.30" as the slider shows it (fixed decimals), or the bare number if the slider has moved on since.
  function varLabel(n, v) {
    var sl = state.sliders[n];
    try { if (sl && GF.sliders.value(sl) === v) return GF.sliders.label(sl); } catch (e) { /* below */ }
    return fmtNum(v);
  }

  function sliderValues(names) {
    try { return GF.sliders.values(state.sliders, names); } catch (e) { return {}; }
  }

  // One drag frame per animation frame, however many input events arrive (evaluateNow has the budgets).
  function liveFrame() {
    if (!sliderRaf) sliderRaf = root.requestAnimationFrame(function () { sliderRaf = 0; evaluateNow({ live: true }); });
  }

  // What gets stored with a formula: {a: {value, offset, step}} for the letters it uses, or null.
  function savedVars(ev) {
    var used = (ev && ev.formula && ev.formula.params) || [];
    if (!used.length) return null;
    var out = {};
    used.forEach(function (n) { if (state.sliders[n]) out[n] = GF.sliders.save(state.sliders[n]); });
    return out;
  }

  // The evaluation was made with other slider values than the ones showing now (compared by value).
  function varsStale(ev) {
    if (!ev || ev.status !== 'ok' || !ev.formula) return false;
    var used = ev.formula.params || [];
    if (!used.length) return false;
    var now = sliderValues(used), had = ev.vars || {};
    return used.some(function (n) { return now[n] !== had[n]; });
  }

  // Add rows for newly used letters and drop unused ones, in a–d order. Existing rows are never rebuilt or
  // moved (that would drop focus), and the row that has focus stays.
  function syncVarRows(params) {
    params = (params || []).filter(function (n) { return !!state.sliders[n]; });
    var active = doc.activeElement;
    var keep = VARS.filter(function (n) {
      return params.indexOf(n) >= 0 || (shownVars.indexOf(n) >= 0 && varRows[n] && varRows[n].row.contains(active));
    });
    shownVars.forEach(function (n) {
      if (keep.indexOf(n) < 0 && varRows[n] && varRows[n].row.parentNode) varRows[n].row.parentNode.removeChild(varRows[n].row);
    });
    keep.forEach(function (n, i) {
      var r = varRows[n] || (varRows[n] = buildVarRow(n));
      if (r.row.parentNode !== els.varsRows) {
        var next = null;
        for (var j = i + 1; j < keep.length && !next; j++) {
          var rj = varRows[keep[j]];
          if (rj && rj.row.parentNode === els.varsRows) next = rj.row;
        }
        els.varsRows.insertBefore(r.row, next);
      }
      renderVarRow(n);
    });
    var added = keep.filter(function (n) { return shownVars.indexOf(n) < 0; });
    shownVars = keep;
    els.varsPanel.hidden = !keep.length;
    if (keep.length && prefs.varsTip !== false) { prefs.varsTip = false; savePrefs(); }
    if (!keep.length) kbTip = '';
    if (added.length) maybeKeyboardTip(added);
    updateVarsTip();
  }

  function buildVarRow(n) {
    var id = 'var-' + n;
    var steps = GF.sliders.STEPS || 20;
    var row = h('div', { 'class': 'var-row', 'data-var': n });
    var range = h('input', { type: 'range', id: id + '-range', 'class': 'var-range',
      min: String(-steps), max: String(steps), step: '1', value: '0' });
    var val = h('output', { 'class': 'var-val', id: id + '-val', 'aria-hidden': 'true' });
    var step = varField('var-step', 'Step of the ' + n + ' slider');
    var offset = varField('var-offset', 'Offset of the ' + n + ' slider (its middle value)');
    var centre = h('button', { type: 'button', 'class': 'btn btn-soft var-centre' }, 'centre');
    row.appendChild(h('label', { 'class': 'var-name', 'for': id + '-range' }, n));
    row.appendChild(val);
    row.appendChild(range);
    row.appendChild(h('div', { 'class': 'var-set' }, [
      h('label', { 'class': 'var-field' }, [h('span', null, 'step'), step]),
      h('label', { 'class': 'var-field' }, [h('span', null, 'offset'), offset]),
      centre
    ]));
    var r = { row: row, range: range, val: val, step: step, offset: offset, centre: centre };

    range.addEventListener('input', function () {
      state.sliders[n] = GF.sliders.setK(state.sliders[n], Number(range.value));
      renderVarRow(n, true);
      liveFrame();
    });
    // released, or one arrow-key step: the final numbers at once, unless evaluating is slow (then a drag frame, and
    // the full evaluation follows when the slider settles, so a held arrow key doesn't queue up 300 ms evaluations)
    range.addEventListener('change', function () {
      state.sliders[n] = GF.sliders.setK(state.sliders[n], Number(range.value));
      renderVarRow(n);
      if (lastEvalMs > LIVE_BUDGET_MS || (state.evaluation && state.evaluation.live)) liveFrame();
      else evaluateNow();
    });
    range.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lockIn(); }
    });
    [['step', step], ['offset', offset]].forEach(function (p) {
      var kind = p[0], el = p[1];
      el.addEventListener('change', function () { commitVarField(n, kind); });
      el.addEventListener('keydown', function (e) {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          // Enter applies the typed number (retyping the offset still moves the value back to it); on a computer a
          // second Enter locks in, as the status line says
          var sl = state.sliders[n];
          var unchanged = el.value === el.getAttribute('data-shown') && !(kind === 'offset' && sl && sl.k !== 0);
          if (unchanged && finePointer) { lockIn(); return; }
          commitVarField(n, kind, true);
          if (!finePointer) el.blur(); // "done" closes the phone keyboard
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setVarField(el, el.getAttribute('data-shown') || '');
        }
      });
    });
    centre.addEventListener('click', function () {
      state.sliders[n] = GF.sliders.centre(state.sliders[n]);
      renderVarRow(n, false, true);
      evaluateNow();
    });
    return r;
  }

  // Step and offset are typed (inputmode text: iOS's decimal pad has no minus key); U+2212 and a decimal comma work.
  function varField(cls, label) {
    return h('input', { type: 'text', 'class': cls, inputmode: 'text', enterkeyhint: 'done', autocomplete: 'off',
      autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': label });
  }

  function setVarField(el, text) {
    el.value = text;
    el.setAttribute('data-shown', text);
  }

  // A typed step zooms around the current value; a typed offset becomes the value. Invalid text reverts.
  // force: apply even when the text is unchanged (Enter on an offset whose slider has moved away from it).
  function commitVarField(n, kind, force) {
    var r = varRows[n], sl = state.sliders[n];
    if (!r || !sl) return;
    var el = kind === 'step' ? r.step : r.offset;
    if (!force && el.value === el.getAttribute('data-shown')) return; // unchanged (Enter, then change on blur)
    if (force && kind === 'step' && el.value === el.getAttribute('data-shown')) return; // same step: nothing to zoom
    var next = null;
    try { next = kind === 'step' ? GF.sliders.setStep(sl, el.value) : GF.sliders.setOffset(sl, el.value); } catch (e) { next = null; }
    if (next) state.sliders[n] = next;
    renderVarRow(n, false, true);
    if (next) evaluateNow();
  }

  // A step or offset typed but not yet committed (e.g. the player clicks Lock in straight away).
  function commitActiveVarField() {
    var a = doc.activeElement;
    shownVars.forEach(function (n) {
      var r = varRows[n];
      if (r && (a === r.step || a === r.offset)) commitVarField(n, a === r.step ? 'step' : 'offset');
    });
  }

  // light: only the value label (every drag frame). force: also overwrite a field that has focus.
  function renderVarRow(n, light, force) {
    var r = varRows[n], sl = state.sliders[n], S = GF.sliders;
    if (!r || !sl) return;
    var label = S.label(sl);
    r.val.textContent = label;
    r.range.setAttribute('aria-valuetext', n + ' = ' + label);
    if (light) return;
    if (Number(r.range.value) !== sl.k) r.range.value = String(sl.k);
    var d = S.decimals(sl);
    r.range.title = S.format(S.min(sl), d) + ' to ' + S.format(S.max(sl), d);
    [[r.step, S.format(sl.step)], [r.offset, S.format(sl.offset)]].forEach(function (p) {
      var el = p[0];
      var editing = el === doc.activeElement && el.value !== el.getAttribute('data-shown');
      if (force || !editing) setVarField(el, p[1]);
    });
    r.centre.setAttribute('aria-label', 'Centre the ' + n + ' slider on ' + label);
  }

  // "Tip: put a, b, c or d in your formula…" while the formula has no variables (until the first time one is
  // used), or "Slider for a below — hide the keyboard to drag it." while the panel is behind the keyboard.
  var kbTip = '';
  function updateVarsTip() {
    if (sliderDrag) return; // layout is frozen during a drag; endDrag → onKeyboardGeometry updates it
    var tip = els.varsTip;
    if (!state.level || state.screen !== 'game') { tip.hidden = true; return; }
    if (kbTip && shownVars.length && keyboardHeight() > 0) {
      tip.innerHTML = kbTip; // built from the letters a–d only
      tip.removeAttribute('data-tip');
      tip.setAttribute('data-tone', 'kb');
      tip.hidden = false;
      return;
    }
    kbTip = '';
    tip.removeAttribute('data-tone');
    var show = !shownVars.length && prefs.varsTip !== false && state.inputKind !== 'plain';
    if (show && !tip.getAttribute('data-tip')) {
      tip.innerHTML = 'Tip: put <i>a</i>, <i>b</i>, <i>c</i> or <i>d</i> in your formula to get a slider, e.g. ' +
        '<span class="nowrap"><i>a</i> sin(<i>bx</i>).</span>';
      tip.setAttribute('data-tip', '1');
    } else if (!show) tip.removeAttribute('data-tip');
    tip.hidden = !show;
  }

  function keyboardHeight() {
    var vk = root.mathVirtualKeyboard;
    try { return vk && vk.visible ? vk.boundingRect.height : 0; } catch (e) { return 0; }
  }

  // Once per visit, and only when the new slider really is hidden behind the virtual keyboard.
  function maybeKeyboardTip(names) {
    if (kbTipShown || !(keyboardHeight() > 0)) return;
    root.requestAnimationFrame(function () {
      var kb = keyboardHeight();
      var first = varRows[shownVars[0]];
      if (kbTipShown || !kb || !first || els.varsPanel.hidden) return;
      var limit = root.innerHeight - kb;
      if (first.range.getBoundingClientRect().bottom <= limit) return; // visible above the keyboard
      kbTipShown = true;
      var it = names.map(function (n) { return '<i>' + n + '</i>'; });
      kbTip = it.length > 1
        ? 'Sliders for ' + it.slice(0, -1).join(', ') + ' and ' + it[it.length - 1] + ' below \u2014 hide the keyboard to drag them.'
        : 'Slider for ' + it[0] + ' below \u2014 hide the keyboard to drag it.';
      updateVarsTip();
      keepFormulaVisible();
    });
  }

  function applyEvaluation(ev, live) {
    var level = state.level;
    var sandbox = isSandbox(level);
    var st = ev.status;
    statusLive = !!live;
    els.wallWarning.hidden = true;

    if (st === 'ok') {
      renderer.setCurve(ev.curve, { ghost: false });
      renderer.setResult(ev.result || null);
      renderStats(ev);
      setLockEnabled(!sandbox && !!ev.result);
      okStatus(ev);
    } else {
      var ghost = lastGood && lastGood.curve;
      renderer.setCurve(st === 'empty' ? null : (ghost || null), { ghost: true });
      renderer.setResult(null);
      renderStats(null);
      setLockEnabled(false);
      if (st === 'empty') setStatus('', '');
      else if (st === 'incomplete') setStatus(ev.message || 'Fill in the empty box.', 'muted');
      else setStatus(errorText(ev), 'error');
    }
    statusLive = false;
    updateCanvasLabel(ev);
    // the status may have grown a line: keep the keyboard tip above the keyboard
    if (kbTip && !els.varsTip.hidden && !live) keepFormulaVisible();
  }

  // Friendly names for what a challenge rejects (formula.disallowed gives MathJSON heads and symbols).
  // Structural heads (the limits of a sum, a lambda) and bound variables aren't worth naming.
  var OP_NAMES = { Floor: 'floor', Ceil: 'ceil', Round: 'round', Truncate: 'truncate', Mod: 'mod', Remainder: 'mod',
    List: 'list', At: 'list indexing', Subscript: 'subscript', Sum: 'sum', Product: 'product', If: 'if', Which: 'if',
    Clamp: 'clamp', Mean: 'mean', Fract: 'fractional part', Integrate: 'integral', D: 'derivative',
    Derivative: 'derivative', Limit: 'limit', Factorial: 'factorial', Binomial: 'binomial', Piecewise: 'piecewise',
    Greater: 'comparison', Less: 'comparison', GreaterEqual: 'comparison', LessEqual: 'comparison',
    Equal: 'comparison', NotEqual: 'comparison', ImaginaryUnit: 'i' };
  var OP_SKIP = { Tuple: 1, Sequence: 1, Function: 1, Triple: 1, Pair: 1, Single: 1, Limits: 1, Hold: 1,
    Delimiter: 1, Element: 1, Range: 1 };

  function notAllowedNames(detail) {
    var names = [];
    (Array.isArray(detail) ? detail : []).forEach(function (d) {
      d = String(d);
      if (OP_SKIP[d] || /^[a-z]$/.test(d)) return;
      var n = OP_NAMES[d] || d;
      if (names.indexOf(n) < 0) names.push(n);
    });
    return names;
  }

  function errorText(ev) {
    var msg = ev.message || "Can't read this formula.";
    var f = ev.formula;
    if (f && f.kind === 'not-allowed') {
      var names = notAllowedNames(f.detail);
      return names.length ? msg.replace(/\s+$/, '') + ' (found: ' + names.join(', ') + ')' : msg;
    }
    if (state.inputKind === 'plain' && f && f.kind === 'variables') {
      var found = Array.isArray(f.detail) ? f.detail : [];
      if (!found.length) {
        var m = /found:\s*([^)]*)/.exec(msg);
        if (m) found = m[1].split(/[,\s]+/).filter(Boolean);
      }
      var allFnLetters = found.length > 0 && found.every(function (s) {
        return s.length === 1 && FN_LETTERS.indexOf(s) !== -1;
      });
      // cosx reads as c·o·s·x: the brackets are the fix, not a slider letter
      if (allFnLetters) {
        var extra = (GF.formula.MESSAGES && GF.formula.MESSAGES.sliderLetters) || '';
        if (extra && msg.slice(-extra.length) === extra) msg = msg.slice(0, -extra.length);
        msg = msg.replace(/\s+$/, '').replace(/\.$/, '') + ' \u2014 write functions with brackets, e.g. sin(x).';
      }
    }
    return msg;
  }

  function okStatus(ev) {
    var level = state.level;
    if (ev.warning) {
      var slow = ev.warning === 'saturated' && ev.curve && ev.curve.timedOut;
      if (slow && ev.live) { setStatus('Measuring…', 'muted'); return; } // the full evaluation follows
      setStatus(slow ? 'Too slow to measure \u2014 length \u221e.' : WARNINGS[ev.warning] || ev.message || '', 'warn');
      if (ev.result && ev.result.wallsCrossedCount > 0) showWallWarning(ev.result.wallsCrossedCount);
      return;
    }
    if (isSandbox(level) || !ev.result) {
      var b = ev.curve && ev.curve.breakdown;
      if (b && isFinite(ev.curve.length)) {
        setStatus('Ink ' + fmtLen(b.ink) + ' \u00b7 off-screen & gaps ' + fmtLen((b.offscreen || 0) + (b.undefinedGap || 0)) +
          ' \u00b7 jumps ' + fmtLen(b.penLift || 0), 'muted');
      } else setStatus('', '');
      return;
    }
    var r = ev.result;
    if (r.wallsCrossedCount > 0) showWallWarning(r.wallsCrossedCount);
    if (isChallenge(level)) { challengeStatus(level, r); return; }
    var pct = Math.round(r.ratio != null ? r.ratio * 100 : r.length / r.par * 100);
    var g = lessonLengthFactor(r);
    if (r.hitCount < r.total) {
      // "4 of 5 dots × length 0.98 = 784": the challenge format without the size term
      var txt = r.hitCount + ' of ' + r.total + ' dots \u00d7 length ' + fmtFactor(g);
      if (r.wallsCrossedCount > 0) {
        txt += ' \u00d7 wall' + (r.wallsCrossedCount > 1 ? 's ' : ' ') +
          fmtNum(Math.pow(RULES.wallPenalty || 0.5, r.wallsCrossedCount));
      }
      setStatus(txt + ' = ' + r.score, 'muted');
      return;
    }
    if (r.wallsCrossedCount > 0) {
      setStatus('All dots, but a red wall is in the way.', 'warn');
      return;
    }
    if (!isFinite(r.length)) { setStatus(WARNINGS.saturated, 'warn'); return; }
    var lock = finePointer ? ' Press <kbd>Enter</kbd> to lock it in.' : ' Lock it in!';
    if (r.stars >= 3) setStatus('All dots, ' + pct + '% of par.' + lock, 'good', true);
    else if (r.stars === 2) setStatus('All dots! ' + pct + '% of par: under ' + pctOf(RULES.three) + '% earns ' + stars(3) + '.', 'good');
    else if (r.stars === 1) setStatus('All dots! ' + pct + '% of par: under ' + pctOf(RULES.two) + '% earns ' + stars(2) + '.', 'good');
    else {
      setStatus('All dots, but the line is ' + pct + '% of par (\u00d7' + fmtFactor(g) + '). A star needs under ' +
        pctOf(oneRatio()) + '%.', 'warn');
    }
  }

  function lessonLengthFactor(r) {
    if (r.lengthFactor != null) return r.lengthFactor;
    try { return GF.scoring.lengthFactor(r.length / r.par); } catch (e) { return NaN; }
  }

  // "4 of 5 dots × length 1.00 × size 0.88 = 704 · bot 800"
  function challengeStatus(level, r) {
    var bot = level.bot.score;
    var txt = r.hitCount + ' of ' + r.total + ' dots \u00d7 length ' + fmtFactor(r.lengthFactor) +
      ' \u00d7 size ' + fmtFactor(r.sizeFactor);
    if (r.wallsCrossedCount > 0) txt += ' \u00d7 wall' + (r.wallsCrossedCount > 1 ? 's ' : ' ') + fmtNum(r.wallFactor);
    txt += ' = ' + r.score + ' \u00b7 bot ' + bot;
    if (r.score > 0 && (beatsBot(r.score, bot) || matchesBot(r.score, bot))) {
      var lock = finePointer ? ' Press <kbd>Enter</kbd> to lock it in.' : ' Lock it in!';
      setStatus(escapeHtml(txt) + '.' + lock, 'good', true);
    } else setStatus(txt, r.score > 0 ? '' : 'muted');
  }

  // 2 decimals, but a factor just under 1 shows 3 ("4 of 5 dots \u00d7 length 0.998 = 799", not "\u00d7 length 1.00 = 799")
  function fmtFactor(v) {
    if (v == null || isNaN(v)) return '\u2014';
    if (v < 1 && v >= 0.995 && v.toFixed(3) !== '1.000') return v.toFixed(3);
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  function showWallWarning(n) {
    if (isChallenge(state.level)) {
      els.wallWarning.textContent = n === 1
        ? 'Your graph crosses a red wall inside the view: that halves the score.'
        : 'Your graph crosses ' + n + ' red walls inside the view: each one halves the score.';
    } else {
      els.wallWarning.textContent = n === 1
        ? 'Your graph crosses a red wall: that halves the score and rules out stars.'
        : 'Your graph crosses ' + n + ' red walls: each halves the score, and no stars.';
    }
    els.wallWarning.hidden = false;
  }

  function oneRatio() { return RULES.one || 1.415; }
  function pctOf(ratio) { return Math.floor(ratio * 100 + 1e-9); }
  function stars(n) { return new Array(n + 1).join(STAR_ON); }

  // #status is aria-live: while a slider is dragged it changes at most every 500 ms (the last text always lands).
  function setStatus(text, tone, html) {
    var since = performance.now() - statusAt;
    if (statusLive && since < 500) {
      statusPending = [text, tone, html];
      if (!statusTimer) statusTimer = root.setTimeout(function () { statusTimer = null; flushLiveStatus(true); }, 500 - since);
      return;
    }
    writeStatus(text, tone, html);
  }

  function flushLiveStatus(write) {
    if (statusTimer) { root.clearTimeout(statusTimer); statusTimer = null; }
    var p = statusPending;
    statusPending = null;
    if (write && p && state.level) writeStatus(p[0], p[1], p[2]);
  }

  function writeStatus(text, tone, html) {
    flushLiveStatus(false);
    statusAt = performance.now();
    if (html) els.status.innerHTML = text; else els.status.textContent = text;
    if (tone) els.status.setAttribute('data-tone', tone); else els.status.removeAttribute('data-tone');
  }

  function setLockEnabled(on) { els.lockIn.disabled = !on; }

  function renderStats(ev) {
    var dash = '\u2014';
    var level = state.level;
    var challenge = isChallenge(level);
    els.statHitsWrap.classList.remove('all-hit');
    els.statLengthWrap.classList.remove('over');
    els.statSizeWrap.classList.remove('over');
    els.statScoreWrap.classList.remove('all-hit');
    if (!ev || !ev.curve) {
      els.statHits.textContent = dash;
      els.statLength.textContent = dash;
      els.statPar.textContent = level && !isSandbox(level) && !challenge ? fmtLen(parOf(level)) : dash;
      els.statSize.textContent = dash;
      els.statScore.textContent = dash;
      els.statStars.textContent = dash;
      els.statStars.removeAttribute('aria-label');
      return;
    }
    var r = ev.result;
    var size = ev.formula && ev.formula.size;
    if (r && r.size != null) size = r.size;
    els.statSize.textContent = size >= 1 ? String(size) : dash;
    if (ev.live && ev.curve.timedOut) { // a drag frame ran out of time: the numbers follow once the slider settles
      [els.statHits, els.statLength, els.statScore, els.statStars].forEach(function (e) { e.textContent = '…'; });
      els.statStars.removeAttribute('aria-label');
      if (r && !challenge) els.statPar.textContent = fmtLen(r.par);
      return;
    }
    els.statLength.textContent = fmtLen(r ? r.length : ev.curve.length);
    if (!r) return;
    els.statHits.textContent = r.hitCount + '/' + r.total;
    els.statHitsWrap.classList.toggle('all-hit', r.hitCount === r.total);
    els.statScore.textContent = String(r.score);
    // the length costs points once its factor shows (PLAN-v3 §L.10), in lessons and challenges alike
    els.statLengthWrap.classList.toggle('over', lessonLengthFactor(r) < 0.995);
    if (challenge) {
      els.statSizeWrap.classList.toggle('over', size > FREE_SIZE);
      els.statScoreWrap.classList.toggle('all-hit', r.score > 0 &&
        (beatsBot(r.score, level.bot.score) || matchesBot(r.score, level.bot.score)));
      return;
    }
    els.statPar.textContent = fmtLen(r.par);
    els.statStars.textContent = '';
    els.statStars.appendChild(starsEl(r.stars));
  }

  function parOf(level) {
    try { return state.game.par(level); } catch (e) { return NaN; }
  }

  function updateCanvasLabel(ev) {
    var level = state.level;
    if (!level) return;
    var label;
    if (isSandbox(level)) {
      label = 'Graph of your function' + (ev.status === 'ok' && ev.curve ? ', length ' + fmtLen(ev.curve.length) : '') + '.';
    } else if (isChallenge(level)) {
      label = 'Graph for challenge ' + challengeTag(level) + ', ' + level.title + ': ' + level.targets.length + ' dots';
      if ((level.walls || []).length) label += ' and ' + level.walls.length + ' red wall' + (level.walls.length > 1 ? 's' : '');
      if (ev.status === 'ok' && ev.result) {
        var cr = ev.result;
        label += ', ' + cr.hitCount + ' hit. Length ' + fmtLen(cr.length) + ', dot-to-dot ' + fmtLen(cr.par) +
          '. Size ' + cr.size + '. Score ' + cr.score + ', bot ' + level.bot.score;
        if (cr.wallsCrossedCount) label += '. Crosses ' + cr.wallsCrossedCount + ' wall(s)';
      } else {
        label += (ev.status === 'empty' ? ', no function yet' : ', formula not valid yet');
      }
      label += '.';
    } else {
      var n = (level.targets || []).length;
      label = 'Graph for level ' + level.n + ', ' + level.title + ': ' + n + ' dots';
      if (ev.status === 'ok' && ev.result) {
        label += ', ' + ev.result.hitCount + ' hit. Length ' + fmtLen(ev.result.length) + ', par ' + fmtLen(ev.result.par);
        if (ev.result.wallsCrossedCount) label += '. Crosses ' + ev.result.wallsCrossedCount + ' wall(s)';
      } else {
        label += (ev.status === 'empty' ? ', no function yet' : ', formula not valid yet');
      }
      label += '.';
    }
    var used = ev.status === 'ok' && ev.formula && ev.formula.params || [];
    if (used.length) {
      label = label.replace(/\.$/, '') + ', ' + used.map(function (n) {
        return n + ' = ' + varLabel(n, ev.vars && ev.vars[n] != null ? ev.vars[n] : sliderValues([n])[n]);
      }).join(', ') + '.';
    }
    els.canvas.setAttribute('aria-label', label);
  }

  /* ================= lock in + result ================= */

  function lockIn() {
    var level = state.level;
    if (!level || isSandbox(level)) return;
    commitActiveVarField();
    var ev = state.evaluation;
    // re-evaluate when the text or a slider moved since the last evaluation (scores come from formula + values)
    // (a drag frame had a smaller time budget, so it never counts)
    if (evalTimer || sliderRaf || !ev || ev.live || ev.input !== input.getValue() || varsStale(ev)) ev = evaluateNow();
    if (!ev || ev.status !== 'ok' || !ev.result) {
      nudge();
      if (ev && ev.status === 'empty') setStatus('Type a function of x first.', 'muted');
      return;
    }
    var r = ev.result;
    var challenge = isChallenge(level);
    var rec = {};
    // Challenge attempts rank by score alone (stars: 0); their stars are recomputed against the bot
    // whenever they're shown, so a re-baked bot never leaves stale stars in storage.
    var vars = savedVars(ev);
    try {
      rec = state.store.record(level.id, { score: r.score, stars: challenge ? 0 : r.stars, formula: ev.input, vars: vars }) || {};
    } catch (e) { /* in-memory store */ }
    pendingSave = { id: level.id, text: ev.input, vars: vars };
    flushSave();
    input.hideKeyboard();
    input.blur();
    updateTopbarBest();
    if (challenge) renderBotPanel(level);
    if (!challenge && (safeGet(level.id).stars || 0) > 0) {
      if (level.whyNot) els.whynot.hidden = false;
      if (!isSandbox(level) && hintsShown < 1) { hintsShown = 1; renderHints(level); } // cleared: Hint 1 opens
    }
    // Open on the next task: the Enter keypress that triggered us must not reach the dialog's buttons.
    root.setTimeout(function () { if (state.level === level) showResult(level, ev, rec); }, 0);
  }

  // Ignore keyboard activations of dialog buttons right after opening (held / repeated Enter).
  var dialogOpenedAt = 0;
  function freshKeyClick(e) { return e.detail === 0 && performance.now() - dialogOpenedAt < 450; }

  function nudge() {
    var bar = els.formulaBar;
    bar.classList.remove('shake');
    void bar.offsetWidth;
    bar.classList.add('shake');
  }

  function headline(r) {
    if (r.stars >= 3) return 'Perfect!';
    if (r.stars === 2) return 'Great line!';
    if (r.stars === 1) return 'All dots!';
    if (r.hitCount === r.total && r.wallsCrossedCount > 0) return 'All dots — but a wall was crossed';
    if (r.hitCount === r.total) return 'All dots! Shorten the line for a star.';
    return 'Not yet';
  }

  function challengeHeadline(r, n, bot) {
    if (beatsBot(r.score, bot)) return 'You beat the bot!';
    if (r.score > 0 && matchesBot(r.score, bot)) return 'You matched the bot!';
    if (n === 2) return 'So close!';
    if (n === 1) return 'Nice one!';
    if (r.score > 0) return 'Locked in';
    return 'Not yet';
  }

  function setFacts(rows) {
    var dl = els.resultFacts;
    dl.textContent = '';
    rows.forEach(function (row) {
      dl.appendChild(h('div', { 'class': row.rowClass || null }, [
        h('dt', null, row.label),
        h('dd', { id: row.id || null, 'class': row.cls || null }, row.value)
      ]));
    });
  }

  function lessonFacts(level, r) {
    var pct = isFinite(r.length) ? Math.round(r.length / r.par * 100) : Infinity;
    var g = lessonLengthFactor(r);
    var rows = [
      { label: 'Dots hit', id: 'result-hits', cls: r.hitCount === r.total ? 'good' : 'bad', value: r.hitCount + ' / ' + r.total },
      // "26.4 vs par 21.4 (123%) · ×0.98", wrapping (on phones) only before the percentage
      { label: 'Length', id: 'result-length', cls: g < 0.995 ? 'warn' : null, value: [
        h('span', { 'class': 'nowrap' }, fmtLen(r.length) + ' vs par ' + fmtLen(r.par)), ' ',
        h('span', { 'class': 'nowrap' }, (isFinite(pct) ? '(' + pct + '%) ' : '') + '\u00b7 \u00d7' + fmtFactor(g))
      ] }
    ];
    // wall row (only on levels with walls)
    if ((level.walls || []).length) {
      rows.push({ label: 'Walls', rowClass: 'wall-row', cls: r.wallsCrossedCount ? 'bad' : 'good',
        value: r.wallsCrossedCount ? r.wallsCrossedCount + ' crossed (score ×' + fmtNum(Math.pow(RULES.wallPenalty || 0.5, r.wallsCrossedCount)) + ')' : 'none crossed' });
    }
    return rows;
  }

  function challengeFacts(level, r) {
    var best = safeGet(level.id).bestScore || 0;
    var rows = [
      { label: 'Dots', id: 'result-hits', cls: r.hitCount === r.total ? 'good' : null, value: r.hitCount + ' / ' + r.total },
      { label: 'Length', id: 'result-length', cls: r.lengthFactor < 0.995 ? 'warn' : null, value: [
        h('span', { 'class': 'nowrap' }, fmtLen(r.length) + ' · '),
        h('span', { 'class': 'nowrap' }, 'dot-to-dot ' + fmtLen(r.par) + ' (×' + fmtFactor(r.lengthFactor) + ')')
      ] },
      { label: 'Size', id: 'result-size', cls: r.sizeFactor < 0.995 ? 'warn' : null,
        value: r.size + ' · ' + FREE_SIZE + ' free (×' + fmtFactor(r.sizeFactor) + ')' }
    ];
    if ((level.walls || []).length) {
      rows.push({ label: 'Walls', rowClass: 'wall-row', cls: r.wallsCrossedCount ? 'bad' : 'good',
        value: r.wallsCrossedCount ? r.wallsCrossedCount + ' crossed (×' + fmtNum(r.wallFactor) + ')' : 'none crossed' });
    }
    rows.push({ label: 'Your best / bot', id: 'result-vs-bot',
      cls: beatsBot(best, level.bot.score) || matchesBot(best, level.bot.score) ? 'good' : null,
      value: best + ' / ' + level.bot.score });
    return rows;
  }

  // The next target counts from your best, which may be an earlier attempt.
  function challengeNote(level, r) {
    var bot = level.bot.score;
    var t = r.thresholds || thresholds(level);
    var best = Math.max(r.score, safeGet(level.id).bestScore || 0);
    if (beatsBot(r.score, bot)) return 'That’s ' + (r.score - bot) + (r.score - bot === 1 ? ' point' : ' points') + ' above the bot’s score.';
    if (matchesBot(r.score, bot)) return 'Level with the bot. One more point beats it.';
    if (beatsBot(best, bot)) return 'Your best, ' + best + ', beats the bot.';
    if (matchesBot(best, bot)) return 'Your best matches the bot. One more point beats it.';
    var lead = best > r.score ? 'Your best is ' + best + '. ' : '';
    if (best >= t.two) return lead + stars(3) + ' at ' + t.three + ' (the bot’s score): ' + (t.three - best) + ' to go.';
    if (best >= t.one) return lead + 'Next: ' + stars(2) + ' at ' + t.two + '.';
    return lead + 'Next: ' + stars(1) + ' at ' + t.one + '.';
  }

  function showResult(level, ev, rec) {
    var r = ev.result;
    var dlg = els.resultDialog;
    var challenge = isChallenge(level);
    var nStars = challenge ? challengeStars(r.score, level) : r.stars;

    els.resultStars.textContent = '';
    els.resultStars.appendChild(starsEl(nStars));
    els.resultTitle.textContent = challenge ? challengeHeadline(r, nStars, level.bot.score) : headline(r);
    els.resultScore.textContent = String(r.score);
    els.resultBest.hidden = !(rec.isNewBest && r.score > 0);

    renderResultFormula(ev);
    setFacts(challenge ? challengeFacts(level, r) : lessonFacts(level, r));
    renderSplit(ev.curve);

    var note = '', tone = '';
    var par = r.par;
    if (challenge) note = challengeNote(level, r);
    else if (r.hitCount < r.total) { note = 'Stars need every dot: you hit ' + r.hitCount + ' of ' + r.total + '.'; }
    else if (r.wallsCrossedCount > 0) { note = 'Stars need a graph that doesn’t cross the red walls inside the view. Make it jump there instead.'; tone = 'error'; }
    else if (!isFinite(r.length)) { note = 'Too wiggly to measure, so the length counts as ∞.'; }
    else if (r.stars === 2) note = stars(3) + ' needs length ≤ ' + fmtLen(par * RULES.three) + ' (' + pctOf(RULES.three) + '% of par).';
    else if (r.stars === 1) note = stars(2) + ' needs length ≤ ' + fmtLen(par * RULES.two) + ' (' + pctOf(RULES.two) + '% of par).';
    else if (r.stars === 0) {
      note = 'Points are for dots; stars are for a short line. A star needs length ≤ ' + fmtLen(par * oneRatio()) +
        ' (' + pctOf(oneRatio()) + '% of par).';
    }
    else note = 'As short as our reference answer' + (r.length < par - 1e-6 ? ', even shorter!' : '.');
    els.resultNote.textContent = note;
    if (tone) els.resultNote.setAttribute('data-tone', tone); else els.resultNote.removeAttribute('data-tone');

    // the bot's answer: a teaser until your best reaches ★★, then the formula (open once you match it)
    var revealed = challenge && botRevealed(level, safeGet(level.id));
    els.resultBotTeaser.hidden = !challenge || revealed;
    els.resultBotTeaser.textContent = challenge && !revealed ? botTeaser(level) + '. Score ' + thresholds(level).two +
      ' (' + stars(2) + ') to unlock its formula.' : '';
    els.resultBot.hidden = !revealed;
    els.resultBotAnswer.textContent = '';
    if (revealed) els.resultBotAnswer.appendChild(botAnswerEl(level));
    els.resultBot.open = revealed && (beatsBot(r.score, level.bot.score) || matchesBot(r.score, level.bot.score));

    var next = null, canNext = false;
    if (challenge) {
      var ci = challengeIndex(level.id);
      next = ci >= 0 && ci + 1 < CHALLENGES.length ? CHALLENGES[ci + 1] : null;
      canNext = !!next;
    } else {
      var idx = levelIndex(level.id);
      next = idx >= 0 && idx + 1 < LEVELS.length ? LEVELS[idx + 1] : null;
      canNext = !!(next && isUnlocked(idx + 1));
    }
    els.resultNext.textContent = challenge ? 'Next challenge' : 'Next level';
    els.resultNext.hidden = !canNext;
    if (canNext) els.resultNext.setAttribute('data-next', next.id); else els.resultNext.removeAttribute('data-next');
    els.resultRetry.className = 'btn ' + (canNext ? 'btn-soft' : 'btn-primary');

    if (typeof dlg.showModal === 'function') {
      if (dlg.open) dlg.close();
      dlg.showModal();
    } else dlg.setAttribute('open', '');
    dialogOpenedAt = performance.now();
    (canNext ? els.resultNext : els.resultRetry).focus();
  }

  // With slider variables: "y = 1.3 sin(0.79x − 0.5) − 2" (display only) and "a = 1.3 · b = 0.79".
  function renderResultFormula(ev) {
    var used = (ev.formula && ev.formula.params) || [];
    els.resultFormula.hidden = !used.length;
    els.resultFormulaMath.textContent = '';
    els.resultVars.textContent = '';
    if (!used.length) return;
    var vals = ev.vars || sliderValues(used);
    var latex = '';
    try { latex = state.game.compiler.substitute(ev.input, vals); } catch (e) { latex = ''; }
    els.resultFormulaMath.appendChild(formulaEl(latex || ev.input));
    used.forEach(function (n, i) {
      if (i) els.resultVars.appendChild(doc.createTextNode(' \u00b7 '));
      els.resultVars.appendChild(h('i', null, n));
      els.resultVars.appendChild(doc.createTextNode(' = ' + varLabel(n, vals[n])));
    });
  }

  function renderSplit(curve) {
    var bar = els.splitBar, legend = els.splitLegend;
    bar.textContent = '';
    legend.textContent = '';
    var b = curve && curve.breakdown;
    if (!b || !isFinite(curve.length) || !(curve.length > 0)) { els.resultSplit.hidden = true; return; }
    els.resultSplit.hidden = false;
    var parts = [
      { cls: 'sw-ink', label: 'Ink', v: b.ink || 0 },
      { cls: 'sw-off', label: 'Off-screen & gaps', v: (b.offscreen || 0) + (b.undefinedGap || 0) },
      { cls: 'sw-jump', label: 'Jumps', v: b.penLift || 0 }
    ];
    var total = parts.reduce(function (s, p) { return s + p.v; }, 0) || 1;
    parts.forEach(function (p, i) {
      if (p.v > total * 0.002) {
        var seg = h('span', { 'class': p.cls });
        seg.style.width = (p.v / total * 100) + '%';
        bar.appendChild(seg);
      }
      if (i === 0 || p.v > 0.005) {
        var li = h('li');
        li.appendChild(h('i', { 'class': p.cls }));
        li.appendChild(doc.createTextNode(p.label + ' '));
        li.appendChild(h('b', null, fmtLen(p.v)));
        legend.appendChild(li);
      }
    });
  }

  function closeResult() {
    var dlg = els.resultDialog;
    if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  }

  /* ================= persistence helpers ================= */

  function safeGet(id) {
    try { return state.store.get(id) || {}; } catch (e) { return {}; }
  }

  function totalStars() {
    var n = 0;
    LEVELS.forEach(function (l) { n += safeGet(l.id).stars || 0; });
    return n;
  }

  function scheduleSave(id, text, vars) {
    pendingSave = { id: id, text: text, vars: vars || null };
    if (saveTimer) root.clearTimeout(saveTimer);
    saveTimer = root.setTimeout(flushSave, 400);
  }

  function flushSave() {
    if (saveTimer) { root.clearTimeout(saveTimer); saveTimer = null; }
    if (!pendingSave) return;
    var p = pendingSave;
    pendingSave = null;
    try { state.store.setLast(p.id, p.text, p.vars); } catch (e) { /* ignore */ }
  }

  function loadPrefs() {
    try {
      var raw = root.localStorage.getItem(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p.showCoords === 'boolean') prefs.showCoords = p.showCoords;
        if (p && typeof p.varsTip === 'boolean') prefs.varsTip = p.varsTip;
        if (p && isFinite(p.rulesNoticeSeen)) prefs.rulesNoticeSeen = Number(p.rulesNoticeSeen);
      }
    } catch (e) { /* storage blocked: keep defaults */ }
  }

  function savePrefs() {
    try { root.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /* ================= small DOM + format helpers ================= */

  function h(tag, attrs, children) {
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) { e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    }
    return e;
  }

  function starsEl(n) {
    n = Math.max(0, Math.min(3, n | 0));
    var s = h('span', { 'class': 'stars', role: 'img', 'aria-label': n + ' of 3 stars' });
    for (var i = 0; i < 3; i++) {
      s.appendChild(h('span', { 'class': 'star' + (i < n ? ' on' : ''), 'aria-hidden': 'true' }, i < n ? STAR_ON : STAR_OFF));
    }
    return s;
  }

  function fmtLen(L) {
    if (L == null || isNaN(L)) return '\u2014';
    if (!isFinite(L)) return '\u221e';
    if (Math.abs(L) >= 1000) return String(Math.round(L));
    return L.toFixed(1);
  }

  function fmtNum(v) {
    var s = String(Math.round(v * 1000) / 1000);
    return s.charAt(0) === '-' ? MINUS + s.slice(1) : s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cssEscape(s) {
    return (root.CSS && root.CSS.escape) ? root.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  boot();
})(window);
