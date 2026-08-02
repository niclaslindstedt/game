// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE TITLE MENU DECIDED ABOUT THIS RUN'S SESSION — one leaf, read by the
// run driver and written by the HOST screen.
//
// **WHY IT IS NOT A PROP.** HOST GAME chooses the session driver and carries
// the values its doors need. Threading those from a title-menu row through
// `App`, `GameScreen`, `createRunSession` and `createRunDriver` would widen five
// signatures with state the driver alone reads. The app plays ONE run at a
// time, exactly as `run-commands.ts`'s sink is module-global for the same
// reason. NEW GAME never arms this leaf and therefore stays local.
//
// **IT IS IMPORT-FREE APART FROM SETTINGS, AND MUST STAY THAT WAY.** The HOST
// and JOIN screens are TITLE MENU screens, i.e. the app's startup path, where
// the 200 KB critical-path budget forbids reaching `@game/core`. Everything
// here is plain values; the module that acts on them
// (`pwa/src/game/net/driver.ts`) is behind the run's own lazy chunk.
//
// **THE ARM IS CONSUMED, NOT REMEMBERED.** A player who hosts one game and then
// starts another from the front door has not asked to open a port again — a
// session quietly listening because of a decision made two runs ago is exactly
// the kind of thing that has to be pressed for every time.

import {
  getSettings,
  type SessionDoors,
  type SessionLoot,
} from "./settings.ts";

/** What a hosted run opens, resolved from the settings at the moment START was
 * pressed rather than read live: the run is what the player configured, not
 * what the settings happen to say twenty minutes later. */
export type HostIntent = {
  /** What the session is called in the browser. */
  name: string;
  password: string;
  maxPlayers: number;
  /** Empty seats to fill with AUTOPILOT heroes — the BOTS row. Clamped so a
   * bot can never take the host's own chair. */
  bots: number;
  /** The port to TRY. What the socket GOT is a different number and comes back
   * from the session — see `SessionSettings.port`. */
  port: number;
  udp: boolean;
  steam: boolean;
  /** The session's loot rule — see `SessionLoot`. Travels to the engine as
   * `SessionParams.lootMode`. */
  loot: SessionLoot;
};

/** Where a JOINER is going. Exactly one of `address` and `peer`, as
 * `ConnectOptions` requires — the transport is chosen by which one is set. */
export type JoinIntent = {
  address?: string;
  peer?: string;
  /** What this player is called in the roster and in chat. */
  name: string;
  password?: string;
  /** The character this player is coming with is HARDCORE. A hardcore
   * hero may only enter a hardcore session and vice versa — the handshake
   * refuses the mismatch by name. */
  hardcore?: boolean;
  /** The hero this player is coming WITH: their banked `Loadout` as
   * plain JSON, with the purse already funded from their whole wealth the way
   * a local run's is. Structural (`Record`) on purpose — this leaf may not
   * import the engine — and null for a fresh character, who arrives as the
   * authored fresh start. The session WEIGHS it before seating anybody
   * (`validateLoadout`); this is a claim, never an authority. */
  loadout?: Record<string, unknown> | null;
  /** What the browser row CLAIMED about the session, for the screen the joiner
   * is looking at while the level builds. Null for a typed address, which
   * claims nothing until the handshake answers. */
  label?: string;
  /** The HOST'S MOD SET was applied on the way through this door —
   * so when the joined run ends, the run must put the shipped game back
   * (`restoreBaseDefs`): a mod applies to a run, never to the install. */
  appliedMods?: boolean;
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

/**
 * The LOOT RULE the armed session will play under, or undefined for the
 * ordinary free-for-all — read WITHOUT consuming the arm.
 *
 * It is read one step earlier than everything else on the intent, and that is
 * why it needs its own door: the port, the password and the seats are the
 * DRIVER's business and are consumed when the socket is opened, but the loot
 * rule is a property of the RUN and has to be in the `RunParams` that build it,
 * which happens first (`run-setup.ts`). Consuming here would leave the driver
 * with nothing to open a door with.
 */
export function armedLootMode(): SessionLoot | undefined {
  return armed?.loot === "allocated" ? "allocated" : undefined;
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
    // Clamped against the seat count HERE as well as in the menu row: the two
    // settings are stored separately, and a stale pair (seats lowered after
    // bots were set) must never ask for more bots than there are empty chairs.
    bots: Math.max(0, Math.min(session.bots, session.maxPlayers - 1)),
    port: session.port,
    udp: doorOpen(session.doors, "direct"),
    steam: doorOpen(session.doors, "steam"),
    loot: session.loot,
  };
}

export function doorOpen(
  doors: SessionDoors,
  which: "steam" | "direct",
): boolean {
  return doors === "both" || doors === which;
}
