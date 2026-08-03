// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERY NPM SCRIPT HAS TO RUN ON WINDOWS, and the way that is lost is always
// the same one line.
//
// `npm run <script>` hands the script string to the platform's own shell. On
// macOS and Linux that is `sh`, where `FOO=bar cmd` means "run cmd with FOO
// set"; on Windows it is `cmd.exe`, which has no such syntax and reads the
// assignment as the name of a program to run:
//
//     'GIS_STEAM' is not recognized as an internal or external command
//
// The script then fails before the command it was supposed to run is even
// reached. It is invisible to everyone developing on a Unix machine and to CI
// (whose Windows jobs pass `shell: bash`), and total for a Windows player: the
// entry point that starts the desktop game shipped broken this way, and the
// only symptom anybody saw was "the game does not launch".
//
// So: an environment variable a script needs goes in a Node launcher that sets
// it on the child (scripts/run-electron.mjs is the worked example), never as a
// shell prefix. The same trap in its other spellings — `export`, backticks,
// `$(…)` — is checked too, since each is equally Unix-only.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Every package manifest whose scripts a human or a workflow runs directly.
 * The two store shells are outside the workspace and are included on purpose —
 * `npm --prefix electron run start` is exactly the path that broke. */
const MANIFESTS = [
  "package.json",
  "pwa/package.json",
  "electron/package.json",
  "native/package.json",
  "mod/package.json",
];

/** A leading `VAR=value` on the whole string or on any `&&`/`||`/`;` segment. */
const ENV_PREFIX = /(?:^|&&|\|\||;)\s*[A-Za-z_][A-Za-z0-9_]*=/;

/** The other Unix-only shell constructs, in the spellings that actually turn up
 * in a package script. */
const UNIX_ONLY: [RegExp, string][] = [
  [/(?:^|&&|\|\||;)\s*export\s+/, "`export` is not a cmd.exe builtin"],
  [/\$\(/, "`$(…)` command substitution is not cmd.exe syntax"],
  [/`[^`]*`/, "backtick command substitution is not cmd.exe syntax"],
];

function scriptsOf(manifest: string): [string, string][] {
  const file = path.join(ROOT, manifest);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    scripts?: Record<string, string>;
  };
  return Object.entries(parsed.scripts ?? {});
}

describe("npm scripts run on every platform", () => {
  for (const manifest of MANIFESTS) {
    it(`${manifest} sets no environment variable with shell syntax`, () => {
      const offenders = scriptsOf(manifest)
        .filter(([, body]) => ENV_PREFIX.test(body))
        .map(([name, body]) => `${name}: ${body}`);
      expect(offenders).toEqual([]);
    });

    it(`${manifest} uses no other Unix-only shell syntax`, () => {
      const offenders: string[] = [];
      for (const [name, body] of scriptsOf(manifest)) {
        for (const [pattern, why] of UNIX_ONLY) {
          if (pattern.test(body)) offenders.push(`${name}: ${body} — ${why}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
