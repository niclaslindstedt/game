// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AoE-independence rule: a melee swing that cleaves a crowd rolls each
// body's blow on its own, so the struck foes take a SPREAD of damage numbers
// instead of one figure stamped across all of them (each still gets its own
// crit/miss/dodge roll too). See `meleeSweep` / `rollWeaponHit`.

import { describe, expect, it } from "vitest";

import { step } from "@game/core";

import { makeEnemy, startGame } from "./helpers.ts";

describe("melee AoE damage", () => {
  it("rolls each cleaved body's damage independently", () => {
    const state = startGame(); // default melee weapon (crude_sword, variance 0.2)
    // Two foes on top of the hero: both inside reach and always in the cone, so
    // the swing (baseAoeTargets = 2) catches exactly both in one blow.
    const at = { x: state.player.pos.x, y: state.player.pos.y };
    state.enemies = [
      makeEnemy({ id: 1, pos: { ...at }, hp: 200, maxHp: 200 }),
      makeEnemy({ id: 2, pos: { ...at }, hp: 200, maxHp: 200 }),
    ];
    // Every accuracy/crit roll comes up high: no miss, no dodge, no crit — so
    // the only thing separating the two numbers is the per-body damage roll.
    state.rng = () => 0.99;
    state.player.disarmed = false;
    state.player.weaponCooldownMs = 0;
    step(state, { steering: false, target: { x: 0, y: 0 }, jump: false }, 16);

    const hits = state.events.filter((e) => e.type === "enemyHit");
    expect(hits.length).toBe(2);
    const [a, b] = hits.map((e) => (e as { damage: number }).damage);
    // Independent variance rolls off fxRng — the two blows differ.
    expect(a).not.toBe(b);
  });
});
