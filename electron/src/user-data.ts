// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THIS APP KEEPS THINGS, and the one time that has to move.
//
// Electron names the user-data directory after the app, and left alone it
// takes that name from the packaged `package.json` — which is the npm package
// name (`adas-trail-desktop`), not anything a player has ever seen. Meanwhile
// the executable is `adastrail` and the macOS bundle is `Adas Trail`, so one
// install could spell itself three ways and the folder holding the player's
// roster was the one nobody would guess.
//
// So the name is DECLARED here instead, and it is the executable's:
// `adastrail`, the same word `EXECUTABLE_NAME` derives in
// electron-builder.config.cjs (the title, lowercased, punctuation dropped —
// which is also why an apostrophe never reaches a path).
//
// EVERYTHING the player owns lives under that folder — the roster in
// `localStorage`, settings, window state, the mods they dropped in, the launch
// log — so renaming it without moving what is already there would read to a
// player as "the update deleted my characters". `adoptUserData` is the whole
// answer to that, and it runs exactly once per install.

import { existsSync, renameSync } from "node:fs";
import path from "node:path";

/** The directory name, and the name the app reports to the OS. */
export const APP_DIR_NAME = "adastrail";

/**
 * The names an install could already be using, newest guess first.
 *
 * Two, because the default differs by platform: Windows and Linux take the
 * npm package name out of the packaged manifest, while a macOS bundle reports
 * its `CFBundleName` — which electron-builder sets from `productName`.
 */
export const LEGACY_DIR_NAMES = ["adas-trail-desktop", "Adas Trail"] as const;

/**
 * Decide whether to move an existing user-data directory, and from where.
 *
 * Pure so the decision is testable without an Electron runtime: it is handed
 * the app-data root and a way to ask what exists, and answers the rename to
 * perform (or null). The rules are conservative in both directions — a new
 * folder that already exists is never touched, because that is either a fresh
 * install or a migration that already happened, and an install carrying BOTH
 * is left alone rather than merged, since guessing which holds the real roster
 * is exactly the wrong thing to be clever about.
 */
export function planUserDataMove(
  appData: string,
  exists: (dir: string) => boolean,
): { from: string; to: string } | null {
  const to = path.join(appData, APP_DIR_NAME);
  if (exists(to)) return null;
  for (const legacy of LEGACY_DIR_NAMES) {
    const from = path.join(appData, legacy);
    if (from !== to && exists(from)) return { from, to };
  }
  return null;
}

/**
 * Move the player's data to the declared folder, once.
 *
 * Called before anything reads `userData` — a rename under a live app would
 * leave open handles pointing at a path that no longer exists. A failure is
 * NOT fatal: the app then runs on the folder it already had, which is worse
 * than migrating and far better than not starting.
 */
export function adoptUserData(
  appData: string,
  log: (message: string) => void,
): void {
  let move: { from: string; to: string } | null;
  try {
    move = planUserDataMove(appData, existsSync);
  } catch {
    return;
  }
  if (!move) return;
  try {
    renameSync(move.from, move.to);
    log(`user data moved from ${path.basename(move.from)} to ${APP_DIR_NAME}`);
  } catch (err) {
    log(
      `could not move user data from ${path.basename(move.from)} — ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
