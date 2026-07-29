// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREEN-NUKE'S DEAD, and what the MATURE CONTENT switch does to them.
//
// A nuke kill normally burns the body up: the `incinerated` flag rides out on the
// engine's `enemyKilled` event and the app answers with the fire-and-skeleton
// effect INSTEAD of the gore splash and the plain corpse. It is the most graphic
// thing the game does, so the device's MATURE CONTENT switch takes it away — and
// what it must fall back to is the ORDINARY death, punt and topple included.
//
// That fallback is the whole point of this suite, and it is easy to get wrong in
// a way nothing else catches: suppress the incinerate EFFECT alone and a censored
// blast kills a screenful of mobs whose bodies simply cease to exist, which reads
// as a bug rather than as a gentler game. Dropping the FLAG instead puts every
// kill back on the normal corpse path, so the bomb knocks them down like any other
// killing blow — which is exactly what the switch promises.

import { beforeEach, describe, expect, it } from "vitest";

import type { GameEvent } from "@game/core";

import { setDevicePolicyForTest } from "../pwa/src/app/device-policy.ts";
import {
  applyEventFx,
  type EventFxCtx,
} from "../pwa/src/game/game-screen/event-fx.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { startGame } from "./helpers.ts";

/** A WARM-BLOODED minion: the blood assertions below are only meaningful on
 * something that bleeds, since ghosts and machines keep the plain ecto/sparks
 * splash regardless of any switch. */
const MINION = "cia_agent";

/** A nuked minion, killed well off to the hero's side so the corpse punt has a
 * direction to throw it in. */
function nukeKill(pos: { x: number; y: number }): GameEvent {
  return {
    type: "enemyKilled",
    pos,
    defId: MINION,
    damage: 400,
    maxHp: 100,
    crit: false,
    xp: 10,
    incinerated: true,
  };
}

/** Run one event through the app's fx pass and hand back the effects it pushed.
 * Only the pieces the kill path actually touches are stood up — it never reaches
 * for the atlas (that is the jump's dust), so a bare context is honest here
 * rather than a stub pretending to be one. */
function effectsFor(event: GameEvent) {
  const state = startGame();
  const effects: EventFxCtx["shared"]["effects"] = [];
  const shared = { effects } as EventFxCtx["shared"];
  applyEventFx(event, {
    state,
    shared,
    sprites: {} as EventFxCtx["sprites"],
    mergedKills: new Set(),
    heroGore: null,
    pushPickup: () => {},
    showAreaCaption: () => {},
    showPickupCard: () => {},
  });
  return effects;
}

beforeEach(() => {
  setDevicePolicyForTest(null);
  updateSettings({ extraGore: "on", blood: 1, knockback: 1 });
});

describe("a screen-nuke kill", () => {
  it("burns the body to a skeleton when mature content is allowed", () => {
    const effects = effectsFor(nukeKill({ x: 900, y: 500 }));
    expect(effects.some((e) => e.kind === "incinerate")).toBe(true);
    expect(effects.some((e) => e.kind === "corpse")).toBe(false);
    // The fire replaces the splatter, so nothing bleeds either.
    expect(effects.some((e) => e.kind === "blood")).toBe(false);
  });

  it("falls back to the ordinary corpse when mature content is off", () => {
    setDevicePolicyForTest({ nsfw: false, store: true });
    const effects = effectsFor(nukeKill({ x: 900, y: 500 }));
    expect(effects.some((e) => e.kind === "incinerate")).toBe(false);
    const corpse = effects.find((e) => e.kind === "corpse");
    expect(corpse).toBeDefined();
  });

  it("still knocks the body over like any other killing blow", () => {
    // The promise in the settings copy: without mature content the bomb hits
    // like ordinary damage. A corpse with no launch would be a body deleted on
    // the spot, which is the failure this whole suite exists to catch.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const corpse = effectsFor(nukeKill({ x: 900, y: 500 })).find(
      (e) => e.kind === "corpse",
    );
    expect(corpse?.launch).toBeDefined();
    expect(corpse?.launch?.dist).toBeGreaterThan(0);
  });

  it("does not bleed even on the ordinary corpse path", () => {
    // MATURE CONTENT off means no blood ANYWHERE — putting the kill back on the
    // normal path must not quietly put the spray back with it.
    setDevicePolicyForTest({ nsfw: false, store: true });
    const effects = effectsFor(nukeKill({ x: 900, y: 500 }));
    expect(effects.some((e) => e.kind === "blood")).toBe(false);
    // The plain two-frame splash still marks the hit, so a blow still reads as
    // one landing rather than as a miss.
    expect(effects.some((e) => e.kind === "splash")).toBe(true);
  });
});
