---
name: quest-design
description: "Use when adding, updating or reworking a QUEST — an errand a non-combatant asks of the hero — or the person who hands it out, the conversation tree behind it, or a campaign-long chain. Covers the two catalogs and their pipeline, the eight objective kinds, what a reward may pay and how to price it, campaign vs run errands, conversations and neutral mobs, the trader hook, the story-chain obligation, and the build refusals and tests that bite when a piece is missing."
---

# Designing a Quest

An errand is one YAML file. Everything the player sees — the `!` over a head,
the pick list, the offer box, the tracker line, the log row, the map pin, the
library page — is derived from it, so the craft is entirely in the def and the
words. There is no engine change in a new quest; if you find yourself needing
one, that is the finding.

**The rules live in `AGENTS.md` → QUESTS.** Read that section first: it is the
_why_ (why the mark is derived, why the givers step last, why an escort is a
timer with a body). This skill is the _how_ — where to put things, what the
build will refuse, and how to check the result.

**Before starting, read past lessons:** `node scripts/skill-lessons.mjs quest-design`.

Load `pixel-assets` if the quest needs a new giver/escort sprite or item icon,
`enemy-design` if it needs a new breed to kill or talk to, `update-story` if it
moves a plot beat, `playtest` / `test-scenario` to see it running.

## Where everything lives

| Piece | File |
| --- | --- |
| The errand | `content/quests/<id>.yaml` — one per file, **stem == id** |
| The person | `content/quest-givers.yaml` — a `questGivers:` map of id → person |
| A conversation tree | `content/conversations/<id>.yaml` — stem == id |
| Field reference | `src/game/defs/quests.ts` (`QuestDef`, `QuestGiverDef`, `QuestObjective`, `QuestReward`, `QuestMerchantDeal`) and `src/game/defs/conversations.ts` — every field documented at the type |
| Pipeline | loader `scripts/quest-data/load-yaml.mjs`, schema `scripts/asset-tools/quest-schema.mjs`, generator `scripts/generate-quests.mjs` → gitignored `src/generated/quests.ts`. Regenerate with `make levels` (or `make assets`) |
| Engine | `src/game/quests/` — `index.ts` (orchestrator: givers, marks, the pick list, tallies), `escort.ts`, `rewards.ts`, `campaign.ts` + `campaign-save.ts` (the hero-carried log), `merchant.ts` (the stall hook), `placement.ts` (authored spots on a carved map) |
| Neutral mobs | `src/game/disposition.ts` (`inert`, `provokeEnemy`), `EnemyDef.disposition` / `conversation` / `ai.idle` |
| Conversations | `src/game/conversation.ts` (the runtime), `src/game/defs/conversations.ts` (the contract) |
| Tuning | `src/game/config/quests.ts` (`QUESTS.*` — talk/tap/ward radii, escort numbers, drop pity) |
| App surfaces | `overlays/QuestOverlay.tsx` (offer + pick list), `QuestLogOverlay.tsx`, `TalkOverlay.tsx` (conversations), `game-screen/QuestTracker.tsx`, `QuestFlash.tsx`, `render/quests.ts` (givers, head marks, escorts), `quest-text.ts` |
| Sounds | `content/sounds/quest_*.yaml` + `escort_*.yaml` — event-triggered, so a new quest needs none |
| Library pages | `pwa/scripts/library/model-quests.mjs` (`QUEST_FIELDS`, `QUEST_GIVER_FIELDS`), `prose-quests.mjs`, `render-quests.mjs` |
| Story chain | `docs/story.md` → `docs/manuscript.md` — **every spoken line is transcribed** |
| Mod surface | `mod/FORMAT.md` (the authoring reference), `mod/catalog.json` (committed, drift-tested — regenerate when an id is added) |
| Tests | `tests/engine/quests_test.ts`, `campaign_quests_test.ts`, `conversation_test.ts` (synthetic fixtures); `tests/content/quests_test.ts` (the shipped campaign) |

## The def, by concern

**Identity.** `level` + `giver` + `order` decide where it appears and where it
sits in that person's pick list. `order` is low-first; without it the list falls
back to alphabetical, which is never the order a person would say things in.

**The words.** `offer` (pages, each a list of lines) → `incomplete` (the nag,
one page) → `complete` (pages). An authored line is a **paragraph**: the box
flows it into whatever column the device really has, so you are not counting
characters to a fixed width — you are deciding how much of a thought lands on
one screenful (~120 chars) and where the one held beat goes (max 2 lines per
page, and the whole shipped campaign spends five of them).

**`lore` is required, on both the errand and the person.** Described, not
spoken, in the dry register of an item's `description` — the library prints it,
and the alternative is a page whose only prose sits behind a spoiler cover.

**The eight objective kinds.** Every entry must be met.

| Kind | Asks for | Notes |
| --- | --- | --- |
| `kill` | `count` of a breed | Any kill counts — companions, powerups too |
| `killNamed` | one pinned elite/boss | Tracker reads a name, not a tally |
| `collect` | `count` of a piece the quest itself defines | See `items:` below |
| `escort` | walk somebody to `to` | The only kind that can FAIL |
| `visit` | stand at `at` on `level` | `name` is required — the tracker says the PLACE, never a coordinate |
| `flag` | a run flag was set | The only bridge from a conversation; `name` is what the tracker reads |
| `sell` | hand a piece over the counter | The piece LEAVES — that is the beat |
| `reachLevel` | be level N | Keep rare: a wall, not a task. Tracker words it as the climb |

**`items:`** are the quest's own tokens (id, name, icon), found via `dropFrom`
breeds (`dropChance`, with a pity floor so a fetch quest is always finishable)
and/or `at:` spots laid out on ACCEPT. A piece with neither can never appear —
the build refuses it.

**`escorts:`** are bodies with hp the horde can reach. They follow the hero,
stop past the leash, and the errand fails if one falls.

**`reward:`** `xpShare` (a share of the hero's CURRENT level bar — never a flat
figure), `coins`, `loot: {count, tierBonus, slot}` rolled through the ordinary
drop pipeline, `uniques` handed over whole, `abilities` docked, `cleanSlates`
(a respec — the campaign pays exactly one, ever).

**`campaign: true`** moves the log and flags onto the HERO, per difficulty. Only
then may the chain cross maps, and a chain may not mix campaign and run links
in either direction. Use sparingly.

**`conversation:`** replaces the two-button offer with a tree, for a person the
hero has to talk around. **`merchant:`** lets the chain run through the stall —
`buys` (with `sets:` flags) and `sells` (gated on `requires:` flags).

## Picking the numbers

Calibrated against the 39 shipped errands — stay inside these unless you have a
reason:

- **A run errand:** `xpShare` 0.35–0.9 (median **0.5**), coins 60–260 (median
  **135**). It is one map's side work.
- **A campaign errand:** `xpShare` 0.06–1.0 (median **0.26**), coins 40–2000.
  They start deliberately tiny (a typewriter ribbon pays 0.06) and the last link
  pays the game's only respec.
- **Kill counts** run 1–10, and `tests/content/quests_test.ts` fails anything
  over 20 — a map's horde is finite, and a count the field cannot supply is an
  errand that can never be finished and looks exactly like bad luck. That suite
  also checks the breed is one the named map actually spawns, which the schema
  cannot: it only knows the id exists.
- **`xpShare` above 1** is a whole free level for one errand and out-paces the
  kills-per-level table the campaign is tuned on. The schema warns past 2.

## Workflow

1. **Decide run or campaign.** Run is the default and almost always right. A
   campaign chain asks the player to carry something for hours.
2. **Pick the person.** Reuse a giver if one already stands on that map with
   room in their slate; a new one needs an entry in `content/quest-givers.yaml`,
   a `_0`/`_1` sprite pair, a spot inside the map, and a `lore` paragraph. Place
   them near the intended route — the ward is deliberately small.
3. **Write the errand.** `content/quests/<id>.yaml`, stem == id. Objectives
   first (they are the contract), then the words around them.
4. **New sprites/icons** via the `pixel-assets` skill — a giver/escort needs a
   walk pair, a quest piece needs one icon.
5. **Compile:** `make levels`. The schema refuses everything in the next
   section; fix until silent, including warnings.
6. **Story chain, if it speaks** — and it does: `docs/story.md` first (the
   gist), then `docs/manuscript.md` (verbatim). **Ask the user before rewriting
   the manuscript** unless the request already authorises it.
7. **Regenerate the mod catalog** if you added an id: `make mod-catalog` (it is
   committed and drift-tested, and it must land in the SAME commit).
8. **Verify.** `make test`, `make lint`, `make fmt-check` — and **never** a bare
   `npx vitest run` (see AGENTS.md: it skips the asset rebuild the drift tests
   depend on, so a stale catalog agrees with an equally stale build and CI
   fails over exactly the drift the test exists to catch).
9. **Look at it.** Stand the hero on the giver and screenshot — the harness
   needs a dev server, and writes into `pwa/assets-preview/playtest/`:

   ```sh
   npm install --no-save playwright     # once
   (cd pwa && npx vite --port 5199 &)
   node pwa/scripts/playtest.mjs --level <id> --seed 42 \
     --scenario '{"place":{"x":…,"y":…},"clearField":true}'
   ```

   Judge the offer box, the pick list, the tracker and the head mark — not the
   YAML.
10. **Changeset:** `.changes/unreleased/$(date +%s)-<slug>.md`, `type: Added`.

## What the build refuses

Every one of these is silent at runtime — an errand that simply never completes,
with nothing on screen to explain it. That is why they are hard errors.

- **Dangling ids:** the level, the giver, an enemy, a `dropFrom` breed, a
  sprite (and its `_0`/`_1` frames), an icon, a unique, a powerup, a
  conversation, a `requires` quest, a `minDifficulty`.
- **A giver who hands out no quests** — a person you walk up to and get silence
  from is the most confusing thing a quest system can ship.
- **A chain that loops**, or one that `requires` itself.
- **A chain that mixes run and campaign links**, either direction.
- **A run chain crossing maps** — the gate is read standing on that level, and a
  run's log dies with it.
- **A run errand's `visit` on another map** — the hero is never there while it
  runs.
- **A `collect` item nothing drops and nothing placed**, or one the `items:`
  block does not define; same for an `escort` id.
- **A conversation** whose `start`/`goto`/`reentry` names a missing node, two
  nodes with the same id, or a `gives:` handing over a piece the named quest
  does not define in its own `items:` — the hero would pick up a token no
  objective is counting.
- **An empty `merchant:`** — it must buy something or sell something.
- **Missing `lore`** on either the errand or the person.

Warnings you should still clear: a page over ~120 chars, more than 2 lines in a
page, `lore` over 420 chars, `xpShare` over 2, an errand with no reward.

## After you're done — the checklist

- [ ] `make levels` silent — no errors, no warnings
- [ ] `make test` green (**not** `npx vitest run`), `make lint`, `make fmt-check`
- [ ] `mod/catalog.json` regenerated if an id was added
- [ ] `docs/story.md` + `docs/manuscript.md` updated for every spoken line
- [ ] The library builds — a new authored field must be declared in
      `QUEST_FIELDS` / `QUEST_GIVER_FIELDS` or the build fails
- [ ] Looked at the offer box and the tracker in the running game
- [ ] Changeset fragment written
- [ ] A lesson fragment if this pass taught you something

## Skill self-improvement

When a pass teaches you a gotcha, record it as a fragment under
`.lessons/$(date +%s)-<slug>.md` (see `.agent/skills/LESSONS.md`) — in the same
PR as the work that taught it. Never append to this file.
