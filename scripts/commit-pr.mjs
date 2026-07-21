#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One guarded path from a reviewed worktree to a pushed commit and PR.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONVENTIONAL =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9,-]+\))?!?: .+/;
const BRANCH =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)\/[a-z0-9][a-z0-9-]*$/;
const PROTECTED = new Set(["main", "master"]);

export function parseArgs(argv) {
  const opts = { stage: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["--all", "--dry-run", "--help"].includes(arg)) {
      opts[arg.slice(2).replace("-", "_")] = true;
      continue;
    }
    if (["--branch", "--title", "--body-file", "--stage"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      const key = arg.slice(2).replace("-", "_");
      if (key === "stage") opts.stage.push(value);
      else opts[key] = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

export function validateOptions(opts) {
  if (opts.help) return;
  if (!opts.branch || !BRANCH.test(opts.branch))
    throw new Error(
      "--branch must look like feat/short-description using lowercase kebab-case",
    );
  if (!opts.title || !CONVENTIONAL.test(opts.title))
    throw new Error("--title must follow Conventional Commits");
  if (!opts.body_file) throw new Error("--body-file is required");
  if (!existsSync(opts.body_file))
    throw new Error(`PR body file does not exist: ${opts.body_file}`);
  if (opts.all && opts.stage.length > 0)
    throw new Error("choose either --all or one or more --stage paths");
  if (!opts.all && opts.stage.length === 0)
    throw new Error("pass one or more --stage paths, or explicitly pass --all");
}

function quote(arg) {
  return /^[a-zA-Z0-9_./:-]+$/.test(arg)
    ? arg
    : `'${arg.replaceAll("'", `'\\''`)}'`;
}

function commandText(command, args) {
  return [command, ...args].map(quote).join(" ");
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  console.log(`$ ${commandText(command, args)}`);
  if (OPTIONS.dry_run) return { status: 0, stdout: "" };
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure)
    throw new Error(`${command} exited with status ${result.status}`);
  return result;
}

function output(command, args) {
  return run(command, args, { capture: true }).stdout.trim();
}

function usage() {
  console.log(`usage:
  node scripts/commit-pr.mjs \\
    --branch feat/short-description \\
    --title "feat(scope): summary" \\
    --body-file /path/to/pr-body.md \\
    --stage path [--stage path ...]

Options:
  --all       Explicitly stage every tracked and untracked worktree change.
  --dry-run   Validate inputs and print the commands without running them.
  --help      Show this help.

The command runs build, test, lint, and formatting gates; creates or reuses the
feature branch; stages only the requested paths; commits; pushes; and creates
or updates the branch PR. It never polls PR activity.`);
}

async function main() {
  validateOptions(OPTIONS);
  if (OPTIONS.help) return usage();

  const current = OPTIONS.dry_run
    ? "main"
    : output("git", ["branch", "--show-current"]);
  if (!current) throw new Error("detached HEAD is not supported");
  if (PROTECTED.has(current)) {
    run("git", ["checkout", "-b", OPTIONS.branch]);
  } else if (current !== OPTIONS.branch) {
    throw new Error(
      `already on feature branch ${current}; requested ${OPTIONS.branch}`,
    );
  }

  for (const target of ["build", "test", "lint", "fmt-check"])
    run("make", [target]);

  run("git", OPTIONS.all ? ["add", "--all"] : ["add", "--", ...OPTIONS.stage]);
  const staged = OPTIONS.dry_run
    ? OPTIONS.all
      ? "<all worktree changes>"
      : OPTIONS.stage.join("\n")
    : output("git", ["diff", "--cached", "--name-only"]);
  if (!staged) throw new Error("nothing is staged after git add");
  console.log(`staged:\n${staged}`);
  run("git", ["diff", "--cached", "--check"]);
  run("git", ["commit", "-m", OPTIONS.title]);
  run("git", ["push", "-u", "origin", "HEAD"]);

  const existing = OPTIONS.dry_run
    ? ""
    : output("gh", [
        "pr",
        "list",
        "--head",
        OPTIONS.branch,
        "--json",
        "url",
        "--jq",
        '.[0].url // ""',
      ]);
  let url;
  if (existing) {
    run("gh", [
      "pr",
      "edit",
      existing,
      "--title",
      OPTIONS.title,
      "--body-file",
      OPTIONS.body_file,
    ]);
    url = existing;
  } else {
    url = output("gh", [
      "pr",
      "create",
      "--title",
      OPTIONS.title,
      "--body-file",
      OPTIONS.body_file,
    ]);
  }
  console.log(OPTIONS.dry_run ? "dry run complete" : `PR: ${url}`);
}

let OPTIONS = {};
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    OPTIONS = parseArgs(process.argv.slice(2));
    await main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
