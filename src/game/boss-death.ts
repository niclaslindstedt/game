// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS DEATH RITE — the scripted send-off played over a boss the moment it
// falls, before its last words. The mirror image of `death-scene.ts`: there the
// horde gathers over the fallen hero, here the hero stands over the fallen
// boss, and the two are deliberately built to the same shape — the engine owns
// the choreography and the timer, the app owns the picture, and a press past a
// grace window skips it.
//
// WHY A BOSS NEEDED ONE. A boss is exempt from the gore ladder
// (`game-screen/overkill.ts` — `if (role === "boss") return null`), and that
// exemption is right: a boss has last words to say over its own body, and that
// corpse stays on the field for the rest of the level as the landmark of the
// fight. Bursting one deletes both. But the exemption is also the whole reason
// eleven bosses died exactly like a moon rat with more hp — a sprite fell over,
// a text box opened, five seconds passed. THE RITE IS THE THING THE LADDER
// CANNOT EXPRESS: a scripted beat that runs BETWEEN the killing blow and the
// last words, and whose aftermath BECOMES the landmark. So the exemption stays
// exactly as it is; nothing here is on the ladder.
//
// THE THREE BEATS, and the orchestrator owns two of them — the same division
// that makes a boss ABILITY learnable (`mechanics/`, TELL → CAST → RESOLVE),
// inverted into an ending:
//
//   STAGGER    the boss is on its knees and NOT YET DEAD. The horde is held off
//              the ring, sim time dilates hard, the camera leans in. This beat
//              is what makes the execution read as a decision rather than as a
//              glitch, which is why no rite may skip it.
//   EXECUTION  the hero's scripted approach and the blow. He travels on the
//              REAL jump system, so the takeoff and landing dust, the
//              floor-coloured puff and the squash-and-stretch on the doll all
//              come along without this module knowing they exist.
//   AFTERMATH  what is left settles, the horde is released, and the last words
//              open over the wreck.
//
// TIME IS DILATED, AND THERE ARE TWO CLOCKS. The rite runs the sim at
// `BOSS_DEATH.timeScale` so the held horde, the hero's approach and the app's
// effect layer all stretch together — but `scene.ms` advances at WALL rate, so
// the beats are the real milliseconds the catalog authored and every rite is
// the same length of real time. Driving both off one clock makes every rite
// eight times longer than it reads, and is the easiest mistake here to make.
//
// THE GORE GATE IS NOT ASKED HERE, AND THAT IS DELIBERATE. The choreography is
// identical whether or not the player has blood switched on — the hero leaps,
// the boss dies, the beats run the same length — and it is only what is LEFT on
// the floor that is mature content. So the rite states its INTENT on
// `bossRiteStruck` and the app asks the gore gate (`gore-gate.ts` — the device's
// MATURE CONTENT switch, the family's own GORE row, whether that KIND of
// dismemberment is permitted, and the developer BLOOD amount) when it reads the
// event, downgrading the remains to an ordinary
// punt-and-topple corpse when the answer is no. Gating the CHOREOGRAPHY instead
// would make a censored boss simply cease to exist, which is the exact failure
// the incinerate gate is shaped to avoid.
//
// IT IS A GLOBAL PHASE AND MUST STAY ONE. The per-player screen split turns
// the eleven per-player UI phases into `Player.screen`s but keeps the GROUP
// beats — a boss's arrival dialogue, a cutscene — global: played for everyone,
// advanced by anyone, world frozen for the beat. A boss's death is that same
// kind of beat. Making it a per-player screen would leave half the party
// watching a finisher while the other half kept fighting, which is neither.

import { clamp, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";

import { BOSS_DEATH } from "./config/index.ts";
import { deathRite, riteFor } from "./death-rites/catalog.ts";
import type { DeathRiteBeat, DeathRiteDef } from "./death-rites/types.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { inertEnemy } from "./disposition.ts";
import { heroAt, heroInPlay, seatOf } from "./party.ts";
import { separateEnemies } from "./step/enemies.ts";
import {
  maybeCapThought,
  maybeFirstKillThought,
  startDeathWords,
} from "./story.ts";
import type { Enemy, GameState, Player } from "./types/index.ts";

/**
 * WHICH HERO is performing the running rite — the seat whose killing blow
 * felled the boss (`BossDeathState.executioner`, stamped by `enterBossDeath`).
 * One site rather than a bare seat read at every caller, and it falls back to
 * seat 0 for a scene with no seat (a thawed legacy state) or a killer who is
 * no longer in play — the finisher must not be performed by a body nobody is
 * behind, and the rite always needs somebody to animate.
 */
export function bossDeathExecutioner(state: GameState): Player {
  const hero = heroAt(state, state.bossDeath?.executioner ?? 0);
  return hero && heroInPlay(hero) ? hero : state.players[0];
}

/** The beat boundaries of a rite, in ms from the killing blow. */
function beats(def: DeathRiteDef): {
  stagger: number;
  act: number;
  total: number;
} {
  // ADDITIVE over the config floors, never a replacement: a rite may take
  // longer over its execution, never skip the stagger that makes the execution
  // legible. Same rule `windupFloorMs` follows on a boss ability.
  const stagger = BOSS_DEATH.staggerMs + Math.max(0, def.staggerMs ?? 0);
  const act = stagger + BOSS_DEATH.actMs + Math.max(0, def.actMs ?? 0);
  const total =
    act + BOSS_DEATH.aftermathMs + Math.max(0, def.aftermathMs ?? 0);
  return { stagger, act, total };
}

/** Which beat `ms` falls in, and how far through it (0..1). */
function beatAt(
  def: DeathRiteDef,
  ms: number,
): { beat: DeathRiteBeat; t: number } {
  const b = beats(def);
  if (ms < b.stagger) return { beat: "stagger", t: ms / b.stagger };
  if (ms < b.act) {
    return {
      beat: "act",
      t: (ms - b.stagger) / (b.act - b.stagger),
    };
  }
  return {
    beat: "aftermath",
    t: clamp((ms - b.act) / (b.total - b.act), 0, 1),
  };
}

/** How long the whole rite runs (ms) — what the app's camera curve reads. */
export function bossRiteDurationMs(riteId: string | undefined): number {
  return beats(deathRite(riteId)).total;
}

/**
 * The boss fell: open the rite.
 *
 * Called from the kill path (`loot.ts`) once the body is already off the board,
 * so it carries only what the scene needs to pose it. The `bossDefeated` event
 * and the last words are deliberately NOT fired here — they belong at the END
 * of the rite, over the wreck, which is what the whole beat exists to put them
 * on top of. `executioner` is the hero whose blow felled the boss (the kill
 * path passes its attacker) — that seat performs the finisher; unnamed, seat 0
 * does, which solo is the same hero.
 */
export function enterBossDeath(
  state: GameState,
  enemy: Enemy,
  riteId: string | undefined,
  executioner?: Player,
): void {
  const player = executioner ?? state.players[0];
  // The ENDING decides which rite this is, not the authored id alone — see
  // `riteFor`. A fleeing boss that named nothing used to get the death default
  // and stage a finisher for a mob that was supposed to run.
  const def = riteFor(riteId, enemyDef(enemy.defId).flees !== undefined);
  const heading = Math.atan2(
    enemy.pos.y - player.pos.y,
    enemy.pos.x - player.pos.x,
  );
  // A FLIGHT tears its exit open AWAY FROM THE HERO — straight down the bearing
  // the blow came along. Running past the man who just beat him would be a
  // different scene entirely, and a funnier one than the joke can carry.
  const exit = def.flight
    ? {
        x: enemy.pos.x + Math.cos(heading) * (def.exitDistance ?? 96),
        y: enemy.pos.y + Math.sin(heading) * (def.exitDistance ?? 96),
      }
    : null;
  state.phase = "bossDeath";
  state.bossDeath = {
    ms: 0,
    beat: "stagger",
    rite: def.id,
    kind: def.flight ? "flight" : "death",
    defId: enemy.defId,
    sprite: enemyDef(enemy.defId).sprite,
    center: { ...enemy.pos },
    bossPos: { ...enemy.pos },
    exit,
    // The collision radius lives on the DEF, not the actor — the body is
    // already spliced out of `state.enemies` by the time we are called, so this
    // is the only place left to read it from anyway.
    radius: enemyDef(enemy.defId).radius,
    executioner: seatOf(state, player),
    from: { ...player.pos },
    heading,
    skip: false,
  };
  // The hero stops steering the instant the rite opens — he is being animated
  // from here, and a held pointer would otherwise fight the scripted approach
  // for the whole beat.
  player.moving = false;
  state.events.push({
    type: "bossRiteBegan",
    pos: { ...enemy.pos },
    defId: enemy.defId,
    rite: deathRite(riteId).id,
    heading,
  });
}

/**
 * One tick of the rite (run while `phase === "bossDeath"`, from the step
 * pipeline ahead of the `playing` gate — exactly where `stepDeathScene` sits).
 */
export function stepBossDeath(state: GameState, dtMs: number): void {
  const scene = state.bossDeath;
  if (!scene) {
    // Defensive: a `bossDeath` phase with no scene (a thawed or legacy state)
    // hands straight over rather than hanging the run.
    finishBossDeath(state);
    return;
  }
  const def = deathRite(scene.rite);
  const b = beats(def);

  // THE SCENE'S OWN CLOCK RUNS AT WALL RATE — see the header. Only the world
  // below it is dilated.
  scene.ms += dtMs;
  if (scene.skip || scene.ms >= b.total) {
    // A skip still pays out the beat's one irreversible moment: the wreckage is
    // the level's landmark and the exit is the fiction's, so getting on with it
    // must never leave a boss that was neither finished nor gone.
    if (scene.beat !== "aftermath") resolve(state, scene.ms, def);
    finishBossDeath(state);
    return;
  }

  const { beat, t } = beatAt(def, scene.ms);
  if (beat !== scene.beat) {
    scene.beat = beat;
    // THE EXIT IS TORN OPEN AS THE BOLT STARTS, not before: the landmark
    // appearing during the stagger would tell the player where he is going
    // before he has decided to run, which is the one beat that has to read as
    // panic rather than as a plan.
    if (beat === "act" && scene.kind === "flight") openExit(state, def);
    else if (beat === "aftermath") resolve(state, scene.ms, def);
  }

  // THE DILATED WORLD. Everything below this line steps on scaled time, so the
  // held horde, the hero's approach and the coward's bolt all stretch with the
  // app's effect layer.
  const dt = (dtMs * BOSS_DEATH.timeScale) / 1000;
  holdHorde(state, scene.center, dt);
  if (scene.kind === "flight") moveFugitive(state, def);
  else moveExecutioner(state, def, dt);
  def.step?.(
    { state, beat, t, center: scene.center },
    dtMs * BOSS_DEATH.timeScale,
  );
  separateEnemies(state);
}

/**
 * THE COWARD'S BOLT: the boss runs from where it was beaten to the mouth of the
 * exit it just tore open, arriving exactly as the act beat ends — then, through
 * the aftermath, it is DRAWN IN and spun out of existence.
 *
 * Positional rather than velocity-driven for the same reason the hero's
 * approach is: the beat has to land on the exit at a known moment, and a chase
 * that merely aims at a point arrives whenever its speed says it does.
 */
function moveFugitive(state: GameState, def: DeathRiteDef): void {
  const scene = state.bossDeath;
  if (!scene || !scene.exit) return;
  const b = beats(def);
  const t = clamp(
    (scene.ms - b.stagger) / Math.max(1, b.act - b.stagger),
    0,
    1,
  );
  // EASE-IN, the opposite of the hero's ease-out: he breaks into the run rather
  // than starting at a sprint, which is what makes it read as a decision to
  // bolt rather than as a shove.
  const e = t * t;
  scene.bossPos.x = scene.center.x + (scene.exit.x - scene.center.x) * e;
  scene.bossPos.y = scene.center.y + (scene.exit.y - scene.center.y) * e;
}

/**
 * The exit tears open where the coward is headed. It is a REAL landmark on the
 * run (`state.landmarks`), not an effect, because it outlives the scene — the
 * map remembers where he went, and the player can walk to it afterwards. That
 * is what the flee path already did; the rite only changes WHEN it appears.
 */
function openExit(state: GameState, def: DeathRiteDef): void {
  const scene = state.bossDeath;
  if (!scene || !scene.exit) return;
  const landmark = enemyDef(scene.defId).flees?.landmark;
  if (!landmark) return;
  state.landmarks.push({
    kind: landmark,
    sprite: landmark,
    anchor: "center",
    pos: { ...scene.exit },
  });
  state.events.push({
    type: "bossRiteExitOpened",
    pos: { ...scene.exit },
    defId: scene.defId,
    rite: scene.rite,
    spin: def.spin ?? 4,
  });
}

/**
 * The beat's irreversible moment — the blow on a death rite, the vanishing on a
 * flight one.
 *
 * On a DEATH it states the rite's INTENT and lets the app build the wreckage
 * through the gore machinery it already has; the gate is the app's (see the
 * header and `bossRiteStruck`). On a FLIGHT there is nothing to gate and
 * nothing left behind: he is simply gone, and the event is the twirl.
 */
function resolve(state: GameState, ms: number, def: DeathRiteDef): void {
  const scene = state.bossDeath;
  if (!scene) return;
  // THE HERO'S LINE, over the blow itself (or over the coward going through his
  // own exit). A BARK — it floats and play never stops — because a line whose
  // job is to land ON a moment must not be a box the player taps through after
  // it. Rides the same event a boss's ability bark does, pinned to the HERO
  // rather than to the speaker's own body, which for a flight is the one thing
  // still standing on the field.
  const bark = enemyDef(scene.defId).deathBark;
  if (bark && bark.length > 0 && !state.dialogueMuted) {
    state.events.push({
      type: "bossBark",
      pos: { ...bossDeathExecutioner(state).pos },
      defId: scene.defId,
      lines: bark,
    });
  }
  if (scene.kind === "flight") {
    state.events.push({
      type: "bossRiteVanished",
      pos: { ...(scene.exit ?? scene.center) },
      defId: scene.defId,
      rite: scene.rite,
      spin: def.spin ?? 4,
    });
    return;
  }
  state.events.push({
    type: "bossRiteStruck",
    pos: { ...scene.center },
    defId: scene.defId,
    rite: scene.rite,
    remains: def.remains ?? "cleave",
    heading: scene.heading,
    force: def.force ?? 5,
    // Derived from the scene rather than drawn from `state.rng`: the drop
    // ladder's stream is load-bearing (seeded runs, the simulator's A/B, every
    // `rollEquipment`), and a presentational seed that consumed a draw would
    // shift every roll after it. Same rule the loot toss's scatter follows.
    seed:
      Math.floor(Math.abs(scene.center.x * 31 + scene.center.y * 17 + ms)) %
      997,
  });
}

/**
 * Close the rite: leave the wreck as the level's landmark, announce the win,
 * and hand the stage to the boss's last words.
 *
 * THE ORDER HERE IS THE WHOLE POINT OF THE FEATURE. `bossDefeated` and
 * `startDeathWords` used to fire in `killEnemy`, on the same tick as the blow;
 * they now fire over the wreckage the rite left, which is what the beat exists
 * to put them on top of.
 */
function finishBossDeath(state: GameState): void {
  const scene = state.bossDeath;
  state.bossDeath = null;
  // Back to `playing` first, so `startDeathWords` can raise the dialogue over
  // it exactly as it does from an ordinary kill — it yields to any scene
  // already on stage, and `bossDeath` would have looked like one.
  state.phase = "playing";
  if (!scene) return;

  const def = enemyDef(scene.defId);
  state.events.push({
    type: "bossRiteEnded",
    pos: { ...scene.center },
    defId: scene.defId,
    rite: scene.rite,
  });
  if (scene.kind === "flight") {
    // A COWARD LEAVES NOTHING. No corpse to tap, and `bossFled` rather than
    // `bossDefeated` — the app plays the escape as a warp rather than a win,
    // which is the distinction that event was split out to carry in the first
    // place. The exit landmark is already on the map (`openExit`).
    state.events.push({
      type: "bossFled",
      pos: { ...(scene.exit ?? scene.center) },
      defId: scene.defId,
    });
  } else {
    // The landmark: where the fight ended, tapped to re-open the victory menu
    // once the player has chosen to STAY. What is actually DRAWN there is
    // whatever the rite left (the app's `bossRiteStruck` remains); this is the
    // engine's record of the spot.
    state.bossCorpse = { pos: { ...scene.center }, sprite: def.sprite };
    state.events.push({ type: "bossDefeated", pos: { ...scene.center } });
  }
  // The kill path's three scene-raisers, deferred wholesale to here and run in
  // their original order so the rite changes WHEN they happen and nothing else.
  // Each yields to whatever the one before it put on stage, exactly as they do
  // on an ordinary kill.
  startDeathWords(state, scene.defId);
  maybeFirstKillThought(state, def.id, runLevelDef(state).firstKillThoughts);
  maybeCapThought(state);
}

/**
 * A press ends the rite early — latched rather than acted on, so the skip lands
 * on a tick boundary like every other scene's does.
 *
 * The grace window is why this is a function rather than a field write: the
 * boss dies mid-fight with a finger already pressed and a hand on the keys, so
 * without it the press that was steering throws the rite away and nobody ever
 * sees one. Same reason `DEATH_SCENE.skipGraceMs` exists.
 */
export function skipBossDeath(state: GameState): void {
  const scene = state.bossDeath;
  if (!scene || scene.ms < BOSS_DEATH.skipGraceMs) return;
  scene.skip = true;
}

/**
 * Hold the horde off the ring: anything inside it backs away to the rim and
 * stands. The inverse of the death scene's `gatherHorde`, and it exists for the
 * same reason — a finisher played behind six minions crowding the camera is a
 * finisher nobody sees.
 *
 * Nothing is spawned and nothing is killed: the fight resumes exactly as it
 * stood, one ring wider.
 */
function holdHorde(state: GameState, center: Vec2, dt: number): void {
  for (const enemy of state.enemies) {
    // A bystander is not part of the fight and is not choreographed by it —
    // the same predicate every damage pass and target search already asks.
    if (inertEnemy(enemy)) continue;
    const d = distance(enemy.pos, center);
    if (d >= BOSS_DEATH.ringRadius) continue;
    // Straight out along its own bearing from the centre, so the ring opens
    // evenly rather than everything sliding round to one side.
    const bearing =
      d > 0.001
        ? Math.atan2(enemy.pos.y - center.y, enemy.pos.x - center.x)
        : // Dead centre: pick a bearing off its own id so the tie is broken
          // deterministically rather than by an rng draw.
          (enemy.id % 360) * (Math.PI / 180);
    const rim = {
      x: center.x + Math.cos(bearing) * BOSS_DEATH.ringRadius,
      y: center.y + Math.sin(bearing) * BOSS_DEATH.ringRadius,
    };
    moveToward(enemy.pos, rim, BOSS_DEATH.yieldSpeed * dt);
  }
}

/**
 * The executioner's scripted approach: from where he stood when the blow landed
 * to his standoff over the body, arriving exactly as the execution beat ends.
 *
 * He is MOVED, not teleported, and the move is real `player.pos` — which is why
 * this lives in the engine at all (the camera, the minimap, the pointer's
 * hit-testing and the autopilot all read it). A LEAP additionally rides the
 * existing jump arc, so the dust at both ends and the squash-and-stretch on the
 * doll come along for free.
 */
function moveExecutioner(
  state: GameState,
  def: DeathRiteDef,
  dt: number,
): void {
  const scene = state.bossDeath;
  if (!scene || (def.approach ?? "leap") === "hold") return;
  const player = bossDeathExecutioner(state);
  const b = beats(def);
  // The approach occupies the execution beat alone; before it he stands and
  // reads the thing on its knees, after it he is already there.
  const span = b.act - b.stagger;
  const t = clamp((scene.ms - b.stagger) / Math.max(1, span), 0, 1);
  const standoff = (def.standoff ?? 0.45) * Math.max(1, scene.radius);
  const target = {
    x: scene.center.x - Math.cos(scene.heading) * standoff,
    y: scene.center.y - Math.sin(scene.heading) * standoff,
  };
  // Ease-out: he leaves fast and settles, rather than sliding at a constant
  // rate into the blow.
  const e = 1 - (1 - t) * (1 - t);
  player.pos.x = scene.from.x + (target.x - scene.from.x) * e;
  player.pos.y = scene.from.y + (target.y - scene.from.y) * e;
  // `facing` is a UNIT VECTOR, not an angle — it drives the sprite's side, and
  // writing a radian into it points the hero at a nonsense bearing that the
  // renderer then normalizes into something arbitrary.
  player.facing = { x: Math.cos(scene.heading), y: Math.sin(scene.heading) };
  if ((def.approach ?? "leap") === "leap") {
    // A real arc on the real jump field, so `render/dust.ts` and the doll's
    // squash read it exactly as they read a player jump. Peaks mid-approach.
    player.z = Math.sin(t * Math.PI) * LEAP_HEIGHT_PX;
  }
  // Keeps the walk cycle from stepping through a leap: he is airborne, or he is
  // being carried, and either way he is not taking strides.
  player.moving = false;
  void dt;
}

/** How high the executioner's leap arcs (world px) — read against the ~195-unit
 * phone viewport, so it is plainly a vault rather than a hop and still leaves
 * the boss visible underneath him at the top of it. */
const LEAP_HEIGHT_PX = 26;
