// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE TITLE MENU DECIDED ABOUT THIS RUN'S SESSION — one leaf, read by the
// run driver and written by the HOST screen.
//
// **WHY IT IS NOT A PROP.** Every Steam run already hosts a session (that is
// PR 1.75's cutover: the simulation lives in the utility process either way).
// What HOST GAME adds is one bit — OPEN THE DOORS — plus the four values a door
// needs, and threading those from a title-menu row through `App`, `GameScreen`,
// `createRunSession` and `createRunDriver` would be five signatures widened to
// carry a boolean that the driver alone reads. The app plays ONE run at a time,
// exactly as `run-commands.ts`'s sink is module-global for the same reason.
//
// **IT IS IMPORT-FREE APART FROM SETTINGS, AND MUST STAY THAT WAY.** The HOST
// and JOIN screens are TITLE MENU screens, i.e. the app's startup path, where
// the 170 KB critical-path budget forbids reaching `@game/core`. Everything
// here is plain values; the module that acts on them
// (`pwa/src/game/net/driver.ts`) is behind the run's own lazy chunk.
//
// **THE ARM IS CONSUMED, NOT REMEMBERED.** A player who hosts one game and then
// starts another from the front door has not asked to open a port again — a
// session quietly listening because of a decision made two runs ago is exactly
// the kind of thing that has to be pressed for every time.

import { getSettings, type SessionDoors } from "./settings.ts";

/** What a hosted run opens, resolved from the settings at the moment START was
 * pressed rather than read live: the run is what the player configured, not
 * what the settings happen to say twenty minutes later. */
export type HostIntent = {
  /** What the session is called in the browser. */
  name: string;
  password: string;
  maxPlayers: number;
  /** The port to TRY. What the socket GOT is a different number and comes back
   * from the session — see `SessionSettings.port`. */
  port: number;
  udp: boolean;
  steam: boolean;
};

/** Where a JOINER is going. Exactly one of `address` and `peer`, as
 * `ConnectOptions` requires — the transport is chosen by which one is set. */
export type JoinIntent = {
  address?: string;
  peer?: string;
  /** What this player is called in the roster and in chat. */
  name: string;
  password?: string;
  /** What the browser row CLAIMED about the session, for the screen the joiner
   * is looking at while the level builds. Null for a typed address, which
   * claims nothing until the handshake answers. */
  label?: string;
};

let armed: HostIntent | null = null;

/** Open the doors on the next run this app starts. */
export function armHosting(intent: HostIntent): void {
  armed = intent;
}

/** What the next run should listen on, consumed. Null for the ordinary
 * single-player run, which never binds a socket at all. */
export function takeHostIntent(): HostIntent | null {
  const held = armed;
  armed = null;
  return held;
}

/** Whether a run is queued to host. Read by the title menu to word its own
 * rows; it does not consume. */
export function hostingArmed(): boolean {
  return armed !== null;
}

export function disarmHosting(): void {
  armed = null;
}

/**
 * The session this hero would host, from the stored settings.
 *
 * The NAME is derived from the hero rather than typed, which is a deliberate
 * refusal of a text field: a session called `NIGHTHAWK'S GAME` says everything a
 * browser row needs to say about who is hosting, and every name a player types
 * into a box like that one is either their own name again or a joke that stops
 * being funny before the third session.
 */
export function hostIntentFor(heroName: string): HostIntent {
  const session = getSettings().multiplayer;
  return {
    name: `${heroName.toUpperCase()}'S GAME`,
    password: session.password,
    maxPlayers: session.maxPlayers,
    port: session.port,
    udp: doorOpen(session.doors, "direct"),
    steam: doorOpen(session.doors, "steam"),
  };
}

export function doorOpen(
  doors: SessionDoors,
  which: "steam" | "direct",
): boolean {
  return doors === "both" || doors === which;
}
