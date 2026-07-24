# Talent system revamp — the plan

Status: **approved direction, implementation not started.** This document is the
master plan for replacing the cast-spell system with a WoW-style passive talent
system, to be implemented across multiple PRs (each phase below is one PR-sized
session). It was written against the codebase as of `25b8dd9`; re-verify file
references before starting a later phase.

## The pitch

Today the hero unlocks one of 75 **cast powers** (melee ARTS / ranged
TECHNIQUES / magic SPELLS) per 10 points of their dominant offensive stat,
slots a few onto a HUD spell bar, and taps them off, paying MANA per cast.

That whole system goes away. In its place: **passive talent trees.** Every 10
points a hero puts into STRENGTH, DEXTERITY, or INTELLIGENCE earns one talent
point in that stat's tree, spent — via a full-tree picker — on either a **new
talent** or an **upgrade** to an owned one (up to rank 5). Talents are always
on: no mana, no cooldown bar, no tapping. A melee build becomes a tank or a
whirlwind of cleaves; a ranged build becomes the fast, kiting crit machine; a
magic build ends up as a Vampire-Survivors-style engine of orbiting fireballs,
lightning strikes, and homing orbs that clears the screen without ever pressing
a button.

Alongside the swap, three simplifications:

- **MANA is removed** — the pool, SPIRIT's mana regen, mana potions, the blue
  gatorade mercy drops, the HUD mana bar.
- **The SPEED stat is removed** — five stats remain (STR/DEX/INT/LUCK/STAMINA);
  move speed becomes the ranged tree's identity (a talent), and gear.
- **The catalog shrinks** — from 75 one-shot powers to **24 talents (8 per
  tree) × 5 ranks**, each rank a visible power-up with upgraded FX.

## Decisions (locked with the user)

| Question        | Decision                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hybrid builds   | **Per-stat, hybrids allowed.** Each stat's ×10 milestones grant a point in THAT stat's tree — 40 STR + 30 INT = 4 melee + 3 magic points. No more dominant-stat gate.                                                                                                                                                                                             |
| Choice UI       | **Full tree picker.** A modal shows the whole tree for the milestone's class; spend the point on any talent (new, or upgrade if not maxed). No random offers.                                                                                                                                                                                                     |
| Tree size       | **~8 talents × 5 ranks per tree.** 40 ranks per tree vs. a max of 25 points per stat (250 hard cap ÷ 10) — even a full spec can't max its tree, so choices matter.                                                                                                                                                                                                |
| Respec          | **Permanent, no talent respec.** Replay variety comes from choosing differently.                                                                                                                                                                                                                                                                                  |
| Milestone basis | **Chosen (hand-allocated) points only** — gear never mints a talent point. Gear stats still scale talent _power_. _(Provisional: the user didn't rule on this one; chosen-only is the only basis compatible with permanent points — a +15 INT staff crossing a milestone and then coming off would strand a permanent point. Revisit only if pacing feels slow.)_ |
| Stat scaling    | Talents scale with their tree's stat: STR deepens melee talent numbers, DEX ranged, INT magic (damage, AoE radius, proc rates — per-talent). Ranks are the step changes; stats are the continuous slope.                                                                                                                                                          |
| FX              | Each talent's visual effect upgrades at rank milestones (more orbs, wider novas, richer trails) — leveling a talent must be _visible_.                                                                                                                                                                                                                            |

### Interaction with the existing stat respec

The game already ships a stat respec (`beginRespec`/`deallocateStat` in
`src/game/items/stat-points.ts`, `RespecOverlay.tsx`). Permanent talent points
need a consistency rule:

- **Spent talent points lock their stat floor.** A stat cannot be respecced
  below `10 × (talent points spent in that stat's tree)`. The respec UI shows
  the floor ("locked by talents").
- **Unspent talent points are revocable**: respeccing below an un-spent
  milestone takes the pending point back. Spent ones never come back — that's
  the permanence the user chose.

## The three trees

Numbers below are design intent, not tuned values — Phase 7 owns tuning.
Rank progression on every talent: roughly linear per rank with a kicker at
rank 5, and an FX upgrade at ranks 1 / 3 / 5.

### MELEE — STRENGTH tree ("Warlord"): tank or damage, scales the held weapon

| Talent              | Kind       | Effect (per rank)                                                                                           | FX                          |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Cleaving Echo**   | damage/AoE | Chance for a swing to strike +1 extra target beyond the weapon's cap; ranks add chance, R4+ adds +2 targets | wider slash shimmer         |
| **Twin Strike**     | damage     | Chance a blow lands twice (echo hit at ~50% damage; ranks add chance, R5 full-damage echo)                  | ghost-blade afterimage      |
| **Executioner**     | damage     | +crit chance and +crit damage with melee weapons                                                            | R5: gore-nova on crit kills |
| **Berserker Rage**  | damage     | +damage scaling with missing hp (steeper per rank)                                                          | red aura at low hp, R3+     |
| **Parry**           | tank       | Chance to fully negate a melee blow; R5 riposte returns % of the negated damage                             | steel flash on parry        |
| **Ironhide**        | tank       | Flat % damage reduction                                                                                     | —                           |
| **Seismic Landing** | damage/AoE | Jump landings deal AoE damage + knockback; ranks grow radius/damage                                         | dust ring → shockwave       |
| **Bulwark**         | tank       | +max hp %; R3+ adds slow out-of-danger regen                                                                | —                           |

### RANGED — DEXTERITY tree ("Windrunner"): damage, distance control, mobility

| Talent                | Kind       | Effect (per rank)                                                              | FX                       |
| --------------------- | ---------- | ------------------------------------------------------------------------------ | ------------------------ |
| **Piercing Shot**     | damage     | Shots pierce +1 enemy at % falloff; ranks add targets, soften falloff          | tracer lengthens         |
| **Deadeye**           | damage     | +crit chance and +crit damage with ranged weapons                              | R5: crit tracer glint    |
| **Concussive Rounds** | control    | Hits knock targets back; ranks add force/chance                                | impact puff              |
| **Crippling Shot**    | control    | Hits slow targets; ranks deepen slow + duration                                | frost-less "hobble" tint |
| **Wind Runner**       | mobility   | +move speed % (the SPEED stat's successor)                                     | speed lines at R3+       |
| **Spring Heels**      | mobility   | Higher, longer jumps; R5 shortens the stamina jump cost                        | —                        |
| **Evasion**           | survival   | +dodge chance; R5 dodges leave an afterimage + brief speed burst               | afterimage               |
| **Volley**            | damage/AoE | Chance a shot fires +2 extra projectiles in a spread; ranks add chance, R4+ +4 | fan muzzle flash         |

### MAGIC — INTELLIGENCE tree ("Archon"): weapon-independent, always on

| Talent                 | Kind    | Effect (per rank)                                                                                            | FX                     |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **Orbiting Flames**    | offense | Fireballs orbit the hero, burning what they touch; ranks add orbs + damage + radius                          | richer trails per rank |
| **Storm Call**         | offense | Periodic lightning strikes the best nearby foe; ranks add frequency, damage, R4+ chains                      | thicker forks          |
| **Seeker Orbs**        | offense | Homing arcane orbs spawn periodically and explode on impact; ranks add orbs + blast radius                   | bigger detonation      |
| **Immolation Aura**    | offense | Burning aura damages adjacent enemies per second; ranks grow radius + dps                                    | visible heat ring      |
| **Arcane Singularity** | offense | Periodically spawns a vortex that pulls and damages enemies; ranks add pull, damage, frequency               | screen-warping R5      |
| **Frost Nova**         | defense | When struck, freeze nearby enemies in place (internal cooldown); ranks grow radius/duration, shrink cooldown | ice shatter ring       |
| **Arcane Retribution** | defense | Reflect % of enemy attack damage back at the attacker                                                        | thorn sparks           |
| **Mage Armor**         | defense | Magic shield reduces damage taken by %; R3+ visible shimmer shell                                            | shimmer shell          |

The magic tree deliberately never reads the held weapon — a deep-INT hero with
five ranked always-on spells is the closest thing to a top-leveled Vampire
Survivors run: standing in the horde while the build does the killing.

## Engine architecture

### New modules

- **`src/game/defs/talents/`** — `index.ts` (types + registry, mirroring
  `defs/spells.ts`: `TalentDef`, `TalentEffect`, `talentDef()`,
  `setTalentDefs()` for test fixtures) plus `melee.ts` / `ranged.ts` /
  `magic.ts` (the 24 defs). Talents stay **TS defs, not content YAML**: the
  catalog is small, and every effect is bound to an engine hook — the same
  reasoning that keeps `defs/abilities.ts` in TS. Per-rank numbers are authored
  as 5-tuples (or base + per-rank slope) on the def.
- **`src/game/talents.ts`** — the runtime: `talentRank(state, id)`,
  `talentPointsEarned(spentStats)` (= `Σ floor(chosenStat/10)` per tree),
  `spendTalentPoint`, the stat-scaling helpers (`talentPower` — rank curve ×
  stat slope × `abilityPowerScale`), and the respec floor rule.
- **`src/game/config/talents.ts`** — the tuning block (per-talent base numbers
  live on the defs; global knobs — proc caps, freeze-cooldown floors, the
  stat-scaling slopes — live here, one read site each, BALANCE-slider-ready).

### State & persistence

- `Player` gains `talents: Record<string, number>` (id → rank) and loses the
  whole spell/mana block (`mana`, `maxMana`, `manaRegenMs`, `spellSlots`,
  `spellCooldowns`, `spellQueue`, `globalCooldownMs`, `manaPotions`, buff/
  shield timers — Mage Armor and Frost Nova keep their own tiny fields).
- `GameState.pendingSpellUnlocks` → `pendingTalentPoints: StatName[]` (a queue
  of earned-but-unspent points, drained by the picker modal; reuses the
  level-up pause gating from `resumeAfterLevelup`).
- `Loadout` (types/io.ts) gains `talents`, drops `spellSlots`/`manaPotions`.
  All optional-for-back-compat, per the existing pattern.

### Effect hooks (where each talent kind lands)

- **Stat-modifier talents** (Executioner, Deadeye, Ironhide, Bulwark, Wind
  Runner, Evasion, Berserker Rage, Mage Armor, crit halves of others): read
  sites in `src/game/items/combat-stats.ts` — the same functions that already
  fold stats + affixes (`playerSpeed`, crit chance/mult, dodge, damage mults).
  One additive term per read site; no new step machinery.
- **On-hit proc talents** (Twin Strike, Cleaving Echo, Volley, Piercing Shot,
  Concussive Rounds, Crippling Shot, Parry, Arcane Retribution, Frost Nova):
  the existing proc pattern (`stepProcs` / `equippedProcs` in
  `step/powers.ts` + `spells.ts`) generalizes — talents contribute procs the
  same way proc affixes do today. Knockback/slow reuse the engine's existing
  status machinery (stasis chill, knockback impulses).
- **Always-on conjurations** (Orbiting Flames, Storm Call, Seeker Orbs,
  Immolation Aura, Arcane Singularity): **reuse the granted-item spell
  machinery** — `syncItemSpells`/`stepItemSpells` already run permanent
  orbit rings and storm strikes off `player.itemSpells`. Talents become a
  second rank source feeding the same sync (talent rank + item grants stack),
  with two new `SpellKind`s: `seeker` (homing orb) and `singularity` (vortex);
  Immolation is an always-on aura tick in the same step. Legendary items that
  grant orbit/storm/stasis keep working unchanged — and now visibly synergize
  with the magic tree.
- **Jump-landing** (Seismic Landing, Spring Heels): `step/player.ts` owns jump
  physics; add a `landed` event + hook where `z` returns to ground.

### Removals

- **Cast spells**: `sorcery.ts`, `items/spellcasting.ts` (helpers migrate into
  `talents.ts`), `defs/spells.ts` + the three ladders, `castSpell` inputs,
  cast events, `SpellBar.tsx` + picker, `SpellUnlockOverlay.tsx` (replaced by
  the talent picker), spell hotkeys, `window.__cast` (replaced by
  `window.__talent`), the 75 `spell_*` icons (the best are renamed/reused as
  talent icons), `spell-preview.mjs` (rebuilt as `talent-preview.mjs`).
- **Mana**: `MANA` + mana half of `REGEN` (config/player.ts),
  `computeMaxMana`, mana potions (`items/consumables.ts` `"mana"` kind,
  `ConsumableDock` slot, sprites), `manaShare` + the low-mana mercy rope
  (config/loot.ts, loot.ts, items/mercy.ts) — `manaShare`'s 5% folds into the
  health-potion share. **SPIRIT survives** as the hp-regen stat (its mana half
  dies; armor-material weights in config/armor.ts keep cloth leaning SPIRIT).
- **SPEED stat**: `"speed"` leaves `StatName`, `speedPerPoint` leaves
  config/stats.ts, `playerSpeed()` drops the stat term (base + gear + Wind
  Runner + STR slow remain), the "OF THE HARE" suffix retires from the affix
  pool, the chooser/respec rows and `icon_stat_speed` go. `strengthSlowPerPoint`
  **stays** — the STR mobility tax is now answered by the ranged tree instead
  of a stat, which sharpens the class identities. Weapon YAML `speed:` (attack
  cadence) is unrelated and untouched.

### Save migration

All in the existing adopt-on-load path (`migrateLoadout` in
`pwa/src/game/characters.ts`, shared by roster load and file import):

1. **SPEED refund**: `spentStats.speed` returns to unspent points;
   `stats.speed` drops the same amount; the key is deleted.
2. **Talent conversion**: earned points = `Σ floor(spentStats[stat]/10)` for
   STR/DEX/INT, all enqueued as pending — an adopted veteran opens with a
   satisfying pile of picks (their old spells are gone; this is the trade).
3. **Dropped fields**: `spellSlots`, `manaPotions` ignored on read, no longer
   written.
4. In-progress run saves: bump `SAVE_VERSION` (saved-run.ts) — mismatch resets
   the run, the established mechanism.
5. `character-transfer.ts` `FORMAT_VERSION` bumps; import routes through the
   same `migrateLoadout`.

### Bot / sim / demo

- `botAllocate` (bot/index.ts) already picks stats; add `botPickTalent` — a
  per-build priority list on the build defs (`builds.ts`), so autoplay,
  `simulate-run`, the attract demo (`demo-director.ts`), and seeded characters
  drain pending points deterministically.
- Delete the cast-picker economy (`arsenal.ts` `pickSpellToCast`,
  `botAssignSpellBar`, the `spellEff*` tuning knobs, mana-potion supply
  logic).
- `simulate-run` reports swap the spell-economy line for a talent line (points
  earned/spent, per-talent ranks at run end).

## Phases (one PR each)

Ordering rule: the game stays playable after every merge. Talents land while
the old system still runs; the removal comes only when talents can carry a
build; balance closes it out.

| #   | PR                                                  | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Verification                                                                                             |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0   | `docs: talent system plan`                          | This document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                        |
| 1   | `feat!: remove the SPEED stat`                      | Smallest independent slice: StatName, config, playerSpeed, affix suffix, chooser/respec UI, icon, save migration (refund), tests (`spent_stats`, `builds`, `leveling`). Breaking → `!`.                                                                                                                                                                                                                                                                                                                                 | `make test`, respec + import of an old character with SPEED points                                       |
| 2   | `feat: talent engine core + stat-modifier talents`  | `defs/talents/`, `talents.ts`, config, state/loadout fields, `pendingTalentPoints` accrual (×10 milestones **stop enqueuing spell unlocks** and enqueue talent points instead), the talent picker overlay (replacing SpellUnlockOverlay's slot in the level-up flow), respec floor rule, bot `botPickTalent`, persistence + migration step 2, and the ~10 pure stat-modifier talents across all three trees. Old cast system still present (already-unlocked spells keep working) but earns nothing new — transitional. | engine tests (fixture catalog per `tests/engine/` rules), playtest a ding → picker → visible stat change |
| 3   | `feat: magic tree — always-on conjurations`         | Talent ranks feed `syncItemSpells`; new `seeker` + `singularity` SpellKinds; Immolation aura; Frost Nova / Retribution / Mage Armor defensive procs; icons; cast FX + per-rank FX upgrades (render/effects.ts); sfx.                                                                                                                                                                                                                                                                                                    | `spell-fx`-style preview loop, `?scenario=` horde staging, fps check at rank 5                           |
| 4   | `feat: melee & ranged proc talents`                 | Twin Strike, Cleaving Echo, Volley, Piercing Shot, Concussive/Crippling Rounds, Parry/riposte, Evasion R5, `landed` event + Seismic Landing, Spring Heels; FX + sfx.                                                                                                                                                                                                                                                                                                                                                    | engine tests per proc, playtest                                                                          |
| 5   | `feat!: remove cast spells, mana, and mana potions` | The big deletion (see Removals): sorcery, spell bar, unlock overlay, mana pool/potions/mercy/loot share, spell icons (best renamed into talent icons), bot cast economy, events, sfx hooks, `window.__cast`→`__talent`, migration steps 1–5 complete, SAVE_VERSION bump.                                                                                                                                                                                                                                                | full `make test` + `make lint`, import legacy character, campaign `simulate-run`                         |
| 6   | `chore: retool previews, skills, docs`              | `talent-preview.mjs`, rewrite `.agent/skills/spell-fx` → `talent-fx`, update `simulate-run` reports, `docs/game-content.md` / `architecture.md` / `configuration.md`, HUD copy.                                                                                                                                                                                                                                                                                                                                         | skill dry-run, `make lint`                                                                               |
| 7   | `balance: talent-era tuning`                        | Full-campaign `simulate-run` easy→JESUS per archetype (pure STR / DEX / INT / hybrids); retune talent numbers, `abilityPowerScale` interplay, mob hp if needed; add a BALANCE slider knob for talent power if warranted; bot tuning (`spellEff*` knob replacements).                                                                                                                                                                                                                                                    | `simulate-run --verdict` per archetype, `--compare` before/after                                         |

Phases 3 and 4 are order-independent; 5 requires both. Each phase updates the
tests it touches and adds a changeset fragment (1, 2, 3, 4, 5, 7 are
user-visible; 0 and 6 are docs/tooling).

## Design guardrails

- **Numbers keep meaning**: every damage-dealing talent rides
  `abilityPowerScale` like casts did, so a rank means the same fraction of a
  level-appropriate healthbar all campaign.
- **Proc ceilings**: chance-based talents (Twin Strike, Volley, Frost Nova)
  get internal cooldowns or chance caps in `config/talents.ts` so rank 5 ×
  high stats can't degenerate into per-frame procs (fps + balance).
- **Determinism**: all procs roll through the run's seeded RNG — sim results
  and bot runs stay reproducible.
- **Hybrid honesty**: per-stat points mean a 40/30 split hero is genuinely
  weaker in each tree than a 70-point spec — the stat-scaling slope (not just
  rank access) is what keeps specialization attractive. Watch this in Phase 7.
- **One read site per knob**: each talent's effect applies at the single
  engine read site that owns its rule, per the BALANCE-knob convention.

## Open questions (parked, not blockers)

- Whether adopted veterans' converted talent points should be granted all at
  once (current plan) or dripped over the next few levels.
- Whether the merchant should sell anything talent-adjacent (it never sold
  mana potions, so nothing is lost — but a "talent scroll" consumable could be
  a future coin sink; out of scope here).
- Whether `SPELL_SLOTS`-era keybindings free up enough HUD corner space to
  surface a compact "talent loadout" glance widget (nice-to-have, Phase 6+).
