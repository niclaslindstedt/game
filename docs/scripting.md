<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Scripting — the rules are content

Every other catalog in this game is DATA: a monster is a row of numbers, a venue
is a floor plan, a talent is a slope. That was enough to re-skin the game and
never enough to change it. A total conversion could replace every monster,
venue, relic, scene, recruit and passive and still hand the player _this_ game's
XP curve, _this_ game's loot rain and _this_ game's damage formula — because
those are rules, and rules were code.

They are content now. Twelve of them live in `content/scripts/*.lua`, the engine
calls them through a sandboxed Lua interpreter, and a mod ships its own copy of
a file to change one.

```
content/scripts/progression.lua   what a level costs, what a kill pays
content/scripts/menace.lua        how tough the horde is, and at what level
content/scripts/loot.lua          whether anything drops, and how rare
content/scripts/combat.lua        what a blow is worth, both directions
```

There is no TypeScript copy of these formulas that is "the real one". The Lua
IS the rule. (The bindings carry a fallback in TypeScript so the engine still
runs with an empty content tree — a fresh clone, a fixture-only test suite —
and `tests/content/script_parity_test.ts` pins the two together bit-for-bit so
they cannot drift.)

## Writing one

A script is a Lua module: a table of functions, returned at the end.

```lua
local M = {}

function M.overkill_efficiency(damage, max_hp)
  return 1          -- farming pays full value in this mod
end

return M
```

Drop that in your mod's `scripts/menace.lua` and every kill in the game is
judged by it. A hook you do not implement keeps the shipped rule, and so does a
file you do not ship — an override is a patch, not a replacement.

The fastest way to write one is to **copy the shipped file and edit it**. Each
one is a few dozen lines with the reasoning in comments, and it is exactly what
the game is running.

## What a script can see

One global, `game`, and everything under it is read-only. A write is an error
naming the field, not a silent no-op.

|                |                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game.config`  | Every tuning table the engine reads, lower-cased at the top level: `game.config.loot`, `game.config.menace`, `game.config.leveling`, `game.config.stats`, `game.config.mob_armor`, `game.config.xp_cap`, … The leaf keys keep their TypeScript spelling (`dropChance`, `mobHpGrowthKnee`), so a name you find in `engine/game/config/` is the name you write. |
| `game.balance` | The DEVELOPER → BALANCE knobs, read live. `game.balance.dropRate`, `.gearQuality`, `.mobArmor`, `.xpGain`, …                                                                                                                                                                                                                                                  |
| `game.run`     | The run this call is about — see below. `nil` outside a run.                                                                                                                                                                                                                                                                                                  |
| `game.log(…)`  | A line into the engine's log buffer, rate-limited to 64 per run so a hook that logs on every kill floods nothing.                                                                                                                                                                                                                                             |

`game.run` is the read-only view of the live game, built lazily and only if you
ask for it:

|                                                                         |                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `difficulty` `level` `level_index` `biome` `phase`                      | where the run is                                                                                                                     |
| `time_ms` `combat_ms` `kills` `damage_dealt` `damage_taken` `xp_gained` | what has happened                                                                                                                    |
| `items_collected` `gold_collected`                                      | what it has paid out                                                                                                                 |
| `menace` `menace_floor` `peak_menace`                                   | how hot it has got                                                                                                                   |
| `enemies_alive` `items_on_floor`                                        | what is on the field                                                                                                                 |
| `party_size` `is_party`                                                 | who is playing                                                                                                                       |
| `hero`                                                                  | the hero this call is about — `level`, `hp`, `max_hp`, `xp`, `stamina`, `coins`, `seat`, `stats`, `spent_stats`, `talents`, `weapon` |

`game.run.hero` is **whose call this is**, not seat 0 — a private read of one
hero travels with the call. It is present on the hooks that are about a
particular hero (`drop_chance`, `tier_chance`, `weapon_damage`) and `nil` on the
ones that are about the world.

So a mod can make the horde react to how the run is actually going:

```lua
function M.mob_hp_level_factor(mob_level)
  local base = ...                              -- the shipped curve
  -- A run the player is running away with gets a tougher horde.
  if game.run and game.run.peak_menace > 3 then
    return base * 1.25
  end
  return base
end
```

## The hooks

Each entry says which file owns it. `engine/game/script/hooks.ts` is the one list,
and `mod/catalog.json` carries a copy for the mod compiler.

### `progression.lua`

| hook                                    | what it decides                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xp_to_level_up(level, curve_xp, tier)` | What crossing out of a level costs. `curve_xp` is the authored row from `content/leveling.yaml`; `tier` is the difficulty's cost rung (0 for easy/medium/hard, 1 nightmare, 2 jesus). |
| `mob_xp(mob_level, hero_level)`         | What one kill pays, level-difference bonus and grey-mob penalty included.                                                                                                             |
| `xp_cap_multiplier(level, cap)`         | How much of a grant a hero still collects past a map's soft cap.                                                                                                                      |
| `stat_diminish(points, cap)`            | The diminishing-returns curve every effective-stat read runs through.                                                                                                                 |

### `menace.lua`

| hook                                      | what it decides                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mob_hp_level_factor(mob_level)`          | The hp a monster's level buys it. The single per-level hp shape — mob hp, the crowd's toughness, the menace meter's yardstick and ability scaling all read it, so they move together. |
| `mob_level(hero_level, offset, min, max)` | What level the horde fields. Also what the loot system reads for which bases may drop and which tiers are unlocked.                                                                   |
| `overkill_efficiency(damage, max_hp)`     | What a killing blow is worth when it lands for several times the victim's health.                                                                                                     |

### `loot.lua`

| hook                                  | what it decides                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `drop_chance(difficulty_bonus, luck)` | Whether a rank-and-file monster drops anything at all.                                        |
| `tier_chance(tier, ctx)`              | The rarity roll's per-tier chance. Return 0 to not offer a tier — and no draw is spent on it. |
| `magic_find_factor(tier, mf)`         | How MAGIC FIND multiplies a tier's odds.                                                      |

`ctx` carries `depth`, `difficulty_bonus`, `role_bonus`, `tier_bonus`,
`named_mult`, `plain_minion`, `mf` and `over_cap_mult` — the shipped file
documents each.

### `combat.lua`

| hook                                               | what it decides                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `weapon_damage(ctx)`                               | A weapon instance's per-hit damage. `ctx` is `base`, `damage_stat`, `stat`, `damage_pct`, `enhanced`, `quality`, `surge`. |
| `mob_armor_reduction(mob_level, difficulty_bonus)` | The fraction of a physical blow a monster shrugs off.                                                                     |

## The rules a hook obeys

**A hook is a FORMULA, not a frame.** Every hook is called at most once per
kill, per drop, per spawn, per swing or per ding — never per entity per frame.
That is a design rule, not an accident: a tree-walking VM at horde scale in the
step pipeline would be a frame-rate cliff a modder could not see coming.
Anything that would run per-entity-per-frame stays in TypeScript.

**It must return a finite number.** A hook that returns `nil` would otherwise
put NaN into the XP economy, where it is invisible until a save. The host
refuses it, says so once, and stands the shipped rule back up.

**It cannot spend the run's randomness.** There is no `math.random`. A seeded
run is the engine's promise and a script must not be able to break it — so the
draws stay on the engine's side of the seam, and a hook decides only what they
are measured against. (This is why `tier_chance` returning 0 spends no draw: it
is how a mod turns a tier off without shifting every roll after it.)

**It is deterministic.** No clock, no unordered iteration, a stable sort. Two
machines simulating one multiplayer run must get the same numbers.

## What a script cannot do

The absent half of the standard library is the security model:

- **no `io`, `os`, `require`, `load`, `loadstring`, `dofile`, `package`** — no
  filesystem, no clock, no way to bring in a second chunk. A script is exactly
  the text the compiler validated.
- **no `debug`, no `_G`, no `rawset`** — no reaching around the read-only views
  into the run's real state.
- **no `coroutine`** — a suspended hook would carry a live scope across a step
  boundary.
- **no `math.random`, no `os.time`** — the two sources of nondeterminism.
- **an instruction budget per call**, which the script's own `pcall` cannot
  swallow. A runaway loop costs a frame, not the session.

Everything else is Lua 5.4 as you know it, minus `goto` (refused at compile time
rather than mis-parsed) and with one number type rather than the integer/float
split — so a formula behaves identically in the browser, in the Node session
server, in Electron and in the mobile shells.

## When it goes wrong

A stranger's code is going to be wrong sometimes, and a player's game must not
stop when it is. Every failure falls back to what the mod was overriding, and
says so once, with the file and the line:

| what happened                                        | what the player gets                         |
| ---------------------------------------------------- | -------------------------------------------- |
| the file will not compile                            | the shipped file, whole                      |
| a hook throws, or blows its budget                   | that hook falls back for the rest of the run |
| a hook returns something that is not a finite number | the same                                     |
| a hook name is not one the engine calls              | caught at compile time — see below           |

That last one is the reason the compiler runs your script rather than just
reading it. A typo'd hook name is otherwise silent **forever**: the engine falls
through to the shipped rule and your file appears to do nothing at all. So
`node mod/tools/cli.mjs check` parses every script with the game's own
interpreter, loads its top level, and names an export that is not a hook of that
file.

## How it fits together

```
content/scripts/*.lua                  ← authored, and the source of truth
        │  scripts/generate-scripts.mjs — compiles each with the real VM
        ▼
engine/generated/scripts.ts               ← the sources, gitignored, rebuilt
        │
        ▼
engine/game/script/host.ts                ← resolves a hook, calls it, contains it
        │  a mod's scripts/<id>.lua registers ON TOP via registerDefs
        ▼
engine/game/script/bindings.ts            ← the typed call sites the engine uses
```

Four modules, and the split between them is load-bearing:

- **`engine/lib/lua/`** is the VM — generic engine code, no game concepts in it.
  Lexer, parser, tree-walking interpreter, sandbox stdlib.
- **`engine/game/script/catalog.ts`** is an IMPORT-FREE LEAF holding what a mod
  registered, for the same reason `flags.ts` and `mapgen/blueprints.ts` are
  leaves: `registerDefs` is reachable from the startup path, and the 200 KB
  critical-path budget has no room for a Lua VM. What a mod registers is SOURCE
  TEXT; the compile happens on the first hook call, inside a run.
- **`engine/game/script/env.ts`** builds the read-only views.
- **`engine/game/script/host.ts`** resolves, calls, contains failures, and
  memoizes.

The memo is worth knowing about if you are adding a hook. A hook is a pure
function of its arguments, the config and the balance knobs — unless it reads
`game.run`. So the run view reports its own use, and only a call that touched
nothing is cached. Purity is **observed, never declared**: an annotation on each
hook would eventually be wrong, and wrong here means a stale number in the loot
economy.

## Adding a hook

Four edits, and the drift test enforces the set:

1. an entry in `engine/game/script/hooks.ts`,
2. the shipped implementation in `content/scripts/<script>.lua`,
3. the typed call site in `engine/game/script/bindings.ts`, with its fallback,
4. `make mod-catalog`, so a mod may name it.

Then a parity case in `tests/content/script_parity_test.ts`. Pick a rule that is
a formula over scalars: the binding resolves the values that change per call and
the script reads the constants itself out of `game.config`, so a mod that wants
a different constant edits the formula it belongs to rather than being handed a
pre-chewed number.

## See also

- [`docs/modding.md`](modding.md) — how a mod reaches the game at all
- [`mod/FORMAT.md`](../mod/FORMAT.md) — the field reference, `scripts/` included
- [`docs/content-pipeline.md`](content-pipeline.md) — the compile chain
- [`AGENTS.md`](../AGENTS.md) — where new code goes
