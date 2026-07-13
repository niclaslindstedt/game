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
| Weapon defs, tier ladder, affix BRACKETS, naming | `src/game/defs/equipment.ts` (re-exports the gear record) |
| Gear (armor/charm/bag) base defs | `src/game/defs/gear.ts` |
| Base GRADES (Normal → Exceptional → Elite): per-base names + generated variant defs | `src/game/defs/grades.ts` |
| MAKE QUALITY (broken → perfect): multipliers + mlvl-sliding roll odds | `src/game/config.ts` (`QUALITY`); the roll in `items.ts` (`rollQuality`) |
| Loot config: tier gates (`tierUnlockMlvl`), base tier chances, ilvl deficit weights, drop shares | `src/game/config.ts` (`LOOT`) |
| Chain/cooldown/damage globals | `src/game/config.ts` (`WEAPON`) |
| Which bases drop on a level (thematic pools) | `src/game/defs/levels/<level>.ts` `loot.weaponPool` |
| Elite/boss drops: signatures (`items`), per-tier pledges (`tierDrops`), boss UNIQUE tables (`uniquesByDifficulty`), `levelBonus` | `src/game/defs/enemies/<roster>.ts` |
| Named UNIQUE defs (fixed bonuses on a real base) | `src/game/defs/uniques.ts` (`WORLD_UNIQUES` group = level-locked ones) |
| The ilvl MODEL (what a unique's `ilvl` means; over/under-power check) | `scripts/weapon-ilvl.mjs` — `unique-check.mjs` imports it; conversion table derived from live combat constants |
| Unique mint + drop roll: `mintUnique`, `maybeDropBossUnique`, `UNIQUE` config | `src/game/items.ts`, `src/game/loot.ts`, `src/game/config.ts` |
| World-drop uniques: level wiring, role-scaled roll, gate | `LevelDef.loot.worldUniques`, `maybeDropWorldUnique` (loot.ts), `WORLD_DROP` config; size the gate with `scripts/leveling-curve.mjs --by-level` |
| The roll pipeline (tier → ilvl → affixes), equip gates | `src/game/items.ts` (`rollEquipment`, `meetsLevelReq`) |
| Kill → drop funnel (pity rule, tierDrops payout) | `src/game/loot.ts` |
| Monster level stamping | `src/game/create.ts` (`spawnEnemy`), `src/game/menace.ts` (`mobLevelFor`, re-stamp in `maybePowerScale`) |
| Firing + projectile behaviors (spread/pierce/homing/chain) | `src/game/step.ts` (`stepWeapon`, `stepProjectiles`) |
| Icons (12×12) | `website/scripts/sprite-data/icons.mjs` |
| Projectile sprites (8×8) | `website/scripts/sprite-data/effects.mjs` |
| Field-hero held weapon art + its swing/recoil/cast animation | `website/src/game/paper-doll.ts` (`WEAPON_SHOULDER` pivot), `render.ts` (`weaponPose`, `drawPlayer`); preview with `website/scripts/weapon-swing.mjs` |
| Tier colors, item tooltip (ilvl, level req) | `website/src/game/tiers.ts`, `InventoryPanel.tsx` |
| Keepsakes / hardcore rules (app-side permanence) | `website/src/game/progress.ts`, `settings.ts` |
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
   `count`/`spreadDeg`/`pierce`/`homing`/`chain`) and paste the forged def
   into `equipment.ts` — the damage is the budget line's answer, not yours.
   Add to the right level's `weaponPool` (bases — remember pools are
   cumulative, later maps inherit it) or to an enemy's `loot.items` / a
   level's `earlyDrops`/`allClearWeapon` (specials, forged with
   `--special`).
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

### Weapon art & swing animation — the swing preview

When the work is the LOOK of a weapon — its held sprite on the field hero, or
how it swings/recoils/casts (the WEAPON SWING animation, pivoted about the
shoulder in `render.ts` `weaponPose`) and how its slash/muzzle EFFECT reads —
drive `website/scripts/weapon-swing.mjs` instead of eyeballing the live game
(the swing is over in ~200 ms). It stages the field hero holding a weapon and
screenshots a numbered strip of the animation, frame by frame:

```sh
npm run assets && npx vite --port 5199 &        # from website/
node scripts/weapon-swing.mjs poses medieval_sword       # POSE + cone, pinned frame by frame (art)
node scripts/weapon-swing.mjs poses --class magic        # every magic weapon
node scripts/weapon-swing.mjs poses calibration_probe    # the debug weapon: red tip/base markers
node scripts/weapon-swing.mjs poses calibration_probe --arc 180  # the half-circle (max-INT) swing
node scripts/weapon-swing.mjs live medieval_sword        # slowed real attack — pose + slash/muzzle effect
node scripts/weapon-swing.mjs poses excalibur            # a UNIQUE's signature slash
node scripts/weapon-swing.mjs uniques                    # contact sheet of every unique slash
node scripts/weapon-swing.mjs live muramasa              # a unique's slash + its themed gore
```

`poses` pins the held-weapon pose at sampled fractions of the swing (via the
`?debug` `window.__swing` hook) for a clean read of the sprite through its arc;
for a melee weapon it also draws the **slash cone** pinned at the same fraction,
so blade and AoE are seen as one motion. `live` runs a real attack against a
dummy with the whole run slowed (via `window.__timeScale`) so the pose and its
effect are judged together. Strips land in `website/assets-preview/swing/`
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

**Give a UNIQUE its own slash + gore** (`website/src/game/slash-fx.ts`). The
signature is a render concern keyed off the weapon's `uniqueId` — the engine
knows nothing of it. Add a `SLASH_STYLES` entry (or reuse an elemental kit —
FIRE/HOLY/FROST/STORM/VOID/BLOOD/VENOM): a `core`/`edge`/`glow` color, an
optional `particle` stream, `afterimages` for a heavier blade, and a `gore`
burst thrown on the hero's hits. A named blade should FEEL more powerful than
its base — a couple of flourishes is enough. Preview a single one with `poses
<id>` / `live <id>` (the gore shows in `live`), and eyeball the whole roster
side by side with `uniques`. Un-styled uniques fall back to the plain white
slash, so the catalog grows one entry at a time.

## Unique items (named drops)

UNIQUES are the top of the loot ladder above rolled rares: hand-authored named
drops (`src/game/defs/uniques.ts`) with a FIXED bonus block on a REAL catalog
base — no rolled affixes. Each drop still rolls a small ±band on the base
damage/armor (`UNIQUE.baseRollBand`, ±10%) so copies differ and a better roll
is worth chasing; the bonuses stay identical. They mint via `mintUnique`
(`items.ts`), unbreakable like any unique/legendary.

**Achievements ride the catalog for free.** Every unique automatically gets
its own badge in the achievements browser — the app's catalog
(`website/src/game/achievement-defs.ts`) derives one entry per `UNIQUE_IDS`
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
  (`spatha`, `microlattice_plate`, `fluted_greaves`, …) — they are NOT in the
  gear/equipment source files, so **a source grep will tell you a real base
  doesn't exist.** Always resolve against the runtime record, i.e. run the
  checker's `--bases`, never `grep`.
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
