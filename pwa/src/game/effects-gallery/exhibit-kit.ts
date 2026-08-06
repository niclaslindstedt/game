// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The EFFECTS GALLERY's shared kit: the `Exhibit` shape every shelf builds on,
// the display-case scenario each one is staged from, and the small helpers that
// turn "strike the crowd" or "swing the blade" into the engine events the
// game's own FX pipeline already knows how to draw.
//
// The shelves themselves live beside this file — `effects-catalog.ts` (the
// hand-authored impact / powers / world entries and the assembled catalog) and
// `weapon-exhibits.ts` / `talent-exhibits.ts` (generated from the FX and talent
// catalogs, so they cannot fall behind them).

import { localHero } from "../local-seat.ts";
import {
  activeMechanics,
  enemyDef,
  weaponRangeFor,
  weaponSweepHalfAngle,
  type AbilityLook,
  type BossAbility,
  type BossAbilityId,
  type Difficulty,
  type DriveDirection,
  type DriveEvent,
  type DriveInput,
  type DriveState,
  type Enemy,
  type GameEvent,
  type GameState,
  type ScenarioSpec,
} from "@game/core";

import { type CleaveCut } from "../game-screen/gore-burst.ts";

/** Which shelf of the gallery an exhibit sits on (also a search term). */
export type ExhibitGroup =
  | "IMPACT"
  | "MELEE"
  | "SHOTS"
  | "POWERS"
  | "TALENTS"
  | "BOSSES"
  // THE ELITE TIER — a shelf of its own rather than more rows on BOSSES, and
  // for the reason the tiers are separate at all: these are ten SMALL moves
  // judged against each other (does the ring read at a glance, is the snare
  // obviously not a damage pool), and mixing them in among the arena-eating
  // set pieces would flatter every one of them.
  | "ELITES"
  | "WORLD"
  // THE ROAD — the drive minigame's own collisions, and the ONE shelf whose
  // exhibits are not hosted by a run (see `DriveExhibit`).
  | "DRIVE"
  | "UI";

/**
 * The speeds the gallery can run an exhibit at — the FX iteration loop's
 * slow-motion. A burst that is over in 200 ms is impossible to JUDGE at full
 * speed (the eye gets a smear and an afterimage); at an eighth it plays as a
 * readable sequence of beats, which is what tells "the flash is too long" from
 * "the flash is the wrong colour". The slowdown scales SIM time, so every part
 * of an effect stretches together and the loop's own rhythm (show, beat, replay)
 * stretches with it. The screen-space CSS bursts (the nuke's flash, the ding's
 * god-rays) run on wall-clock animations and keep their real length — they are
 * the one thing slow motion cannot stretch.
 */
export const EXHIBIT_SPEEDS = [1, 0.5, 0.25, 0.125] as const;

export type ExhibitSpeed = (typeof EXHIBIT_SPEEDS)[number];

/** The label a speed wears in the gallery bar and in a screenshot's filename. */
export function speedLabel(speed: number): string {
  return speed === 1 ? "1X" : `1/${Math.round(1 / speed)}X`;
}

/**
 * A LIVE EXHIBIT — the handle the gallery steers whichever host is standing the
 * show up. Both hosts answer it identically (`run-exhibit.ts` for the
 * run-hosted shelves, `drive-exhibit.ts` for the road), which is what lets the
 * gallery's chrome, its keys and the contact-sheet script stay ignorant of
 * which kind of exhibit is on screen.
 */
export type ExhibitRun = {
  /** Re-stage the diorama and run the show again right now, restarting the loop
   * from here (a tap on the field, or Enter). For an always-on exhibit (a
   * talent's conjurations, a running powerup) the re-stage IS the show: the aura
   * is back at full strength. */
  replay: () => void;
  /** Run the diorama at a fraction of real time (see `EXHIBIT_SPEEDS`). Takes
   * effect on the next tick; the show in progress simply keeps playing, slower.
   */
  setSpeed: (speed: number) => void;
  /** Tear the run down (loop, observer, FX timers). */
  stop: () => void;
};

/** What an exhibit's `fire` is handed to put its effect on the screen. */
export type ExhibitCtx = {
  /** The live staged run. */
  state: GameState;
  /**
   * Push a synthetic engine event. It flows through the very consumers a real
   * run uses — the canvas FX, the screen-space CSS bursts, the sound — so the
   * exhibit can never drift from what the game actually draws.
   */
  emit: (event: GameEvent) => void;
  /**
   * Take the mob nearest the hero OFF the field and hand it back. A synthetic
   * KILL must remove the body the engine would have removed, or the corpse
   * effect draws on top of a mob still standing there. Null on an empty stage.
   */
  kill: () => Enemy | null;
  /**
   * Take the mob nearest the hero off the field and open its real DEATH RITE
   * through the engine (`enterBossDeath`). Returns the body it felled, or null
   * on an empty stage.
   *
   * THE ENGINE STAGES IT, and that is the whole point of having this rather
   * than an exhibit that emits the rite's three events by hand. A rite is a
   * PHASE with a three-beat clock, a held horde, a scripted hero and a pose
   * drawn off live scene state — an exhibit that faked the events would show
   * the wreckage and none of the scene, and would go on showing it long after
   * the real rite had been retimed. This way the diorama runs the shipped
   * `stepBossDeath` and can never drift from it, exactly as `emit` keeps the
   * one-shot effects honest.
   */
  fell: () => Enemy | null;
  /** The staged mobs, nearest the hero first. */
  mobs: readonly Enemy[];
  /**
   * Run `beat` `delayMs` later, for an effect that is genuinely a SEQUENCE — a
   * jump's shove-off and the touchdown it ends in are one motion, and an exhibit
   * that fired them together would show neither. Timed on the SIM clock, so
   * slow motion stretches the gap along with everything else; dropped when the
   * show is re-staged, so a pending beat can never land on the next take.
   */
  after: (delayMs: number, beat: () => void) => void;
};

/** What every exhibit carries, whichever host stands it up: how it is named,
 * found, iconed and how long its show lasts. */
export type ExhibitCard = {
  /** Stable id — the search handle, the `?effects=<id>` deep link, the key. */
  id: string;
  /** Shown as the exhibit's title (pixel font, so uppercase). */
  label: string;
  /** One line under the title: what to look at. */
  blurb: string;
  group: ExhibitGroup;
  /**
   * The exhibit's own sprite (an atlas name — see `content/sprites/`), drawn
   * beside its name and on the browse buttons that lead to it, so the catalog
   * reads as a shelf of things rather than a list of strings. Every exhibit has
   * one; `effects_gallery_test.ts` fails the build if a sprite is missing.
   */
  icon: string;
  /** Extra search terms beyond the label/blurb/group words. */
  keywords?: string[];
  /**
   * How long this effect's show LASTS, in ms — the beat before the loop runs it
   * again (and before the PLAY button steps back into the middle of the screen).
   * Sized to the effect itself: a nova ring is over in a third of a second, a
   * nuke rolls smoke for the better part of two. Default 1400.
   */
  showMs?: number;
};

/**
 * AN EXHIBIT HOSTED BY A RUN — the whole gallery bar the road. It is a
 * `GameState` built by `createGame`, posed by a `ScenarioSpec` and stepped by
 * `step()`, with the show fired into its live event stream (`run-exhibit.ts`).
 */
export type RunExhibit = ExhibitCard & {
  /** Which host stands this one up. Absent means the run — the default, so the
   * hundred-odd entries authored before the road existed need no field. */
  kind?: "run";
  /** The level whose ground the effect is staged over. Default `goodco_hq`. */
  levelId?: string;
  /**
   * How the stage is set. Merged over `STAGE_BASE` and re-applied before every
   * replay, so an exhibit that consumes its mobs gets a fresh horde each cycle
   * (`clearEnemies` in the base makes that idempotent instead of a pile-up).
   */
  stage?: ScenarioSpec;
  /**
   * THE CUT THIS EXHIBIT IS OF, pinned over the roll for the length of its show
   * (`pinCleaveCut`) and cleared when the gallery stops, so nothing leaks into
   * the next exhibit or into a real run.
   *
   * Everything about a cleave is rolled, which is the feature and also what
   * makes the rare cuts impossible to LOOK at — an oblique slice comes up about
   * a fifth of the time, so tuning the depth illusion otherwise means replaying
   * until one appears. Pin the ONE axis the exhibit is about and let the rest go
   * on varying: a diorama that showed the same picture every take would
   * misreport a system whose whole point is that it does not.
   */
  cut?: Partial<CleaveCut>;
  /**
   * WALK the hero in a slow circle for the length of the show, instead of
   * leaving him planted in the middle of the diorama. Only for effects that
   * are ABOUT movement and would otherwise show nothing — the ION WAKE lays
   * its burning patches behind a hero who is going somewhere, so a standing
   * exhibit of it is a single pool of fire rather than a wake. The circle's
   * radius is in world px; the hero laps it every `periodMs`.
   */
  walk?: { radius: number; periodMs: number };
  /** Put the effect on the screen. Absent for an exhibit whose staging IS the
   * show — a talent's conjurations, a running powerup, a level's own hazard. */
  fire?: (ctx: ExhibitCtx) => void;
};

/**
 * AN EXHIBIT HOSTED BY THE ROAD — the DRIVE shelf, and the one kind of exhibit
 * that has no `GameState` under it at all.
 *
 * A drive is not a run and deliberately shares nothing with one: no level, no
 * horde, no `step()`, its own clock (`DriveState.ms`) and its own event type
 * (`DriveEvent`). So it gets its own host (`drive-exhibit.ts`), which builds a
 * real road with `createDrive`, plants what the exhibit is ABOUT in front of the
 * bumper, ticks it with `stepDrive` and drains it through the SAME
 * `drainDrive` the minigame's own screen uses — which is what stops the shelf
 * becoming a diorama of what the road used to do.
 *
 * There is no `fire` here on purpose. A collision is not an event an exhibit
 * pushes; it is something the physics has to be driven INTO, so the whole of a
 * drive exhibit's show is what `road` plants and how fast the car meets it.
 */
export type DriveExhibit = ExhibitCard & {
  kind: "drive";
  /** The rung the road is driven on — what the collision WEIGHS
   * (`impactMasses`). Default `medium`, the run around the drive's own default. */
  difficulty?: Difficulty;
  /** Which leg. Default the trip out (nose right along +x). */
  direction?: DriveDirection;
  /** Whether bodies come apart. Default on: "what a body coming apart at 120
   * looks like" is half of what this shelf is for, and the exhibit stands
   * outside the player's gore gate the same way every other gore exhibit in the
   * gallery does. */
  gib?: boolean;
  /**
   * PLANT WHAT THE EXHIBIT IS OF in front of the bumper, and set the speed it
   * should be met at — run once on a fresh road before its first tick.
   *
   * It is the very hook `?drive&stage=body|traffic|both` uses, and for the same
   * reason: waiting for the road to deal you the collision you wanted to look at
   * is a fishing trip, not a review. Everything staged is planted by hand rather
   * than rolled, so the drive's own seeded stream is untouched.
   */
  road?: (drive: DriveState) => void;
  /** What is held on the wheel for the length of the show. Default: flat out,
   * straight ahead — the speed the road is worth judging at. */
  input?: DriveInput;
  /**
   * THE EVENT THIS EXHIBIT EXISTS TO SHOW, and the SOUND BANK the road must pick
   * that event's take from (`drive-sounds.ts` — the light body bank against the
   * heavy one, the scrape against the crunch). Never a single id: which TAKE
   * plays is hashed off where the hit happened, and pinning that would be
   * pinning an arbitrary hash rather than the thing the exhibit is about.
   *
   * They are a CONTRACT rather than documentation:
   * `tests/content/drive_exhibits_test.ts` drives every staging headlessly and
   * fails the build when one stops producing what it advertises. A drive
   * exhibit's whole show is a plant distance and a lateral offset measured
   * against a momentum sum, so a re-tune of the road's masses, its top speed or
   * its sound thresholds can silently turn "taken square" into a glancing thud —
   * and a shelf that showed the wrong shelf would be worse than no shelf at all.
   *
   * Absent for the one exhibit with no collision in it (the ride).
   */
  shows?: DriveEvent["type"];
  bank?: readonly string[];
  /**
   * Run the ENGINE NOTE under this exhibit. Off by default and on for exactly
   * one entry (the ride itself), because the note is a continuous drone and a
   * drone under a 200 ms crunch is the one thing that would stop the crunch
   * being judgeable — which is what this shelf is for.
   */
  engine?: boolean;
};

export type Exhibit = RunExhibit | DriveExhibit;

/** Which host stands this exhibit up. */
export function isDriveExhibit(exhibit: Exhibit): exhibit is DriveExhibit {
  return exhibit.kind === "drive";
}

/**
 * The stage every exhibit starts from — the display-case half of the engine's
 * own scenario system (`src/game/scenario.ts`), which is what makes an exhibit
 * a few lines of data instead of a bespoke harness:
 *
 * - `skipOpening` drops straight into play (no prelude, no monologue);
 * - `freeze` POSES the world — the horde neither moves, strikes, nor fires, so
 *   nothing but the exhibit is happening (the sim clock keeps running, so the
 *   effects themselves still animate);
 * - `clearEnemies` + `stopWaves` leave exactly what the exhibit spawns on the
 *   field, with the spawner silent behind it;
 * - `reveal` lifts the fog off the whole map, so the diorama's rim isn't dark
 *   and no exhibit standing outside the hero's reveal radius is culled;
 * - `muteDialogue` keeps a staged elite's arrival scene from parking the run
 *   (a `dialogue` phase stops the sim, and with it every effect);
 * - `noVictory` stops a boss-less staged field from reading as a cleared
 *   objective and ending the level mid-show;
 * - `hp` tops the hero up on every re-stage, so a live exhibit (an armed hero
 *   among unfrozen foes) can't quietly bleed out between takes.
 *
 * The hero is a capable mid-campaign build (so reach, cone and damage numbers
 * read like real play) with his weapon holstered — an exhibit that wants him to
 * actually swing sets `disarmed: false`.
 */
export const STAGE_BASE: ScenarioSpec = {
  skipOpening: true,
  freeze: true,
  disarmed: true,
  stopWaves: true,
  clearEnemies: true,
  clearDrops: true,
  reveal: true,
  muteDialogue: true,
  noVictory: true,
  hp: Number.MAX_SAFE_INTEGER,
  level: 60,
  stats: {
    stamina: 30,
    strength: 40,
    dexterity: 30,
    // INT widens the melee cone and lengthens a caster's reach, so a healthy
    // helping of it is what makes the swing exhibits sweep a real arc.
    intelligence: 40,
    luck: 10,
  },
};

/** The exhibit's full spec: its own fields over the shared base. */
export function stageSpec(exhibit: RunExhibit): ScenarioSpec {
  return { ...STAGE_BASE, ...exhibit.stage };
}

/** A ring of minions around the hero — the crowd most exhibits need. */
export function horde(
  count: number,
  min = 40,
  max = 130,
  enemy = "intern",
): ScenarioSpec["spawns"] {
  return [{ enemy, count, minDistance: min, maxDistance: max }];
}

/** The hero's own spot, lifted to his airborne height like the engine's own
 * events (a mid-jump effect must not draw at his grounded feet). */
export function heroPos(state: GameState): { x: number; y: number } {
  return {
    x: localHero(state).pos.x,
    y: localHero(state).pos.y - localHero(state).z,
  };
}

/**
 * RESTAGE every elite exhibit in ANOTHER mob's colours (the gallery's
 * `?caster=<enemy id>` deep link, driven by scripts/elite-abilities.mjs).
 *
 * It is a module-level pin rather than a prop threaded through the catalog for
 * the same reason `pinCleaveCut` is: an exhibit's `fire` is authored data, not
 * a component, and there is nothing to thread it through. Like that pin, it is
 * CLEARED when the gallery stops, so it can never reach a real run — a mob
 * casting in somebody else's colours mid-fight would be a genuinely confusing
 * bug to chase.
 *
 * An id that carries no such ability simply yields the neutral kit, which is
 * the honest answer: that mob does not cast this.
 */
let casterOverride: string | undefined;

export function pinEliteCaster(defId: string | undefined): void {
  casterOverride = defId;
}

/**
 * The colour kit `defId` casts `ability` in, read off its OWN authored def.
 *
 * The elite exhibits call this rather than writing the colours out, and that is
 * not tidiness — it is what makes the shelf tell the truth. The whole claim of
 * the elite tier is that a SHARED primitive reads as a different move in a
 * different mob's hands, and an exhibit carrying its own copy of the colours
 * would keep showing the look the author typed here long after the mob's own
 * `look:` had been re-tuned. It also means `?caster=<defId>` can restage any
 * exhibit in any other elite's colours for nothing, which is exactly the
 * comparison the claim needs to be judged on.
 *
 * Falls back to undefined (the renderer's neutral kit) rather than throwing: a
 * gallery that white-screened over a retired id would be worse than one that
 * showed a move in blue.
 */
export function eliteLook(
  defId: string,
  ability: BossAbilityId,
): AbilityLook | undefined {
  try {
    const def = enemyDef(casterOverride ?? defId);
    const list = (activeMechanics({ hp: 1, maxHp: 1 } as Enemy, def)
      ?.abilities ?? []) as BossAbility[];
    return list.find((a) => a.id === ability)?.look;
  } catch {
    return undefined;
  }
}

/** A landed blow on `mob`: the gore splash + the damage number. `bars` is the
 * blow measured in the mob's own full health bars — the BLOOD scales off it,
 * exactly as the kill launch does (see `bloodBlow`), so a staged nick and a
 * staged maiming spray what they would in a real fight. */
export function hitEvent(
  mob: Enemy,
  opts: {
    damage?: number;
    bars?: number;
    crit?: boolean;
    critPower?: number;
  } = {},
): GameEvent {
  return {
    type: "enemyHit",
    pos: { ...mob.pos },
    defId: mob.defId,
    damage: opts.damage ?? Math.round(mob.maxHp * (opts.bars ?? 0.4)),
    maxHp: mob.maxHp,
    crit: opts.crit ?? false,
    critPower: opts.critPower,
    enemyId: mob.id,
  };
}

/** A killing blow on `mob`. `bars` is the blow measured in the mob's own full
 * health bars — the LAUNCH scales off it, a clean 1-bar one-shot throwing the
 * smallest real knock and 3 bars clearing the screen (see corpseLaunch).
 *
 * The staged mob is at FULL health, so the OVERKILL the body coming apart is
 * judged on (`kill-presentation.ts`) is one bar less than `bars`: a cut needs
 * `CLEAVE_BARS + 1` here and a burst `GIB_BARS + 1`. Keeping the two apart is
 * the point — an exhibit that staged its cleave by handing the rule a number
 * straight out would stop being a display case for what the game does. */
export function killEvent(
  mob: Enemy,
  opts: {
    bars?: number;
    xp?: number;
    incinerated?: boolean;
    /** The blow came off an EDGE — the app cuts the body in two along the
     * swing rather than bursting it (game-screen/kill-presentation.ts). */
    edged?: boolean;
  } = {},
): GameEvent {
  return {
    type: "enemyKilled",
    pos: { ...mob.pos },
    defId: mob.defId,
    damage: Math.round(mob.maxHp * (opts.bars ?? 1)),
    maxHp: mob.maxHp,
    hpBefore: mob.hp,
    crit: false,
    xp: opts.xp ?? 120,
    enemyId: mob.id,
    incinerated: opts.incinerated,
    edged: opts.edged,
  };
}

/**
 * The hero's melee swing as the engine reports it: his true reach and his
 * INT-widened cone, so the blade sweeps exactly the arc it would in play, AIMED
 * at the nearest staged mob (and the hero turned into the blow, so the blade
 * sprite and its slash are drawn on the side the crowd is standing).
 */
export function swingEvent(ctx: ExhibitCtx): GameEvent {
  const { state } = ctx;
  const weapon = localHero(state).equipment.weapon;
  const hero = heroPos(state);
  const target = ctx.mobs[0];
  const to = target
    ? { x: target.pos.x - hero.x, y: target.pos.y - hero.y }
    : { x: localHero(state).faceLeft ? -1 : 1, y: 0 };
  const len = Math.hypot(to.x, to.y) || 1;
  const dir = { x: to.x / len, y: to.y / len };
  localHero(state).faceLeft = dir.x < 0;
  return {
    type: "swing",
    pos: hero,
    dir,
    range: weaponRangeFor(state, localHero(state), weapon),
    arc: 2 * weaponSweepHalfAngle(state, localHero(state), weapon),
    targets: ctx.mobs.length,
  };
}

/** Strike the `count` mobs nearest the hero — the blows a swing/blast lands. */
export function strike(
  ctx: ExhibitCtx,
  count: number,
  opts: Parameters<typeof hitEvent>[1] = {},
): void {
  for (const mob of ctx.mobs.slice(0, count)) ctx.emit(hitEvent(mob, opts));
}

/** The staged mobs, nearest the hero first (apparitions left out — they are
 * scene figures, not targets). */
export function sortedMobs(state: GameState): Enemy[] {
  const hero = localHero(state).pos;
  const dist = (mob: Enemy) =>
    (mob.pos.x - hero.x) ** 2 + (mob.pos.y - hero.y) ** 2;
  return [...state.enemies]
    .filter((mob) => !enemyDef(mob.defId).apparition)
    .sort((a, b) => dist(a) - dist(b));
}
