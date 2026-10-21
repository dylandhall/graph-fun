# Graph Fun — Free-play challenges plan (20 random-dot levels)

Prototyped and measured with the real project modules (curve.js, scoring.js, formula.js, CE 0.141.0). Prototype scripts (reference implementations to port): `/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/challenge-plan/` — `gen.js` (dot generator), `bot.js` (bot family search), `fmt.js` (LaTeX formatter), `size.js` (size metric), `verify.js` (real-pipeline scoring), `final.js` (full pipeline), plus `chain.js`, `table.js`, `human.js`. Results: `final-K15-e1.json` (and K10/K20/K25/e2 sweep files). Full generate + search + verify for all 20 levels: **18–20 s**, byte-identical across runs.

User intent: "for the free play, we should have another twenty levels with a number of random dots — it will be a creative challenge to try to get the high score for each one. All the levels currently have one 'right' solution which isn't very creative."

## 1. Decisions (final constants)
```
score = round(1000 · (h/n) · min(1, P/L)^1 · min(1, 15/size) · 0.5^walls)
```
- **P** = dot-to-dot polyline (dots sorted by x, plus horizontal runs xMin→first dot and last dot→xMax). No curve hitting every dot can be shorter. **L** = existing `sampleCurve` length. **Partial hits score** (no all-dots requirement). **e = 1**, **K = 15** free size units.
- **Stars relative to the bot:** 1★ score ≥ 60% of bot; 2★ ≥ 85%; 3★ ≥ bot ("You matched the bot!" / "You beat the bot!" when strictly greater). L = ∞ → 0. size ≥ 1 always (scoring treats missing/invalid as 1).
- Rationale for the size factor: on random dots the shortest line through every dot is the polyline, buildable mechanically as a sum of |x−a| terms; without a size factor every challenge collapses to that recipe.

Sweep (ratios to the bot score):

| config | chain median / max | chain ≥ 0.6 (of 20) | line median (≥0.6) | quad median | A·sin(bx+c)+d median | bot range | chain beats bot |
|---|---|---|---|---|---|---|---|
| K=10 e=1 | 0.34 / 0.47 | 0 | 0.60 (10 levels) | 0.77 | **1.00** (one recipe wins) | 410–857 | 0 |
| **K=15 e=1** | **0.41 / 0.70** | **3** (5-dot levels) | **0.50 (4 trend levels)** | **0.74** | **0.86** | **593–970** | **0** |
| K=20 e=1 | 0.54 / 0.94 | 7 (2★ on 2) | 0.50 | 0.74 | 0.86 | 643–970 | 0 |
| K=25 e=1 | 0.68 / 1.17 | 14 | 0.50 | 0.74 | 0.86 | 643–970 | **3** |
| K=15 e=2 | 0.40 / 0.68 | 2 | 0.50 | 0.75 | 0.81 | 531–941 | 0 |

K=15: at K=10 plain `A\sin(bx+c)+d` (size 10) wins nearly everywhere and a line earns 1★ on half the levels; at K≥20 the mechanical chain earns 2★ (K=25 beats the bot). At K=15 the bot's best formulas are varied: wave+line ×10, sgn-step+wave ×4, exp+line ×2, V+line ×2, two-V ×1, sine ×1.
e=1: simpler to explain, keeps "hit the last dot" worthwhile (completing breaks even at L = P·n/(n−1); e=2 halves that allowance). c12's 8/8 bot: 827 (e=1) vs 684 (e=2). Wiggle spam already harmless: worst `6\sin(5x)` ≤ 0.20 of bot (158 on c17); `10\sin(100x)` ≤ 10 everywhere.

## 2. Calibration (K=15, e=1; every number verified via compile → sample → hits/walls → raw-parse size)
Columns: score (hits/n). flat/line/quad/sine = best found in that family. Chain = c + mx + Σ k|x−xᵢ| over interior dots, size 7n−9.

| id | name | n | view | walls | P | **bot** (hits, size) | flat | line | quad | A·sin(bx+c)+d | full \|x−a\| chain (size) | 6sin(5x) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01 | Scatter | 5 | A | – | 27.0 | **800** (4/5, s13) | 200 | 400 | 600 | 800 | 561 (26) | 53 |
| c02 | Uphill Drift | 5 | A | – | 19.6 | **881** (5/5, s14) | 200 | 600 | 600 | 793 | 550 (26) | 39 |
| c03 | Swell | 5 | A | – | 21.8 | **800** (4/5, s10) | 200 | 400 | 600 | 800 | 517 (26) | 57 |
| c04 | Valley Floor | 6 | A | – | 22.4 | **896** (6/6, s12) | 167 | 500 | 666 | 833 | 424 (33) | 37 |
| c05 | Pocket | 6 | S | – | 15.1 | **833** (5/6, s15) | 167 | 500 | 667 | 667 | 418 (33) | 30 |
| c06 | Zigzag Alley | 6 | A | – | 38.9 | **778** (5/6, s14) | 167 | 333 | 500 | 667 | 397 (33) | 64 |
| c07 | Two Islands | 6 | A | – | 20.0 | **970** (6/6, s14) | 167 | 500 | 667 | 764 | 416 (33) | 33 |
| c08 | Morning Climb | 7 | Q | – | 13.8 | **857** (6/7, s13) | 143 | 429 | 714 | 857 | 370 (40) | 16 |
| c09 | Hilltop | 7 | A | – | 22.2 | **811** (6/7, s14) | 286 | 429 | 610 | 761 | 323 (40) | 42 |
| c10 | The Fence | 7 | A | 4 | 21.8 | **730** (6/7, s17) | 143 | 286 | 345 | 357 | 181 (40, 1 wall) | 20 |
| c11 | Confetti | 7 | W | – | 37.4 | **714** (5/7, s14) | 286 | 429 | 571 | 421 | 348 (40) | 84 |
| c12 | Choppy Water | 8 | A | – | 25.4 | **827** (8/8, s14) | 250 | 375 | 500 | 413 | 299 (47) | 84 |
| c13 | Landslide | 8 | O | – | 19.8 | **875** (7/8, s14) | 125 | 500 | 500 | 625 | 309 (47) | 42 |
| c14 | Archipelago | 8 | A | – | 22.8 | **750** (6/8, s14) | 250 | 375 | 625 | 513 | 306 (47) | 65 |
| c15 | Hurdles | 8 | A | 1.5, 4 | 33.4 | **593** (6/8, s17) | 63 | 250 | 375 | 285 | 76 (47, 2 walls) | 17 |
| c16 | Starfield | 9 | A | – | 34.6 | **643** (8/9, s14) | 111 | 333 | 556 | 591 | 259 (54) | 63 |
| c17 | Switchback | 9 | W | – | 67.9 | **778** (7/9, s14) | 222 | 333 | 444 | 778 | 262 (54) | 158 |
| c18 | Rapids | 9 | S | – | 12.9 | **667** (6/9, s12) | 222 | 444 | 556 | 648 | 261 (54) | 0 |
| c19 | Split Decision | 10 | A | −3 | 35.2 | **706** (8/10, s17) | 100 | 200 | 400 | 256 | 119 (61, 1 wall) | 41 |
| c20 | Pandemonium | 10 | A | −1.5 | 32.6 | **618** (7/10, s17) | 100 | 250 | 400 | 243 | 118 (61, 1 wall) | 37 |

Ratios to bot — flat max 0.40; line median 0.50 (≥0.6 only on 4 trend levels); quad median 0.74; sine median 0.86; 1-decimal family fits ("hand-tuned") median 0.86, beating the full chain on 20/20; chain median 0.41, max 0.70 (never dominant).

Human-style guesses: c02 `2\sin\left(0.8x-1\right)+0.7x-1.8` → 839 (5/5, 2★); c07 `2.8\sin\left(0.4x-1.4\right)-0.3x` → 811 (5/6, 1★); c12 `2.4\sin\left(x-2\right)+0.3x` → 628 (6/8; L>P costs ×0.84); c19 `-\frac{3}{x+3}` → 500 (5/10, asymptote on the wall, 1★); c04 `0.2x^2-0.3x-3.8` → 409; c13 `-0.6x+7` → 125. Spread ≈100 (blind) to ≈840 (careful tuning).

## 3. Formula size (verified against CE 0.141.0)
Parse the normalised source a second time with `ce.parse(source, {strict:false, canonical:false})` and count its MathJSON (canonical rewrites `\frac{x}{2}` → `Multiply(Rational(1,2),x)` and reorders; the raw form is a faithful syntax tree, ~0.1 ms vs 0.55 ms full compile).
```js
var NARY = { Add: 1, Multiply: 1, InvisibleOperator: 1 };
function isNumberJson(j) { return typeof j === 'number' || (j && typeof j === 'object' && !Array.isArray(j) && 'num' in j) ||
  (typeof j === 'string' && /^[+-]?(\d|\.\d|NaN|Infinity)/.test(j)); }
function formulaSize(j) {                       // j = MathJSON (raw, non-canonical)
  if (Array.isArray(j)) {
    var op = j[0], args = j.slice(1), sum = 0;
    if (op === 'Delimiter') return args.length ? formulaSize(args[0]) : 0;          // brackets are free
    if (op === 'Negate' && args.length === 1 && isNumberJson(args[0])) return 1;   // −3 is one number
    for (var i = 0; i < args.length; i++) sum += formulaSize(args[i]);
    if (NARY[op]) return Math.max(0, args.length - 1) + sum;                       // a+b+c = two operators
    if (op === 'Exp' || op === 'Lb') return 2 + sum;                               // exp(a) ≡ e^a; log₂ ≡ log_□ with base
    return 1 + sum;                                                                // functions & binary operators
  }
  if (j && typeof j === 'object') return Array.isArray(j.fn) ? formulaSize(j.fn) : 1;
  return 1;                                                                        // number (any length) or symbol
}
```
Player rule: "Each number (any number of digits), x, π, e, operator (+ − × ÷ ^, including the hidden × in 2x) and function (sin, √, |…|, sgn, …) counts 1. Brackets are free. A minus sign in front of a number is part of the number."

| formula | size | formula | size |
|---|---|---|---|
| `3`, `-3`, `x`, `\pi`, `123456.789` | 1 | `\left\|x-2\right\|-1` = `abs(x-2)-1` = `\|x - 2\| - 1` | 6 |
| `-x` | 2 | `-2x+3` | 5 |
| `x-1`, `2x`, `0.5x`, `x/2`, `\frac{x}{2}`, `x\cdot 2` | 3 | `\frac{1}{4}x^3-3x` / `0.25x^3-3x` | 11 / 9 |
| `\frac{1}{2}x` | 5 | `-(x-2)^2+4` | 8 |
| `x^2`, `x^{2}`, `x^{-1}`, `\frac{4}{x}`, `2^x` | 3 | `\left(x+1\right)\left(x-1\right)` | 7 |
| `e^{x}`, `\exponentialE^{x}`, `\exp(x)` | 3 | `2\sin\left(\frac{\pi x}{4}\right)` | 8 |
| `\sqrt{x}`, `\sin x`, `\sin\left(x\right)`, `\ln(x)`, `\lfloor x\rfloor` | 2 | `4e^{-\frac{x^2}{2}}` | 10 |
| `\sqrt[3]{x}` / `x^{\frac{1}{3}}` | 3 / 5 | `\sqrt{25-x^2}-1` | 8 |
| `\sin^2 x`, `\cos^{-1}x`, `-x^2` | 4 | `2\sin\left(3x+1\right)+0.5x-1` | 14 |
| `\left(\left(x\right)\right)` | 1 | `\operatorname{sgn}\left(x-4\right)` | 4 |
| `x\,+\;1`, `f(x)=x^2`, `y=x^2` | 3 | `\frac{1.5}{x-2}+0.3x-1` | 11 |
| `x+1+2` | 5 | `0.1x^3+0.2x^2-1.3x+2` | 17 |
| `\log_{3}\left(x\right)`, `\log_{2}\left(x\right)` (Lb rule) | 3 | `1.5\|x+3\|-2\|x-1\|+0.5\|x-4\|+1` | 22 |

Integration in `compile()`, inside the existing push/pop scope, after a successful compile:
```js
var size; try { size = formulaSize(ce.parse(source, { strict: false, canonical: false }).json); } catch (e) { size = NaN; }
if (!(size >= 1)) size = formulaSize(expr.json);
return { ok: true, fn: ..., source: source, pretty: ..., size: size };
```
Accepted edge: `\sum_{k=1}^{9}\left|x-k\right|` is size 9 and compiles — creative play; fixed structures can't fit random dots. `\bmod`/`mod` don't compile.

## 4. Generator (`tools/gen-challenges.js`; port of prototype `gen.js`, plain node)
- PRNG mulberry32 (code in gen.js). Seed per level = `20261018 + 7919·n` (n = 1..20). Gaussian noise via Box–Muller from the same stream. No `Math.random`.
- Viewports (all 4:3; r = W/64): A=[−8,8]×[−6,6] r 0.25; S=[−4,4]×[−3,3] r 0.125; Q=[0,12]×[0,9] r 0.1875; W=[−10,10]×[−7.5,7.5] r 0.3125; O=[−2,14]×[−3,9] r 0.25.
- s = W/16, margin m = 3r, gap = 0.8·s, cx/cy = centre, hw = W/2 − m, hh = H/2 − m.
- x: stratified (one per equal bin of [xMin+m, xMax−m] at bin start + U(0.1,0.9)·bin). `clusters`: k centres x0 + bw·(j + U(0.3,0.7)), dots centre ± U(−1,1)·1.6s. Round to 0.1, sort.
- Walls: midpoint (rounded to 0.5) of gaps between dots i−1, i for i = 2..n−2 (≥2 dots each side) where gap ≥ 1.6s, midpoint within 0.7·hw of cx, ≥ 3r from both neighbours; pick randomly.
- y by layout (t = (x−cx)/hw; clamp to cy ± hh; round 0.1): scatter U(−1,1)·hh; trend dir·0.7hh·t + N·0.22hh; wave 0.65hh·sin(π·cyc·(t+1)+φ) + N·0.12hh, cyc∈U(1,2); wavetrend dir·0.45hh·t + 0.45hh·sin(1.4π·cyc·(t+1)+φ) + N·0.1hh; bowl dir·hh·(1.6(t−t0)²−0.65) + N·0.15hh; zigzag ±flip·U(0.3,0.9)·hh alternating + dir·0.3hh·t; clusters cluster y + tilt·(x − cluster mean x) + N·0.3s, tilt ±U(0.4,1.2); steps ∓flip·0.5hh around the wall + N·0.3hh.
- Rejection (retry on same stream): dots ≥ 3r from edges; x-gaps ≥ 0.8s; neighbour |Δy/Δx| ≤ 5; pairwise distance ≥ 3r; walls ≥ 3r from every dot's x with dots both sides and a dot between two walls; max constant hits ≤ 1 if n ≤ 6 else ≤ 2 (sliding 2r window on y); max line hits ≤ ⌊n/2⌋ (+1 for trend) — lines through every dot pair centres and their ±0.98r band edges, perpendicular distance ≤ r.
- Dot counts: 5 5 5 6 6 6 6 7 7 7 7 8 8 8 8 9 9 9 10 10.

SPECS (id, title, n, view, layout, extra):
```
c01 Scatter 5 A scatter | c02 Uphill Drift 5 A trend dir+1 | c03 Swell 5 A wave | c04 Valley Floor 6 A bowl dir+1
c05 Pocket 6 S scatter | c06 Zigzag Alley 6 A zigzag | c07 Two Islands 6 A clusters k2 | c08 Morning Climb 7 Q trend +1
c09 Hilltop 7 A bowl −1 | c10 The Fence 7 A steps walls1 | c11 Confetti 7 W scatter | c12 Choppy Water 8 A wavetrend +1
c13 Landslide 8 O trend −1 | c14 Archipelago 8 A clusters k3 | c15 Hurdles 8 A scatter walls2 | c16 Starfield 9 A scatter
c17 Switchback 9 W zigzag dir+1 | c18 Rapids 9 S wave | c19 Split Decision 10 A steps walls1 | c20 Pandemonium 10 A scatter walls1
```
Blurbs by layout: scatter "No pattern at all. How many dots can one short formula catch?"; trend+ "The dots drift uphill, with a wobble."; trend− "Everything slides downhill, unevenly."; wave "Something wavy is going on."; wavetrend "Waves on a slope."; bowl+ "The dots sag in the middle."; bowl− "The dots bulge in the middle."; zigzag "Up, down, up, down…"; clusters "The dots huddle in groups."; steps "A red wall splits the dots in two. Crossing it inside the view halves your score, so make your graph jump."; scatter+walls "Random dots and red walls. Crossing a wall inside the view halves your score."

### Baked data from the prototype (P computed, not stored)
```js
{ id: 'c01', title: 'Scatter', vp: A, seed: 20268937, walls: [], targets: [[-6.9, 0], [-2.4, 1.2], [-0.1, -3.7], [2.8, -4.3], [4.7, 5.1]], par: 27.022, bot: { score: 800, hits: 4, size: 13, length: 25.929, latex: '0.06e^{1.14x}-0.58x-3.92' } },
{ id: 'c02', title: 'Uphill Drift', vp: A, seed: 20276856, walls: [], targets: [[-5.8, -4.3], [-4.1, -3], [0.6, -2.2], [3.5, 2.8], [5.2, 1.9]], par: 19.611, bot: { score: 881, hits: 5, size: 14, length: 22.271, latex: '1.87\\sin\\left(0.76x-0.98\\right)+0.71x-1.82' } },
{ id: 'c03', title: 'Swell', vp: A, seed: 20284775, walls: [], targets: [[-5.5, -2.7], [-3.3, 0.5], [0.9, 2.4], [2.3, -1.7], [4.8, -3.8]], par: 21.790, bot: { score: 800, hits: 4, size: 10, length: 21.795, latex: '2.69\\sin\\left(0.51x+2.25\\right)-1.05' } },
{ id: 'c04', title: 'Valley Floor', vp: A, seed: 20292694, walls: [], targets: [[-6.8, 4.8], [-4, 0.4], [-1.3, -2.9], [1.7, -4], [4.1, -1.4], [6.2, 1]], par: 22.402, bot: { score: 896, hits: 6, size: 12, length: 25.012, latex: '1.2\\left|x-0.2\\right|-0.2x-5.2' } },
{ id: 'c05', title: 'Pocket', vp: S, seed: 20300613, walls: [], targets: [[-3.4, -2], [-1.5, 2], [-0.4, 1.3], [0.8, -2.3], [1.7, -0.4], [2.6, -1.6]], par: 15.129, bot: { score: 833, hits: 5, size: 15, length: 13.578, latex: '-1.44\\left|x+1.5\\right|-0.69\\left|x-2.15\\right|+4.56' } },
{ id: 'c06', title: 'Zigzag Alley', vp: A, seed: 20308532, walls: [], targets: [[-6.2, -1.8], [-4.1, 4.5], [-1.1, -4.3], [1.6, 2.5], [2.7, -3], [5.1, 1.8]], par: 38.930, bot: { score: 778, hits: 5, size: 14, length: 41.720, latex: '5.64\\sin\\left(0.713x-1.899\\right)-0.303x-2.529' } },
{ id: 'c07', title: 'Two Islands', vp: A, seed: 20316451, walls: [], targets: [[-6.5, 4.4], [-4.9, 2.3], [-4.1, 1.3], [0.8, -3], [1.7, -2.2], [3.9, -0.5]], par: 20.024, bot: { score: 970, hits: 6, size: 14, length: 20.638, latex: '2.76\\sin\\left(0.42x-1.42\\right)-0.29x-0.12' } },
{ id: 'c08', title: 'Morning Climb', vp: Q, seed: 20324370, walls: [], targets: [[1, 2.5], [3.5, 3], [4.5, 3.3], [5.7, 5.2], [7.6, 5], [8.9, 6.2], [10.5, 7]], par: 13.809, bot: { score: 857, hits: 6, size: 13, length: 13.572, latex: '3.202e^{-0.353x}+0.714x-0.504' } },
{ id: 'c09', title: 'Hilltop', vp: A, seed: 20332289, walls: [], targets: [[-6, -1.7], [-3.4, 2], [-2, 3.6], [-0.4, 3.8], [2.7, 3.2], [4.1, 0.5], [5.7, -2.5]], par: 22.160, bot: { score: 811, hits: 6, size: 14, length: 23.416, latex: '3.81\\sin\\left(0.43x+1.45\\right)-0.13x+1.24' } },
{ id: 'c10', title: 'The Fence', vp: A, seed: 20340208, walls: [4], targets: [[-6.3, -1.9], [-4.8, -3.4], [-2, -5.2], [-0.7, -4.4], [2.7, -1.6], [4.9, 3.5], [6.7, 3.1]], par: 21.779, bot: { score: 730, hits: 6, size: 17, length: 22.555, latex: '1.74\\operatorname{sgn}\\left(x-4\\right)+2.22\\sin\\left(0.42x-0.74\\right)-0.64' } },
{ id: 'c11', title: 'Confetti', vp: W, seed: 20348127, walls: [], targets: [[-7, -3.8], [-5.3, 2.3], [-2.8, -6.3], [-0.8, -3.1], [2.4, -3.7], [5.3, 3], [8.8, 3.5]], par: 37.354, bot: { score: 714, hits: 5, size: 14, length: 28.555, latex: '1.96\\sin\\left(0.86x+2.71\\right)+1.02x-4.11' } },
{ id: 'c12', title: 'Choppy Water', vp: A, seed: 20356046, walls: [], targets: [[-6.4, -3.4], [-4.9, -3.3], [-2.3, 2], [-0.6, -1.2], [1.4, -0.8], [2.9, 2.9], [4.5, 2.8], [6.2, -0.1]], par: 25.427, bot: { score: 827, hits: 8, size: 14, length: 30.757, latex: '2.42\\sin\\left(1.01x-2.05\\right)+0.28x+0.17' } },
{ id: 'c13', title: 'Landslide', vp: O, seed: 20363965, walls: [], targets: [[-0.6, 7.9], [1, 5.8], [3.2, 4.6], [4.6, 2.7], [7.6, 3.2], [8.8, 1.9], [10.5, 0.1], [12.2, 0.6]], par: 19.765, bot: { score: 875, hits: 7, size: 14, length: 19.443, latex: '0.86\\sin\\left(1.07x-0.25\\right)-0.45x+5.72' } },
{ id: 'c14', title: 'Archipelago', vp: A, seed: 20371884, walls: [], targets: [[-6.3, 1.2], [-4.8, 2.6], [-3.7, 3.5], [0.5, 2.6], [1.6, 3.5], [2.4, 4.6], [3.7, -1.2], [5.5, -0.2]], par: 22.753, bot: { score: 750, hits: 6, size: 14, length: 18.960, latex: '1.03\\sin\\left(0.87x-1.68\\right)+0.25x+3.49' } },
{ id: 'c15', title: 'Hurdles', vp: A, seed: 20379803, walls: [1.5,4], targets: [[-6.5, -2.2], [-4.1, 0.5], [-2.8, -2.4], [-1.1, 2.3], [0.3, -1.4], [2.6, -4.9], [4.9, 0.4], [6.7, 4.9]], par: 33.357, bot: { score: 593, hits: 6, size: 17, length: 37.224, latex: '-3.6\\operatorname{sgn}\\left(x-1.5\\right)+2.2\\sin\\left(1.6x-3.1\\right)-3.6' } },
{ id: 'c16', title: 'Starfield', vp: A, seed: 20387722, walls: [], targets: [[-6.8, -4.1], [-5, 2], [-2.8, -0.2], [-1, -1.4], [0.4, 3.9], [1.4, 2.8], [3.5, -2.9], [4.8, 1], [6.6, -1.7]], par: 34.634, bot: { score: 643, hits: 8, size: 14, length: 47.890, latex: '3.464\\sin\\left(1.238x+0.668\\right)+0.118x+0.254' } },
{ id: 'c17', title: 'Switchback', vp: W, seed: 20395641, walls: [], targets: [[-8.4, 4], [-6.3, -3.6], [-4.7, 1.8], [-2.6, -5.3], [-0.3, 4.2], [2.1, -2.7], [3.7, 4.8], [5.7, -3.7], [7.6, 5.6]], par: 67.894, bot: { score: 778, hits: 7, size: 14, length: 62.147, latex: '7\\sin\\left(0.8x-3\\right)+0.1x+3.9' } },
{ id: 'c18', title: 'Rapids', vp: S, seed: 20403560, walls: [], targets: [[-3, -0.3], [-2.3, 0.2], [-1.8, 1.3], [-0.8, 0.4], [-0.3, -0.1], [1, -1.5], [1.4, -0.6], [2.7, 1.7], [3.5, 0.1]], par: 12.947, bot: { score: 667, hits: 6, size: 12, length: 12.410, latex: '1.4\\left|x-1\\right|+0.4x-1.8' } },
{ id: 'c19', title: 'Split Decision', vp: A, seed: 20411479, walls: [-3], targets: [[-6.2, 0.7], [-4.7, 2.1], [-3.8, 3.2], [-1.9, -5.2], [-1, -1.6], [0.8, 2.3], [2.3, -3], [3.5, -0.7], [4.9, -1], [6.7, -2.7]], par: 35.202, bot: { score: 706, hits: 8, size: 17, length: 31.770, latex: '-1.72\\operatorname{sgn}\\left(x+3\\right)+1.39\\sin\\left(1.56x+1.41\\right)+0.15' } },
{ id: 'c20', title: 'Pandemonium', vp: A, seed: 20419398, walls: [-1.5], targets: [[-6.7, 3.8], [-4.5, 3.1], [-3.5, 2.2], [-2.6, 2.4], [-0.6, -4.5], [0.4, -5], [2.2, 3.1], [3.6, 0.4], [5, -0.3], [7, 3.7]], par: 32.554, bot: { score: 618, hits: 7, size: 17, length: 29.641, latex: '-1.2\\operatorname{sgn}\\left(x+1.5\\right)+2.7\\sin\\left(0.8x+1.1\\right)+3.5' } },
```
Dots depend on the exact PRNG call order in gen.js (per attempt: x positions, wall picks, then φ, cyc, t0, flip, then cluster y/tilt/mean x, then y values). Port exactly or re-bake what the shipped generator produces; a test pins generator output to baked data.

## 5. Bot search (port prototype bot.js + fmt.js + final.js)
- Families (nominal size), linear in coefficients for fixed shape params: const 1, line 5, quad 11, cubic 17, quartic 23, V `a|x−h|+k` 8, sin `A\sin(bx+c)+d` 10, sin+line 14, exp `ae^{bx}+c` 9, exp+line 13, Gaussian bump 14, V+line 12, two-V 15. Wall levels add `\frac{a}{x-w}+c` 7, +line 11, `A\tan(bx+c)+d` with asymptote on the wall 10, `d\operatorname{sgn}(x-w)+c` 8, +line 12, +sine 17, +quad 18. Two-wall levels add rat2 13, rat2+line 17, tan2 10, step2 15, step2+line 19.
- Shape grids: b ∈ [0.15,4] step 0.01 scaled by 16/W; exp b ∈ [−1.5,1.5] step 0.02; knots at dot x's and midpoints; Gaussian centres every 0.25, widths {0.5,1,2,4,8,16}.
- RANSAC: for each shape and each k-subset of dots (all if C(n,k) ≤ 150, else 150 from `mulberry32(42)`), solve the k×k system; hits estimated by |res|/√(1+f′²) ≤ 0.9r; least-squares refit on the hit set; dedupe by (hit set, shape); rank with a 400-segment quick length; real-sample the top 150 per family; keep shortest L per (hits, walls).
- Refine top 10 overall + top 2 of const/line/quad/sin/sin+line/cubic by coordinate search (relative steps 0.05, 0.01, 0.003); objective = real score + 0.5·Σ clamp(1 − |res|/r, −1, 0.6) (centring bonus → robust to rounding).
- Format to 1/2/3 decimals (coefficient 1 elided, `+-` folded), verify each via the real pipeline, keep fewest decimals within 2 points of best. Record `{score, hits, size, length, latex}` from the verified run.
- CLI: `node tools/gen-challenges.js` prints a table; `--write` rewrites `js/challenges.js`; `--only c07`. Export `{SPECS, VIEWPORTS, mulberry32, generateDots, validateDots, maxConstHits, maxLineHits, chainLatex}` behind `require.main === module`. Uses formula/curve/scoring directly (same path as engine.evaluate), no dependency on levels.js.

## 6. Data shape and placement
- New generated `js/challenges.js` (UMD, `GF.challenges`, no deps, GENERATED header): `DATA: [{id, title, layout, seed, viewport, walls, targets, blurb, bot:{score,hits,size,length,latex}}]`. Script tag in index.html before `js/levels.js`.
- `js/levels.js`: deps `{challenges}` (node: `try { require('./challenges.js') } catch → null`; browser: `root.GF.challenges`). Every level gets `kind: 'lesson' | 'sandbox' | 'challenge'`. `buildChallenge(d, n)` → `{id, n, kind:'challenge', title, family: n+' dots'(+' · 1 wall'), blurb, hint:'', whyNot:'', ref:{latex:'',text:''}, viewport, targets, walls, hitRadius: W/64, piLabels:false, layout, seed, bot}`. Export `CHALLENGES`, `getChallenge(id)`; `getLevel` stays lessons-only.
- Ids `c01`–`c20` are stable storage keys. Never re-bake dots under an existing id.

## 7. Logic changes
- `js/formula.js`: export `formulaSize(json)`; `compile()` success gains `size:number`; `normalizeInput` maps plain `sgn(` → `\operatorname{sgn}(` via `/(^|[^\\A-Za-z{])sgn(?=\s*\()/g → '$1\\operatorname{sgn}'` (plain `sgn(x-4)` otherwise gives "Unknown function “Sgn”").
- `js/scoring.js`: `CHALLENGE = {freeSize:15, lengthExponent:1, wallPenalty:0.5, oneStar:0.6, twoStar:0.85}`; `polylinePar(targets, vp)`; `challengeScore({hitCount,total,length,par,size,wallsCrossedCount})` → `{score, lengthFactor, sizeFactor, wallFactor}`; `challengeStars(score, botScore)` → 0..3 (0 if either ≤ 0); `evaluateChallenge(curve, level, par, size)` → AttemptResult fields (`ratio = L/P`, stars vs bot) + `{kind:'challenge', size, lengthFactor, sizeFactor, wallFactor, bot, beatBot: score>bot, matchedBot: score===bot}`.
- `js/engine.js`: `par(level)` → `scoring.polylinePar(...)` for challenges (cached); `evaluate` uses `evaluateChallenge(curve, level, par(level), formula.size)` for challenges, `evaluateAttempt` otherwise.
- `js/keyboard.js`: `\left|#0\right|` key gets `variants:[{latex:'\\operatorname{sgn}\\left(#0\\right)', label:'sgn'}]`, tooltip "|x| (long-press for sgn)".
- `js/storage.js`: no change (challenge stars are monotone in score; display stars recomputed from bestScore via `challengeStars`).
- `render.js`: no change.

## 8. UI (index.html, css/style.css, js/app.js)
- **Level select:** after the lesson grid, `<section class="freeplay"><h2>Free play</h2>` + "20 random-dot challenges with no single right answer. Hit as many dots as you can with a short formula and a short line, and try to beat the bot." `<div id="challenge-grid" class="level-grid">`: sandbox card first, then 20 cards (thumbnail: dots, walls, best curve once bestScore > 0 with per-dot hit colours from a `hits` array in `thumbCache`; "C3" badge + title; chip "8 dots · 2 walls"; footer ★ vs bot + "734 / bot 800" or "bot 800" unplayed). Progress summary chip "Challenges ★ x/60 · beat the bot k/20". Cards → `#play/c03`.
- **Routing:** in `route()` under `play/`, try `GF.levels.getChallenge(id)` first → `showGame(ch)`; always unlocked.
- **Game screen (challenge):** top bar "C3 · Swell" + ★ vs bot. Stats: Dots, Length, Size, Score, Best, Bot (`#stat-size-wrap`, `#stat-best-wrap`, `#stat-bot-wrap`; hide Par, Stars); `.stats.challenge{grid-template-columns:repeat(6,minmax(0,1fr))}`, 3 columns below 480px. Size amber (`.stat.over`, `--warn`) when > 15, tooltip "first 15 are free"; Length amber when L > P, tooltip "dot-to-dot 27.0". Sandbox shows Length + Size (2 cols). Live status: "4 of 5 dots × length 1.00 × size 0.88 = 704 · bot 800" + existing wall warning. Side panel: blurb; `#bot-wrap` "Bot best 800 · ★ 480 · ★★ 680 · ★★★ 800" (Math.ceil of 0.6/0.85 × bot); `#bot-btn` "Show the bot's answer (spoiler)" reveals `#bot-answer` (`<math-span>` of bot LaTeX + "4/5 dots · size 13 · length 25.9"; `<code>` without MathLive); auto-open once best ≥ bot. Hide hint and why panels. `#how-challenge` (instead of lesson list): (1) "**Every dot counts.** Score = 1000 × dots hit ÷ dots; you don't need them all." (2) "**Short formula.** Each number, x, operator and function counts 1 (brackets free). The first 15 are free; above that, score × 15 ÷ size." (3) "**Short line.** If your graph is longer than the dot-to-dot path, score × (dot-to-dot ÷ length). Crossing a red wall in view halves it. ★ 60% of the bot, ★★ 85%, ★★★ match or beat it."
- **Result dialog (challenge):** headline "You beat the bot!" / "You matched the bot!" / "So close!" (2★) / "Nice one!" (1★) / "Locked in" (score > 0) / "Not yet". Stars vs bot, score + "New best!". Facts: Dots; Length ("25.9 · dot-to-dot 27.0 (×1.00)"); Size ("13 · 15 free (×1.00)"); Walls (wall levels); Your best / Bot. Note with next target ("★★ at 680"). `<details id="result-bot">` with bot answer, open when score ≥ bot. Buttons "Next challenge" (c01–c19), Retry, Levels. Keep the length split bar. Reset dialog text mentions challenge bests.

## 9. Tests (node --test)
- `formula.test.js`: every §3 size; `compile(x).size` ≥ 1 for all existing pass cases; equal sizes for `\left(\right)`/`()`, `|x|`/`\left|x\right|`/`abs(x)`, spacing variants; `123456.789x` = 3; sgn normalisation (`sgn(x-4)`, `2sgn(x)` ok; `\operatorname{sgn}(x)`, `\mathrm{sgn}(x)` unchanged).
- `scoring.test.js`: `polylinePar([[-6,0],[6,0]], A)` = 16; `[[3,4],[0,0]]` = 18 (unsorted); `challengeScore` 4/5, L ≤ P, size 13 → 800; L = 2P → 400; size 30 → 400; size 16 → 750; 1 wall → 400; 2 walls → 200; L = ∞ → 0; total 0 → 0. `challengeStars` at bot 800: 480→1, 479→0, 680→2, 679→1, 800→3, 801→3, 0→0; bot 0 → 0. CHALLENGE constants.
- New `test/challenges.test.js`: 20 challenges, ids c01–c20, n 1..20, kind set, not in LEVELS, getChallenge works; viewports exactly 4:3; ≥ 4 distinct viewports; hitRadius = W/64; dot count 5..10 non-decreasing; dots sorted by x; every dot ≥ 2r from edges; x-gaps ≥ 0.8·W/16; pairwise ≥ 3r; walls inside view, ≥ 3r from every dot's x, dots both sides; ≥ 3 levels with walls; `generateDots(SPECS[i])` deep-equals baked targets/walls; **bot reproduces** (`game.evaluate(ch, ch.bot.latex)` ok, |score − bot.score| ≤ 1, same hits and size); **flat low** (maxConstHits ≤ 1 (n ≤ 6) or 2; 1000·hits/n < 0.45·bot; `evaluate(ch,'0')` matches analytic); **chain not dominant** (`chainLatex(ch)` < 0.75·bot on all, < 0.6·bot on ≥ 15); **wiggles** (`10\sin(100x)` ≤ 15, `6\sin(5x)` < 0.25·bot everywhere); maxLineHits within cap.
- `gameplay.test.js`: `game.par(c01)` ≈ 27.022; challenge result shape (kind, size, factors, stars vs bot, beatBot/matchedBot); lessons unaffected; sandbox still `result:null`.

## 10. Work order
- Agent A (logic): formula.js size + sgn + tests → scoring.js challenge functions + tests → engine.js branches → tools/gen-challenges.js (port, `--write`, check vs §4: dots identical, bot ±2; generated file is source of truth) → levels.js CHALLENGES, index.html script tag, keyboard.js sgn variant → test/challenges.test.js → package.json `"gen:challenges": "node tools/gen-challenges.js"` → README "Free play challenges" section.
- Agent B (UI, after engine.js branch lands): index.html + CSS, app.js §8, then Playwright checks over http (21 free-play cards; `#play/c03` 5 dots + 6 chips; `setFormula(bot latex)` → bot score, Enter → "You matched the bot!"; c10 with `x` → wall halving; `?plain` with `sgn(x-4)`; best persists after reload; 390×844 stats 3×2; dark mode; delete `.playwright-mcp/`).
- Risks: if sampler/compile behaviour changes, re-run the generator (20 s) and re-bake bot numbers (dots don't depend on the engine). `\operatorname{sgn}` inside `<math-span>` unverified in a browser. 3★ needs bot-level play — intended (answer revealable).

## 11. Review amendments (AUTHORITATIVE — override anything above that conflicts)
A reviewer re-verified against the current code (post-QA): all 20 baked bot formulas reproduce exactly (score, hits, size, length to 0.001); P matches; gen.js reproduces the baked dots; all §3 size rows match; every level meets the dot rules; `\operatorname{sgn}` renders in `<math-span>`. Reviewer scripts: `/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/challenge-review/` (`verify-bot.js`, `size-table.js`, `size-break.js`, `missed.js`, `lookup.js`, `pack.js`, `rounding.js`, `dots.js`).

### A. Challenges allow only ordinary functions (blocks lookup-table / packed-number exploits)
Lists indexed by `floor(…)` (`(0,0,1.2,…)_{floor(0.43x+4.48)}`, size 15, beats the bot on 5 levels) and packed numbers with `\bmod`/floor beat the bot with no maths. (§3's claim that `\bmod` doesn't compile is wrong — it does, as do `At`, `If`, `Clamp`, `Mean`, `Fract`, `Round`, `\int`, `\frac{d}{dx}`, `\lim`, plain `floor(`/`round(`/`ceil(`.)
- `formula.js`: while walking the raw MathJSON for size, also collect operator heads and symbols; the compile success result gains `ops: string[]` (unique operator heads) and `symbols: string[]`.
- `GF.formula.CHALLENGE_OPS` allowlist: `Add, Subtract, Negate, Multiply, InvisibleOperator, Divide, Power, Square, Sqrt, Root, Abs, Sign, Exp, Ln, Log, Lb, Sin, Cos, Tan, Sec, Csc, Cot, Arcsin, Arccos, Arctan, Sinh, Cosh, Tanh, Max, Min, Delimiter, Apply, InverseFunction` (+ any raw-parse heads these produce, e.g. `Rational`/`Half` for `\frac` of numbers if the raw parse emits them — verify with all 20 bot formulas, all lesson references and alternates). Allowed symbols: `x, Pi, e, ExponentialE` (+ number literals).
- `engine.evaluate` on a challenge: if any op/symbol is outside the allowlist → `status:'error'`, `formula.kind:'not-allowed'`, message "Challenges use ordinary functions — no floor, mod, lists, sums or if." (list the offending names in `detail`). Lessons and the sandbox are unrestricted.
- This removes the §3 "accepted edge" about `\sum`.
- Tests: the list-lookup and packed-number exploits (from reviewer `lookup.js`/`pack.js`), `\sum`, `\lfloor`, `\bmod`, `\operatorname{If}` are rejected on challenges and still accepted in lessons.

### B. sgn input that actually works with MathLive
MathLive's smartFence turns typed `2sgn(x-4)` into `2sgn\left(x-4\right)`. Normalise regex: `/(^|[^\\A-Za-z{])(?:sgn|sign)(?=\s*(?:\\left\s*)?\()/g → '$1\\operatorname{sgn}'`. In app.js add `sgn: '\\operatorname{sgn}'` to the existing MathLive `inlineShortcuts` override (next to `log`). Tests: `sgn(x-4)`, `2sgn\left(x-4\right)`, `sign(x)`, `\operatorname{sgn}(x)`, `\mathrm{sgn}(x)`.

### C. The bot's baked answer must be its true best, and the reveal is gated
- Bake the HIGHEST verified score (tie → fewer decimals), then hill-climb: nudge each coefficient by ±1 in its last printed digit, keep any change that raises the score, repeat until none helps. Record the result.
- Also enable step families (step, step+line, two-step) on ALL levels in the bot (reviewer found a sgn step + line, size 12, scores 667 > 643 on c16). Deliberately do NOT add the triangle wave `A\arcsin(\sin(bx+c))+d` or `\max`/`\min` of lines — those are left for players to discover (they beat the bot on c04/c06/c18). Never describe the bot score as "the best possible"; call it "the bot's score" / "Beat the bot".
- Bake `bot.family` (short human label, e.g. "wave + line", "V + line", "step + wave", "exponential + line") alongside `{score, hits, size, length, latex}`.
- Test: for every challenge, no single ±1-last-digit nudge of the baked bot formula beats `bot.score` (keep it fast).
- Reveal gating (app.js): the bot's formula is shown only once the player's best ≥ the 2★ threshold (computed from stored bestScore; no storage change). Before that, show a non-spoiler line: "Bot: {family} · {hits}/{n} dots · size {size}". After a score ≥ bot, show it open automatically.

### D. Challenge attempts rank by score only
Stars are bot-relative, so if a bot is ever re-baked, stored stars become inconsistent. app.js records challenge attempts with `stars: 0` (`store.record(id, {score, stars: 0, formula})`) so storage ranks them by score; displayed stars are ALWAYS recomputed: `scoring.challengeStars(bestScore, level.bot.score)`. Storage test: score-only ranking when stars are 0.

### E. Shared thresholds
`scoring.challengeThresholds(botScore)` → `{one, two, three}` with `one = Math.ceil(0.6·bot − 1e-9)`, `two = Math.ceil(0.85·bot − 1e-9)`, `three = bot`. `challengeStars` uses them; the UI displays the same numbers. Test.

### F. Size metric consistency
- Count `Max`/`Min` like `+` (n-ary: args−1 operators + args).
- Count `Apply(InverseFunction(f), a)` (from `\cos^{-1}x`) as one function: same size as `\arccos x`.
- Log-base inconsistencies (`\log_{10}x`=2 vs `\log_3 x`=3) are accepted (minor).

### G. UX / docs
- Wall-level blurbs (c10, c15, c19, c20) mention `sgn`: "…make your graph jump — try sgn (long-press the |x| key)".
- Level select: a "Free play" section contains the **Sandbox** card (renamed from "Free play"; moved out of the lesson grid) followed by the 20 challenge cards. Summary chip: "Challenges ★ x/60 · bot beaten k/20" where beaten = score > bot (strict); matched (=) still gives 3★.
- Use **5 stat chips** for challenges: Dots, Length, Size, Score, Bot (your best is in the top bar) — keeps the existing 5-column grid. Sandbox shows Length + Size.
- `tools/gen-challenges.js --write` refuses to change the dots/walls of an existing id (ids are storage keys); bot data may change.
- README: update "Free play (the last card)" and "most stars, then score" wording; add a "Free play challenges" section (scoring factors, size rule, allowed functions, bot target, `npm run gen:challenges`).

### H. Contracts for the UI (in addition to §6–§8)
- `FormulaResult` (ok) gains `size:number`, `ops:string[]`, `symbols:string[]`. New error kind `'not-allowed'` (challenges only).
- Challenge `Level`: `{id, n, kind:'challenge', title, family /* "8 dots · 2 walls" */, blurb, viewport, targets, walls, hitRadius, piLabels:false, layout, seed, bot:{score, hits, size, length, latex, family}}`. Lessons get `kind:'lesson'`, SANDBOX `kind:'sandbox'`.
- `GF.levels.CHALLENGES`, `GF.levels.getChallenge(id)`; `getLevel` stays lessons-only.
- Challenge `AttemptResult`: existing fields (`hits, hitCount, total, walls, wallsCrossedCount, length, par /*=P*/, ratio, score, stars /*vs bot*/, saturated`) + `{kind:'challenge', size, lengthFactor, sizeFactor, wallFactor, bot /*score*/, beatBot, matchedBot, thresholds:{one,two,three}}`.
- `GF.scoring`: `CHALLENGE`, `polylinePar`, `challengeScore`, `challengeThresholds`, `challengeStars`, `evaluateChallenge`.
- Sandbox Evaluation: `result:null` (unchanged); `formula.size` available for the Size chip.
