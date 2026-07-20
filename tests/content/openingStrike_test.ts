// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The scripted opening strike at SpaceZ HQ (LevelDef.openingStrike): the hero
// walks in with his sword holstered, and a lone VANGUARD scientist sprints out
// ahead of the pack to reach him and land a harmless first swing — THAT is what
// draws the blade, fires the "good thing I brought the sword" beat
// (spacez_armed), and turns the auto-attack on. Verifies the disarmed state,
// the ordering gate (the sighting read lands first), the CONTACT trigger (the
// swing lands when the rusher is on top of him, not half a screen away), the
// no-HP-cost strike, and that a non-vanguard touch stays harmless until the
// beat lands.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  botAct,
  createBot,
  createGame,
  dismissIntro,
  enemyDef,
  PLAYER,
  skipCutscene,
  step,
  type Enemy,
  type GameState,
} from "@game/core";

import { DT, idle, makeEnemy, SEED, stopWaves } from "../helpers.ts";

/**
 * A SpaceZ HQ run past the opening scenes but with the hero still DISARMED —
 * the real opening. (The shared `startGame` helper arms him on purpose so the
 * other suites test a fighting hero; here we want the holstered state.)
 */
function disarmedHQ(seed = SEED): GameState {
  const state = createGame(seed, "spacez_hq");
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** The lone vanguard the level places (the only mob that can arm the hero). */
function vanguard(state: GameState): Enemy {
  const found = state.enemies.find((e) => e.vanguard);
  if (!found) throw new Error("no vanguard placed");
  return found;
}

/** Strip the board to just the vanguard so no crowd or sighting interferes. */
function isolateVanguard(state: GameState): Enemy {
  stopWaves(state);
  const v = vanguard(state);
  state.enemies = [v];
  return v;
}

/** Tap an open dialogue closed, page by page. */
function tapThrough(state: GameState): void {
  while (state.dialogue) advanceDialogue(state);
}

describe("SpaceZ HQ opening strike", () => {
  it("opens the hero disarmed, and other levels armed", () => {
    expect(disarmedHQ().player.disarmed).toBe(true);
    const moon = createGame(SEED, "moon");
    skipCutscene(moon); // no prelude on the moon — a no-op
    dismissIntro(moon);
    expect(moon.player.disarmed ?? false).toBe(false);
  });

  it("places a lone vanguard that outruns the pack and cannot hurt him", () => {
    const v = vanguard(disarmedHQ());
    const def = enemyDef(v.defId);
    expect(def.role).toBe("minion");
    // The opening SPRINT outruns the pack; its plain speed is a normal mob's
    // (so it folds back in once the blade is drawn, not a permanent glue).
    expect(def.ai.rushSpeed).toBeGreaterThan(enemyDef("intern").speed);
    expect(def.speed).toBeLessThanOrEqual(enemyDef("scientist").speed);
    // …and crucially it outruns the HERO, so the contact-triggered beat can't
    // be kited into a stall: a fleeing hero still gets run down.
    expect(def.ai.rushSpeed).toBeGreaterThan(PLAYER.speed);
    expect(def.contactDamage).toBe(0);
  });

  it("holds at its post until the sighting beat plays, then breaks loose to reach him", () => {
    const state = disarmedHQ();
    // Strip to the vanguard AND the parked boss — keeping the boss means the
    // killBoss objective never clears, so a long idle hold doesn't tip the run
    // into `victory` and freeze the sim out from under the assertion.
    stopWaves(state);
    const v = vanguard(state);
    state.enemies = state.enemies.filter(
      (e) => e.vanguard || enemyDef(e.defId).role === "boss",
    );
    const startX = state.player.pos.x + 120;
    v.pos = { x: startX, y: state.player.pos.y };
    // Sighting gate held shut (no interns to fire spacez_staff): the vanguard
    // waits at its post through the hero's opening read rather than rushing him
    // before he has even looked around. It must NOT have closed the gap — the
    // "look at this place" monologue is meant to land first.
    for (let i = 0; i < 400; i++) step(state, idle, DT);
    expect(state.player.disarmed).toBe(true); // gate held, still holstered
    expect(v.pos.x).toBeCloseTo(startX, 5); // never left its post
    // The moment the beat plays, it breaks from the pack, sprints the hero
    // down, and its swing draws the blade — the rush follows the read.
    state.thoughtsSeen.push("spacez_staff");
    for (let i = 0; i < 400 && state.player.disarmed; i++)
      step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_armed",
    });
    // The blade came out with the scientist on top of him, not half a screen
    // away — a contact-range strike, never the old distant standoff.
    const dist = Math.hypot(
      v.pos.x - state.player.pos.x,
      v.pos.y - state.player.pos.y,
    );
    expect(dist).toBeLessThan(30);
  });

  it("drops the sprint to normal mob speed once the blade is drawn", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open
    v.pos = { ...state.player.pos };
    step(state, idle, DT); // strike lands, arms the hero
    tapThrough(state);
    expect(state.player.disarmed).toBe(false);
    // Now it chases like any minion: one tick advances at most its plain
    // snapshot `speed`, nowhere near the opening rushSpeed. Place it a clear
    // stretch away in the open lobby and measure a single tick's travel.
    v.awake = true;
    v.pos = { x: state.player.pos.x + 300, y: state.player.pos.y };
    const before = v.pos.x;
    step(state, idle, DT);
    const moved = before - v.pos.x; // travelled toward the hero (leftward)
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(v.speed * (DT / 1000) + 0.01);
    // …and unmistakably below what the opening sprint would have covered.
    const rushSpeed = enemyDef(v.defId).ai.rushSpeed ?? 0;
    expect(moved).toBeLessThan(rushSpeed * (DT / 1000));
  });

  it("holsters the weapon: no swing while disarmed, even point-blank", () => {
    const state = disarmedHQ();
    isolateVanguard(state);
    // Park a mob the sword would shred right on top of the hero.
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } }, "intern")];
    const before = state.stats.damageDealt;
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.stats.damageDealt).toBe(before); // never swung
    expect(state.player.disarmed).toBe(true);
  });

  it("arms the hero on the vanguard's strike — after the sighting beat", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // the gate's prerequisite
    v.pos = { ...state.player.pos }; // in contact
    const hp = state.player.hp;
    step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.player.hp).toBe(hp); // the first swing costs no HP
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_armed",
    });
    expect(state.thoughtsSeen).toContain("spacez_armed");
  });

  it("holds the blade until the vanguard reaches him, then draws it on contact", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open
    // A clear gap away — sprinting in, but nowhere near touching. A single
    // tick's rush can't close it, so the blade stays holstered: the beat waits
    // for the scientist to actually arrive, not a distant proximity read.
    v.pos = { x: state.player.pos.x + 80, y: state.player.pos.y };
    step(state, idle, DT);
    expect(state.player.disarmed).toBe(true);
    expect(state.dialogue).toBeNull();
    // Let it sprint the rest of the way in. It parks right up against the hero
    // and THAT touch draws the blade and fires the beat.
    for (let i = 0; i < 200 && state.player.disarmed; i++)
      step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_armed",
    });
    // The swing landed with the scientist on top of him — a contact gap, never
    // the old ~96 px half-a-screen standoff.
    const dist = Math.hypot(
      v.pos.x - state.player.pos.x,
      v.pos.y - state.player.pos.y,
    );
    expect(dist).toBeLessThan(30);
  });

  it("stays holstered while the vanguard has yet to reach him", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open
    // Way off across the lobby: a single tick's rush can't close the ~300 px
    // gap, so the blade stays holstered — the beat waits on the rusher arriving,
    // not on time.
    v.pos = { x: state.player.pos.x + 400, y: state.player.pos.y };
    step(state, idle, DT);
    expect(state.player.disarmed).toBe(true);
    expect(state.thoughtsSeen).not.toContain("spacez_armed");
    expect(state.dialogue).toBeNull();
  });

  it("holds the arming until the sighting beat has played (the gate)", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    v.pos = { ...state.player.pos };
    // spacez_staff not seen, and no interns on the board to fire it.
    for (let i = 0; i < 10; i++) step(state, idle, DT);
    expect(state.player.disarmed).toBe(true);
    expect(state.thoughtsSeen).not.toContain("spacez_armed");
    expect(state.dialogue).toBeNull();
  });

  it("arms the hero even if the vanguard dies before reaching him", () => {
    // The party (or a conjured power) can cut the lone rusher down before it
    // ever touches the holstered hero. Nothing else triggers the beat, so an
    // unhandled kill leaves the hero disarmed for the whole level while his
    // companions fight on without him — the "player won't attack" bug. Once
    // the sighting read has played, a vanquished vanguard must still draw the
    // blade.
    const state = disarmedHQ();
    isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open
    // The companions got there first: the vanguard is off the board, never
    // having reached the hero.
    state.enemies = [];
    step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.thoughtsSeen).toContain("spacez_armed");
    // A dead rusher landed no blow, so the arming costs no HP.
    // (hp is untouched — nothing struck him.)
  });

  it("keeps a non-vanguard touch harmless while disarmed", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open, so only the mob matters
    // Keep the vanguard ALIVE but far across the lobby (never reaching him) so
    // the safety net that arms on a vanquished vanguard stays out of it — here
    // we test only that a NON-vanguard touch is harmless and never draws the
    // blade.
    v.pos = { x: state.player.pos.x + 400, y: state.player.pos.y };
    // A regular scientist (contactDamage > 0) right on the hero — not the
    // vanguard, so it neither hurts him nor draws the blade.
    state.enemies = [
      v,
      makeEnemy({ pos: { ...state.player.pos } }, "scientist"),
    ];
    const hp = state.player.hp;
    for (let i = 0; i < 20; i++) step(state, idle, DT);
    expect(state.player.hp).toBe(hp);
    expect(state.player.disarmed).toBe(true);
    expect(state.dialogue).toBeNull();
  });

  it("plays the sighting read before the vanguard reaches him, on the real crowd", () => {
    // The full level (packed opening ring + the placed vanguard), an idle hero.
    const state = disarmedHQ();
    // The drop-in survey beat fires promptly — the crowd already fills the view,
    // so it must not wait for an intern to crawl to the tight default radius.
    let sawStaff = false;
    let vgapAtStaff = Infinity;
    for (let i = 0; i < 400 && !sawStaff; i++) {
      step(state, idle, DT);
      if (state.dialogue?.source.kind === "playerThought") {
        const src = state.dialogue.source as { defId: string };
        if (src.defId === "spacez_staff") {
          sawStaff = true;
          const v = vanguard(state);
          vgapAtStaff = Math.hypot(
            v.pos.x - state.player.pos.x,
            v.pos.y - state.player.pos.y,
          );
        }
      }
    }
    expect(sawStaff).toBe(true);
    expect(state.player.disarmed).toBe(true); // still holstered at this point
    // The vanguard has NOT reached him yet — the read lands first, and the
    // scientist is still out in the lobby (its 180 px start), not glued on.
    expect(vgapAtStaff).toBeGreaterThan(100);
    // Tap the read closed; now the vanguard breaks loose, closes, and its
    // strike arms the hero and opens the "good thing I came armed" beat.
    tapThrough(state);
    for (let i = 0; i < 600 && state.player.disarmed; i++)
      step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_armed",
    });
  });

  it("resumes normal combat once armed", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff");
    v.pos = { ...state.player.pos };
    step(state, idle, DT); // the strike arms him and opens spacez_armed
    tapThrough(state);
    expect(state.phase).toBe("playing");

    // A fresh target in reach now takes sword damage — the weapon is live.
    state.enemies.push(
      makeEnemy(
        {
          id: 9100,
          pos: { x: state.player.pos.x + 10, y: state.player.pos.y },
          hp: 200,
          maxHp: 200,
        },
        "intern",
      ),
    );
    const before = state.stats.damageDealt;
    for (let i = 0; i < 60; i++) step(state, idle, DT);
    expect(state.stats.damageDealt).toBeGreaterThan(before);
  });

  it("the autopilot holds its ground for the strike, without diving in", () => {
    // Regression for two "ARM UP" bugs. First the bot dove ONTO the nearest foe,
    // burying the hero mid-crowd (12–17 bodies) unarmed. The fix added a standoff
    // — but holding it made the hero KITE the rusher, backpedalling the whole pack
    // ~200px into the far wall over ~7s before the harmless touch ever landed
    // (the vanguard only barely outruns his walk). He now reads the scripted
    // sequence for what it is: close to the standoff, then STAND STILL and take
    // the (damage-free, pre-combat-grace) hit. Holding position lets the pack
    // close, so a handful of bodies gather inside the ring — but he's armed in a
    // couple of seconds, far short of a real dive.
    const state = disarmedHQ();
    const startX = state.player.pos.x;
    const bot = createBot("survivor");
    let maxCrowdWhileDisarmed = 0;
    let armedStep = -1;
    let backpedal = 0;
    for (let i = 0; i < 1200; i++) {
      if (state.dialogue) {
        advanceDialogue(state);
        continue;
      }
      step(state, botAct(bot, state), DT);
      if (!state.player.disarmed) {
        armedStep = i;
        break;
      }
      const p = state.player.pos;
      backpedal = Math.max(backpedal, startX - p.x);
      const crowd = state.enemies.filter(
        (e) =>
          !enemyDef(e.defId).apparition &&
          Math.hypot(e.pos.x - p.x, e.pos.y - p.y) < 150,
      ).length;
      maxCrowdWhileDisarmed = Math.max(maxCrowdWhileDisarmed, crowd);
    }
    // He got armed (the vanguard reached him) …
    expect(armedStep).toBeGreaterThanOrEqual(0);
    // … quickly — he stood his ground instead of dragging the rusher across the
    // floor (the kite armed him at ~step 400, standing gets there in ~140).
    expect(armedStep).toBeLessThanOrEqual(250);
    // … he stood his ground rather than fleeing into the wall (kiting backpedalled
    // ~200px; standing holds the spawn).
    expect(backpedal).toBeLessThanOrEqual(20);
    // … without burying himself in the pack (a dive lands 12+ bodies here).
    expect(maxCrowdWhileDisarmed).toBeLessThanOrEqual(9);
  });
});
