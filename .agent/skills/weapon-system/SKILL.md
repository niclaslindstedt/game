---
name: weapon-system
description: "Use when adding, rebalancing, or reworking weapons and loot — base weapons, level requirements, tiers/affixes, drop rules, named UNIQUE items (weapons, armor, charms, bags), weapon sprites and projectile behaviors. Walks the def-first workflow and the verification loops: the damage-budget calculator, the stat sanity checker, the weapon sheet, the unique ilvl calculator, and the unique authoring checker, then tests and playtest."
---

# The Weapon System

Weapons are the game's progression spine: the Diablo-style loot loop (base
item × tier × item level × affixes) is what keeps players playing. This
skill is the map of that system and the workflow for changing it safely.
Everything is data-first: a new weapon is a def + an icon + (for ranged) a
projectile sprite — no engine edits unless you're adding a new BEHAVIOR.

**Before starting, read the lessons from past passes** — they live as
fragments in [`.lessons/`](./.lessons/) next to this file (format in
[`../LESSONS.md`](../LESSONS.md)):

```sh
node scripts/skill-lessons.mjs weapon-system
```

## Where everything lives

| Piece | File |
| --- | --- |
| **THE ITEM FORGE — the one door new items come through** | `scripts/item-forge.mjs` (see below) |
| **The item YAML tree — every hand-authored item, one file each** (`kind: weapon\|gear\|unique`, a `description` of lore, sprite refs; compiled by `scripts/generate-items.mjs` → `src/generated/items.ts`, wrapped by `defs/equipment.ts`/`gear.ts`/`uniques.ts`) | `content/items/<rarity>/<id>.yaml` (`regular`/`trash` = plain bases; `set`/`unique`/`legendary`/`artifact` = named) |
| Tier ladder + rarity knobs (prefixes, affix counts, `unlockMlvl` gates, roll chances/slopes, MF saturation, elite/boss bonuses) | `content/item_rarity.yaml` — read through `TIERS`/`TIER_ROLL_ORDER` (equipment.ts) and config `LOOT` |
| MAKE QUALITY (broken → perfect): multipliers, roll bands, mlvl-sliding odds | `content/item_quality.yaml` — read through config `QUALITY`; the roll in `items.ts` (`rollQuality`) |
| Weapon/gear TYPES, affix BRACKETS, naming, budget model, lookups | `src/game/defs/equipment.ts` (re-exports the gear record; also authors the engine's built-in `blaster`) |
| Base GRADES (Normal → Exceptional → Elite): variant generation (names come from each base YAML's `grades:` block) | `src/game/defs/grades.ts` |
| Loot config: ilvl deficit weights, drop shares (the tier gates/chances live in `content/item_rarity.yaml`) | `src/game/config/loot.ts` (`LOOT`) |
| Chain/cooldown/damage globals | `src/game/config/combat.ts` (`WEAPON`) |
| Which bases drop on a level (thematic pools) | `src/game/defs/levels/<level>.ts` `loot.weaponPool` |
| Elite/boss drops: signatures (`items`), per-tier pledges (`tierDrops`), boss UNIQUE tables (`uniquesByDifficulty`), `levelBonus` | `src/game/defs/enemies/<roster>.ts` |
| Named UNIQUE defs (fixed bonuses on a real base) | `content/items/{set,unique,legendary,artifact}/<id>.yaml` (`world: true` = the level-locked `WORLD_UNIQUES` group); type + merge validation in `src/game/defs/uniques.ts` |
| The ilvl MODEL (what a unique's `ilvl` means; over/under-power check) | `scripts/weapon-ilvl.mjs` — `unique-check.mjs` imports it; conversion table derived from live combat constants |
| Unique mint + drop roll: `mintUnique`, `maybeDropBossUnique`, `UNIQUE` config | `src/game/items/rolling.ts`, `src/game/loot.ts`, `src/game/config/loot.ts` |
| World-drop uniques: level wiring, role-scaled roll, gate | `LevelDef.loot.worldUniques`, `maybeDropWorldUnique` (loot.ts), `WORLD_DROP` config; size the gate with `scripts/leveling-curve.mjs --by-level` |
| The roll pipeline (tier → ilvl → affixes), equip gates | `src/game/items/rolling.ts` (`rollEquipment`), `src/game/items/requirements.ts` (`meetsLevelReq`) |
| Kill → drop funnel (pity rule, tierDrops payout) | `src/game/loot.ts` |
| Monster level stamping | `src/game/create.ts` (`spawnEnemy`), `src/game/menace.ts` (`mobLevelFor`, re-stamp in `maybePowerScale`) |
| Firing + projectile behaviors (spread/pierce/homing/chain) | `src/game/step/` (`weapon.ts`, `projectiles.ts`) |
| Icons (12×12) | one YAML per icon in `scripts/sprites/icons/` |
| Projectile sprites (8×8) | one YAML per sprite in `scripts/sprites/effects/` |
| Field-hero held weapon art + its swing/recoil/cast animation | `pwa/src/game/paper-doll.ts` (`WEAPON_SHOULDER` pivot), `render.ts` (`weaponPose`, `drawPlayer`); preview with `pwa/scripts/weapon-swing.mjs` |
| Tier colors, item tooltip (ilvl, level req) | `pwa/src/game/tiers.ts`, `InventoryPanel.tsx` |
| Keepsakes / hardcore rules (app-side permanence) | `pwa/src/game/progress.ts`, `settings.ts` |
| NAMED-WEAPON population analyzer (scatter charts + tier-anomaly report) | `scripts/weapon-scatter.mjs` (see below) |
| Engine rule tests | `tests/engine/loot_diablo_test.ts`, `tests/engine/projectile_behavior_test.ts` |

## THE ITEM FORGE — never freehand item numbers

`scripts/item-forge.mjs` is the one door a new weapon or gear base comes
through. Give it the item's SHAPE and it computes the numbers the balance
model owes that shape — damage/armor are OUTPUTS of the forge, never inputs
you invent:

```sh
node scripts/item-forge.mjs weapon --id volt_pike --class melee \
  --req 18 --cooldown 700 --range 56 --sweep 30            # → def on the budget line
node scripts/item-forge.mjs weapon --id storm_carbine --class ranged \
  --req 24 --cooldown 950 --range 240 \
  --projectile speed=420,radius=3,lifetime=900 --count 3 --spread 24
node scripts/item-forge.mjs gear --id crystal_greaves --slot legs --req 30
node scripts/item-forge.mjs check    # the FULL checker battery, one command
```

It prints a ready-to-paste def (damage on the budget line, armor on the
slot's catalog curve, durability from the class's neighbors) plus the wiring
checklist. `check` runs `weapon-budget --strict`, `weapon-stats --coverage
--strict`, `weapon-ilvl --check`, and `unique-check` in one shot and fails on
any drift — run it before every item PR. If a hand-edited number drifts off
the model, the battery is what catches it; keep the forge's `BASE/PER_LEVEL/
SPECIAL_PREMIUM/REF_CRIT` knobs in lockstep with `weapon-budget.mjs`.

## The power model — what an instance's numbers mean

An item's power is a single predictable function of **(base, ilvl, tier,
quality)** — keep every rule below in mind when touching any of them:

- **The base** carries damage/armor authored AT ITS OWN `levelReq`, on the
  damage-budget line (`40 + 4·(levelReq−1)` eff dps) / the slot's armor curve.
- **ilvl grows the instance**: armor by `ARMOR.armorPerIlvl` (6%/ilvl over
  the req) and weapon damage by `WEAPON.damagePerIlvl` (2%/ilvl over the
  req — a third of armor's rate, since damage compounds with stats/crit
  where armor only sums). Both are zero at the base's own req, so catalog
  defs and the budget model never move — only deep finds grow, and
  `heroDamageLevel` prices a hot find into the horde automatically.
- **Affixes roll in ilvl-gated BRACKETS** (`AFFIX_POOLS[..].brackets` in
  equipment.ts, PoE-style generations at minIlvl 1/10/22/36/52/70/88 —
  deliberately the rung-end mlvls, so each difficulty unlocks the next
  generation, and the top two carry rolled gear through the ilvl 52–99
  endgame). The roll takes the highest unlocked bracket 3:1 over the one under
  it. The CEILING RULE: the top stat bracket stays ≈ a fifth of
  `STATS.statHardCap` (250), so no single affix outweighs a build's chosen
  points — `weapon-stats.mjs`
  enforces ladder sanity (ascending minIlvls from 1, ascending bands, the
  stat ceiling). TIER sets affix COUNT only (magic 1 / rare 2 / unique 3 /
  legendary 4), never size: a low rare is wide-but-shallow, a deep magic
  narrow-but-deep.
- **Make QUALITY** (broken→perfect ×0.7–1.3) lerps its odds to
  `QUALITY.highMlvl` = **60** — the level a campaign actually ends at —
  so superior/perfect work genuinely drops on the last rungs.
- **Grade bands overlap on purpose**: exceptional `[24, 52]`, elite
  `[43, 100]` (grades.ts). Elite work starts dropping in NIGHTMARE (the D2
  shape) — the overlap is what keeps a low-req map's drop window alive on
  its high-rung revisits. Don't "fix" it back to contiguous.
- **Pools are CUMULATIVE**: each map's `weaponPool`/`gearPool` also carries
  every earlier stage's arsenal (the bunker idiom), so every (map × rung)
  visit keeps live bases in its drop window. The audit is
  `node scripts/weapon-stats.mjs --coverage` — targets ≥4 weapons / ≥3 gear
  in-window everywhere (hard floor 3/2 warns); its `CAMPAIGN_LANDINGS` table
  and `LEVEL_MLVL_BANDS` are re-read from `leveling-curve.mjs --by-level`
  whenever the XP curve moves.
- **Tier odds belong to the DIFFICULTY ladder**, strictly increasing
  (`tierChanceBonus` easy {} → jesus {m .22, r .14}; `lootIlvlBonus`
  0/1/2/3/5); the per-level term is small and capped
  (`MENACE.tierBonusPerLevel` 0.4%/level, cap +15%) so the tier roll keeps
  discriminating all campaign. Don't let any bonus stack push the effective
  magic chance near 1.

## The system in one paragraph

Every enemy carries a **monster level** (`mlvl` = player level + the
difficulty's `mobLevelOffset` + the def's `levelBonus`; elites/bosses
re-stamp when their fight engages). A drop rolls its **tier** best-first,
each tier gated by `LOOT.tierUnlockMlvl` (magic 5 / rare 10 / unique 15 /
legendary 40) and rolled at `LOOT.tierChances` + difficulty bonus + luck +
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

1. **FORGE the def** (`node scripts/item-forge.mjs weapon …` — see the
   forge section above): pick the SHAPE (id, class, `levelReq`, cooldown,
   range, melee cone `sweepDeg` or `projectile` with optional
   `count`/`spreadDeg`/`pierce`/`homing`/`chain`) and write the forged def
   as a new `content/items/regular/<id>.yaml` (`kind: weapon`, plus a few
   sentences of `description` lore grounded in the story) — the damage is
   the budget line's answer, not yours.
   Add to the right level's `weaponPool` (bases — remember pools are
   cumulative, later maps inherit it) or to an enemy's `loot.items` / a
   level's `earlyDrops`/`allClearWeapon` (specials, forged with
   `--special`).
2. **Check the numbers — the damage-budget model.** Every weapon owes an
   EFFECTIVE DPS set by its levelReq (`scripts/weapon-budget.mjs`, knobs at
   the top: BASE 40 at req 1, +4/level, specials ×1.15):

   `eff dps = per-target dps × assumed targets × crit lift`

   - **Assumed targets** (`weaponAssumedTargets` in equipment.ts): the
     CALIBRATED AoE normalization — NOT the old cone-4 / full-5 arc buckets
     (those are gone). **Melee** reads the build-aware, reach-scaled
     `meleeBudgetTargets`: the swept-sector model
     (`WEAPON.meleeAoe`, `intercept + gain·(1 − e^(−area/scaleArea))` capped at
     `targetCap`, where `area = half-angle · reach²`) evaluated at the REALISTIC
     stats a melee hero has by the weapon's `levelReq` — STR deepens reach
     (`rangePerStr`), INT widens the cone (`aoePerInt`) — so a starter threads
     ~1.3 and a high-level long blade climbs to the ~4 cap. Calibrated by
     `scripts/aoe-calibration.mjs --reach` (the swept-area fit) — arc alone
     barely mattered until STR made reach the dominant lever. **Ranged**: a
     spread counts its pellet `count`, a pierce/chain its calibrated distinct-foe
     reach (`WEAPON.rangedAoe`, ~0.5/pierce, ~0.7/chain — see `rangedShotTargets`).
     How many a melee swing ACTUALLY lands in play is `min(geometry,
     maxMeleeTargets)` (INT's cap, floor 2 + 1/INT) — which for a real melee
     build sits ABOVE the geometry, so reach, not the cap, is the limiter. An AoE
     weapon is deliberately weaker per hit and grows into the crowd it reaches.
   - **Crit lift** (`baseCritMult`): class-based crit damage — a flat ×2 for
     physical (melee & ranged), ×1.5 for magic, priced at a reference 15% crit
     chance. Weapons carry NO per-weapon crit stat; a magic weapon's softer
     crit buys it more per-hit budget in exchange. STR (melee) and INT (magic)
     deepen the LIVE crit on top (`weaponCritMult(state, weapon)` in items.ts),
     but the budget prices off the stat-independent `baseCritMult`.
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
   same model — keep all three in agreement, with TWO deliberate ranking
   nuances in `weaponScore`: a ranged spread's targets are credited at
   `1 + (count − 1) × WEAPON.rangedAoe.spreadRankDamp` (a burst is situational,
   not full value), and MELEE is credited at the hero's LIVE reach/cone
   (`meleeRealizedTargets(weaponSweepHalfAngle, weaponRangeFor)` capped by
   `maxMeleeTargets`) rather than the levelReq estimate the budget uses. The
   budget scripts and item card use the raw `weaponAssumedTargets`.
3. **Sprites** (the `pixel-assets` skill has the full loop): icon in
   `icons.mjs`, projectile in `effects.mjs`, `make assets`, then LOOK at
   `pwa/assets-preview/<name>@8x.png` — and at the arsenal in one
   piece: `node scripts/weapon-sheet.mjs` →
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

### Weapon art & swing animation — the swing preview

When the work is the LOOK of a weapon — its held sprite on the field hero, or
how it swings/recoils/casts (the swing animation, pivoted about the
shoulder in `render.ts` `weaponPose`) and how its slash/muzzle EFFECT reads —
drive `pwa/scripts/weapon-swing.mjs` instead of eyeballing the live game
(the swing is over in ~200 ms). It stages the field hero holding a weapon and
screenshots a numbered strip of the animation, frame by frame:

```sh
npm run assets && npx vite --port 5199 &        # from pwa/
node pwa/scripts/weapon-swing.mjs poses medieval_sword       # POSE + cone, pinned frame by frame (art)
node pwa/scripts/weapon-swing.mjs poses --class magic        # every magic weapon
node pwa/scripts/weapon-swing.mjs poses calibration_probe    # the debug weapon: red tip/base markers
node pwa/scripts/weapon-swing.mjs poses calibration_probe --arc 180  # the half-circle (max-INT) swing
node pwa/scripts/weapon-swing.mjs live medieval_sword        # slowed real attack — pose + slash/muzzle effect
node pwa/scripts/weapon-swing.mjs poses excalibur            # a UNIQUE's signature slash
node pwa/scripts/weapon-swing.mjs uniques                    # contact sheet of every unique slash
node pwa/scripts/weapon-swing.mjs live muramasa              # a unique's slash + its themed gore
node pwa/scripts/weapon-swing.mjs shots                      # contact sheet of every ranged/magic muzzle
node pwa/scripts/weapon-swing.mjs live pyrelight             # a magic unique's cast bloom + projectile trail
node pwa/scripts/weapon-swing.mjs live nine_mm --behind      # target BEHIND the hero — flash stays at the barrel
```

The hero faces where he MOVES, not where he shoots, so `--behind` (live mode)
stages the dummy behind him: his muzzle/cast flash must still fire at the weapon
tip (the barrel's facing side), not off his back — the melee slash already rides
the blade on the facing side.

`poses` pins the held-weapon pose at sampled fractions of the swing (via the
`?debug` `window.__swing` hook) for a clean read of the sprite through its arc;
for a melee weapon it also draws the **slash cone** pinned at the same fraction,
so blade and AoE are seen as one motion. `live` runs a real attack against a
dummy with the whole run slowed (via `window.__timeScale`) so the pose and its
effect are judged together. Strips land in `pwa/assets-preview/swing/`
(gitignored).

The melee blade **rides its cone**: it sweeps from the cone's start edge to its
end edge, so a wider cone swings the blade wider. The cone is INT-widened
(`weaponSweepHalfAngle`, capped at a half circle — `STATS.aoeMaxHalfAngle`);
`--arc <deg>` overrides the cone so you can see the swing at any width up to the
`180` cap without a stat build. The `calibration_probe` weapon (a debug weapon
that never drops — `equipment.ts` / `icons.mjs`) marks the blade TIP and BASE in
hot red so you can read exactly where the blade lies and line the cone up to it.
Tune `WEAPON_SHOULDER` (pivot, `paper-doll.ts`) and `BLADE_REST_ANGLE` /
`weaponPose` (`render.ts`), then re-shoot until the blade tracks the cone.

**Give a UNIQUE its own signature** (`pwa/src/game/weapon-fx.ts`). A render
concern keyed off the weapon's `uniqueId` — the engine knows nothing of it. Each
weapon CLASS has a plain base look; a named weapon overrides it:

- **Melee** — a `SLASH_STYLES` entry (`SlashStyle`): a `core`/`edge`/`glow`
  color, an optional `particle` stream, `afterimages` for a heavier blade, and a
  `gore` burst on the hero's hits. Kits: FIRE/HOLY/FROST/STORM/VOID/BLOOD/VENOM.
- **Ranged/magic** — a `SHOT_STYLES` entry (`ShotStyle`): the muzzle/cast flash
  color + `shape` (a gun's `rays`, a caster's `ring`/`bloom`), an optional
  `particle` puff, and the color the projectile glows in flight. Kits:
  FLAME/HOLY/STORM/COSMIC/FROST/VENOM/DEATH/SOLAR/TECH.

A named weapon should FEEL more powerful than its base — a couple of flourishes
is enough. Preview one with `poses <id>` / `live <id>` (gore and projectile
trails show in `live`), and eyeball the whole roster with `uniques` (melee
slashes) or `shots` (ranged/magic muzzles). Un-styled weapons keep the plain
class look, so the catalog grows one entry at a time. The engine's shared `nova`
crit-AoE stays un-themed (it carries no weapon attribution).

## Unique items (named drops)

UNIQUES are the top of the loot ladder above rolled rares: hand-authored named
drops (`content/items/{set,unique,legendary,artifact}/<id>.yaml`, `kind:
unique` — the directory is the minted tier; types + merge validation in
`src/game/defs/uniques.ts`) with a FIXED bonus block on a REAL catalog
base — no rolled affixes. Each drop still rolls a small ±band on the base
damage/armor (`UNIQUE.baseRollBand`, ±10%) so copies differ and a better roll
is worth chasing; the bonuses stay identical. They mint via `mintUnique`
(`items.ts`), unbreakable like any unique/legendary.

**Achievements ride the catalog for free.** Every unique automatically gets
its own badge in the achievements browser — the app's catalog
(`pwa/src/game/achievement-defs.ts`) derives one entry per `UNIQUE_IDS`
id (name from the def, icon via `equipmentIcon(base)`), and the loot-count
plus "find every unique" goals track the same registry. Nothing to add when
authoring a unique — but `tests/achievements_test.ts` asserts the badge icon
resolves in the shipped atlas, so a base whose icon sprite is missing fails
there too. Never RENAME a shipped unique id: the achievement ledger (and
player unlocks) key on it.

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
  (`spatha`, `microlattice_plate`, `fluted_greaves`, …) — they have no YAML
  file of their own (only a `grades:` block on their base), so **a file grep
  will tell you a real base doesn't exist.** Always resolve against the
  runtime record, i.e. run the checker's `--bases`, never `grep`.
- **The rarity ILVL-MARGIN ladder — power sits ABOVE where a find drops.** D2's
  rule: the rarer a find, the further its item level punches over the level it
  drops at. Rolled MAGIC lands loot+0..2 and RARE loot+3..5 (engine
  `rollItemLevel`, config `LOOT.ilvlMarginMagic`/`ilvlMarginRare`); the
  hand-authored tiers pitch their static ilvl a tier over their DROP LEVEL —
  UNIQUE ≈ +10, LEGENDARY ≈ +20, ARTIFACT ≈ +30 (up to ~+100 for the rarest,
  where drop odds fall off `(rarityBudgetRef/budget)^rarityBudgetExp`). A boss/
  world unique's "drop level" is the boss/level MONSTER LEVEL at its stage
  (bottom-tier ≈ where you first reach it, ~6/12/19/25 across the campaign;
  nightmare/jesus higher); a globally-rolled legendary/artifact anchors to its
  base `levelReq`. So author a boss unique at `ilvl ≈ stage mlvl + 10`, keeping
  `base.levelReq ≤` where it drops so it's wearable when found.
- **`ilvl` scales power and drop odds, not the equip gate.** Equip level is the
  base item's `levelReq` (like any tier), so a unique wears well below its ilvl.
  `ilvl` is NOT a free-hand number — it has a DEFINITION (`scripts/weapon-ilvl.mjs`):
  `ilvl = base.levelReq + bonusBudget`, where each fixed bonus is converted to
  "ilvl points" by a table DERIVED FROM THE LIVE COMBAT CONSTANTS (a STR point's
  damage, the crit/stamina/armor scaling), so 1 stat = 1 ilvl and a change to the
  combat math re-prices every unique. Run `node scripts/weapon-ilvl.mjs --suggest`
  to get the canonical ilvl to author, and `--check` to catch a piece that became
  over- or under-powered. Because a higher-req base is a higher grade (more
  armor/dps), pick one whose `levelReq ≈ ilvl − 20` (`EQUIP_GAP`) so it wears ~20
  levels below its power; too weak a base equips absurdly early and under-armors.
- **The bonus budget is capped, and the cap grows with the base's `levelReq`.** A
  low-req unique must keep a SMALL budget (`ilvl − levelReq`) — it can't smuggle
  late-game power in behind an early equip gate — while a high-req end-game piece
  may deviate a lot. `weapon-ilvl.mjs --check` flags the over-budget ones; the
  usual fix is to move a scaling `statPct`/`maxHpPct` keeper (30 ilvl at +3%) off a
  low base onto a higher-grade one, trim it, or buy it back with a downside.
  Trinkets (charm/bag) gate at req ~1 by design and are exempt from the cap.
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

1. Draft the def (name, base, slot, bonuses, lore) — but DON'T free-hand `ilvl`.
   For the base, run `node scripts/unique-check.mjs --bases <slot>` to see every
   REAL base in the slot with its req + armor/dps, and pick one at `req ≈ ilvl − 20`.
   Then `node scripts/weapon-ilvl.mjs --suggest` computes the canonical `ilvl`
   from your base + bonuses (`ilvl = levelReq + bonusBudget`) — author THAT number,
   and if `--check` flags it over-budget, rebalance the bonuses/base first.
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
shape (`world: true` in the item's YAML — the `WORLD_UNIQUES` group uniques.ts
derives), same `mintUnique` / ±band / equip rules — only the wiring and the
roll differ. The roll is `maybeDropWorldUnique`
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
   placements ("one primary home each" — a WORLD unique may additionally be
   re-listed by FARM-VENUE levels' world tables, the bunker rule; boss/stall
   homes never repeat), and prints a **World-drop
   grid** (level × difficulty) with the live role chances + gate. The Latin
   square stays boss-only.
4. Tests: `tests/engine/world_drops_test.ts` asserts the role scaling and the
   gate on SYNTHETIC fixtures — `registerDefs` now takes a `uniques` override,
   so an engine test can register a fixture unique + a fixture level's
   `worldUniques` without any shipped id. `tests/content/uniques_test.ts`
   coverage counts both homes. Run `npx vitest run` (the drop-table suite
   asserts every shipped unique has exactly one home).

## Auditing the named arsenal as a population — the scatter analyzer

The forge/budget/ilvl checkers vet ONE item at a time against the model. To see
the whole hand-authored named arsenal — every `tier: "unique" | "legendary" |
"artifact"` WEAPON (set signature weapons are plain uniques, there is no weapon
"set" tier) — as a POPULATION and spot outliers, run
`scripts/weapon-scatter.mjs`:

```sh
node scripts/weapon-scatter.mjs            # write the multi-chart page + print the report
node scripts/weapon-scatter.mjs --out x.html   # choose the output path
node scripts/weapon-scatter.mjs --json     # the computed rows as JSON
node scripts/weapon-scatter.mjs --body-only    # inner markup only (for embedding)
```

It writes a self-contained HTML page (`pwa/assets-preview/weapon-scatter
.html`, gitignored) of scatter charts — **x = Required Level on every chart**,
one panel per stat (ilvl, effDps, damagePct, crit, stat points, maxHp, per-hit)
— and prints a console report. Points are colored + shaped per tier.

The power model, and WHY it flags what it flags:

- **effDps** (the composite power) = the damage-budget model's effective DPS,
  folding the weapon's own `+% damage` and `+crit` bonuses AND its **ilvl
  base-damage scaling** (`WEAPON.damagePerIlvl` over `levelReq`). Stat grants,
  procs and granted spells are LEFT OUT — the stat grant has its own chart, and
  procs/spells can't be priced — so effDps is a **lower bound** (proc-laden
  artifacts hit even harder).
- **spike** = `effDps / budget(REQ)` — power delivered at the level you can
  equip it. Named weapons punch above their gate by design (ilvl > req), and
  **artifacts are meant to spike hardest, legendaries next** — so raw spike is
  NOT the flag.
- The flag is a **tier anomaly**: `spike ≥ 1.5× the weapon's OWN tier median`.
  That keeps the tier ordering intact and surfaces the genuine oddities — a
  low-req unique hitting like endgame gear, or an artifact hot even among
  artifacts. Two `ilvlx`/`dmgx` columns show the mechanism: the ilvl scaling and
  the **damagePct double-count** (a `+%dmg` bonus both RAISES the ilvl — via the
  `weapon-ilvl.mjs` bonus budget — AND directly multiplies damage, so it pays
  twice). Low-req uniques with a big `damagePct` are the usual offenders.

This is a REPORTING tool (no `--strict` gate) — read the charts, decide whether
an outlier is intended. The budget knobs (`BASE`/`PER_LEVEL`/`SPECIAL_PREMIUM`/
`REF_CRIT`) mirror `weapon-budget.mjs`; keep them in lockstep.

## After you're done — the checklist

- [ ] `node scripts/item-forge.mjs check` clean — the whole battery below in
      one command; the individual runs only matter when digging into a fail.
- [ ] `node scripts/weapon-budget.mjs --strict` clean — every weapon on its
      damage budget (or the drift is a deliberate, commented exception).
- [ ] `node scripts/weapon-stats.mjs --coverage` clean (or the warnings are
      deliberate) — including the drop-window coverage table.
- [ ] `node scripts/weapon-ilvl.mjs --check` clean, if you touched uniques or the
      combat/item constants (every unique's `ilvl` == computed, none over-budget).
- [ ] `node scripts/unique-check.mjs` clean, if you touched uniques (base
      integrity, ilvl drift + over-budget via weapon-ilvl.mjs, armor monotonicity,
      Latin-square coverage).
- [ ] `node scripts/weapon-sheet.mjs` and LOOK at the sheet.
- [ ] `make assets` committed together with the sprite YAML change
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
failure mode, a new behavior pattern), record it as a NEW lesson fragment —
`.lessons/$(date +%s)-short-slug.md` with `title:`/`date:` front matter and
the lesson in the body (format and lifecycle in
[`../LESSONS.md`](../LESSONS.md)). Never append lessons to this file:
parallel sessions editing one SKILL.md is what causes merge conflicts; one
fragment per lesson never collides.

Extend the checker when the lesson is checkable, so the next run catches it
mechanically instead of by eye: `scripts/weapon-stats.mjs` for weapon/loot
rules, `scripts/unique-check.mjs` for unique authoring (its tuning knobs —
`EQUIP_GAP`, `GAP_SLACK`, seed-base exclusions — are named constants at the
top; adjust them there, not inline).

When `skill-lessons.mjs` nudges (more than 15 fragments), run the consolidation pass
from `../LESSONS.md` as its own commit: merge near-duplicate fragments,
delete stale ones, and promote the load-bearing ones into the sections above
— consolidation is the only time lesson content moves into this file.
