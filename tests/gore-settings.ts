// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The GORE page's switches, as a test setup. Not a test file itself — vitest
// only collects `*_test.ts` / `*_tests.ts`.
//
// Built from `GORE_SWITCHES` rather than typed out, so a suite that stages "all
// the gore on" keeps staging all of it when a ninth kind is added — the failure
// mode of a hand-written literal is a new switch nothing ever exercises, which
// looks exactly like a passing suite.

import {
  GORE_SWITCHES,
  type GoreSwitch,
  type GoreSwitchKey,
} from "../pwa/src/game/settings.ts";

function every(value: GoreSwitch): Record<GoreSwitchKey, GoreSwitch> {
  return Object.fromEntries(GORE_SWITCHES.map((key) => [key, value])) as Record<
    GoreSwitchKey,
    GoreSwitch
  >;
}

/** The shipped state: every kind of gore on. */
export const ALL_GORE_ON = every("on");

/** The other end — what a player who wants none of it has set. */
export const ALL_GORE_OFF = every("off");
