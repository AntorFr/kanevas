# Screen tests: the effect through its door, the display on screen

The files of `src/e2e/` drive a real browser against a real server. A browser run is slow, so
a screen test must prove only what the user sees. Everything else is proved without a browser.

## The rule

> **The effect through its door, the display on screen.**

- An **effect** is what a gesture changes in the product: a row written, a right granted or
  refused, a count recomputed, a status code, a ranking, a redirect. Its door is the API or the
  service that does it, and it is proved there: `src/routes/*.test.ts` (Fastify `inject`, as the
  existing route tests do) or `src/services/*.test.ts`. No browser.
- A **display** is what the user sees: text, layout, a state shown or hidden, a focus, a
  keyboard path, a theme, a width, an icon, the visible result right after a click. It is proved
  on screen only.

A screen test keeps the nominal path of each gesture (the visible result after the click). It
does not re-prove through the browser what a route or a service already guarantees.

## The three classes

Every test of a screen file (`describe > test`, as in `resultats.tap`) has exactly one class:

| Class | Meaning | What happens |
| --- | --- | --- |
| `affichage` | All its expectations are about what is displayed. | **Kept** as it is. |
| `effet` | All its expectations are about an effect; the screen only serves to reach it (open, click, reload, then read a datum). | **Carried over** to its door, then lightened or removed on screen. |
| `les deux` | Some expectations are display, some are effect. | **Split**: the effect goes to its door, the display stays on screen. |

When in doubt between `affichage` and `effet`: if the expectation would still be true with the
browser replaced by an `inject` call, it is an effect.

## An inventory line

Each lot writes one file, `docs/tests-ecran/lot-<name>.md` (the `lot-` prefix is what the guard reads), a Markdown table with one line per test:

```
| File | Test (`describe > test`) | Class | Door | Decision |
| --- | --- | --- | --- | --- |
| `src/e2e/fiche-titre.test.ts` | `Title > renaming survives a reload` | effet | `src/routes/fiches-titre-lot.test.ts` : `Title > renaming is persisted` | retiré |
```

- **File**: path from the repository root, one of `src/e2e/*.test.ts`.
- **Test**: the literal title path `describe > test`, exactly as `resultats.tap` and
  `scripts/rejouer-tests.mjs` name it (a test outside any `describe` is just its title).
- **Class**: `affichage`, `effet` or `les deux`.
- **Door**: for `effet` and `les deux`, the out-of-screen test that proves the effect, as
  `<file> : <describe > test>` (it must exist and be green); `—` for `affichage`. An effect
  with no door at all is **not** removed (see below).
- **Decision**: one of
  - `gardé`: the screen test is left untouched (every `affichage`, and any effect kept on purpose);
  - `allégé`: the effect expectations are taken out of the screen test, the display ones stay;
  - `retiré`: the whole screen test is deleted, its effect being proved at its door;
  - `scindé`: the screen test is split in two, the display part stays on screen, the effect part
    moves to its door (the screen test is then `allégé`, the door new).

A line may add a short reason after the decision (`gardé — no door: …`).

An expectation that has **no door outside the screen** (it exists only through the browser: a
real focus, a drag, a layout-dependent rule) is neither removed nor lightened: the test stays on
screen, the decision is `gardé`, and the line says why. Such a line is for the mandator to
rule on.

## Procedure of a lot

A lot owns a set of screen files (by name prefix), disjoint from every other lot, and one
inventory file. It never edits a file another lot may touch: its new out-of-screen tests go to
files of their own, named after the lot (`src/routes/<subject>-<lot>.test.ts` or
`src/services/<subject>-<lot>.test.ts`).

1. **List** the tests of each file of the lot (`describe > test`, literal titles).
2. **Classify** each one and write its inventory line (decision still empty or provisional).
3. **Find the door** of every `effet` / `les deux` expectation; write the out-of-screen test
   and make it pass (`node scripts/rejouer-tests.mjs "<describe > test>"`).
4. **Only then** lighten the screen test: split, lighten or remove. Never before the door test
   is green; never remove a display expectation.
5. **Replay** the touched screen files and the new tests, then the local level
   (`npm ci && npm run tests:local`).
6. **Finish** the inventory: every test of the lot has a line, every door exists, every decision
   matches the code of the branch.

Behaviour of the product is never changed by a lot, and a test of another lot's files is never
edited.

## Measuring the duration

`npm run tests:attestes` plays the whole suite and writes `resultats.tap`. Then:

```
node scripts/duree-tests-ecran.mjs resultats.tap              # per file and total
node scripts/duree-tests-ecran.mjs resultats.tap --markdown   # as a table, for avant.md
```

It prints the duration of each file of `src/e2e/` and their sum. The sum is the work of the
files, not the wall time of the run (files overlap when several run at a time). A measure always
states its machine, its concurrence and its date. `avant.md` is the measure before any rewrite.
