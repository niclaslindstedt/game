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
