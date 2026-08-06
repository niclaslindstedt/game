// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run statistics and the GameEvent stream step() reports each tick so the
// app layer can drive sound and visuals without the engine knowing either.

import type { Vec2 } from "@game/lib/vec.ts";

import type { WeaponMotion } from "../defs/equipment.ts";

import type { TelegraphKind } from "./actors.ts";
import type { AbilityLook } from "../defs/abilities.ts";
import type { BossAbilityId } from "../defs/enemies/abilities.ts";
import type { Quality, StatName, Tier, WeaponClass } from "./core.ts";
import type { Item, ItemVoice } from "./world.ts";

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
  /**
   * COINS PICKED UP OFF THE FLOOR this run (`items/gold.ts`) — the gold faucet's
   * own tally, kept apart from `coinsSold` so the two halves of the coin economy
   * can be read against each other. Together they are what an hour of farming
   * paid, which is the figure `GOLD.dropMult` is calibrated against.
   */
  goldCollected: number;
  /** COINS TAKEN AT THE COUNTER this run — what the merchant paid for the loot
   * the run hauled to him (`sellItem`). The recycling half of the purse. */
  coinsSold: number;
  xpGained: number;
  /** XP forfeited to the DEATH TOLL this run (`applyDeathXpPenalty`) — 0 until
   * the hero dies, then the share of the level's bar the death cost. Banked on
   * the stats so the defeat splash and the balance sim can read it. */
  xpLost: number;
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
  | {
      type: "shot";
      weaponClass: WeaponClass;
      pos: Vec2;
      dir: Vec2;
      /** The firing weapon's OWN sound id (`WeaponDef.sfx`), when it has one.
       * The app plays it in place of the class sound, which is how a mod's
       * weapon can sound like itself rather than like every other gun. The
       * engine neither knows nor cares what it names. */
      sfx?: string;
    }
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
      /** The swinging weapon's OWN sound id — see `shot`. */
      sfx?: string;
      /**
       * HOW the weapon is worked (`WeaponDef.motion`), forwarded for the app to
       * draw — an opaque presentational word to the engine, exactly like `sfx`.
       * Absent (every weapon but the odd tool) reads as a swing: a blade wound
       * back and carried through its cone. `shake` says there is no arc to
       * draw at all — the thing is pressed into a body and juddering — so the
       * app skips the swing's whole picture rather than sweeping a cone the
       * weapon never travelled. The cone the engine HIT with is unchanged.
       */
      motion?: WeaponMotion;
      /**
       * The weapon is FIRE (`WeaponDef.burn`), forwarded for the app to draw —
       * an opaque presentational word to the engine, exactly like `sfx` and
       * `motion` beside it.
       *
       * It rides the SWING rather than being looked up app-side, and that is
       * the same reasoning `motion` follows: the two paths that swing a melee
       * weapon (the hero's sweep, a companion's) both emit this event, and a
       * consumer that reached for "the local hero's equipped weapon" instead
       * would draw a companion's gout coming out of the player. The engine
       * itself does nothing with it — the cone it HIT with is unchanged, and
       * `incinerated` on the kill is a separate flag on a separate event.
       */
      burn?: boolean;
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
  /**
   * TAKEOFF: the hero shoved off the ground. `pos` is where he pushed from and
   * `speed` the ground speed he carried into it (world px/s) — the app kicks a
   * puff of whatever he was standing on, smeared along the way he was going.
   */
  | { type: "jump"; pos: Vec2; speed: number }
  /**
   * TOUCHDOWN. `impact` is the speed he hit the floor at as a fraction of a
   * standing hop's takeoff (1 for a plain jump; more off a Spring Heels
   * launch), and `speed` the ground speed he landed carrying — together they
   * size the dust he throws and the squash he lands in. Normalized here because
   * the takeoff velocity is the engine's number, not the app's.
   */
  | { type: "land"; pos: Vec2; impact: number; speed: number }
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
      /** The struck enemy's FULL health. The app prices the BLOOD a blow throws
       * on the damage measured against it (`damage / maxHp`), exactly as the
       * kill launch prices its throw: a blow that takes most of a mob's bar
       * opens it up, the same blow against a boss is a scratch. */
      maxHp: number;
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
      /** The victim's FULL health. The app sizes the death launch off the blow
       * measured against it (`damage / maxHp`): the corpse is flung away from
       * the hero in proportion to the damage it took AND the health that had to
       * absorb it — so a crit throws further than the plain blow beside it, a
       * big-barred mob is HEAVIER and barely rocks, and a legendary one-shot
       * punts a minion clear off the screen. */
      maxHp: number;
      /** The health the victim STILL HAD when the blow landed — what the blow
       * actually had to get through. `damage - hpBefore` is the OVERKILL: how
       * far past death this blow drove the body, which is QuakeWorld's gib rule
       * (`health < -40`) and what the app measures a CLEAVE or a GIB off
       * (`game-screen/kill-presentation.ts`). It is a different question from
       * `damage / maxHp`, which is how HARD the blow was and what the corpse
       * launch and the blood are priced on — a chip finish on a mob down to its
       * last sliver takes the same bar off as a clean one-shot, but only one of
       * them drove the body far past zero. */
      hpBefore: number;
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
      /** The killing blow came off an EDGE — a melee weapon that cuts rather
       * than crushes (`items/edge.ts`). The app answers it by cutting the body
       * in two along the swing instead of bursting it into gibs; nothing in the
       * simulation reads it. Absent = blunt, which is every shot, spell,
       * powerup, hazard and bare-handed blow in the game. */
      edged?: boolean;
    }
  /** `cause` names what dealt the blow — an enemy defId (contact, slam, or a
   * hostile shot's shooter) or a `hazard:<kind>` tag (asteroid, sandstorm,
   * stampede). Absent on unattributed hits (the scripted opening flash). The
   * simulator's death ledger reads it to book each death's cause. */
  | { type: "playerHurt"; crit: boolean; cause?: string }
  /** The player sidestepped a blow entirely (see `playerDodgeChance`). `pos`
   * is the hero — the app floats a "DODGE" tag and pips a light whiff. */
  | { type: "playerDodge"; pos: Vec2 }
  /** A blow passed clean THROUGH the hero — he is spectral (a running PALE
   * SHROUD). `pos` is where it failed to land; drives the "PHASED" float and
   * the ghost-wash cue. */
  | { type: "playerPhased"; pos: Vec2 }
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
      kind: TelegraphKind;
      pos: Vec2;
      defId: string;
      ms: number;
      dir?: Vec2;
    }
  /**
   * A boss's BEAM opened (the `laser_eyes` ability): it sweeps `sweep` radians
   * about `angle` over `durationMs`, reaching `range` at `width` half-width.
   * One event carries the WHOLE sweep, so the app can draw it as a single
   * continuous move rather than trying to reconstruct it frame by frame.
   */
  | {
      type: "bossBeam";
      pos: Vec2;
      angle: number;
      sweep: number;
      range: number;
      width: number;
      durationMs: number;
      defId: string;
    }
  /**
   * A boss drove its FLAG into the ground (the `flag_plant` ability): a
   * stationary, killable body that calls adds until it is broken. `flagDefId`
   * is what was planted, `defId` who planted it.
   */
  | {
      type: "bossFlagPlanted";
      pos: Vec2;
      defId: string;
      flagDefId: string;
    }
  /**
   * A boss SHOUTED the first time it cast an ability (`BossAbility.bark`).
   * Deliberately NOT the dialogue system: every other spoken line in the game
   * freezes the run into the `dialogue` phase, which is exactly wrong mid-fight
   * — the bark's whole job is to name the move WHILE it is being dodged. The
   * app floats it over the speaker and play never stops.
   */
  | { type: "bossBark"; pos: Vec2; defId: string; lines: string[] }
  /**
   * AN ELITE-TIER ABILITY DID SOMETHING (see defs/enemies/abilities.ts).
   *
   * ONE event for all ten primitives, discriminated by `kind`, rather than ten
   * near-identical ones — and the reason is not brevity, it is that `kind` is
   * already a field `soundKey` picks a sound on (exactly as it is for
   * `enemyTelegraph`), so ten primitives × their phases become ten distinct
   * catalog sounds with no matcher change at all. The app switches on the same
   * field to draw them.
   *
   * `phase` separates the moments within one move that deserve different
   * treatment — a ward going UP and a ward being BROKEN are the same ability
   * and opposite events, and the break is the one the player needs to hear.
   *
   * The `look` is RESOLVED HERE, by the engine, off the casting ability's own
   * kit, rather than left for the app to recover from the def: by the time a
   * burst is drawn the caster may be dead, and an effect that lost its colours
   * the instant its owner died is the one bug this field exists to prevent.
   * The geometry fields are the union of what the ten need; each is documented
   * with who fills it, and an unread one is simply absent.
   */
  | {
      type: "eliteCast";
      /** Which primitive — the sound key and the app's draw switch. */
      kind: BossAbilityId;
      /** `cast` the move committing, `tick` a repeat beat within a running one
       * (a fissure opening, a tether pull), `end` its close (a ward breaking, a
       * ring going out). Absent reads as `cast`. */
      phase?: "cast" | "tick" | "end";
      /** Where it happened — usually the caster, but the AFFECTED spot for a
       * move that lands away from it (a snare's centre, a fissure). */
      pos: Vec2;
      defId: string;
      /** The caster's authored colour kit (`AbilityBase.look`). */
      look?: AbilityLook;
      /** The far end: a blink's arrival, a tether's other end. */
      to?: Vec2;
      /** The reach of whatever it drew (pulse ring, snare field, quake fissure,
       * orbit ring). */
      radius?: number;
      /** A fan's centre bearing and full width, in radians (seeker volley). */
      angle?: number;
      spread?: number;
      /** How many things went out or were reached (bolts, motes, rallied mobs). */
      count?: number;
      /** How long the thing it started will run (orbit, snare, ward, tether). */
      ms?: number;
    }
  /** The hero is standing in BURNING FLOOR and it just bit him (see
   * `ScorchPatch`). `pos` is the hero — the app licks flame up his legs. */
  | { type: "scorchBurn"; pos: Vec2; defId: string }
  /** A shot came off a wall instead of dying on it (`Projectile.bouncesLeft` —
   * the coin cannon). `pos` is the point of contact; the app sparks it so the
   * ricochet reads as a deliberate mechanic rather than as a shot behaving
   * oddly. */
  | { type: "projectileBounced"; pos: Vec2; hostile: boolean }
  /** A boss opened up with a FAN of shots (`coin_cannon`). `pos` is the muzzle,
   * `angle` the fan's centre bearing and `spread` its full width (radians) —
   * one event for the whole volley, so the app can sell it as one move. */
  | {
      type: "bossVolley";
      pos: Vec2;
      angle: number;
      spread: number;
      count: number;
      defId: string;
    }
  /** A boss threw down BAIT (`bait_drop`). `pos` is a pile — one event each, so
   * the app can arc a coin out to every one of them. */
  | { type: "baitDropped"; pos: Vec2; defId: string }
  /** A bait pile went off under the hero. */
  | { type: "baitDetonated"; pos: Vec2; radius: number; defId: string }
  /** A boss called in an ORBITAL DELIVERY (`airstrike`): `count` pods are on
   * their way to marks around the hero. The pods themselves ride the meteor
   * system and telegraph with its ground shadow; this is the CALL. */
  | { type: "bossAirstrike"; pos: Vec2; count: number; defId: string }
  /** A drop pod landed and POPPED OPEN — the crater is also a spawn. */
  | { type: "podOpened"; pos: Vec2; defId: string; count: number }
  /** A boss called its followers in at a run (`call_horde`). */
  | { type: "bossHorde"; pos: Vec2; defId: string }
  /** A boss raised a REPAIR NODE (`recompile`): while it stands the boss heals,
   * and `nodePos` is the thing to break to stop that. */
  | {
      type: "bossRecompile";
      pos: Vec2;
      nodePos: Vec2;
      defId: string;
      nodeDefId: string;
    }
  /** A tethered boss took health back this tick — `from` is the node feeding it,
   * so the app can draw the tether the answer runs along. */
  | { type: "bossHealed"; pos: Vec2; from: Vec2; defId: string }
  /** BLAST SHUTTERS dropped around the hero (`lockdown`). `gapAngle` is the
   * bearing of the one way out — the app leans the read toward it rather than
   * hiding it, because a cage with a findable door is the whole move. */
  | {
      type: "bossLockdown";
      pos: Vec2;
      radius: number;
      gapAngle: number;
      defId: string;
    }
  /** The shutters retracted and the room is a room again. */
  | { type: "bossLockdownLifted"; pos: Vec2; defId: string }
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
       * (medkits, scrolls, powerups), which never carry an inventory icon.
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
       * COINS this pickup banked (gold piles only) — the app floats it as
       * rising gold text over the hero, the way a scroll floats its multiplier.
       * Absent for every pickup that isn't money.
       */
      coins?: number;
      /**
       * True when the collected piece is UNIDENTIFIED (a magic-or-better find
       * — see `Equipment.unidentified`). The app routes these to the small
       * pickup feed instead of the framed card: the reveal spectacle is saved
       * for the moment the piece is identified.
       */
      unidentified?: boolean;
    }
  /**
   * A bag piece was IDENTIFIED — at the merchant's counter (`identifyItem`) or
   * with an ITEM LOOKUP TICKET in the field (`spendLookupTicket`). This is the
   * moment the find's name and stats are revealed, so it is the cue the app's
   * reveal card fires on (the one a plain pickup used to get). Pushed by a
   * UI-driven mutator, so like `gearRepaired` it is only seen by callers that
   * read events before the next `step()` — the app cues its reveal directly
   * from the command's result as well.
   */
  | {
      type: "itemIdentified";
      tier: Tier;
      name: string;
      defId: string;
      /** The identified piece's stable `Equipment.id` — the app resolves the
       * live instance in the bag from it for the full-stats reveal card. */
      itemId: number;
      uniqueId?: string;
    }
  /**
   * A thrown drop touched down. This is the one that CLATTERS — a landing is
   * the moment the player is told something fell, and what it sounds like is
   * what it is MADE OF: `kind` is the item's material voice (`itemVoice` —
   * blade, mail, cloth, flask …), so a hauberk rings and a robe flumps. The
   * field is named `kind` because that is the slot the sound catalog picks by
   * (see `soundKey`), and the app also kicks a puff of ground-tinted dust off
   * `pos`. A RARITY on top of the thud rides its own event (`lootShine`), so
   * the two layer instead of needing one sound per material × tier.
   */
  | { type: "itemLanded"; pos: Vec2; kind: ItemVoice }
  /**
   * A magic-or-better find touched down — the flourish that layers OVER the
   * material thud, and the cue the app blooms the rarity's own burst of light
   * and smoke on. Emitted only for equipment at `magic` and above: a white
   * drop is a thud and nothing else, which is exactly what makes the chime
   * mean something.
   */
  | { type: "lootShine"; pos: Vec2; tier: Tier }
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
   * app can answer with the angel's chime and swoop. The drop's own cue is
   * `itemLanded`, which the rescue fires as usual when the guardian lets go.
   */
  | { type: "mercyDrop"; pos: Vec2 }
  /**
   * THE CACHE HAS BEEN GIVEN — Ruth's chest is coming into being against the
   * garage's north wall (`grantCache`, src/game/cache.ts). Fires once, on the
   * handover, so the app can start the arrival the run's own `cacheArriveMs`
   * counts off and can bank the chest on the CHARACTER, where a permanent
   * acquisition belongs (a death must never un-give it).
   *
   * `pos` is where the thing lands, which is not where the conversation
   * happened: the chest goes to its wall, not to the giver's feet.
   */
  | { type: "cacheGiven"; pos: Vec2 }
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
  /**
   * The equipped RANGED weapon ran out of ammunition and was stowed for
   * something the hero can actually fire (`swapOffDryWeapon`); `defId` is the
   * empty one. Durability's twin — a ranged weapon never breaks, so this is
   * the only way one leaves the hand on its own.
   *
   * Emitted only on an actual SWAP. A hero with nothing loaded to swap to keeps
   * the empty weapon in hand and fires nothing, silently — an event per tick
   * for a state the player can already read off the HUD's gauge would be noise.
   */
  | { type: "weaponDry"; defId: string }
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
  /** A stacked weapon repair kit was spent from the consumable dock — the held
   * weapon, every bagged weapon, and the worn armor are mended, and any
   * durability-booted weapon is back in rotation. Drives the toolbox chime. */
  | { type: "repairKitUsed" }
  /** An ability pickup kicked in (or refreshed its timer). */
  | {
      type: "abilityStarted";
      defId: string;
      /** The power's OWN sound id (`AbilityDef.sfx`), when it has one — the
       * app plays it in place of the event's sound, so a mod's power can
       * sound like itself. Same seam a weapon's `sfx` rides. */
      sfx?: string;
    }
  | { type: "abilityEnded"; defId: string; sfx?: string }
  /** A MOONFALL rock landed at `pos` (the `rain` powerup): `radius` sizes the
   * app's crater burst. The blast was resolved engine-side. */
  | {
      type: "meteorFall";
      pos: Vec2;
      radius: number;
      defId: string;
      sfx?: string;
    }
  /** THE UNMAKING washed a ring out of the hero at `pos` (the `pulse`
   * powerup): `radius` is how far it reached. Damage and shove already
   * resolved engine-side. */
  | { type: "voidWave"; pos: Vec2; radius: number; defId: string; sfx?: string }
  /** A BLAST SHIELD ate a blow: `absorbed` is the hp the shell took instead of
   * the hero and `remaining` what is left of its pool. Drives the rim flare. */
  | { type: "barrierAbsorbed"; absorbed: number; remaining: number }
  /** A BLAST SHIELD's pool ran out and the shell shattered at `pos`. */
  | { type: "barrierBroke"; pos: Vec2; defId: string; sfx?: string }
  /** A CONTINUITY PROTOCOL ward clipped a killing blow at `pos` — the hero is
   * left standing on `floor` hp. Drives the gold save flare. */
  | { type: "wardHeld"; pos: Vec2; floor: number; defId: string; sfx?: string }
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
   * A BOSS DEATH RITE opened: the boss is on its knees, the horde is being held
   * off, and the run has dropped into the `bossDeath` phase (`boss-death.ts`).
   * Everything the app needs to stage the scene rides here, so the picture can
   * be built without reaching back into the enemy list the kill already spliced
   * the body out of.
   */
  | {
      type: "bossRiteBegan";
      pos: Vec2;
      defId: string;
      /** The rite being performed (`DeathRiteDef.id`). */
      rite: string;
      /** Hero → boss, the bearing the whole rite runs along. */
      heading: number;
    }
  /**
   * THE BLOW LANDED — the one frame the rite is about. Carries what the app
   * needs to build the wreckage through the gore machinery it already has
   * (`goreBurst`): the intended remains, the bearing, and a force well past
   * anything an ordinary blow reaches.
   *
   * The gore GATE is not consulted here and must not be: the engine's
   * choreography is identical either way (the hero still leaps, the boss still
   * dies), and it is only what is LEFT that is mature content. So the app asks
   * `bloodAmount()`/`nsfwAllowed()` when it reads this and downgrades `remains`
   * to an ordinary corpse when the answer is no — the same fallback shape every
   * other gated kill takes.
   */
  | {
      type: "bossRiteStruck";
      pos: Vec2;
      defId: string;
      rite: string;
      /** What the rite means to leave: cut in two, burst, or a whole body. */
      remains: "cleave" | "gib" | "corpse";
      heading: number;
      /** In the boss's own healthbars — the currency the blood and the gore
       * ladder already trade in. */
      force: number;
      /** Per-rite seed, so the wreckage is the same on every redraw. */
      seed: number;
    }
  /**
   * A FLIGHT rite's exit tore open at `pos` — the coward has stopped fighting
   * and is about to bolt for it. Fired as the RUN starts rather than at the
   * stagger, so the player watches him decide rather than being told where he
   * is going before he panics.
   */
  | {
      type: "bossRiteExitOpened";
      pos: Vec2;
      defId: string;
      rite: string;
      /** Full turns the vanishing spin makes (`DeathRiteDef.spin`). */
      spin: number;
    }
  /**
   * A FLIGHT rite's boss went THROUGH: it reached the mouth and is drawn in
   * spinning, out of existence. The counterpart to `bossRiteStruck` and the
   * reason the two are separate events — a flight leaves nothing on the floor,
   * so there is nothing to gate and no wreckage to build.
   */
  | {
      type: "bossRiteVanished";
      pos: Vec2;
      defId: string;
      rite: string;
      spin: number;
    }
  /** A BOSS DEATH RITE finished: the wreck has settled (or the coward is gone)
   * and the last words are about to open. `bossDefeated` follows in the same
   * tick on a death rite; a flight books `bossFled` instead. */
  | { type: "bossRiteEnded"; pos: Vec2; defId: string; rite: string }
  /**
   * A fleeing unique (see `EnemyDef.flees`) was beaten down to 0 hp and
   * escaped instead of dying — off the board, loot paid, and a landmark (the
   * rift it tore open) left at `pos`. Distinct from `bossDefeated` so the app
   * can play the escape as a warp, not a death.
   */
  | { type: "bossFled"; pos: Vec2; defId: string }
  /**
   * A CUTSCENE ASKED FOR A NOISE — a `sound` beat came up in the scene the run
   * is playing (the front door opening on the hero's way out of the prelude).
   * `sfx` is the sound's own id, which is the seam a weapon's and a power's
   * own sound already ride: the engine never learns what a scene sounds like,
   * it only forwards the name the scene wrote down.
   */
  | { type: "cutsceneSound"; sfx: string }
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
  /** THE GARAGE DOOR rolled up — an approach door opened for a hero (or the
   * driven car) pulling up to it. The app draws the roll-up and rattles the
   * chain drive; the obstacles are already gone when this fires. */
  | { type: "garageDoorOpened"; pos: Vec2 }
  /**
   * A LAIR opened: the hero walked up to an occupied house and whoever lives
   * there came out to meet him (see lairs.ts). The engine has already put the
   * occupant on the field and swapped the door to its open frame; the app plays
   * the bang.
   */
  | { type: "lairOpened"; pos: Vec2; id: string }
  /**
   * The hero rode an ELEVATOR: he stood on the pad at `from` and the car set him
   * down at `to`. The engine has already moved him and lifted the fog at the far
   * end; the app plays the doors, the drop and the arrival.
   */
  | { type: "elevatorRide"; id: string; from: Vec2; to: Vec2; first: boolean }
  /** A KEYED car refused the ride: the hero stood on the pad without the story
   * item that `unlocks` it. Booked every tick he stands there, so the app can
   * hold a "you need the pass" read on screen for as long as he is asking. */
  | { type: "elevatorLocked"; id: string; key: string }
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
   * A hero climbed into the car and the engine turned over (`enterCar`).
   * The app plays the starter cough and begins the idle rumble; the lights
   * and the body shiver key off `CarVehicle.driver` directly.
   */
  | { type: "carStarted"; pos: Vec2 }
  /**
   * A hero switched the engine off and got out (`exitCar`). The app plays the
   * key coming out and the idle dying away; the lights and the body shiver go
   * out on their own, because both key off `CarVehicle.driver`.
   */
  | { type: "carStopped"; pos: Vec2 }
  /**
   * The running engine's cadence grain — fired every `CAR.engineCueMs`
   * while somebody is at the wheel, like `stampedeRumble`: each grain is a
   * touch shorter than the app's putter, so successive grains overlap into
   * a continuous idle rumble. `intensity` is speed over top speed (0 at
   * idle, 1 flat out) — driving raises the pitch and the volume.
   */
  | { type: "carEngine"; pos: Vec2; intensity: number }
  /**
   * A bare axle grinding the road — the car's last stand. Fired on its own
   * cadence while the car moves with a wheel GONE (and once, at full
   * intensity, the moment a wheel tears off and the corner slams down).
   * `pos` is the dragging corner's ground contact; `intensity` is speed
   * over top speed. The app answers with a shower of sparks.
   */
  | { type: "carGrind"; pos: Vec2; intensity: number }
  /**
   * The car drove clear of its parking spot — the drive-out. Like
   * `gateEntered`, the engine only BOOKS the departure (once); the APP owns
   * the travel: `to` is the car door's destination, resolved from the
   * level's own `travelDoors` when the latch fires.
   */
  | { type: "carDeparted"; pos: Vec2; to: string }
  /**
   * The hero met the wandering merchant for the first time: he stops
   * wandering, pins the level map, and his stall is now open at `pos`. The
   * app toasts the meeting and can chime a till.
   */
  | { type: "merchantDiscovered"; pos: Vec2 }
  /**
   * The hero walked up to somebody with an errand for the first time: they are
   * pinned on the level map and their mark is now readable. `giverId` keys
   * QUEST_GIVER_DEFS.
   */
  | { type: "questGiverMet"; pos: Vec2; giverId: string }
  /** An errand was taken on. The app cues the parchment and starts tracking it. */
  | { type: "questAccepted"; questId: string; giverId: string }
  /**
   * An errand TOPPED THE HORDE UP as it was taken (see quests/restock.ts):
   * `count` more of `enemy` were queued into the map's spawn points because
   * what was left could not have supplied the job. Nothing in the app has to
   * draw this — the mobs announce themselves by arriving — but it is the one
   * record that the field was changed, which is what a balance run reads to
   * tell a restocked map from a naturally busy one.
   */
  | { type: "questRestocked"; enemy: string; count: number }
  /**
   * An objective's tally moved — a kill counted, a piece picked up, an escort
   * delivered. `index` is which objective (parallel to `QuestDef.objectives`),
   * `count`/`need` where it now stands. The app floats the WoW-style
   * "3/8 ASSEMBLER SLAIN" line off this and nothing else, so a tally that
   * moves without one is a tally the player never sees move.
   */
  | {
      type: "questProgress";
      questId: string;
      index: number;
      count: number;
      need: number;
    }
  /**
   * Every objective is met — the errand is ready to hand in. Separate from
   * `questTurnedIn` because the two are minutes apart and mean different
   * things: this one says "go back", the other pays.
   */
  | { type: "questCompleted"; questId: string }
  /**
   * Handed in and PAID. `xp`/`coins` are what actually landed and `items` the
   * pieces minted, so the app can list the haul without re-deriving it.
   */
  | {
      type: "questTurnedIn";
      questId: string;
      giverId: string;
      xp: number;
      coins: number;
      items: number;
    }
  /** An errand failed — today only an escort that fell. */
  | { type: "questFailed"; questId: string; reason: "escortDied" }
  /** An escorted civilian took a blow. `pos` is where they stand. */
  | {
      type: "escortHurt";
      pos: Vec2;
      questId: string;
      hp: number;
      maxHp: number;
    }
  /** An escorted civilian reached the spot they were being walked to. */
  | { type: "escortArrived"; pos: Vec2; questId: string }
  /** An escorted civilian fell. The quest that owned them fails with it. */
  | { type: "escortDied"; pos: Vec2; questId: string }
  /**
   * A dormant mob wired to a spawn point (`SpawnSpec.alarms`) WOKE and raised
   * the alarm: the linked point activates and pours reinforcements at the
   * hero for `SPAWNERS.alarmWindowMs`. `pos` is the caller's spot — the app
   * can sell the beat (a klaxon, a flash) from here.
   */
  | { type: "spawnerAlarmed"; pos: Vec2 }
  /**
   * A HELLGATE TORE OPEN (config HELLGATES, spawners.ts): the hero's RAMPAGE
   * reached the point's `openStage` and it began letting `hellborn` through.
   * `pos` is the gate's anchor and `stage` the rampage stage that opened it —
   * the app flashes the tear, sounds it, and can lean harder on both the deeper
   * the stage runs.
   */
  | { type: "hellgateOpened"; pos: Vec2; stage: number }
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
   * A NEUTRAL MOB WAS TALKED INTO SWINGING (see `provokeEnemy`): the body at
   * `pos` was a bystander a tick ago and is an ordinary monster now. The app
   * sells the turn — the sprite snaps to its fighting frame, a bark, the horde
   * sting — because a bystander that simply began attacking with no beat
   * between reads as a bug rather than as a consequence.
   */
  | { type: "enemyProvoked"; pos: Vec2; defId: string }
  /**
   * A CONVERSATION TREE OPENED (see conversation.ts) — the hero tapped a
   * bystander and the talk box is up. The app plays the greeting sound and
   * cuts the field's own chatter; `node` is which node it opened on, which is
   * how a re-entry sounds different from a first meeting.
   */
  | { type: "talkOpened"; defId: string; node: string }
  /**
   * A RUN FLAG WAS SET — something was learned, admitted, or talked into. The
   * one signal a conversation sends the rest of the game, emitted exactly once
   * per flag however many branches claim to set it. The app uses it to nudge
   * the quest tracker, which may have just gained or completed an objective
   * without a single kill anywhere.
   */
  | { type: "questFlagSet"; flag: string }
  /**
   * A quest piece went ACROSS THE COUNTER to the trader (see
   * quests/merchant.ts). The app plays the sale and floats the coins; the
   * interesting half is what he puts out afterwards.
   */
  | { type: "questPieceSold"; questId: string; item: string; coins: number }
  /** A quest piece was BOUGHT off the counter — the row a sale unlocked. */
  | { type: "questPieceBought"; questId: string; item: string; coins: number }
  /**
   * A CLEAN SLATE WAS SPENT (see `useCleanSlate`) — the hero's whole build is
   * about to be handed back to him. The app sells the moment before the
   * chooser lands: the one page of a very long errand that is worth a flash.
   */
  | { type: "cleanSlateUsed"; pos: Vec2 }
  /**
   * A spareable unique was beaten to 0 hp and the run paused into the
   * `choice` phase: the player must SPARE it (it joins the party) or KILL it
   * (the withheld killing blow lands). The app raises the verdict overlay.
   */
  | { type: "spareOffered"; defId: string; pos: Vec2 }
  /** A spared unique joined the party as a companion (`defId` keys
   * COMPANION_DEFS). The app can toast the recruitment. */
  | { type: "companionJoined"; defId: string; pos: Vec2 }
  /**
   * The hero already had a friend and took on another, so the incumbent was
   * RETIRED (`COMPANIONS.maxParty` is one — see `recruitCompanion`). Announced
   * rather than done quietly: a party that silently swapped members would read
   * as the game having lost one.
   */
  | { type: "companionDismissed"; defId: string; pos: Vec2 }
  /** A companion was beaten down (0 hp): it kneels out of the fight, aura
   * silent, and STAYS there — only SMELLING SALTS stand it back up. */
  | { type: "companionDowned"; defId: string; pos: Vec2 }
  /** SMELLING SALTS woke a downed companion (at `COMPANIONS.saltsHpFraction`,
   * back at the hero's side — see `spendReviveItem`). */
  | { type: "companionRevived"; defId: string; pos: Vec2 }
  /** One of the hero's medkits was spent on a hurt companion
   * (`healCompanionWithMedkit`); `amount` is the hp it actually put back. */
  | { type: "companionHealed"; defId: string; amount: number; pos: Vec2 }
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
  /**
   * The hero fell — the fatal blow landed and the run dropped into the `dying`
   * phase (the dramatic death tableau, see `death-scene.ts`). `pos` is where he
   * fell; the app plays the death sting, the heaviest haptic, and kicks the
   * camera at THIS moment (the modal's `defeat` event comes seconds later, when
   * the scene ends). Distinct from `defeat` so the collapse and the modal each
   * get their own beat.
   */
  | { type: "playerDeath"; pos: Vec2 }
  /**
   * A hero fell while the party was STILL STANDING (see
   * `downed.ts`): their gear went to a corpse at `pos` and `xpLost` is the
   * DEATH TOLL their own bar just paid. Never fires solo — one hero falling
   * is the party wiped, which is `playerDeath`'s beat. The app lands the
   * death sting for its OWN seat and a softer party cue for anybody else's;
   * the party HUD flips the seat's frame to DOWN off the state itself.
   */
  | { type: "heroDown"; seat: number; pos: Vec2; xpLost: number }
  /** A corpse was emptied by its owner walking back to it — every piece worn
   * again or banked to the bag, and the body leaves the field. */
  | { type: "corpseRecovered"; seat: number; pos: Vec2 }
  /** The death scene ended and the YOU DIED modal takes the stage. `xpLost` is
   * the XP the DEATH TOLL took (0 when the penalty knob is off or the bar was
   * already empty) — the app floats it on the defeat splash so the cost of
   * dying reads, and banks the run (see run-progress.ts). */
  | { type: "defeat"; xpLost: number }
  /**
   * The AUTO PILOT disengaged itself mid-flight (see autopilot.ts) — today
   * only because the purse ran dry (`reason: "coins"`). Pushed inside
   * `step()` so the app reliably sees it; a player-driven stop goes through
   * the `stopAutopilot` mutator and cues its own feedback.
   */
  | { type: "autopilotStopped"; reason: "coins" };
