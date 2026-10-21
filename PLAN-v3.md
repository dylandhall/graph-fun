# Graph Fun — v3 plan: hints, gentler length weighting, slider variables a–d

Status: **planned and prototyped**. Every number below was measured with the real modules (CE 0.141.0, MathLive 0.111.0), using a working copy of the project in which all of the logic changes are already implemented and **108/108 tests pass** (83 today, 25 new or changed). That copy is the reference implementation, so port it rather than rewriting it:
`/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/v3-plan/` (§K lists its contents).

User request (verbatim): *"don't show the initial suggested formula right away, it's good but should be optional to display. that can be hint 1, then your other hint can be hint 2 / we need to weight the line length a bit less, there are cases where a slightly longer line gets more points, but a lower score. in general as long as a formula isn't scanning far too much space getting additional points should almost always be a higher score. it's very disappointing to work very hard to get more points but find your score is actually lower! / a system to use variables, with a slider to tweak the value, eg a - d and then you can use them in the formula, and tweak the slider to see the effect. a step and offset value should be added by each"* ("points" here means dots hit.)

PLAN.md §13 and PLAN-challenges.md §11 remain authoritative for everything this plan doesn't change.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Hints | Lessons open with the title and a neutral prompt only. **Hint 1** = family chip + blurb, **Hint 2** = the existing hint. Revealed hints are stored per level (`hints: 0–2`). Hint 1 shows automatically once the level has ≥1★. Level cards show `y = ?` instead of the family until ≥1★. The sandbox and challenges are unchanged. |
| Length factor | **g(r) = 1 for r ≤ 1, else exp(−((r − 1)/2)²)**, with r = L/par in lessons and r = L/P (dot-to-dot length) in challenges. `LENGTH = {scale: 2, power: 2}`. |
| Guarantee | g(1.5) = 0.939 > 0.9, so with ≤ 10 dots, one more dot **always** scores more while the new line is ≤ 1.5 × the reference (the bound actually holds up to 1.649 at n = 10). |
| Lesson stars | Still tied to L/par: every dot, no wall, and ≤ 1.05 / 1.25 / **1.415** × par. Points reward dots; stars reward a short line. Unlocking stays at ≥1★. |
| Challenges | Same g with ref = P; the size factor min(1, 15/size) and the wall halving stay. The bots were re-baked (dots unchanged) and now score 618–1000 (was 614–974). New `beatsBot`: 1000 against a 1000 bot counts as beating it. |
| Stored progress | A scoring-rules version goes into storage (`rules: 2`). On boot, every stored best is re-scored once through the engine (about 110 ms in Node for 39 bests). Stars never drop. |
| Variables | a, b, c, d (not e) are real variables that CE declares. `FormulaResult` gains `params` and `bind(values)`. Each variable counts 1 toward size, like a number. Allowlist += a–d. MathLive's `dx` shortcut is removed and `\differentialD` is normalised to `d`. |
| Sliders | value = offset + k·step with k ∈ [−20, 20]; step ∈ {1, 0.1, 0.01, 0.001} (default 0.1); defaults a = b = 1, c = d = 0. "Centre" sets offset := value. Changing the step re-centres. Typing an offset sets the value (k := 0). Values are decimal-clean. |
| Live update | Native `<input type=range>`. `input` is throttled with requestAnimationFrame into `evaluateNow()`. Compiles are cached by input string (no recompile while dragging; a frame costs < 1.5 ms in Node). Keyboard geometry is frozen during a drag. |
| Storage | Additive, and `version` stays 1. Entries gain `bestVars`, `lastVars` (`{a: {value, offset, step}}`) and `hints`; the root gains `rules`. |
| Display | `compiler.substitute(latex, values)` (raw parse, swap the symbols, tidy, `.latex`) shows `1.3\sin(0.79x-0.5)-2` in the result dialog. Display only: scores always come from formula + values. |
| Keyboard | Still 4 rows × 10 widths. Row 3 = `e 1 2 3 − a b c d e^□`, row 4 = `( 0 . ) + ← → ⌫ hide ↵`. "clear" moves to a long-press on backspace; backspace, hide and return get explicit `width: 1`. |

---

## A. Hints (lessons)

### A.1 Behaviour
- **Initial state** (lesson, 0★, no hints revealed): the side panel shows `level.prompt` (new, generated in levels.js) and a button **"Show hint 1 of 2"**. The family chip and blurb are hidden.
- Clicking reveals **Hint 1**: a block labelled "Hint 1" holding the family chip and the blurb (exactly today's content). The button now reads **"Show hint 2 of 2"**.
- Clicking again reveals **Hint 2**: a block labelled "Hint 2" holding `level.hint`. The button disappears and focus moves to the Hint 2 block (`tabindex="-1"`), so focus isn't lost.
- **Persistence:** each reveal calls `store.revealHint(level.id, n)`. On opening a lesson, the number shown = `max(rec.hints, rec.stars > 0 ? 1 : 0)`. Once a level is cleared, the family and blurb are the lesson's explanation, so Hint 1 is open; Hint 2 stays behind the button unless it was revealed before. Reset progress clears hints too.
- Hints never affect the score or stars.
- **Why not…?** (`whyNot`) is unchanged and appears after ≥1★.
- **Level cards (lessons):** the chip shows `y = ?` (class `card-family unknown`, muted) until the level has ≥1★, then the family. Card aria-labels already omit the family, so they don't change.
- **Sandbox:** unchanged. The chip and blurb are visible, and one button "Show hint" toggles the hint (not stored). No prompt, and no "Hint 1/2" labels.
- **Challenges:** unchanged. The chip (`8 dots · 2 walls`) and the blurb are visible (the blurb names no formula), and there is no hint button.

### A.2 Prompt text (levels.js, `level.prompt`, lessons only)
`'Find a function whose graph goes through all N dots.'`, plus for wall levels `' It can’t cross the red wall[s] inside the view, so it has to jump.'`
Example (tan): "Find a function whose graph goes through all 7 dots. It can’t cross the red walls inside the view, so it has to jump."
The recip and tan blurbs keep their wall sentences (the test that they mention "inside the view" stays).

### A.3 Accessibility
`#hint-btn` gets `aria-controls="hints"` and no `aria-expanded` (it is progressive, not a toggle). `#hints` has `aria-live="polite"`, so the revealed text is announced. Each block is a `<div class="hint-block">` with a visible `<p class="hint-label">`.

### A.4 Titles that give the family away (note for the user; titles unchanged)
- **Name it outright:** V for Absolute (|x|), The Parabola (x²), Vertex Form (a(x−h)²+k), Square Root (√), Logarithm (log), Sine Wave (sin), Tangent (tan), Half a Circle (√(r²−x²)), Bell Curve (Gaussian).
- **Strong hint:** Flat Line (constant), Rise over Run (line), Doubling (2ˣ), Change the Period (sin(Bx)), Wave on a Slope (mx + sine), Fading Echo (damped wave).
- **Neutral or mild:** Downhill, S-Curve, Two Branches, Shift and Lift.

---

## B. Gentler length weighting

### B.1 The length factor
```
g(r) = 1                          for r ≤ 1
g(r) = exp(−((r − 1) / 2)²)       for r > 1          (LENGTH = {scale: 2, power: 2})
g(∞) = g(NaN) = g(r < 0) = 0
lessons:    score = round(1000 · (h/n) · g(L/par) · 0.5^walls)
challenges: score = round(1000 · (h/n) · g(L/P) · min(1, 15/size) · 0.5^walls)
```

| r | 1 | 1.1 | 1.25 | 1.5 | 2 | 2.5 | 3 | 5 | 10 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|
| **g(r)** | 1 | 0.9975 | 0.9845 | **0.9394** | 0.7788 | 0.5698 | 0.3679 | 0.0183 | 1.6·10⁻⁹ | 0 |
| ×1000 | 1000 | 998 | 984 | 939 | 779 | 570 | 368 | 18 | 0 | 0 |
| old lessons (1/r)² | 1 | 0.826 | 0.640 | 0.444 | 0.250 | 0.160 | 0.111 | 0.040 | 0.010 | 0.0001 |
| old challenges 1/r | 1 | 0.909 | 0.800 | 0.667 | 0.500 | 0.400 | 0.333 | 0.200 | 0.100 | 0.010 |

**Why this shape and these constants.** All candidates behave alike in the realistic zone (§B.4). I compared exp with p = 1.5, 2, 2.5, 3 and 1/(1+((r−1)/c)^p) with p = 2, 3, each calibrated so g(1.5) ≈ 0.93–0.94. I picked p = 2, c = 2 because:
- The slope is zero at r = 1, so a line a few percent over the reference costs nothing (g(1.05) = 0.9994): approximate coefficients aren't punished.
- The tail is harsh, so scanning dies. g(5) = 0.018, and everything with r ≥ 10 is 0, including `10\sin(100x)` (r ≥ 60), `5\sin(50x)` (r ≥ 25) and `\sin(200x)` (r ≥ 20). By comparison, p = 1.5 leaves g(5) = 0.15 and the rational p = 3 leaves g(10) = 0.002.
- p = 3 is too abrupt between 2 and 3: g(2) = 0.56, and only 66% of challenge moves landing in r ∈ [2, 3) still pay, versus 83%.
- The constants are round, so the copy can quote ×0.94 at 1.5×, ×0.78 at 2× and ×0.37 at 3×.

### B.2 The guarantee
One more dot, with walls (and for challenges, size) unchanged, raises the unrounded score iff (h+1)·g(r₂) > h·g(r₁). The worst case is r₁ ≤ 1 with h = n−1, which needs g(r₂) > (n−1)/n. Because g(1.5) = 0.9394 > 0.9 = 9/10, **every extra dot strictly raises the score for any r₂ ≤ 1.5 on every level** (lessons have ≤ 9 dots, challenges ≤ 10).

| n | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|
| guarantee actually holds up to r₂ = | 2.07 | 1.95 | 1.85 | 1.79 | 1.73 | 1.69 | 1.65 |
| worst-case gain at r₂ = 1.5 (points × S) | 189 | 139 | 106 | 82 | 64 | 50 | 39 |

S is the size × wall factor. After rounding the score still rises strictly whenever S ≥ 0.026, i.e. always in practice. A test checks this over a grid of n, h, r₁ and r₂ (§G).

**Why R_safe = 1.5.** Most "work for one more dot" moves land at r₂ between 1 and 1.6 (§B.4), so 1.5 protects the common case. A larger R_safe of 2 would force g(2) > 0.9 (c ≥ 3.1 → g(3) = 0.66, g(5) = 0.18): wiggle spam would earn points again and length would barely matter. A smaller R_safe of 1.25 would leave the busy 1.25–1.6 band unprotected. With c = 2 the guarantee in fact reaches 1.65–2.07 depending on n.

### B.3 Lesson stars stay tied to the length ratio
`RULES = {three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5}` (`exponent` and `oneMinScore` are removed). Stars need every dot and no wall crossed, and then L ≤ 1.05 / 1.25 / 1.415 × par.
- The 1★ boundary used to be "score ≥ 500", i.e. L ≤ 1.41492·par after rounding. Using 1.415 keeps **every attempt that had 1★ still 1★**. Copy keeps saying "within 41%".
- Stars no longer depend on g at all. So all references and alternates stay 3★/1000, all decoys stay 0★, and re-scoring can't lower a stored star (§B.6).
- Score and stars now diverge visibly. For example, the slope staircase `\frac{1}{2}\lfloor x\rfloor+1` is 4/4 at 1.31 × par: **976 points, 1★** (was 579). The copy explains it: points are for dots, stars are for a short line (§B.7).
- Lesson attempts still rank by stars, then score.

Lesson calibration (all verified):

| check | result |
|---|---|
| references (LaTeX + text), alternates | 3★ / 1000 on every level |
| all decoys | 0★ (unchanged) |
| `10\sin(100x)`, `5\sin(50x)`, `\sin(200x)` | score 0 on all 19 levels |
| `3\sin(10x)` / `6\sin(5x)` | max 19 / 17 (both on tan: r = 3.0 but 4 walls; 0 elsewhere), 0★ |
| parabola polyline `\left\|x\right\|-3+…` | 1000, 3★ (unchanged) |
| slope staircase | 976, 1★ (was 579) |
| recip `\frac{4x}{x^2+0.01}` | 500, 0★ (unchanged: r = 0.999, 1 wall) |

New scoreAttempt table (4/4 dots, par 20): r = 1 → 1000/3★, 0.5 → 1000/3★, 1.05 → 999/3★, 1.06 → 999/2★, 1.2 → 990/2★, 1.25 → 984/2★, 1.3 → 978/1★, 1.415 → 958/1★, 1.42 → 957/0★, 2 → 779/0★, 3 → 368/0★, 10 → 0. At par: 2/4 dots → 500/0★, 1 wall → 500/0★, 2 walls → 250, L = ∞ → 0/0★.

### B.4 How often more dots now means more score (the "almost always" claim)
Two samples, measured with the real engine. Prototype: `proto/transitions.js`, `trans-eval.js`, `family-trans.js`, `family-eval.js`.

**(a) "Work for one more dot"**: for every level and every bot family, the shortest curve the generator's search finds for each hit count. Pairs are h → h+1 within the same family (so the size is the same); lessons also get cross-family pairs. The table gives the share of pairs where the score rises.

| sample | pairs | old | **new** | r₂ < 1.25 | 1.25–1.5 | 1.5–2 | 2–3 | 3–5 | ≥ 5 |
|---|---|---|---|---|---|---|---|---|---|
| lessons, same family | 334 | 89% | **99%** | 97 → 100% (297) | 38 → **100%** (21) | 17 → **92%** (12) | 0 → 0% (4) | – | – |
| lessons, any family | 78 | 94% | **100%** | 99 → 100% | 0 → 100% | 0 → 100% | – | – | – |
| challenges | 521 | 91% | **93%** | 100 → 100% (408) | 50 → **100%** (24) | 55 → **85%** (20) | 83 → 83% (18) | 56 → 34% (32) | 68 → 58% (19) |

**(b) Player nudges**: one number changed by ±1–50%, keeping moves that gain exactly one dot. Lessons (1,727 moves): 98.7% → **99.9%**. Challenges (4,094 moves): 99.3% → 98.7%, and below r₂ = 2 the rate is 99.9–100%. All of the drop is at r₂ ≥ 3 (90.5% → 69.8%), which is the intended "scanning too much space" penalty.

**Concrete examples** (verified; each becomes a regression test):

| level | before | after (one more dot) | old score | new score |
|---|---|---|---|---|
| semicircle | `1.64\sin\left(0.45x+1.57\right)+2.48` 5/7, r 0.82 | `2.42\sin\left(1.06x-1.71\right)+0.61` 6/7, r 1.49 | 714 → 385 | 714 → **807** |
| downhill | `-2\left\|x-1.75\right\|+2\left\|x-3.25\right\|-2` 3/4, r 0.88 | `2\left\|x-4\right\|-5` 4/4, r 1.18 | 750 → 712 | 750 → **992** |
| sine | `3\operatorname{sgn}\left(x-0.79\right)-1.91x+3` 4/6 | `6\operatorname{sgn}\left(x-0.79\right)-1.91x` 5/6, r 1.14 | 667 → 643 | 667 → **829** |
| c17 | `7.76\sin\left(0.77x-2.89\right)+4.37` 7/9, r 0.94 | `5.39\sin\left(1.54x+2.61\right)-0.06` 8/9, r 1.59 | 778 → 558 | 778 → **814** |
| c06 | 5/6 wave + line, r 1.11 | 6/6, r 1.67 | 754 → 598 | 831 → **893** |

### B.5 Challenges: re-baked bots and balance
*Refreshed after implementation with the final rules (§L.1 length factor, §L.2 size factor, §L.3 re-bake).*

`tools/gen-challenges.js` uses the same factors as `scoring.challengeScore`: `scoring.lengthFactor(L / P)` and `scoring.sizeFactor(size)` replace its private `Math.pow(Math.min(1, P / L), E)` and `Math.min(1, K / size)` in `scoreOf`, the `est` ranking in `searchFamily`, and `objective`. It exports `better` and `decimals` (used by a test). Per §L.3, `searchBot(judge, level, baked)` also judges and climbs the bots already in `js/challenges.js` and adds them to `finals`; a new `--seeds file` option adds another file's bots the same way. The bake was run once with `--seeds` pointing at the planner's scratch bake (so its better finds, e.g. c17's 855, were kept); after that a plain `node tools/gen-challenges.js --write` (≈22 s) reproduces `js/challenges.js` byte for byte. **The dots and walls are identical.** Eight bot formulas are unchanged from v1: c05, c08, c11, c12, c13, c14, c19, c20.

"v1 bot @ v2" is the old bot formula scored under the new rules; no new bot scores below it.

| id | n | P | v1 bot (hits, size) | v1 bot @ v2 | **new bot** | hits | size | L/P | family | from | new bot LaTeX |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c01 | 5 | 27.0 | 800 (4, s12) | 800 | **915** | 5/5 | 17 | 1.36 | cubic | new | `0.074x^3+0.339x^2-1.607x-3.774` |
| c02 | 5 | 19.6 | 881 (5, s14) | 988 | **989** | 5/5 | 14 | 1.13 | wave + line | scratch | `1.848\sin\left(0.76x-0.979\right)+0.709x-1.797` |
| c03 | 5 | 21.8 | 800 (4, s10) | 800 | **968** | 5/5 | 14 | 1.28 | wave + line | scratch | `3.482\sin\left(0.608x+2.091\right)-0.1x+0.283` |
| c04 | 6 | 22.4 | 896 (6, s12) | 991 | **992** | 6/6 | 12 | 1.10 | V + line | new | `1.18\left\|x-0.2\right\|-0.22x-5.05` |
| c05 | 6 | 15.1 | 833 (5, s15) | 833 | **833** | 5/6 | 15 | 0.91 | two Vs | v1 | `-1.5\left\|x+1.5\right\|-0.7\left\|x-2.1\right\|+4.6` |
| c06 | 6 | 38.9 | 778 (5, s14) | 829 | **894** | 6/6 | 10 | 1.60 | wave | scratch | `4.8\sin\left(1.2x+0.6\right)-0.2` |
| c07 | 6 | 20.0 | 974 (6, s14) | 998 | **998** | 6/6 | 14 | 1.03 | wave + line | new | `2.68\sin\left(0.43x-1.42\right)-0.3x-0.16` |
| c08 | 7 | 13.8 | 857 (6, s10) | 857 | **857** | 6/7 | 10 | 0.97 | wave | v1 | `2.82\sin\left(0.24x-1.88\right)+5.36` |
| c09 | 7 | 22.2 | 813 (6, s14) | 854 | **854** | 6/7 | 14 | 1.06 | wave + line | new | `3.81\sin\left(0.43x+1.45\right)-0.13x+1.24` |
| c10 | 7 | 21.8 | 825 (7, s17) | 956 | **956** | 7/7 | 17 | 1.07 | step + wave | new | `2.04\operatorname{sgn}\left(x-4\right)+2.24\sin\left(0.43x-0.67\right)-0.68` |
| c11 | 7 | 37.4 | 714 (5, s10) | 714 | **714** | 5/7 | 10 | 0.84 | wave + line | v1 | `2\sin\left(x+2.7\right)+x-4.1` |
| c12 | 8 | 25.4 | 832 (8, s14) | 980 | **980** | 8/8 | 14 | 1.20 | wave + line | v1 | `2.4\sin\left(1.01x-2.06\right)+0.28x+0.17` |
| c13 | 8 | 19.8 | 875 (7, s14) | 875 | **875** | 7/8 | 14 | 0.98 | wave + line | v1 | `0.86\sin\left(1.07x-0.25\right)-0.45x+5.72` |
| c14 | 8 | 22.8 | 750 (6, s12) | 750 | **750** | 6/8 | 12 | 0.82 | wave + line | v1 | `\sin\left(0.8x-1.7\right)+0.3x+3.5` |
| c15 | 8 | 33.4 | 614 (6, s17) | 716 | **717** | 6/8 | 17 | 1.08 | step + wave | new | `-3.59\operatorname{sgn}\left(x-1\right)+2.17\sin\left(1.62x-3.1\right)-3.62` |
| c16 | 9 | 34.6 | 667 (6, s12) | 667 | **842** | 8/9 | 14 | 1.38 | wave + line | scratch | `3.46\sin\left(1.24x+0.67\right)+0.12x+0.26` |
| c17 | 9 | 67.9 | 778 (7, s10) | 778 | **855** | 8/9 | 14 | 1.31 | wave + line | scratch | `4.69\sin\left(1.44x+2.58\right)+0.23x-0.44` |
| c18 | 9 | 12.9 | 667 (6, s12) | 667 | **763** | 7/9 | 10 | 1.20 | wave | new | `1.631\sin\left(1.535x-2.519\right)-0.053` |
| c19 | 10 | 35.2 | 706 (8, s17) | 769 | **769** | 8/10 | 17 | 0.92 | step + wave | v1 | `-1.8\operatorname{sgn}\left(x+3\right)+1.4\sin\left(1.6x+1.4\right)+0.2` |
| c20 | 10 | 32.6 | 618 (7, s17) | 673 | **673** | 7/10 | 17 | 0.91 | step + wave | v1 | `-1.2\operatorname{sgn}\left(x+1.5\right)+2.7\sin\left(0.8x+1.1\right)+3.5` |

"from": v1 = the old bot formula kept; scratch = the planner's prototype bake, climbed under the final rules; new = found or retuned by this bake.

Bot range 673–998 (median 856); **no bot scores 1000** (max c07 998, then c04 992, c02 989). Families: wave + line 10, step + wave 4, wave 3, cubic 1, V + line 1, two Vs 1. The softer size factor makes size-17 bots pay (c01's cubic 915, c10's step + wave 956).

**Generic recipes and exploits** (`proto/challenge-table.js` re-run against the final bots; ratios to the bot score are median / max).

| recipe | plan (exp c=2, 15/size) | **final (§L.1 + §L.2)** | beats the bot |
|---|---|---|---|
| best constant (`maxConstHits`) | 0.26 / 0.40 | 0.26 / 0.40 | – |
| best line | 0.49 / 0.60 | 0.44 / 0.61 | – |
| best parabola | 0.65 / 0.83 | 0.62 / 0.83 | – |
| A sin(bx+c)+d (bot grid) | 0.89 / 1.00 | 0.87 / 1.00 | – (ties on wave levels) |
| high-frequency sine scan, b = 3–14 × 16/W | 0.39 / 0.56 | 0.35 / 0.56 | – |
| high-frequency sine + line | 0.63 / 0.96 | 0.61 / 0.95 | – |
| triangle wave A·arcsin(sin(bx+c)) + line | 0.99 / 1.15 | 0.98 / 1.13 | c02 c17 c18. Left for players on purpose (PLAN-challenges §11.C). |
| \|x−a\| chain through every dot (size 7n−9) | 0.43 / 0.72 | **0.00 / 0.33**, < 0.05 on 17 | – |
| sgn staircase through every dot | 0.40 / 0.64 | **0.00 / 0.15** | – |
| `6\sin(5x)` / `3\sin(10x)` | 0.00 / 0.005 · 0.00 / 0.001 | 0.00 / 0.007 · 0.00 / 0.001 | – |
| `10\sin(100x)` | 0 everywhere | 0 everywhere | – |

**"Add a term for one more dot"** (the reviewer's nested-family pairs, `rv/cross-fam.json`, 711 pairs F1 → F1 + one term, h → h+1, same walls): the score rises in 85% of pairs under v1, 87% under the plan's rules and **93% under the final rules**; when the bigger family is over 15 symbols, 50% → 53% → **75%**. Pairs that stay within 15 rise 99% of the time.

**Conclusion:** keep K = 15 free size units with the soft size factor, and wall halving. No generic recipe dominates; the mechanical chain and staircase are crushed by the size factor, and the scanners and wiggles stay at ~0.

**Challenge assertions (tests, re-validated):** every bot reproduces ±1 with the same hits and size and `params: []`; no ±1 last-digit nudge beats the bot (some tie); flat < 0.45 × bot (max 0.40); chain < 0.35 × bot everywhere and < 0.05 × bot on ≥ 15 (17 of 20); the sgn staircase hits every dot and stays < 0.2 × bot (max 0.15); `10\sin(100x)` = 0; `6\sin(5x)` < 0.25 × bot and `3\sin(10x)`, `6\sin(5x)` ≤ 0.02 × bot; every bot < 1000. The c03 "tie goes to the simpler formula" test is a unit test of `gen.better`; every bot has ≤ 3 decimals.

**Perfect bots (§L.7 decision).** No bot reaches 1000, so the special case is dropped: `scoring.beatsBot(score, bot) = bot > 0 && score > bot` and `scoring.matchesBot(score, bot) = bot > 0 && score === bot`. `evaluateChallenge` sets `beatBot`/`matchedBot` from them. A test asserts every bot < 1000; if a future re-bake produces a perfect bot, restore "1000 against a 1000 bot counts as beating it" with the §L.7 copy.

### B.6 Stored progress: rules version and one-off re-scoring
- `scoring.RULES_VERSION = 2` (v1 = the old (par/L)² and 1/r rules).
- Storage root gets `rules` (absent = 1, empty store = 0). `store.migrate(version, rescore)`:
  - If the stored rules are already ≥ version, do nothing and return 0.
  - Otherwise, for every entry with a `bestFormula`, call `rescore(id, entryCopy)`, which returns `{score, stars}` or `null`. Set `bestScore = score` and `stars = max(old, new)`, so stars never drop.
  - A `null` (unknown id, formula no longer evaluates) or a throw keeps the entry unchanged.
  - Then set `rules = version`, save once and return the count. `reset()` keeps the current version (the one `migrate` last ran with).
- **app.js `boot()`** calls `state.store.migrate(GF.scoring.RULES_VERSION, rescoreEntry)` right after `createStore()` and before `route()`, inside try/catch:
  ```js
  function rescoreEntry(id, e) {
    var level = GF.levels.getLevel(id) || getChallenge(id);              // sandbox and unknown ids → null
    if (!level || !level.targets.length) return null;
    var ev = state.game.evaluate(level, e.bestFormula, { timeBudgetMs: 300 }, varValues(e.bestVars));
    if (ev.status !== 'ok' || !ev.result) return null;
    return { score: ev.result.score, stars: isChallenge(level) ? 0 : ev.result.stars };
  }
  ```
  `varValues({a: {value: 1.3, …}})` returns `{a: 1.3}`. Cost: about 112 ms in Node for 39 bests (this includes computing the lesson pars, which are needed anyway). Expect about 300 ms on a slow phone, once, behind the existing "Loading…" screen.
- Lesson stars can't fall in practice: star rules are unchanged or looser and the length metric is unchanged. `max()` is the safety net.
- Challenge stars are always recomputed against the new bot from the re-scored `bestScore`, as today.
- Known limit: only the stored best is re-scored. An older attempt that would now rank higher is gone.
- An old tab still open writes `{version: 1, levels}` without `rules`. The next boot re-scores again, which is harmless because re-scoring is idempotent.

### B.7 Copy (UI)
**How scoring works — lessons** (4 bullets):
1. **Hit every dot.** Each dot is an equal share of the 1000 points, so one more dot is worth more than a slightly shorter line.
2. **Short lines score best.** Up to par the length is free. After that points drop slowly (×0.98 at 125% of par, ×0.94 at 150%, ×0.78 at 200%), and lines that wiggle all over the screen score nothing.
3. **Stars are for the line.** They need every dot and no red wall crossed: ★★★ within 5% of par, ★★ within 25%, ★ within 41%.
4. **Par** is the length of our reference answer. Parts of the graph that leave the screen count their width, and jumps count their height.

**How scoring works — challenges:**
1. **Every dot counts.** Score = 1000 × dots hit ÷ dots; you don't need them all.
2. **Short formula.** Each number, letter (x, a–d, π, e), operator and function counts 1 (brackets are free). The first 15 are free; above that, score × 15 ÷ size.
3. **Short line.** Up to the dot-to-dot length it's free. After that points drop slowly (×0.94 at 1.5×, ×0.78 at 2×, ×0.37 at 3×). Crossing a red wall in view halves the score. ★ 60% of the bot's score, ★★ 85%, ★★★ match or beat it.

**Live status line (lessons):**
- Partial hits: `4 of 5 dots × length 0.98 = 784` (append ` × wall 0.5` when a wall is crossed), muted. This is the challenge format without the size term.
- All dots: 3★/2★/1★ texts unchanged.
- All dots, 0★: `All dots, but the line is 160% of par (×0.91). A star needs under 141%.`
- Challenges are unchanged (`… × length 1.00 × size 0.88 = 704 · bot 800`); the factor values now come from g.

**Result dialog:**
- Lessons, Length row: `26.4 vs par 21.4 (123%) · ×0.98`, with class `warn` when the factor < 0.995. Challenges keep `25.9 · dot-to-dot 27.0 (×1.00)`.
- Lesson note when all dots are hit but the attempt has 0★: `Points are for dots; stars are for a short line. A star needs length ≤ 30.2 (141% of par).` Other notes are unchanged.
- `oneRatio()` returns `RULES.one`; the app.js fallback `RULES` object is replaced by `{three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5}`.

**Level-select footer:** `Type a function of x whose graph passes through the dots. Every dot earns points; the shorter your line, the more stars.`

---

## C. Variables a–d with sliders

### C.1 Verified CE / MathLive facts
These were probed in `proto/ce-vars.js` and in Chromium through the Playwright MCP.
- `ce.declare(v, 'real')` for x, a, b, c, d inside the existing `pushScope()` is **required**: undeclared letters have type unknown, so `isNumber` fails.
- After declaring, `CE.compile(expr, {mode: 'strict', fallback: false})` gives `calling: 'expression'` and `freeSymbols` lists the used symbols (e.g. `['a','b','x','c','d']`). `run({x, a, b, c, d})` works.
- Parsing:
  - `ax` → a·x; `abx` → a·b·x; plain `ab` and `a b` → a·b; `a\cdot b`.
  - `\sin(bx)`, `a(x)` and `c(x)` → a product, not a function call.
  - `x^a`, `e^{ax}`, `\frac{a}{x-b}`, `\left|x-a\right|` and `a\operatorname{sgn}(x-b)` all work.
  - `\frac{d}{dx}x^2` stays a derivative and `\int_0^x t\,dt` stays an integral; d is not captured.
- `a2` parses as the subscript `a_2`, and `x2` as `x_2`. Both give a dedicated message (§C.2).
- `cosx` → c·o·s·x, which leaves unknowns o, s. `sinx` → n, s (i is the imaginary unit). `tanx` → n, t. The plain-mode "write functions with brackets" hint still fires: o, s, n and t are all in `FN_LETTERS`.
- Plain-text function names containing a–d still parse as functions: `cos sec csc cosh abs acos ceil exp arccos`. **Plain `asin(x)` is arcsin, not a·sin(x)** (it was arcsin before too, and stored formulas rely on it), so the plain tip says to write `a*sin(x)` or `a sin(x)`. In MathLive, typing `asin` gives `a\sin` (checked).
- **MathLive's inline shortcut `dx` → `\differentialD x`** fires after nothing, digits, operators, open fences and so on, which makes `2dx` a syntax error. The fix has two parts: delete `dx` from `mf.inlineShortcuts` (checked: `2dx+1` then stays `2dx+1`), and normalise `\differentialD` → `d` for pasted input. No other default shortcut interferes with a–d: `xx`→×, `in`, `cbrt` and `det` already existed and are unaffected.
- Performance: compile is 0.4–2 ms. One drag frame (resample + score) is 0.35–1.3 ms in Node, with 2,000–4,800 evals for `a\sin(bx+c)+d` … `3\sin(20x)`.

### C.2 formula.js contract
```ts
VARIABLES = ['a','b','c','d'];  DEFAULT_VALUES = {a: 1, b: 1, c: 0, d: 0}       // frozen, exported
CHALLENGE_SYMBOLS = ['x','Pi','e','ExponentialE','a','b','c','d']
normalizeInput: + .replace(/\\differentialD(?![A-Za-z])\s*/g, 'd ')               // after the \mleft/\mright line
FormulaResult (ok) = {ok, fn, bind, params, source, pretty, size, ops, symbols}
  params: string[]            // used variables in a,b,c,d order (from result.freeSymbols, falling back to expr.unknowns)
  bind(values) → fn           // values {a?: number, …}; missing or non-finite → DEFAULT_VALUES. Each bound fn has its
                              // own scope object, reused across calls (scope.x = x; run(scope)). Never throws.
  fn = bind({})               // the defaults; unchanged meaning for formulas without variables
compiler.substitute(input, values) → LaTeX   // display only (C.5)
```
Error messages:
- Unknowns other than x and a–d: `Only x and a–d can be variables (found: k).` (kind `variables`, detail = names).
- If every unknown matches `/^[a-dx]_\d+$/`: `Write the number first: 2a, not a2.` (also kind `variables`).

Size: each variable counts 1, like a number, so `a\sin\left(bx+c\right)+d` is size 10, the same as `2.7\sin(0.5x+2.2)-1`. Variables give no size advantage: `a\sin\left(bx+c\right)+dx+0.17` with the c12 bot's values scores exactly the bot's 989 at size 14.

All 20 bot formulas compile with `params: []` and reproduce. The lesson references are unaffected.

### C.3 Slider semantics (new `js/sliders.js`, pure and DOM-free)
```ts
STEPS = 20; STEP_OPTIONS = [1, 0.1, 0.01, 0.001]; DEFAULT_STEP = 0.1; MAX_ABS = 1e6
Slider = {name, offset, step, k}                          // k ∈ [−20, 20]
value(s)  = Number((offset + k·step).toFixed(decimals(s)))  // decimals = max(decimals(offset), decimals(step)), ≤ 6
label(s)  = value with exactly decimals(s) digits, U+2212 minus ("1.0", "−0.30")
min(s), max(s) = offset ∓ 20·step
create(name, saved?) → default offset = DEFAULT_VALUES[name], step 0.1, k 0; or restore(saved)
restore(s, {value, offset, step}) → keeps the offset if the value is on its grid within ±20 steps, else centres on the value
setK(s, k) (clamped) · centre(s) → offset := value, k := 0 · setStep(s, step) → centre + new step (zoom around the value)
setOffset(s, text) → offset := number (accepts U+2212, comma), k := 0; null if not a number · save(s) → {value, offset, step}
values(map, names?) → {a: 1.3, …}
```
Defaults and their reasons:
- a = b = 1 and c = d = 0 make the typical forms start at the plain function: `a\sin(bx+c)+d` = sin x, `a(x-b)^2+c` = (x−1)², `ax+b` = x+1.
- Step 0.1 with ±20 positions gives a ±2 range at 6 px per position on a 250 px phone track.
- Coarse → fine works by switching step: 1 gives ±20, then 0.1 re-centres to ±2, then 0.01 to ±0.2.

Typing a value directly is supported: the offset field is the "type a value" control, and typing sets value = offset. There is no separate value input.

### C.4 engine.js contract
```ts
evaluate(level, input, sampleOpts?, vars?) → Evaluation      // vars: {a: 1.3, …}; extra or missing ones are fine
Evaluation (ok) gains vars: {a: 1.3}   // the values actually used, only for formula.params (defaults filled in)
```
- A compile cache: a Map of the last 16 inputs → FormulaResult, LRU. A slider drag re-samples without recompiling.
- Callers must not mutate a cached `formula`. The challenge "not-allowed" branch builds its own object, as today.

### C.5 Recording, persistence, display
- **Scores always come from formula + values.** At lock-in, `store.record(id, {score, stars, formula: ev.input, vars})` where `vars = {k: sliders.save(state[k])}` for `k ∈ ev.formula.params` (empty → null).
- `lockIn` re-evaluates first when `evalTimer || sliderRaf || ev.input !== text || ev.vars differ from the current slider values`.
- `lastFormula` and `lastVars` are saved through the existing debounced `scheduleSave(id, text, vars)` on every ok evaluation, including slider moves and step/offset changes.
- Storage schema (additive; `version` stays 1 so a cached older build doesn't wipe progress):
  ```
  {version: 1, rules: 2, levels: {[id]: {bestScore, stars, bestFormula, bestVars, lastFormula, lastVars, hints}}}
  Vars = {[a|b|c|d]?: {value: number, offset: number, step: 1|0.1|0.01|0.001}} | null
  ```
  `clean()` validates vars: finite value; the offset defaults to the value; an unknown step becomes 0.1; unknown names are dropped; empty → null. `hints` is clamped to 0–2. Old data reads as `rules: 1` and `bestVars = lastVars = null`, `hints = 0`.
- **Display:** `compiler.substitute(input, values)` raw-parses the formula (`canonical: false`), swaps a–d for numbers in the MathJSON, tidies, then calls `ce.box(json, {canonical: false}).latex`. An invalid parse returns the source unchanged. Tidy rules: `x−(−2)` → `x+2`, `+0` dropped, `1·u` → `u`, `−1·u` → `−u`, a non-leading negative factor gets brackets, `(−2)^2` keeps its brackets. Examples:
  - `a\sin\left(bx+c\right)+d` with {1.3, 0.79, −0.5, −2} → `1.3\sin(0.79x-0.5)-2`
  - `ax^2+bx+c` with {−0.5, 1, 0} → `-0.5x^2+x`
  - `a\left|x-b\right|+c` → `1.2\vert x+0.2\vert-5.2`
  - `2a` → `2(-1.5)`

  CE's own `subs` gave `1x+0` and `x-(-0.2)` (raw) or re-ordered terms (canonical), which is why the tidy step exists.
- **Where shown:**
  - Result dialog: when params are used, a `#result-formula` block under the score shows "y = <substituted>" (one `<math-span>` per top-level term, reusing `latexTerms`/`botAnswerEl`'s wrapping; `<code>` without MathLive) and a muted line "a = 1.3 · b = 0.79".
  - Thumbnails: `queueThumbCurve(level, formula, values)` with cache key `formula + '|' + JSON.stringify(values)`, evaluated with `values`.
  - Migration: uses `bestVars`.
  - Bot answers have no variables and are unchanged.

### C.6 UI: the variable panel
**Placement.** `<section id="vars-panel" class="panel vars-panel" hidden>` is the **first child of `.side-col`**. On phones and narrow screens the side column follows the main column, so the panel sits directly below the status line. At ≥ 860 px it is at the top of the sticky side column, beside the plot. Checked with a mock at 390×844 and 1280×800: `proto/vars-mock-*.png`.

**Rows.** Only variables used in the formula get a row, in a, b, c, d order. Each row is a 2-line grid:
```
a   1.30  [=========●=======]                        ← <label for>, <output aria-hidden>, <input type=range min=-20 max=20 step=1>
          step [0.1 ▾]  offset [1    ]  [centre]     ← <select>, <input type=text inputmode=decimal enterkeyhint=done>, button
```
- The panel header is `<h2 id="vars-title">Sliders</h2>` plus a muted hint: "drag, or use ← →" (fine pointer) or "drag to tweak" (coarse).
- At 320 px use `.var-set{font-size:.82rem; gap:8px; flex-wrap:wrap}` and an offset input 4.5em wide, so the settings line fits on one line.
- The range gets `title` = "−1.0 to 3.0" and `aria-valuetext` = "a = 1.3". The centre button gets `aria-label` = "Centre the a slider on 1.3".

**Behaviour.**
- When an ok evaluation's `params` change, add or remove rows. Never rebuild the row that has focus.
- The panel keeps its rows while the formula is temporarily invalid.
- Per-level slider state comes from `rec.lastVars` (via `sliders.create(k, saved)`) and is kept in memory for removed variables during the visit, so deleting and retyping `b` restores its slider.
- range `input` → `setK` → update the label → `requestAnimationFrame(evaluateNow)`, coalesced. range `change` → `evaluateNow()`.
- step `change` → `setStep` (re-centre). offset `change` or Enter → `setOffset`; invalid text reverts, Escape reverts. centre → `centre`.
- Enter on a focused range → `lockIn()`.

**Discoverability.** A `#vars-tip` line under the status (main column) reads "Tip: put a, b, c or d in your formula to get a slider, e.g. *a* sin(*bx*)." It shows while the formula has no variables and `prefs.varsTip !== false`. Set `varsTip = false` (in `graph-fun.prefs.v1`) the first time a formula uses a variable.

**Virtual keyboard and focus** (verified in Chromium):
- A native range takes focus on pointerdown. The math-field blurs at once, and MathLive hides its keyboard about 300 ms later (`virtual-keyboard-toggle` + `geometrychange`).
- `preventDefault()` on pointerdown keeps the field focused but **kills the native drag**, so don't use it.
- Design: let the keyboard hide, which also frees room for the panel, but **freeze the layout during a drag**. `pointerdown` inside `#vars-panel` sets `sliderDrag = true`. `onKeyboardGeometry` stores the change and returns while `sliderDrag` is true, and `keepFormulaVisible` is skipped. On window `pointerup`/`pointercancel`, set `sliderDrag = false` and apply the stored geometry.
- Without this, short phones (e.g. 667 px tall, where the plot is height-limited while the keyboard is open) would shift the slider under the finger.
- After a drag the player taps the field to type again. There is no automatic refocus, which would make the keyboard bounce.
- With the keyboard open on a 390×844 viewport (keyboard 176 px), the status line ends at y = 488 and the keyboard starts at 668, so the header and about two rows are visible above it.

**Plain mode (`?plain`).** The panel is identical. The tip text becomes: `Plain-text mode: write (1/2)x or x/2, sin(x), sqrt(x), abs(x), sgn(x), x^2, e^x, pi. a, b, c and d get sliders: a*sin(b*x) (asin is arcsin).`

**Dark mode.** Colours are tokens only: ranges use `accent-color: var(--accent)`; selects and inputs use `--surface-2`, `--border` and `--text`. `:root{color-scheme: light dark}` already themes the native parts.

### C.7 Keyboard (js/keyboard.js)
Still one layout of four rows, each exactly 10 widths (MathLive sizes a keycap at 10% of the width on phones). Rows 1–2 are unchanged:
```
R3: e 1 2 3 − | a b c d e^□                        a–d: {latex:'a', class:'gf-var gf-param', tooltip:'a (gets a slider)'}
R4: ( 0 . ) + | ← → ⌫ hide ↵                       {label:'[backspace]', width:1, tooltip:'Backspace (long-press to clear)',
                                                    variants:[{label:'clear', command:'deleteAll', class:'action small'}]},
                                                   {label:'[hide-keyboard]', width:1}, {label:'[return]', width:1, tooltip:'Lock in'}
```
- **`[backspace]`, `[hide-keyboard]` and `[return]` default to width 1.5 (class `w15`)**, so they must set `width: 1` explicitly.
- Checked in Chromium: the keyboard stays 176 px tall, the keys type `a\sin\left(bx\right)`, and long-pressing backspace shows "clear".
- The rejected alternative was a second layout tab ("a b c d"). It adds a 42 px tab bar (218 px total) and forces switching tabs mid-formula.

---

## D. Contract and API changes per file

| file | owner | change |
|---|---|---|
| `js/scoring.js` | logic | + `RULES_VERSION = 2`, `LENGTH = {scale: 2, power: 2}`, `lengthFactor(r)`, `beatsBot(score, bot)`. `RULES = {three: 1.05, two: 1.25, one: 1.415, wallPenalty: 0.5}`. `scoreAttempt` returns `{score, stars, lengthFactor}`; stars by ratio. `evaluateAttempt` adds `lengthFactor` to the lesson AttemptResult. `CHALLENGE = {freeSize: 15, wallPenalty: 0.5, oneStar: 0.6, twoStar: 0.85}` (drop `lengthExponent`). `challengeScore` uses `lengthFactor(L/P)` (par ≤ 0 → 0). `evaluateChallenge`: `beatBot` via `beatsBot`, `matchedBot = score === bot && !beatBot`. |
| `js/formula.js` | logic | §C.2: `VARIABLES`, `DEFAULT_VALUES`, declares, unknown filter + messages, `params`, `bind`, the reused-scope `wrap(run, lambda, values)`, `\differentialD` normalisation, allowlist += a–d, `compiler.substitute`. |
| `js/engine.js` | logic | compile cache (16, LRU); `evaluate(level, input, sampleOpts, vars)`; `Evaluation.vars`. |
| `js/sliders.js` **(new)** | logic | §C.3 (UMD `GF.sliders`, dep: formula). Script tag after `js/formula.js` in index.html (UI agent adds it). |
| `js/storage.js` | logic | §B.6, §C.5: `blank()` + `bestVars`/`lastVars`/`hints`, `cleanVars`, `parse` → `{levels, rules}`, save writes `rules`. `record(id, {score, stars, formula, vars})`, `setLast(id, formula, vars)`, `revealHint(id, n) → n`, `rulesVersion()`, `migrate(version, rescore) → count`. `reset()` keeps the current rules. |
| `js/levels.js` | logic | lessons get `prompt` (§A.2); the other fields are unchanged. |
| `tools/gen-challenges.js` | logic | uses `scoring.lengthFactor`; exports `better`, `decimals`; re-bake with `--write` (§B.5). |
| `js/challenges.js` | logic | regenerated (bots only). |
| `js/keyboard.js` | UI | §C.7. |
| `index.html` | UI | `<script defer src="js/sliders.js">` after formula.js. Blurb panel → `#level-prompt`, `#hints` (`#hint-1`: label + `#level-family` + `#level-blurb`; `#hint-2`: label + `#level-hint`), `#hint-btn`. `#vars-panel` first in `.side-col`. `#vars-tip` after `#wall-warning`. `#result-formula` after `#result-best`. New how-to copy (§B.7) and footer copy. |
| `css/style.css` | UI | `.prompt`, `.hints`, `.hint-block`, `.hint-label`, `.card-family.unknown`, `.vars-panel`, `.var-row` (grid areas `name val slider / . set set`), `.var-name` (italic math font), `.var-val` (tabular), `.var-set`, `.vars-tip`, `.result-formula`, `.result-vars`. Phone ≤ 520 px tweaks. Dark mode through tokens. |
| `js/app.js` | UI | boot: `migrate` + `rescoreEntry`. MathLive mount: `delete shortcuts.dx`. Plain tip. Hints flow + `revealHint`. Lesson card chip `y = ?`. Vars panel + slider state + rAF evaluation + keyboard-geometry freeze. `evaluateNow` passes `GF.sliders.values(state, params)`. Saves with vars; lockIn records vars and re-evaluates when stale; the result formula block. Thumbs with values. Status/facts/notes copy (§B.7). `GF.scoring.beatsBot` in the chip, cards and headline. `RULES` fallback, `oneRatio()`. `prefs.varsTip`. Test hook `GF.app.setVar(name, value)` (sets offset := value, k := 0, then evaluates). |
| `js/render.js` | – | no change. |

---

## E. Storage schema and migration (summary)
- Key `graph-fun.progress.v1`, `version: 1`. The root gains `rules` (1 if absent; 0 for a brand-new store until `migrate` runs on boot).
- Entries are as in §C.5. Unknown fields are dropped by `clean()`.
- `migrate` runs once per rules bump and is idempotent; §B.6 has the algorithm and its guarantees.
- Prefs `graph-fun.prefs.v1` gain `varsTip: boolean`.

---

## F. UI layout and copy (where it isn't covered above)
- **Result dialog headline** (challenges) uses `beatsBot`, so a perfect score against a perfect bot shows "You beat the bot!". Lesson headlines are unchanged ("Perfect!", "Great line!", "All dots!", "All dots — but too long", …).
- **Facts:** Length rows per §B.7. With variables, the formula block comes before the facts.
- **Canvas aria-label:** unchanged, plus ", a = 1.3, b = 0.79" when variables are used.
- **Status, when a variable first appears while the virtual keyboard is open (coarse pointer):** `Slider for a below — hide the keyboard to drag it.` Shown once per visit.

---

## G. Tests

All of these are implemented and pass in the scratch copy. Port the test files from it (§K).

**Changed**
- `scoring.test.js`:
  - scoreAttempt table (§B.3 values; `lengthFactor` in the result); `RULES` deep-equal; `CHALLENGE` constants without `lengthExponent`.
  - challengeScore table: L = 1.5P → 752, 2P → 623 (`lengthFactor === g(2)`), 3P → 294; the rest unchanged.
  - `evaluateAttempt` gains `lengthFactor === 1`.
- `formula.test.js`:
  - The `variables` kind list becomes `['kx','x^2y','\theta','sinx','cosx','a2']` ('ax' is now valid).
  - Message `Only x and a–d can be variables (found: k).`; `cosx` detail `['o','s']`; the `a2`/`x2` messages.
  - `CHALLENGE_SYMBOLS` gains a–d.
- `gameplay.test.js`:
  - Staircase `\frac{1}{2}\lfloor x\rfloor+1` → **976**, 1★ (both places it's asserted).
  - The statuses test uses `'kx'` instead of `'ax'`.
- `challenges.test.js`:
  - "a tie goes to the simpler formula" becomes a unit test of `gen.better`: fewer decimals wins, then smaller size; a higher score always wins. Plus every bot has ≤ 3 decimals.
  - "bot reproduces" also asserts `params: []`, and that c07's perfect bot formula has `beatBot === true` when the bot score is 1000.
- `storage.test.js`: every entry literal gains `bestVars: null, lastVars: null, hints: 0`; the saved JSON has `rules: 0`.

**New**
- `scoring`:
  - `lengthFactor` table (§B.1), edge values (∞, NaN, −1, undefined → 0), monotone; `LENGTH`, `RULES_VERSION`.
  - **The guarantee**: for n 2–10, all h, r₁ ∈ [0.5, 3], r₂ ∈ [0.5, 1.5], the rounded score strictly increases.
  - `beatsBot`.
- `formula`:
  - `params`, `bind`, defaults, and that binding doesn't change `fn`; 13 implicit-multiplication cases (`ax`, `abx`, `a\cdot b`, `ab`, `\sin(bx)`, `a(x-b)^2+c`, `x^a`, `\frac{a}{x-b}`, `c(x)`, `a sin(bx)`, `a*sin(b*x)+c`, `abs(x-a)`, `dx`).
  - Function names containing a–d (`cos sec csc cosh abs acos asin atan ceil \arccos exp`) have `params: []`; derivative and integral keep their d.
  - `\differentialD`; `substitute` (6 examples + invalid + empty).
- `gameplay`:
  - The **one-more-dot regression pairs** (semicircle, downhill, sine, c17 — §B.4 with exact old and new scores).
  - `evaluate` binds vars, reuses the cached formula, only reports used vars, falls back to defaults.
  - The c12 bot rebuilt with sliders scores exactly the bot at the same size; `kx` is rejected on a challenge.
- `challenges`:
  - The sgn staircase through every dot < 0.7 × bot.
  - `3\sin(10x)` and `6\sin(5x)` ≤ 0.02 × bot on every challenge (observed max 0.005).
- `sliders.test.js` (new): defaults and range; decimal-clean values for every step, offset and k (including 0 + 3·0.1 = 0.3); clamping; centre, step and offset; save and restore.
- `storage` (merge the scratch `storage-v3.test.js` into `storage.test.js`):
  - The blank shape; vars kept with their formula; `setLast` without vars clears `lastVars`; invalid vars dropped; unknown step → 0.1.
  - Hints are monotone, persisted, and cleared by reset.
  - Old data reads as `rules: 1`, an empty store as 0.
  - `migrate`: re-scores through the engine (slope 579 → 976; the variable best `a\sin x` with a = 3 → 1000/3★); skips the sandbox and unknown ids; stars never drop; runs once; a fresh store migrates without calling rescore; `reset` keeps the current rules.
- `levels.test.js`: every lesson's `prompt` starts "Find a function whose graph goes through all N dots.", names no family (regex of family words, no `<math-span>`), and mentions walls exactly on wall levels; the exact tan prompt.
- `keyboard.test.js` (new, UI owner): four rows of exactly 10 widths, counting the 1.5 defaults; contains x, a–d, π, e and the editing keys; clear is a long-press on backspace.

Expected total: **108 tests**.

**Browser checks (UI agent, Playwright MCP over HTTP; delete `.playwright-mcp/` afterwards, in the project and anywhere else it appears):**
1. Boot ok, no console errors.
2. Lesson 13: prompt only → hint 1 (chip + blurb) → hint 2 → button gone; reload keeps them; a cleared level opens with hint 1.
3. Lesson cards show `y = ?` until 1★.
4. Type `a\sin(bx)` with the keyboard (a/b keys) → two slider rows; drag a → the curve and score update live; the step select re-centres; offset typing; centre; lock in → the dialog shows `y = 2\sin(0.8x)` and "a = 2.0 · b = 0.8".
5. Reload → sliders restored.
6. Plain mode `a*sin(b*x)` works; `cosx` gives the brackets hint.
7. 390×844 and 375×667 with the keyboard open: drag a slider → the keyboard hides without the slider jumping under the pointer.
8. Typing `2dx` stays `2dx`.
9. Dark mode screenshot.
10. Seed localStorage with v1 data (e.g. slope best `\frac{1}{2}\lfloor x\rfloor+1` at 579 and 1★) → after boot the card shows best 976 and still 1★, and the stored `rules` is 2.
11. c07 bot formula → "You beat the bot!".

---

## H. README changes
- **How to play:** add a bullet: "Use a, b, c and d as sliders: type `a\sin(bx)` and drag the sliders that appear to see the effect. Each slider has a step (1, 0.1, 0.01, 0.001) and an offset (its middle value); **centre** moves the offset to the current value so you can zoom in."
- **Scoring:** replace bullets 1–2 with the §B.7 lesson rules, including the length-factor table "×0.98 at 125%, ×0.94 at 150%, ×0.78 at 2×, ×0.37 at 3×, ~0 beyond 5×", the stars-by-length rule and "one more dot always pays as long as your line stays within 1.5 × par". Mention hints: "Stuck? Hint 1 names the kind of function, Hint 2 gives a nudge."
- **Free play challenges:** the length bullet uses the new factor; the size bullet adds "a–d count 1 each, like a number"; the allowed-functions paragraph mentions a–d; the bot paragraph adds "a perfect 1000 against a perfect bot counts as beating it".
- **URL options:** the `?plain` example adds `a*sin(b*x)` and the asin note.
- **Project layout:** add `js/sliders.js  slider maths for the variables a–d`.
- **Saved progress:** "When the scoring rules change, your saved bests are re-scored automatically the next time you open the game."
- Mention `PLAN-v3.md` next to PLAN.md and PLAN-challenges.md.

---

## I. Risks
- **Touch devices are unverified for the range focus behaviour** (no touch hardware here; Playwright reports `maxTouchPoints: 0`). iOS may not focus a range on tap, so the field might stay focused. Either way the freeze approach is safe; check on a real phone.
- **Flat near the reference:** within the 3★ band scores are 999–1000, so short-line polish shows up in stars (lessons) or not at all (challenges, where 3 bots are ≥ 996). This is a deliberate consequence of the guarantee; `beatsBot` covers the perfect-bot case.
- The triangle wave beats the bot on 5 challenges (4 before). This is intentional and documented in PLAN-challenges §11.C.
- **Re-baking depends on exact float behaviour:** if the sampler or compile changes, re-run `--write` (21 s; dots never move).
- Boot migration costs about 300 ms once on slow phones. It is synchronous and behind the loading screen.
- MathLive shortcut removal must happen inside the existing `mount` handler. Pasted `\differentialD` is covered by normalisation.
- Long substituted formulas in the dialog must wrap per term (reuse `latexTerms`).
- Plain `asin(x)` is arcsin (documented in the tip).
- An old tab writing old-rule scores causes a harmless re-score on the next boot.

---

## J. Work split (two parallel agents)

**Logic agent** owns `js/scoring.js`, `js/formula.js`, `js/engine.js`, `js/sliders.js` (new), `js/storage.js`, `js/levels.js`, `tools/gen-challenges.js`, `js/challenges.js`, `test/*.test.js` except `keyboard.test.js`, and `README.md`.

Order (port from the scratch copy at each step, run `npm test` after each):
1. **First, within minutes**, land the contracts the UI codes against: the `scoring.js` exports (`lengthFactor`, `RULES`, `RULES_VERSION`, `beatsBot`), the `formula.js` variables (`VARIABLES`, `DEFAULT_VALUES`, `params`, `bind`, `substitute`), `engine.evaluate(…, vars)`, `js/sliders.js`, the storage API (`revealHint`, `migrate`, the vars fields) and `levels.prompt`.
2. Update and add tests for scoring, formula, engine, sliders, storage and levels.
3. Make the `gen-challenges.js` changes, then run `node tools/gen-challenges.js --write` and check the output is byte-identical to the scratch `js/challenges.js` (diff it). Then update the challenge and gameplay tests.
4. README.

**UI agent** owns `index.html`, `css/style.css`, `js/app.js`, `js/keyboard.js`, `test/keyboard.test.js`, and the browser checks.

Order:
1. `keyboard.js` and its test (independent).
2. index.html and CSS skeleton: the hints markup, the vars panel, the tip, the result-formula block, the copy.
3. app.js hints flow (needs `levels.prompt` and `store.revealHint`; stub until step 1 of the logic agent lands).
4. app.js sliders: panel, state, rAF evaluation, freeze, save, lock-in, result block, thumbnails, `setVar` hook.
5. app.js scoring copy, `beatsBot` and `RULES`.
6. Boot migration.
7. Browser checks (§G).

The UI agent can start immediately by copying `js/sliders.js` from the scratch copy if the logic agent hasn't landed it yet; the APIs are final.

Shared rule: neither agent edits the other's files. Interface questions go through this plan.

---

## K. Prototype scripts and artefacts (scratch copy)
Root: `/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/v3-plan/`. `node_modules` is a symlink to the project's; nothing was installed.

**Reference implementation** (all 108 tests pass; diff against the project to port):
- `js/scoring.js`, `js/formula.js`, `js/engine.js`, `js/sliders.js` (new), `js/storage.js`, `js/levels.js`, `js/keyboard.js`
- `tools/gen-challenges.js` and the re-baked `js/challenges.js`
- `test/scoring.test.js`, `test/formula.test.js`, `test/gameplay.test.js`, `test/challenges.test.js`, `test/storage.test.js`, `test/levels.test.js`, plus the new `test/sliders.test.js`, `test/storage-v3.test.js` (merge it into storage.test.js) and `test/keyboard.test.js`

**Prototype scripts** (`proto/`; the scripts that toggled shapes read the now-removed `GF_G` switch and run with the final g):
- `ce-vars.js` — CE probe with a–d declared.
- `subs2.js` — the display substitution.
- `perf.js` — compile versus per-frame cost.
- `lessons-cal.js` + `lesson-sets.js` — lesson refs, alternates, decoys and wiggles.
- `challenge-table.js` — challenge balance and exploit families (§B.5); results in `table-old.json` and `table-exp:2.0:2.json`.
- `transitions.js` + `trans-eval.js` — nudge moves; `transitions.json`.
- `family-trans.js` + `family-eval.js` + `g-candidates.js` — family-best one-more-dot pairs; `family-trans.json`.
- `examples.js` — the concrete examples in §B.4.
- `challenges.orig.js` — today's bots; `challenges-final.js` — the new bake; `gen-final-*.log`.

**Screenshots:**
- `kb-open-390.png` — keyboard open with sliders.
- `kb-optionB-390.png` — the chosen layout.
- `kb-optionA-390.png` — the rejected tab layout.
- `kb-optionB-longpress.png`
- `vars-mock-390.png`, `vars-mock-1280.png`

---

## L. Review amendments (AUTHORITATIVE — override anything above that conflicts)
An independent reviewer re-verified the plan in its own copy (`/tmp/claude-1000/-home-dylan-code-graph-fun/aed0d29e-26bb-4832-aa60-8b654c8b2f40/scratchpad/v3-review/`, scripts in `rv/`): g values and guarantee bounds correct; random-family sampling (~770k lesson pairs, ~1.1M challenge pairs, size ≤ 15) shows 100% score rises for longer lines < 2× ref; wiggles 0 everywhere; lesson stars monotone in score; migration keeps sandbox/unknown/invalid entries; all §C.1 CE/MathLive facts hold; sliders decimal-clean; drag frame 0.4–1.3 ms. The changes below were decided by the orchestrator.

### L.1 Length factor: keep a small slope at the top
Replace B.1's g with `g(r) = 1` for r ≤ 1, else `g(r) = exp(−0.056·(r−1) − 0.222·(r−1)²)`. Values: g(1.04)=0.997, g(1.25)=0.973, g(1.5)=0.920, g(2)=0.757, g(3)=0.368. Guarantee holds up to r₂ = 1.57 at n = 10 (state the per-n bounds in the copy/tests). Rationale: shorter lines still edge ahead near par, so bots don't sit at 1000 and stay beatable. Update every table/test that used the old g.

### L.2 Formula-size factor: soften it the same way (challenges)
The reviewer showed the hard `min(1, 15/size)` still causes "more dots, lower score" when the extra term pushes size past 15 (only 53% of such moves raise the score; e.g. c08 step+line 5/7 = 714 → two steps + line 6/7 = 676). That's the same disappointment the user described, so: `sizeFactor(s) = 1` for s ≤ 15, else `exp(−((s−15)/10)²)` (16: 0.99, 17: 0.96, 19: 0.85, 21: 0.70, 25: 0.37). Big mechanical chains get crushed harder (chain max 0.72 → ≈0.37 × bot; sgn staircase 0.64 → ≈0.17). Re-bake bots with L.1 + L.2 and re-validate/adjust the challenge assertions (chain, flat, wiggles, nudges, exploit families) with numbers. Copy: "Short formula. The first 15 symbols are free; a few more cost a little, many more cost a lot."

### L.3 Bot re-bake must never regress
`searchBot` also judges + hill-climbs the currently baked `level.bot.latex` (when present) and adds it to `finals` before the final sort, so a re-bake can never pick a formula that scores below the old bot's formula under the new rules (today c12 old 990 vs new 989, c15 661 vs 660). Re-run `--write`; refresh the B.5 table in this file.

### L.4 Challenge stars can drop after the re-bake — say so
"Stars never drop" holds only for lessons. Challenge stars are computed vs the (stronger) re-baked bots: 7/20 previously-matched challenges would show fewer stars. Wording everywhere: "lesson stars never drop; challenge stars are measured against the retrained bots". When the rules-2 migration runs and at least one challenge entry with a best score existed, show a one-time dismissible note on the levels screen: "Scoring got gentler on long lines and big formulas, and the bots retrained — some challenge stars may have changed." Store `prefs.rulesNoticeSeen = 2`. README "Saved progress" gets one line about this.

### L.5 Migration guards (rescoreEntry)
Return null (keep the entry unchanged) when (a) `ev.curve && ev.curve.timedOut` (heavy formulas could time out on phones and be re-scored to 0), or (b) `ev.formula.params.length && !entry.bestVars` (an older tab may have stripped vars). Correct B.6: an older cached build still open in another tab is NOT harmless — its `clean()` drops `bestVars`, `lastVars`, `hints`; guard (b) prevents wrong re-scores; accept the minor loss.

### L.6 Substituted LaTeX
Use `ce.box(json, {canonical:false}).toLatex({prettify:false, digitGroupSeparator:''})` (default `.latex` groups digits `1.234\,5`, rewrites `x^{-1}` → `\frac{1}{x}`, reorders terms). `latexTerms` (top-level term splitter used for wrapping) must track `(`/`)`, `[`/`]`, `{`/`}`, `\left`/`\right` and toggle on `|` / `\vert`, so it never splits inside brackets or bars; no stray `\:` spaces. Test on the C.5 examples + `a\left|x-b\right|+c` + nested brackets.

### L.7 Copy / call sites for the bot comparison
Every place that compares to the bot uses `beatsBot`/`matchesBot` helpers — including `challengeNote` (its `best > bot` / `best === bot` branches) and headlines. If, after L.1–L.3, any bot still scores 1000, keep the "1000 vs perfect bot counts as beating" rule with the headline "Perfect 1000 — the bot can't beat that!" and note "Perfect score — nothing beats 1000."; otherwise drop the special case.

### L.8 Error messages for hint letters and plain-mode function names
- Unknown letters: append " Use a, b, c or d to get a slider." (e.g. "Only x and a–d can be variables (found: h, k). Use a, b, c or d to get a slider."). Keep the Hint-1 chips' conventional letters (m, h, k, A, B).
- Plain mode: an "Unknown function “bsin”"-style error where the name is `^[a-d]+(sin|cos|tan|sec|csc|cot|ln|log|exp|sqrt|abs|sgn)$` → "Write b*sin(x) or b sin(x)." (with the actual letters/function).
- Normalise `\mathrm{d}` → `d` (pasted LaTeX), alongside the `\differentialD` normalisation.

### L.9 Sliders: typed step, not a fixed list
The user asked for "a step and offset value" per slider → the **step is a typed number input** (default 0.1; any finite value in [1e-6, 1000]; invalid reverts), same as offset. Drop `STEP_OPTIONS`; `decimals(s)` = max(decimals of offset text, decimals of step), ≤ 6; storage `step` = any positive finite number (`clean()` clamps to the range, else 0.1). `setStep` still re-centres on the current value. Both inputs use `inputmode="text"` + `enterkeyhint="done"` (iOS's decimal keypad has no minus key) and accept U+2212 and comma decimals. Keep the ±20-step range and the centre button. Desktop: keep `.var-set` on one line (no wrapping of "centre" at 1280).

### L.10 Contracts the UI must follow
- At `showGame`, build all four slider states (from `rec.lastVars`, else `sliders.create(name)`); always pass `GF.sliders.values(state)` for all four to `evaluate`, so a newly typed variable uses its remembered slider on the first frame. Rows are shown only for `ev.formula.params`; save/record only those.
- `lockIn` staleness compares `ev.vars` with `values(state, ev.formula.params)` by value.
- Thumbnails: `thumbSvg`'s freshness check uses the same `formula|values` key as `queueThumbCurve`.
- `boot()` adds `'sliders'` to its `need` list.
- Sliders work in the sandbox (natural place to explore) and in `?plain`.
- Challenge Length chip/status warnings use `lengthFactor < 0.995` (as lessons do), not `L > P`.
- `#status` (aria-live): during a drag, update the text at most on range `change` (or throttled ≥ 500 ms); the range has `aria-valuetext`.
- Show the "slider below — hide the keyboard" style tip only when the panel is actually hidden behind the keyboard.

### L.11 Keyboard layout (replaces C.7 rows 3–4)
```
R3: e(long-press e^□)  1  2  3  −  a  b  c  d  ⌫
R4: (  0  .  )  +  ←  →  clear  hide  ↵
```
Visible `clear` (touch has no tooltip discoverability for long-press); `e^□` becomes a variant of `e` (e then x^□ also works). All widths 1 (set explicitly for backspace/hide/return). Update the keyboard test.

### L.12 Lesson copy
Result headline when all dots are hit but 0★ (e.g. 957 points): "All dots! Shorten the line for a star." The "points vs stars" explanation stays as planned.

### L.13 Final QA changes
- **Drag frames get a 40 ms sampling budget** (full evaluations keep 300 ms). A heavy formula (e.g. `\sum_{n=1}^{20000}\frac{a\sin(nbx)}{n^2}`) took ~300 ms per frame, so a drag ran at ~3 fps. A frame that finishes in time is exactly the full evaluation (the sampler is deterministic; a test checks this); one that runs out is marked `live`, shows "Measuring…" and `…` stats, and the full evaluation follows 150 ms after the last such frame. Range `change` evaluates at once unless the last evaluation took > 40 ms. Lock-in re-evaluates a `live` evaluation, so scores never come from a reduced budget.
- Step/offset widths are in `ch` (offset 7.5ch, step 5.5ch) and the settings line spans the whole row, so `−12.345` / `2.000001` fit on one line at 320–1280 px (touch screens keep 16px text: 7 characters fit everywhere, 8 from 360 to 860 px).
- Enter in a step/offset field applies it (retyping the same offset still moves the value back to it); a second Enter locks in on a computer, as the status line says. A typed but uncommitted step/offset is also applied when leaving the level.
- Factors just under 1 show 3 decimals (`× length 0.998 = 799`, not `× length 1.00 = 799`).
- `substitute` no longer prints `(-0.5)-x^2`, `x-(-1.5x)` or `0-x^2` (now `-0.5-x^2`, `x+1.5x`, `-x^2`).
