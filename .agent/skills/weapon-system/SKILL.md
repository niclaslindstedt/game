---
name: weapon-system
description: "Use when adding, rebalancing, or reworking weapons and loot — base weapons, level requirements, tiers/affixes, drop rules, weapon sprites and projectile behaviors. Walks the def-first workflow and the two verification loops: the stat sanity checker and the weapon sheet, then tests and playtest."
---

# The Weapon System

Weapons are the game's progression spine: the Diablo-style loot loop (base
item × tier × item level × affixes) is what keeps players playing. This
skill is the map of that system and the workflow for changing it safely.
Everything is data-first: a new weapon is a def + an icon + (for ranged) a
projectile sprite — no engine edits unless you're adding a new BEHAVIOR.

## Where everything lives

| Piece | File |
| --- | --- |
| Weapon/gear defs, tier ladder, affix pools, naming | `src/game/defs/equipment.ts` |
| Loot config: tier gates (`tierUnlockMlvl`), base tier chances, ilvl deficit weights, drop shares | `src/game/config.ts` (`LOOT`) |
| Chain/cooldown/damage globals | `src/game/config.ts` (`WEAPON`) |
| Which bases drop on a level (thematic pools) | `src/game/defs/levels/<level>.ts` `loot.weaponPool` |
| Elite/boss drops: signatures (`items`), per-tier pledges (`tierDrops`), `levelBonus` | `src/game/defs/enemies/<roster>.ts` |
| The roll pipeline (tier → ilvl → affixes), equip gates | `src/game/items.ts` (`rollEquipment`, `meetsLevelReq`) |
| Kill → drop funnel (pity rule, tierDrops payout) | `src/game/loot.ts` |
| Monster level stamping | `src/game/create.ts` (`spawnEnemy`), `src/game/menace.ts` (`mobLevelFor`, re-stamp in `maybePowerScale`) |
| Firing + projectile behaviors (spread/pierce/homing/chain) | `src/game/step.ts` (`stepWeapon`, `stepProjectiles`) |
| Icons (12×12) | `website/scripts/sprite-data/icons.mjs` |
| Projectile sprites (8×8) | `website/scripts/sprite-data/effects.mjs` |
| Tier colors, item tooltip (ilvl, level req) | `website/src/game/tiers.ts`, `InventoryPanel.tsx` |
| Keepsakes / hardcore rules (app-side permanence) | `website/src/game/progress.ts`, `settings.ts` |
| Engine rule tests | `tests/engine/loot_diablo_test.ts`, `tests/engine/projectile_behavior_test.ts` |

## The system in one paragraph

Every enemy carries a **monster level** (`mlvl` = player level + the
difficulty's `mobLevelOffset` + the def's `levelBonus`; elites/bosses
re-stamp when their fight engages). A drop rolls its **tier** best-first,
each tier gated by `LOOT.tierUnlockMlvl` (magic 5 / rare 10 / unique 15 /
legendary 25) and rolled at `LOOT.tierChances` + difficulty bonus + luck +
per-kill bonuses. It then rolls its **item level** = mlvl − a weighted
deficit (`ilvlDeltaWeights`, −3 likeliest; rare+ uses the tight
`ilvlDeltaWeightsRare` 0–1 band), picks a **base** from the level's pool
filtered by `levelReq ≤ mlvl` (empty filter falls back to the
lowest-requirement bases), and rolls tier-count **affixes** whose size is
`ilvl × perIlvl` (a stat affix is exactly +1 point per ilvl; rare = 2
affixes = double points). The player can't WEAR a piece until
`player.level ≥ levelReq` — auto-equip skips it, the bag refuses it, the
tooltip paints the requirement red. Unique/legendary mint with NO
durability (and thereby skip the looted-weapon damage damper) and, off
hardcore, join the forever keepsake stash when a difficulty is beaten;
hardcore death burns the stash, banked uniques, and all level tokens.

## Adding or changing a weapon

1. **Def first** (`equipment.ts`): id, name, class, `levelReq`, damage,
   cooldown, range, durability, melee cone (`sweepDeg` — the SHAPE; how many
   it hits is INT's business, see maxMeleeTargets) or
   `projectile` (sprite + optional `count`/`spreadDeg`/`pierce`/`homing`/
   `chain`). Add to the right level's `weaponPool` (bases) or to an enemy's
   `loot.items` / a level's `earlyDrops`/`allClearWeapon` (specials).
2. **Check the numbers — the damage-budget model.** Every weapon owes an
   EFFECTIVE DPS set by its levelReq (`scripts/weapon-budget.mjs`, knobs at
   the top: BASE 40 at req 1, +4/level, specials ×1.15):

   `eff dps = per-target dps × assumed targets × crit lift`

   - **Assumed targets** (`weaponAssumedTargets` in equipment.ts): single 1,
     cone AoE 4, full-circle AoE 5 — BALANCING assumptions only. Melee is
     classified by its ARC (<80° thrust = 1, ≥80° cone = 4, ≥300° full = 5;
     WEAPON.aoeConeFromDeg/aoeFullFromDeg); how many a swing ACTUALLY hits
     is INTELLIGENCE's alone (maxMeleeTargets: global floor 2 + 1/INT).
     Volleys count their pellet count, pierce its line (1+pierce), chain
     its damage-weighted leaps. So 40 eff = 10 dps/target on a cone, 8 on
     a full circle: an AoE weapon is deliberately weaker per hit from the
     start and grows into its assumption as INT rises.
   - **Crit lift** (`weaponCritMult`): cadence-weighted crit damage — fast
     (<450ms) ×1.6, medium ×2.0, slow (≥800ms) ×2.5, priced at a reference
     15% crit chance. Slow weapons crit like trucks and pay per-hit budget
     for it; a def may pin `critMult` as a deliberate exception.
   - `damage = budget(levelReq) × cooldown/1000 ÷ targets ÷ critLift` —
     the budget script prints current vs suggested range (±12%) for every
     weapon and `--strict` fails on drift.

   Then `node scripts/weapon-stats.mjs` — its class ladders now run on the
   same effective DPS (must never step DOWN along levelReq) and it still
   flags out-of-band reqs, missing sprites, and dangling ids. Starters and
   the fallback blaster are exempt from both (the difficulty ladder is
   calibrated on them). `weaponScore` (auto-equip) and the item card's
   extra lines (HITS UP TO N / PELLETS / PIERCES / CHAINS, CRIT DAMAGE)
   speak the same model — keep all three in agreement.
3. **Sprites** (the `pixel-assets` skill has the full loop): icon in
   `icons.mjs`, projectile in `effects.mjs`, `make assets`, then LOOK at
   `website/assets-preview/<name>@8x.png` — and at the arsenal in one
   piece: `node website/scripts/weapon-sheet.mjs` →
   `assets-preview/weapon-sheet.png` (icon + shot + stat caption per
   weapon, grouped by pool; missing sprites print red markers).
4. **Tests**: engine rules live in `tests/engine/loot_diablo_test.ts`
   (gates, ilvl, levelReq, tierDrops) and
   `projectile_behavior_test.ts` (spread/pierce/homing/chain). A new
   BEHAVIOR needs a new suite; a new weapon usually needs none (it's data)
   — but run `npx vitest run` anyway: content tests reference weapon ids.
5. **Feel**: the `playtest` skill. Numbers that pass the checker can still
   feel limp — cadence, projectile speed, and screen effects are judged in
   the running game.

## Lessons learned (2026-07 Diablo rework)

- **Starting weapons are lore, not economy.** The difficulty's wall weapons
  (wand/sword/knife/knuckles/stick) and the elite/boss signatures stay OUT
  of the base pools; they're the seed stock for the unique tier. The
  `blaster` is the engine's unbreakable fallback sidearm — never delete it,
  never pool it.
- **Scripted early drops constrain `levelReq`.** Anything in a level's
  `earlyDrops` (or dropped by kill ~2) must be equippable when it arrives:
  HQ's `security_baton` drops at kill 2, so its req is 1 even though it's
  the pool's second-best melee. Check every guaranteed drop against the
  hero's level at that story moment.
- **Deleting a weapon id is a repo-wide grep**, not a def deletion: level
  pools, `placedItems`, `earlyDrops`, enemy `loot.items`, content tests,
  icons (a swapPalette variant may still need the const), and BANKED
  LOADOUTS in players' localStorage — `migrateLoadout` in
  `website/src/game/progress.ts` must map retired ids/tiers or old saves
  crash `createGame`.
- **rng-stream discipline**: any change to how many rng draws a drop
  consumes shifts every seeded content test after the first kill. Tests
  that park a dying mob ON the player die to contact-damage streaks when
  the stream shifts — stage kills at arm's length (`equipBlaster` + mob at
  +80px) so the scenario doesn't hinge on miss/dodge luck.
- **Tier-gate defaults in tests**: `tests/engine/helpers.ts` `makeEnemy`
  defaults `mlvl: 99` (past every gate) so loot-shape suites keep their
  pre-gate behavior; gate suites set `mlvl` explicitly. Elite/boss mlvl is
  re-stamped on engage (`maybePowerScale`) — set `powerScaled: true` when a
  test needs a hand-staged mlvl to survive the first hit.
- **Multi-pellet volleys carry damage PER PELLET** — compare volleys at
  ~60% pellet connect rate (what weapon-stats.mjs does), and remember the
  `shot` event fires once per pull (SFX) while `shotsFired` counts pulls.
- **AoE trades single-target DPS** by design — the budget model makes the
  trade exact (per-target damage = budget ÷ assumed targets), and the
  effective ladder is what must climb with levelReq, never the raw one.
- **Auto-equip must speak the balance model.** When per-target damage was
  budget-normalized, raw dps ranking (`weaponScore`) started shunning every
  AoE weapon; the score folds in assumed targets and the crit lift now. Any
  future model change lands in `weaponScore`, `weaponDps`, and the budget
  scripts together.
- **Wood-dark pixels vanish**: the core `k` wood char is near-outline dark;
  weapon hafts/stocks read better in the warm `B` brown. Verify every icon
  at @8x — first drafts of "obvious" silhouettes (rayguns, revolvers) read
  as crosses and blobs; two or three iterations is normal.

## After you're done — the checklist

- [ ] `node scripts/weapon-budget.mjs --strict` clean — every weapon on its
      damage budget (or the drift is a deliberate, commented exception).
- [ ] `node scripts/weapon-stats.mjs` clean (or the warnings are deliberate).
- [ ] `node website/scripts/weapon-sheet.mjs` and LOOK at the sheet.
- [ ] `make assets` committed together with the sprite-data change
      (atlas.png + atlas.json are the build inputs).
- [ ] `make test` green, `make lint` clean.
- [ ] Playtest at the phone viewport if feel/tuning changed.
- [ ] Docs sync (per CLAUDE.md): content changes → `docs/game-content.md`;
      new config knobs → `docs/configuration.md`; public API →
      `docs/architecture.md` + README.
- [ ] Changelog fragment under `.changes/unreleased/` for player-visible
      changes.
- [ ] Old saves survive: retired ids/tiers handled in `migrateLoadout`.

## Skill self-improvement

When a weapon-system change teaches something new (a tuning heuristic, a
failure mode, a new behavior pattern), bake it into "Lessons learned" above
— and extend `scripts/weapon-stats.mjs` when the lesson is checkable, so the
next run catches it mechanically instead of by eye.
