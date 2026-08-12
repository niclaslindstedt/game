// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLIENT-SIDE PREDICTION AND RECONCILIATION, plus remote-hero interpolation
// (`server/client-predict.ts`, `engine/game/predict.ts`, docs/multiplayer.md).
//
// Four claims, each the feature's own contract:
//
//  1. The wire's half: a state frame's header `ack` echoes the highest input
//     seq the server has APPLIED, per client — the number reconciliation
//     drops replayed inputs against.
//  2. The predicted local hero moves at the loop's 60 Hz between publishes,
//     and lands EXACTLY on the server's answer at each snapshot: prediction
//     runs the engine's own `stepPlayer` over the same inputs, so on open
//     ground the replay is not approximately right, it is bit-for-bit right.
//  3. A lost input frame costs a reconcile, never a teleport: the hero eases
//     back onto the authoritative path and converges.
//  4. Prediction is movement ONLY — no enemy damage, no rng draw, no shared
//     meter moves, even on a seismic-trained hero landing from a jump.
//
// The session/client pair is wired the way `net_session_test.ts` wires it:
// loopback function transports, frames delivered synchronously, the sim
// advanced by hand in whole ticks.

import { describe, expect, it } from "vitest";

import {
  engineVersion,
  IDLE_INPUT,
  predictHeroMovement,
  talentSeismic,
  type GameInput,
} from "@game/core";
import { rngState } from "@game/lib/rng.ts";
import { decodeFrame } from "@game/wire/codec.ts";
import { FRAME, TICK_MS } from "@game/wire/frames.ts";
import { type SessionParams } from "@game/wire/protocol.ts";

import { createNetClient, type NetClient } from "../../server/client.ts";
import { createSession, type Session } from "../../server/session.ts";
import { makeEnemy, startGame, stopWaves } from "../helpers.ts";

const PARAMS: SessionParams = {
  seed: 20260730,
  levelId: "moon",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
};

type Decoded = NonNullable<ReturnType<typeof decodeFrame>>;

type Wired = {
  client: NetClient;
  /** Every frame the server sent THIS client, decoded. */
  sent: Decoded[];
};

type Rig = {
  session: Session;
  /** Wire one more client into the session. `dropInput` may swallow an input
   * frame by its payload seq — the loss simulation. */
  attach(options?: {
    play?: boolean;
    predict?: boolean;
    dropInput?: (seq: number) => boolean;
  }): Wired;
};

function createRig(): Rig {
  const session = createSession({ params: PARAMS, build: engineVersion });
  let nextId = 1;
  return {
    session,
    attach(options = {}) {
      const id = nextId++;
      const sent: Decoded[] = [];
      let receive: ((frame: ArrayBuffer) => void) | null = null;
      const client = createNetClient({
        transport: {
          send(frame) {
            const decoded = decodeFrame(frame);
            if (!decoded) return;
            if (
              decoded.type === FRAME.input &&
              options.dropInput?.((decoded.payload as { seq: number }).seq)
            ) {
              return; // the packet fell on the floor
            }
            session.receive(id, decoded.type, decoded.seq, decoded.payload);
          },
          onFrame(listener) {
            receive = listener;
          },
          close() {},
        },
        build: engineVersion,
        predict: options.predict,
      });
      session.addClient(
        id,
        (frame) => {
          const decoded = decodeFrame(frame);
          if (decoded) sent.push(decoded);
          receive?.(frame);
        },
        options.play ?? true,
      );
      return { client, sent };
    },
  };
}

/** Get the run onto the field, the way the app does: by asking. */
function takeTheField(rig: Rig, wired: Wired): void {
  wired.client.sendCommand("skipStoryOpening");
  wired.client.sendCommand("dismissIntro");
  for (let i = 0; i < 6; i++) rig.session.advance(TICK_MS);
}

/** The newest state frame (snapshot or delta) this client was sent. */
function lastStateFrame(wired: Wired): Decoded | undefined {
  for (let i = wired.sent.length - 1; i >= 0; i--) {
    const frame = wired.sent[i]!;
    if (frame.type === FRAME.snapshot || frame.type === FRAME.delta) {
      return frame;
    }
  }
  return undefined;
}

/** A steer toward a point, full throttle. */
function steer(x: number, y: number): GameInput {
  return { steering: true, target: { x, y }, jump: false, useItem: false };
}

const IDLE: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: false,
};

describe("the input-seq echo on state frames", () => {
  it("echoes the highest applied input seq, per client", () => {
    const rig = createRig();
    const a = rig.attach();
    const b = rig.attach();
    takeTheField(rig, a);
    // Neither client has sent an input yet — the echo is still zero.
    expect(lastStateFrame(a)?.ack).toBe(0);
    expect(lastStateFrame(b)?.ack).toBe(0);
    const walk = steer(600, 1870);
    for (let i = 0; i < 5; i++) a.client.sendInput(walk);
    for (let i = 0; i < 2; i++) b.client.sendInput(walk);
    rig.session.advance(TICK_MS * 3); // one publish
    // Per client, not per session: A has sent five input frames, B two.
    expect(lastStateFrame(a)?.ack).toBe(5);
    expect(lastStateFrame(b)?.ack).toBe(2);
  });

  it("never moves the echo backwards for a stale duplicate", () => {
    const rig = createRig();
    let dropAll = false;
    const held: number[] = [];
    const a = rig.attach({
      dropInput: (seq) => {
        if (dropAll) held.push(seq);
        return dropAll;
      },
    });
    takeTheField(rig, a);
    const walk = steer(600, 1870);
    for (let i = 0; i < 3; i++) a.client.sendInput(walk);
    // A reordered network delivers an OLD frame after the new ones: replay
    // frame 1's payload straight into the session.
    rig.session.receive(1, FRAME.input, 1, {
      seq: 1,
      input: walk as unknown as Record<string, unknown>,
    });
    rig.session.advance(TICK_MS * 3);
    expect(held).toEqual([]);
    expect(lastStateFrame(a)?.ack).toBe(3);
  });
});

describe("the predicted local hero", () => {
  it("moves between publishes and lands on the server's answer", () => {
    const rig = createRig();
    const a = rig.attach({ predict: true });
    takeTheField(rig, a);
    // The walk must be COMBAT-FREE — the claim under test is prediction, and
    // a mob brushing the hero applies server-side contact the client never
    // predicts. The parts moon GARRISONS its landing (one mob to a post, a
    // patroller among them), so the field is cleared outright: no bodies, and
    // no posts to stand replacements back up mid-walk.
    rig.session.state.enemies = [];
    rig.session.state.mobSpawns = [];
    rig.session.advance(TICK_MS);
    const state = a.client.state!;
    const spawn = { ...state.players[0].pos };
    // Due east from the moon's landing is open ground for hundreds of units —
    // a quiet walk with no combat to sully the determinism claim.
    const walk = steer(spawn.x + 250, spawn.y);
    let lastTick = a.client.tick;
    let movedBetweenPublishes = 0;
    let snapshotsChecked = 0;
    for (let i = 0; i < 120; i++) {
      const before = { ...state.players[0].pos };
      a.client.sendInput(walk);
      // The predicted step ran INSIDE sendInput — before any snapshot could
      // have arrived — so this displacement is prediction's own.
      const after = state.players[0].pos;
      const stepped = Math.hypot(after.x - before.x, after.y - before.y);
      // A first-sight thought freezes the world for everybody; tap through it
      // exactly as a player would.
      if (rig.session.state.dialogue) a.client.sendCommand("advanceDialogue");
      rig.session.advance(TICK_MS);
      if (a.client.tick !== lastTick) {
        lastTick = a.client.tick;
        // A snapshot just landed and was reconciled. Same engine, same
        // inputs, same ground: the replayed position IS the server's.
        const mine = state.players[0].pos;
        const theirs = rig.session.state.players[0].pos;
        expect(Math.hypot(mine.x - theirs.x, mine.y - theirs.y)).toBeLessThan(
          0.01,
        );
        snapshotsChecked++;
      } else if (stepped > 0) {
        movedBetweenPublishes++;
      }
    }
    // The hero answered the stick at 60 Hz, not at the 20 Hz publish rate:
    // most non-publish frames moved him.
    expect(movedBetweenPublishes).toBeGreaterThan(40);
    expect(snapshotsChecked).toBeGreaterThan(20);
    // And he actually went somewhere, or all of the above is vacuous.
    const at = state.players[0].pos;
    expect(Math.hypot(at.x - spawn.x, at.y - spawn.y)).toBeGreaterThan(50);
  });

  it("reconciles a dropped input frame instead of teleporting", () => {
    const rig = createRig();
    let dropSeq = -1;
    const a = rig.attach({
      predict: true,
      dropInput: (seq) => seq === dropSeq,
    });
    takeTheField(rig, a);
    const state = a.client.state!;
    const spawn = { ...state.players[0].pos };
    // Settle: thirty idle frames, seqs 1..30.
    for (let i = 0; i < 30; i++) {
      a.client.sendInput(IDLE);
      rig.session.advance(TICK_MS);
    }
    // The FIRST frame of the walk is lost: the client predicts a step the
    // server never hears about — a real mispredict, not a no-op.
    dropSeq = 31;
    const walk = steer(spawn.x + 200, spawn.y);
    let worstFrameJump = 0;
    let prev = { ...state.players[0].pos };
    for (let i = 0; i < 60; i++) {
      a.client.sendInput(walk);
      if (rig.session.state.dialogue) a.client.sendCommand("advanceDialogue");
      rig.session.advance(TICK_MS);
      const at = state.players[0].pos;
      worstFrameJump = Math.max(
        worstFrameJump,
        Math.hypot(at.x - prev.x, at.y - prev.y),
      );
      prev = { ...at };
    }
    // No frame teleported: the biggest single-frame move stays within a
    // step-plus-blend, nowhere near a snap across the mispredicted distance —
    // and light-years from a reset to the map origin.
    expect(worstFrameJump).toBeLessThan(10);
    // Stop steering and let the reconcile blend converge onto the server.
    for (let i = 0; i < 30; i++) {
      a.client.sendInput(IDLE);
      rig.session.advance(TICK_MS);
    }
    const mine = state.players[0].pos;
    const theirs = rig.session.state.players[0].pos;
    expect(Math.hypot(mine.x - theirs.x, mine.y - theirs.y)).toBeLessThan(0.5);
    // And the walk actually happened on BOTH sides.
    expect(theirs.x - spawn.x).toBeGreaterThan(30);
  });
});

describe("what a predicted step may touch", () => {
  it("moves the hero and nothing shared — no combat, no rng, no meters", () => {
    // Engine-level, on the same run a session simulates. A seismic-trained
    // hero coming down from a hop is the loudest landing the engine has: the
    // authoritative step damages every enemy in the slam radius through
    // `hitEnemy` (crit and loot rolls — rng draws). The PREDICTED step must
    // do none of it.
    const state = startGame();
    stopWaves(state);
    const hero = state.players[0];
    hero.talents = { seismic_landing: 3 };
    expect(talentSeismic(state, hero)).not.toBeNull(); // not vacuous
    const mob = makeEnemy({
      pos: { x: hero.pos.x + 15, y: hero.pos.y },
      hp: 1e6,
      maxHp: 1e6,
      speed: 0,
    });
    state.enemies = [mob];
    // Mid-fall, about to touch down this very step.
    hero.z = 0.5;
    hero.vz = -100;
    const events = state.events;
    const eventCount = events.length;
    const before = {
      rng: rngState(state.rng),
      moveSpawnCredit: state.moveSpawnCredit,
      jumps: state.stats.jumps,
      regenLock: state.staminaRegenLockMs,
      emptyMs: state.staminaEmptyMs,
      hp: mob.hp,
      enemies: state.enemies.length,
    };
    predictHeroMovement(state, hero, IDLE_INPUT, TICK_MS / 1000, TICK_MS);
    // The MOVEMENT happened: he landed.
    expect(hero.z).toBe(0);
    expect(hero.vz).toBe(0);
    // The COMBAT did not: no slam, no damage, no rng consumed.
    expect(mob.hp).toBe(before.hp);
    expect(state.enemies.length).toBe(before.enemies);
    expect(rngState(state.rng)).toBe(before.rng);
    // The shared meters did not move, and the land event never leaked out of
    // the scratch sink — same array, same content.
    expect(state.events).toBe(events);
    expect(state.events.length).toBe(eventCount);
    expect(state.moveSpawnCredit).toBe(before.moveSpawnCredit);
    expect(state.stats.jumps).toBe(before.jumps);
    expect(state.staminaRegenLockMs).toBe(before.regenLock);
    expect(state.staminaEmptyMs).toBe(before.emptyMs);
  });

  it("banks no spawn pressure and no jump stat for a walking, hopping hero", () => {
    const state = startGame();
    stopWaves(state);
    const hero = state.players[0];
    const from = { ...hero.pos };
    const before = {
      rng: rngState(state.rng),
      moveSpawnCredit: state.moveSpawnCredit,
      jumps: state.stats.jumps,
    };
    const hop: GameInput = {
      steering: true,
      target: { x: from.x + 100, y: from.y },
      jump: true,
      useItem: false,
    };
    predictHeroMovement(state, hero, hop, TICK_MS / 1000, TICK_MS);
    // He moved and took off…
    expect(hero.pos.x).toBeGreaterThan(from.x);
    expect(hero.vz).toBeGreaterThan(0);
    // …and the run's ledgers never heard about it.
    expect(state.moveSpawnCredit).toBe(before.moveSpawnCredit);
    expect(state.stats.jumps).toBe(before.jumps);
    expect(rngState(state.rng)).toBe(before.rng);
  });
});

describe("remote-hero interpolation", () => {
  it("draws the other hero between its last two snapshots; a predict-off client sees raw snapshots", () => {
    const rig = createRig();
    const a = rig.attach({ predict: true });
    const b = rig.attach({ predict: false }); // the bot client's shape
    takeTheField(rig, a);
    const stateA = a.client.state!;
    const stateB = b.client.state!;
    const spawn = { ...rig.session.state.players[0].pos };
    const walkA = steer(spawn.x + 250, spawn.y);
    const walkB = steer(spawn.x + 250, spawn.y + 30);
    let lastTickA = a.client.tick;
    let lastTickB = b.client.tick;
    /** Seat 1's x as each snapshot left it on client A (authoritative). */
    const snapshotsX: number[] = [];
    let interpolatedChecked = 0;
    let rawMovesBetweenSnapshots = 0;
    for (let i = 0; i < 150; i++) {
      a.client.sendInput(walkA);
      b.client.sendInput(walkB);
      const rawBefore = stateB.players[0].pos.x;
      if (rig.session.state.dialogue) a.client.sendCommand("advanceDialogue");
      rig.session.advance(TICK_MS);
      if (a.client.tick !== lastTickA) {
        lastTickA = a.client.tick;
        snapshotsX.push(stateA.players[1]!.pos.x);
      } else if (snapshotsX.length >= 2) {
        // Between snapshots, A's view of the REMOTE hero sits between the
        // last two authoritative positions — one publish interval behind,
        // never extrapolated past what the server said.
        const x = stateA.players[1]!.pos.x;
        const lo = snapshotsX[snapshotsX.length - 2]!;
        const hi = snapshotsX[snapshotsX.length - 1]!;
        expect(x).toBeGreaterThanOrEqual(Math.min(lo, hi) - 1e-9);
        expect(x).toBeLessThanOrEqual(Math.max(lo, hi) + 1e-9);
        interpolatedChecked++;
      }
      if (b.client.tick !== lastTickB) {
        lastTickB = b.client.tick;
      } else if (stateB.players[0].pos.x !== rawBefore) {
        // The predict-off client's view of a remote hero moves ONLY when a
        // snapshot lands — raw replication, exactly what the bot client
        // measures the network with.
        rawMovesBetweenSnapshots++;
      }
    }
    expect(interpolatedChecked).toBeGreaterThan(30);
    expect(rawMovesBetweenSnapshots).toBe(0);
    // Both heroes actually travelled, or nothing above meant anything.
    expect(rig.session.state.players[0].pos.x - spawn.x).toBeGreaterThan(50);
    expect(rig.session.state.players[1]!.pos.x - spawn.x).toBeGreaterThan(50);
  });
});
