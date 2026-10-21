# Graph Fun — implementation plan

Vanilla JS game: hit every target dot with the graph of a function, using the shortest line.
MathLive 0.111.0 (input + virtual keyboard) and Cortex Compute Engine 0.141.0 (parse + compile) are installed locally in `node_modules` (exact versions pinned in package.json).

## 0. Key decisions
- **Stack:** plain `index.html` + classic `defer` scripts + one CSS file. No `type="module"`, no bundler. Our logic files use a tiny UMD pattern so the same files load as `GF.*` globals in the browser and via `require()` in `node --test`.
- **Formulas:** `mf.value` (LaTeX) → normalise → `ce.parse(src,{strict:false})` → `CE.compile(expr,{mode:'strict',fallback:false})` → real-or-NaN normalisation. Plain `<input>` fallback uses the same path (non-strict parsing accepts `2sin(3x)+x^2`). **No hand-written parser.**
- **Length metric (anti-gaming core):** world units, every level viewport isotropic 4:3. Visible ink counts fully; off-screen and undefined regions count their horizontal width; every pen-lift (asymptote/undefined gap) costs the vertical distance between piece ends (clamped to the viewport). This means `\lfloor x\rfloor` can't fake y=x cheaply; a curve can never be shorter than the polyline through the targets. Jumps are still not drawn and can't hit targets.
- **Score:** `round(1000 · hits/total · min(1, par/L)^2 · 0.5^wallsCrossed)`. **Every star requires all dots hit and no walls crossed.** 3★: L ≤ 1.05·par. 2★: L ≤ 1.25·par. 1★: score ≥ 500 (i.e. L ≤ √2·par). Next level unlocks at ≥1★. (See §13 — amended after review.)
- **Obstacles:** vertical "walls" (red dashed lines that must not be crossed on-screen) on asymptote levels only — they block the one loophole length can't: a continuous curve faking an asymptote. Crossing a wall halves the score and caps at 1★.
- **Levels:** 19, all numerically verified by the planner's prototype sampler (§8).

## 1. Verified facts (local files + real browser)
**Packages:** mathlive 0.111.0 (no deps); @cortex-js/compute-engine 0.141.0 (deps bundled into the UMD build).

**MathLive** (`node_modules/mathlive/`): `mathlive.min.js` (UMD; classic script sets globals `MathLive`, `MathfieldElement`, `window.mathVirtualKeyboard`, registers `<math-field>`/`<math-span>`), `fonts/*.woff2`, `sounds/*.wav`, `types/*.d.ts` (`mathfield-element.d.ts`, `virtual-keyboard.d.ts`, `core-types.d.ts`).
- `mf.value` = LaTeX; `getValue(fmt)` with `'latex' | 'latex-expanded' | 'ascii-math' | 'latex-without-placeholders' …`. **No `mf.expression` in 0.111.0.**
- Events: `input` (every edit). `change` fires on Return *or* blur — don't use it for submit. Enter dispatches a cancelable `beforeinput` InputEvent with `inputType==='insertLineBreak'` → submit there and `preventDefault()`.
- Statics: `MathfieldElement.fontsDirectory` (default `"./fonts/"`), `.soundsDirectory` (`"./sounds"`), `.keypressSound`, `.plonkSound`, `.computeEngine`. Attribute `math-virtual-keyboard-policy`: `auto|manual|sandboxed`. CSS parts include `menu-toggle`, `virtual-keyboard-toggle`. Dark mode follows `prefers-color-scheme` (`[theme=dark|light]` also). Keyboard CSS vars: `--keyboard-zindex`, `--keyboard-accent-color`, `--keycap-height`, `--keycap-font-size`. `window.mathVirtualKeyboard` events: `geometrychange` (use `mathVirtualKeyboard.boundingRect`), `virtual-keyboard-toggle`.
- **MathLive ↔ CE:** MathLive never loads CE. The `MathfieldElement.computeEngine` getter lazily does `new window[Symbol.for('io.cortexjs.compute-engine')].ComputeEngine()` (set up by the CE UMD), used only for clipboard/MathJSON. Set `MathfieldElement.computeEngine = ourCe` so only one engine exists. We parse `mf.value` ourselves.
- **Fonts/sounds:** default `./fonts/` is resolved against `document.currentScript.src` after an async `fetch(scriptURL,{method:'HEAD'})`; under file:// that fails (`console.error('Invalid URL …')`) but still falls back. An absolute value (`^(?:[a-z+]+:)?//`) skips the HEAD. The setter starts font loading immediately. → Before creating any field: `MathfieldElement.fontsDirectory = new URL('node_modules/mathlive/fonts/', document.baseURI).href; MathfieldElement.soundsDirectory = null`. Font failure → `body.ML__fonts-did-not-load`, system fonts (cosmetic).

**Compute Engine** (`node_modules/@cortex-js/compute-engine/`):
- `dist/umd-min/compute-engine.cjs` is UMD → global `ComputeEngine` (namespace: `.ComputeEngine` class, `.compile`, `.version==='0.141.0'`) + the Symbol.for global. In Node, `require('@cortex-js/compute-engine')` resolves to that `.cjs` via the `"require"` export (tested). ESM: `dist/esm-min/compute-engine.js`.
- Typings: `dist/types/compute-engine.d.ts`, `dist/types/compute-engine/free-functions.d.ts`, `.../compilation/types.d.ts`, `.../compilation/compile-expression.d.ts`.
- **`expr.compile()` does NOT exist in 0.141.0.** Use free function `CE.compile(expr, opts)` → `CompilationResult {success, code, run, calling:'expression'|'lambda', freeSymbols, mode, error, unsupported}`. Call `run({x})` (`calling` was `'expression'` in every case tried). With default `fallback:true`, failure returns `success:false` + interpreted `run`; `fallback:false` throws.
- `mode:'strict'` → real NaN for `\sqrt{-1}`, `\ln(-1)`, `\arcsin 2` (default `'auto'` returns `{re,im}`). Even strict, `\cos^{-1}(2)` returned `{re:0,im:1.3169…}` → always normalise: number → finite?; `{re,im}` → `im≈0 ? re : NaN`; else NaN.
- `x^{1/3}` and `\sqrt[3]{x}` give the real cube root for negative x.
- Speed: compiled ≈50 ns/call; parse 0.4–12 ms; compile 0.5–7 ms; `new ComputeEngine()` ≈40 ms; `expr.subs({x}).N()` ≈120 µs/call (~2000× slower). Every valid numeric expression tried compiled, so the interpreted fallback is a rare edge case.
- Parse: `{strict:false}` matched strict on all 41 MathLive-style inputs tested and also accepts plain text → always use it. `expr.isValid`, `expr.errors[i].op1.string` (error code: `missing`, `unexpected-operator`, `unexpected-delimiter`, `unexpected-command`), `expr.unknowns`, `expr.isNumber`, `expr.operator`. `ce.parse('\\binom{x}{2}')` **throws** → wrap every parse in try/catch. `ce.pushScope()/popScope()` exist and compiled `run` still works after `popScope` → wrap each parse+compile in a scope so auto-declared symbols don't accumulate.

**CE parse results for MathLive LaTeX** (all checked): `2x`→2·x; `\sin 2x`→sin(2x); `\sin 2x+1`→sin(2x)+1; `\sin x\cos x`→product; `\sin x^2`→sin(x²); `\sin^2 x`, `\sin(x)^2`→sin²x; `\sin x\cdot y`→sin(x·y); `\cos^{-1}x`→Arccos; `|x|`, `\left|x\right|`, `\vert x\vert`, `\operatorname{abs}(x)`, `\mathrm{abs}(x)`→Abs; `\frac{}{}`→Divide; `\sqrt[n]{}`→Root; `e^x`, `\exponentialE^{x}`, `\mathrm{e}^x`, `\exp(x)`→e^x; `\ln`→natural; `\log`→**base 10**; `\log_{2}x`, `\log_2 x`→Log(x,2); `\pi`→Pi; `(x+1)(x-1)`, `x(x+1)`→product; `x\div 2`, `\cdot`, `\times` OK; `.5x`→0.5x; `\,` `\;` `\ ` `\:` ignored; `\left(x\right.`→x; `2^{}`→2; `\placeholder{}`→`Nothing` (fails compile); `x+\placeholder{}`→invalid; `y=x^2`→Equal(y,…); `f(x)=x^2`→Equal(f(x),…); `\left[x+1\right]^2` and `\left\lbrack…\right\rbrack`→a **List**; `f(x)`→compile throws "Unknown operator `f`"; plain `sinx`→i·n·s·x; plain `xsin(x)`→unknown operator `xsin`; plain `1/2x`→1/(2x).
Precedence rule for players: a function name without parentheses takes the following product term, up to the next `+`, `−` or function name. Our keyboard always inserts parentheses.

**Browser probe** (Playwright MCP over `http://127.0.0.1:8765`, Firefox): both scripts load as classic scripts (python serves `.cjs` as `application/octet-stream` → MIME warning but executes); fonts load from `node_modules/mathlive/fonts/*.woff2`; custom `mathVirtualKeyboard.layouts=[…]` accepted and shown; templates: `\sin\left(#0\right)`→`\sin\left(\placeholder{}\right)`, then typing x → `\sin\left(x\right)`; `\frac{#@}{#?}` after "2" → `\frac{2}{\placeholder{}}`; `#@^{#?}` then "3" → `x^3`; `getValue('ascii-math')` of `\frac{1}{x}+\sin 2x` → `(1)/(x)+sin 2x`.

**Environment gotchas:** (a) Playwright MCP refuses `file:` URLs → browser tests over HTTP (§11). (b) Playwright MCP writes `.playwright-mcp/` into the project → delete it after testing and list it in `.gitignore`. (c) shared-mime-info maps `*.cjs` to JavaScript here, so Chrome under file:// should accept it. (d) Unverified: whether Chrome loads woff2 fonts under file:// (may be CORS-blocked; cosmetic). If a browser refuses the CE script under file://, `boot()` detects missing `window.ComputeEngine` and tells the user to run `npm start` (python http.server).

## 2. Files
```
index.html            UI agent
css/style.css         UI agent
js/curve.js           logic: sampler, length metric, geometry helpers
js/scoring.js         logic: hits, walls, score, stars
js/formula.js         logic: normalise, parse, check, compile (CE injected)
js/levels.js          logic: LEVELS data
js/engine.js          logic: façade used by UI and tests
js/storage.js         logic: progress store (backend injected)
js/render.js          UI: canvas renderer
js/keyboard.js        UI: MathLive layout + install
js/app.js             UI: boot, screens, wiring
test/helpers.js       loads CE + modules (not matched by the test glob)
test/{formula,curve,scoring,levels,gameplay,storage}.test.js
package.json          scripts only: "test": "node --test \"test/*.test.js\"", "start": "python3 -m http.server 8080"
                      (keep "type":"commonjs"; dependencies untouched; no installs)
```
Extras: `README.md` (how to play / run / test), `.gitignore` (`node_modules/`? no — keep node_modules out of .gitignore decisions; just add `.playwright-mcp/`).

**Module pattern** (every logic file, and render.js/keyboard.js):
```js
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? { curve: require('./curve.js') } : { curve: root.GF.curve }); // deps vary per file
  if (isNode) module.exports = api; else (root.GF = root.GF || {}).scoring = api;      // name per file
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) { 'use strict'; /* ... */ return {/*api*/}; });
```
Deps: curve: none; scoring: curve; formula: none (CE injected); levels: none; engine: curve, scoring, formula, levels; storage: none.

**Script tags** (all `defer`, in `<head>`, this order): `node_modules/@cortex-js/compute-engine/dist/umd-min/compute-engine.cjs`, `node_modules/mathlive/mathlive.min.js`, `js/curve.js`, `js/scoring.js`, `js/formula.js`, `js/levels.js`, `js/engine.js`, `js/storage.js`, `js/render.js`, `js/keyboard.js`, `js/app.js` (calls `GF.app.boot()`).

## 3. Public APIs (contracts both agents code against)
```ts
type Viewport = {xMin:number, xMax:number, yMin:number, yMax:number};
type Pt = [number, number];

// GF.curve
VPX = 1000                                   // virtual px across viewport width
DEFAULTS = {initialIntervals:1000, maxDepth:12, maxEvals:50000, flatTolPx:0.5, jumpPx:4,
            clipMargin:0.05, timeBudgetMs:Infinity, now:()=>Date.now()}
SLOW = {initialIntervals:200, maxDepth:8, maxEvals:3000, timeBudgetMs:1500}   // interpreted fallback only
sampleCurve(fn:(x)=>number, vp:Viewport, opts?:Partial<DEFAULTS>): Curve
clipSegmentT(x0,y0,x1,y1, rect:Viewport): [t0,t1] | null   // Liang–Barsky
distPointSegment(px,py, x0,y0,x1,y1): number
Curve = {
  paths: Pt[][],        // SINGLE SOURCE OF TRUTH: drawn by render.js and used for hits/walls.
                        // World coords, pieces clipped to viewport expanded by clipMargin each side.
                        // New path after a pen-lift or after re-entering the clip rect.
  length: number,       // world units; Infinity if saturated/timed out
  breakdown: {ink, offscreen, undefinedGap, penLift},
  pieceCount: number, evals: number, saturated: boolean, timedOut: boolean, viewport: Viewport }

// GF.scoring
RULES = {exponent:2, three:1.05, two:1.25, oneMinScore:500, wallPenalty:0.5}
hitTargets(paths:Pt[][], targets:Pt[], r:number): boolean[]
crossedWalls(paths:Pt[][], walls:number[], vp:Viewport): boolean[]
scoreAttempt({hitCount,total,length,par,wallsCrossedCount}): {score:number, stars:0|1|2|3}
evaluateAttempt(curve:Curve, level:Level, par:number): AttemptResult
AttemptResult = {hits:boolean[], hitCount, total, walls:boolean[], wallsCrossedCount,
                 length, par, ratio /*length/par*/, score, stars, saturated}

// GF.formula
normalizeInput(src:string): string
createCompiler(CE /* window.ComputeEngine or require('@cortex-js/compute-engine') */, ce? /* instance */):
  { ce, compile(input:string): FormulaResult }
FormulaResult =
  | {ok:true, fn:(x)=>number /* never throws; finite clamped to ±1e100, else NaN */,
     source:string /*normalised*/, pretty:string /*expr.toString()*/, compiled:boolean}
  | {ok:false, kind:'empty'|'incomplete'|'syntax'|'variables'|'equation'|'not-number'|'compile',
     message:string, detail?:string[]}

// GF.levels
LEVELS: Level[];  getLevel(id): Level|undefined;  hitRadius(level): number  // default (xMax-xMin)/64
Level = {id, n, title, family, blurb /*HTML, may contain <math-span>*/, hint /*HTML*/,
         ref:{latex, text}, viewport:Viewport, targets:Pt[], walls?:number[], hitRadius?:number,
         whyNot:string}

// GF.engine
createGame(CE, {levels = GF.levels.LEVELS} = {}): Game
Game = { ce, compiler, par(level):number /* cached; reference sampled with DEFAULTS */,
         evaluate(level, input:string, sampleOpts?): Evaluation }
Evaluation = { status:'empty'|'incomplete'|'error'|'ok', message:string,
               warning:null|'offscreen'|'saturated'|'slow', input:string,
               formula:FormulaResult, curve:Curve|null, result:AttemptResult|null }

// GF.storage
createStore(backend = globalThis.localStorage, key = 'graph-fun.progress.v1'): Store
Store = { get(id): {bestScore:number, stars:number, bestFormula:string, lastFormula:string},
          record(id, {score, stars, formula}): {isNewBest:boolean},
          setLast(id, formula), isUnlocked(index, levels, {unlockAll}), reset(), all() }
// JSON {version:1, levels:{[id]:{...}}}. Every access try/catch; bad JSON or throwing backend → in-memory.

// GF.render
createRenderer(canvas): { setLevel(level), setCurve(curve|null, {ghost:boolean}),
                          setResult(result|null), setOptions({showCoords}), draw(), destroy() }

// GF.keyboard
LAYOUT; install(mathVirtualKeyboard)

// GF.app
boot()   // exposes GF.app.state = {game, store, level, evaluation} and GF.app.setFormula(text) for tests
```

## 4. Formula pipeline (`formula.compile`)
1. **Normalise:** trim; U+2212/U+2013→`-`; `π`→`\pi `; `×`,`·`→`\cdot `; `÷`→`/`; `\mleft`/`\mright`→`\left`/`\right`. Strip prefix `/^\s*(?:y|[fgh]\s*(?:\\left)?\(\s*x\s*(?:\\right)?\))\s*=\s*/`. `\left[`, `\left\lbrack`→`\left(`; `\right]`, `\right\rbrack`→`\right)`; `\lbrack`/`\rbrack`→`(`/`)`. Don't touch bare `[` (used by `\sqrt[3]{}`).
2. Empty → `{kind:'empty', message:''}`.
3. Contains `\placeholder` → `incomplete`: "Fill in the empty box."
4. `ce.pushScope()`; try `ce.parse(src,{strict:false})`; throw → `syntax` "Can't read this formula."
5. `operator==='Equal'` → `equation`: "Type just the right-hand side, e.g. 2x+1. (x = c is a vertical line — not a function.)"
6. `!expr.isValid` → `syntax` by `errors[0].op1.string`: `missing`→"Something's missing."; `unexpected-operator`→"An operator is missing a side."; `unexpected-delimiter`/`expected-*-delimiter`→"Check your brackets."; `unexpected-command`→"Unknown command" + offending LaTeX (from `errors[0].op2`, verify); else "Can't read this formula."
7. `expr.unknowns` minus `x` non-empty → `variables`: "Only x can be a variable (found: a)."
8. `expr.isNumber !== true` → `not-number` (catches bare `\sin`, `\text{}`, `x>2`, lists).
9. `CE.compile(expr,{mode:'strict',fallback:false})`. Throws → map "Unknown operator `f`" → `compile` "Unknown function “f”."; else retry `CE.compile(expr,{mode:'strict'})`; if `success===false` use its interpreted `run` with `compiled:false` (engine then samples with `SLOW` and warns 'slow').
10. `fn = x => { try { let v = calling==='lambda' ? run(x) : run({x}); if (v && typeof v==='object' && 'im' in v) v = Math.abs(v.im)<1e-12 ? v.re : NaN; return typeof v==='number' && isFinite(v) ? Math.max(-1e100, Math.min(1e100, v)) : NaN; } catch { return NaN; } }`
11. `popScope()` in `finally`.

## 5. Length metric — `sampleCurve` (exact prototype constants; these reproduce §8 pars)
- `W = xMax−xMin`, `s = VPX/W`, `tol = flatTolPx/s`, `jump = jumpPx/s`.
- **Grid:** `N = initialIntervals`; `t0=0`, `tN=1`, `tk = k/N + 0.4·(frac(k·0.6180339887498949) − 0.5)/N`, `xk = xMin + W·tk` (deterministic jitter defeats aliasing tricks like `\sin(64\pi x)`). Evaluate all grid points, then `refine` each interval.
- **`refine(a,ya,b,yb,d)`** in this order:
  1. Both NaN → break piece; `gap += b−a`.
  2. Over budget (`evals ≥ maxEvals`, or a time check every 256 evals exceeds `timeBudgetMs`) → `saturated=true` (and `timedOut` if time); if both defined emit the segment, else break + gap.
  3. Exactly one NaN (domain boundary) → bisect until `d==maxDepth`, then break + gap.
  4. Both defined and `d==maxDepth` → if `|yb−ya| > jump` it's a **jump** (break, `gap += b−a`), else emit segment.
  5. Else evaluate `m=(a+b)/2`: `ym` NaN → recurse both halves; if all three values are above `yMax` or all below `yMin` (same-side off-screen), or `|ym − (ya+yb)/2| ≤ tol` → emit `a→m`, `m→b`; else recurse both halves.
- **Emit segment:** `c = clipSegmentT(seg, viewport)`, `in = c ? c[1]−c[0] : 0`; `ink += in·hypot(dx,dy)`; `offscreen += (1−in)·dx`; append to current piece (start a piece at `[x0,y0]` if none).
- **Pen-lift:** `Σ |clampY(firstY(piece i)) − clampY(lastY(piece i−1))|`, `clampY` to `[yMin,yMax]`.
- **Length:** `saturated ? Infinity : ink + offscreen + gap + penLift`.
- **Paths:** clip pieces segment-by-segment to the rect expanded by 5%; new path whenever a segment is clipped at its start or the previous was clipped at its end.

Why it can't be gamed: length ≥ viewport width; a point-only function (`\sqrt{-(x-2)^2}`) costs full width (16) and hits nothing; leaving the screen/domain and returning costs |Δx| + vertical distance to the edge ≥ the straight segment; jumps cost their clamped vertical gap → every trick costs ≥ the Euclidean polyline through the target disks. The polyline itself (sums of |x−a|) is allowed and may beat par; score capped at 1000. Above ~50k evals (e.g. `\sin(1000x)`) or the time budget → Infinity ("too wiggly to measure", score 0). `\sin(200x)` resolves (~26k evals, L≈2036).

Units/aspect: world units; every viewport exactly 4:3 (tests enforce) and canvas `aspect-ratio:4/3`, so one world unit is the same px on both axes and the metric = visible ink.

Budgets: browser passes `timeBudgetMs:300` (SLOW 1500). Node tests and `par()` use Infinity.

## 6. Hits and walls
- **Hit:** target hit if `distPointSegment(target, seg) ≤ r` for any segment in `paths` (pre-filter on segment x-range ± r). `r = W/64` (0.25 for 16-wide; 0.1875 for the log level). Draw the ring at exactly r. Jumps/gaps have no segments → can't hit.
- **Wall at x=c:** crossed if any path segment has `(x0−c)(x1−c) ≤ 0`, `x1≠x0`, and the interpolated y at c is within `[yMin,yMax]`. Crossings above/below the screen are allowed (they cost vertical ink anyway). A true asymptote is a break → never crosses.

## 7. Scoring, stars, persistence, unlocking
- `q = min(1, par/L)^2`; `score = round(1000·(h/n)·q·0.5^w)`.
- Stars (AMENDED): 0 unless `h==n && w==0`. Then 3 if `L ≤ 1.05·par` (boundary score 907); 2 if `L ≤ 1.25·par` (boundary 640); 1 if `score ≥ 500` (L ≤ √2·par); else 0. `L=Infinity` → 0.
- Lock-in keeps the best attempt, ranked by (stars, then score); `bestScore`, `stars` and `bestFormula` always come from that one attempt (a 0★ 800 never displaces a 1★ 510). The store re-reads the backend before each read/write so a second tab can't overwrite newer progress. `lastFormula` saved on every successful evaluation (debounced) and restored on reopening.
- Level i unlocked if i=0 or best stars of level i−1 ≥ 1. `?unlock=all` unlocks everything without persisting.
- Measured: `10\sin(100x)` L≈6117 vs pars 16–102 → q ≤ 3·10⁻⁴ → **score 0, 0★ on all 19 levels** even though it hits everything. `5\sin(50x)` (L≈2548), `\sin(200x)`: 0★ everywhere. `3\sin(10x)`: ≤13, 0★.

## 8. Levels
All viewports A = [−8,8]×[−6,6] unless stated; r = 0.25. Targets lie exactly on the reference (4-dp rounding), all ≥ 2r inside the viewport. Par = sampler length of the reference (tests accept ±0.5%). Every reference measured 3★/1000 with < 2,200 evals.

| # | id | Title · family | ref LaTeX | ref text | targets | walls | par |
|---|---|---|---|---|---|---|---|
|1|flat|Flat Line · y=c|`3`|`3`|(−6,3)(−2,3)(2,3)(6,3)|–|16.000|
|2|slope|Rise over Run · y=mx+b|`\frac{1}{2}x+1`|`x/2+1`|(−6,−2)(−2,0)(2,2)(6,4)|–|17.889|
|3|downhill|Downhill · m<0|`-2x+3`|`-2x+3`|(−1,5)(1,1)(2.5,−2)(4,−5)|–|23.416|
|4|abs|V for Absolute · a\|x−h\|+k|`\left|x-2\right|-1`|`abs(x-2)-1`|(−3,4)(0,1)(2,−1)(4,1)(7,4)|–|21.383|
|5|parabola|The Parabola · ax²+c|`\frac{1}{2}x^2-3`|`0.5x^2-3`|(−4,5)(−2,−1)(0,−3)(2,−1)(4,5)|–|28.160|
|6|vertex|Vertex Form · a(x−h)²+k|`-(x-2)^2+4`|`-(x-2)^2+4`|(−1,−5)(0,0)(2,4)(4,0)(5,−5)|–|31.196|
|7|cubic|S-Curve · ax³+bx|`\frac{1}{4}x^3-3x`|`x^3/4-3x`|(−4,−4)(−2,4)(0,0)(2,−4)(4,4)|–|37.680|
|8|sqrt|Square Root · a√(x−h)+k|`2\sqrt{x+4}-3`|`2sqrt(x+4)-3`|(−4,−3)(−3,−1)(0,1)(5,3)|–|18.443|
|9|recip|Two Branches · k/x|`\frac{4}{x}`|`4/x`|(−4,−1)(−2,−2)(−1,−4)(1,4)(2,2)(4,1)|[0]|34.521|
|10|exp|Doubling · a·bˣ+c|`2^x-3`|`2^x-3`|(−6,−2.9844)(−2,−2.75)(0,−2)(1,−1)(2,1)(3,5)|–|21.801|
|11|log|Logarithm · log_b x; vp [−2,10]×[−4.5,4.5], r 0.1875|`\log_2 x`|`log_2(x)`|(0.25,−2)(0.5,−1)(1,0)(2,1)(4,2)(8,3)|–|16.526|
|12|sine|Sine Wave · A sin x|`3\sin x`|`3sin(x)`|(−4.7124,3)(−1.5708,−3)(0,0)(1.5708,3)(3.1416,0)(4.7124,−3)|–|35.237|
|13|period|Change the Period · A sin(Bx)|`2\sin\left(\frac{\pi x}{4}\right)`|`2sin(pi x/4)`|(−6,2)(−4,0)(−2,−2)(0,0)(2,2)(6,−2)|–|23.419|
|14|cosphase|Shift and Lift · A cos(x−h)+k|`2\cos\left(x-1\right)+1`|`2cos(x-1)+1`|(−5.2832,3)(−2.1416,−1)(1,3)(2.5708,1)(4.1416,−1)(7.2832,3)|–|26.782|
|15|tan|Tangent · tan(Bx)|`\tan\left(\frac{\pi x}{4}\right)`|`tan(pi x/4)`|(−4,0)(−3,1)(−1,−1)(0,0)(1.5,2.4142)(3,−1)(5,1)|[−6,−2,2,6]|101.935|
|16|linewave|Wave on a Slope · mx+A sin(Bx)|`\frac{x}{2}+2\sin\left(\frac{\pi x}{2}\right)`|`x/2+2sin(pi x/2)`|(−5,−4.5)(−3,0.5)(0,0)(1,2.5)(3,−0.5)(5,4.5)|–|37.303|
|17|semicircle|Half a Circle · √(r²−x²)|`\sqrt{25-x^2}-1`|`sqrt(25-x^2)-1`|(−5,−1)(−4,2)(−3,3)(0,4)(3,3)(4,2)(5,−1)|–|21.698|
|18|gauss|Bell Curve · Ae^{−x²/(2σ²)}|`4e^{-\frac{x^2}{2}}`|`4e^(-x^2/2)`|(−6,0)(−3,0.0444)(−2,0.5413)(−1,2.4261)(0,4)(1,2.4261)(2,0.5413)(3,0.0444)(6,0)|–|20.431|
|19|damped|Fading Echo · Ae^{−kx}cos(Bx); vp [−1,15]×[−6,6]|`4e^{-\frac{x}{4}}\cos\left(\frac{\pi x}{2}\right)`|`4e^(-x/4)cos(pi x/2)`|(0,4)(1,0)(2,−2.4261)(4,1.4715)(6,−0.8925)(8,0.5413)|–|28.957|

**Why simpler families fail** (`whyNot`; grid searches over each family's params with perpendicular-distance hits; decoys run through the real sampler): 2: constant hits ≤1. 3: positive slopes hit 0. 4: best line 3/5. 5: best line 2/5, best V 4/5. 6: best V 3/5; level-5 form x²−4 0/5. 7: best line/V/parabola 3/5 (point symmetry not mirror). 8: best line & parabola 3/4. 9: every continuous curve crosses the wall; best parabola 3/6. 10: best parabola 5/6, sqrt 3/6. 11: best √ & parabola 5/6, a·e^{bx}+c 4/6. 12: best V 5/6, cubic 1/6. 13: 2 sin x 3/6. 14: unshifted waves 0/6. 15: every continuous curve crosses all 4 walls; tan x 2/7. 16: a pure sinusoid only hits all six with B≈2.95 (length ≫ par). 17: best parabola 6/7, cosine dome 6/7, Gaussian 5/7. 18: cosine bump 8/9, quartic 7/9, 4/(1+x²) 7/9 (tuned shifted Lorentzian 8/9). 19: undamped cosine 2/6, envelope alone 3/6.

**Blurbs / hints** (HTML; formulas in `<math-span>`):
1. "A constant function gives every x the same y — a horizontal line <math-span>y=c</math-span>." Hint: "All dots share one height."
2. "In y=mx+b, b is where the line crosses the y-axis and m is rise per 1 step right." Hint: "Read the y-intercept at x=0, then rise/run between two dots."
3. "Negative m makes the line fall." Hint: "From (1,1) to (2.5,−2): down 3 over 1.5."
4. "|x| makes a V; |x−h|+k moves the tip to (h,k); a scales or flips it." Hint: "The tip is the lowest dot."
5. "x² curves up from its vertex; a stretches/flattens, c shifts up/down." Hint: "Vertex (0,−3); at x=2 it has risen 2 — so a·4=2."
6. "a(x−h)²+k puts the vertex at (h,k); a<0 opens downward." Hint: "Highest dot is the vertex; one step aside it drops 1."
7. "Cubics can rise, fall and rise again." Hint: "Symmetric through the origin: try ax³+bx and solve with two dots."
8. "√x exists only for x ≥ 0: it starts at a point and flattens out." Hint: "Starts at (−4,−3); 1 step right it rises 2, 4 steps right it rises 4."
9. "1/x is undefined at 0 and shoots to ±∞ (an asymptote). The red wall can't be crossed — your curve must jump." Hint: "Every dot has x·y = 4."
10. "In 2ˣ each step right doubles; far left it fades to an asymptote." Hint: "The height above y=−3 goes 2, 4, 8 at x=1, 2, 3."
11. "log₂x answers 'which power of 2 gives x?' — the inverse of 2ˣ. Use the log□ key, or ln x / ln 2." Hint: "x=1, 2, 4, 8 give 0, 1, 2, 3."
12. "sin x repeats every 2π; A sets the peak height." Hint: "Peaks at ±3."
13. "sin(Bx) has period 2π/B." Hint: "Trough to trough is 8 units."
14. "cos is sin shifted; (x−h) slides it right, +k lifts the midline." Hint: "Peak at x=1, midline y=1, amplitude 2."
15. "tan = sin/cos blows up where cos=0, with period π/B. The walls are its asymptotes." Hint: "Walls are 4 apart, so the period is 4."
16. "Adding functions adds heights — a sine riding on a line." Hint: "Midline y=x/2; amplitude 2; period 4."
17. "The top half of x²+y²=r² is y=√(r²−x²)." Hint: "Centre (0,−1), radius 5; 3-4-5 triangle."
18. "e^{−x²} is the Gaussian bell: rounded top, tails that vanish fast." Hint: "Peak 4; at x=±1 it is 4e^{−1/2} ≈ 2.43."
19. "A wave times a decaying exponential: each swing shrinks." Hint: "Period 4; the envelope shrinks by e^{−1/2} every 2 units."

## 9. UI/UX (UI agent)
**Boot (`app.boot`):** `html[data-boot]` = `loading` → `ok` | `no-ce` | `plain`. No `window.ComputeEngine` → fatal panel: node_modules missing/blocked; run `npm install` / `npm start`. `game = GF.engine.createGame(window.ComputeEngine)`, `store = GF.storage.createStore()`. If `window.MathfieldElement` and no `?plain`: set `fontsDirectory` (absolute), `soundsDirectory=null`, `keypressSound=null`, `plonkSound=null`, `MathfieldElement.computeEngine = game.ce`; `GF.keyboard.install(mathVirtualKeyboard)`; `mf = new MathfieldElement()` with `math-virtual-keyboard-policy="auto"`, `placeholder="\text{type a function of }x"`, `smartFence=true`, mounted in `#formula-slot`. Else `<input id="formula-plain" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="e.g. 2sin(3x)+1">` + tip "write (1/2)x or x/2". Both behind an adapter `{kind, getValue, setValue, focus, onInput, onEnter}` (MathLive Enter: `beforeinput`+`insertLineBreak` → `preventDefault()` + submit; plain: keydown Enter).
Routing (hash): `#levels` (default), `#play/<id>`; locked → redirect to `#levels`. Flags: `?unlock=all`, `?plain`.

**Level select (`#screen-levels`):** title "Graph Fun", tagline "Hit every dot with the shortest line."; grid of `button.level-card[data-level-id]` (`repeat(auto-fill,minmax(150px,1fr))`) showing number, title, family chip, ★★☆ (U+2605/U+2606), "best 873"; locked = dimmed + lock glyph + `disabled` + `data-locked`. Footer "Reset progress" (confirm). Optional "Sandbox" card (no targets; shows length only).

**Game screen (`#screen-game`):** top bar (← Levels, "3/19 · Downhill", best stars). Main column: `.plot` (`aspect-ratio:4/3; width:min(100%, calc((100dvh - 230px)*4/3))`) with canvas (`role="img"`, `aria-label` updated); formula bar ("y =", field, `#lock-in` button disabled unless status ok); `#status` (`aria-live="polite"`; errors in `var(--danger)`); stat chips `#stat-hits` "3/5", `#stat-length` "23.4", `#stat-par` "21.4", `#stat-score` (live preview), `#stat-stars`, wall warning. Side panel (≥860px: grid with 320px side column; else single column): blurb (`<math-span>` rendered by MathLive; raw text without it), Hint button (reveals hint), "show coordinates" checkbox (default on).

**Live pipeline:** `input` → 120 ms debounce → `game.evaluate(level, value, {timeBudgetMs:300})`. Non-ok status → show last good curve at 30% opacity, "—" stats. Warnings: offscreen → "Your graph isn't visible anywhere in view."; saturated → "Too wiggly to measure — length ∞."; slow → "Couldn't compile; using slow evaluation." Setting `mf.value` programmatically may not fire `input` → call evaluate directly afterwards.

**Lock in:** flush debounce; `store.record`; hide virtual keyboard; `<dialog id="result-dialog">.showModal()` with headline "Perfect!" (3★) / "All dots!" (2★) / "Passed" (1★) / "Not yet" (0★), big stars, score, hits, length vs par (%), wall message, "New best!"; buttons Retry, Next level (if unlocked), Levels.

**MathLive styling:** `math-field{font-size:1.35rem;padding:6px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text);--caret-color:var(--accent)}`; `math-field::part(menu-toggle){display:none}`; `.ML__keyboard{--keyboard-accent-color:var(--accent);--keyboard-zindex:50}`. On `mathVirtualKeyboard` `geometrychange`/`virtual-keyboard-toggle` → `body.style.paddingBottom = boundingRect.height+'px'` and scroll the formula bar into view.

**Keyboard (`GF.keyboard.LAYOUT`):** one layer `id:'graph-fun'`, `label:'f(x)'`, `displayEditToolbar:false`; `'[separator-5]'` after the 5th key of each row:
- R1: `{latex:'x'}`, `[7]`,`[8]`,`[9]`, `[/]` (built-in `\frac{#@}{#?}`, ÷), `{latex:'#@^{2}'}`, `{latex:'#@^{#?}'}`, `{latex:'\\sqrt{#0}'}`, `{latex:'\\sqrt[#?]{#0}'}`
- R2: `{latex:'\\pi'}`, `[4]`,`[5]`,`[6]`, `[*]` (`\cdot`, ×), `{latex:'\\sin\\left(#0\\right)',label:'sin'}`, cos, tan (same pattern), `{latex:'\\left|#0\\right|'}`
- R3: `{latex:'\\exponentialE',label:'e'}`, `[1]`,`[2]`,`[3]`, `[-]`, `{latex:'\\exponentialE^{#?}'}`, `{latex:'\\ln\\left(#0\\right)',label:'ln'}`, `{latex:'\\log_{#?}\\left(#0\\right)',label:'log<sub>□</sub>',variants:[{latex:'\\log\\left(#0\\right)',label:'log₁₀'}]}`, `[backspace]`
- R4: `[(]`,`[0]`,`[.]`,`[)]`,`[+]`, `[left]`,`[right]`, `{label:'clear',command:'deleteAll',class:'action small'}`, `[hide-keyboard]`

**Renderer:** ResizeObserver → `canvas.width=round(cssW·dpr)`, `ctx.setTransform(dpr,0,0,dpr,0,0)`, redraw; also redraw on `prefers-color-scheme` change; colours from CSS variables read at draw time. `sx=(x−xMin)/W·w`, `sy=(yMax−y)/H·h`. Grid step = first of [1,2,5,10] ≥ 18px; label step = first of [1,2,5,10] ≥ 36px and a multiple of grid step; axes 1.5px; labels 11px system-ui `--muted`, pinned to edge when the axis is out of view. Order: grid → walls (2px dashed [6,5] `--wall`; solid + glow when crossed) → curve (`paths`, 3px `--curve`, round joins; ghost alpha 0.3) → targets → labels. Target ring radius = r px (2px stroke inside), fill 18% `--target`, centre dot 2.5px; hit → `--hit` 35% fill. Coordinate pill "(2, −1)" (≤2 decimals, U+2212 minus).

**Theme** (`:root`, `color-scheme: light dark`): `--bg #f6f7fb`, `--surface #fff`, `--surface-2 #eef0f6`, `--text #1b1e2b`, `--muted #5d6478`, `--border #d9dce6`, `--accent #4f6bff`, `--curve #4f6bff`, `--target #f59e0b`, `--hit #16a34a`, `--wall #e11d48`, `--star #f5b301`, `--danger #e11d48`, `--grid rgba(27,30,43,.07)`, `--axis rgba(27,30,43,.55)`, `--radius 12px`. Dark: `--bg #0f1117`, `--surface #171a23`, `--surface-2 #1f2330`, `--text #e7e9f0`, `--muted #9aa1b5`, `--border #2a2f3d`, `--accent/--curve #8ea0ff`, `--target #fbbf24`, `--hit #34d399`, `--wall #fb7185`, grid/axis light rgba.

## 10. Node tests (`npm test` → `node --test "test/*.test.js"`; zero installs)
`test/helpers.js`: `const CE = require('@cortex-js/compute-engine')`, the modules, `game = engine.createGame(CE)`.

**formula.test.js** (value at x): `\sin 2x`@0.5=0.8415; `\sin^2 x`@0.5=0.2298; `\sin x^2`@2=−0.7568; `\sin(x)^2`@2=0.8268; `\left|x-2\right|+1`@0.5=2.5; `|x|`,`\operatorname{abs}(x)`,`\mathrm{abs}(x)`@−2=2; `\sqrt[3]{x}`@−8=−2; `\log x`@2=0.30103; `\log_{2}x`@2=1; `\ln x`@2=0.6931; `e^x`,`\exponentialE^{x}`,`\mathrm{e}^{x}`,`\exp(x)`@2=7.3891; `\pi`=3.14159; `2\pi x`@0.5=3.1416; `(x+1)(x-1)`@2=3; `x\sin x`@2=1.8186; `\frac12x`,`x\div 2`@2=1; `x\cdot 2`,`x\times 2`@2=4; `-x^2`@2=−4; `.5x`@2=1; `x\,+\;1\ +\:2`@2=5; `\left[x+1\right]^2`@2=9; `y=x^2`,`f(x)=x^2`,`f\left(x\right)=x^2`@2=4. NaN: `\sqrt{x}`@−1, `\ln x`@−1, `\frac{1}{x}`@0, `\arcsin x`@2, `\cos^{-1}x`@2, `ix`@1. Plain: `2sin(3x)+x^2`@2=3.4412; `sqrt(x)`,`x^(1/2)`@2=1.4142; `abs(x)`@−2=2; `1/x`@2=0.5; `exp(-x^2)`@0.5=0.7788; `sin x`@2=0.9093; `x**2`@2=4; `cos(x)^2`@2=0.1732; `sin^2(x)`@2=0.8268; `3e^(0.5x)`@2=8.1548; `x sin(x)`@2=1.8186; `0.25(x-1)^2-2`@2=−1.75; `log_2(x)`@8=3. Error kinds: `''`→empty; `x+\placeholder{}`,`\sqrt{\placeholder{}}`→incomplete; `x+`,`\frac{}{x}`,`(x`,`\sinc x`,`\binom{x}{2}`→syntax (no throw); `ax`,`x^2y`,`\theta`,`sinx`→variables; `x=3`→equation; `x>2`,`\text{hi}`,`\sin`→not-number; `f(x)`,`xsin(x)`→compile. `fn` never throws.

**curve.test.js** (expected lengths): `3`→16.000; `0.5x`→17.889 (=16√1.25); `x` in [−4,4]×[−5,5]→8√2=11.314; `x` in A→12√2+4=20.971; `100`→16 with ink 0; `\sqrt{-(x-2)^2}`, `\sqrt{-1-x^2}`→16, no paths; `\sin x`→19.394±0.002; `\sin(200x)`≈2036±2% not saturated; `10\sin(100x)`≈6117±2%; `\sin(1000x)`→saturated, Infinity; `\frac{1}{x}`→36.94, penLift 12, 2 pieces, no segment spans x=0; `\tan x`→137.41, penLift 72, 7 pieces; `\lfloor x\rfloor`→28.00 > `x`'s 20.97; `3\operatorname{sgn}(x)`→22; `\sqrt{x}`→16.731 with undefinedGap 8, first path point within 1e-3 of (0,0); determinism (same twice); throwing `fn` treated as NaN; fake `now` (+1ms/call) with `timeBudgetMs:5`→timedOut, Infinity; `clipSegmentT`/`distPointSegment` unit cases.

**scoring.test.js:** hit on/near/beyond r; target beside a jump not hit; wall crossing on-screen counts, above yMax doesn't, break at wall doesn't; `scoreAttempt` table: par→1000/3★; 1.05·par→3★; 1.2·par→2★; 1.3·par all hit→1★ (592); half hits at par→500/1★; one wall→×0.5, ≤1★; Infinity→0/0★.

**levels.test.js:** 15–20 levels, unique ids, n=1..N; viewports exactly 4:3; targets ≥2r inside viewport; ≥4 targets each; each target within r/10 of reference `paths`; LaTeX and text refs agree at x∈{−3.7,−1.3,0.3,1.7,2.9,4.4} (both NaN or |Δ|<1e-9); walls inside viewport.

**gameplay.test.js** (every level): reference LaTeX and text → 3★/1000; par matches §8 ±0.5%; reference uses <10% of maxEvals. `10\sin(100x)`, `5\sin(50x)`, `\sin(200x)` → 0★, score ≤1; `3\sin(10x)` → 0★. Clever polyline on parabola `\left|x\right|-3+\left|x-2\right|+\left|x+2\right|-4` → L 27.744 < par → 3★/1000. Staircase on slope `\frac{1}{2}\lfloor x\rfloor+1` → 4/4, L 23.5 → exactly 1★ (579). Recip `\frac{4x}{x^2+0.01}` → 6/6, crosses wall → 500, 1★.
Alternates that must also 3★: slope `0.5x+1`; downhill `3-2x`; abs `|x-2|-1`; parabola `0.5x^2-3`, `\frac{x^2}{2}-3`; vertex `4-(x-2)^2`, `-x^2+4x`; cubic `0.25x^3-3x`; recip `4x^{-1}`; exp `e^{0.693x}-3`; log `\frac{\ln x}{\ln 2}`, `1.4427\ln x`; period `2\sin(0.785x)`, `2\sin(0.8x)`; cosphase `2\sin(x+0.5708)+1`; tan `\tan(0.785x)`, `-\frac{1}{\tan(\frac{\pi x}{4}+\frac{\pi}{2})}`; linewave `0.5x+2\sin(1.5708x)`; gauss `4\exp(-x^2/2)`, `4e^{-0.5x^2}`; damped `4e^{-0.25x}\cos(1.5708x)`.
Decoys that must be ≤1★ (all measured): flat `2`,`4`,`x`,`0.1x+3`; slope `3`,`1`,`x+1`,`\frac{1}{2}x`; downhill `\frac{1}{2}x+1`,`-x+3`,`-2x`,`3`; abs `-2x+3`,`x-3`,`1`,`\left|x\right|-1`; parabola `\left|x\right|-3`,`2\left|x\right|-3`,`x^2-3`; vertex `x^2-4`,`-x^2+4`,`-3\left|x-2\right|+4`,`\frac{1}{2}x^2-3`; cubic `x`,`-2x`,`\frac{1}{2}x^2-4`,`x^3`,`-(x-2)^2+4`; sqrt `\frac{1}{2}x+1`,`x^2-3`,`\left|x+4\right|-3`,`\sqrt{x}`,`\sqrt{x+4}-3`; recip `x`,`x^3`,`\frac{1}{x}`,`4x`; exp `x-2`,`\frac{1}{2}x^2-2`,`\sqrt{x+6}-3`,`x^3-2`,`\frac{-6}{x-3.5}-3`,`\frac{4}{x}`; log `\sqrt{x}`,`2\sqrt{x}-2`,`\frac{1}{2}x-1`,`\ln x`,`2^x`; sine `\sin x`,`x`,`\frac{1}{4}x^3-3x`,`3\cos x`,`3\sin(2x)`; period `2\sin x`,`2\sin(2x)`,`\sin(\frac{\pi x}{2})`,`3\sin x`; cosphase `2\cos x+1`,`2\cos(x-1)`,`2\sin(x-1)+1`,`2\cos(x+1)+1`; tan `\tan x`,`x`,`\sin(\frac{\pi x}{4})`,`\frac{1}{x}`,`\tan(\frac{x}{2})`; linewave `\frac{x}{2}`,`2\sin(\frac{\pi x}{2})`,`x+2\sin x`,`\frac{x}{2}+2\sin x`; semicircle `4-\frac{1}{5}x^2`,`5\cos(\frac{x}{3})-1`,`-\left|x\right|+4`,`4.84\cos(0.43x)+2.15`; gauss `4-x^2`,`2\cos(\frac{\pi x}{4})+2`,`\frac{4}{1+x^2}`,`4e^{-x^2}`,`2.48\cos(0.87x)+1.3`; damped `4\cos(\frac{\pi x}{2})`,`4e^{-\frac{x}{4}}`,`4e^{-\frac{x}{2}}\cos(\frac{\pi x}{2})`.

**storage.test.js** (fake backend): keeps best score / max stars; unlock chain; `unlockAll`; corrupt JSON resets; throwing backend → in-memory.

## 11. Browser checks (after implementation)
Playwright MCP blocks file:// → serve: `python3 -m http.server 8765 --bind 127.0.0.1 --directory /home/dylan/code/graph-fun` (background), navigate `http://127.0.0.1:8765/index.html` (`.cjs` MIME warning expected).
1. `html[data-boot]=ok`; `ComputeEngine.version` 0.141.0; `MathLive.version.mathlive` 0.111.0; `mathVirtualKeyboard.normalizedLayouts[0].id` = `graph-fun`; no console errors.
2. 19 cards; only first unlocked.
3. `#play/flat`, `GF.app.setFormula('3')` (also type via keyboard) → 4/4, 16.0/16.0, 1000; Enter → dialog 3★; localStorage updated; level 2 unlocks.
4. `10\sin(100x)` → 4/4 but 0★, score 0.
5. Error messages for `x+`, `ax`, `x=3`.
6. `mathVirtualKeyboard.show()`, click sin, x → `\sin\left(x\right)`; screenshot.
7. `?unlock=all#play/tan`: reference → 7/7, no walls, 3★; `x` highlights walls.
8. Resize 390×844: layout OK, `canvas.width === round(clientWidth·dpr)`; screenshot.
9. Dark mode via `browser_run_code_unsafe` → `page.emulateMedia({colorScheme:'dark'})`; screenshot.
10. `?plain`: `2sin(x)` draws.
11. Reload: best scores persist.
file:// smoke test: `chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=10000 --dump-dom "file:///home/dylan/code/graph-fun/index.html?unlock=all#play/sine" | grep -o 'data-boot="[a-z-]*"'` → `data-boot="ok"` (`--enable-logging=stderr` for console/CORS font errors). Finally delete `.playwright-mcp/`.

## 12. Work split
- **Logic agent:** curve.js (§5 + curve tests) → formula.js (§4) → scoring.js → levels.js (§8) → engine.js → storage.js → remaining tests + package.json scripts.
- **UI agent (parallel):** index.html, CSS, render.js (against mock Curve/Level), keyboard.js; then app.js once engine.js lands.
- Risks: Chrome may refuse file:// fonts (cosmetic). Enter→`beforeinput insertLineBreak`, `displayEditToolbar:false`, `deleteAll` keycap, `<math-span>` rendering are confirmed in code but not yet in a browser — verify in §11. Par values depend on the exact grid jitter and branch order in §5 — implement exactly.

## 13. Review amendments (AUTHORITATIVE — these override anything above that conflicts)
A reviewer re-implemented §5–§7 exactly and reproduced all 19 pars to <0.003%. Its prototypes (exact sampler, formula pipeline, decoy/exploit runners) are in `/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/review/` (`sampler.js`, `formula.js`, `decoys.js`, `exploits.js`, `offwall.js`, `ws2.js`) — reuse freely as a reference.

### Must-fix (adopted)
1. **Stars require all dots and no walls.** (Already patched into §0/§7.) 1★ = all hit, no walls, score ≥ 500 (L ≤ √2·par). Update §10: "half hits at par → 500/**0★**"; "one wall → ×0.5, **0★**"; recip `\frac{4x}{x^2+0.01}` → 500/**0★**; **all decoys must be 0★** (not ≤1★). `\frac12\lfloor x\rfloor+1` on slope stays 1★ (ratio 1.314, score 579). Dialog headlines: 3★ "Perfect!", 2★ "Great line!", 1★ "All dots!", 0★ with all dots hit "All dots — but too long", 0★ otherwise "Not yet".
2. **CE silently drops terms after spacing commands** (`x\,+1` → `x`, `x\;+1`, `x\:+1`, `x\!+1`, `x\quad+1` → `x`). In normalise, replace `/\\[,;:!]|\\q?quad|\\enspace|\\thinspace|~|\\ /g` with a plain space. §10 test `x\,+\;1\ +\:2`@2 must then = 5.
3. **§4 step 8 order:** when `isNumber !== true`, try `CE.compile(expr,{mode:'strict',fallback:false})`; if it throws matching /Unknown operator `(\w+)`/ → `compile` "Unknown function “f”."; otherwise → `not-number`. (So `f(x)`, `xsin(x)`, `\mathrm{mod}(x,2)` → `compile`.)
4. **`\binom{x}{2}` does NOT throw** in 0.141.0 (parses to Binomial). Drop it from the §10 syntax list. Keep the try/catch around parse anyway.
5. **`\sqrt{x}` curve test bound:** first path point satisfies `x < 1e-5 && y < 3e-3` (not "within 1e-3 of (0,0)").
6. **Enter on Safari/iOS:** WebKit strips `inputType`; MathLive copies it into `data`. Test `(e.inputType || e.data) === 'insertLineBreak'`.
7. **Walls only block on-screen crossings.** A continuous curve can cross a wall off-screen (billed horizontally), and jump functions (sgn sums) clear walls. This is accepted (everything is still ≥ the Euclidean/Manhattan polyline through the dots, and polylines are legitimate clever play). Fix the wording in §0, level 9/15 blurbs and `whyNot`: walls block crossings *inside the view*. Do NOT count off-screen crossings (it would fail near-correct `\tan(0.785x)`, `\tan(0.8x)`).

### Should-fix (adopted)
- **Interface:** `levels.js` gives EVERY Level `hitRadius` (computed default `(xMax−xMin)/64` unless overridden) and `walls` (`[]` if none). scoring and render read `level.hitRadius` / `level.walls` directly. Keep `GF.levels.hitRadius(level)` as a helper.
- **Cut the SLOW / interpreted fallback entirely.** Any compile failure → `{ok:false, kind:'compile', message:"Can't evaluate this formula."}` (or "Unknown function “f”." per item 3). Remove `SLOW`, `FormulaResult.compiled`, and the `'slow'` warning.
- **Error details:** offending LaTeX for `unexpected-command` is `errors[0].op2?.op1?.string` (`op2.string` is undefined). Guard `errors[0]?.op1?.string` (can be undefined for `\operatorname{}`, `&`). An unbalanced `\left(` reports `unexpected-command \left` → map `\left`/`\right` to "Check your brackets."
- **Warnings (define precisely):** `Evaluation.warning` ∈ `null | 'offscreen' | 'undefined' | 'saturated'`:
  - `'undefined'`: the function is NaN at every sampled point in view (`breakdown.ink===0 && paths.length===0 && undefinedGap ≈ W`) → "Not defined anywhere in view." (e.g. `\sqrt{-1-x^2}`, `\operatorname{sgn}x` without brackets).
  - `'offscreen'`: `paths.length===0` but it is defined somewhere → "Your graph isn't visible anywhere in view."
  - `'saturated'`: → "Too wiggly to measure — length ∞."
  - **UI state mapping:** `status:'empty'` → no curve, stats "—", Lock-in disabled, no message. `'incomplete'` → ghost (last good curve at 30%), muted message, Lock-in disabled. `'error'` → ghost, message in `--danger`, Lock-in disabled. `'ok'` → live curve + stats + live score/stars preview, warning (if any) in muted/amber, Lock-in enabled.
  - In plain mode, if `kind==='variables'` and the found letters are all letters of function names, append "— write functions with brackets, e.g. sin(x)."
- **Sandbox ("Free play"):** defined OUTSIDE `LEVELS` as `GF.levels.SANDBOX = {id:'sandbox', n:0, title:'Free play', viewport:A, targets:[], walls:[], hitRadius:0.25, ...}`. `engine.evaluate` returns `result:null` when `targets.length===0`; UI shows length only, no Lock-in. Route `#sandbox`; card at the end of the level grid (always unlocked). Excluded from the levels tests.
- **Mobile layout:** set CSS var `--kb-h` from `mathVirtualKeyboard.boundingRect.height` on `geometrychange`/`virtual-keyboard-toggle` (0 when hidden); plot width `min(100%, calc((100dvh - 230px - var(--kb-h, 0px)) * 4/3))`. Order in the main column: plot → stat chips → formula bar → status. Keep the plot top visible when the keyboard opens. `#lock-in` gets `pointerdown → preventDefault()` so the math-field doesn't blur (keyboard would hide and the page would shift under the tap).
- **Onboarding / honesty of the metric:** a short "How scoring works" panel (3 lines: hit every dot; shorter line = more points; par = length of our reference answer; off-screen stretches count their width, jumps count their height). Label "par" as "par (reference length)" in the tooltip/legend. Result dialog shows the length split: ink / off-screen & gaps / jumps. Render pen-lifts (jumps) as faint dotted vertical connectors: add `Curve.lifts: Array<[Pt, Pt]>` (start/end of each pen-lift, y clamped to the viewport) produced by `sampleCurve`. §5's "metric = visible ink" is only true for curves fully on screen — fix the wording.
- **Keyboard layout shape:** `id`, `label`, `displayEditToolbar`, `rows` are properties of the LAYOUT object (`VirtualKeyboardLayoutCore`) — not of a nested layer. Add a `[return]` key (it triggers Enter → our submit) in row 4 (e.g. replace `[right]`'s neighbour or extend the row).
- **Level 6 hint:** "Highest dot is the vertex; two steps aside it drops 4."
- **Normalise tests:** Unicode minus, π, ×, ·, ÷, `\mleft`/`\mright`, the `y=` / `f(x)=` / `f\left(x\right)=` prefix, `\left[ … \right]`, every spacing command.

### Optional (adopted)
- Hit state shown by more than colour: hit targets get a filled disc + a check mark; unhit are hollow rings.
- Drawn ring radius `max(r_px, 6)` px (hit rule unchanged).
- Trig levels (12, 13, 14, 15, 16) set `piLabels:true`: coordinate pills show π multiples (k·π/4 within 1e-3, e.g. "(π/2, 3)", "(−3π/2, 3)") — the renderer formats, no logic change.
- **Level 19 viewport → [−1,11]×[−4.5,4.5]** (r = 12/64 = 0.1875), same targets (check they're ≥2r inside: (0,4) is 0.5 below the top → OK). **Recompute par** with the sampler and update the table; re-run its decoys.
- **Level 18: drop (−6,0) and (6,0)** → 7 targets. Recompute nothing else (par is target-independent) but re-run decoys.
- Plain-mode `sinx` hint (see Warnings above).

### Not adopted
- Extra "shorter wins" teaching level (the onboarding panel covers it; keep 19 levels).
