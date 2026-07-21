// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArgs, validateOptions } from "../scripts/commit-pr.mjs";

const bodyFile = () => {
  const dir = mkdtempSync(join(tmpdir(), "commit-pr-"));
  const file = join(dir, "body.md");
  writeFileSync(file, "## Summary\n");
  return file;
};

describe("commit-pr arguments", () => {
  it("accepts explicit repeated stage paths", () => {
    const opts = parseArgs([
      "--branch",
      "feat/one-command-pr",
      "--title",
      "feat(dev): add PR helper",
      "--body-file",
      bodyFile(),
      "--stage",
      "scripts/commit-pr.mjs",
      "--stage",
      ".agent/skills/commit/SKILL.md",
    ]);
    expect(() => validateOptions(opts)).not.toThrow();
    expect(opts.stage).toEqual([
      "scripts/commit-pr.mjs",
      ".agent/skills/commit/SKILL.md",
    ]);
  });

  it("requires an explicit staging mode", () => {
    const opts = parseArgs([
      "--branch",
      "feat/one-command-pr",
      "--title",
      "feat(dev): add PR helper",
      "--body-file",
      bodyFile(),
    ]);
    expect(() => validateOptions(opts)).toThrow(/--stage/);
  });

  it("rejects non-conventional titles and protected branch names", () => {
    expect(() =>
      validateOptions({
        branch: "main",
        title: "Add helper",
        body_file: bodyFile(),
        stage: ["scripts/commit-pr.mjs"],
      }),
    ).toThrow(/--branch/);
  });
});
