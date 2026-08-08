#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One guarded path from a reviewed worktree to a pushed commit and PR.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TYPES = "build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test";
const CONVENTIONAL = new RegExp(`^(${TYPES})(\\([a-z0-9,-]+\\))?!?: .+`);

// A branch is `<namespace>/<name>`, every segment lowercase kebab-case. The
// namespace is USUALLY a conventional-commit type — but requiring one refuses
// the branch a HARNESS assigns (`claude/<topic>-<id>`), which the session is
// not allowed to rename, and that turned the preferred one-command path into a
// dead end for exactly the sessions it exists to serve. The branch name is
// cosmetic anyway: PRs are squash-merged, so the PR TITLE is what becomes the
// commit on `main`, and that is still held to Conventional Commits below. A
// namespace that is not a type only warns.
export const BRANCH = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/;
const TYPE_NAMESPACE = new RegExp(`^(${TYPES})/`);
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
  if (PROTECTED.has(opts.branch))
    throw new Error(`--branch may not be the protected branch ${opts.branch}`);
  if (!opts.branch || !BRANCH.test(opts.branch))
    throw new Error(
      "--branch must look like feat/short-description or claude/assigned-topic — " +
        "lowercase kebab-case segments separated by /",
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

// `gh` is not everywhere. A managed/remote session reaches GitHub through MCP
// tools and ships no CLI at all, so the PR step — the half that makes the push
// visible — is exactly where the script used to stop being usable. Fall back to
// the REST API, which needs only a token.
export function repoSlug(remoteUrl) {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(
    remoteUrl.trim(),
  );
  // Never echo the URL itself — a fetch remote can carry a token in userinfo.
  if (!match) throw new Error("cannot read owner/repo from the origin remote");
  return { owner: match[1], repo: match[2] };
}

function ghAvailable() {
  // Probed for real even under --dry-run: the whole point of the dry run is to
  // print the plan that would actually execute, and which of the two PR paths
  // is taken is the part most worth seeing before committing to it.
  const probe = spawnSync("gh", ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

async function api(method, path, body) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token)
    throw new Error("gh is not installed and no GH_TOKEN/GITHUB_TOKEN is set");
  console.log(`$ ${method} https://api.github.com${path}`);
  if (OPTIONS.dry_run) return {};
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "commit-pr.mjs",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text).message ?? detail;
    } catch {
      // Not JSON — the truncated body is the best detail available.
    }
    throw new Error(
      `GitHub API ${method} ${path} → ${response.status}: ${detail}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

async function pullRequestViaApi(body) {
  const { owner, repo } = repoSlug(
    OPTIONS.dry_run
      ? "https://github.com/owner/repo"
      : output("git", ["remote", "get-url", "origin"]),
  );
  const open = await api(
    "GET",
    `/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${OPTIONS.branch}`,
  );
  const existing = Array.isArray(open) ? open[0] : undefined;
  if (existing) {
    await api("PATCH", `/repos/${owner}/${repo}/pulls/${existing.number}`, {
      title: OPTIONS.title,
      body,
    });
    return existing.html_url;
  }
  const repository = await api("GET", `/repos/${owner}/${repo}`);
  const created = await api("POST", `/repos/${owner}/${repo}/pulls`, {
    title: OPTIONS.title,
    body,
    head: OPTIONS.branch,
    base: repository.default_branch ?? "main",
  });
  return created.html_url;
}

async function pullRequestViaGh() {
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
    return existing;
  }
  return output("gh", [
    "pr",
    "create",
    "--title",
    OPTIONS.title,
    "--body-file",
    OPTIONS.body_file,
  ]);
}

async function openPullRequest() {
  if (ghAvailable()) return pullRequestViaGh();
  console.log("gh is not installed — opening the PR through the REST API");
  return pullRequestViaApi(readFileSync(OPTIONS.body_file, "utf8"));
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
or updates the branch PR. It never polls PR activity.

--branch takes any lowercase kebab-case <namespace>/<name>, so a branch handed
to the session by a harness (claude/some-topic-ab12cd) is accepted as-is; the
Conventional Commits check that matters is on --title, which becomes the
squashed commit on main. The PR is opened with gh when it is installed and
through the GitHub REST API (GH_TOKEN or GITHUB_TOKEN) when it is not.`);
}

async function main() {
  validateOptions(OPTIONS);
  if (OPTIONS.help) return usage();

  const current = OPTIONS.dry_run
    ? "main"
    : output("git", ["branch", "--show-current"]);
  if (!current) throw new Error("detached HEAD is not supported");
  if (!TYPE_NAMESPACE.test(OPTIONS.branch))
    console.log(
      `note: ${OPTIONS.branch} does not lead with a conventional-commit type. ` +
        `That is fine for an assigned branch — the PR title is what lands on main.`,
    );
  if (PROTECTED.has(current)) {
    // `checkout -b` fails on a branch a previous session already cut, which is
    // the normal state for an assigned branch resumed across sessions.
    const exists =
      !OPTIONS.dry_run &&
      run(
        "git",
        ["rev-parse", "--verify", "--quiet", `refs/heads/${OPTIONS.branch}`],
        { capture: true, allowFailure: true },
      ).status === 0;
    run(
      "git",
      exists
        ? ["checkout", OPTIONS.branch]
        : ["checkout", "-b", OPTIONS.branch],
    );
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

  let url;
  try {
    url = await openPullRequest();
  } catch (error) {
    // The push already landed, so this is not "the command failed" — it is the
    // worse half-state the skill warns about, and it has to say so loudly.
    throw new Error(
      `${error.message}\n\n` +
        `The BRANCH IS PUSHED and only the PR is missing — a pushed branch with\n` +
        `no PR is invisible. Open it with whatever GitHub tooling is available\n` +
        `(in an agent session: the create_pull_request MCP tool), using:\n` +
        `  head:  ${OPTIONS.branch}\n` +
        `  title: ${OPTIONS.title}\n` +
        `  body:  the contents of ${OPTIONS.body_file}`,
      { cause: error },
    );
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
