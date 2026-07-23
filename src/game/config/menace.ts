// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered
// player, plus the mob hp/damage/level scaling curves it reads.

/**
 * Menace — the escalation meter that answers an overpowered player, driven by
 * the player's ACTUAL combat output rather than any single lucky blow. The
 * engine keeps a rolling estimate of the damage-per-second and kills-per-second
 * the player is putting out right now (`state.combatDps` / `state.combatKillRate`,
 * smoothed over `rateWindowSec`); the harder and faster you clear, the faster
 * the meter heats. Standing idle — no damage, no kills — cools it, but never
 * below the PERMANENT floor the evolution ratchet has earned (see
 * `ratchetHealthbars`): a horde that evolved because it was getting one-shot
 * stays evolved — no breaks, up to the difficulty's PEAK (the per-rung
 * `menaceStageCap`: easy 3 … nightmare 100, JESUS uncapped). Menace is read as
 * a stage that does
 * three things: it LURES more of the horde toward the player (the crowd
 * growth alone caps at `lureStageCap`), it EVOLVES freshly-spawned minions
 * (more hp and WORSE loot — a challenge knob, not an xp or loot faucet; kill
 * xp is level-based now), and it scales elites and bosses when they engage
 * (keyed to the hero's CHARACTER level), so the epic fights keep pace with the
 * player instead of melting. Units: raw menace points, world px, hp.
 */
export const MENACE = {
  /**
   * Menace banked per second per REFERENCE HEALTHBAR PER SECOND of rolling
   * output: sustained damage is the meter's supporting fuel, but it is
   * measured RELATIVE to the era — the rolling DPS divided by the bar the
   * spawner ACTUALLY stamps: `refMobHp` at the HORDE's level
   * (`currentMobLevel`, the authored band or player + difficulty offset) ×
   * `autoPowerScale` × the current evolution stage's hp multiplier — so
   * "mowing two healthbars a second" heats the meter the same at level 1 and
   * level 60, and the same whether the horde is plain or evolved. (A raw-dps
   * term was non-stationary: absolute numbers inflate ~30× over a campaign,
   * and fair mid-game play saturated the meter. A PLAYER-level bar likewise
   * under-read the hard rungs — nightmare mobs run levels above the hero and
   * evolution multiplies their hp again — so honest DPS into a tanky horde
   * read as many bars/sec and pinned the meter at the cap.) Scaled by
   * `menaceSensitivity` before it lands; 3.2 ≈ the old 0.07/raw-point term
   * at the level-1 bar, so the opening behaves exactly as before. The meter
   * still leans on relative OVERKILL and kill RATE as its main signals.
   */
  perBarDps: 3.2,
  /**
   * Menace banked per second per kill/second of the player's rolling kill rate:
   * a fast clear heats the meter on top of raw damage, so mowing a crowd down
   * escalates faster than grinding a single tank.
   */
  perKillRate: 1.5,
  /**
   * Menace banked instantly per HEALTHBAR of OVERKILL on a killing blow — the
   * blow's damage beyond the mob's FULL health (damage − maxHp), measured as a
   * fraction of its max hp (overkill ÷ maxHp), not raw points. A hit that only
   * finishes a wounded mob isn't overkill at all; one that could have dropped
   * the mob several times over wastes multiple bars — the signature of an
   * overpowered build — and jolts the meter. Measuring it relative to the mob's
   * hp is what keeps early, level-appropriate kills cool while genuinely
   * lopsided ones escalate. Scaled by `menaceSensitivity` like the rolling heat.
   */
  perOverkill: 1.4,
  /**
   * The window (seconds) the DPS/kill-rate estimates smooth over — long enough
   * that one burst doesn't spike the meter, short enough that the heat tracks
   * the last few seconds of fighting rather than the whole run.
   */
  rateWindowSec: 2.5,
  /**
   * Menace bled off per second: stop the slaughter and the horde cools. This is
   * the constant cooler the (sensitivity-scaled) gain must beat to climb, so on
   * a gentle difficulty ordinary fighting trends the meter back to zero.
   */
  decayPerSec: 4,
  /**
   * Early-game warmup. Menace gain (rolling heat AND overkill jolts) is damped
   * by a factor that eases from `warmupFloor` at level 1 up to 1.0 by player
   * level `1 + warmupLevels`, so a fresh hero on a fair difficulty simply cannot
   * rampage in the opening levels — the meter can't build faster than it decays
   * until the player has grown into some real power. The residual `warmupFloor`
   * is deliberately non-zero so a very sensitive difficulty (high `menaceMult`,
   * e.g. JESUS) multiplies through it and still bites from the first few kills.
   */
  warmupLevels: 5,
  warmupFloor: 0.12,
  /** Raw menace per evolution stage: stage = floor(menace / perStage). */
  perStage: 12,
  /**
   * THE EVOLUTION RATCHET — the "no breaks" rule. Overkill on mobs of the
   * CURRENT evolution stage is proof the horde still lags the player; once
   * this many HEALTHBARS of it are banked (`state.evoProof`, damped by the
   * early-game warmup only — every difficulty ratchets when genuinely
   * one-shot), the PERMANENT menace floor (`state.menaceFloor`) rises one
   * stage and the proof resets. The meter never decays below the floor, so a
   * horde that evolved to stage N because stage N−1 was getting one-shot
   * stays at N — it keeps evolving, stage by stage, until the player's blows
   * stop dropping mobs outright OR the difficulty's PEAK is reached (the
   * per-rung `menaceStageCap` bounds the floor; JESUS is uncapped). The
   * difficulty also sets the SIZE of each step (`menaceEffectMult` scales
   * `hpPerStage`), not just how many there are.
   */
  ratchetHealthbars: 6,
  /**
   * The ratchet's RELIEF: a clean kill of the current crop — one that did
   * NOT overkill (several blows, or a finisher within the bar) — refunds
   * this many healthbars of banked proof (floored at 0). This is what makes
   * the floor an EQUILIBRIUM instead of a runaway: a mixed horde's trash is
   * always one-shot by a healthy build, but as long as its heavies take
   * honest fights, their clean kills cancel the trash overkills and the
   * floor holds. Only when one-shots dominate the WHOLE kill mix — the
   * genuinely overpowered build — does proof outrun relief and the horde
   * evolve another stage.
   */
  ratchetReliefPerKill: 1,
  /**
   * Minimum ms between ratchet stages — the "one evolve per malice round"
   * pacing. However hard a massacre burst banks proof, the permanent floor
   * climbs at most one stage per cooldown, so one early bomb can't wall the
   * run in a single breath. Banked proof is also capped at 2× the threshold,
   * so a burst carries at most one deferred stage past its own moment.
   */
  ratchetCooldownMs: 10_000,
  /**
   * Extra minion hp per evolution stage (+35% each), stamped when the mob
   * spawns. Kill XP is LEVEL-based now (`mobLevelXp`), so evolution does NOT
   * pay more xp — it is purely a challenge knob (more killing for the same
   * reward), and its drops get WORSE per stage (see tierPenaltyPerStage below).
   */
  hpPerStage: 0.35,
  /**
   * Subtracted from an evolved minion's drop TIER roll per stage: malice
   * mobs take more killing but find WORSE gear — magic/rare odds thin out as
   * the horde evolves, so a rampage is a poor way of farming loot. Chances
   * floor at 0 in `rollTier`.
   */
  tierPenaltyPerStage: 0.03,
  /**
   * The wave spawner's live floor AND cap grow by this fraction per stage —
   * a rampage pulls a denser, bigger crowd onto the screen.
   */
  lurePerStage: 0.25,
  /**
   * The lure stops growing past this stage — evolution has no roof, but the
   * CROWD does: past here the horde answers with tougher mobs, not more of
   * them, so a deep rampage can't spawn the framerate to death.
   */
  lureStageCap: 8,
  /**
   * Overkill also drags the horde over RIGHT NOW: each point of overkill banks
   * this much of the spawner's move-credit (the same channel walking uses),
   * so a big hit is a dinner bell the nearby horde answers within seconds.
   */
  lureCreditPerOverkill: 0.6,
  /**
   * Elite/boss power-match. When one first engages, its hp (and, softened,
   * its contact damage) scale by `1 + (level-1)·bossLevelWeight +
   * stage·bossMenaceWeight` — a non-decaying floor from the player's LEVEL
   * plus the current menace heat — locked in once so a level-20 hero meets a
   * boss worthy of them instead of one-shotting the set piece.
   */
  // Trimmed from 0.12 when the set-piece MECHANICS shipped (mechanics.ts):
  // a boss now gets harder via telegraphed moves, enrage turns, and phases —
  // the hp-sponge share of its difficulty gives that much back.
  bossLevelWeight: 0.1,
  bossMenaceWeight: 0.1,
  /**
   * A JESUS pinned elite/boss's base hp, as a multiple of its authored
   * NIGHTMARE bar (the ladder hp curve's last column) — the "one more rung
   * step" the ladder itself doesn't author (JESUS stays player-relative).
   * Applied at level load (`applyAuthored`, create.ts) INSTEAD of letting the
   * pinned piece fall through to the minion spawn path, whose geometric
   * per-level hp curve (×200+ at the JESUS level floor) times the engage
   * power-match landed set pieces at 30k–320k hp — 10–30 minute fights no
   * build could sustain. The engage power-match (`maybePowerScale`) still
   * scales the anchored bar to the hero who shows up, exactly like the other
   * rungs — this knob is the JESUS premium on top of that shared machinery.
   */
  jesusPinnedHpMult: 2,
  /** Share of the hp power-scale that also applies to contact damage (so a
   * scaled boss hits harder, but not as steeply as its health grows). */
  bossContactShare: 0.4,
  /**
   * The XP-ANCHOR per-level ramp (NOT the hp curve any more — see
   * `mobHpGrowthPerLevel` below). Kill XP is LEVEL-priced: `mobLevelXp`
   * (leveling.ts) values a mob as a "typical" `refMobHp`-minion of its level on
   * THIS gentle linear ramp (±8%/level), and `referenceMobXp` (the kills-per-
   * level anchor) reads the same, so the two cancel and the leveling PACE stays
   * exactly what the curve authors. A mob's real HP no longer rides this ramp
   * (a tank and a squishy of the same level still pay the SAME xp — see
   * `mobHpGrowthPerLevel`), so tuning the hp curve leaves leveling untouched.
   * Left LINEAR and gentle on purpose: it is the xp yardstick, not the toughness.
   */
  mobHpPerLevel: 0.08,
  /**
   * THE HP CURVE — how a mob's HEALTH grows with its monster level, decoupled
   * from the xp ramp above. GEOMETRIC (compounding `mobHpGrowthPerLevel` per
   * level), because the hero's damage compounds too — gear item-level scaling
   * and chosen stat points push per-hit output up ~10%/level, so a LINEAR mob-hp
   * ramp (the old `mobHpPerLevel`) fell ever further behind and the hero slid
   * into one-shotting the whole horde by mid-game (which pinned the rampage
   * meter at its cap — the "menace 3 on easy" complaint). A compounding ramp
   * keeps HITS-TO-KILL rising with level instead: a reference minion demands a
   * couple of blows early, climbing toward ~10 by level ~60, so out-DPSing the
   * horde is a slow, earned drift rather than the default. Because it is keyed
   * to the mob's LEVEL (not the hero's gear), better-than-average finds
   * (uniques/legendaries) still DIP hits-to-kill below the curve — out-gearing
   * still eases the fight, it just no longer trivialises it. The rate is
   * calibrated against a NORMAL (magic/rare) loadout via
   * `scripts/mob-hp-curve.mjs`; verify there after any change. Applied at every
   * spawn through `mobHpLevelFactor` (menace.ts) — the one chokepoint mob hp,
   * the per-mob spawn band, the menace DPS-normaliser, and ability scaling all
   * read — so they move together. Kill XP does NOT read it (see `mobHpPerLevel`).
   */
  mobHpGrowthPerLevel: 1.1,
  /**
   * The PLATEAU KNEE: past this monster level the hp compounding eases to
   * `mobHpGrowthTailFactor` of its rate, so hits-to-kill rises steadily to
   * ~level 60 then LEVELS OFF into a gentle climb rather than walling to
   * hundreds of hits at the level cap. Below the knee the full
   * `mobHpGrowthPerLevel` applies. Keyed to monster level, so a difficulty's
   * `mobLevelMax` cap already bounds the bottom rungs under it; the knee is what
   * tames the uncapped JESUS tail.
   */
  mobHpGrowthKnee: 60,
  /**
   * Fraction of `mobHpGrowthPerLevel`'s excess-over-1 that still compounds ABOVE
   * the knee (0 = a hard plateau, 1 = no taper at all). At the shipped 0.34 a
   * post-knee level compounds ~3.4% instead of 10%, so the endgame keeps getting
   * a touch tougher without exploding.
   */
  mobHpGrowthTailFactor: 0.34,
  /**
   * The floor under `mobHpScaleFor`: no relative-level deficit can scale a
   * monster below half its catalog hp, so a deep negative offset (EASY, level
   * 1) weakens the horde without turning it into paper.
   */
  mobHpScaleFloor: 0.5,
  /**
   * The PER-MOB SPAWN LEVEL BAND — the random spread each rank-and-file minion
   * rolls on top of the horde baseline (`currentMobLevel` = player level + the
   * difficulty's `mobLevelOffset`). At spawn every plain minion draws a uniform
   * INTEGER offset in `[min, max]` (inclusive), which shifts its monster level
   * — and with it its hp (via the `mobHpPerLevel` ramp), its kill XP
   * (`mobLevelXp`, level-based), and the tier/ilvl gates its drops roll off. So
   * a wave is a MIX: some fodder a few levels under the hero, the odd one a
   * couple over, each worth (and dropping) accordingly, instead of a flat
   * clone army. The band STACKS on the difficulty offset, so a JESUS mob can
   * roll to player+4 and an EASY one to player−6, keeping the ladder's
   * differentiation. Elites, bosses, and rare/unique mobs skip it — set-piece
   * levels are deterministic (they settle their mlvl in `maybePowerScale`).
   */
  mobLevelBand: { min: -3, max: 2 } as { min: number; max: number },
  /**
   * The horde's per-level CONTACT-DAMAGE ramp (+3% per monster level over 1,
   * linear — see `mobContactScaleFor`, stamped at spawn): the damage sibling
   * of `mobHpPerLevel`, kept GENTLE and never multiplied by `autoPowerScale`.
   * The asymmetry is deliberate: hp rides the auto-stat curve because it
   * cancels against the hero's compounding DPS, but his SURVIVABILITY (max
   * hp from STAMINA, armor) grows roughly linearly — so mob damage tracks
   * that instead. Without this ramp a level-60 minion's catalog blow was a
   * tickle against a campaign health bar; with the old auto-scaled boss
   * contact, a set piece was a one-shot. Both read from here now.
   */
  mobDamagePerLevel: 0.03,
  /**
   * Better gear as the hero levels: added to a minion's drop tier roll per
   * player level above 1 (+0.4% each), so a higher-level hero's kills yield
   * richer loot to match the tougher mobs they came off — the drop-quality
   * companion to `mobHpPerLevel` (the menace `tierPenaltyPerStage` pulls the
   * other way on evolved mobs). Kept SMALL and capped (`tierBonusLevelCap`):
   * at the old 1.5% the level term alone hit +0.59 by level 40 — past the
   * magic AND rare base chances combined, so every mid-game drop rolled at
   * least rare and the tier ladder stopped discriminating. Tier quality is
   * the DIFFICULTY ladder's reward (`tierChanceBonus`); the level term only
   * seasons it.
   */
  tierBonusPerLevel: 0.004,
  /** Ceiling on the level term above (+15% at level ~38 and beyond), so the
   * deep endgame still rolls mostly regular/magic and a rare stays an event. */
  tierBonusLevelCap: 0.15,
  /**
   * The DAMAGE→LEVEL mapping's normalization (see `heroDamageLevel` in
   * menace.ts): the equipped weapon's sustained single-target output
   * (`weaponDps` — per-hit damage with `damagePct` affixes, the stat-scaled
   * cadence, and the average crit lift) reads as the power level whose
   * TYPICAL minion (`LEVELING.refMobHp` on the same `mobHpPerLevel` ramp
   * the spawner scales hp by) it would fell in this many SECONDS. DPS, not
   * the raw blow, so a slow crusher and a quick blade with the same true
   * output read the same. DIAGNOSTIC ONLY now: weapon damage no longer
   * toughens the horde (mob hp/level/xp key to the CHARACTER level alone —
   * see `heroPowerLevel`), so this only shapes the analytic damage-level
   * readout, never a spawned mob.
   */
  damageLevelKillSec: 1.5,
  /**
   * The CLEARANCE GATE window (seconds). The rolling heat in `tickMenace` only
   * fires when the player is actually WINNING THE ATTRITION WAR — clearing the
   * horde faster than it spawns — so a strong SLOW weapon that pumps damage (or
   * kill-rate bursts) while the screen keeps FILLING no longer heats the meter.
   * Minion spawns and minion kills are folded into rolling per-second rates
   * (`minionSpawnRate` / `minionKillRate`, EMAs smoothed over this window, ~5 s
   * so a lone burst can't flip the gate), and their balance — net kills over the
   * throughput — is the clearance fraction the gate reads. Kills, not on-screen
   * count, are the signal, so WALKING AWAY from a crowd (which empties the screen
   * without killing anything) never counts as clearing.
   */
  clearanceWindowSec: 5,
  /**
   * The net-clearance fraction the rolling heat needs before it fires: the
   * player must be clearing minions this much FASTER than they spawn — "is the
   * screen getting less crowded, and by more than 10%?" — for the meter to climb
   * from sustained output. Below it (matched by, or swamped by, the spawn rate)
   * only OVERKILL jolts and decay move the meter. The gate ramps from 0 at this
   * threshold to full by twice it. Tunable at runtime via the DEVELOPER →
   * BALANCE `menaceClearance` knob (a multiplier over this shipped 0.1, so 0×
   * heats on any positive clearance and a high value demands a runaway rout).
   */
  clearanceThreshold: 0.1,
} as const;
