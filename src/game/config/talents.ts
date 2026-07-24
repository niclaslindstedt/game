// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL talent tuning — the knobs shared across the whole talent system, as
// opposed to the per-talent numbers authored on each def (see
// `defs/talents/`). Kept deliberately small: one lever per shared rule, each
// read at the single site that owns it, so it stays BALANCE-slider-ready the
// way the other config blocks are. Proc caps and cooldown floors join here as
// those talent kinds are added; the shared rank ceiling is what's needed today.

export const TALENTS = {
  /**
   * The rank ceiling every talent shares. A tree can hold at most
   * `Σ maxRank` points (see `treeCapacity`); with 40 ranks per full tree vs a
   * 25-point hard cap per stat (250 ÷ 10), even a pure spec can't max its tree,
   * so which talents to deepen stays a real choice. The registry validates each
   * def against this, `spendTalentPoint` gates on it, and the picker draws this
   * many rank pips.
   */
  maxRank: 5,
  /**
   * FROST NOVA (magic-tree defense): when the hero is STRUCK, freeze the foes
   * around him solid for a beat, then go on an internal cooldown so a dogpile
   * can't chain-freeze the screen every frame (the proc ceiling the plan calls
   * for). Rank widens the ring, lengthens the freeze, and shortens the reset
   * (floored). The freeze reuses the engine's chill fields (`chillMs`/
   * `chillFactor`), so a frozen mob crawls at `slowFactor` like a companion's
   * frost pulse. Read once in the struck path (`applyFrostNova`).
   */
  frostNova: {
    /** Freeze reach at rank 1 / added per further rank. */
    radius: 60,
    radiusPerRank: 10,
    /** Freeze duration (ms) at rank 1 / added per further rank. */
    freezeMs: 800,
    freezeMsPerRank: 250,
    /** Enemy speed multiplier while frozen (near-still; kiting still a skill). */
    slowFactor: 0.15,
    /** Internal cooldown (ms) at rank 1, trimmed per rank, never below floor. */
    cooldownMs: 6000,
    cooldownPerRank: 700,
    cooldownFloorMs: 2500,
  },
  /**
   * TWIN STRIKE (melee-tree damage proc): a chance for a melee blow to land a
   * second time. The echo is an extra `hitEnemy` at `echoDamageFrac` of the
   * blow — until rank 5, where it hits for full (`fullEchoRank`). Rank raises
   * the chance; the cap keeps a max-rank / high-DEX build from doubling every
   * swing (the plan's proc ceiling). Read once in `meleeSweep` (`talentTwinStrike`).
   */
  twinStrike: {
    chancePerRank: 0.07,
    chanceCap: 0.5,
    echoDamageFrac: 0.5,
    fullEchoRank: 5,
  },
  /**
   * CLEAVING ECHO (melee-tree AoE proc): a chance for a swing to strike EXTRA
   * targets beyond the weapon's `maxMeleeTargets` cap. Ranks 1–3 add +1 target
   * on a hit, ranks 4+ add +2 (`bonusTargets` from `bonusFromRank`). Rank raises
   * the chance (capped). One roll per swing, read in `stepWeapon`
   * (`talentCleavingEcho`) — a widened cleave, not a per-body proc.
   */
  cleavingEcho: {
    chancePerRank: 0.09,
    chanceCap: 0.55,
    extraTargets: 1,
    bonusTargets: 2,
    bonusFromRank: 4,
  },
  /**
   * PARRY (melee-tree tank proc): a chance to FULLY negate an enemy MELEE blow
   * (contact/slam), on no cooldown but chance-capped. At rank 5 a parry RIPOSTES
   * — a share (`riposteFrac`, from `riposteRank`) of the negated blow is billed
   * back to the attacker. Read in the struck path (`talentParry`).
   */
  parry: {
    chancePerRank: 0.06,
    chanceCap: 0.4,
    riposteFrac: 0.5,
    riposteRank: 5,
  },
  /**
   * SEISMIC LANDING (melee-tree AoE): a jump landing slams the ground, dealing
   * AoE damage and KNOCKING BACK every foe in reach. Rank grows the radius and
   * the damage; `knockback` is the flat shove (world px, role-scaled like the
   * weapon knockback affix). The damage is a flat base × `abilityPowerScale`
   * (like the conjurations), so a landing keeps meaning the same fraction of a
   * level-appropriate healthbar all campaign. Read on the `land` event
   * (`talentSeismic`), fired only when trained.
   */
  seismic: {
    radius: 44,
    radiusPerRank: 12,
    damage: 7,
    damagePerRank: 5,
    knockback: 34,
  },
  /**
   * PIERCING SHOT (ranged-tree damage): the hero's shots punch THROUGH foes.
   * `piercePerRank` extra bodies per rank, each softening the shot by a falloff
   * that RANK itself softens (a rank-5 railgun keeps most of its bite through
   * the line). `retainBase` is the fraction of damage a pierced shot keeps at
   * rank 1; `retainPerRank` lifts it toward `retainCap`. Read in `stepWeapon`
   * (`talentPiercing`); the falloff is applied per body in `stepProjectiles`.
   */
  piercing: {
    piercePerRank: 1,
    retainBase: 0.55,
    retainPerRank: 0.08,
    retainCap: 0.92,
  },
  /**
   * CONCUSSIVE ROUNDS (ranged-tree control): a chance for a shot to SHOVE the
   * struck foe straight back (the same displacement machinery as the knockback
   * affix, role-scaled). Rank raises the chance (capped) and the shove distance.
   * Read on the hero's own surviving ranged hits (`talentConcussive`).
   */
  concussive: {
    chancePerRank: 0.13,
    chanceCap: 0.65,
    distance: 22,
    distancePerRank: 6,
  },
  /**
   * CRIPPLING SHOT (ranged-tree control): a chance for a shot to SLOW the struck
   * foe (the engine's chill fields, at `slowFactor` — a hobble, milder than a
   * frost freeze). Rank raises the chance (capped) and lengthens the slow. Read
   * on the hero's own ranged hits (`talentCrippling`).
   */
  crippling: {
    chancePerRank: 0.16,
    chanceCap: 0.75,
    slowFactor: 0.5,
    slowMs: 900,
    slowMsPerRank: 250,
  },
  /**
   * VOLLEY (ranged-tree AoE proc): a chance for one trigger pull to loose EXTRA
   * projectiles in a spread. Ranks 1–3 add `extra` (+2), ranks 4+ add
   * `bonusExtra` (+4, from `bonusFromRank`). Rank raises the chance (capped).
   * `spreadDeg` fans the bonus pellets so they don't stack into one line. One
   * roll per pull, read in `stepWeapon` (`talentVolley`).
   */
  volley: {
    chancePerRank: 0.07,
    chanceCap: 0.5,
    extra: 2,
    bonusExtra: 4,
    bonusFromRank: 4,
    spreadDeg: 26,
  },
  /**
   * SPRING HEELS (ranged-tree mobility): higher, longer jumps. `velocityPerRank`
   * lifts the takeoff speed (a floatier, further-reaching arc); at rank 5 the
   * stamina cost of a hop drops by `jumpCostReduction` (`costReductionRank`).
   * Read in `stepPlayer` (`talentSpringHeels`).
   */
  springHeels: {
    velocityPerRank: 0.07,
    jumpCostReduction: 0.4,
    costReductionRank: 5,
  },
  /**
   * EVASION's rank-5 kicker: a successful dodge leaves an afterimage and a brief
   * SPEED BURST (`speedMult` for `ms`). Only the base dodge chance scales per
   * rank (an effect-bag `dodgePerRank`); this burst is the rank-5 flourish.
   * Read in `playerSpeed` (`talentEvasionBurst`), armed on a dodge in the struck
   * path.
   */
  evasionBurst: {
    speedMult: 1.35,
    ms: 700,
    rank: 5,
  },
} as const;
