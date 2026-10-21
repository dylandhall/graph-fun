# Graph Fun

A small browser game about functions. Each level shows a few dots. Type a function of *x* whose graph passes through every dot, and try to do it with the shortest line you can. When you've learned the moves, the **Free play** section has 20 random-dot challenges with no single right answer.

**Play it online at <https://dylandhall.github.io/graph-fun/>.**

## How to play

- Type your function in the field under the graph, for example `2x+1`, `\frac{1}{2}x^2-3` or `3\sin(x)`. The graph, dot hits, length and score update as you type.
- Every dot you hit turns into a green disc with a check mark. Missed dots stay hollow rings.
- Use *a*, *b*, *c* and *d* as sliders: type `a\sin(bx)` and drag the sliders that appear to see the effect. Each slider has a **step** (any number from 0.000001 to 1000; 0.1 to start) and an **offset** (its middle value; typing one sets the slider to it). The slider reaches 20 steps either side of the offset, and **centre** moves the offset to the current value so you can switch to a smaller step and zoom in. *a* and *b* start at 1, *c* and *d* at 0.
- Stuck? A lesson starts with just the dots. **Hint 1** names the kind of function, **Hint 2** gives a nudge. Once you have a star, Hint 1 stays open.
- When you are happy, press **Enter** (or **Lock in**) to record the attempt.
- On a phone or tablet, the maths keyboard opens when you tap the field. On a computer, use your normal keyboard or the keyboard button inside the field.

### Scoring

Score = 1000 × (dots hit ÷ dots) × length factor × wall factor.

- **Hit every dot.** Each dot is an equal share of the 1000 points, so one more dot is worth more than a slightly shorter line: it always pays as long as your line stays within 1.5 × par.
- **Short lines score best.** Up to par the length factor is 1. After that points drop slowly, then fast: ×0.97 at 125% of par, ×0.92 at 150%, ×0.76 at 2×, ×0.37 at 3× and about 0 beyond 5×, so lines that wiggle all over the screen score nothing.
- **Stars are for the line.** They need every dot and no red wall crossed: ★★★ within 5% of par, ★★ within 25%, ★ within 41%. Points are for dots, stars are for a short line, so a long line through every dot can score over 900 with no star. On levels with red walls, the graph must not cross a wall inside the view, so it has to jump (like `1/x` does at 0); each wall crossed halves the score.
- **Par** is the length of our reference answer. Parts of the graph that leave the screen count their width, and jumps count their height, so wiggling off-screen or faking a curve with steps doesn't pay.
- Your best attempt on a level is the one with the most stars, then the highest score.
- One star unlocks the next level.

### Free play

The **Free play** section, below the levels, is always open. It starts with the **Sandbox**, which has no dots and no score, so you can graph anything and see how long its line (and its formula) is. Then come the challenges.

### Free play challenges

Twenty challenges, C1 to C20, each with 5 to 10 random dots. No formula hits them all neatly, so it's a creative puzzle: you don't need every dot, and the score multiplies four things:

score = 1000 × (dots hit ÷ dots) × length factor × size factor × wall factor

- **Dots.** Every dot you hit counts.
- **Length.** The *dot-to-dot* length is the path straight from dot to dot (left to right), plus flat runs out to both edges of the view. No curve through every dot is shorter. Up to that length it's free; after that the same length factor as in the lessons applies, with dot-to-dot in place of par (×0.92 at 1.5×, ×0.76 at 2×, ×0.37 at 3×).
- **Size.** Each number (any number of digits), *x*, a slider letter *a*–*d* (1 each, like a number), π, e, operator (+ − × ÷ ^, including the hidden × in `2x`) and function (sin, √, |…|, sgn, …) counts 1. Brackets are free, and a minus sign in front of a number is part of the number, so `2\sin(3x+1)+0.5x-1` and `a\sin(bx+c)+dx-1` are both size 14. The first 15 are free; a few more cost a little, many more cost a lot (×0.99 at 16, ×0.96 at 17, ×0.85 at 19, ×0.70 at 21, ×0.37 at 25).
- **Walls.** Each red wall your graph crosses inside the view halves the score. `sgn` makes a graph jump: type `sgn`, or long-press the |x| key.

Challenges take ordinary functions of *x* only, plus the sliders *a*–*d*: + − × ÷, powers and roots, |x|, sgn, e^x, ln and log, sin, cos, tan (and sec, csc, cot), their inverses, sinh, cosh, tanh, max and min. Floor, mod, lists, sums, if and the like are turned down on a challenge, since they could simply store the dots. They still work in the levels and the Sandbox.

Each challenge has a **bot score** to beat. The bot searched common families of functions (lines, waves, Vs, steps, exponentials and mixes of them), and its best is baked into the level. It isn't the best possible score: no bot scores a perfect 1000, and some challenges can be beaten with ideas the bot never tries. Stars compare your best with the bot's score: ★ at 60% of it, ★★ at 85%, ★★★ when you match or beat it. The level card shows your best next to the bot's (for example `734 / bot 800`). Once your best reaches ★★, you can reveal the bot's formula.

On a challenge, your best attempt is simply the highest score.

The dots and the bot answers are generated by `tools/gen-challenges.js` (seeded, so it produces the same levels every run) and saved in `js/challenges.js`:

```sh
npm run gen:challenges                 # print the levels and the bot's results
npm run gen:challenges -- --only c07   # just one challenge
npm run gen:challenges -- --write      # rewrite js/challenges.js
```

Challenge ids (`c01` to `c20`) are the keys for saved progress, so `--write` never changes the dots or walls of an existing challenge; only the bot's answer may change. The bots already in the file are re-scored and polished too, so a re-bake never scores below them (`--seeds other/challenges.js` adds another file's bots as starting points).

### Saved progress

Progress is saved in your browser (localStorage), including the hints you've opened and your slider settings. **Reset progress** on the level screen clears it, including your challenge bests. When the scoring rules change, your saved bests are re-scored automatically the next time you open the game: lesson stars never drop; challenge stars are measured against the retrained bots, so some of those may change.

## Run it

The game is plain HTML, CSS and JavaScript with no build step. MathLive (the maths input and keyboard) and the Cortex Compute Engine (parsing and compiling formulas) load from `node_modules/`, so that folder has to be present. If it's missing, run `npm install` once.

- **Quickest:** double-click `index.html` to open it straight from disk.
- **Local server** (use this if your browser blocks scripts on `file://` pages):

  ```sh
  npm start
  ```

  Then open <http://localhost:8080>. It also prints an address on your local network, so you can play on a phone on the same Wi-Fi (your firewall must allow the port). The server (`tools/serve.py`, Python standard library only) turns caching off, so a refresh always picks up your edits, and serves the Compute Engine's `.cjs` file as JavaScript, which Safari needs. Use `npm start -- 9000` for a different port.

### URL options

- `?unlock=all`: unlocks every level for this visit, without saving that.
- `?plain`: uses a plain text box instead of the maths field. Write formulas as text, like `2sin(3x)+1`, `sqrt(x)`, `abs(x-2)`, `(1/2)x` or, with sliders, `a*sin(b*x)` (`a sin(bx)` works too, but `asin(x)` is arcsin).

You can combine them, for example `index.html?unlock=all&plain#play/sine`. Challenges open directly with `#play/c01` to `#play/c20`.

## Test

```sh
npm test
```

This runs the Node test suite (`node --test "test/*.test.js"`): formula parsing and size, the length metric, scoring, sliders, saved progress, level and challenge data (including that every bot answer still scores what was baked) and gameplay checks for every level. It needs no extra installs.

## Project layout

```
index.html        page shell and screens
css/style.css     styles, light and dark themes
js/curve.js       curve sampler and length metric
js/scoring.js     hits, walls, score and stars
js/formula.js     formula normalising, parsing and compiling (Compute Engine)
js/sliders.js     slider maths for the variables a–d
js/challenges.js  free-play challenge data (generated by tools/gen-challenges.js)
js/levels.js      level data
js/engine.js      game API used by the UI and the tests
js/storage.js     saved progress
js/render.js      canvas renderer
js/keyboard.js    MathLive virtual keyboard layout
js/app.js         boot, routing and UI wiring
tools/            challenge generator and bot search
.github/workflows/pages.yml  tests and publishes the game to GitHub Pages on every push to main
test/             Node tests
```

`PLAN.md` has the full design, including how the length metric works and why it can't be gamed. `PLAN-challenges.md` covers the free-play challenges: the generator, the bot search and the scoring calibration. `PLAN-v3.md` covers hints, the gentler length and size factors, and the slider variables.
