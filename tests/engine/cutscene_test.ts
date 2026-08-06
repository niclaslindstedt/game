// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene player (@game/lib/cutscene): a deterministic beat machine —
// plus its integration into a run: level 1 opens on the prelude, the sim
// stays frozen underneath it, and tap/skip land on the intro text box.

import { describe, expect, it } from "vitest";

import {
  advanceCutsceneBeat,
  createCutscene,
  createGame,
  currentLine,
  cutsceneDef,
  finishCutscene,
  skipCutscene,
  step,
  stepCutscene,
  tapCutscene,
  type CutsceneDef,
} from "@game/core";
import { DT, idle, SEED } from "./helpers.ts";

/** A small scene exercising every beat kind, independent of game content. */
const SCENE: CutsceneDef = {
  id: "test_scene",
  stage: { width: 320, height: 180, backdrop: "test", props: [] },
  actors: [
    { id: "a", sprite: "a_idle", at: { x: 10, y: 20 } },
    { id: "b", sprite: "b_idle", at: { x: 100, y: 20 }, hidden: true },
  ],
  beats: [
    { kind: "wait", ms: 100 },
    { kind: "caption", text: ["ONCE UPON A TIME."] },
    { kind: "enter", actor: "b" },
    { kind: "say", actor: "b", text: ["HI."] },
    { kind: "move", actor: "a", to: { x: 90, y: 20 }, speed: 100 },
    { kind: "pose", actor: "a", sprite: "a_sit" },
    { kind: "face", actor: "a", faceLeft: true },
    { kind: "exit", actor: "b" },
    { kind: "fade", to: 1, ms: 100 },
  ],
};

function runScene(state: ReturnType<typeof createCutscene>, ms: number) {
  for (let t = 0; t < ms; t += DT) stepCutscene(state, SCENE, DT);
}

describe("cutscene player", () => {
  it("opens with the cast at their marks", () => {
    const cs = createCutscene(SCENE);
    expect(cs.actors.map((a) => a.id)).toEqual(["a", "b"]);
    expect(cs.actors[0]!.pos).toEqual({ x: 10, y: 20 });
    expect(cs.actors[1]!.hidden).toBe(true);
    expect(cs.fade).toBe(0);
    expect(cs.done).toBe(false);
  });

  it("holds a timed beat for its duration, then rolls to the next", () => {
    const cs = createCutscene(SCENE);
    runScene(cs, 96); // still inside the 100ms wait
    expect(cs.beat).toBe(0);
    stepCutscene(cs, SCENE, DT);
    expect(cs.beat).toBe(1); // the caption
  });

  it("exposes the caption / dialogue on screen via currentLine", () => {
    const cs = createCutscene(SCENE);
    expect(currentLine(cs, SCENE)).toBeNull(); // wait shows nothing
    runScene(cs, 112);
    expect(currentLine(cs, SCENE)).toEqual({
      kind: "caption",
      text: ["ONCE UPON A TIME."],
    });
    advanceCutsceneBeat(cs, SCENE); // dismiss caption → instant enter → say
    expect(cs.actors[1]!.hidden).toBe(false);
    expect(currentLine(cs, SCENE)).toEqual({
      kind: "say",
      actor: "b",
      text: ["HI."],
    });
  });

  it("holds text beats indefinitely until the player advances them", () => {
    const cs = createCutscene(SCENE);
    runScene(cs, 112); // the caption is on screen
    runScene(cs, 30_000); // …and the scene idles under it, however long
    expect(cs.beat).toBe(1);
    expect(currentLine(cs, SCENE)?.kind).toBe("caption");
    advanceCutsceneBeat(cs, SCENE);
    expect(cs.beat).toBe(3); // the instant enter collapsed into the say
  });

  it("walks a move beat at its speed and faces the walk direction", () => {
    const cs = createCutscene(SCENE);
    runScene(cs, 112); // wait consumed; the caption holds
    advanceCutsceneBeat(cs, SCENE); // dismiss the caption
    advanceCutsceneBeat(cs, SCENE); // dismiss the line; the move begins
    const a = cs.actors[0]!;
    stepCutscene(cs, SCENE, DT);
    expect(a.moving).toBe(true);
    expect(a.faceLeft).toBe(false); // walking right
    const before = a.pos.x;
    stepCutscene(cs, SCENE, DT);
    expect(a.pos.x - before).toBeCloseTo((100 * DT) / 1000, 1);
    // 80 px at 100 px/s ≈ 800ms; land it and the instant tail applies.
    runScene(cs, 900);
    expect(a.pos).toEqual({ x: 90, y: 20 });
    expect(a.moving).toBe(false);
    expect(a.sprite).toBe("a_sit"); // pose
    expect(a.faceLeft).toBe(true); // face
    expect(cs.actors[1]!.hidden).toBe(true); // exit
  });

  it("a walk cut short by a tap still faces the way it went", () => {
    // The settle owes the actor its FACING as well as its mark: tapping a walk
    // away used to land it on the spot still turned the way it set off from,
    // which shows up as a mirrored actor (and a weapon on the wrong hand) for
    // every beat after it.
    const WALK: CutsceneDef = {
      id: "test_walk",
      stage: { width: 320, height: 180, backdrop: "test", props: [] },
      actors: [{ id: "a", sprite: "a_idle", at: { x: 100, y: 20 } }],
      beats: [
        { kind: "move", actor: "a", to: { x: 20, y: 20 }, speed: 40 },
        { kind: "move", actor: "a", to: { x: 200, y: 20 }, speed: 40 },
      ],
    };
    const cs = createCutscene(WALK);
    expect(cs.actors[0]!.faceLeft).toBe(false);
    advanceCutsceneBeat(cs, WALK); // tapped away before a single step ran
    expect(cs.actors[0]!.pos.x).toBe(20);
    expect(cs.actors[0]!.faceLeft).toBe(true);
    advanceCutsceneBeat(cs, WALK);
    expect(cs.actors[0]!.faceLeft).toBe(false);
  });

  it("interpolates fades and finishes the scene", () => {
    const cs = createCutscene(SCENE);
    runScene(cs, 112);
    advanceCutsceneBeat(cs, SCENE); // caption
    advanceCutsceneBeat(cs, SCENE); // say
    runScene(cs, 850); // walk lands (~800ms); the closing fade is mid-flight
    expect(cs.fade).toBeGreaterThan(0);
    runScene(cs, 300);
    expect(cs.fade).toBe(1);
    expect(cs.done).toBe(true);
    // Stepping past the end is a harmless no-op.
    stepCutscene(cs, SCENE, DT);
    expect(cs.done).toBe(true);
  });

  it("advanceCutsceneBeat cuts the running beat short with its end state", () => {
    const cs = createCutscene(SCENE);
    runScene(cs, 112);
    advanceCutsceneBeat(cs, SCENE); // caption
    advanceCutsceneBeat(cs, SCENE); // say
    runScene(cs, 300); // mid-move
    advanceCutsceneBeat(cs, SCENE);
    expect(cs.actors[0]!.pos).toEqual({ x: 90, y: 20 }); // snapped to mark
    expect(cs.actors[0]!.sprite).toBe("a_sit"); // instant tail ran too
  });

  it("finishCutscene fast-forwards every remaining end state", () => {
    const cs = createCutscene(SCENE);
    finishCutscene(cs, SCENE);
    expect(cs.done).toBe(true);
    expect(cs.actors[0]!.pos).toEqual({ x: 90, y: 20 });
    expect(cs.actors[1]!.hidden).toBe(true);
    expect(cs.fade).toBe(1);
  });

  it("pans the camera shift over its duration and settles the remainder", () => {
    const PAN: CutsceneDef = {
      id: "test_pan",
      stage: { width: 320, height: 180, backdrop: "test", props: [] },
      actors: [],
      beats: [
        { kind: "pan", by: { x: 0, y: 100 }, ms: 1000 },
        { kind: "caption", text: ["UP."] },
      ],
    };
    const cs = createCutscene(PAN);
    for (let t = 0; t < 500; t += DT) stepCutscene(cs, PAN, DT);
    // ~halfway through the glide (32 fixed steps × 16ms = 512ms → 51.2).
    expect(cs.shift.y).toBeCloseTo(51.2, 1);
    // The player's tap cuts it short — the remainder applies instantly.
    advanceCutsceneBeat(cs, PAN);
    expect(cs.shift.y).toBeCloseTo(100, 5);
    expect(currentLine(cs, PAN)?.text).toEqual(["UP."]);
  });

  it("accumulates the stage drift even while a text beat holds", () => {
    const DRIFT: CutsceneDef = {
      id: "test_drift",
      stage: {
        width: 320,
        height: 180,
        backdrop: "test",
        props: [],
        drift: { x: -10, y: 0 },
      },
      actors: [],
      beats: [{ kind: "caption", text: ["HOLD."] }],
    };
    const cs = createCutscene(DRIFT);
    for (let t = 0; t < 2000; t += DT) stepCutscene(cs, DRIFT, DT);
    expect(cs.beat).toBe(0); // still parked on the caption…
    expect(cs.shift.x).toBeCloseTo(-20, 0); // …while the field streams
  });

  it("shake beats set and clear an actor's tremble instantly", () => {
    const SHAKE: CutsceneDef = {
      id: "test_shake",
      stage: { width: 320, height: 180, backdrop: "test", props: [] },
      actors: [{ id: "a", sprite: "a_idle", at: { x: 10, y: 20 } }],
      beats: [
        { kind: "shake", actor: "a", amp: 2 },
        { kind: "wait", ms: 100 },
        { kind: "shake", actor: "a", amp: 0 },
        { kind: "wait", ms: 100 },
      ],
    };
    const cs = createCutscene(SHAKE);
    stepCutscene(cs, SHAKE, DT); // instant shake collapsed into the wait
    expect(cs.actors[0]!.shake).toBe(2);
    for (let t = 0; t < 200; t += DT) stepCutscene(cs, SHAKE, DT);
    expect(cs.actors[0]!.shake).toBe(0);
  });

  // The leap for the wall weapon: two jump beats with the grab settled
  // between them. What the pair has to guarantee is that the actor is at the
  // TOP when the grab lands (the piece leaves the wall as he reaches it, not
  // after he is back on the carpet) and that the fall starts from that apex
  // rather than snapping to the ground first.
  const LEAP: CutsceneDef = {
    id: "test_leap",
    stage: {
      width: 320,
      height: 180,
      backdrop: "test",
      props: [
        { kind: "shelf", pos: { x: 40, y: 40 } },
        { kind: "wall_thing", pos: { x: 40, y: 40 }, id: "arm" },
      ],
    },
    actors: [{ id: "a", sprite: "a_idle", at: { x: 40, y: 90 } }],
    beats: [
      { kind: "jump", actor: "a", lift: 20, ms: 100 },
      { kind: "prop", prop: "arm", hidden: true },
      { kind: "hold", actor: "a", sprite: "thing", at: { x: 9, y: 2 } },
      { kind: "jump", actor: "a", lift: 0, ms: 100 },
    ],
  };

  it("arcs a jump off the ground without moving the actor's mark", () => {
    const cs = createCutscene(LEAP);
    expect(cs.actors[0]!.lift).toBe(0);
    for (let t = 0; t < 50; t += DT) stepCutscene(cs, LEAP, DT);
    // Half way UP a rise is past half height — it decelerates into the apex.
    expect(cs.actors[0]!.lift).toBeGreaterThan(10);
    expect(cs.actors[0]!.lift).toBeLessThan(20);
    // A lift is height, not depth: the mark it sorts by never moved.
    expect(cs.actors[0]!.pos).toEqual({ x: 40, y: 90 });
  });

  it("settles the grab at the apex and falls from there", () => {
    const cs = createCutscene(LEAP);
    for (let t = 0; t < 100; t += DT) stepCutscene(cs, LEAP, DT);
    // The rise ended; both instants collapsed into the start of the fall.
    expect(cs.actors[0]!.lift).toBe(20);
    expect(cs.hiddenProps).toEqual(["arm"]);
    expect(cs.actors[0]!.holding).toEqual({
      sprite: "thing",
      at: { x: 9, y: 2 },
    });
    // Half way DOWN a fall is still high — it accelerates out of the apex.
    for (let t = 0; t < 50; t += DT) stepCutscene(cs, LEAP, DT);
    expect(cs.actors[0]!.lift).toBeGreaterThan(10);
    for (let t = 0; t < 60; t += DT) stepCutscene(cs, LEAP, DT);
    expect(cs.actors[0]!.lift).toBe(0);
    expect(cs.done).toBe(true);
  });

  it("finishCutscene lands the whole leap: down, stripped and carrying", () => {
    const cs = createCutscene(LEAP);
    finishCutscene(cs, LEAP);
    expect(cs.actors[0]!.lift).toBe(0);
    expect(cs.hiddenProps).toEqual(["arm"]);
    expect(cs.actors[0]!.holding?.sprite).toBe("thing");
  });

  it("a hold with no sprite empties the actor's hands", () => {
    const DROP: CutsceneDef = {
      ...LEAP,
      id: "test_drop",
      beats: [
        { kind: "hold", actor: "a", sprite: "thing" },
        { kind: "wait", ms: 50 },
        { kind: "hold", actor: "a" },
        { kind: "wait", ms: 50 },
      ],
    };
    const cs = createCutscene(DROP);
    stepCutscene(cs, DROP, DT);
    // An omitted `at` grips at the actor sprite's own origin.
    expect(cs.actors[0]!.holding).toEqual({
      sprite: "thing",
      at: { x: 0, y: 0 },
    });
    for (let t = 0; t < 100; t += DT) stepCutscene(cs, DROP, DT);
    expect(cs.actors[0]!.holding).toBeNull();
  });

  it("starts a `hidden` prop off the stage, for a beat to bring on", () => {
    const DOORWAY: CutsceneDef = {
      id: "test_doorway",
      stage: {
        width: 320,
        height: 180,
        backdrop: "test",
        props: [
          { kind: "door", pos: { x: 10, y: 10 }, id: "shut" },
          {
            kind: "door_open",
            pos: { x: 10, y: 10 },
            id: "open",
            hidden: true,
          },
        ],
      },
      actors: [],
      beats: [
        { kind: "wait", ms: 50 },
        { kind: "prop", prop: "shut", hidden: true },
        { kind: "prop", prop: "open", hidden: false },
        { kind: "wait", ms: 50 },
      ],
    };
    const cs = createCutscene(DOORWAY);
    expect(cs.hiddenProps).toEqual(["open"]);
    for (let t = 0; t < 60; t += DT) stepCutscene(cs, DOORWAY, DT);
    expect(cs.hiddenProps).toEqual(["shut"]);
  });

  it("queues a `sound` beat's id for the host, and drops it on a skip", () => {
    const NOISY: CutsceneDef = {
      ...SCENE,
      id: "test_noisy",
      beats: [
        { kind: "sound", sound: "front_door_opened" },
        { kind: "wait", ms: 50 },
        { kind: "sound", sound: "front_door_closed" },
        { kind: "wait", ms: 50 },
      ],
    };
    const cs = createCutscene(NOISY);
    expect(cs.sounds).toEqual([]);
    // The opening beat is instant: it settles into the queue on the first step.
    stepCutscene(cs, NOISY, DT);
    expect(cs.sounds).toEqual(["front_door_opened"]);
    // The host drains what it fired; the next beat queues onto the empty list.
    cs.sounds.length = 0;
    for (let t = 0; t < 60; t += DT) stepCutscene(cs, NOISY, DT);
    expect(cs.sounds).toEqual(["front_door_closed"]);

    // A SKIPPED scene makes no noise: settling the rest of the timeline in one
    // turn must not hand the host every remaining sound as one chord.
    const skipped = createCutscene(NOISY);
    finishCutscene(skipped, NOISY);
    expect(skipped.done).toBe(true);
    expect(skipped.sounds).toEqual([]);
  });

  it("is deterministic for a fixed dt sequence", () => {
    const a = createCutscene(SCENE);
    const b = createCutscene(SCENE);
    for (let i = 0; i < 100; i++) {
      stepCutscene(a, SCENE, DT);
      stepCutscene(b, SCENE, DT);
    }
    expect(a).toEqual(b);
  });
});

describe("the prelude in a run", () => {
  it("boots level 1 in the cutscene phase with the sim frozen", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.level.id).toBe("test_prelude_level");
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude");
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(0); // frozen under the scene
    expect(state.enemies.length).toBeGreaterThan(0); // world already built
  });

  it("idles on a text beat forever — the sim can't play the scene out alone", () => {
    const state = createGame(SEED, "test_prelude_level");
    // Step well past every timed beat: the scene parks on the first text.
    for (let i = 0; i < 1200; i++) step(state, idle, DT);
    expect(state.phase).toBe("cutscene");
    const def = cutsceneDef("test_prelude");
    expect(def.beats[state.cutscene!.beat]!.kind).toBe("caption");
    const parked = state.cutscene!.beat;
    for (let i = 0; i < 1200; i++) step(state, idle, DT);
    expect(state.cutscene!.beat).toBe(parked); // still waiting for the tap
  });

  it("taps on the held text carry the scene through to the intro", () => {
    const state = createGame(SEED, "test_prelude_level");
    const def = cutsceneDef("test_prelude");
    for (let i = 0; i < 20_000 && state.phase === "cutscene"; i++) {
      step(state, idle, DT);
      const beat = state.cutscene && def.beats[state.cutscene.beat];
      if (beat && (beat.kind === "caption" || beat.kind === "say")) {
        tapCutscene(state);
      }
    }
    expect(state.phase).toBe("intro");
    expect(state.cutscene).toBeNull();
    expect(state.stats.timeMs).toBe(0); // frozen throughout
  });

  it("tapCutscene advances one beat per tap all the way out", () => {
    const state = createGame(SEED, "test_prelude_level");
    const beats = cutsceneDef("test_prelude").beats.length;
    for (let i = 0; i < beats && state.phase === "cutscene"; i++) {
      tapCutscene(state);
    }
    expect(state.phase).toBe("intro");
    expect(state.cutscene).toBeNull();
  });

  it("skipCutscene bails past the intro straight to the title card", () => {
    const state = createGame(SEED, "test_prelude_level");
    skipCutscene(state);
    // Skipping the prelude skips the hero's level-intro monologue too — the
    // whole opening bails to the level-name card just before the drop.
    expect(state.phase).toBe("title");
    expect(state.cutscene).toBeNull();
    // …and is a no-op on levels without a prelude.
    const moon = createGame(SEED, "test_level");
    expect(moon.phase).toBe("intro");
    skipCutscene(moon);
    expect(moon.phase).toBe("intro");
  });

  it("plays a chained prelude scene by scene into the intro", () => {
    const state = createGame(SEED, "test_chain_level");
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude");
    expect(state.cutsceneQueue).toEqual(["test_prelude_2"]);
    // Tap the first scene out: the chain rolls into the second scene, not
    // the intro. (Instant beats collapse, so tap by scene identity, not by
    // beat count.)
    while (state.cutscene?.defId === "test_prelude") tapCutscene(state);
    expect(state.phase).toBe("cutscene");
    expect(state.cutscene?.defId).toBe("test_prelude_2");
    expect(state.cutsceneQueue).toEqual([]);
    // Cast reset for the fresh scene: its own actors at their own marks.
    expect(state.cutscene?.actors.map((a) => a.id)).toEqual(["hero"]);
    // Tap the second scene out: NOW the intro takes the stage.
    while (state.cutscene?.defId === "test_prelude_2") tapCutscene(state);
    expect(state.phase).toBe("intro");
    expect(state.cutscene).toBeNull();
  });

  it("the sim clock stays frozen across the whole chain", () => {
    const state = createGame(SEED, "test_chain_level");
    const defs = [cutsceneDef("test_prelude"), cutsceneDef("test_prelude_2")];
    for (let i = 0; i < 20_000 && state.phase === "cutscene"; i++) {
      step(state, idle, DT);
      const def = defs.find((d) => d.id === state.cutscene?.defId);
      const beat = state.cutscene && def?.beats[state.cutscene.beat];
      if (beat && (beat.kind === "caption" || beat.kind === "say")) {
        tapCutscene(state);
      }
    }
    expect(state.phase).toBe("intro");
    expect(state.stats.timeMs).toBe(0);
  });

  it("skipCutscene drops the whole chain, queue included", () => {
    const state = createGame(SEED, "test_chain_level");
    skipCutscene(state);
    expect(state.phase).toBe("title");
    expect(state.cutscene).toBeNull();
    expect(state.cutsceneQueue).toEqual([]);
  });

  it("forwards a scene's `sound` beat as a cutsceneSound event, once", () => {
    const state = createGame(SEED, "test_prelude_level");
    const def = cutsceneDef("test_prelude");
    const heard: string[] = [];
    for (let i = 0; i < 20_000 && state.phase === "cutscene"; i++) {
      step(state, idle, DT);
      for (const e of state.events) {
        if (e.type === "cutsceneSound") heard.push(e.sfx);
      }
      const beat = state.cutscene && def.beats[state.cutscene.beat];
      if (beat && (beat.kind === "caption" || beat.kind === "say")) {
        tapCutscene(state);
      }
    }
    // The door the fixture shuts behind Ada — reported exactly once, and the
    // queue it came out of is empty behind it.
    expect(heard).toEqual(["test_door"]);
  });

  it("a skipped scene reports no sound at all", () => {
    const state = createGame(SEED, "test_prelude_level");
    skipCutscene(state);
    const heard: string[] = [];
    for (let i = 0; i < 120; i++) {
      step(state, idle, DT);
      for (const e of state.events) {
        if (e.type === "cutsceneSound") heard.push(e.sfx);
      }
    }
    expect(heard).toEqual([]);
  });

  it("Ada leaves and never comes back", () => {
    const state = createGame(SEED, "test_prelude_level");
    const ada = () => state.cutscene?.actors.find((a) => a.id === "ada");
    expect(ada()?.hidden).toBe(false);
    const def = cutsceneDef("test_prelude");
    // Run to just before the final beat: Ada must already be gone.
    while (state.cutscene && state.cutscene.beat < def.beats.length - 1) {
      tapCutscene(state);
      if (!state.cutscene) break;
      if (state.cutscene.beat >= def.beats.length - 1) break;
    }
    expect(ada()?.hidden).toBe(true);
  });
});
