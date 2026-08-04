---
name: mod-authoring
description: "Use when creating a NEW mod for this game or updating an existing one — a folder of YAML compiled by the same schemas the shipped content uses, published to the Steam Workshop. Covers the scaffold → author → check → measure → play loop, exactly what the mod system does and does not support (so nothing is attempted that cannot ship), which craft skills apply inside a mod folder and how they read differently there, the decisions to bring back to the user, and what updating a published mod owes."
---

# Authoring a mod

A mod is a **folder of YAML in the game's own content format**, compiled by the
same schema modules the shipped build runs. There is no scripting hook and there
will not be one — a mod is data, which is what makes subscribing to a stranger's
mod safe.

**Load this skill when the work lands in a MOD FOLDER.** A change to the shipped
game — the engine, this repo's `content/`, the loot economy — is not this skill;
use the craft skill for that system and this repo's ordinary PR workflow.

## What this skill is, and what it delegates

| Source                                     | What it owns                                                      |
| ------------------------------------------ | ----------------------------------------------------------------- |
| **this file**                              | the workflow, the scope, the judgment calls, which skill to load  |
| `mod/AGENTS.md`                            | the step-by-step with every command, and the error decoder        |
| `mod/FORMAT.md`                            | every file and every field, plus the schema behind each           |
| `scripts/asset-tools/<catalog>-schema.mjs` | the field-level truth — when FORMAT.md disagrees, the schema wins |
| `mod/README.md`                            | what a mod may contain, the two kinds, load order, the licence    |
| `content/`                                 | a worked example of every kind, in the same format                |
| `docs/modding.md`                          | how a mod is compiled, loaded and resolved, and why               |
| `README.md`, `CONTRIBUTING.md`             | the same ground for the human you are working for                 |

Never restate a field table from `FORMAT.md` into a mod's own notes. Read the
schema, read the shipped file beside it, and author.

## Before anything: three facts that decide the work

1. **Mods load in the Steam desktop build only.** Browser and mobile have no
   Workshop and no filesystem. Anything the plan needs from the web build is
   not deliverable.
2. **A mod applies to a RUN, not to an install.** Start a modded run and its
   content is live; finish it and the shipped game is back.
3. **Never write into this repo's `content/`.** A mod lives in its own folder.
   If a fix seems to require editing shipped content, that is a finding to
   report, not a step to take.

## The loop

```sh
node mod/tools/cli.mjs new my-mod --title "MY MOD"   # 1. scaffold (it already compiles)
node mod/tools/cli.mjs ids <pattern> [--kind <kind>] # 2. verify every id BEFORE authoring it
node mod/tools/cli.mjs check my-mod                  # 3. validate — fast, writes nothing
node scripts/simulate-run.mjs --mod ../my-mod …      # 4. measure (every instrument takes --mod)
node mod/tools/cli.mjs where                         # 5. play it in the desktop build
```

Start at 1 **even when deleting everything after** — a mod that runs on the
first try proves the toolchain, which an empty folder cannot. Loop 2–4 per
change; step 5 is for the user, and step 6 (publish) is theirs alone.

Two rules that cause most first-attempt failures, both cheap to obey:

- **A venue is TWO files** — `levels/<id>.yaml` (the mission) and
  `maps/<id>.yaml` (the blueprint its geometry is carved from every run). A
  level without a blueprint compiles and no run can be built from it.
- **Every level needs a `ladder.yaml` row**, or it has no difficulty band and
  the compiler refuses it.

## Scope — what the mod system supports

Everything below is authorable, one file per thing. This list IS the scope: it
is what `mod/tools/build.mjs` loads, so anything absent cannot ship in a mod.

| Authorable                                                          | Path                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Venues (mission + the map blueprint it is carved from)              | `levels/<id>.yaml`, `maps/<id>.yaml`, `ladder.yaml`         |
| Monsters — minions, elites, bosses, their set-piece moves' TUNING   | `enemies/<biome>/<id>.yaml`                                 |
| Weapons, gear, named relics, and the kits they belong to            | `items/<rarity>/<id>.yaml`, `sets.yaml`                     |
| Powers, and the passives the hero buys ranks in                     | `powerups.yaml`, `talents.yaml`                             |
| Who a spared elite joins you as                                     | `companions.yaml`                                           |
| Errands, their givers, their conversations                          | `quests/<id>.yaml`, `quest-givers.yaml`                     |
| Story — scenes, the hero's thoughts, found lore                     | `cutscenes/<id>.yaml`, `thoughts.yaml`, `story-items.yaml`  |
| Pixel art, sounds, music                                            | `sprites/<family>/<name>.yaml`, `sounds/`, `music/`         |
| What the five difficulty rungs are CALLED                           | `difficulties.yaml`                                         |
| The mod's identity, kind, and (a conversion's) own title screen     | `mod.yaml` — `kind:`, `brand:`                              |

### What it does NOT support — stop rather than work around

| Not authorable                                                     | Why, and what to do instead                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Any code — a script, a hook, a new mechanic                        | The format has no scripting hook by design. A new mechanic is engine work in this repo.                 |
| A new KIND of talent proc or ability effect                        | A mod retunes or recombines the blocks the engine already fires; a new hook is engine code.             |
| `grades:` ladders (exceptional/elite variants)                     | Minted at engine load from a compiled catalog — the compiler refuses the block. Author them as items.   |
| The loot economy — `item_quality.yaml`, `item_rarity.yaml`         | Moving the tier ladder rebalances the campaign rather than adding to it.                                |
| The hero's XP curve (`leveling.yaml`), the autopilot's knobs       | The game's, and nothing in a mod can reach them.                                                        |
| The title menu (`mainmenu.yaml`)                                   | Chrome, not content — refused as a security rule. A conversion renames the game through `brand:` only.  |
| The sprite ATLAS                                                   | A mod's sprites merge at load; they never enter the built atlas, which is why `make assets` is not part of a mod's loop. |

If the user asks for one of these, say so plainly and offer the nearest thing
the format does support — an item instead of a grade, a retuned proc instead of
a new one, a new venue instead of a rebalanced ladder.

## addon vs conversion — get this right before authoring

- **`addon`** (the default, and the answer when unsure): adds to the shipped
  game. Ids must not collide. Levels join the campaign at their own `index`.
- **`conversion`**: replaces the campaign. Collisions are allowed and are how a
  shipped venue is re-skinned; it must list `campaign:` in play order and may
  carry its own `brand:`.

**Do not choose `conversion` on your own.** It is a far larger claim than "add
a level" — ask the user first.

## The craft skills apply unchanged, with two substitutions

A mod is authored in the game's own format with the game's own tools, so load
the craft skill for the work and read its accumulated lessons first
(`node scripts/skill-lessons.mjs <skill>`). Then: **run its commands with
`--mod <dir>`**, and **write its files into the MOD folder** — an instruction to
add `content/levels/<id>.yaml` means `levels/<id>.yaml` in the mod.

| Working on                       | Load                 | Reads differently inside a mod                                                                             |
| -------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| A venue                          | `level-design`       | Format, zones, spawn/wave budgets and the loot-pool rule all apply; campaign REGISTRATION does not — your `index` + `ladder.yaml` place it |
| Its map blueprint                | `mapgen-improvement` | The blueprint anatomy applies; the generator itself is engine code you cannot ship                         |
| An existing venue that feels off | `map-improvement`    | The render → judge → edit → re-render loop, on your own map                                                |
| A monster or a companion         | `enemy-design`       | `EnemyDef` anatomy, hp/damage against the scaling model, mechanics, spareable companions — all yours; the manuscript rules do NOT reach a mod's dialogue |
| A weapon, gear piece or relic    | `weapon-system`      | The def-first workflow and every calculator; `grades:` and the rarity economy stay the game's              |
| An errand or a conversation      | `quest-design`       | The objective kinds and reward pricing apply; the giver stands on one of YOUR levels                       |
| Any sprite                       | `pixel-assets`, `art-improvement` | The generate → LOOK → judge loop; a mod's grids are compiled by `cli.mjs`, not by `make assets`  |
| A sound or a score               | `sound-effects`      | The synth vocabulary and the tracker format are the same files                                             |
| A power's look and sound         | `visual-effects`     | Authoring the colour kit is yours; new effect IMPLEMENTATIONS are engine code a mod cannot add             |
| "Is this balanced"               | `simulate-run`       | Run it with `--mod`; the verdict's bands are the game's, and yours should meet them                        |
| Seeing it run, tuning feel       | `playtest`, `test-scenario` | `pwa/scripts/playtest.mjs --mod`; `--scenario` rides along with it                                  |
| A bug in a modded run            | `debug-game`         | Deterministic seeds, `?debug`, `window.__game` — all unchanged                                             |

**Skills that are the GAME's, not a mod's** — loading one inside a mod folder is
a wrong turn: `engine-system`, `bot-improvement`, `leveling-balance`,
`talent-fx`, `library-improvement`, `ui-review`, `store-shots`, `new-game`,
`sync-oss-spec`, every `update-*` / `maintenance` skill, and `commit` (a mod is
published to the Workshop, not merged here).

A mod's STORY is the one place the shipped campaign's rules stop: do not file a
mod's lines into `docs/story.md` or `docs/manuscript.md`, and never "correct"
them to match the campaign. `update-story`'s three-tier chain governs the
shipped game only; a mod's script answers to the schema alone.

## Updating an existing mod

Everything above still applies, plus what a published mod owes its subscribers:

- **Re-run `check` after the base game moves.** A mod pins nothing: a shipped id
  it references can be retired by a game update, and `check` is what says so.
  `node mod/tools/cli.mjs ids <id>` confirms whether a name still resolves.
- **Never change `id` in `mod.yaml` after the first publish** — it is how the
  game and the Workshop remember the mod, and changing it orphans subscribers.
  Bring this to the user if it seems necessary.
- **Keep `.workshop-id`.** It is what makes the next publish update the same
  item instead of minting a second one.
- **Re-measure what the change touched**, not just what it added: a weapon
  rebalance re-runs `weapon-budget.mjs` and `simulate-run --verdict`; a map edit
  re-renders and re-plays it.
- **Bump `version:` in `mod.yaml`** so subscribers can tell what they have.

## Before reporting the work done

- [ ] `node mod/tools/cli.mjs check <dir>` prints `✓` — and the warnings above it
      were read, not just the exit status.
- [ ] Every new id was verified with `cli.mjs ids`, never guessed.
- [ ] A new venue: rendered and LOOKED at (`level-render.mjs --mod`), and
      cleared in `simulate-run.mjs --mod … --verdict`.
- [ ] A new weapon or relic: `weapon-budget.mjs --mod` on the line, and
      `unique-check.mjs --mod` clean — a relic wired to nothing can never drop.
- [ ] Balance judged from a MEASUREMENT, never from reading the YAML. "I cannot
      judge the balance" is not an answer the instruments leave available.
- [ ] What was NOT verified is stated — whether it is FUN is the one question
      these tools genuinely cannot answer.

## Decisions to bring back to the user

- **Publishing.** Public, under their Steam account, and the first publish mints
  a permanent Workshop item. Never publish unprompted.
- **`kind: conversion`.** See above.
- **Changing a published mod's `id`.**
- **Anything that would require editing this repo's `content/` or `src/`.**
  Report it as a finding; it is a different piece of work with a different
  review path.
