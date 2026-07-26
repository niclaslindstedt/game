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

import {
  enemyDef,
  weaponRangeFor,
  weaponSweepHalfAngle,
  type Enemy,
  type GameEvent,
  type GameState,
  type ScenarioSpec,
} from "@game/core";

/** Which shelf of the gallery an exhibit sits on (also a search term). */
export type ExhibitGroup =
  "IMPACT" | "MELEE" | "SHOTS" | "POWERS" | "TALENTS" | "WORLD" | "UI";

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
  /** The staged mobs, nearest the hero first. */
  mobs: readonly Enemy[];
};

export type Exhibit = {
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
  /** The level whose ground the effect is staged over. Default `spacez_hq`. */
  levelId?: string;
  /**
   * How the stage is set. Merged over `STAGE_BASE` and re-applied before every
   * replay, so an exhibit that consumes its mobs gets a fresh horde each cycle
   * (`clearEnemies` in the base makes that idempotent instead of a pile-up).
   */
  stage?: ScenarioSpec;
  /**
   * How long this effect's show LASTS, in ms — the beat before the loop runs it
   * again (and before the PLAY button steps back into the middle of the screen).
   * Sized to the effect itself: a nova ring is over in a third of a second, a
   * nuke rolls smoke for the better part of two. Default 1400.
   */
  showMs?: number;
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
export function stageSpec(exhibit: Exhibit): ScenarioSpec {
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
    x: state.player.pos.x,
    y: state.player.pos.y - state.player.z,
  };
}

/** A landed blow on `mob`: the gore splash + the damage number. */
export function hitEvent(
  mob: Enemy,
  opts: { damage?: number; crit?: boolean; critPower?: number } = {},
): GameEvent {
  return {
    type: "enemyHit",
    pos: { ...mob.pos },
    defId: mob.defId,
    damage: opts.damage ?? Math.round(mob.maxHp * 0.4),
    crit: opts.crit ?? false,
    critPower: opts.critPower,
    enemyId: mob.id,
  };
}

/** A killing blow on `mob`. `overkillBars` is the blow measured in the mob's
 * own full health bars — past 1 the corpse is LAUNCHED (see corpseLaunch). */
export function killEvent(
  mob: Enemy,
  opts: { overkillBars?: number; xp?: number; incinerated?: boolean } = {},
): GameEvent {
  return {
    type: "enemyKilled",
    pos: { ...mob.pos },
    defId: mob.defId,
    damage: Math.round(mob.maxHp * (opts.overkillBars ?? 1)),
    maxHp: mob.maxHp,
    crit: false,
    xp: opts.xp ?? 120,
    enemyId: mob.id,
    incinerated: opts.incinerated,
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
  const weapon = state.player.equipment.weapon;
  const hero = heroPos(state);
  const target = ctx.mobs[0];
  const to = target
    ? { x: target.pos.x - hero.x, y: target.pos.y - hero.y }
    : { x: state.player.faceLeft ? -1 : 1, y: 0 };
  const len = Math.hypot(to.x, to.y) || 1;
  const dir = { x: to.x / len, y: to.y / len };
  state.player.faceLeft = dir.x < 0;
  return {
    type: "swing",
    pos: hero,
    dir,
    range: weaponRangeFor(state, weapon),
    arc: 2 * weaponSweepHalfAngle(state, weapon),
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
  const hero = state.player.pos;
  const dist = (mob: Enemy) =>
    (mob.pos.x - hero.x) ** 2 + (mob.pos.y - hero.y) ** 2;
  return [...state.enemies]
    .filter((mob) => !enemyDef(mob.defId).apparition)
    .sort((a, b) => dist(a) - dist(b));
}
