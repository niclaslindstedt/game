// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ORDER IS THE WHOLE POINT, so the order is what is pinned here.
//
// `scripts/sync-branch.mjs` exists because the three steps of catching a branch
// up were done by hand and were done in the wrong order at least once each:
// the backup cut after the merge started (useless), or the rebase run against a
// `main` fetched an hour ago (which re-raises conflicts already settled
// upstream, and raises them again on the next attempt). `plan()` is pure so
// both of those are assertions rather than habits.

import { describe, expect, it } from "vitest";

import {
  backupName,
  DEFAULT_BASE,
  inProgressFrom,
  modeOf,
  parseArgs,
  plan,
  PROTECTED,
  validateOptions,
  type SyncStep,
} from "../scripts/sync-branch.mjs";

/** The plan as a list of readable command lines, which is what the assertions
 * below are actually about. */
const lines = (steps: SyncStep[]): string[] =>
  steps.map(([command, args]) => [command, ...args].join(" "));

describe("sync-branch: the order", () => {
  it("parks the branch BEFORE it fetches, and fetches BEFORE it moves", () => {
    expect(lines(plan(parseArgs([]), "feat/thing"))).toEqual([
      "git branch -f backup/feat/thing-premerge HEAD",
      "git fetch origin main",
      "git rebase origin/main",
    ]);
  });

  it("always fetches — there is no way to rebase onto a stale ref", () => {
    // Every option combination still fetches, and always immediately before
    // the step that consumes what was fetched.
    for (const argv of [[], ["--merge"], ["--no-backup"], ["--onto", "main"]]) {
      const steps = lines(plan(parseArgs(argv), "feat/thing"));
      const fetched = steps.findIndex((step) => step.startsWith("git fetch"));
      const moved = steps.findIndex((step) =>
        /^git (rebase|merge) /.test(step),
      );
      expect(fetched, `${argv.join(" ")} must fetch`).toBeGreaterThanOrEqual(0);
      expect(moved, `${argv.join(" ")} must move`).toBe(fetched + 1);
    }
  });

  it("merges instead of rebasing when asked, with the same seatbelt", () => {
    expect(lines(plan(parseArgs(["--merge"]), "feat/thing"))).toEqual([
      "git branch -f backup/feat/thing-premerge HEAD",
      "git fetch origin main",
      "git merge origin/main",
    ]);
  });

  it("honours a different base and remote", () => {
    expect(
      lines(
        plan(parseArgs(["--onto", "develop", "--remote", "upstream"]), "x"),
      ),
    ).toEqual([
      "git branch -f backup/x-premerge HEAD",
      "git fetch upstream develop",
      "git rebase upstream/develop",
    ]);
  });

  it("drops the seatbelt only when explicitly told to", () => {
    const steps = lines(plan(parseArgs(["--no-backup"]), "feat/thing"));
    expect(steps.some((step) => step.includes("backup/"))).toBe(false);
    expect(steps).toHaveLength(2);
  });
});

describe("sync-branch: the backup branch", () => {
  it("is named after the branch, keeping its slashes", () => {
    expect(backupName("feat/thing")).toBe("backup/feat/thing-premerge");
    expect(backupName("claude/tauri-phase-1")).toBe(
      "backup/claude/tauri-phase-1-premerge",
    );
  });

  it("is called -premerge for a rebase too", () => {
    // One name, whichever operation is running: it is the ref the `conflict`
    // skill tells you to reset to, and a name that changes with the mode is a
    // name nobody remembers with a conflicted tree in front of them.
    const rebase = lines(plan(parseArgs([]), "b"))[0];
    const merge = lines(plan(parseArgs(["--merge"]), "b"))[0];
    expect(rebase).toBe(merge);
    expect(rebase).toContain("-premerge");
  });
});

describe("sync-branch: resuming", () => {
  it("continues and aborts whichever operation git actually has half-done", () => {
    // Not whichever flag the caller remembered. Aborting a rebase with
    // `git merge --abort` is an error message, and an error message at that
    // moment reads as "the seatbelt did not work".
    expect(lines(plan(parseArgs(["--abort"]), "b", "rebase"))).toEqual([
      "git rebase --abort",
    ]);
    expect(lines(plan(parseArgs(["--abort"]), "b", "merge"))).toEqual([
      "git merge --abort",
    ]);
    expect(lines(plan(parseArgs(["--continue"]), "b", "merge"))).toEqual([
      "git merge --continue",
    ]);
  });

  it("never stages for you", () => {
    // Resolving is a judgement. A script that ran `git add -A` here would
    // happily stage a file still holding conflict markers.
    const steps = lines(plan(parseArgs(["--continue"]), "b", "rebase"));
    expect(steps.some((step) => step.startsWith("git add"))).toBe(false);
  });

  it("aborting does not hard-reset on top of the abort", () => {
    // Git's own abort already restores the branch; a `reset --hard` bolted on
    // after it would discard anything committed since the backup was cut.
    const steps = lines(plan(parseArgs(["--abort"]), "b", "rebase"));
    expect(steps.some((step) => step.includes("reset --hard"))).toBe(false);
  });

  it("reads the half-done operation off git's own state directory", () => {
    const has = (paths: string[]) => (path: string) => paths.includes(path);
    expect(inProgressFrom(".git", has([".git/MERGE_HEAD"]))).toBe("merge");
    expect(inProgressFrom(".git", has([".git/rebase-merge"]))).toBe("rebase");
    expect(inProgressFrom(".git", has([".git/rebase-apply"]))).toBe("rebase");
    expect(inProgressFrom(".git", has([]))).toBe(null);
  });

  it("takes one resume mode at a time", () => {
    expect(() => modeOf(parseArgs(["--continue", "--abort"]))).toThrow(
      /one of/,
    );
    expect(modeOf(parseArgs([]))).toBe("sync");
    expect(modeOf(parseArgs(["--cleanup"]))).toBe("cleanup");
  });
});

describe("sync-branch: refusals", () => {
  it("refuses to rewrite a protected branch", () => {
    for (const branch of PROTECTED) {
      expect(() => validateOptions(parseArgs([]), branch)).toThrow(
        /feature branch/,
      );
    }
  });

  it("still lets you clean up or abort from anywhere", () => {
    // These act on a state that already exists rather than starting one, so
    // the protected-branch refusal would only be in the way.
    expect(() => validateOptions(parseArgs(["--abort"]), "main")).not.toThrow();
    expect(() =>
      validateOptions(parseArgs(["--cleanup"]), "main"),
    ).not.toThrow();
  });

  it("refuses when there is no branch to read", () => {
    expect(() => validateOptions(parseArgs([]), "")).toThrow(/current branch/);
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["--rebase-onto-everything"])).toThrow(/unknown/);
    expect(() => parseArgs(["--onto"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--onto", "--merge"])).toThrow(/requires a value/);
  });

  it("defaults the base to the repo's own default branch", () => {
    expect(DEFAULT_BASE).toBe("main");
  });
});
