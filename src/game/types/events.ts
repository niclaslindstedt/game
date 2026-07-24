// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run statistics and the GameEvent stream step() reports each tick so the
// app layer can drive sound and visuals without the engine knowing either.

import type { Vec2 } from "@game/lib/vec.ts";

import type { Quality, StatName, Tier, WeaponClass } from "./core.ts";
import type { Item } from "./world.ts";

export type GameStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  /** JUMP takeoffs this run (a grounded, stamina-paid liftoff — the airborne
   * frames that follow are one jump). The stamina-discipline readout: each
   * takeoff spends `STAMINA.jumpCost` of the pool, so the balance sim reports
   * this alongside kills/damage to show how often the autopilot (or player)
   * leaves the ground. */
  jumps: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  xpGained: number;
  /** Total mana spent casting spells this run — the spell-economy readout the
   * balance sim reports (alongside `spellsCast`). */
  manaSpent: number;
  /** Total spells cast this run (successful casts only). */
  spellsCast: number;
  /** Wall-clock ms of simulated play time — ticks every frame, drives every
   * timed sub-system (spawner, menace, effects). */
  timeMs: number;
  /**
   * The farm-proof survival clock: ms that only accrue while a fight is LIVE —
   * at least one foe on the field, or within `RUN.combatGraceMs` of the last
   * kill (see step/). A cleared field can't be loitered on for survival
   * time, so this — not `timeMs` — is what the high-score board banks.
   */
  combatMs: number;
  /** The highest menace (RAMPAGE) stage reached this run — the high-water
   * escalation, banked to the score board (see menace.ts `menaceStage`). */
  peakMenace: number;
};

/**
 * Something notable that happened during one `step()`, for the app layer to
 * react to (play a sound, flash the screen). Cleared at the start of every
 * step.
 */
export type GameEvent =
  /**
   * A projectile weapon fired. `pos` is the muzzle (the shooter), `dir` the
   * unit aim — the app draws a firing flash (ranged) or a cast burst (magic)
   * oriented along it.
   */
  | { type: "shot"; weaponClass: WeaponClass; pos: Vec2; dir: Vec2 }
  /**
   * A melee weapon swung. `pos` is the swinger, `dir` the unit aim, `range`
   * the effective reach, `arc` the full cone angle (radians) that the swing
   * strikes — the app sweeps a slash across that cone at that radius (a wide
   * arc for a blade, a narrow thrust for a spear).
   */
  | {
      type: "swing";
      pos: Vec2;
      dir: Vec2;
      range: number;
      arc: number;
      /**
       * How many foes fell inside the cone this swing — the UNCAPPED eligible
       * count (within range + arc + line of sight), BEFORE the
       * `maxMeleeTargets` cap trims it to the nearest few. It is the geometry ×
       * crowd-density read the AoE-budget calibration measures (see
       * `src/sim/aoe-calibration.ts`): "at this effective `arc`, how many
       * targets does the swing actually reach." The realized hits are
       * `min(targets, maxMeleeTargets)`.
       */
      targets: number;
    }
  | { type: "jump" }
  | { type: "land" }
  /**
   * SEISMIC LANDING (melee-tree talent): the hero's jump touched down hard and
   * slammed the ground. `pos` is the landing point, `radius` the shockwave reach
   * — the app rings a dust/ground shockwave and thumps it; the AoE damage and
   * knockback were resolved engine-side. Fires only when the talent is trained.
   */
  | { type: "seismicLanding"; pos: Vec2; radius: number }
  /**
   * PARRY (melee-tree talent): the hero turned an enemy MELEE blow fully aside
   * (no hp lost). `pos` is the hero — the app flashes a steel deflect and pips a
   * clang. A rank-5 riposte's reflected bite rides its own `enemyHit`.
   */
  | { type: "parry"; pos: Vec2 }
  | {
      type: "enemyHit";
      pos: Vec2;
      crit: boolean;
      damage: number;
      defId: string;
      /** On a crit, how strong the blow was in [0, 1] (its position in the
       * weapon's damage-variance band) — the app sizes the crit popup by it, so
       * a top-of-band crit slams a bigger figure. Absent when the source has no
       * variance (abilities); ignored for non-crits. */
      critPower?: number;
      /** The struck enemy's unique id (`Enemy.id`) — telemetry, so a consumer
       * can tell WHICH foe was hit, not just its type. */
      enemyId?: number;
      /** The hero VOLLEY (one trigger pull's worth of projectiles share one id)
       * this hit belongs to, if it came from a ranged shot — set only on the
       * hero's own projectile hits. The ranged AoE calibration groups hits by it
       * to count the DISTINCT foes one volley reaches (see
       * `src/sim/aoe-calibration.ts`). Absent on melee, ability, and companion
       * blows. */
      fromVolley?: number;
    }
  | {
      type: "enemyKilled";
      pos: Vec2;
      defId: string;
      /** The killing blow, so death also pops a damage number. */
      damage: number;
      /** The victim's FULL health. The app sizes the death launch off the
       * OVERKILL (`damage − maxHp`): an overpowered blow flings the corpse
       * flying away from the hero, further the harder it was overkilled — a
       * legendary one-shot punts a minion clear off the screen. */
      maxHp: number;
      crit: boolean;
      /** See `enemyHit.critPower`. */
      critPower?: number;
      /** XP this kill awarded — the app floats it as rising blue combat text. */
      xp: number;
      /** The slain enemy's unique id (`Enemy.id`) — telemetry (see
       * `enemyHit.enemyId`). */
      enemyId?: number;
      /** The hero VOLLEY this killing blow belongs to, if a ranged shot — see
       * `enemyHit.fromVolley`. Absent on melee/ability/companion kills. */
      fromVolley?: number;
      /** The kill was a screen-NUKE blast: the app burns the body up with fire
       * and leaves a smoking charred skeleton in place of the plain corpse. */
      incinerated?: boolean;
    }
  /** `cause` names what dealt the blow — an enemy defId (contact, slam, or a
   * hostile shot's shooter) or a `hazard:<kind>` tag (asteroid, sandstorm,
   * stampede). Absent on unattributed hits (the scripted opening flash). The
   * simulator's death ledger reads it to book each death's cause. */
  | { type: "playerHurt"; crit: boolean; cause?: string }
  /** The player sidestepped a blow entirely (see `playerDodgeChance`). `pos`
   * is the hero — the app floats a "DODGE" tag and pips a light whiff. */
  | { type: "playerDodge"; pos: Vec2 }
  /** An enemy sidestepped the player's weapon blow (see `enemyDodgeChance`).
   * `pos` is the foe — the app floats a "DODGE" tag off it. */
  | { type: "enemyDodge"; pos: Vec2; defId: string }
  /**
   * A blow bounced off a SHIELDED unique (`EnemyDef.shieldedBy` — it cannot
   * be hurt while its named guardians live). `pos` is the foe — the app
   * floats a "SHIELDED" tag so the immunity reads as a rule, not a bug.
   */
  | { type: "enemyShielded"; pos: Vec2; defId: string }
  /**
   * An enemy fired a projectile at the player (`EnemyDef.ranged`). `pos` is
   * the shooter's muzzle, `dir` the unit aim — the app draws the flash and
   * pips the hostile shot sound.
   */
  | { type: "enemyShot"; pos: Vec2; dir: Vec2; defId: string }
  /** The player's weapon blow whiffed of its own accord (see
   * `playerMissChance`). `pos` is the foe — the app floats a "MISS" tag. */
  | { type: "enemyMiss"; pos: Vec2; defId: string }
  /**
   * A set-piece mob began a telegraphed move (mechanics.ts): it stands
   * rooted for `ms` before the move lands — the app sells the windup (flash,
   * sound) so the dodge is earnable. `dir` is the charge's locked bearing.
   */
  | {
      type: "enemyTelegraph";
      kind: "charge" | "slam";
      pos: Vec2;
      defId: string;
      ms: number;
      dir?: Vec2;
    }
  /** A telegraphed slam landed: the shockwave around `pos` (radius for the
   * app's ring/shake; the damage was resolved engine-side). */
  | { type: "enemySlam"; pos: Vec2; radius: number; defId: string }
  /** An elite/boss crossed its enrage threshold — speed and damage are up
   * for the rest of the fight (the app tints it and stings the turn). */
  | { type: "enemyEnraged"; pos: Vec2; defId: string }
  /** A summoner called adds out of the ground around it. */
  | { type: "enemySummoned"; pos: Vec2; defId: string; count: number }
  | {
      type: "itemCollected";
      kind: Item["kind"];
      tier?: Tier;
      /**
       * The piece's MAKE quality (equipment pickups only, regular tier). The
       * pickup card reads it as the second visual axis: a broken/crude find
       * stays dull, while superior/perfect make earns the glow and shine a
       * magic-or-better tier would. Absent for loose pickups and normal make.
       */
      quality?: Quality;
      /** Human-readable label for the "picked up X" pickup feed. */
      name?: string;
      /**
       * The equipment's def id (equipment pickups only) — lets the app resolve
       * the piece's icon for the framed pickup card. Absent for loose pickups
       * (medkits, arrows, powerups), which never carry an inventory icon.
       */
      defId?: string;
      /**
       * The picked-up piece's stable `Equipment.id` (equipment pickups only) —
       * lets the app find it in the bag to click-equip straight from the pickup
       * card, robust to the bag being rearranged while the card is up.
       */
      itemId?: number;
      /**
       * A hand-authored UNIQUE's catalog id (see `Equipment.uniqueId`) — lets
       * the app book WHICH unique was found (the achievement ledger) without
       * matching on the display name. Absent on rolled items.
       */
      uniqueId?: string;
      /**
       * True when the piece was good enough to be worn on the spot (the
       * auto-equip path). The pickup card reads it to badge the find
       * "EQUIPPED" rather than offering a tap-to-equip.
       */
      equipped?: boolean;
      /**
       * True when wearing this piece would improve its slot over what's there
       * now (equipment pickups only). Auto-equipped finds are always upgrades;
       * a bagged find is an upgrade only when it out-scores the worn piece yet
       * wasn't force-equipped (a passive charm, say). Drives the card's
       * "UPGRADE" marker.
       */
      upgrade?: boolean;
      /**
       * XP this pickup awarded (golden XP arrows only) — the app floats it as
       * rising blue combat text above the hero's head, mirroring the "+N XP"
       * that flows off a slain foe. Absent for pickups that grant no XP.
       */
      xp?: number;
    }
  | { type: "itemDropped"; pos: Vec2 }
  /**
   * A breakable crate took a hero blow but survived (see crates.ts). `pos` is
   * the crate — the app puffs a splinter chip and pips a wooden thunk so the
   * hit reads before the box gives way.
   */
  | { type: "crateHit"; pos: Vec2 }
  /**
   * A crate was smashed open: off the field, its loot already spilled around
   * `pos`. `sprite` is the crate's sprite name so the app can keel the box
   * over (like a slain mob) and burst it into splinters before it blinks out,
   * leaving just the loot.
   */
  | { type: "crateBroken"; pos: Vec2; sprite: string }
  /**
   * A MERCY DROP was rolled and is being flown in by its ANGEL (the item's
   * `deliverMs` is now ticking). `pos` is where the guardian will release it —
   * the spot the mob died. Fires once, the instant the rescue is minted, so the
   * app can answer with the angel's chime and swoop; the `itemDropped` cue still
   * fires alongside it for the drop itself.
   */
  | { type: "mercyDrop"; pos: Vec2 }
  /**
   * The player walked over loot he couldn't carry — the bag is full, so the
   * piece stays on the ground. `pos` is the hero (the app floats a "bags full"
   * thought over him and pulses the inventory button to nudge a cleanup).
   * Throttled by `LOOT.bagFullHintCooldownMs` so standing on the loot fires it
   * once, not every frame.
   */
  | { type: "pickupBlocked"; reason: "bagFull"; pos: Vec2 }
  /** A picked-up piece was better than the equipped one and replaced it. */
  | { type: "autoEquipped"; defId: string }
  /** The equipped weapon's durability ran out; `defId` is the broken one. */
  | { type: "weaponBroke"; defId: string }
  /** A worn armor piece's durability ran out. It stays worn but INACTIVE
   * (no armor, no bonuses) until a repair kit restores it. */
  | { type: "armorBroke"; defId: string }
  /** A screen-nuke pickup went off at the player's position. */
  | { type: "nuke"; pos: Vec2 }
  /** A storm ability bolt struck at `pos` (drives the flash + crack). */
  | { type: "lightning"; pos: Vec2 }
  /** A NOVA burst around `pos` (a `proc` affix, a magic-crit blob, or a
   * companion's FROST NOVA): `radius` sizes the app's expanding ring; the
   * damage was resolved engine-side. `frost` recolours the ring icy blue for
   * the chilling companion pulse (the plain violet arcane burst otherwise). */
  | { type: "nova"; pos: Vec2; radius: number; frost?: boolean }
  /** An ARCANE SINGULARITY collapsed at `pos` (the magic-tree vortex talent):
   * `radius` sizes the app's IN-rushing warp rings, distinct from a nova's
   * outward burst. The pull + damage were resolved engine-side. */
  | { type: "singularity"; pos: Vec2; radius: number }
  /**
   * A stacked medkit was spent from the consumable dock: `name` is the
   * quality's label (`MEDKIT.tiers[tier].name`) and `heal` the hp actually
   * restored (clamped at max hp). Drives the heal chime and a "+N" float.
   */
  | { type: "medkitUsed"; tier: number; name: string; heal: number }
  /** A stacked stamina potion was spent from the consumable dock — the sprint
   * pool is now full. Drives the fizz-and-lift chime. */
  | { type: "staminaPotionUsed" }
  /** A stacked BLUE GATORADE mana potion was spent — the spell pool is now
   * full. `restored` is the mana actually returned (clamped at max). Drives the
   * fizz chime and a "+N MANA" float. */
  | { type: "manaPotionUsed"; restored: number }
  /**
   * A spell was CAST (sorcery.ts): `spellId` keys SPELL_DEFS, `pos` the hero,
   * `cost` the mana spent. The app echoes the name in the status line, pips the
   * cast chime, and plays the spell's signature effect (bolt/nova/heal/shield/
   * slow — most reuse the existing `lightning`/`nova` cues).
   */
  | { type: "spellCast"; spellId: string; pos: Vec2; cost: number }
  /**
   * A cast was REFUSED and nothing was spent: `reason` says why (not enough
   * mana, still on cooldown, or the slot's spell is no longer unlocked). The
   * app flashes the reason in the status line and pips a soft denial. */
  | {
      type: "spellFizzled";
      spellId: string;
      /** Why the cast was refused: not enough `mana`, still on `cooldown`, the
       * slot's spell is no longer `locked` (INT dropped below its unlock), or
       * there was `nothing` to do (an attack bolt with no foe in range, a heal
       * at full hp). */
      reason: "mana" | "cooldown" | "locked" | "nothing";
    }
  /** A defensive spell raised a magical SHIELD around the hero (`shieldHp`
   * absorb for `ms`). The app wraps him in a ward glow. */
  | { type: "playerShielded"; shieldHp: number; ms: number }
  /** A defensive HEAL spell restored the hero's hp (`heal` actually healed).
   * Distinct from `medkitUsed` so the app can give a spell its arcane cue. */
  | { type: "spellHealed"; heal: number }
  /** A martial SELF-BUFF power went off (a `buff` effect): the hero is amped for
   * `durationMs`. The app blooms a self-aura tinted to the power and echoes its
   * name; the mults live on the player (see `buffMs`). */
  | { type: "playerBuffed"; durationMs: number }
  /** A stacked weapon repair kit was spent from the consumable dock — the held
   * weapon, every bagged weapon, and the worn armor are mended, and any
   * durability-booted weapon is back in rotation. Drives the toolbox chime. */
  | { type: "repairKitUsed" }
  /** An ability pickup kicked in (or refreshed its timer). */
  | { type: "abilityStarted"; defId: string }
  | { type: "abilityEnded"; defId: string }
  /**
   * The hero crossed a level threshold. `gains` lists the AUTOMATIC base
   * attribute growth this ding granted (config LEVELING.autoGainsPerLevel —
   * on top of the chooser's point), so the app can print them in the feed.
   * The run does NOT pause here: the celebration window
   * (`GameState.levelUpFxMs`) burns first, and the `levelup` phase opens
   * when it runs out.
   */
  | {
      type: "levelUp";
      level: number;
      gains: { stat: StatName; amount: number }[];
    }
  /**
   * The menace meter crossed into a new evolution stage — the horde has grown
   * more dangerous in answer to the player's rampage. The app sounds the
   * escalation and can flash a "the horde evolves" cue. `pos` is where the
   * escalation happened (the overkilled victim, or the hero for rolling heat)
   * and `cause` which channel tipped it — `overkill` (a one-shot's jolt),
   * `ratchet` (the permanent evolution floor lifting a stage), or `heat` (the
   * rolling DPS/kill-rate output) — so the balance instruments (src/sim) can
   * timestamp and map every rise.
   */
  | {
      type: "menaceRose";
      stage: number;
      pos: Vec2;
      cause: "overkill" | "ratchet" | "heat";
    }
  | { type: "bossDefeated"; pos: Vec2 }
  /**
   * A fleeing unique (see `EnemyDef.flees`) was beaten down to 0 hp and
   * escaped instead of dying — off the board, loot paid, and a landmark (the
   * rift it tore open) left at `pos`. Distinct from `bossDefeated` so the app
   * can play the escape as a warp, not a death.
   */
  | { type: "bossFled"; pos: Vec2; defId: string }
  /** A speaker took the stage: the run paused into the `dialogue` phase. */
  | { type: "dialogueStarted"; speaker: string }
  /**
   * A unique mob (elite/boss) died and its parting line took the stage — the
   * run paused into the `dialogue` phase on a `enemyDeath` source. Distinct
   * from `dialogueStarted` so the app can give the death its own somber cue
   * instead of the arrival knock.
   */
  | { type: "enemyLastWords"; defId: string }
  /** A plot piece was picked up (`defId` keys into STORY_ITEM_DEFS). */
  | { type: "storyItemCollected"; defId: string }
  /** A locked door recognized its key and slid open. */
  | { type: "doorOpened"; pos: Vec2 }
  /**
   * A travel gate tore open at `pos` (its key trinket was USED — see
   * `spendGateKey`). The app plays the rupture; the gate now stands on the
   * board waiting to be stepped into.
   */
  | { type: "gateOpened"; pos: Vec2; to: string }
  /**
   * The hero stepped into an open travel gate. The engine only books the
   * crossing (once per gate) — the APP owns the travel: bank the build,
   * start a run of level `to` carrying it.
   */
  | { type: "gateEntered"; pos: Vec2; to: string }
  /**
   * The hero met the wandering merchant for the first time: he stops
   * wandering, pins the level map, and his stall is now open at `pos`. The
   * app toasts the meeting and can chime a till.
   */
  | { type: "merchantDiscovered"; pos: Vec2 }
  /**
   * A dormant mob wired to a spawn point (`SpawnSpec.alarms`) WOKE and raised
   * the alarm: the linked point activates and pours reinforcements at the
   * hero for `SPAWNERS.alarmWindowMs`. `pos` is the caller's spot — the app
   * can sell the beat (a klaxon, a flash) from here.
   */
  | { type: "spawnerAlarmed"; pos: Vec2 }
  /** The hero paid the merchant to mend his whole kit — `paid` coins spent (the
   * app chimes the till and can toast the repair). */
  | { type: "gearRepaired"; paid: number }
  /**
   * A minion was dragged into a black hole's core and devoured — off the
   * board with no kill, no XP and no loot. `defId` names the meal; the app
   * plays the gulp and the swirl at `pos`.
   */
  | { type: "wellSwallowed"; pos: Vec2; defId: string }
  /**
   * The grounded hero was dragged all the way into a black hole's core and
   * devoured — instant death (the run drops to `defeat` this same tick).
   * `pos` is the core he fell into; the app plays the swallow at the hole.
   */
  | { type: "wellDeath"; pos: Vec2 }
  /**
   * A rolling hay bale shoved the grounded hero (config HAY_BALLS). `pos` is
   * the bale — the app plays a soft thump and a puff. Fires once per bale (the
   * tick it first bites), even though the leftward shove continues while it
   * overlaps.
   */
  | { type: "hayBallHit"; pos: Vec2 }
  /**
   * A falling meteor detonated on the surface (config ASTEROIDS). `pos` is the
   * impact point and `radius` the blast reach; the app plays the flash, the
   * expanding dust cloud and shockwave, and a low boom. The blast's kills
   * (`asteroidKill`) and the hero's hurt/knockback ride their own events.
   */
  | { type: "asteroidImpact"; pos: Vec2; radius: number }
  /**
   * A minion was vaporized at the lethal core of a meteor blast — off the
   * board with no kill, no XP and no loot (like a well swallow). `defId` names
   * it; the app can poof it at `pos`, though the blast usually covers it.
   */
  | { type: "asteroidKill"; pos: Vec2; defId: string }
  /**
   * A sand storm caught the grounded hero: it took its scaled bite AND knocked
   * him out (he drops prone for SANDSTORMS.knockoutMs). `pos` is the hero at
   * the moment the gust hit; the app plays the whump + dust and shakes the
   * camera. The storm keeps drifting and thins out from here.
   */
  | { type: "sandstormHit"; pos: Vec2 }
  /**
   * An employee stampede trampled the grounded hero (config STAMPEDES): it took
   * its difficulty-scaled max-hp bite AND knocked him down (he drops prone for
   * STAMPEDES.knockdownMs). `pos` is the hero at the moment the herd hit; the
   * app plays the thunder of feet + a body drop and shakes the camera. The herd
   * charges on over him.
   */
  | { type: "stampedeHit"; pos: Vec2 }
  /**
   * A stampede BOWLED a MINION over — flung aside and left KNOCKED OUT for a few
   * seconds (config STAMPEDES.trampleStunMs), not killed: no damage, no XP, no
   * loot, and the mob survives to scramble back up (a herd can't be farmed and
   * doesn't thin the horde). `pos`/`defId` are the mob; the app plays a quick
   * knock and a scuff of dust.
   */
  | { type: "stampedeTrample"; pos: Vec2; defId: string }
  /**
   * The approach rumble of an employee stampede (config STAMPEDES): a low roll
   * of feet emitted at `rumbleEveryMs` cadence, first while a herd is still
   * DUE (the last `warnMs` of the countdown, so the hero hears it before the
   * wall appears) and then all the while a herd charges. `intensity` (0..1)
   * swells toward the spawn, peaks as the wall passes, and fades as it leaves;
   * the app scales a puff of low noise by it. Carries no position — it is the
   * whole-floor rumble, not a point sound.
   */
  | { type: "stampedeRumble"; intensity: number }
  /**
   * The hero shook off a knockout and got back to his feet (his `knockoutMs`
   * hit 0). `pos` is where he stood up; the app plays a small "up you get"
   * cue.
   */
  | { type: "knockoutRecovered"; pos: Vec2 }
  /**
   * An apparition finished its scene, walked off, and dissolved (see
   * `EnemyDef.apparition`). The app sparkles it out at `pos`.
   */
  | { type: "apparitionVanished"; pos: Vec2; defId: string }
  /**
   * A spareable unique was beaten to 0 hp and the run paused into the
   * `choice` phase: the player must SPARE it (it joins the party) or KILL it
   * (the withheld killing blow lands). The app raises the verdict overlay.
   */
  | { type: "spareOffered"; defId: string; pos: Vec2 }
  /** A spared unique joined the party as a companion (`defId` keys
   * COMPANION_DEFS). The app can toast the recruitment. */
  | { type: "companionJoined"; defId: string; pos: Vec2 }
  /** A companion was beaten down (0 hp): it kneels out of the fight until
   * `COMPANIONS.reviveMs` runs out. Its aura goes silent meanwhile. */
  | { type: "companionDowned"; defId: string; pos: Vec2 }
  /** A downed companion got back up (at `COMPANIONS.reviveHpFraction`). */
  | { type: "companionRevived"; defId: string; pos: Vec2 }
  /**
   * A companion earned a level from its own kills (`companion-stats.ts`): the
   * app floats a "LVL n" tag off its head and, on a power rank-up, cues the
   * signature growing stronger. `level` is the new companion level.
   */
  | { type: "companionLeveledUp"; defId: string; level: number; pos: Vec2 }
  /**
   * A companion's kill earned one of its def's `killQuotes`: the app floats
   * `text` above the companion at `pos` — banter, not a dialogue scene, so
   * the run never pauses for it.
   */
  | { type: "companionQuote"; defId: string; text: string; pos: Vec2 }
  /**
   * A PLACED PACK woke: the player closed to its trigger radius and its
   * members boiled up around `at` and gave chase (see stepPacks). `count` is
   * how many spawned — the app can sting the ambush and shake the turn.
   */
  | { type: "packAwoken"; pos: Vec2; count: number }
  /**
   * A placed pack was wiped out — that patch of ground is CLEARED (stepPacks).
   * `pos` is the pack anchor and `remaining` how many packs still stand on
   * the level; the app floats an "AREA CLEARED" cue and chimes it.
   */
  | { type: "packCleared"; pos: Vec2; remaining: number }
  | { type: "victory" }
  | { type: "defeat" }
  /**
   * The AUTO PILOT disengaged itself mid-flight (see autopilot.ts) — today
   * only because the purse ran dry (`reason: "coins"`). Pushed inside
   * `step()` so the app reliably sees it; a player-driven stop goes through
   * the `stopAutopilot` mutator and cues its own feedback.
   */
  | { type: "autopilotStopped"; reason: "coins" };
