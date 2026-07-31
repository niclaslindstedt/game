// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The scripted opening strike at GOODCO HQ (LevelDef.openingStrike): the hero
// walks in with his weapon holstered, and a lone VANGUARD scientist sprints out
// ahead of the pack to reach him and swing at him — THREE TIMES. The first two
// blows land on a man who will not hit back: these are his old colleagues, and
// he names them, tells the floor to stand down, says he has never raised a hand
// to anyone (`openingStrike.warnings` → goodco_first_blow, goodco_second_blow).
// Only the THIRD draws the weapon, fires the apology beat (goodco_armed) and
// turns the auto-attack on. Verifies the disarmed state, the ordering gate (the
// sighting read lands first), the CONTACT trigger (a swing lands when the rusher
// is on top of him, not half a screen away), the ESCALATION (three separate
// blows, in order, with the striker shoved off between them so each is its own
// event), the no-HP-cost strikes, and that a non-vanguard touch stays harmless
// until the beat lands.

import { describe, expect, it } from "vitest";

import { distance } from "@game/lib/vec.ts";
import {
  advanceDialogue,
  botAct,
  createBot,
  createGame,
  dismissIntro,
  enemyDef,
  markThoughtsSeen,
  mobRushSpeed,
  muteDialogue,
  PLAYER,
  runLevelDef,
  skipCutscene,
  step,
  type Enemy,
  type GameState,
} from "@game/core";

import { DT, idle, makeEnemy, SEED, stopWaves } from "../helpers.ts";

/**
 * A GOODCO HQ run past the opening scenes but with the hero still DISARMED —
 * the real opening. (The shared `startGame` helper arms him on purpose so the
 * other suites test a fighting hero; here we want the holstered state.)
 */
function disarmedHQ(seed = SEED): GameState {
  const state = createGame(seed, "goodco_hq");
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

/**
 * Play the whole scripted beat out on an idle hero: step until the weapon is
 * drawn, tapping every scene closed as it opens, and return the thought ids the
 * strike fired IN ORDER. Stops with the ARMING scene still on stage (the
 * assertions below read `state.dialogue`), and returns an empty list for a
 * seeded ledger where nothing is re-shown.
 */
function playOpeningBeats(state: GameState, maxSteps = 2000): string[] {
  const fired: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const src = state.dialogue?.source;
    if (src?.kind === "playerThought" && fired.at(-1) !== src.defId) {
      fired.push(src.defId);
    }
    if (!state.players[0].disarmed) return fired;
    if (state.dialogue) {
      advanceDialogue(state);
      continue;
    }
    step(state, idle, DT);
  }
  throw new Error("the opening strike never armed the hero");
}

/** The two beats his refusals play, then the one his answer plays. */
const WARNINGS = ["goodco_first_blow", "goodco_second_blow"];
const ARMED = "goodco_armed";
/** The whole ledger a replay / BOT VIEW run seeds (see `markThoughtsSeen`). */
const READ_LEDGER = ["goodco_staff", ...WARNINGS, ARMED];

describe("GOODCO HQ opening strike", () => {
  it("opens the hero disarmed, and other levels armed", () => {
    expect(disarmedHQ().players[0].disarmed).toBe(true);
    const moon = createGame(SEED, "moon");
    skipCutscene(moon); // no prelude on the moon — a no-op
    dismissIntro(moon);
    expect(moon.players[0].disarmed ?? false).toBe(false);
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
    // be kited into a stall: a fleeing hero still gets run down. Compared in
    // WORLD PX/S — `mobRushSpeed` applies the horde's tempo scale, which
    // `PLAYER.speed` does not carry (see mobSpeed).
    expect(mobRushSpeed(def)).toBeGreaterThan(PLAYER.speed);
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
    const startX = state.players[0].pos.x + 120;
    v.pos = { x: startX, y: state.players[0].pos.y };
    // Sighting gate held shut (no interns to fire goodco_staff): the vanguard
    // waits at its post through the hero's opening read rather than rushing him
    // before he has even looked around. It must NOT have closed the gap — the
    // "look at this place" monologue is meant to land first.
    for (let i = 0; i < 400; i++) step(state, idle, DT);
    expect(state.players[0].disarmed).toBe(true); // gate held, still holstered
    expect(v.pos.x).toBeCloseTo(startX, 5); // never left its post
    // The moment the beat plays, it breaks from the pack, sprints the hero
    // down, and its three swings draw the blade — the rush follows the read.
    state.thoughtsSeen.push("goodco_staff");
    expect(playOpeningBeats(state)).toEqual([...WARNINGS, ARMED]);
    expect(state.players[0].disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: ARMED,
    });
    // The blade came out with the scientist on top of him, not half a screen
    // away — a contact-range strike, never the old distant standoff.
    const dist = distance(v.pos, state.players[0].pos);
    expect(dist).toBeLessThan(30);
  });

  it("drops the sprint to normal mob speed once the blade is drawn", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // gate open
    v.pos = { ...state.players[0].pos };
    playOpeningBeats(state); // the three blows land and arm the hero
    tapThrough(state);
    expect(state.players[0].disarmed).toBe(false);
    // Now it chases like any minion: one tick advances at most its plain
    // snapshot `speed`, nowhere near the opening rushSpeed. The floor is carved
    // fresh per run, so the stretch it is placed on is cleared first — a body
    // shoved out of a crate it was dropped inside travels a great deal further
    // than it walks, and this measures WALKING.
    state.obstacles = [];
    // …and of the trader's SAFE pocket, which shoves a minion out of it at a
    // pace that has nothing to do with walking.
    runLevelDef(state).safeZones = [];
    v.awake = true;
    // Placed toward the middle of the map rather than blindly east: the hero
    // lands wherever the carve put him, and a body pushed back off the world's
    // edge would travel further in one tick than any mob can walk.
    const hero = state.players[0].pos;
    const dir = hero.x < state.level.width / 2 ? 1 : -1;
    v.pos = { x: hero.x + 300 * dir, y: hero.y };
    const before = v.pos.x;
    step(state, idle, DT);
    // Travelled toward the hero, whichever side it was put on.
    const moved = (before - v.pos.x) * dir;
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
    state.enemies = [makeEnemy({ pos: { ...state.players[0].pos } }, "intern")];
    const before = state.stats.damageDealt;
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.stats.damageDealt).toBe(before); // never swung
    expect(state.players[0].disarmed).toBe(true);
  });

  it("arms the hero on the vanguard's THIRD strike — after the sighting beat", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // the gate's prerequisite
    v.pos = { ...state.players[0].pos }; // in contact
    const hp = state.players[0].hp;
    expect(playOpeningBeats(state)).toEqual([...WARNINGS, ARMED]);
    expect(state.players[0].disarmed).toBe(false);
    // NONE of the three swings costs HP — the refusals are as free as the
    // answer, or a hero who stands there taking two extra blows would be paying
    // for the scene the game chose to make him sit through.
    expect(state.players[0].hp).toBe(hp);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: ARMED,
    });
    expect(state.thoughtsSeen).toContain(ARMED);
  });

  it("takes three separate blows, in order, and answers only the third", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // gate open
    v.pos = { ...state.players[0].pos }; // in contact

    // BLOW ONE. He is hit, and he does not hit back: the weapon stays holstered
    // and the beat that plays is a refusal, not a draw.
    step(state, idle, DT);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: WARNINGS[0],
    });
    expect(state.players[0].disarmed).toBe(true);
    // …and the striker was SHOVED OFF. Without that he is still parked on the
    // hero, satisfies the contact trigger again on the very next tick, and all
    // three beats stack back to back with nothing happening between them —
    // which reads as one long scene rather than as being hit three times.
    expect(v.knockMs ?? 0).toBeGreaterThan(0);
    tapThrough(state);

    // BLOW TWO. He has to pick himself up and come back in for it — a real gap
    // opens between them first — and it still buys no answer.
    let apart = 0;
    for (let i = 0; i < 400 && !state.dialogue; i++) {
      step(state, idle, DT);
      apart = Math.max(apart, distance(v.pos, state.players[0].pos));
    }
    // The shove put clear floor between them (the contact radius is 22 px), so
    // the second blow is something the player watches ARRIVE.
    expect(apart).toBeGreaterThan(30);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: WARNINGS[1],
    });
    expect(state.players[0].disarmed).toBe(true);
    tapThrough(state);

    // BLOW THREE is the one he answers.
    for (let i = 0; i < 400 && state.players[0].disarmed; i++)
      step(state, idle, DT);
    expect(state.players[0].disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: ARMED,
    });
    expect(state.thoughtsSeen).toEqual(
      expect.arrayContaining([...WARNINGS, ARMED]),
    );
  });

  it("never swings back during the warnings, however long they take", () => {
    // The whole point of the escalation is that the first two blows are
    // ANSWERED WITH WORDS. An auto-attack that woke up between them would make
    // the refusal a lie the player can watch being told.
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff");
    v.pos = { ...state.players[0].pos };
    const before = state.stats.damageDealt;
    for (let i = 0; i < 600; i++) {
      if (state.dialogue) {
        // Stop at the answering beat: from there on he IS fighting.
        if (state.dialogue.source.kind === "playerThought") {
          const src = state.dialogue.source as { defId: string };
          if (src.defId === ARMED) break;
        }
        advanceDialogue(state);
        continue;
      }
      step(state, idle, DT);
      expect(state.stats.damageDealt).toBe(before);
    }
    expect(state.thoughtsSeen).toContain(ARMED);
  });

  it("arms even when the strike's thought is already seen (replay / BOT VIEW)", () => {
    // Regression: a REPLAY — or DEVELOPER → BOT VIEW, which seeds this
    // difficulty's read ledger into the fresh run via `markThoughtsSeen` —
    // starts with `goodco_armed` ALREADY in thoughtsSeen. The old hook bailed
    // outright on that (`includes(thought)` early return), so a holstered hero
    // whose vanguard reached him was never armed: the strike no-op'd and the
    // pack just piled up around him for the whole level. The blade must still be
    // drawn — arming is gated by `disarmed`, not by the monologue being unread.
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    // The whole ledger pre-seeded, exactly as a replay's would be — the two
    // refusals included, so the escalation is spent and the FIRST blow answers.
    state.thoughtsSeen.push(...READ_LEDGER);
    v.pos = { ...state.players[0].pos }; // in contact
    step(state, idle, DT);
    // He drew the blade despite the beat already being marked read …
    expect(state.players[0].disarmed).toBe(false);
    // … and did NOT re-open the already-read monologue.
    expect(state.dialogue).toBeNull();
  });

  it("holds the blade until the vanguard reaches him, then draws it on contact", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // gate open
    // A clear gap away — sprinting in, but nowhere near touching. A single
    // tick's rush can't close it, so the blade stays holstered: the beat waits
    // for the scientist to actually arrive, not a distant proximity read.
    v.pos = { x: state.players[0].pos.x + 80, y: state.players[0].pos.y };
    step(state, idle, DT);
    expect(state.players[0].disarmed).toBe(true);
    expect(state.dialogue).toBeNull();
    // Let it sprint the rest of the way in. It parks right up against the hero,
    // and THAT touch is the first of the three that end with the blade out.
    expect(playOpeningBeats(state)).toEqual([...WARNINGS, ARMED]);
    expect(state.players[0].disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: ARMED,
    });
    // The swing landed with the scientist on top of him — a contact gap, never
    // the old ~96 px half-a-screen standoff.
    const dist = distance(v.pos, state.players[0].pos);
    expect(dist).toBeLessThan(30);
  });

  it("stays holstered while the vanguard has yet to reach him", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // gate open
    // Way off across the lobby: a single tick's rush can't close the ~300 px
    // gap, so the blade stays holstered — the beat waits on the rusher arriving,
    // not on time.
    v.pos = { x: state.players[0].pos.x + 400, y: state.players[0].pos.y };
    step(state, idle, DT);
    expect(state.players[0].disarmed).toBe(true);
    expect(state.thoughtsSeen).not.toContain(WARNINGS[0]);
    expect(state.thoughtsSeen).not.toContain(ARMED);
    expect(state.dialogue).toBeNull();
  });

  it("holds the arming until the sighting beat has played (the gate)", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    v.pos = { ...state.players[0].pos };
    // goodco_staff not seen, and no interns on the board to fire it.
    for (let i = 0; i < 10; i++) step(state, idle, DT);
    expect(state.players[0].disarmed).toBe(true);
    expect(state.thoughtsSeen).not.toContain(WARNINGS[0]);
    expect(state.thoughtsSeen).not.toContain(ARMED);
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
    state.thoughtsSeen.push("goodco_staff"); // gate open
    // The companions got there first: the vanguard is off the board, never
    // having reached the hero.
    state.enemies = [];
    step(state, idle, DT);
    // A VANQUISHED vanguard skips the escalation whole. There is nobody left to
    // refuse, so holding him unarmed through warnings that can never be
    // delivered would reinstate the very soft-lock this net exists for.
    expect(state.players[0].disarmed).toBe(false);
    expect(state.thoughtsSeen).toContain(ARMED);
    // A dead rusher landed no blow, so the arming costs no HP.
    // (hp is untouched — nothing struck him.)
  });

  it("keeps a non-vanguard touch harmless while disarmed", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff"); // gate open, so only the mob matters
    // Keep the vanguard ALIVE but far across the lobby (never reaching him) so
    // the safety net that arms on a vanquished vanguard stays out of it — here
    // we test only that a NON-vanguard touch is harmless and never draws the
    // blade.
    v.pos = { x: state.players[0].pos.x + 400, y: state.players[0].pos.y };
    // A regular scientist (contactDamage > 0) right on the hero — not the
    // vanguard, so it neither hurts him nor draws the blade.
    state.enemies = [
      v,
      makeEnemy({ pos: { ...state.players[0].pos } }, "scientist"),
    ];
    const hp = state.players[0].hp;
    for (let i = 0; i < 20; i++) step(state, idle, DT);
    expect(state.players[0].hp).toBe(hp);
    expect(state.players[0].disarmed).toBe(true);
    expect(state.dialogue).toBeNull();
    expect(state.thoughtsSeen).not.toContain(WARNINGS[0]);
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
        if (src.defId === "goodco_staff") {
          sawStaff = true;
          const v = vanguard(state);
          vgapAtStaff = Math.hypot(
            v.pos.x - state.players[0].pos.x,
            v.pos.y - state.players[0].pos.y,
          );
        }
      }
    }
    expect(sawStaff).toBe(true);
    expect(state.players[0].disarmed).toBe(true); // still holstered at this point
    // The vanguard has NOT reached him yet — the read lands first, and the
    // scientist is still out in the lobby (its 180 px start), not glued on.
    expect(vgapAtStaff).toBeGreaterThan(100);
    // Tap the read closed; now the vanguard breaks loose, closes, and its three
    // strikes walk the hero through both refusals and out the other side with
    // the weapon drawn — in order, on the real crowd.
    tapThrough(state);
    expect(playOpeningBeats(state)).toEqual([...WARNINGS, ARMED]);
    expect(state.players[0].disarmed).toBe(false);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: ARMED,
    });
  });

  it("resumes normal combat once armed", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("goodco_staff");
    v.pos = { ...state.players[0].pos };
    playOpeningBeats(state); // the three blows arm him and open goodco_armed
    tapThrough(state);
    expect(state.phase).toBe("playing");

    // A fresh target in reach now takes sword damage — the weapon is live.
    state.enemies.push(
      makeEnemy(
        {
          id: 9100,
          pos: { x: state.players[0].pos.x + 10, y: state.players[0].pos.y },
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
    const startX = state.players[0].pos.x;
    const bot = createBot("survivor");
    let maxCrowdWhileDisarmed = 0;
    let armedStep = -1;
    let backpedal = 0;
    for (let i = 0; i < 1200; i++) {
      if (state.dialogue) {
        advanceDialogue(state);
        continue;
      }
      step(state, botAct(bot, state, state.players[0]), DT);
      if (!state.players[0].disarmed) {
        armedStep = i;
        break;
      }
      const p = state.players[0].pos;
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
    // … without burying himself in the pack. This bound is DENSITY-RELATIVE,
    // not a fact about the bot: standing his ground while the pack closes reads
    // 14 bodies inside the ring at the shipped `mobCountMult` (it read 8 at the
    // pre-density-ladder counts), and the dive this guards against buried him at
    // roughly half again that. So the number tracks the rung's mob count — if
    // the ladder moves, re-measure the standing value rather than nudging this
    // until it passes; `armedStep` and `backpedal` above are the assertions that
    // actually pin the BEHAVIOUR, and neither moved with the density.
    expect(maxCrowdWhileDisarmed).toBeLessThanOrEqual(16);
  });

  it("the autopilot still arms with a seeded ledger (BOT VIEW / replay)", () => {
    // Regression for the iOS-PWA BOT VIEW soft-lock: DEVELOPER → BOT VIEW opens
    // via the warp/skipOpening path (a DISARMED arrival hero) and seeds this
    // difficulty's read ledger through `markThoughtsSeen`, so `goodco_armed` is
    // already marked seen. The opening-strike hook used to bail on that, so the
    // vanguard reached the holstered hero and the strike no-op'd — the pack just
    // piled up around a defenceless hero forever ("ARM UP" stuck on screen). He
    // must still draw the blade. Muted like a real BOT VIEW run.
    for (const seed of [SEED, 1, 2, 3]) {
      const state = createGame(seed, "goodco_hq", "easy");
      markThoughtsSeen(state, READ_LEDGER);
      skipCutscene(state);
      dismissIntro(state); // skipOpening leaves him disarmed
      muteDialogue(state);
      expect(state.players[0].disarmed).toBe(true);
      const bot = createBot("survivor");
      let armedStep = -1;
      for (let i = 0; i < 1200; i++) {
        step(state, botAct(bot, state, state.players[0]), DT);
        if (!state.players[0].disarmed) {
          armedStep = i;
          break;
        }
      }
      expect(armedStep).toBeGreaterThanOrEqual(0);
    }
  });
});
