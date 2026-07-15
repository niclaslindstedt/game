// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// The meter heats from the player's ACTUAL combat output — rolling
// damage-per-second and kill rate (tickMenace) — with an extra jolt from
// OVERKILL on a killing blow (bankOverkill); idling bleeds it back off, but
// never below the PERMANENT floor the evolution RATCHET has earned: mobs of
// the current stage getting one-shot lifts the floor a stage, so an
// overpowered player faces a horde that keeps evolving — no breaks — up to the
// difficulty's PEAK (the per-rung `menaceStageCap`: easy 3, medium 5, hard 10,
// nightmare 100; JESUS uncapped). Menace is read as an integer "stage" that
// drives three responses (all tuned in config MENACE):
//   1. LURE — the wave spawner keeps a denser, bigger crowd on the player
//      (crowd growth alone caps at lureStageCap), and every overkill drags
//      nearby mobs in through the walk-credit channel.
//   2. EVOLVE — minions spawned while menace is high carry extra hp (baked in
//      at spawn), so they take more killing and pay more xp (xp is
//      hp-proportional) — but their drops roll WORSE tiers, so a rampage is a
//      leveling faucet, not a loot farm.
//   3. POWER-MATCH — elites and bosses, folded together with the hero's own
//      POWER level (character level, total-gear ilvl, or the equipped
//      weapon's calculated damage mapped to a level — whichever is highest),
//      scale their hp and contact damage when they first engage, so the
//      set-piece fights keep pace instead of melting.
// Kept out of step.ts/loot.ts so both stay lean and this rule reads in one place.

import { LEVELING, MENACE, RARE_MOBS } from "./config.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
// items.ts also imports from this module (currentMobLevel) — a runtime-only
// cycle: both sides only reference the other inside function bodies, never
// during module evaluation, so ESM resolves it safely.
import { weaponDps } from "./items.ts";
import { autoPowerScale } from "./leveling.ts";
import { BALANCE } from "./tuning.ts";
import type { Enemy, GameState } from "./types.ts";

/** The current evolution stage: menace bucketed by `perStage`. The horde keeps
 * toughening as long as the player's output keeps proving it too easy (see the
 * ratchet in `bankOverkill`) — up to the difficulty's PEAK, which bounds the
 * underlying meter (`menaceCeiling`), so this reads at most `menaceStageCap`
 * stages on a capped rung (JESUS is uncapped). */
export function menaceStage(state: GameState): number {
  return Math.floor(state.menace / MENACE.perStage);
}

/** The permanent floor's stage: the evolution level the ratchet has locked
 * in — the meter never decays below it (see `tickMenace`). */
export function menaceFloorStage(state: GameState): number {
  return Math.floor(state.menaceFloor / MENACE.perStage);
}

/** The highest evolution STAGE this run's difficulty lets the meter reach —
 * its PEAK. EASY tops out at 3, MEDIUM 5, HARD 10, NIGHTMARE 100; JESUS omits
 * the knob and stays UNCAPPED (`Infinity` here). Both the live meter and the
 * permanent ratchet floor are clamped to it (see `menaceCeiling`), so a gentle
 * rung never evolves the horde past its ceiling however hard it is steamrolled. */
export function menaceStageCap(state: GameState): number {
  return difficultyDef(state.difficulty).menaceStageCap ?? Infinity;
}

/** The raw-menace ceiling: the cap stage's worth of points (`cap · perStage`),
 * or `Infinity` when the rung is uncapped. Clamping the raw meter here — rather
 * than only the `menaceStage` readout — keeps `state.menace`/`state.menaceFloor`
 * themselves bounded, so every derived read (evolution, lure, power-match, the
 * ratchet's own floor-stage check) respects the peak from one source of truth. */
export function menaceCeiling(state: GameState): number {
  const cap = menaceStageCap(state);
  return cap === Infinity ? Infinity : cap * MENACE.perStage;
}

/**
 * The early-game warmup factor, easing from `warmupFloor` at level 1 up to 1.0
 * by player level `1 + warmupLevels`. A fresh hero's menace gain is damped so
 * hard that (on a fair difficulty) the meter can't outrun its decay in the
 * opening levels — reaching rampage stage 1 is effectively impossible until the
 * player has grown into real power. The non-zero floor is what a very sensitive
 * difficulty multiplies through so JESUS still bites from the first kills.
 */
export function menaceWarmup(state: GameState): number {
  const t = Math.min(
    1,
    Math.max(0, (state.player.level - 1) / MENACE.warmupLevels),
  );
  return MENACE.warmupFloor + (1 - MENACE.warmupFloor) * t;
}

/**
 * How hard the meter reacts to the player's output right now: the difficulty's
 * `menaceMult` (EASY barely reacts; JESUS is scalding) times the early-game
 * `menaceWarmup`. All menace gain — the rolling DPS/kill-rate heat in
 * `tickMenace` and the overkill jolt in `bankOverkill` — is scaled by this, so
 * whether an overpowered run rampages, and how fast, is set by difficulty and
 * progression rather than raw output alone.
 */
export function menaceSensitivity(state: GameState): number {
  // The developer menace knob scales all gain (never the decay), so at 0.05
  // the meter effectively never heats and at 4 a rampage snowballs fast.
  return (
    difficultyDef(state.difficulty).menaceMult *
    menaceWarmup(state) *
    BALANCE.menaceGain
  );
}

/** The hp multiplier a minion spawned at evolution `stage` carries.
 * `effectMult` is the difficulty's `menaceEffectMult` — how hard a rampage
 * lands on the mobs on this rung (1 = the tuned baseline). */
export function evolutionHpMult(stage: number, effectMult = 1): number {
  return 1 + Math.max(0, stage) * MENACE.hpPerStage * effectMult;
}

/**
 * The hp scale a monster locks in at spawn, from the horde's RELATIVE LEVEL:
 * every mob spawns at `playerLevel + mobLevelOffset` (the difficulty's knob —
 * EASY fields mobs three levels under the hero, JESUS two levels above), and
 * each level off the baseline shifts hp by `mobHpPerLevel`. This folds the old
 * "the horde keeps pace as the hero grows" rule and the difficulty's toughness
 * into ONE number: the offset keeps the gap constant as the player levels, so
 * a JESUS horde never falls behind and an EASY one never catches up. Kill xp
 * is hp-proportional, so a higher-level horde also pays more per kill.
 * Floored at `mobHpScaleFloor` so a deep negative offset can't zero a mob out.
 */
export function mobHpScaleFor(playerLevel: number, difficulty: string): number {
  const offset = difficultyDef(difficulty).mobLevelOffset;
  const mobLevel = playerLevel + offset;
  // Multiplied by `autoPowerScale` — the damage curve the AUTOMATIC per-level
  // stat gains (LEVELING.autoGainsPerLevel) hand the hero for free — so that
  // free growth cancels out against the crowd instead of turning it into
  // one-hit kills. Keyed to the PLAYER's level (what the hero actually has),
  // not the offset mob level, so a difficulty's gap stays the same linear
  // offset as before; the `mobHpPerLevel` term keeps answering the CHOSEN
  // points, exactly as it always did.
  return Math.max(
    MENACE.mobHpScaleFloor,
    (1 + (mobLevel - 1) * MENACE.mobHpPerLevel) * autoPowerScale(playerLevel),
  );
}

/** The number of gear slots the hero's GEAR LEVEL averages over — every slot
 * counts, worn or empty, so a bare slot reads as ilvl 0. */
const GEAR_SLOT_COUNT = 7;

/**
 * The hero's GEAR LEVEL: the total item level across every equipment slot
 * (weapon, the four armor slots, charm, bag — empty slots count 0), averaged
 * over the full rack. This is what the hero's power ACTUALLY runs on once the
 * campaign is underway — a decked-out twink hits far above his character
 * level, a naked max-level hero far below it.
 */
export function heroGearLevel(state: GameState): number {
  const eq = state.player.equipment;
  const total =
    eq.weapon.ilvl +
    (eq.head?.ilvl ?? 0) +
    (eq.chest?.ilvl ?? 0) +
    (eq.legs?.ilvl ?? 0) +
    (eq.feet?.ilvl ?? 0) +
    (eq.charm?.ilvl ?? 0) +
    (eq.bag?.ilvl ?? 0);
  return total / GEAR_SLOT_COUNT;
}

/**
 * The hero's DAMAGE LEVEL: the equipped weapon's real calculated output —
 * `weaponDps`: per-hit damage (governing stat, `damagePct` affixes, make
 * quality, the unique base roll), the stat-scaled cadence, and the average
 * crit lift — mapped onto the horde's own hp curve. The output reads as the
 * power level whose TYPICAL minion (`LEVELING.refMobHp` on the
 * `mobHpPerLevel` ramp, times the same `autoPowerScale` the spawner bakes
 * into mob hp) it would fell in `damageLevelKillSec` seconds — i.e. the
 * level whose spawned health this damage is fair against. Ilvl is a
 * promise; this is the delivery: an absurd `damage`/`damagePct` roll that
 * ilvl never priced in still reads as the deep-campaign power it actually
 * swings. Sustained DPS rather than the raw blow, so a slow crusher isn't
 * over-read for the same true output (one-shot excess is `bankOverkill`'s
 * job). Fair-for-level output maps well BELOW the character level (the knob
 * carries the grace — see config), so ordinary play never hears from this;
 * it can go below 1 for a bare fist — `heroPowerLevel`'s max() floors it at
 * the character level anyway.
 */
export function heroDamageLevel(state: GameState): number {
  const dps = weaponDps(state, state.player.equipment.weapon);
  // One typical healthbar at ramp 1: what the reference minion carries at
  // this hero's autoPowerScale (the free-stat growth cancels out — it sits
  // in the hero's output AND in every spawned bar).
  const bar = LEVELING.refMobHp * autoPowerScale(state.player.level);
  if (bar <= 0) return 1;
  return (
    1 + ((dps * MENACE.damageLevelKillSec) / bar - 1) / MENACE.mobHpPerLevel
  );
}

/**
 * The hero's POWER LEVEL — what the horde's TOUGHNESS (minion hp via
 * `mobLevelScale`, the elite/boss power-match via `enemyPowerScale`) keys
 * to: the character level, the gear level, or the damage level, whichever
 * is HIGHEST. In ordinary play gear trails the mobs it drops from and
 * damage sits inside its grace band, so this is simply the character level
 * and nothing changes; but a hero decked out ABOVE his level (a twink, a
 * lucky unique streak, a dev warp with endgame gear) — or one swinging a
 * weapon whose calculated damage is absurd for its ilvl
 * (`heroDamageLevel`) — meets a horde toughened to what he actually
 * wields: harder fights that pay more xp (kill xp is hp-proportional),
 * instead of a one-shot crowd his character sheet says is fair. TOUGHNESS
 * only: the loot-facing monster level (`currentMobLevel`) keys to the
 * CHARACTER level alone, so neither gear nor damage ever sweetens drops.
 *
 * The DAMAGE term is DAMPENED: only `MENACE.damageLevelTracking` (0.2, ×the
 * `mobDamageTracking` balance knob) of its excess over the character level
 * toughens the horde. A full 1:1 match pinned time-to-kill flat and stopped a
 * geared hero ever OVERKILLING — which starved the menace/evolution ratchet,
 * the endgame's real challenge. Lag-following a fifth lets a strong build pull
 * ahead of the base hp and start rampaging; the ratchet, not an hp match, then
 * answers the runaway. GEAR level still tracks fully.
 */
export function heroPowerLevel(state: GameState): number {
  const char = state.player.level;
  const track = MENACE.damageLevelTracking * BALANCE.mobDamageTracking;
  const dampedDamage =
    char + Math.max(0, heroDamageLevel(state) - char) * track;
  return Math.max(char, heroGearLevel(state), dampedDamage);
}

/**
 * The live-state view of `mobHpScaleFor`: the toughness the whole horde —
 * rank-and-file minions included — locks in from the hero's POWER level
 * (character level, gear level, or damage level, whichever is highest) and
 * the run's difficulty. Stamped at spawn (see spawnEnemy); the menace EVOLUTION stage
 * (`evolutionHpMult`) is the moment-to-moment overkill half, and the two
 * multiply together. The auto-stat compensation (`autoPowerScale`) stays
 * keyed to the CHARACTER level — it cancels the free stat gains, which gear
 * has nothing to do with.
 */
export function mobLevelScale(state: GameState): number {
  const mobLevel =
    heroPowerLevel(state) + difficultyDef(state.difficulty).mobLevelOffset;
  return Math.max(
    MENACE.mobHpScaleFloor,
    (1 + (mobLevel - 1) * MENACE.mobHpPerLevel) *
      autoPowerScale(state.player.level),
  );
}

/**
 * The horde's MONSTER LEVEL for a given player level: `playerLevel + the
 * difficulty's mobLevelOffset`, floored at 1. The same number `mobHpScaleFor`
 * scales hp from, surfaced as a level so the loot system can read it — which
 * base items may drop (`levelReq`), which tiers are unlocked
 * (`LOOT.tierUnlockMlvl`), and what level the dropped item itself carries.
 * A def's own `levelBonus` (elites/bosses run hot) is added by the caller.
 */
export function mobLevelFor(playerLevel: number, difficulty: string): number {
  return Math.max(
    1,
    Math.round(playerLevel + difficultyDef(difficulty).mobLevelOffset),
  );
}

/** `mobLevelFor` off the live state: the monster level a mob spawned right
 * now would carry (before its def's `levelBonus`). Keyed to the CHARACTER
 * level alone — deliberately not the gear or damage reads — so the loot
 * gates the mlvl opens (base `levelReq`, tier unlocks, the dropped item's
 * own level) track only earned progression: a hot weapon or a twink rack
 * buys harder fights and more xp (`heroPowerLevel`), never a better
 * successor — no good-find→better-finds elevator past the difficulty
 * ladder. */
export function currentMobLevel(state: GameState): number {
  return mobLevelFor(state.player.level, state.difficulty);
}

/**
 * The tier bonus a minion's drop rolls from the player's LEVEL — better gear to
 * match the tougher horde `mobLevelScale` produces (`tierBonusPerLevel` per
 * level above 1, CAPPED at `tierBonusLevelCap`). Read in `dropMinionLoot`
 * alongside the mob's own `dropProfile` bonus and the menace evolution stage's
 * `tierPenaltyPerStage` (which pulls the other way on evolved mobs). The cap is
 * what keeps the tier ladder discriminating all campaign: uncapped, the level
 * term alone eventually dwarfed every base chance and made every late drop
 * roll rare — tier progression belongs to the difficulty ladder
 * (`tierChanceBonus`), not the level counter.
 */
export function mobLevelTierBonus(state: GameState): number {
  return Math.min(
    MENACE.tierBonusLevelCap,
    Math.max(0, state.player.level - 1) * MENACE.tierBonusPerLevel,
  );
}

/**
 * The live-crowd multiplier the menace stage applies to the wave spawner's
 * floor and cap — a rampage pulls a bigger, denser horde onto the screen.
 * The difficulty's `menaceEffectMult` scales how hard the pull lands.
 */
export function lureMult(state: GameState): number {
  // Evolution has no stage roof, but the CROWD does (lureStageCap): a deep
  // rampage answers with tougher mobs, not with an unbounded spawn count.
  return (
    1 +
    Math.min(menaceStage(state), MENACE.lureStageCap) *
      MENACE.lurePerStage *
      difficultyDef(state.difficulty).menaceEffectMult
  );
}

/**
 * The efficiency of a killing blow, judged by OVERKILL: a hit exactly the
 * mob's full health (or less) is worth full value; one at 2× its health pays
 * HALF, 3× a THIRD — `maxHp / damage`, hyperbolic in between. Applied to the
 * kill's XP and to the minion drop-chance roll (loot.ts), so farming mobs a
 * build one-shots several times over is deliberately unrewarding — the answer
 * to "too easy" is to move up, not to keep mowing.
 */
export function overkillEfficiency(damage: number, maxHp: number): number {
  if (maxHp <= 0 || damage <= maxHp) return 1;
  return maxHp / damage;
}

/**
 * An overpowered kill's answer, keyed to the killing blow's OVERKILL. Overkill
 * is the blow's `damage` beyond the mob's FULL health (`damage − maxHp`), so a
 * hit that merely finishes off an already-wounded mob is NOT overkill — only a
 * blow big enough to have dropped the mob outright, with power to spare, counts.
 * It both (1) jolts the menace meter up instantly and (2) dinner-bells the
 * nearby horde over RIGHT NOW via spawner walk-credit, so a big hit is answered
 * within seconds. The meter jolt is measured in HEALTHBARS of overkill
 * (overkill ÷ maxHp) and scaled by `menaceSensitivity`, so a fair,
 * level-appropriate kill barely moves it while one-shotting a mob for several
 * times its health — being wildly stronger than the horde — escalates on the
 * spot, a spike on top of the rolling DPS/kill-rate heat in `tickMenace`. Emits
 * `menaceRose` if the jolt tips into a new stage. Called from the kill funnel
 * on every kill with the (crit-adjusted) killing-blow damage, the victim's max
 * hp, and the victim's own evolution stage (which feeds the RATCHET below).
 */
export function bankOverkill(
  state: GameState,
  damage: number,
  maxHp: number,
  evo = 0,
): void {
  const spike = Math.max(0, damage - maxHp);
  state.moveSpawnCredit += spike * MENACE.lureCreditPerOverkill;
  if (maxHp <= 0) return;
  // THE RATCHET (the "no breaks" rule): overkill on a mob of the CURRENT
  // evolution crop (`evo` at or above the permanent floor's stage — a stale
  // un-evolved leftover proves nothing) banks PROOF, damped by the early-game
  // warmup only, so every difficulty ratchets when its mobs are genuinely
  // getting one-shot. A CLEAN kill of the same crop — several blows, or a
  // finisher within the bar — refunds proof instead (the RELIEF), so the
  // floor is an equilibrium: a mixed horde's trash is always one-shot, but as
  // long as its heavies take honest fights the floor holds, and only a build
  // whose one-shots dominate the whole kill mix keeps climbing.
  const currentCrop = evo >= menaceFloorStage(state);
  if (spike <= 0) {
    if (currentCrop) {
      state.evoProof = Math.max(
        0,
        state.evoProof - MENACE.ratchetReliefPerKill,
      );
    }
    return;
  }
  const healths = spike / maxHp;
  const before = menaceStage(state);
  state.menace = Math.min(
    menaceCeiling(state),
    state.menace + healths * MENACE.perOverkill * menaceSensitivity(state),
  );
  if (currentCrop) {
    // Proof is capped at two thresholds (a burst defers at most ONE extra
    // stage) and spends at most one stage per cooldown — the "one evolve per
    // malice round" pacing — so a single massacre can't wall the run in one
    // breath. Enough sustained proof lifts the permanent floor a full stage:
    // stage-1 mobs one-shot instantly mean stage 2 spawns next round, and so
    // on without a roof — the meter never decays below the floor (see
    // tickMenace), and the difficulty tunes each step's SIZE
    // (menaceEffectMult), never whether the horde keeps evolving.
    state.evoProof = Math.min(
      state.evoProof + healths * menaceWarmup(state),
      MENACE.ratchetHealthbars * 2,
    );
    // The ratchet respects the difficulty's PEAK: once the permanent floor has
    // reached the cap stage, one-shotting the crop no longer evolves it — the
    // horde has toughened as far as this rung allows (JESUS is uncapped, so the
    // check always passes there). Proof still accrues but simply can't spend.
    if (
      state.evoProof >= MENACE.ratchetHealthbars &&
      state.evoRatchetMs <= 0 &&
      menaceFloorStage(state) < menaceStageCap(state)
    ) {
      state.evoProof -= MENACE.ratchetHealthbars;
      state.menaceFloor += MENACE.perStage;
      state.evoRatchetMs = MENACE.ratchetCooldownMs;
      state.menace = Math.max(state.menace, state.menaceFloor);
    }
  }
  const after = menaceStage(state);
  if (after > before) state.events.push({ type: "menaceRose", stage: after });
}

/**
 * The CLEARANCE GATE: how open the rolling heat is, from whether the player is
 * winning the attrition war. Over the last `clearanceWindowSec`, is the horde
 * getting THINNER (kills outrunning spawns) or THICKER? The clearance fraction
 * is the net kill rate over the throughput — `(killRate − spawnRate) / max(the
 * two)` — so it reads +1 when nothing spawns and the hero mows, 0 at a standstill
 * (kills matched by spawns), and negative while the screen fills. The gate opens
 * from 0 at `clearanceThreshold` (×the `menaceClearance` knob) to fully open by
 * twice it, so sustained output only heats the meter once the player is clearing
 * the crowd meaningfully faster than it arrives. It reads KILLS, not on-screen
 * count, so WALKING AWAY from a crowd (which empties the screen but kills
 * nothing) never opens the gate. With no minion activity at all — nothing
 * spawning, nothing dying — it reads 0: grinding a lone tank you can't fell no
 * longer heats the meter.
 */
export function menaceClearGate(state: GameState): number {
  const kr = state.minionKillRate;
  const sr = state.minionSpawnRate;
  const norm = Math.max(kr, sr);
  if (norm <= 1e-6) return 0;
  const clearFrac = (kr - sr) / norm;
  const threshold = MENACE.clearanceThreshold * BALANCE.menaceClearance;
  return Math.min(
    1,
    Math.max(0, (clearFrac - threshold) / Math.max(1e-3, threshold)),
  );
}

/**
 * Advance the meter one step from the player's ACTUAL combat output. The
 * per-step damage and kills feed rolling DPS / kill-rate estimates (EMAs
 * smoothed over `rateWindowSec`), and the meter heats in proportion to them —
 * but ONLY through the CLEARANCE GATE (`menaceClearGate`): output heats the
 * meter solely while the player is clearing the horde faster than it spawns, so
 * a strong SLOW weapon that pumps damage into a screen that keeps FILLING no
 * longer rampages. The harder and faster you clear, the faster it climbs; idle
 * output (or being out-spawned) lets `decayPerSec` bleed it back off. Emits
 * `menaceRose` when the tick tips the meter into a new stage so the app can
 * sound the escalation. The per-step minion spawns/kills booked since the last
 * tick feed the gate's rate EMAs here. Called once per `step()`.
 */
export function tickMenace(
  state: GameState,
  dtMs: number,
  damageDealt: number,
  kills: number,
): void {
  const dt = dtMs / 1000;
  if (dt <= 0) return;

  // The ratchet's between-stages breather burns down here (see bankOverkill).
  state.evoRatchetMs = Math.max(0, state.evoRatchetMs - dtMs);

  // Fold this step's output into the rolling estimates. alpha is the fraction
  // of the window one step covers, so the EMA tracks roughly the last
  // `rateWindowSec` of fighting and a lone burst can't spike it.
  const alpha = Math.min(1, dt / MENACE.rateWindowSec);
  state.combatDps += (damageDealt / dt - state.combatDps) * alpha;
  state.combatKillRate += (kills / dt - state.combatKillRate) * alpha;

  // Fold the minion spawn/kill counts booked since the last tick into the
  // clearance-gate rates (smoothed over the longer clearanceWindowSec so the
  // gate reads a trend, not a single spike), then clear the pending tallies.
  const clearAlpha = Math.min(1, dt / MENACE.clearanceWindowSec);
  state.minionSpawnRate +=
    (state.pendingMinionSpawns / dt - state.minionSpawnRate) * clearAlpha;
  state.minionKillRate +=
    (state.pendingMinionKills / dt - state.minionKillRate) * clearAlpha;
  state.pendingMinionSpawns = 0;
  state.pendingMinionKills = 0;

  const before = menaceStage(state);
  // The DPS channel is measured in REFERENCE HEALTHBARS per second, not raw
  // points: absolute damage inflates ~30× over a campaign (autoPowerScale
  // sits inside every number), so a raw-dps term that was fair at level 1
  // saturated the meter for ordinary level-30 play. Dividing by the era's
  // reference bar — the same one the spawner scales mob hp by — makes the
  // channel stationary: "how many level-appropriate healthbars per second"
  // is the same question at level 1 and level 60. The overkill and
  // kill-rate channels were relative already.
  const bar =
    LEVELING.refMobHp *
    (1 + (Math.max(1, state.player.level) - 1) * MENACE.mobHpPerLevel) *
    autoPowerScale(state.player.level);
  // The rolling heat only fires through the clearance gate: sustained DPS and
  // kill rate escalate the meter while the player is THINNING the horde, and go
  // inert the moment the screen is merely holding or filling. Overkill jolts
  // (bankOverkill) and decay are ungated — a genuine one-shot still answers on
  // the spot, and the meter always bleeds when it isn't being fed.
  const gain =
    ((state.combatDps / Math.max(1, bar)) * MENACE.perBarDps +
      state.combatKillRate * MENACE.perKillRate) *
    menaceSensitivity(state) *
    menaceClearGate(state);
  // The cooler is per-difficulty: EASY bleeds a hot streak off fast, the
  // hardest rungs let a rampage linger (menaceDecayMult below 1). It only
  // ever cools down to the PERMANENT floor the evolution ratchet has earned
  // (bankOverkill) — evolution takes no breaks; the momentary heat does.
  const decay =
    MENACE.decayPerSec * difficultyDef(state.difficulty).menaceDecayMult;
  const next = state.menace + (gain - decay) * dt;
  // Bounded below by the earned floor, above by the difficulty's PEAK
  // (`menaceCeiling` is Infinity on the uncapped JESUS rung).
  state.menace = Math.min(
    menaceCeiling(state),
    Math.max(state.menaceFloor, next),
  );
  const after = menaceStage(state);
  if (after > before) state.events.push({ type: "menaceRose", stage: after });
}

/**
 * The scale an elite or boss locks in the moment it engages, so the fight
 * matches the player's power: a non-decaying floor from the hero's POWER
 * level (character level, gear level, or damage level, whichever is highest
 * — see `heroPowerLevel`) plus the current menace heat. Always ≥ 1.
 */
export function enemyPowerScale(state: GameState): number {
  // Like the rank and file (`mobLevelScale`), the set pieces also ride the
  // automatic stat-gain damage curve, so a boss met at level 12 doesn't melt
  // under growth the player never chose.
  return enemyPowerLevelTerm(state) * autoPowerScale(state.player.level);
}

/**
 * The LEVEL half of `enemyPowerScale`, WITHOUT the auto-stat damage curve:
 * `1 + (power − 1)·bossLevelWeight + stage·bossMenaceWeight`. This is the
 * factor the CONTACT side may ride — `autoPowerScale` compensates the hero's
 * DAMAGE growth (it belongs on hp, where it cancels against his blows), but
 * nothing in the hero's SURVIVABILITY grows with it, so folding it into
 * contact damage turned deep-campaign set pieces into one-shot machines
 * (a level-22 hero was eating blows scaled ×20+ past the catalog).
 */
export function enemyPowerLevelTerm(state: GameState): number {
  return (
    1 +
    Math.max(0, heroPowerLevel(state) - 1) * MENACE.bossLevelWeight +
    menaceStage(state) * MENACE.bossMenaceWeight
  );
}

/**
 * The contact-damage multiplier a mob of `mlvl` carries from the horde's
 * level ramp alone (`MENACE.mobDamagePerLevel`): the DAMAGE sibling of
 * `mobHpScaleFor`, but linear and gentle — it tracks the hero's own EHP
 * growth (max hp from STAMINA + armor), which is roughly linear, where his
 * DPS growth is multiplicative. Stamped at spawn for every mob (create.ts),
 * so the late campaign's rank and file threaten instead of tickling; the
 * hero's growing armor and health bar are what keep it fair.
 */
export function mobContactScaleFor(mlvl: number): number {
  return 1 + Math.max(0, mlvl - 1) * MENACE.mobDamagePerLevel;
}

/**
 * Scale an elite/boss to the player's power the first time it engages —
 * called from both sides of the fight (the player's first blow in hitEnemy,
 * and the mob waking in moveEnemy), so whichever lands first applies it.
 * Idempotent: `powerScaled` latches it to exactly once. Hp scales in full
 * (preserving the current hp fraction); contact damage scales by the horde's
 * gentle per-level damage ramp times a softened share of the LEVEL term only
 * (never `autoPowerScale` — see `enemyPowerLevelTerm`), so a tanky boss
 * threatens without one-shotting.
 */
export function maybePowerScale(state: GameState, enemy: Enemy): void {
  if (enemy.powerScaled) return;
  const def = enemyDef(enemy.defId);
  // RARE/UNIQUE mobs (config RARE_MOBS) power-match like the set pieces do:
  // they are placed at creation on the warm-up baseline, so without the
  // re-stamp a special find met deep into a run would be a speed bump.
  if (def.role === "minion" && !def.rarity) return;
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  enemy.powerScaled = true;
  // The fight opening is also when the mob's MONSTER LEVEL is settled: an
  // elite/boss met deep into a run drops loot worthy of the hero who beat it,
  // not of the level it was placed at. Its `levelBonus` keeps it a few levels
  // above the rank and file, so the set pieces reach the tier gates first.
  enemy.mlvl = Math.max(
    1,
    currentMobLevel(state) + (def.levelBonus ?? 0) + (rarity?.levelBonus ?? 0),
  );
  const levelTerm = enemyPowerLevelTerm(state);
  enemy.contactMult =
    mobContactScaleFor(enemy.mlvl) *
    (rarity?.damageMult ?? 1) *
    (1 + (levelTerm - 1) * MENACE.bossContactShare);
  const scale = enemyPowerScale(state);
  if (scale <= 1) return;
  const frac = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  enemy.maxHp = Math.round(enemy.maxHp * scale);
  enemy.hp = Math.max(1, Math.round(enemy.maxHp * frac));
}
