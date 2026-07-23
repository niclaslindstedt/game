---
name: update-story
description: "Use when the game's story changes — reshaping the plot, replacing or reworking an elite/boss, retiring a story beat, or bringing a drifted story tier back into line. Edits docs/story.md (the gist, the ground truth), then propagates the change DOWN the chain: the manuscript, the enemy roster, the story items and uniques, the pinned thoughts, and the companions — so the three tiers never drift."
---

# Updating the Story

**Governing rule (CLAUDE.md → "Story & dialogue"):** the story lives in a
three-tier chain, and every change flows **downward, never up**:

```
docs/story.md      (TIER 1 — the gist: the whole plot in prose)   ← the ground truth
      │  extrapolated into
docs/manuscript.md (TIER 2 — the script: every line, verbatim)
      │  extrapolated into
src/game/defs/**   (TIER 3 — the game: roster, items, cutscenes)
```

When two tiers disagree, **the higher tier wins**: `story.md` beats the
manuscript, the manuscript beats the data. This skill's whole job is to make a
story change at the top and carry it down so the lower tiers match — the
manuscript is an extrapolated version of the story, and the game is an
extrapolated version of the manuscript.

Use this skill whenever the STORY moves: a new plot beat, a rewritten
monologue, a replaced or reworked elite/boss (with the item and roster churn
that follows — a boss swap changes who drops what), a retired thread, or a
"the manuscript and the data drifted, reconcile them" sweep.

Do **not** use it for pure mechanics with no narrative surface (tuning hp,
retuning a drop rate, an fps fix) — those never touch the chain.

## The confirmation rule (do not skip)

Rewriting the story is a deliberate act. Edit `story.md` (and everything below
it) **only as part of an instruction that asks for the change** — the user's
request to change the story IS the confirmation, and it pre-approves the
manuscript and data edits that follow from it. Never invent a plot change on
your own, and never rewrite `story.md` to "improve" the prose without being
asked. A reconciliation sweep (bringing a drifted tier back to its parent) does
not need fresh confirmation — it is not a story change, it is a correction.

## Tracking mechanism

`.agent/skills/update-story/.last-updated` holds the git commit hash from the
last successful run. Empty means "never run" — fall back to the repository's
initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-story/.last-updated)
   ```

2. List story-relevant commits and changed files since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   git diff --name-only "$BASELINE"..HEAD
   ```

3. Decide the direction of the pass:
   - **A story change was requested** (a new/changed plot beat, a boss swap):
     start at TIER 1 — write the change into `story.md` first, then walk the
     propagation checklist downward.
   - **A drift/reconcile sweep** (the data or manuscript moved under the story
     without a matching top-tier edit — e.g. a `src/game/defs/**` diff touched
     dialogue): read all three tiers, find where they disagree, and fix the
     LOWER tier to match the higher one. If the data genuinely holds a story
     beat the manuscript and story lack, that is a change that needed
     confirmation — surface it to the user rather than silently promoting it.

## The propagation chain — what to update, in order

Walk this top-down. Each row's change forces the rows below it; never edit a
lower tier without reconciling the ones above.

| Step | Tier | File(s) | What a story change touches |
|---|---|---|---|
| 1 | Gist | `docs/story.md` | The prose beat itself — the level's two paragraphs, the intro/cutscene paragraph, the elite/boss mention. Keep the shape: one paragraph per intro & per cutscene, two per level, every elite and boss named. |
| 2 | Script | `docs/manuscript.md` | The verbatim lines the beat becomes: cutscene captions/`say`, level `intro`/`outro` monologues, each elite/boss `dialogue` (two-way, hero replies are **ME:**) and `lastWords`, apparition scenes, companion `joinWords`/`killQuotes`, `lore` pages, merchant greetings. Its own "Where the data lives" table is the authoritative map from a line to its data file. |
| 3a | Game — cutscenes & monologues | `src/game/defs/cutscenes.ts`; `src/game/defs/levels/*.ts` (`intro`, `outro`, `merchant.greeting`, `firstKillThoughts`/`firstSightThoughts` pins) | Prelude + travel scenes, per-level opening/closing monologues, merchant lines, thought pins. |
| 3b | Game — roster | `src/game/defs/enemies/<level>.ts` + `enemies/index.ts` | Elite/boss `dialogue` + `lastWords`; if a mob is **added, removed, or replaced**, its `EnemyDef` (hp/damage/role/mechanics), its registration, and any `shieldedBy`/`flees`/`spareable`/`apparition` wiring. Load the `enemy-design` skill for the numbers. |
| 3c | Game — items | `content/items/<rarity>/*.yaml` (named uniques + their `lore`/`description`), `src/game/defs/story.ts`, `EnemyDef.uniquesByDifficulty`, `LevelDef.loot.worldUniques` | Story items (keycards, dossiers, recovered hardware) and their `lore`; a boss's dropped uniques and world-drop relics. **A boss swap re-homes that boss's unique set** — the drops must follow the new owner. Load `weapon-system` for the item economy. |
| 3d | Game — thoughts | `src/game/defs/thoughts.ts` | The hero's inner monologues, pinned to a kill/sighting from a `LevelDef`. |
| 3e | Game — companions | `src/game/defs/companions.ts` (spare verdict in `src/game/companions.ts`) | Joining words + kill quotes for any rift unique that can be spared. |
| 3f | App overlays | `pwa/src/game/overlays/DialogueOverlay.tsx`, `CutsceneOverlay.tsx`, `pwa/src/game/copy.ts` | Only if the beat needs new rendering (a new scene kind) or loose UI copy; story text itself stays in the engine defs. |

### When a mob or boss is replaced

A boss/elite swap is the most far-reaching story change — it ripples across
3b–3e at once:

1. **Story + manuscript first** (tiers 1–2): rewrite the elite/boss's paragraph
   in `story.md`, then its `dialogue`/`lastWords` in the manuscript.
2. **Roster** (3b): add the new `EnemyDef`, register it, remove or repoint the
   old one. Match hp/damage to the scaling model (`enemy-design`).
3. **Items** (3c): move the departing mob's unique set and any world-drop /
   story-item drops onto the replacement (or explicitly retire them). Re-check
   `uniquesByDifficulty` coverage so no difficulty rung loses a slot — consult
   `docs/item-plan.md` for the intended per-rung sets, and `weapon-system` for
   re-homing uniques.
4. **Thoughts / companions** (3d–3e): repoint any `firstKillThoughts`/
   `firstSightThoughts` pin or companion entry that named the old mob.
5. **Achievements & tests** derive from the live registries, so run the content
   test battery (below) to catch anything the swap orphaned.

## Update checklist

- [ ] Read baseline from `.last-updated`; run `git log` / `git diff --name-only`
- [ ] Confirm the pass is authorized (a requested change) or a reconcile sweep
- [ ] Edit `docs/story.md` first (tier 1), preserving its paragraph shape
- [ ] Extrapolate into `docs/manuscript.md` (tier 2), verbatim, in narrative order
- [ ] Walk steps 3a–3f, updating every data file the beat touches
- [ ] For a mob/boss swap, run the replacement sub-checklist above
- [ ] Re-read all three tiers side by side and confirm they agree
- [ ] Add a changeset fragment under `.changes/unreleased/` if user-visible
- [ ] Run the story test battery and the full suite:

      npx vitest run tests/content/story_test.ts tests/content/thoughts_test.ts tests/content/last_words_test.ts
      make test
      make lint

- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-story/.last-updated

## Verification

1. **Top-down agreement.** Every elite/boss and cutscene named in `story.md`
   appears in the manuscript; every manuscript line appears verbatim in its
   data file (spot-check via the manuscript's "Where the data lives" table).
2. **No orphans.** After a swap, no `firstKillThoughts` pin, companion entry,
   `uniquesByDifficulty` slot, or `shieldedBy`/`flees` reference points at a mob
   that no longer exists — the content tests in `tests/content/` bite if one does.
3. **Shape preserved.** `story.md` still reads as one paragraph per intro & per
   cutscene, two per level, every elite and boss mentioned.
4. `make test` and `make lint` pass; `.last-updated` was rewritten.

## Skill self-improvement

1. **Grow the propagation table** with any new story→data relationship you
   discover (a new def file that carries a spoken line, a new scene kind) —
   operating data, edit it in place.
2. **Record gotchas** as lesson fragments under `.lessons/` (see
   [`../LESSONS.md`](../LESSONS.md); read back with
   `node scripts/skill-lessons.mjs update-story`) — never append them to this
   file, so parallel sessions don't collide.
3. **Commit the skill edit** alongside the story change so the knowledge
   compounds.
