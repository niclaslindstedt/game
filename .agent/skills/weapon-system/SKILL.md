---
name: weapon-system
description: "Use when adding, rebalancing, or reworking weapons and loot — base weapons, level requirements, tiers/affixes, drop rules, named UNIQUE items (weapons, armor, charms, bags), weapon sprites and projectile behaviors. Walks the def-first workflow and the verification loops: the damage-budget calculator, the stat sanity checker, the weapon sheet, and the unique authoring checker, then tests and playtest."
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
| Base GRADES (Normal → Exceptional → Elite): per-base names + generated variant defs | `src/game/defs/grades.ts` |
| MAKE QUALITY (broken → perfect): multipliers + mlvl-sliding roll odds | `src/game/config.ts` (`QUALITY`); the roll in `items.ts` (`rollQuality`) |
| Loot config: tier gates (`tierUnlockMlvl`), base tier chances, ilvl deficit weights, drop shares | `src/game/config.ts` (`LOOT`) |
| Chain/cooldown/damage globals | `src/game/config.ts` (`WEAPON`) |
| Which bases drop on a level (thematic pools) | `src/game/defs/levels/<level>.ts` `loot.weaponPool` |
| Elite/boss drops: signatures (`items`), per-tier pledges (`tierDrops`), boss UNIQUE tables (`uniquesByDifficulty`), `levelBonus` | `src/game/defs/enemies/<roster>.ts` |
| Named UNIQUE defs (fixed bonuses on a real base) | `src/game/defs/uniques.ts` (`WORLD_UNIQUES` group = level-locked ones) |
| Unique mint + drop roll: `mintUnique`, `maybeDropBossUnique`, `UNIQUE` config | `src/game/items.ts`, `src/game/loot.ts`, `src/game/config.ts` |
| World-drop uniques: level wiring, role-scaled roll, gate | `LevelDef.loot.worldUniques`, `maybeDropWorldUnique` (loot.ts), `WORLD_DROP` config; size the gate with `scripts/leveling-curve.mjs --by-level` |
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

Two more axes ride the same roll. **Base grades** (`defs/grades.ts`): every
POOL base ships generated EXCEPTIONAL (reqs 25–52) and ELITE (reqs 55–100)
versions — same look/behavior, hand-authored names, damage re-derived
straight on the budget line, armor grown along `ARMOR.armorPerIlvl` plus a
native edge (×1.1/×1.2), durability ×1.25/×1.5. `rollEquipment` expands each
pool entry to its grade family (`gradeVariantIds`), so level defs keep
authoring normal bases only. **Make quality** (config `QUALITY`): each
PLAIN (regular-tier) weapon/armor drop rolls BROKEN ×0.7 / CRUDE ×0.85 /
NORMAL / SUPERIOR ×1.15 / PERFECT ×1.3 per instance — odds lerp with mlvl
from `weightsLow` (1) to `weightsHigh` (100) — scaling damage (via
`weaponDamageFor`), the armor stamp, durability (max reads via
`equipmentMaxDurability`, NOT the def), and sell value; the prefix leads
the name. Craftsmanship and magic are exclusive (the D2 rule): a
magic-or-better find is always normal make, charms and bags never roll
one, and scripted `earlyDrops` pin `quality: "normal"`.

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
   extra lines (PELLETS / PIERCES / CHAINS, CRIT DAMAGE — melee cleave is
   INTELLIGENCE's, not a per-weapon count, so it carries no line) speak the
   same model — keep all three in agreement, with ONE deliberate exception:
   `weaponScore` credits a ranged spread's targets at
   `1 + (assumed − 1) × WEAPON.aoeRealization`, not in full (§ below). The
   budget scripts and item card still use the raw `weaponAssumedTargets`.
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

## Unique items (named drops)

UNIQUES are the top of the loot ladder above rolled rares: hand-authored named
drops (`src/game/defs/uniques.ts`) with a FIXED bonus block on a REAL catalog
base — no rolled affixes. Each drop still rolls a small ±band on the base
damage/armor (`UNIQUE.baseRollBand`, ±10%) so copies differ and a better roll
is worth chasing; the bonuses stay identical. They mint via `mintUnique`
(`items.ts`), unbreakable like any unique/legendary.

**The catalog shape (this game).** 35 uniques as a slot Latin square: five
bosses × five difficulties, each difficulty the home of one full
weapon+armor set (a weapon + head/chest/legs/feet, one per boss), plus a BAG
from MUSKRAT and a CHARM from GROK on each rung. Which boss drops which at
which rung is wired on the enemy def (`EnemyDef.uniquesByDifficulty`), gated
to the rung — an easy unique only drops on easy. Each is rolled at
`UNIQUE.dropChance × mlvl/ilvl` (capped) on the kill (`maybeDropBossUnique` in
`loot.ts`): ~5% at the item's home difficulty, never guaranteed.

**The design rules** (all enforced by `scripts/unique-check.mjs`):

- **Fixed bonuses only, no affixes.** Author `bonuses: Affix[]` directly — flat
  `stat`/`crit`/`maxHp`/`armor`/`damagePct`, plus at most ONE scaling bonus
  (`statPct`/`maxHpPct`) per item and each ≤ 3% (the "keeper" that grows with
  the hero). A downside (a small negative) buys extra upside — situational
  glass-cannon pieces are good.
- **The base is a REAL catalog id — including generated grade variants.** A
  unique's `base` must resolve in the runtime `WEAPON_DEFS`/`GEAR_DEFS`. That
  record includes the EXCEPTIONAL/ELITE variants `grades.ts` generates at load
  (`spatha`, `microlattice_plate`, `fluted_greaves`, …) — they are NOT in the
  gear/equipment source files, so **a source grep will tell you a real base
  doesn't exist.** Always resolve against the runtime record, i.e. run the
  checker's `--bases`, never `grep`.
- **`ilvl` scales power and drop odds, not the equip gate.** Equip level is the
  base item's `levelReq` (like any tier), so a unique wears well below its ilvl.
  Pick a base whose `levelReq ≈ ilvl − 20` (`EQUIP_GAP`): that one rule sets
  both the equip gate AND the armor/dps, because a higher-req base is a higher
  grade. Too weak a base (far below target) equips absurdly early and
  under-armors the ilvl.
- **Armor climbs with ilvl within a slot.** Uniques don't grow armor with ilvl
  (only the ±band), so a higher-ilvl piece MUST sit on a higher-armor base or
  it's strictly worse than a lower one. The checker holds this per gear slot.
  (Weapon power is class-dependent — an AoE weapon deals less per hit BY DESIGN
  — so weapons get an eyeball ladder, not a hard check; sanity them against the
  damage-budget model.)
- **Trinkets gate at 1.** Charm and bag bases top out at req ~20 and carry no
  armor, so charms/bags legitimately equip low — exempt from the equip-gap rule.
  A bag unique overrides its base capacity with `UniqueDef.bagSlots`.

**The authoring loop** — `node scripts/unique-check.mjs`:

1. Draft the def (name, base, slot, ilvl, bonuses, lore). For the base, run
   `node scripts/unique-check.mjs --bases <slot>` to see every REAL base in the
   slot with its req + armor/dps, and pick one at `req ≈ ilvl − 20`.
2. `node scripts/unique-check.mjs --suggest [slot]` does that pick for every
   unique at once — the repeatable re-base pass. It prints the current base, an
   `⚠ under-grade` flag when a base is too weak for its ilvl, and the top
   candidates at the target req. Pick the on-theme one among them (weapon
   fantasy often beats a rung of req). The knobs (`EQUIP_GAP`, `GAP_SLACK`, the
   seed-base exclusions) are named constants at the top of the script.
3. Wire the drop: add the id to the boss's `uniquesByDifficulty[rung]`.
4. `node scripts/unique-check.mjs [--strict]` — the full report: the boss drop
   grid, base integrity + slot agreement, bonus discipline (≤1 scaling ≤3%),
   the equip-gap rule, per-slot armor monotonicity, and Latin-square coverage
   (every unique placed once, each rung a full set). ERRORS fail; `--strict`
   fails on WARNs too.
5. Tests: `tests/content/uniques_test.ts` (registry integrity, `mintUnique`,
   the boss drop tables) — and `npx vitest run`, since the drop-table suite
   asserts every shipped unique is placed exactly once.

**Lore/story note.** Unique `lore` is cosmetic item flavor (like weapon
flavor), NOT manuscript content — the manuscript transcribes spoken/found
story, not item cards, so a unique doesn't touch `docs/manuscript.md`. New
uniques ARE game content, so update `docs/game-content.md`.

## World-drop uniques (level-locked)

A SECOND kind of unique home: instead of one boss (`EnemyDef.uniquesByDifficulty`),
a relic hangs on a LEVEL (`LevelDef.loot.worldUniques`, keyed by difficulty) and
any enemy on that level can drop it, at a chance set purely by the enemy's ROLE
(config `WORLD_DROP.chanceByRole` — `minion`/`elite`/`boss`). This is the
"drops out in the world, but boss runs are the efficient farm" loot. Same def
shape (`WORLD_UNIQUES` group in `uniques.ts`), same `mintUnique` / ±band / equip
rules — only the wiring and the roll differ. The roll is `maybeDropWorldUnique`
in `loot.ts`, called from `killEnemy` right after the boss roll.

**The two knobs that make it work:**

- **Role chances, calibrated to head-count.** A drop rolls PER unique PER kill,
  so a full clear's odds are `1 − ∏(1−chance)^count` over the roster. An EASY
  floor fields **~1200 minions**, ~5 elites, 1–2 bosses (get the real numbers
  from the roster, or `leveling-curve.mjs --campaign`), so a minion chance that
  "feels tiny" (0.2%) actually compounds to ~90% a clear. Solve BACKWARD from
  the target: for a whole-clear ≈ 30% with the boss weighted magnitudes over
  trash, `minion 0.015% / elite 2% / boss 10%` lands it — and the 10% boss kill
  makes a fast boss run the best drops-per-minute. Always sanity-check the
  aggregate against the actual per-level counts, not intuition.
- **The level gate (`minPlayerLevel`) decides WHEN.** Set it above the level the
  hero reaches on a first pass so the relic can only be farmed by RETURNING for
  boss runs after the difficulty is beaten. Size it with the new
  `leveling-curve.mjs --by-level` — it prints the hero's level at the START of
  every (difficulty × level) clear. EASY ends ~17, so gate 20 forces a return.
  The gate is checked in `maybeDropWorldUnique` BEFORE any rng draw, so levels
  without a table (every synthetic fixture, every under-level run) consume no
  rng and the seeded drop stream never shifts — that's why the whole change
  landed with zero seeded-test churn.

**Authoring loop (extends the boss loop):**

1. Draft the def in the `WORLD_UNIQUES` group; pick bases the same way
   (`--suggest`, `req ≈ ilvl − 20`, armor monotonicity — the checker holds all
   of it across BOTH unique kinds). Trinkets/charms still exempt from the equip
   gap; a charm base whose req exceeds the ilvl warns ("wears above ilvl") — bump
   the ilvl (a world charm's ilvl only scales a cosmetic ±band, since world odds
   are flat role rates, not ilvl-scaled like boss uniques).
2. Wire it on the LEVEL: `loot.worldUniques: { <rung>: ["id", …] }`.
3. `node scripts/unique-check.mjs` — the coverage check now spans boss ∪ world
   placements ("placed exactly once, one home each"), and prints a **World-drop
   grid** (level × difficulty) with the live role chances + gate. The Latin
   square stays boss-only.
4. Tests: `tests/engine/world_drops_test.ts` asserts the role scaling and the
   gate on SYNTHETIC fixtures — `registerDefs` now takes a `uniques` override,
   so an engine test can register a fixture unique + a fixture level's
   `worldUniques` without any shipped id. `tests/content/uniques_test.ts`
   coverage counts both homes. Run `npx vitest run` (the drop-table suite
   asserts every shipped unique has exactly one home).

## Lessons learned (2026-07 world drops)

- **Compounding over head-count is the whole calibration.** A per-kill chance
  that reads "rare" is enormous across 1000+ mobs. Always solve the aggregate
  `1 − ∏(1−p)^count` to the target (~30% a clear), and weight the boss orders of
  magnitude over minions so boss runs — not floor-grinding — are the efficient
  farm. `leveling-curve.mjs --campaign`/`--by-level` gives the counts and the
  per-level hero level to size both the rates and the `minPlayerLevel` gate.
- **Gate BEFORE the rng draw.** `maybeDropWorldUnique` returns on "no table for
  this level/rung" and "under the gate" before touching `state.rng`, so the vast
  majority of kills (fixtures, under-level runs) draw nothing and every seeded
  loot/content test is untouched. A per-kill roll that drew unconditionally would
  shift every seeded test after the first kill — the classic rng-stream trap.
- **`registerDefs` grew a `uniques` slot** so world-drop rules test on synthetic
  fixtures (the engine-test rule: no shipped ids). Mirror this for any future
  system that mints uniques in the engine.
- **World-charm ilvl is nearly cosmetic.** World odds are flat role rates (not
  `× mlvl/ilvl` like boss uniques) and charms carry no base armor/dps, so a world
  charm's ilvl only moves the ±band. Bump it freely to clear the "wears above
  ilvl" warn without worrying about power.

## Lessons learned (2026-07 uniques)

- **Generated grade variants are real bases but invisible to grep.** The single
  worst unique-authoring bug: naming a base, greping the gear/equipment source,
  not finding it, and "fixing" a non-problem — because `grades.ts` mints the
  Exceptional/Elite variants at load, not in source. Validate bases through the
  checker (runtime `GEAR_DEFS`/`WEAPON_DEFS`), never a source grep.
- **`req ≈ ilvl − 20` is the whole base-selection math.** It sets the equip gate
  and the armor/dps in one move (higher req = higher grade). `--suggest` makes
  it a repeatable pass; re-run it whenever the ilvl of a unique changes or new
  bases land, and re-pick the flagged (`⚠ under-grade`) items.
- **Armor is fixed by the base for uniques** (no ilvl growth — that was a
  deliberate design call so rares eventually overtake), so within a slot the
  base armor must climb with ilvl. The checker's per-slot monotonicity catch is
  what keeps a nightmare piece from being weaker than an easy one.
- **Weapon power is class-dependent** — don't chase a strictly-climbing weapon
  DPS ladder across uniques; an AoE flamethrower reads "weaker" than a maul on
  raw numbers but is on-budget. Theme wins ties; sanity against weapon-budget.

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
- **…but ranged AoE is credited at what it REALIZES, not its ceiling.**
  `weaponAssumedTargets` is a balance-AUTHORING assumption (budget ÷ 4 for a
  4-pellet gun); crediting it in full to `weaponScore` let a spread weapon with
  a quarter of a single-target's per-hit damage displace it on a paper tie,
  which feels awful against any lone tough foe. So `weaponScore` credits a
  ranged spread's extra targets at a fraction — `1 + (assumed − 1) ×
  WEAPON.aoeRealization` — beyond its first, guaranteed hit. Melee sweeps stay
  reliable (credited at `maxMeleeTargets`, what INT can cleave); only
  conditional ranged multipliers (pellets/pierce/chain) take the discount. This
  is a RANKING tuning only — the budget scripts, item card, and
  `weaponAssumedTargets` are untouched.
- **Wood-dark pixels vanish**: the core `k` wood char is near-outline dark;
  weapon hafts/stocks read better in the warm `B` brown. Verify every icon
  at @8x — first drafts of "obvious" silhouettes (rayguns, revolvers) read
  as crosses and blobs; two or three iterations is normal.

## Lessons learned (2026-07 quality + grade ladders)

- **Generated variants must be classified through `gradeBase`.** Both
  scripts (`weapon-budget.mjs` special-vs-pooled, `weapon-stats.mjs` class
  ladder) and the weapon sheet group by pool membership — a variant rides
  its base's (`pooled.has(def.gradeBase ?? def.id)`), or every generated
  def reads as a "special" and fails the ×1.15 premium budget.
- **Derive variant damage from the budget FORMULA, not by scaling the
  base's damage.** Ratio-scaling carries the base's within-tolerance drift
  into the variant, and rounding can push it over the band (riot_baton did).
  Computing `budget(newReq) × cd/1000 ÷ targets ÷ critLift` directly puts
  every variant dead-center by construction.
- **Any new per-drop rng draw shifts every seeded content test** — the
  quality roll surfaced a latent fixture gap: the loot rain hardcodes the
  `screen_nuke` id (LOOT.nukeShare), so the fixture catalog must register a
  `screen_nuke` ability (like the shared `blaster`) or a long headless run
  crashes when the slice finally hits.
- **Durability "max" is an instance question now.** Anything comparing or
  refilling against `def.durability` (repair kits, mercy desperation, UI
  bars) must go through `equipmentMaxDurability` or a CRUDE piece repairs
  past what it minted with.

## Lessons learned (2026-07 damage ranges + magic parity)

- **`def.damage` is the MEAN of a range, not a fixed hit.** Every blow rolls
  inside a band (`WEAPON.damageVariance` default, per-def `damageVariance`
  override) around the average. Keep authoring `damage` as the average —
  the budget model, DPS readouts, auto-equip, and grade generation all
  reason about expected output, so the spread rides on top and none of them
  change. `weaponDamageFor` stays the deterministic average (UI/scoring);
  `rollWeaponDamage` is the combat-time roll; `weaponDamageRange` is the
  item-card min–max. Melee rolls once per swing, projectiles once PER PELLET.
- **Per-hit variance draws off `state.fxRng`, a SECOND stream — never
  `state.rng`.** This is the trick that let the whole change land with zero
  seeded-loot-test churn: the loot/crit stream sequence is untouched, so
  drop determinism holds. `fxRng` is seeded off the same seed (repro-safe)
  and IS persisted (saved-run snapshots `fxRngState` too, so resume is
  lossless — the persistence test enforces exact-sequence resume). Any
  future combat-flavor randomness (screen shake, spark counts) belongs on
  `fxRng`, not `rng`.
- **A pool is `2 melee / 2 ranged / 2 magic` now.** Magic shipped
  half-served (one base per level → 12 rungs vs 24). Bringing a class to
  parity is: add one base per level pool at a stepped `levelReq`, grade
  names in `grades.ts`, wire the pool array, `make assets`, LOOK. The grade
  bands ([25,52] exceptional, [55,100] elite) unfold the rest — check the
  `weapon-stats.mjs` per-class ladder afterwards (it must never step down).

## After you're done — the checklist

- [ ] `node scripts/weapon-budget.mjs --strict` clean — every weapon on its
      damage budget (or the drift is a deliberate, commented exception).
- [ ] `node scripts/weapon-stats.mjs` clean (or the warnings are deliberate).
- [ ] `node scripts/unique-check.mjs` clean, if you touched uniques (base
      integrity, equip-gap, armor monotonicity, Latin-square coverage).
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
— and extend the checker when the lesson is checkable, so the next run catches
it mechanically instead of by eye: `scripts/weapon-stats.mjs` for weapon/loot
rules, `scripts/unique-check.mjs` for unique authoring (its tuning knobs —
`EQUIP_GAP`, `GAP_SLACK`, seed-base exclusions — are named constants at the
top; adjust them there, not inline).
