// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD WATCHING ITSELF — the bystanders who shout about a collision, and
// the four rules that keep the beat from becoming a caption track.
//
// WHY IT IS WORTH A SUITE. Every one of these fails SILENTLY and none of them
// fails visibly: a witness picked outside the app's reading window is a line
// drawn half off the right edge of the frame, a missing gap is a shout every
// third of a second, a `state.rng()` draw spent on a word is a different road
// for the same seed, and a `fleeing` line raised on the first body is a crowd
// remarking that he has done it "again" when nobody has seen him do anything.
// All four look fine in a screenshot.
//
// `tests/engine/` rather than `tests/content/`: what is asserted here is the
// engine's rule for WHO shouts and WHEN, never a word of what they say. The
// words are the app's and are held by `tests/content/drive_words_test.ts`.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  skipDriveOpening,
  stepDrive,
  stepWitness,
  restartDrive,
  DRIVE,
  DRIVE_OUTCOME,
  type DriveParams,
  type DriveState,
  type DriveWitness,
  type WitnessScene,
} from "../../engine/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

/** What one shout was, flattened enough to compare two legs by. */
type Shout = { at: number; scene: WitnessScene; roll: number; ped: number };

/**
 * DRIVE THE LEG AND KEEP EVERY SHOUT IT RAISED, in order.
 *
 * THE WAGON IS HELD IMMORTAL FOR IT (`car.wear = 0` every tick), which is the
 * simulator's own trick and is the only way to see more than the opening
 * handful: a car driven flat out through this crowd breaks down a third of the
 * way along, and a run that stopped there would pass just as happily on a road
 * that raised two reactions and then went quiet.
 */
function harvestShouts(drive: DriveState, ms = 120_000): Shout[] {
  skipDriveOpening(drive);
  const out: Shout[] = [];
  let last: DriveWitness | null = null;
  for (let t = 0; t < ms; t += 16) {
    drive.car.wear = 0;
    stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    const { witness } = drive;
    // A FRESH one, rather than the same one still being held — identity is not
    // enough, because a shout is replaced in place the tick a louder incident
    // lands on top of it.
    if (witness && witness !== last) {
      out.push({
        at: drive.ms,
        scene: witness.scene,
        roll: witness.roll,
        ped: witness.ped,
      });
    }
    last = witness;
    if (drive.outcome !== DRIVE_OUTCOME.driving) break;
  }
  return out;
}

/**
 * Put one body on the road `aheadPx` in front of the wagon and hand back its
 * id — somebody for a staged incident to be seen BY.
 *
 * The crowd's own spawner lays people down at a pace and a hash, so a test that
 * wanted a witness at a particular distance by driving to one would be tuning
 * itself against `pedestriansPerKPx`. This plants one.
 */
function plantWitness(drive: DriveState, aheadPx: number): number {
  const id = drive.nextId++;
  drive.pedestrians.push({
    id,
    pos: { x: drive.car.pos.x + aheadPx * drive.params.direction, y: 0 },
    vel: { x: 0, y: 0 },
    mode: "afoot",
    kind: "walker",
    variant: 4, // the suit — a body with nothing about it worth naming
    phase: 0,
    z: 0,
    vz: 0,
    counted: false,
    crushed: false,
    bark: -1,
  });
  return id;
}

/** A staged tick: put these events on the road and ask who saw them. */
function witnessOf(
  drive: DriveState,
  events: DriveState["events"],
  aheadPx = 150,
): DriveWitness | null {
  plantWitness(drive, aheadPx);
  drive.events.length = 0;
  drive.events.push(...events);
  stepWitness(drive);
  return drive.witness;
}

/**
 * A staged drive with nothing on the road but what a test puts there — AND THE
 * WAGON PARKED ON THE ORIGIN, so a staged incident at `{0, 0}` is one the car
 * is standing in and every planted witness is measured off the same point.
 *
 * Without the reset the car sits wherever the opening left it, several thousand
 * pixels down the road, and every staged incident is one nobody could possibly
 * have seen (`DRIVE.witness.sawPx`) — which is a silent null rather than a
 * failure, and reads as the feature not working.
 */
function empty(seed = PARAMS.seed): DriveState {
  const drive = createDrive({ ...PARAMS, seed });
  skipDriveOpening(drive);
  drive.pedestrians.length = 0;
  drive.traffic.length = 0;
  drive.car.pos.x = 0;
  drive.ms = 0;
  drive.nextWitnessMs = 0;
  return drive;
}

describe("who saw that", () => {
  it("has somebody shout about the carnage on a real leg", () => {
    // THE BEAT EXISTS AT ALL. The road is deliberately unthreadable, so a leg
    // driven flat out is a collision every second or so — and the whole point of
    // the feature is that the crowd is no longer indifferent to that.
    const shouts = harvestShouts(createDrive(PARAMS));
    expect(shouts.length).toBeGreaterThan(4);
  });

  it("never has two people shouting at once", () => {
    // The picture carries ONE line of floating text (`MAX_PLACARDS`), so a
    // second reaction would print over the first and turn two people into one
    // smudge. The sim enforces it by holding a single witness rather than by
    // trusting the renderer to pick.
    const drive = createDrive(PARAMS);
    skipDriveOpening(drive);
    for (let t = 0; t < 60_000; t += 16) {
      drive.car.wear = 0;
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      const shouting = drive.pedestrians.filter(
        (ped) => drive.witness?.ped === ped.id,
      );
      expect(shouting.length).toBeLessThanOrEqual(1);
      if (drive.outcome !== DRIVE_OUTCOME.driving) break;
    }
  });

  it("leaves a gap between one shout and the next", () => {
    // A shout on every collision is not a crowd reacting, it is a caption track
    // — see `DRIVE.witness.gapMs`. The gap is measured between the moments a
    // FRESH witness is raised, which is the thing the player actually counts.
    const shouts = harvestShouts(createDrive(PARAMS));
    for (const [i, shout] of shouts.entries()) {
      if (i === 0) continue;
      const before = shouts[i - 1];
      expect(before).toBeDefined();
      expect(shout.at - (before?.at ?? 0)).toBeGreaterThanOrEqual(
        DRIVE.witness.gapMs,
      );
    }
  });

  it("only ever picks somebody the picture can draw", () => {
    // THE RULE WITH A NUMBER IN THE OTHER TREE. The camera shows about 308 world
    // px past the bumper and the app's floating text gives up at 260
    // (`PLACARD_READ_PX`), so a witness further out than `reachPx` is a line
    // that fades up already clipped — and one right under the bumper is a
    // flicker. Asserted every tick a witness is live rather than at the moment
    // it is raised, because the car is closing on them at 900 px/s.
    const drive = createDrive(PARAMS);
    skipDriveOpening(drive);
    const { reachPx } = DRIVE.witness;
    for (let t = 0; t < 60_000; t += 16) {
      drive.car.wear = 0;
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      const { witness } = drive;
      if (!witness) continue;
      const speaker = drive.pedestrians.find((ped) => ped.id === witness.ped);
      // A witness the road has forgotten is not a witness — the shout is
      // retired with the body rather than left floating over an empty lane.
      expect(speaker).toBeDefined();
      if (!speaker) continue;
      // …AND STILL ON THEIR FEET. A body that has itself been hit is mid-flight
      // or lying in the gutter, and a line still hanging over it would be the
      // game making a remark about what just happened to the person making it.
      expect(speaker.mode).toBe("afoot");
      const away = (speaker.pos.x - drive.car.pos.x) * drive.params.direction;
      expect(away).toBeLessThanOrEqual(reachPx);
      if (drive.outcome !== DRIVE_OUTCOME.driving) break;
    }
  });

  it("shouts the same things in the same order for the same seed", () => {
    // A restart after a breakdown is the same road, and that has to include what
    // the people on it shouted — which is only true because the choice of line
    // is HASHED rather than drawn off `state.rng`. A draw spent here would move
    // every body, variant and wander phase laid down after it.
    const a = harvestShouts(createDrive(PARAMS));
    const b = harvestShouts(restartDrive(createDrive(PARAMS)));
    expect(b).toEqual(a);
    // …and a DIFFERENT seed genuinely gives a different evening.
    const other = harvestShouts(createDrive({ ...PARAMS, seed: 77 }));
    expect(other).not.toEqual(a);
  });

  it("shouts about the worst thing in the tick, not the first", () => {
    // ONE COLLISION IS ROUTINELY FOUR EVENTS: a body met at the top end raises
    // `pedestrianHit`, then `bodySplit`, then `bodyCaught` as what is left goes
    // under the floorpan. A bystander shouts about the worst of those, and the
    // worst is never the one that happened first.
    const pos = { x: 0, y: 0 };
    const drive = empty();
    const seen = witnessOf(drive, [
      { type: "pedestrianHit", pos, joules: 9000, kind: "walker", variant: 4 },
      { type: "bodySplit", pos, joules: 9000 },
    ]);
    expect(seen?.scene).toBe("torn");
  });

  it("puts a body ahead of a bent wing, whatever order they landed in", () => {
    // A person going under the bumper and the headlight that broke doing it are
    // not the same sight, and the crowd does not remark on the headlight.
    const pos = { x: 0, y: 0 };
    const seen = witnessOf(empty(), [
      { type: "pedestrianHit", pos, joules: 4000, kind: "walker", variant: 4 },
      { type: "trafficHit", pos, joules: 9000, class: "heavy", headOn: true },
      { type: "lampFelled", pos, joules: 9000 },
    ]);
    expect(seen?.scene).toBe("person");
  });

  it("names WHO went under, not just that somebody did", () => {
    // The whole reason `pedestrianHit` carries `kind` and `variant`: a bystander
    // shouts something different at a wheelchair, at a woman and at somebody
    // walking a dog. The indexes are `CROWD_SPRITES`', so what is shouted and
    // what the player is looking at are one thing.
    const pos = { x: 0, y: 0 };
    const scene = (kind: "walker" | "glued", variant: number) =>
      witnessOf(empty(), [
        { type: "pedestrianHit", pos, joules: 3000, kind, variant },
      ])?.scene;
    expect(scene("walker", 17)).toBe("wheelchair");
    expect(scene("walker", 1)).toBe("woman");
    expect(scene("walker", 8)).toBe("dog");
    expect(scene("walker", 10)).toBe("elder");
    expect(scene("walker", 16)).toBe("cyclist");
    expect(scene("glued", 0)).toBe("glued");
    // …AND THE PRAM IS DELIBERATELY UNNAMED. The road does not say what is in
    // it and never has (there are no children out here — `CROWD_VARIANTS`); a
    // bystander naming it would settle the one question this minigame is
    // careful not to ask.
    expect(scene("walker", 7)).toBe("person");
  });

  it("tells a bus apart from a hatchback", () => {
    // Nothing else the road can say tells the two apart — the joules do not,
    // because a saloon met flat out is worth more than a bus met gently — which
    // is why the class travels on the event.
    const pos = { x: 0, y: 0 };
    const scene = (kind: "heavy" | "car" | "open") =>
      witnessOf(empty(), [
        { type: "trafficHit", pos, joules: 5000, class: kind, headOn: false },
      ])?.scene;
    expect(scene("heavy")).toBe("heavy");
    expect(scene("car")).toBe("car");
    expect(scene("open")).toBe("bike");
  });

  it("names a head-on by its SHAPE, whatever was in it", () => {
    // A head-on is the thing a bystander points at, and there is only ever one
    // sentence — that it happened to be a bus is the next one. Nothing else the
    // road says can be read as nose-to-nose: not the joules (a rear-ending at
    // the top end is worth more), not a roll (plenty of head-ons leave both cars
    // on their wheels), which is why the geometry travels on the event.
    const pos = { x: 0, y: 0 };
    const scene = (kind: "heavy" | "car" | "open", headOn: boolean) =>
      witnessOf(empty(), [
        { type: "trafficHit", pos, joules: 5000, class: kind, headOn },
      ])?.scene;
    expect(scene("car", true)).toBe("headOn");
    expect(scene("heavy", true)).toBe("headOn");
    expect(scene("open", true)).toBe("headOn");
    expect(scene("car", false)).toBe("car");
  });

  it("can reach every scene it names — no scene is unreachable content", () => {
    // THE DRIFT THIS SUITE EXISTS TO CATCH SECOND. The compiler already refuses
    // an app-side table missing a scene; nothing whatever refuses the reverse —
    // a scene added to `WitnessScene` and to `WITNESS_LINES` with no arm in
    // `sceneOf` to raise it. That is a handful of lines nobody can ever hear,
    // and it looks exactly like working content from both ends.
    //
    // So: one representative event per scene, driven through the real
    // classifier. `fleeing` is the deliberate exception — it is not a thing that
    // HAPPENED, so no event produces it and the test below owns it instead.
    const pos = { x: 0, y: 0 };
    const CASES: Record<
      Exclude<WitnessScene, "fleeing">,
      DriveState["events"][number]
    > = {
      person: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "walker",
        variant: 4,
      },
      woman: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "walker",
        variant: 1,
      },
      elder: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "walker",
        variant: 0,
      },
      wheelchair: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "walker",
        variant: 17,
      },
      dog: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "walker",
        variant: 8,
      },
      cyclist: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "rider",
        variant: 0,
      },
      glued: {
        type: "pedestrianHit",
        pos,
        joules: 3000,
        kind: "glued",
        variant: 0,
      },
      torn: { type: "bodySplit", pos, joules: 9000 },
      car: {
        type: "trafficHit",
        pos,
        joules: 4000,
        class: "car",
        headOn: false,
      },
      heavy: {
        type: "trafficHit",
        pos,
        joules: 4000,
        class: "heavy",
        headOn: false,
      },
      headOn: {
        type: "trafficHit",
        pos,
        joules: 4000,
        class: "car",
        headOn: true,
      },
      bike: { type: "machineDown", pos, joules: 4000 },
      rolled: { type: "trafficRolled", pos, joules: 4000 },
      thrown: { type: "occupantThrown", pos, joules: 4000 },
      fire: { type: "trafficFire", pos, joules: 4000 },
      blast: { type: "trafficExploded", pos, joules: 9000, big: false },
      shockwave: { type: "lampBlown", pos },
      lamp: { type: "lampFelled", pos, joules: 4000 },
    };
    for (const [scene, event] of Object.entries(CASES)) {
      expect(
        witnessOf(empty(), [event])?.scene,
        `no event in sceneOf() raises "${scene}" — its lines are unreachable`,
      ).toBe(scene);
    }
  });

  it("tells a burn from a bang from the front the bang threw", () => {
    // THREE SIGHTS THAT ARRIVE WITHIN A SECOND OF EACH OTHER AND ARE NOT THE
    // SAME. Something CATCHING is a thing that grows and is watched; a TANK
    // GOING is an instant and is shouted at; and the FRONT off the big ones is
    // felt rather than seen — which is why the rare `big` tenth takes the
    // pressure lines and the ordinary nine tenths take the fireball's.
    const pos = { x: 0, y: 0 };
    const scene = (event: DriveState["events"][number]) =>
      witnessOf(empty(), [event])?.scene;
    expect(scene({ type: "trafficFire", pos, joules: 5000 })).toBe("fire");
    expect(
      scene({ type: "trafficExploded", pos, joules: 9000, big: false }),
    ).toBe("blast");
    expect(
      scene({ type: "trafficExploded", pos, joules: 9000, big: true }),
    ).toBe("shockwave");
    // …AND THE LAMPS GOING OUT AS THE WAVE PASSES, which is the one consequence
    // on this road that reaches the crowd AFTER its cause: the front takes 1.1 s
    // to cross, so this is the line that lands when the blast's own reaction was
    // blocked by the gap or had nobody near enough to see it.
    expect(scene({ type: "lampBlown", pos })).toBe("shockwave");
    // A FELLED post is the opposite event and stays its own scene — that one was
    // HIT, and the crowd's line about it is a joke about the council.
    expect(scene({ type: "lampFelled", pos, joules: 3000 })).toBe("lamp");
  });

  it("shouts about the bang rather than about the lamp it blew out", () => {
    // A tank going up raises the blast, a fire on whatever it lit, a shove into
    // the traffic and a string of lamps in the same second. One of those is what
    // somebody standing there would say.
    const pos = { x: 0, y: 0 };
    const seen = witnessOf(empty(), [
      { type: "trafficHit", pos, joules: 4000, class: "car", headOn: false },
      { type: "trafficFire", pos, joules: 4000 },
      { type: "trafficExploded", pos, joules: 9000, big: false },
      { type: "lampBlown", pos },
    ]);
    expect(seen?.scene).toBe("blast");
  });

  it("says nothing at all about the car's own paperwork", () => {
    // A panel bending, a part working free and the hero's own breakdown are
    // things happening to a CAR's condition, and nobody standing on a kerb
    // shouts about that. The silence is the assertion: a scene for every event
    // would put a bystander on the pavement narrating the wear bar.
    const drive = empty();
    const seen = witnessOf(drive, [
      { type: "panelBent", pos: { x: 0, y: 0 } },
      { type: "partShed", pos: { x: 0, y: 0 } },
      { type: "breakdown", pos: { x: 0, y: 0 } },
    ]);
    expect(seen).toBeNull();
  });

  it("does not have the crowd shout about a crash it could not see", () => {
    // The one case `sawPx` exists for: a pile-up the hero never touched
    // (`between.ts`), hundreds of pixels up the road, where the people beside
    // the wagon genuinely did not see anything.
    const far = DRIVE.witness.sawPx * 3;
    const drive = empty();
    const seen = witnessOf(drive, [
      {
        type: "trafficHit",
        pos: { x: far, y: 0 },
        joules: 9000,
        class: "car",
        headOn: false,
      },
    ]);
    expect(seen).toBeNull();
  });

  it("does not call it a hit-and-run before it has seen two", () => {
    // "AGAIN" NEEDS A FIRST TIME. `fleeing` is the only line out here about the
    // DRIVER rather than about the blow, so the crowd has to have watched him do
    // it before — otherwise the first person he touches all evening is shouting
    // that he has done it again.
    const pos = { x: 0, y: 0 };
    const hit = {
      type: "pedestrianHit" as const,
      pos,
      joules: 3000,
      kind: "walker" as const,
      variant: 4,
    };
    for (let tick = 0; tick < 40; tick++) {
      const drive = empty();
      drive.bodies = 1;
      drive.ms = tick * 97;
      drive.nextWitnessMs = 0;
      expect(witnessOf(drive, [hit])?.scene).not.toBe("fleeing");
    }
    // …and once he HAS, some of them start saying so. Across a spread of
    // MOMENTS rather than of seeds, because which reactions are `fleeing` ones
    // is hashed off the witness and the drive clock — a staged road is otherwise
    // the identical incident forty times over and would answer identically.
    const later = [...Array(40).keys()].map((tick) => {
      const drive = empty();
      drive.bodies = 6;
      drive.ms = tick * 97;
      drive.nextWitnessMs = 0;
      return witnessOf(drive, [hit])?.scene;
    });
    expect(later).toContain("fleeing");
    // …but never ALL of them: it is a third, and a road where every reaction is
    // about the driver has stopped being a road with people on it.
    expect(later.some((scene) => scene === "person")).toBe(true);
  });
});
