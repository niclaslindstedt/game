// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `npm run electron` — build the shell and launch the desktop game.
//
// This exists because of ONE portability trap: `GIS_STEAM=off npm …` is Bourne
// shell syntax for "run this command with that variable set", and npm runs a
// script through the platform's own shell. On Windows that shell is `cmd.exe`,
// which has no such syntax — it reads the assignment as the name of a program
// and answers
//
//     'GIS_STEAM' is not recognized as an internal or external command
//
// so the whole script fails before npm is ever reached and no Windows user can
// start the game from the repo at all. A launcher in Node sets the variable in
// the child's environment instead, which every platform spells the same way.
//
// Why the variable is set here at all: the shell talks to Steam by default, and
// a checkout being run by a developer is exactly the case where there is no
// Steam session to talk to (see electron/src/steam.ts). `GIS_STEAM` already set
// in the environment WINS — `GIS_STEAM=on npm run electron` (or `set GIS_STEAM=on`
// on Windows) is how the Steam path is exercised locally.
//
// Extra arguments are forwarded to the game: `npm run electron -- --multiplayer`.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOWS = process.platform === "win32";

/**
 * The environment the shell is launched with.
 *
 * Only fills in `GIS_STEAM` when the caller left it unset, so the default is
 * "no Steam" without taking away the ability to ask for it.
 */
export function launchEnv(env = process.env) {
  return { ...env, GIS_STEAM: env.GIS_STEAM ?? "off" };
}

/** The npm invocation that builds and starts the shell, plus anything the
 * caller passed after `--`. */
export function launchArgs(extra = []) {
  return [
    "--prefix",
    "electron",
    "run",
    "start",
    ...(extra.length ? ["--", ...extra] : []),
  ];
}

function main() {
  const extra = process.argv.slice(2);
  // Windows' npm is a batch shim, which Node cannot execute directly (EINVAL);
  // cmd.exe has to interpret it. Same treatment as electron/scripts/bundle-web.mjs.
  const child = spawn(WINDOWS ? "npm.cmd" : "npm", launchArgs(extra), {
    cwd: REPO_DIR,
    env: launchEnv(),
    stdio: "inherit",
    shell: WINDOWS,
  });
  child.on("error", (err) => {
    console.error(`run-electron: could not start npm — ${err.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`run-electron: the game was terminated by ${signal}.`);
      process.exitCode = 1;
      return;
    }
    if (code) {
      // The shell writes a launch log of its own; point at it rather than
      // leaving a bare exit code as the whole diagnosis.
      console.error(
        `run-electron: the game exited with code ${code}. The desktop shell ` +
          "writes every launch to `launch.log` in its user-data directory " +
          "(Windows: %APPDATA%\\adas-trail-desktop, macOS: ~/Library/Application " +
          "Support/adas-trail-desktop, Linux: ~/.config/adas-trail-desktop).",
      );
    }
    process.exitCode = code ?? 0;
  });
}

// Importable for tests; only launches when run as a program.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
