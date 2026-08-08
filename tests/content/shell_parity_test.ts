// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO DESKTOP BUILDS STAY PAIRED, or the build goes red.
//
// `scripts/shell-parity.mjs` reads five pairings out of the two trees — the
// decision modules, the bridge protocols, the capability switches, the
// cold-start marks and the roster flags — and every one of them is INVISIBLE
// when it breaks. Nothing fails to compile when one shell grows a module the
// other does not have; nothing fails at runtime when one stamps a startup mark
// the other does not, right up until a comparison table quietly loses a column.
//
// It lives in the ROOT suite rather than in `tauri/`'s because it reads both
// trees: a change under `electron/src/` is exactly as likely to break it as one
// under `tauri/`, and `make tauri-test` never runs for the first of those.
//
// The checker also writes `docs/desktop-parity.md`, which is committed, so this
// doubles as the drift test for that file — accept an intentional change by
// running `npm run parity`, never by editing the document.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("desktop shell parity", () => {
  it("holds, and docs/desktop-parity.md is current", () => {
    let output: string;
    let failed = false;
    try {
      output = execFileSync(
        process.execPath,
        [path.join(ROOT, "scripts", "shell-parity.mjs"), "--check"],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      failed = true;
      const failure = err as { stdout?: string; stderr?: string };
      output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    }
    // The checker's own message is the useful half — it names the module, the
    // flag or the mark, and what to do about it. Re-stating that here would be
    // a second place to keep in step.
    expect(failed ? output : "", output).toBe("");
  });
});
