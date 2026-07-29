// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desktop shell's central output module — the peer of src/output.ts for a
// tree that runs in Node rather than a browser (OSS_SPEC §19.4: diagnostics go
// through one module so they can be silenced, redirected or timestamped in one
// place, and never scattered as raw `console` calls).
//
// A desktop app has no devtools console a player will ever open, so the shell's
// stdout IS its diagnostic surface: it is what a bug report pastes and what
// `steam-launch.log` captures. Two rules keep it worth reading —
//
//  1. every line is PREFIXED with what emitted it (`steam:`, `webroot:`), so a
//     log with three subsystems in it can still be read; and
//  2. it stays QUIET by default in a packaged build, because a shipped game
//     should not narrate itself. `GIS_VERBOSE=1` turns the chatter back on;
//     warnings and errors are never suppressed, since those are the lines
//     someone is looking for when they go looking at all.

/* eslint-disable no-console */

const VERBOSE = process.env.GIS_VERBOSE === "1" || !isPackaged();

/** Is this a packaged app rather than a checkout being run with `electron .`?
 * Read defensively — `output` is imported by modules that also run under a
 * plain `node` (the bundle script's checks), where `process.resourcesPath` and
 * Electron's `app` do not exist. */
function isPackaged(): boolean {
  return typeof process.resourcesPath === "string" && !!process.env.GIS_PACKAGED;
}

export const output = {
  /** Progress and state worth seeing while developing; silent when packaged. */
  info(message: string): void {
    if (VERBOSE) console.log(message);
  },
  /** Something degraded but the game keeps running — always shown. */
  warn(message: string): void {
    console.warn(message);
  },
  /** Something failed — always shown. */
  error(message: string): void {
    console.error(message);
  },
};
