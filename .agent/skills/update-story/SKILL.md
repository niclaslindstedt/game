---
name: update-story
description: "Use whenever ANY story, dialogue, or spoken/written line in the game is written, rewritten, retoned or removed — however small. Triggers on: story, plot, beat, scene, script, manuscript, dialogue, conversation, monologue, thought, line, speech, caption, intro, outro, last words, bark, lore, description, greeting, quest offer, joining words, kill quote, and on any request to make a character sound different (colder, warmer, funnier, more human, less robotic) or to rework a scripted scene. Also for replacing or reworking an elite/boss, retiring a beat, or reconciling a drifted tier. Edits docs/story.md (the gist, the ground truth), then propagates DOWN the chain: docs/manuscript.md, then content/ (cutscenes, levels, enemies, thoughts, story items, quests, companions) — so the three tiers never drift. A PR that touches a single word of dialogue without this skill's chain walk is incomplete."
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

## When this skill applies — broader than "the plot changed"

Load it whenever **any line the game speaks or shows as prose** is written,
rewritten, retoned or removed. The unit is a LINE, not a plot beat: "make him
sound less cold", "give the scientist a second page", "he should warn them
first" are all story changes, because every one of them lands in a file the
manuscript transcribes. Concretely, all of these are in scope:

| The ask | Why it's a story change |
|---|---|
| A cutscene caption or `say` beat | manuscript-transcribed |
| A level `intro` / `outro` monologue | manuscript-transcribed |
| An elite/boss `dialogue` or `lastWords` | manuscript-transcribed |
| A boss **bark** (`AbilityDef` set-piece line) | manuscript-transcribed |
| A pinned **thought** (`content/thoughts.yaml`) | manuscript-transcribed |
| A **scripted scene**'s shape (`openingStrike`, an ambush beat) | the manuscript describes the scene, not only its words |
| A merchant greeting, quest offer/handover, conversation node | manuscript-transcribed |
| A companion `joinWords` / `killQuotes` | manuscript-transcribed |
| A story item's `lore`, a unique's `description` | manuscript-transcribed (lore) / governed but not transcribed (description, `EnemyDef.lore`) |
| **Retoning** a character — colder/warmer/funnier/more human | the voice IS the story |
| Reworking or replacing an elite/boss | the widest change; see the swap sub-checklist |
| "The manuscript and the data drifted" | a reconcile sweep |

Do **not** use it for pure mechanics with no narrative surface (tuning hp,
retuning a drop rate, an fps fix) — those never touch the chain. A change that
is BOTH (a scripted scene whose engine hook and whose words both move) uses the
skill for the words and the ordinary engine workflow for the hook; the chain
walk still owes tiers 1 and 2 their edit.

**A MOD'S STORY IS EXEMPT.** The chain governs the SHIPPED campaign only. A
line under a mod folder answers to nobody — never file it into `story.md` or
`manuscript.md`, and never "correct" it to match them.

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
| 3a | Game — cutscenes & monologues | `content/cutscenes/<id>.yaml`; `src/game/defs/levels/*.ts` (`intro`, `outro`, `merchant.greeting`, `firstKillThoughts`/`firstSightThoughts` pins) | Prelude + travel scenes, per-level opening/closing monologues, merchant lines, thought pins. |
| 3b | Game — roster | `src/game/defs/enemies/<level>.ts` + `enemies/index.ts` | Elite/boss `dialogue` + `lastWords`; if a mob is **added, removed, or replaced**, its `EnemyDef` (hp/damage/role/mechanics), its registration, and any `shieldedBy`/`flees`/`spareable`/`apparition` wiring. Load the `enemy-design` skill for the numbers. |
| 3c | Game — items | `content/items/<rarity>/*.yaml` (named uniques + their `lore`/`description`), `content/story-items.yaml`, `EnemyDef.uniquesByDifficulty`, `LevelDef.loot.worldUniques` | Story items (keycards, dossiers, recovered hardware) and their `lore`; a boss's dropped uniques and world-drop relics. **A boss swap re-homes that boss's unique set** — the drops must follow the new owner. Load `weapon-system` for the item economy. |
| 3d | Game — thoughts | `content/thoughts.yaml` | The hero's pinned beats (kill/sighting/scripted-strike pins from a `LevelDef`; a **travel door's `unready:`** — what he says at a door with no open road, which REPLAYS rather than firing once; and a **`placeThoughts` entry** — a beat pinned to BEING somewhere rather than to a mob, `where: arrival` or `where: pastDoor`, which is what a venue with no horde has to use). A beat may be an **exchange**: `voice: { speaker, portrait }` names who answers him and a `{ them: [...] }` page is theirs — the mirror of `{ hero: [...] }` in an arrival scene. Reach for this, NOT `EnemyDef.dialogue`, when a line has to land inside a scripted beat. |
| 3e | Game — companions | `content/companions.yaml` (spare verdict in `src/game/companions.ts`) | Joining words + kill quotes for any rift unique that can be spared. |
| 3e2 | Game — the SCENE's shape | `src/game/defs/levels/types.ts` + `src/game/story.ts` + `scripts/asset-tools/level-schema.mjs` | Only when the beat's SHAPE changes, not just its words — a scripted strike gaining rounds, an ambush changing order. A retone of a scripted scene usually lands here first (see the lessons). Put the reasoning in the def's doc comment; the YAML is data a mod also authors. |
| 3e3 | Game — the hero's own name | `content/**` (`{HERO}` in a line), `src/game/hero-name.ts` | Only when a line should SAY the player's character name. The token is `{HERO}`; `docs/game-content.md` → "The hero's name" carries the rule and `tests/content/hero_name_test.ts` asserts the exact list of lines that spend it, so adding one is a test edit as well as a content edit. Every surface that draws authored text resolves it — a NEW text overlay must call `withHeroName`/`withHeroNameLines` or it will print `?HERO?`. |
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
   `uniquesByDifficulty` coverage so no difficulty rung loses a slot —
   `node scripts/unique-check.mjs` reports what each rung actually offers, and
   `weapon-system` covers re-homing uniques.
4. **Thoughts / companions** (3d–3e): repoint any `firstKillThoughts`/
   `firstSightThoughts` pin or companion entry that named the old mob.
5. **Achievements & tests** derive from the live registries, so run the content
   test battery (below) to catch anything the swap orphaned.

## How a page is written

**A PAGE IS A PARAGRAPH, AND THE BOX BREAKS IT — THE AUTHOR DOES NOT.** Every
surface that speaks (the opening/closing monologue, the in-world dialogue box,
a cutscene caption, the merchant, a quest giver's ask) measures the text column
it ACTUALLY has on the device it is being read on and flows the page into it:
`useTextColumn` (`@ui/lib/use-text-column.ts`) + `wrapPage`
(`@ui/lib/text-pager.ts`), then `paginateLines` windows the folded rows into
tap-to-scroll screens. So where a row ends is the renderer's business, and an
authored line is a whole thought. The habit this replaced — typing three
~34-character lines against a fixed box — printed a ragged half-width column
with the right half of the window empty on anything wider than the phone it was
measured on, and folded into a mess on anything narrower.

A page is therefore authored as ONE entry, in `content/` and in the manuscript
alike. A SECOND entry is an **explicit line break**, and it has to earn itself:
a punchline held back, a second hand on the same note, a pause the punctuation
cannot carry (the typewriter already holds 260–440 ms on a full stop, so most
"beats" need no break at all). The whole shipped campaign spends FIVE — they are
tabled in the manuscript's "How a page is written". What the author still owns
is the PAGE: past ~120 characters, three rows of the narrowest box the game
supports, it costs the player a second tap, and the build warns
(`PAGE_WARN_CHARS` / `MAX_PAGE_LINES` in the story, quest and companion
schemas). A BARK is the exception on both counts — it floats over a boss's head
on the open field rather than in a box, so its lines stay hard rows.

When two tiers of the CAMPAIGN's chain disagree, the **higher tier wins**:
`story.md` beats the manuscript, the manuscript beats the data — correct the
lower tier to match.

**A SPOKEN BEAT IS NOT ALWAYS A MONOLOGUE — `ThoughtDef.voice` AND `them:`
PAGES.** A pinned beat is the hero alone by default, and nearly all of them
stay that way. A few need somebody talking back — a shove answered with "we
have our orders" — so a def may name a second `voice: { speaker, portrait }`
and tag a page `{ them: [...] }`. It is the exact MIRROR of an arrival scene's
`{ hero: [...] }`: there the mob owns the scene and his replies are tagged,
here he owns it and theirs are. Both resolve through `dialogueContent` into one
`voices` array parallel to `pages`, so the dialogue box draws either without
knowing which kind of scene it is in — which is why adding the second voice
changed no renderer arithmetic. Reach for this rather than `EnemyDef.dialogue`
when a line has to land INSIDE a scripted beat: an arrival scene fires on its
own proximity trigger and cannot be sequenced with one. The scene kind is still
called `playerThought` — a MECHANISM name, since the pinned-beat machinery, the
read ledger and the `openingStrike` hook all key on it — so call the thing an
EXCHANGE everywhere a reader sees it and leave the key alone.

## Naming

A name is story too, and the rule is its own document:
**`docs/naming.md`** — nothing in this game is named after a real person,
company, product or franchise, and a name is only a QUARTER of an identity (the
voice, the art and the description carry the rest). Read it before naming
anything, and before retoning a character whose voice is doing the identifying.

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

- [ ] Refresh the snapshots the change moved, and only those:

      node scripts/update-story-snapshot.mjs   # thoughts, cutscenes, story items
      node scripts/update-level-snapshot.mjs   # a `LevelDef` field moved
      node scripts/update-enemy-snapshot.mjs   # dialogue / lastWords moved
      make mod-catalog                         # a new or retired id (a thought id counts)

- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-story/.last-updated

## Verification

1. **Top-down agreement.** Every elite/boss and cutscene named in `story.md`
   appears in the manuscript; every manuscript line appears verbatim in its
   data file (spot-check via the manuscript's "Where the data lives" table).
2. **The line REACHES a reader.** Rebuild the library and grep the built pages
   for a distinctive phrase you wrote:

       cd pwa && npm run library && grep -rl "SOME DISTINCTIVE PHRASE" dist/library/

   No hit means the data landed and the reader-facing tier didn't — the
   coverage maps fail on an undeclared FIELD, never on a page that quietly
   renders none of it (this is exactly how the whole opening strike went
   unpublished). Fix the GENERATOR, never a built page.
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
