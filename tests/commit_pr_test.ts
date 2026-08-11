// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArgs, repoSlug, validateOptions } from "../scripts/commit-pr.mjs";

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
      ".agents/skills/commit/SKILL.md",
    ]);
    expect(() => validateOptions(opts)).not.toThrow();
    expect(opts.stage).toEqual([
      "scripts/commit-pr.mjs",
      ".agents/skills/commit/SKILL.md",
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

  // A session is HANDED its branch by the harness and may not rename it, so a
  // namespace that is not a conventional-commit type has to be accepted — the
  // title is what carries the convention onto main.
  it("accepts a branch namespace that is not a conventional-commit type", () => {
    for (const branch of [
      "claude/workflow-naming-20m8v5",
      "users/nl/spike",
      "feat/one-command-pr",
    ])
      expect(() =>
        validateOptions({
          branch,
          title: "ci(workflows): rename workflows",
          body_file: bodyFile(),
          stage: ["scripts/commit-pr.mjs"],
        }),
      ).not.toThrow();
  });

  it("still rejects a bare or shouty branch name", () => {
    for (const branch of ["workflow-naming", "Claude/Workflow-Naming", "feat/"])
      expect(() =>
        validateOptions({
          branch,
          title: "ci(workflows): rename workflows",
          body_file: bodyFile(),
          stage: ["scripts/commit-pr.mjs"],
        }),
      ).toThrow(/--branch/);
  });

  it("holds the title to Conventional Commits whatever the branch is called", () => {
    expect(() =>
      validateOptions({
        branch: "claude/workflow-naming-20m8v5",
        title: "Rename the workflows",
        body_file: bodyFile(),
        stage: ["scripts/commit-pr.mjs"],
      }),
    ).toThrow(/--title/);
  });
});

describe("commit-pr REST fallback", () => {
  it("reads owner/repo from every shape of origin remote", () => {
    for (const url of [
      "https://github.com/niclaslindstedt/game",
      "https://github.com/niclaslindstedt/game.git\n",
      "git@github.com:niclaslindstedt/game.git",
      "https://x-access-token:secret@github.com/niclaslindstedt/game.git",
    ])
      expect(repoSlug(url)).toEqual({
        owner: "niclaslindstedt",
        repo: "game",
      });
  });

  // The remote can carry a token in its userinfo, so the failure path must not
  // put the URL in the error it throws.
  it("refuses a non-GitHub remote without echoing it", () => {
    expect(() => repoSlug("https://git.example.com/s3cr3t/repo.git")).toThrow(
      /^cannot read owner\/repo from the origin remote$/,
    );
  });
});
