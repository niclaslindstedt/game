// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH HERO THIS SCREEN IS ABOUT.
//
// The engine's `state.players` is the whole party; almost everything the APP
// does with it is about ONE of them — the one this machine is steering, whose
// bag the inventory shows, whose health the bar draws, and whom the camera
// follows. That hero is `localHero(state)`, and this module is the one place
// that knows which seat it is.
//
// It is module state rather than a prop for the same reason the gamepad bridge
// is mounted once globally: the answer is a fact about the CONNECTION, not
// about any component, and threading a seat index through the render loop, the
// HUD model, the overlays, the paper doll and the blood soak would be a
// parameter on two hundred call sites that is the same number every time.
//
// THE SEAT IS THE SERVER'S ANSWER, and it arrives in the `welcome`
// (`WelcomePayload.seat`). A single-player run never sets it and reads 0 —
// which is the seat a single-player run has, so nothing about the offline game
// goes near this. A SPECTATOR has no seat at all, and gets 0 too: they are
// watching the host's run, and the host's hero is the one worth watching.
//
// The one rule: a run must CLEAR it when it ends. A stale seat from a session
// that has closed would point the next run's camera at a hero that is not
// there — which on a one-hero party reads as a black screen rather than as a
// wrong seat.

// Types only, and through `@game/menu` on purpose: this module sits on the
// app's STARTUP path (App.tsx reaches it through saved-run.ts), where the
// 200 KB budget forbids any edge to `@game/core` — the reachability tripwire
// (`tests/content/net_reachability_test.ts`) counts a type-only import as an
// edge, deliberately, because the distinction is too easy to lose.
import type { GameState, PlayerScreen } from "@game/menu";

export type { PlayerScreen };

/** The seat this client steers, or 0 offline / watching. */
let seat = 0;

/** Tell the app which hero it is about. Called from the net client on the
 * `welcome`, and reset when the run ends. */
export function setLocalSeat(next: number | null): void {
  seat = next ?? 0;
}

/** The seat this screen is about. */
export function localSeat(): number {
  return seat;
}

/**
 * The hero this screen is about.
 *
 * Falls back to seat 0 when the seat is out of range, which is not paranoia: a
 * client's own `createRunFromParams` builds a ONE-hero party and only learns
 * about the seats already standing when the first full snapshot lands, so
 * there is a window — one publish wide — where the seat the server named does
 * not exist here yet.
 */
export function localHero<T>(state: { players: [T, ...T[]] }): T {
  return state.players[seat] ?? state.players[0];
}

/** The screen the local hero has up (bag, map, pause, …), or undefined when
 * they are on the field. The per-player counterpart of `state.phase`. */
export function localScreen(state: GameState): PlayerScreen | undefined {
  return localHero(state).screen;
}

/**
 * "My hero is on the field and I have nothing open" — the run is in the
 * global `playing` phase AND the local hero has no screen up. This is what
 * `state.phase === "playing"` used to mean before the per-player screens
 * split: every "show the live-field HUD" and "a field tap may
 * act" gate reads this, never the bare phase.
 */
export function fieldLive(state: GameState): boolean {
  return state.phase === "playing" && localScreen(state) === undefined;
}
