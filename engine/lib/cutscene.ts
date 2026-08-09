// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A tiny declarative cutscene player, generic enough for any game: a scene
// is a stage (backdrop + props), a cast of actors, and a sequential list of
// beats (captions, dialogue, walks, poses, fades). Motion beats run on the
// step clock; text beats hold until the player advances them. The player is a
// pure state machine — `stepCutscene(state, def, dtMs)` advances it with no
// wall clock, DOM, or randomness, so scenes are unit-testable headlessly and
// replay identically. Rendering is the caller's job: it reads the actors,
// the fade level, and `currentLine()` each frame and draws them however it
// likes.

import { distance, moveToward, type Vec2 } from "./vec.ts";

/**
 * A static prop on the stage (a couch, a door…). Purely visual. Props ride
 * the stage's camera shift (`CutsceneState.shift`, fed by `drift` and `pan`
 * beats) scaled by their `parallax` depth — 1 (default) moves with the
 * ground, 0 is pinned to the sky — and a `wrap` prop re-enters from the
 * opposite edge instead of scrolling off (star fields under a long drift).
 */
export type CutsceneProp = {
  kind: string;
  pos: Vec2;
  /**
   * A handle a `prop` beat addresses this piece by — the wall weapon the
   * hero takes down. Optional: dressing nothing ever touches needs no name.
   */
  id?: string;
  /** Camera-shift multiplier: 1 = foreground (default), 0 = infinitely far. */
  parallax?: number;
  /** Wrap around the stage horizontally instead of leaving it. */
  wrap?: boolean;
  /**
   * Art that LIES ON THE GROUND (paving, a road, a painted marking) rather
   * than standing on it. Ground props are painted with the floor, under
   * everything in the standing queue — because a slab is anchored at its NEAR
   * edge, which would otherwise sort it in front of every actor standing on
   * it and paint over their feet.
   */
  ground?: boolean;
  /**
   * Start OFF the stage, for a `prop` beat to bring on — the actor's `hidden`
   * for dressing. It is what makes a prop SWAP: the two states of one thing
   * (a shut door and the open doorway behind it) are two props at one mark,
   * one of them hidden, and the beat that opens the door hides the first and
   * shows the second. Needs a `label`, or nothing can ever show it.
   */
  hidden?: boolean;
};

/**
 * The flat-color palette a scene's backdrop paints with. Data, not code, so
 * the renderer never hardcodes per-scene colors — a scene carries its own.
 */
export type CutsceneBackdrop = {
  wall: string;
  floor: string;
  trim: string;
  /** Floor line in world-px from the top; omitted = 65% of stage height. */
  floorY?: number;
};

/** The fixed backdrop and dressing a scene plays out on. */
export type CutsceneStage = {
  /** Stage size in world px — the renderer letterboxes/centers it. */
  width: number;
  height: number;
  /** Backdrop key for the renderer ("livingRoom", "lab", …). */
  backdrop: string;
  /** Backdrop colors the renderer paints; omitted = the renderer's default. */
  palette?: CutsceneBackdrop;
  props: CutsceneProp[];
  /**
   * Constant camera velocity in world px/s, accumulated into
   * `CutsceneState.shift` for the whole scene — the space transits stream
   * their star props past the ship with this (parallax makes the depths).
   * Runs UNDER the beat timeline, so the world keeps moving through held
   * dialogue. Omitted = a static camera.
   */
  drift?: Vec2;
};

export type CutsceneActorDef = {
  id: string;
  /** Sprite key the renderer draws (poses swap it mid-scene). */
  sprite: string;
  /** Display name shown over this actor's speech ("ADA", or "{HERO}" for the
   * player's own character — see `engine/game/hero-name.ts`); omitted = the id
   * upper-cased. */
  name?: string;
  at: Vec2;
  /** Which way the sprite mirrors initially (walks update it). */
  faceLeft?: boolean;
  /** Start off-stage; an `enter` beat brings the actor on. */
  hidden?: boolean;
};

/**
 * One step of the scene's timeline. Beats run strictly in order; each beat
 * finishes before the next starts. Timed beats can be cut short by
 * `advanceCutsceneBeat` (the player's tap); text beats have no timer at all —
 * they hold the frame until that tap, JRPG-style, so the player reads at
 * their own pace and the scene idles between clicks.
 */
export type CutsceneBeat =
  /** Hold the frame. */
  | { kind: "wait"; ms: number }
  /** Narrator text, no speaker ("TWO HOURS LATER."). One entry per line.
   *  Holds until the player advances the beat. */
  | { kind: "caption"; text: string[] }
  /** A speech bubble anchored to an actor. One entry per line.
   *  Holds until the player advances the beat. */
  | { kind: "say"; actor: string; text: string[] }
  /** Walk an actor to a point at `speed` world px/s (facing follows). */
  | { kind: "move"; actor: string; to: Vec2; speed: number }
  /** Swap an actor's sprite (sitting → standing…). Instant. */
  | { kind: "pose"; actor: string; sprite: string }
  /** Mirror an actor without moving. Instant. */
  | { kind: "face"; actor: string; faceLeft: boolean }
  /**
   * Leave the ground and come back down: ease the actor's `lift` (world px
   * above the mark it stands on) to `lift` over `ms`, ballistically — a rise
   * decelerates into its apex, a fall accelerates out of it. A whole leap is
   * therefore TWO beats, up and down, and whatever the jump was for (taking a
   * thing off a wall) settles between them, at the apex, in one frame.
   *
   * A lift is HEIGHT, not depth: it moves the actor up the frame without
   * touching `pos`, so a jump never re-sorts the actor through the furniture
   * it is standing in front of.
   */
  | { kind: "jump"; actor: string; lift: number; ms: number }
  /**
   * Put something in an actor's hands, or take it away (`sprite` omitted).
   * `at` offsets the held sprite from the ACTOR SPRITE'S OWN top-left, so it
   * is authored against the body plan exactly the way the hero's paper doll
   * anchors his weapon, and it mirrors with the actor. Instant.
   */
  | { kind: "hold"; actor: string; sprite?: string; at?: Vec2 }
  /**
   * Show or hide a stage prop by its `id` — the wall weapon leaving the wall
   * the moment the hero closes his hand on it. Instant.
   */
  | { kind: "prop"; prop: string; hidden: boolean }
  /**
   * Make a NOISE: queue a sound for whoever is playing the scene to fire —
   * the door the hero opens on his way out. Instant, and the player is the
   * one who knows what a sound id means: the scene only names it, and
   * `CutsceneState.sounds` is the queue the host drains (an id nothing
   * answers to is silence, never a throw).
   */
  | { kind: "sound"; sound: string }
  /** Pop an actor onto / off the stage. Instant. */
  | { kind: "enter"; actor: string }
  | { kind: "exit"; actor: string }
  /** Fade the whole frame toward `to` (0 = clear, 1 = black) over `ms`. */
  | { kind: "fade"; to: number; ms: number }
  /**
   * Glide the camera `by` world px over `ms` (adds to the running shift;
   * props follow scaled by their parallax, actors stay screen-pinned). The
   * launch's ascent: pan the world down and the pad falls away under the
   * climbing ship.
   */
  | { kind: "pan"; by: Vec2; ms: number }
  /** Set an actor's tremble amplitude in world px (0 stops it). Instant —
   *  the rumble runs under later beats until switched off. */
  | { kind: "shake"; actor: string; amp: number };

export type CutsceneDef = {
  id: string;
  stage: CutsceneStage;
  actors: CutsceneActorDef[];
  beats: CutsceneBeat[];
};

/** Something in an actor's hands, drawn over the body (a `hold` beat). */
export type CutsceneHold = {
  sprite: string;
  /** Offset from the actor sprite's own top-left; mirrors with the actor. */
  at: Vec2;
};

/** A live actor: def snapshot + where the scene has moved it so far. */
export type CutsceneActor = {
  id: string;
  sprite: string;
  pos: Vec2;
  faceLeft: boolean;
  hidden: boolean;
  /** True while a `move` beat is walking this actor (drives walk frames). */
  moving: boolean;
  /** Tremble amplitude in world px (a `shake` beat sets it; 0 = still). */
  shake: number;
  /**
   * How long this actor has held its current `sprite` (ms), reset by every
   * `pose`. It is the clock a POSE-DRIVEN effect runs on: a renderer that
   * draws something around an actor because of what it is wearing — the launch
   * ship's engine lighting, and the fire and smoke that boil off the pad from
   * the moment it does — has to know how long ago it started, and asking the
   * WALL clock would make the effect play differently on a replay.
   *
   * It is on the actor rather than the scene because two actors can be posed
   * at different moments and each is answering for itself.
   */
  poseMs: number;
  /** World px above the mark, off the ground (a `jump` beat drives it). The
   * renderer lifts the drawing by it and sorts by `pos` regardless. */
  lift: number;
  /** What this actor is carrying, or null for empty hands. */
  holding: CutsceneHold | null;
};

export type CutsceneState = {
  /** Key into the caller's cutscene catalog. */
  defId: string;
  actors: CutsceneActor[];
  /** Index of the running beat; === def.beats.length when the scene ended. */
  beat: number;
  /** Elapsed ms inside the running beat. */
  beatMs: number;
  /** Total ms the scene has played (drives the renderer's shake wobble). */
  timeMs: number;
  /** Current darkness, 0 (clear) to 1 (black). */
  fade: number;
  /** Fade level when the running fade beat started (interpolation base). */
  fadeFrom: number;
  /** The jumping actor's lift when the running jump beat started (its
   * interpolation base — the peer of `fadeFrom`). */
  liftFrom: number;
  /** Ids of the props off the stage — the ones authored `hidden`, plus
   * whatever a `prop` beat has since taken off (and minus what it put back). */
  hiddenProps: string[];
  /**
   * Sounds a `sound` beat has queued, oldest first, for the host to fire and
   * EMPTY. The scene state carries them rather than a callback so stepping
   * stays pure: the run drains them into events on the same tick, and a scene
   * nobody drains just holds a short list of strings.
   */
  sounds: string[];
  /**
   * The camera's accumulated shift in world px (stage `drift` + `pan`
   * beats). The renderer offsets each prop by `shift × its parallax`;
   * actors are screen-pinned and unaffected.
   */
  shift: Vec2;
  done: boolean;
};

/** Build the live state for a scene, actors at their opening marks. */
export function createCutscene(def: CutsceneDef): CutsceneState {
  return {
    defId: def.id,
    actors: def.actors.map((a) => ({
      id: a.id,
      sprite: a.sprite,
      pos: { ...a.at },
      faceLeft: a.faceLeft ?? false,
      hidden: a.hidden ?? false,
      moving: false,
      shake: 0,
      poseMs: 0,
      lift: 0,
      holding: null,
    })),
    beat: 0,
    beatMs: 0,
    timeMs: 0,
    fade: 0,
    fadeFrom: 0,
    liftFrom: 0,
    hiddenProps: def.stage.props
      .filter((p) => p.hidden && p.id)
      .map((p) => p.id as string),
    sounds: [],
    shift: { x: 0, y: 0 },
    done: def.beats.length === 0,
  };
}

function actor(state: CutsceneState, id: string): CutsceneActor {
  const found = state.actors.find((a) => a.id === id);
  if (!found) throw new Error(`cutscene actor "${id}" not in cast`);
  return found;
}

/** Apply a beat's end state instantly (used by finish/advance/skip). */
function settleBeat(state: CutsceneState, beat: CutsceneBeat): void {
  switch (beat.kind) {
    case "move": {
      const a = actor(state, beat.actor);
      // Face the way the walk went, exactly as stepping it would have — a
      // walk the player TAPPED through settles its whole end state, facing
      // included, or the actor arrives at its mark still turned the way it
      // was standing before it set off.
      if (Math.abs(beat.to.x - a.pos.x) > 0.5) {
        a.faceLeft = beat.to.x < a.pos.x;
      }
      a.pos = { ...beat.to };
      a.moving = false;
      break;
    }
    case "pose": {
      const a = actor(state, beat.actor);
      // A pose RESTARTS the clock only when it is actually a change: re-posing
      // an actor to the sprite it already wears must not re-light an engine
      // that has been burning for a second.
      if (a.sprite !== beat.sprite) a.poseMs = 0;
      a.sprite = beat.sprite;
      break;
    }
    case "face":
      actor(state, beat.actor).faceLeft = beat.faceLeft;
      break;
    case "enter":
      actor(state, beat.actor).hidden = false;
      break;
    case "exit":
      actor(state, beat.actor).hidden = true;
      break;
    case "shake":
      actor(state, beat.actor).shake = beat.amp;
      break;
    case "jump":
      actor(state, beat.actor).lift = beat.lift;
      break;
    case "hold":
      actor(state, beat.actor).holding = beat.sprite
        ? { sprite: beat.sprite, at: beat.at ? { ...beat.at } : { x: 0, y: 0 } }
        : null;
      break;
    case "prop": {
      const hidden = state.hiddenProps.filter((id) => id !== beat.prop);
      if (beat.hidden) hidden.push(beat.prop);
      state.hiddenProps = hidden;
      break;
    }
    case "sound":
      state.sounds.push(beat.sound);
      break;
    case "fade":
      state.fade = beat.to;
      break;
    case "pan": {
      // The pan applies incrementally as it plays (so it composes with the
      // stage drift); settling adds only whatever remains of `by`.
      const played = Math.min(1, state.beatMs / Math.max(1, beat.ms));
      state.shift.x += beat.by.x * (1 - played);
      state.shift.y += beat.by.y * (1 - played);
      break;
    }
    default:
      break; // wait/caption/say leave no end state behind
  }
}

function beginBeat(state: CutsceneState, def: CutsceneDef): void {
  state.beatMs = 0;
  const beat = def.beats[state.beat];
  if (!beat) {
    state.done = true;
    return;
  }
  if (beat.kind === "fade") state.fadeFrom = state.fade;
  // The jump's base is read HERE, before its first step — so the fall beat
  // that follows a rise picks up the apex the settle just left behind, in the
  // same synchronous turn, and the actor never blinks back to the ground.
  if (beat.kind === "jump") state.liftFrom = actor(state, beat.actor).lift;
  // Instant beats settle immediately and roll into the next one.
  if (
    beat.kind === "pose" ||
    beat.kind === "face" ||
    beat.kind === "enter" ||
    beat.kind === "exit" ||
    beat.kind === "shake" ||
    beat.kind === "hold" ||
    beat.kind === "prop" ||
    beat.kind === "sound"
  ) {
    settleBeat(state, beat);
    state.beat++;
    beginBeat(state, def);
  }
}

/** Advance the scene by `dtMs`. A no-op once `done`. */
export function stepCutscene(
  state: CutsceneState,
  def: CutsceneDef,
  dtMs: number,
): void {
  if (state.done) return;
  const beat = def.beats[state.beat];
  if (!beat) {
    state.done = true;
    return;
  }
  state.timeMs += dtMs;
  for (const a of state.actors) a.poseMs += dtMs;
  // The stage drift runs UNDER the beat timeline — the parallax field keeps
  // streaming while a held line idles the beats.
  if (def.stage.drift) {
    state.shift.x += (def.stage.drift.x * dtMs) / 1000;
    state.shift.y += (def.stage.drift.y * dtMs) / 1000;
  }
  const beatWasMs = state.beatMs;
  state.beatMs += dtMs;

  switch (beat.kind) {
    case "wait":
      if (state.beatMs >= beat.ms) nextBeat(state, def, beat);
      return;
    case "caption":
    case "say":
      // Text waits for the player: only advanceCutsceneBeat moves past it.
      return;
    case "fade": {
      const t = Math.min(1, state.beatMs / Math.max(1, beat.ms));
      state.fade = state.fadeFrom + (beat.to - state.fadeFrom) * t;
      if (state.beatMs >= beat.ms) nextBeat(state, def, beat);
      return;
    }
    case "pan": {
      // Apply this step's slice of `by` (incremental, so the drift above
      // stacks cleanly); the settle in nextBeat adds any remainder.
      const ms = Math.max(1, beat.ms);
      const was = Math.min(1, beatWasMs / ms);
      const now = Math.min(1, state.beatMs / ms);
      state.shift.x += beat.by.x * (now - was);
      state.shift.y += beat.by.y * (now - was);
      if (state.beatMs >= beat.ms) nextBeat(state, def, beat);
      return;
    }
    case "jump": {
      // A ballistic half-arc: going UP the actor decelerates into the apex,
      // coming DOWN it accelerates out of it. Which half this is, is the
      // direction of travel — so a leap needs no authored gravity, only its
      // height and how long it takes.
      const a = actor(state, beat.actor);
      const t = Math.min(1, state.beatMs / Math.max(1, beat.ms));
      const rising = beat.lift > state.liftFrom;
      const eased = rising ? 1 - (1 - t) * (1 - t) : t * t;
      a.lift = state.liftFrom + (beat.lift - state.liftFrom) * eased;
      if (state.beatMs >= beat.ms) nextBeat(state, def, beat);
      return;
    }
    case "move": {
      const a = actor(state, beat.actor);
      a.moving = true;
      if (Math.abs(beat.to.x - a.pos.x) > 0.5) {
        a.faceLeft = beat.to.x < a.pos.x;
      }
      a.pos = moveToward(a.pos, beat.to, (beat.speed * dtMs) / 1000);
      if (distance(a.pos, beat.to) < 0.5) nextBeat(state, def, beat);
      return;
    }
    default:
      // Instant beats are consumed by beginBeat and never run a step.
      nextBeat(state, def, beat);
  }
}

function nextBeat(
  state: CutsceneState,
  def: CutsceneDef,
  beat: CutsceneBeat,
): void {
  settleBeat(state, beat);
  state.beat++;
  beginBeat(state, def);
}

/**
 * The player's tap: cut the running beat short (snap a walk to its mark,
 * dismiss a line early). One tap, one beat.
 */
export function advanceCutsceneBeat(
  state: CutsceneState,
  def: CutsceneDef,
): void {
  if (state.done) return;
  const beat = def.beats[state.beat];
  if (!beat) {
    state.done = true;
    return;
  }
  nextBeat(state, def, beat);
}

/**
 * Skip the rest of the scene, applying every remaining end state.
 *
 * A SKIPPED SCENE MAKES NO NOISE: every `sound` beat left in the timeline
 * settles in this one turn, so draining the queue afterwards would fire the
 * whole scene's audio as one chord over the fade-out. The end state a sound
 * leaves behind is nothing — so the queue is dropped, exactly as the frames
 * nobody sees are.
 */
export function finishCutscene(state: CutsceneState, def: CutsceneDef): void {
  while (!state.done) advanceCutsceneBeat(state, def);
  state.sounds.length = 0;
}

/** The text currently on screen, if the running beat shows any. */
export function currentLine(
  state: CutsceneState,
  def: CutsceneDef,
): { kind: "caption" | "say"; actor?: string; text: string[] } | null {
  const beat = def.beats[state.beat];
  if (state.done || !beat) return null;
  if (beat.kind === "caption") return { kind: "caption", text: beat.text };
  if (beat.kind === "say") {
    return { kind: "say", actor: beat.actor, text: beat.text };
  }
  return null;
}
