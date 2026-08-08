#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One guarded path from a stale branch to a branch sitting on top of the LATEST
// default branch — seatbelt first, and never a step out of order.
//
// The three steps this replaces were always done by hand and were always done
// in the wrong order at least once:
//
//   1. PARK the branch    `git branch -f backup/<branch>-premerge HEAD`
//   2. FETCH the base     `git fetch origin main`   ← the step that gets skipped
//   3. REBASE (or merge)  onto the ref that was just fetched
//
// Step 2 is the one worth automating on its own. A rebase onto a `main` that
// was fetched an hour ago is a rebase onto a ref that no longer exists
// anywhere but this clone: it conflicts against commits that are already
// resolved upstream, and every one of those conflicts has to be resolved a
// second time on the next attempt. There is no version of "rebase" in this
// repo that does not begin by fetching.
//
// Step 1 is the one that costs nothing and saves everything. A conflicted
// working tree is the most fragile state a repo gets into — see the `conflict`
// skill for what throws a resolution away — and with the backup in place the
// recovery is one line instead of an archaeology session in the reflog.
//
// Usage:
//   node scripts/sync-branch.mjs                  # park, fetch, rebase onto origin/main
//   node scripts/sync-branch.mjs --merge          # …merge instead of rebasing
//   node scripts/sync-branch.mjs --onto develop   # …against a different base
//   node scripts/sync-branch.mjs --dry-run        # print the sequence, touch nothing
//   node scripts/sync-branch.mjs --continue       # after resolving, carry on
//   node scripts/sync-branch.mjs --abort          # give up, back to the backup
//   node scripts/sync-branch.mjs --cleanup        # drop the backup once pushed

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Branches this must never rewrite. Rebasing `main` onto `origin/main` is not
 * a sync, it is a way to lose whatever was on it. */
export const PROTECTED = new Set(["main", "master", "HEAD"]);

/** The default base. A branch in this repo is always cut from `main` and always
 * goes back to it. */
export const DEFAULT_BASE = "main";

export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (
      [
        "--merge",
        "--dry-run",
        "--continue",
        "--abort",
        "--cleanup",
        "--no-backup",
        "--help",
      ].includes(arg)
    ) {
      opts[arg.slice(2).replaceAll("-", "_")] = true;
      continue;
    }
    if (["--onto", "--remote"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      opts[arg.slice(2)] = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** The mode this invocation is in. Exactly one, and the resume/abort/cleanup
 * modes deliberately take no other options — they act on a state that already
 * exists rather than starting one. */
export function modeOf(opts) {
  const modes = ["continue", "abort", "cleanup"].filter((mode) => opts[mode]);
  if (modes.length > 1)
    throw new Error(`choose one of --continue, --abort, --cleanup`);
  return modes[0] ?? "sync";
}

export function validateOptions(opts, branch) {
  if (opts.help) return;
  if (!branch) throw new Error("could not read the current branch");
  if (modeOf(opts) !== "sync") return;
  if (PROTECTED.has(branch))
    throw new Error(
      `refusing to sync ${branch} — check out a feature branch first`,
    );
}

/** What the backup branch for a given branch is called.
 *
 * `-premerge` regardless of whether this is a merge or a rebase, and that is
 * deliberate: it is the name the `conflict` skill tells you to reset to, and a
 * name that changes with the mode is a name nobody remembers under pressure.
 * Slashes survive, so `claude/foo` parks at `backup/claude/foo-premerge`. */
export function backupName(branch) {
  return `backup/${branch}-premerge`;
}

/** The exact git commands this run will issue, in order.
 *
 * Pure, so the ORDER — the whole point of the script — is testable without a
 * repository: park, then fetch, then move. A plan that fetched second would be
 * a plan that rebases onto a ref that is already out of date, which is the
 * habit this script exists to break.
 *
 * `inProgress` is what git says is actually half-done (`"merge"`, `"rebase"`,
 * or null), so `--continue` and `--abort` speak to the operation that is really
 * there rather than to whichever flag the caller happened to remember. Aborting
 * a rebase with `git merge --abort` is an error message, and an error message
 * at that moment reads as "the seatbelt did not work".
 */
export function plan(opts, branch, inProgress = null) {
  const remote = opts.remote ?? "origin";
  const base = opts.onto ?? DEFAULT_BASE;
  const mode = modeOf(opts);
  const backup = backupName(branch);
  const verb = inProgress ?? (opts.merge ? "merge" : "rebase");

  if (mode === "abort") {
    // ABORT ONLY. Git's own abort already puts the branch back where it
    // started, and a `reset --hard` bolted on after it would silently discard
    // anything committed since the backup was cut — which is exactly the
    // accident the backup exists to prevent. If the abort cannot restore, the
    // caller is told to reset by hand, with the ref to reset to.
    return [["git", [verb, "--abort"]]];
  }
  if (mode === "continue") {
    // `git add` is the caller's job — resolving is a judgement, and a script
    // that staged everything would happily stage a file still holding conflict
    // markers.
    return [["git", [verb, "--continue"]]];
  }
  if (mode === "cleanup") {
    return [["git", ["branch", "-D", backup]]];
  }

  const steps = [];
  if (!opts.no_backup) steps.push(["git", ["branch", "-f", backup, "HEAD"]]);
  steps.push(["git", ["fetch", remote, base]]);
  steps.push([
    "git",
    opts.merge
      ? ["merge", `${remote}/${base}`]
      : ["rebase", `${remote}/${base}`],
  ]);
  return steps;
}

/** Which operation git currently has half-done, read off its own state
 * directory rather than guessed from the flags. */
export function inProgressFrom(gitDir, exists) {
  if (exists(`${gitDir}/MERGE_HEAD`)) return "merge";
  if (exists(`${gitDir}/rebase-merge`) || exists(`${gitDir}/rebase-apply`))
    return "rebase";
  return null;
}

function quote(arg) {
  return /^[a-zA-Z0-9_./:-]+$/.test(arg)
    ? arg
    : `'${arg.replaceAll("'", `'\\''`)}'`;
}

function currentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  });
  const branch = (result.stdout ?? "").trim();
  // Mid-rebase git detaches HEAD, so `--show-current` is empty exactly when
  // `--continue` needs a name. Ask what is being rebased instead.
  if (branch) return branch;
  const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  });
  const named = (head.stdout ?? "").trim();
  return named === "HEAD" ? rebasingBranch() : named;
}

/** The branch a rebase is rewriting, which is the one whose backup we name.
 * Git writes it down in its own state directory; there is no plumbing command
 * that reports it. */
function rebasingBranch() {
  for (const file of ["rebase-merge/head-name", "rebase-apply/head-name"]) {
    const path = `${gitDir()}/${file}`;
    if (!existsSync(path)) continue;
    return readFileSync(path, "utf8")
      .trim()
      .replace(/^refs\/heads\//, "");
  }
  return "";
}

function gitDir() {
  const result = spawnSync("git", ["rev-parse", "--git-dir"], {
    encoding: "utf8",
  });
  return (result.stdout ?? ".git").trim() || ".git";
}

function usage() {
  console.log(`usage:
  node scripts/sync-branch.mjs [--merge] [--onto main] [--dry-run]
  node scripts/sync-branch.mjs --continue | --abort | --cleanup

Parks the branch at backup/<branch>-premerge, fetches the base from the remote,
and rebases (or merges) onto it. Fetching is not optional — a rebase onto a
stale ref re-resolves conflicts that are already settled upstream.

Options:
  --merge        Merge instead of rebasing (use when the branch is already pushed
                 and somebody else may have it checked out).
  --onto <ref>   Base branch to sync onto. Default: ${DEFAULT_BASE}.
  --remote <r>   Remote to fetch from. Default: origin.
  --no-backup    Skip the backup branch. You will want it; this exists for the
                 case where one already points somewhere you care about.
  --dry-run      Print the command sequence and change nothing.
  --continue     Resume after you have resolved and staged the conflicts.
  --abort        Give up: abort whichever operation git actually has half-done.
  --cleanup      Delete the backup branch — after the sync is verified AND pushed.

On conflict the script stops and prints what to do next. Resolve, stage, then
run it again with --continue. See the \`conflict\` skill for the rules that go
with a conflicted tree.`);
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`sync-branch: ${err.message}`);
    usage();
    process.exitCode = 1;
    return;
  }
  if (opts.help) {
    usage();
    return;
  }

  const branch = currentBranch();
  try {
    validateOptions(opts, branch);
  } catch (err) {
    console.error(`sync-branch: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const mode = modeOf(opts);
  const steps = plan(opts, branch, inProgressFrom(gitDir(), existsSync));
  const backup = backupName(branch);

  for (const [command, args, options = {}] of steps) {
    console.log(`$ ${[command, ...args].map(quote).join(" ")}`);
    if (opts.dry_run) continue;
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) {
      console.error(`sync-branch: ${result.error.message}`);
      process.exitCode = 1;
      return;
    }
    if (result.status !== 0 && !options.allowFailure) {
      // The only failure worth explaining is the interesting one: git stopped
      // because two people changed the same lines. Everything else already
      // printed its own reason.
      const conflicted = args[0] === "rebase" || args[0] === "merge";
      if (conflicted) {
        console.error(
          `\nsync-branch: ${args[0]} stopped on conflicts.\n\n` +
            `  Your branch is parked at ${backup} — \`git reset --hard ${backup}\`\n` +
            `  puts everything back exactly as it was.\n\n` +
            `  Resolve the conflicted files, \`git add\` them, then:\n` +
            `      node scripts/sync-branch.mjs --continue\n` +
            `  or give up entirely with:\n` +
            `      node scripts/sync-branch.mjs --abort\n\n` +
            `  While the tree is conflicted, do NOT run git stash, git reset,\n` +
            `  git checkout <ref> -- ., or add a worktree — each of those throws\n` +
            `  the resolution away. Read another ref with \`git show <ref>:<path>\`.`,
        );
      }
      process.exitCode = result.status ?? 1;
      return;
    }
  }

  if (opts.dry_run) return;
  if (mode === "cleanup") {
    console.log(`\n✓ backup branch ${backup} deleted`);
    return;
  }
  if (mode === "abort") {
    console.log(
      `\n✓ aborted — git put ${branch} back where it started.\n` +
        `  If anything still looks wrong: git reset --hard ${backup}`,
    );
    return;
  }
  if (mode === "continue") {
    console.log(
      `\n✓ continued. If git stopped again, resolve the next conflict and\n` +
        `  run --continue again; a rebase replays one commit at a time.`,
    );
    return;
  }
  console.log(
    `\n✓ ${branch} is on top of ${opts.remote ?? "origin"}/${opts.onto ?? DEFAULT_BASE}.\n` +
      `  Verify (make lint, make test), push, and then drop the seatbelt:\n` +
      `      node scripts/sync-branch.mjs --cleanup`,
  );
}

// Importable for tests; only runs when invoked as a program.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
