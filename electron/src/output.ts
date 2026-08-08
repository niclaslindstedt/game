// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desktop shell's central output module — the peer of engine/output.ts for a
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

import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERBOSE = process.env.GIS_VERBOSE === "1" || !isPackaged();

/** Is this a packaged app rather than a checkout being run with `electron .`?
 * Read defensively — `output` is imported by modules that also run under a
 * plain `node` (the bundle script's checks), where `process.resourcesPath` and
 * Electron's `app` do not exist. */
function isPackaged(): boolean {
  return (
    typeof process.resourcesPath === "string" && !!process.env.GIS_PACKAGED
  );
}

/**
 * THE LAUNCH LOG.
 *
 * A packaged game on Windows has no console at all — it is started from an icon
 * or from Steam, and `console.error` is written to a stream nobody is holding.
 * So a shell that fails to start is, from the player's side, a program that does
 * nothing when double-clicked; the whole diagnosis is a file or it does not
 * exist. Every line the shell emits is therefore also appended here, INFO
 * included and regardless of `VERBOSE` — a log written only when things go well
 * is the wrong way round.
 *
 * One file per launch (the previous one is kept beside it as `.prev`, which is
 * the copy a player still has after restarting to "see if it does it again"),
 * and written SYNCHRONOUSLY: the lines worth having are the ones emitted
 * immediately before the process dies, and a buffered stream loses exactly
 * those.
 */
let logFile: string | null = null;

/** Point the log at a directory (the app's user-data path). Best-effort: a
 * read-only or missing directory must never be the reason the game won't
 * start, so a failure here downgrades to console-only output. */
export function logToFile(dir: string): void {
  const path = join(dir, "launch.log");
  try {
    // Electron creates the user-data directory lazily, and this runs before
    // `ready` — on a first launch (the one most likely to fail) it is not
    // there yet, and without this the log would be missing exactly then.
    mkdirSync(dir, { recursive: true });
    try {
      renameSync(path, `${path}.prev`);
    } catch {
      // No previous launch to keep — the normal first-run case.
    }
    writeFileSync(path, `— launch ${new Date().toISOString()} —\n`);
    logFile = path;
  } catch {
    logFile = null;
  }
}

/** Where the launch log is, or null when there isn't one. Named in the error
 * dialog so a bug report has a file to attach. */
export function logPath(): string | null {
  return logFile;
}

function record(level: string, message: string): void {
  if (!logFile) return;
  try {
    appendFileSync(logFile, `[${level}] ${message}\n`);
  } catch {
    // A log that cannot be written is not worth failing a launch over.
    logFile = null;
  }
}

export const output = {
  /** Progress and state worth seeing while developing; silent when packaged. */
  info(message: string): void {
    if (VERBOSE) console.log(message);
    record("info", message);
  },
  /** Something degraded but the game keeps running — always shown. */
  warn(message: string): void {
    console.warn(message);
    record("warn", message);
  },
  /** Something failed — always shown. */
  error(message: string): void {
    console.error(message);
    record("error", message);
  },
};
