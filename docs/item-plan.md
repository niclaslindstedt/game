# Unique & legendary item roadmap

The working plan for filling out the top of the loot ladder: per-spec UNIQUE
coverage on HARD / NIGHTMARE / JESUS, and named LEGENDARIES as the slow-burn
endgame chase culminating in a level-99+ farming loop. Implementation runs in
phases (checkboxes below); engine support lands first, then the item batches.

Status legend: `[ ]` not started · `[x]` done.

---

## Goals

- **Uniques:** every spec (melee / ranged / magic) can assemble a full unique
  loadout on HARD (1 suitable set per spec), NIGHTMARE (2), and JESUS (3).
  Armor is shared across specs where sensible — only weapons and a few
  spec-leaning pieces differ.
- **Legendaries:** surface slowly, and become the level-99 endgame farming
  goal. Counts: **1 on hard, 3 on nightmare, ~30 on JESUS** (6 obtainable
  pre-99, the rest gated to the 99+ grind).
- **Legendaries span a VAST power range, and stats determine rarity**: the
  roster is authored from solid to god-tier, and an item's drop weight falls
  off as a POWER LAW of its priced bonus budget — the 0.001%-grade finds are
  exactly the incredibly powerful ones. Mechanical, not vibes. (Decided: NO
  mint-time scaling — a legendary's power is authored, its odds derived.)
- **Magic needs mechanics, not just numbers:** items can grant _forever
  spells_ — e.g. fireballs circling the hero, periodic bolts — firing at an
  interval and improved by INTELLIGENCE. Legendaries may grant such effects
  to ALL specs (e.g. magic effects on hit).
- **Tone:** timeless and epic. No jokes in unique/legendary names or lore.
- **Naming (decided):** real mythological artifact names are RESERVED for the
  99+ endgame roster (following MJÖLNIR — the Rift dredging up Earth's
  history justifies them in-world). Every legendary below 99+ and all plain
  uniques carry ORIGINAL epic names in the game's own voice.
- **No new art.** Every item sits on an existing catalog base (grade variants
  included) and every granted spell reuses the shipped effect sprites
  (fireball, storm bolt, …).

## Current state (what exists today)

- 53 uniques: the 35-piece boss Latin square (each rung one full
  weapon+armor set + bag + charm), EASY + MEDIUM world-drop batches, and the
  Eastworld merchant stall. The HARD / NIGHTMARE / JESUS world-drop columns
  are **empty**.
- Exactly **one legendary** ships: MJÖLNIR (medium rung world drop, ilvl 57).
- Per-rung weapon coverage is one spec each: HARD has a magic weapon
  (RIFTMAW), NIGHTMARE a ranged one (WRATHFLAME), JESUS a melee one (THE
  FALLEN STANDARD).
- Drop channels already in place: the folded rarity roll (`rollTier` →
  `pickUniqueForDrop`, legendary gate mlvl 40, base 0.3%), boss tables
  (`EnemyDef.uniquesByDifficulty`), world drops
  (`LevelDef.loot.worldUniques` + `WORLD_DROP` role odds), per-item `rarity`
  weights. The engine needs **no new drop channel** — only new bonus
  mechanics and the legendary rarity law.
- Campaign landings (`leveling-curve.mjs --by-level`): hard ends ~43,
  nightmare ~53, jesus ~60; hard cap `LEVELING.maxLevel` = 99. JESUS mobs run
  at `player + 2`, elites/bosses higher still (`levelBonus`, menace re-stamp)
  — the endgame grind the 99+ legendaries' high-req bases gate behind.

## Target coverage matrix (weapons per rung, by spec)

| Rung      | Melee  | Ranged | Magic | New weapons | New armor | New legendaries       |
| --------- | ------ | ------ | ----- | ----------- | --------- | --------------------- |
| HARD      | 1      | 1      | 1 ✓   | +2          | +2        | +1                    |
| NIGHTMARE | 2      | 2 (1✓) | 2     | +5          | +4        | +3                    |
| JESUS     | 3 (1✓) | 3      | 3     | +8          | +8        | +6 pre-99, +24 at 99+ |

✓ = already shipped via the boss Latin square. Armor "options per slot" per
rung: hard 1 (boss set) + 2 spec-leaning extras, nightmare 2, jesus 3.
All new items are **world drops** wired on their rung's
`LevelDef.loot.worldUniques` column (the empty columns), spread across the
rung's levels, relisted by the bunker farm venue per the standing rule. Boss
runs stay the efficient farm via the role-scaled odds.

---

## Phase 1 — engine support (all of it, before any items)

### 1a. Granted spells — the "forever spell" affix

A new `Affix` kind grants a permanent, item-powered spell while the piece is
worn — the item-granted twin of the timed ability pickups, reusing the same
step/render machinery (`abilities.ts` orbit/storm/stasis):

```ts
| { kind: "spell"; spell: "orbit" | "storm" | "stasis"; rank: number }
```

- A new `SPELL` config namespace defines each spell's base numbers per rank
  (orb count/damage/radius, bolt interval/damage/range, slow field
  radius/factor). Ranks are small integers (1–5); rank sets the magnitude.
- **INTELLIGENCE improves them**: damage deepens via the standing
  `abilityPowerScale` (level ramp × `ABILITY.intDamagePerPoint`), and the
  new `SPELL.intervalPerInt` knob shortens tick/strike intervals per
  effective INT point (floored at `SPELL.intervalFloor`) — so INT is the
  spell stat for every spec, matching melee cleave already being INT's.
- Engine: a derived "item spells" pass in the step pipeline (worn equipment →
  active granted spells; no duration, active while worn). Multiple sources
  stack like stackable abilities.
- Presentation: item card gets a spell line (e.g. `GRANTS: CIRCLING FIRE`),
  arsenal + tooltip render it, and the field effect reuses the existing orb /
  bolt / field visuals and SFX. No new sprites.

### 1b. Proc affixes — magic effects on hit/kill (legendary territory)

```ts
| { kind: "proc"; trigger: "hit" | "kill" | "struck"; spell: "bolt" | "nova"; chance: number; rank: number }
```

- `bolt` reuses the storm strike (single-target zap at the struck/killed
  enemy); `nova` is a small new AoE ring burst centred on the trigger point
  (damage-only, drawn with existing effect sprites).
- `chance` is per qualifying event; INT scales damage the same way. The
  `struck` trigger is the D2 "% chance to cast when struck": it rolls when
  an ENEMY blow lands on the hero (contact, mechanic slams, hostile shots —
  never impartial hazards, never dodged blows); a bolt grounds in the
  attacker, a nova bursts around the hero.
- Reserved in practice for legendaries (the checker warns on procs on plain
  uniques), and it's how "magic effects for all classes" lands: a melee
  legendary that chains lightning on hit, a bow that novas on kill.

### 1c. Sure-strike (small, buys "never misses" fantasy)

```ts
| { kind: "sureStrike" }
```

Zeroes the hero's innate miss chance while worn (`playerMissChance` reads
it). One legendary-grade line, cheap to implement, priced into the ilvl
model.

### 1d. Stats determine rarity (the legendary power law)

- Legendaries are authored across a VAST power range and are EXEMPT from the
  unique budget cap — power is paid for in ODDS, not the equip gate. The
  selection weight in `pickUniqueForDrop` is _derived from the item's bonus
  budget_ (the weapon-ilvl pricing model) as a power law:
  `weight × (rarityBudgetRef / budget)^rarityBudgetExp` past the reference —
  twice the reference budget is ~16× rarer, five times ~600× rarer, so the
  god-rolls are astronomically rare by construction. Authored `rarity`
  remains as an override multiplier only. No mint-time scaling: two copies
  differ only by the standing ±band.

### 1e. Pricing, checkers, tests

- `scripts/weapon-ilvl.mjs`: price `spell`, `proc`, `sureStrike` into ilvl
  points off the live SPELL/combat constants, so the budget rules keep
  binding.
- `scripts/unique-check.mjs`: procs-on-legendaries-only warning, the
  legendary rarity report (budget → weight, power-law).
- Engine tests (synthetic fixtures, `tests/engine/`): granted-spell
  stepping + INT scaling, proc triggers (hit/kill/struck), the rarity
  power law.
- Docs: `docs/configuration.md` (new knobs), `docs/architecture.md` if the
  public API surface moves.

### Phase 1 checklist

- [x] `Affix` union: `spell`, `proc`, `sureStrike` (types.ts)
- [x] `SPELL` config namespace + INT interval-scaling knobs (config.ts)
- [x] Granted-spell derivation + stepping (item spells beside abilities)
- [x] `nova` burst effect (engine + render, existing sprites)
- [x] Proc triggers on hit/kill in the combat path
- [x] `sureStrike` in `playerMissChance`
- [x] Legendary power law: budget-derived drop weight, cap exemption
- [x] When-struck proc trigger (D2 cast-when-struck) on the player-damage paths
- [x] Item card / tooltip / arsenal lines for the new affix kinds
- [x] `weapon-ilvl.mjs` pricing for the new kinds
- [x] `unique-check.mjs` rules (proc discipline, legendary rarity report)
- [x] Engine tests for all of the above (fixtures, no shipped ids)
- [x] Docs sync + changelog fragment

## Phase 2 — HARD batch (4 uniques + 1 legendary)

World drops on the hard column (gate: minion lottery at lvl 46; elites/bosses
drop during the campaign). Bases picked at implementation time via
`unique-check.mjs --bases` / `--suggest` (req ≈ ilvl − 20); ilvls set by
`weapon-ilvl.mjs --suggest`. Target ilvls ~40–55. Concepts:

| Item                             | Slot            | Spec   | Identity                                                                                                                            |
| -------------------------------- | --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **OATHBRAND**                    | weapon (melee)  | melee  | STR keeper + damage — the sworn blade that completes the hard melee set                                                             |
| **LONGWATCH**                    | weapon (ranged) | ranged | DEX + crit sniper — patience rewarded                                                                                               |
| **COLOSSUS PLATE**               | chest           | melee  | heavy armor + STR, small speed downside — the wall                                                                                  |
| **HUNTSMAN'S COWL**              | head            | ranged | DEX + crit + speed — the stalker's profile                                                                                          |
| **THE INEVITABLE** _(legendary)_ | weapon (ranged) | all    | the shot that has never landed anywhere but home: `sureStrike` (never misses) + on-hit `bolt` proc + DEX keeper. Out-ilvls MJÖLNIR. |

### Phase 2 checklist

- [x] 4 unique defs + 1 legendary def (`uniques.ts`, world-drop group)
- [x] Wire `loot.worldUniques.hard` across the rung's levels + bunker relist
- [x] `weapon-ilvl.mjs --suggest` ilvls; `unique-check.mjs` clean
- [x] `item-forge.mjs check` battery clean
- [x] Content tests pass (placement coverage suites)
- [x] `docs/game-content.md` update + changelog fragment
- [x] Playtest: THE INEVITABLE proc feel at the phone viewport (headless probe: equips, 11 bolt procs/60s, 0 whiffs, bot 18→115 kills)

## Phase 3 — NIGHTMARE batch (9 uniques + 3 legendaries)

Second set per spec (ilvls ~55–70, gate 57). Weapons: +2 melee, +1 ranged,
+2 magic; armor: +4 spec-leaning pieces (one per slot). Legendaries (one per
spec, each carrying a granted spell or proc):

- **THE RECKONING** — melee. The cursed blade: huge damage + crit, a real
  downside (hp). It always cuts — `sureStrike`.
- **SKYBREAKER** — ranged. The storm answers every shot: on-hit bolt proc +
  DEX.
- **SUNWREATH** — magic. The burning crown of a dead star: grants `orbit`
  (circling fire) + INT keeper — the first forever-spell showcase.

- [ ] 9 unique defs + 3 legendary defs, world-drop wiring on the nightmare column
- [ ] Checker battery + tests + docs + changelog
- [ ] Playtest SUNWREATH orbit uptime/feel

## Phase 4 — JESUS pre-99 batch (16 uniques + 6 legendaries)

Third set per spec (ilvls ~70–95, gate 60). Weapons: +2 melee, +3 ranged,
+3 magic; armor: +8 (two per slot). Legendaries — one per spec + three
armor/trinket anchors, all with spells/procs:

- **KINGSBANE** (melee weapon) · **THE LONG SILENCE** (ranged weapon) ·
  **STARFALL** (magic weapon, on-kill nova)
- **THE STILLWARD** (chest — the unbreakable guard, `stasis` field)
- **WINDGRAVE** (feet — winged speed)
- **EMBERHEART** (charm — the burning heart, `orbit`)

- [ ] 16 unique defs + 6 legendary defs, world-drop wiring on the jesus column
- [ ] Checker battery + tests + docs + changelog

## Phase 5 — JESUS 99+ legendaries (~24, the power ladder)

The endgame farm: authored ilvls ≥ 99 on high-req elite bases (gated out of
earlier play naturally), deliberately spread across a VAST power ladder —
from strong keepers near the reference budget up to god-tier pieces at
several times it, which the rarity power law makes hundreds of times rarer.
Provisional
roster (subject to a naming pass at implementation):

- Weapons — melee: **DURENDAL**, **GRAM**, **MURAMASA** · ranged:
  **FAIL-NOT**, **SHARANGA**, **HARPE** · magic: **RUYI JINGU**,
  **THYRSUS**, **SEIDR STAFF**
- Head: **TARNHELM**, **HELM OF DARKNESS**, **ÆGISHJÁLMR**
- Chest: **GOLDEN FLEECE**, **BABR-E BAYAN**, **ACHILLEAN PLATE**
- Legs: **MEGINGJÖRÐ**, **SEVENLEAGUE**, **JÖTUNN GREAVES**
- Feet: **WINDRUNNERS**, **SLEIPNIR'S SHOES**, **VIDAR'S BOOT**
- Charms: **DRAUPNIR**, **SAMPO** · Bag: **CORNUCOPIA**

- [ ] ~24 legendary defs (ilvls 99+, spec spread as above, budgets spanning the power ladder)
- [ ] Rarity-derivation sanity pass (`unique-check.mjs` report)
- [ ] Checker battery + tests + docs + changelog

## Phase 6 — balance verification

- [ ] `simulate-run.mjs` full campaign: drop counts per rung within intent
      (legendaries rare pre-99; hard/nightmare/jesus sets attainable)
- [ ] Cap-level JESUS farm simulation: legendary drop rates across the power ladder
- [ ] Arsenal screen eyeball (ordering, cards, spell lines)
- [ ] Playtest pass at the phone viewport
