---
name: write-code
description: "Use before writing or changing ANY code in this repo — engine, app, shells, server, scripts, tests. Owns every rule about the code itself: what a comment is for and the COMMENT PRUNING pass that strips history references and promotes the lessons worth keeping, leaving the tree cleaner than you found it (every warning, every needlessly bad algorithm), the sub-second edit loop, the 1000-line file cap, the test conventions, and the generic pools and import aliases. Load it alongside the skill that owns the SUBJECT — this one is about the code, that one is about the thing."
---

# Writing code

Load this **whenever a task will change a source file**, alongside the skill
that owns the subject (`engine-system`, `weapon-system`, `menu-design`, …).
That one knows what you are building; this one knows how code is written here.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs write-code --list`, then the ones your task
touches (`--scope=…`, `--concepts=…`). Reflecting them back before the commit
is the `skill-reflection` skill's job; load it at both ends of the session.

**Where a given piece of code GOES is not this skill's question** — that is the
"Where new code goes" and "The rules that bite in every task" tables in
`AGENTS.md`. Read those first when the location is in doubt; come back here for
how the code inside the file reads.

---

## Comment pruning

The comments in this repo carry real design reasoning and are worth having.
What they should not carry is **the history of how the code got here** — and
they are full of it: hundreds of "it used to be", "the old behaviour", "this
replaced", "previously". Every one of those is already in the repo's history,
told better and with the diff attached.

### Where it comes from — so stop doing it

An agent changes a number and writes a comment narrating the change. That reads
perfectly at the moment of writing and is landfill a month later, because the
reader has no idea which "used to" is from which change or whether any of it is
still true.

> **The commit message and the PR description are where a change is narrated.
> A comment is where the code that is there is explained.**

Write the comment for somebody who has never seen the previous version, because
that is who reads it.

### Prune what you touch

Pruning is **opportunistic, not a sweep**: when you open a file to change it,
prune the comments in it. Do not go hunting the whole tree unless the task is
explicitly a pruning pass — and if a prune balloons past the change that
prompted it, split it into its own commit so the real diff stays readable.

### The decision table

| The comment says…                                                                          | Do                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| How the code works, why a number is that number, what a caller must not do                 | **KEEP** — this is the comment doing its job                             |
| What the code USED to be, and nothing else                                                 | **DELETE**                                                               |
| A live rule, *justified by* what it used to be                                             | **REWRITE** — keep the rule, restate the reason in the present, cut the story |
| A rule bigger than this file (a seam, a budget, a trap in another module)                  | **VALIDATE**, move it to a lesson fragment or the doc that owns it, then delete |
| Commented-out code                                                                         | **DELETE**                                                               |
| A restatement of the line below it (`// increment i`)                                      | **DELETE**                                                               |
| A `TODO`/`FIXME` whose condition has already been met                                      | **DELETE** — do the thing or drop the note                               |

**The third row is the one that matters, and the one a careless pass gets
wrong.** History is usually *welded to* a real rule rather than standing alone,
so deleting the paragraph deletes the reasoning with it. Keep the claim; drop
the narrative:

```diff
-// AND THE SHIFT POINT IS NOT THE REDLINE. It used to be, and that one shortcut
-// was the whole of why the dashboard read like nothing anybody has ever driven:
-// the crank was held against the stop in every gear and a wagon pottering along
-// at forty was sitting in the red paint. A real driver with the pedal flat
-// changes up JUST PAST THE POWER PEAK — one more rev buys less at the tyre than
-// the next ratio does — and the redline is the limit behind that, a thing you
-// are told about rather than shown.
+// AND THE SHIFT POINT IS NOT THE REDLINE. A driver with the pedal flat changes
+// up JUST PAST THE POWER PEAK — one more rev buys less at the tyre than the
+// next ratio does — and the redline is the limit behind that, a thing you are
+// told about rather than shown. So `shiftUpRpm` and `redlineRpm` are two
+// different numbers and the needle never reaches the second.
```

Same rule, half the words, and it no longer describes a car that does not exist.

### Moving a lesson out of the code — VALIDATE FIRST

Some history comments are load-bearing: they are the only written record of a
trap that bites somewhere else in the tree. Those get promoted rather than
deleted — but **a comment is not evidence.** It was written against a version of
the code that is gone, and the thing it warns about may already have been fixed,
renamed, or made impossible. **A false lesson is worse than no lesson**, because
the next session obeys it.

Three gates before anything leaves a comment and becomes a fragment:

1. **Is it still TRUE?** Prove it against today's code — read the function it
   names, run the test that would fail, `grep` for the pattern it forbids. If
   the claim names a symbol or a file that no longer exists, it is not a lesson;
   it is a delete. **When a comment names a symbol, grep for it first** — it is
   one second and it settles the question outright. A symbol whose only
   remaining hits are other comments is a GHOST, and ghosts travel in packs:
   one deleted function had its name kept alive in four comments across four
   files, each explaining the absence to a reader who never knew it existed.
   Sweep every hit in one pass, or the next session finds the survivors and
   assumes the thing is real.
2. **Is it bigger than this file?** A rule that only explains the function it
   sits above stays a comment. Promote only what a session working in a
   *different* file would need and would not find.
3. **Does something already say it?** Check `AGENTS.md`, the doc named in its
   sync table, and the owning skill's `SKILL.md` and lessons
   (`node scripts/skill-lessons.mjs --scope=<path>`). A rule in two places
   drifts, and then neither is trustworthy.

Then write it where it belongs — the doc if `AGENTS.md`'s sync table names one,
otherwise a lesson fragment on the skill that owns the subject. The
`skill-reflection` skill owns the fragment format (`title`, `date`, `scope`,
`concepts`) and the size bar; keep the fragment short, and scope it to the
narrowest path where it stays true. Only then delete the comment.

### Finding them

```sh
grep -rnE '(//|\*) ?.*\b(used to|previously|formerly|originally|no longer|we once|old behaviou?r|this replaces|renamed from|before the refactor)\b' --include='*.ts' --include='*.tsx' --include='*.mjs' <path>
```

Read every hit — the phrase is a *candidate*, not a verdict. "No longer" is
often a live statement about how the code behaves today ("a shut door no longer
blocks the walker"), and that one stays.

---

## What a comment is for

- **The WHY, not the WHAT.** The code says what it does. A comment earns its
  place by saying what the code cannot: the reason for a number, the invariant a
  caller must not break, the thing that looks wrong and is deliberate.
- **Units and ranges on every tuning number** (world px, ms, hp, 0–1).
- **Match the file's density and voice.** This repo's engine and config modules
  are deliberately prose-heavy, and that is the house style — pruning is about
  HISTORY, never about stripping a file back to bare declarations. A file whose
  neighbours all carry a block header gets one too.
- **Name the failure a rule prevents.** "Bump `obstaclesVersion` or the bot
  routes through the new wall" beats "remember to bump the version".
- Comment in `engine/` with the knowledge that a mod author may read it.

---

## Leave the tree cleaner than you found it

- **Fix every error and warning you encounter, even ones you didn't cause.** A
  `make lint` / `make test` / typecheck run that surfaces a pre-existing error
  or warning (a generator's `!` warning included) is part of the job: fix it in
  the same session rather than working around it or reporting it as "not mine".
  The baseline is zero errors and zero warnings — anything above zero hides the
  next real regression.
- **Fix inefficient algorithms on sight.** A needlessly bad complexity or a
  wasteful hot-path pattern (an O(n²) scan a hash or grid would collapse, a
  per-call recomputation of an invariant, a per-frame allocation in a loop
  running at 60 Hz) gets fixed even when it is unrelated to the task. Keep the
  fix behaviour-preserving, verify it with the relevant tests or a quick
  benchmark, and mention it in the PR description.
- **Prune the comments in what you touch** (above).
- Never widen the scope past this. Refactoring a module you merely read is not
  leaving the tree cleaner; it is a second PR.

---

## The edit loop

Whole-repo checks cost the same whether one file changed or four hundred did —
`make lint`, `make test` and `make build` each open by rebuilding the entire
content tree. **They are the GATE on the commit, not a step on the way to it.**
While iterating, check only what you touched; all of these are sub-second:

| Just edited                  | Run                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| a `.ts`/`.tsx`/`.mjs` file   | `npx eslint <paths>`                                         |
| anything type-bearing        | `npx tsc --noEmit -p tsconfig.json` (or `pwa/tsconfig.json`) |
| a test's subject             | `npx vitest run tests/<that-one>_test.ts`                    |
| formatting you are unsure of | `npx prettier --check <paths>`                               |
| a sprite grid                | `make assets` — the one generator worth re-running alone      |

The full gate, split by cost, belongs to the `commit` skill — load it when the
work is done. Two of its rules are worth carrying into the edit loop: verify
with `make test`, **never** a bare `npx vitest run` (which skips the content
rebuild and lets a stale artifact agree with an equally stale build), and run
`make fmt` before the commit is written.

---

## File size

- Non-test source files stay under **1000 physical lines** (§20.5 of
  `OSS_GAME_SPEC.md`). Past the cap, split by concern — sibling modules,
  extracted helpers — rather than relaxing it. A file that big is nearly always
  doing more than one thing.
- The escape hatch is `game-spec:allow-large-file: <reason>` in a comment within
  the file's first 20 lines, and the reason must genuinely motivate the size
  (generated code, one cohesive state machine, a third-party snapshot, an
  inherently dense rule catalogue). "It is long" is not a reason.
- Splitting a file is also the moment to prune it: a 1100-line module usually
  has 100 lines of history in it.

---

## Tests

- **Tests live in their own files, never inline in source** — no
  `#[cfg(test)]` blocks, no `if __name__ == "__main__"` harnesses. Source files
  stay free of test scaffolding.
- Named with a `_test`/`_tests` suffix (`output_test.ts`); the stem matches
  `_?[Tt]ests?$` per §20. They live in `tests/` and run under **Vitest**. The
  include pattern (`tests/**/*_test.ts`) is in `vitest.config.ts` — keep it in
  lockstep with the naming rule.
- **`tests/engine/` vs `tests/content/`.** Engine-rule suites go in
  `tests/engine/` and run against the **synthetic fixtures**
  (`tests/engine/fixtures.ts`, ids like `test_level`/`test_minion`) installed
  through `registerDefs`, so they survive content deletion — such a test must
  not reference a shipped content id (`fists`, the engine's built-in EMPTY HAND,
  is the one shared exception). This-game content suites (levels, story, bosses,
  the sprite atlas) go in `tests/content/` and use the shipped catalogs via
  `tests/helpers.ts`; a sequel deletes and rewrites those. Lib tests
  (`chiptune`, `synth`, `output`, …) stay at the `tests/` root.
- Assert the rule you claim. "Cooldown blocks the second hit" is a claim and
  owes an assertion.
- **Prove a regression test can FAIL, and prove its staging holds.** Stash the
  fix (`git stash push <src>`) and re-run: a test that stays green was never
  guarding the bug. And a test that STAGES a precondition — a walled-off spot, a
  shut door, a disarmed hero — owes an assertion that the precondition really
  holds, in the test, beside the one it exists for. Both fail the same way:
  green, forever, over a rule that is gone. (A ring of obstacles staged to seal
  a fixture spot enclosed the hero standing beside it too, so "the walker is
  reachable" was true because nothing was ever sealed.)
- **The Tauri shell is Rust and obeys the same two rules through its own
  toolchain** (§20.3): integration tests in `tauri/<crate>/tests/*_test.rs`,
  never a `#[cfg(test)]` module — which is also why every decision worth testing
  lives in the `adastrail-shell` library crate. Run them with `make tauri-test`;
  the root suite does not reach them.

---

## The generic pools, and the aliases

- **Keep generic game code separate.** Anything not specific to THIS game (HUD
  widgets, input handling, game-loop utilities, sprite/audio helpers) goes in
  `engine/lib/` (engine-side) or `pwa/src/lib/` (UI) — never tangled into a
  game-specific module. Those pools are what a sequel keeps as-is.
- **Import them through their aliases** — `@game/lib/*` and `@ui/lib/*`, never a
  relative path. The alias maps live in `tsconfig.json`, `pwa/tsconfig.json`,
  `vitest.config.ts` and `pwa/vite.config.ts`, and **two more copies bite**:
  `scripts/game-alias-loader.mjs` (how a plain `node` script imports an aliased
  module) and `tests/content/net_reachability_test.ts` (which resolves them to
  walk the import graph). A new alias missing from either is a script that
  cannot start, or a budget guard that silently stops following an edge.
- **The app renders with Preact and still spells it `react`.** `react`,
  `react-dom` and `react-dom/client` are aliased to `preact/compat`, so a
  component keeps importing `useState` from `"react"`. React is NOT installed —
  `tests/preact_renderer_test.ts` keeps it out, because its react-dom would
  silently eat ~50 KB of the 170 KB critical-path budget. Four differences, all
  settled by spelling it Preact's way: `RefObject<T>` already includes the null
  (`useRef<HTMLDivElement>(null)`); an event type is generic in the element
  (`PointerEvent<HTMLElement>`, and `e.currentTarget` is the typed half);
  `useSyncExternalStore` takes two arguments; and `autoFocus` is not a typing
  difference but a **missing implementation** — use `useAutoFocus`
  (`@ui/lib/auto-focus.ts`), and arm the soft keyboard from the press itself
  with `armSoftKeyboard`, synchronously, or a phone comes up focused with
  nothing to type on.
- **Every dependency comes from the public npm registry.** `npm ci` needs no
  token, no `.npmrc` and no private registry; a private dependency breaks a
  fresh clone and the pages workflow alike.

---

## Checklist

- [ ] Loaded the skill that owns the SUBJECT, and read both skills' lessons
- [ ] The code sits where `AGENTS.md`'s tables say it sits
- [ ] Comments in every file touched are pruned: no history, no dead code, no
      restatement — and every rule kept, in the present tense
- [ ] Anything promoted out of a comment was VALIDATED against today's code
      before it became a fragment, and the comment is now gone
- [ ] Every warning the session saw is fixed, not stepped around
- [ ] Files still under 1000 lines; tests in `tests/`, `_test.ts`, right subtree
- [ ] Iterated with the sub-second checks; the whole-repo gate ran ONCE, at the end
- [ ] `skill-reflection` CLOSE pass run for every skill loaded
