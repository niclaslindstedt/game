---
title: Open Source Game Project Specification
description: A prescriptive, language- and engine-agnostic specification for building an open source GAME as a well-run open source project — the licensing, documentation, automation, governance and release plumbing every OSS codebase needs, plus the structure a game needs: a headless simulation core, authored content compiled from data, deterministic runs, measurable balance, a mod seam, platform shells, and the craft loops that keep art, sound, story and UI honest.
version: 1.0.0
---

# Open Source Game Project Specification

This document is a prescriptive specification for building a **game** as an
open source project. It has two halves, and both are normative:

1. **The OSS baseline** (§1–§22) — licensing, documentation, automation,
   governance and release plumbing that users and contributors expect from
   any well-run open source codebase. A game is not exempt from any of it.
2. **The game shape** (§23–§37) — the structure a game needs on top of that
   baseline: a headless simulation core, content authored as data and
   compiled, deterministic runs, a scripting seam, a mod surface, UI as
   content, generated assets, a governed narrative, measured balance,
   platform shells, and the player-facing quality gates that decide whether
   the thing is shippable.

The spec is deliberately opinionated. Where it says "must", the item is
non-negotiable for any project that claims to follow this spec. Where it
says "should", the item is the recommended default but may be omitted for
small projects. Where it says "may", the item is optional.

Replace `<project>` throughout with the actual project name.

## The structure is the contract — not the technology

**Every mandate in this spec names a ROLE, never a technology.** A game
written in TypeScript against a browser canvas, in Rust against wgpu, in
C# against a commercial engine, or in Go against a terminal renderer can
all conform, and conforming means the same thing in each: the roles below
exist, they are separable, they depend on each other in one direction, and
the boundaries between them are the ones this spec draws.

This matters because a game outlives its stack. Renderers get replaced,
UI frameworks get replaced, the shell that wraps the build for a store
gets replaced, and — in the lifetime of a long-running project — the
language does too. What must survive every one of those migrations is the
shape: **what the simulation is, what the content is, what is generated,
what is authored, which direction the arrows point, and what a change to
each one obliges you to re-run.** A project that keeps the shape can swap
its renderer in a branch; a project that let the shape dissolve into its
framework rewrites the game instead.

So, throughout this spec:

- **Directory names are illustrative, roles are normative.** Where the
  spec writes `engine/`, `app/`, `content/`, a conforming project may use
  any names its ecosystem prefers, as long as the mapping is **one role
  to one place** and `AGENTS.md` (§7) states the mapping.
- **Named tools are examples.** Vite, Lua, YAML, Playwright, GitHub
  Actions and the rest appear as reference implementations of a
  requirement, never as the requirement. Substituting an equivalent is
  conformant; dropping the requirement is not.
- **A migration keeps the mandates and re-satisfies them.** Changing
  renderer, UI framework, serialization format or language does not
  suspend §23–§37 for the duration; it is exactly when they are load
  bearing.

## Applicability

`kind = "game"` in the project manifest selects this spec. §23–§37 apply
to every game. Individual chapters carry their own applicability note
where they are conditional — a single-player game omits §34
(multiplayer), a game with no user-content story omits nothing but reads
§27 as "the seam you will want later", and a game that ships only as a
web page satisfies §33 with a single shell.

A project that is *not* a game — a CLI, a library, a service — is out of
scope for this document. The baseline chapters are written to be useful
to any project, but the spec as a whole is aimed at games and its
conformance claims mean nothing without §23–§37.

## Versioning of this document

This document carries its own version in the YAML front matter and is
the **single, self-contained source of truth** for the projects that
claim it. There is no upstream document it is generated from and none it
must be reconciled against: a project that follows this spec keeps a copy
at its repository root and amends that copy deliberately, in a reviewed
pull request, the same way it amends any other governing file. §21.5
describes the maintenance skill that keeps a repository in conformance
with the copy it carries.

---

## 1. Repository layout

A new repository must contain the following files at its root before the
first public commit:

```
<repo>/
├── LICENSE                  # SPDX-identified license text (see §2)
├── README.md                # Project overview (see §3)
├── CONTRIBUTING.md          # How to contribute (see §4)
├── CODE_OF_CONDUCT.md       # Community standards (see §5)
├── SECURITY.md              # Vulnerability reporting (see §6)
├── CHANGELOG.md             # Release notes (see §8)
├── AGENTS.md                # Guidance for AI coding agents (see §7)
├── .gitignore               # Language-appropriate ignores
├── .editorconfig            # Cross-editor formatting baseline
├── .github/
│   ├── workflows/           # CI/CD pipelines (see §10)
│   ├── ISSUE_TEMPLATE/      # Bug report, feature request (see §15)
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml       # Dependency updates (see §14)
│   └── CODEOWNERS           # Review routing
├── docs/                    # Topic-specific documentation (see §11.1)
├── examples/                # Worked examples — sample mods, sample content (see §13.1)
├── prompts/                 # Versioned LLM prompts (see §13.2)
├── scripts/                 # Automation scripts (release, lint helpers)
└── Makefile                 # Standard developer entry points (see §9)
```

A **game** (`kind = "game"`) adds the role directories of §23 on top of
that baseline. The reference tree — names illustrative, roles normative:

```
<repo>/
├── engine/                  # SIMULATION CORE — framework-free, headless (§23.1)
├── app/                     # PRESENTATION SHELL — renderer, input, audio (§23.2)
├── content/                 # AUTHORED CONTENT — the catalogs, as data (§24)
├── mod/                     # MOD SDK — format, compiler, examples (§27)
├── server/                  # SESSION SERVICE — the core, hosted (§34, optional)
├── <platform-shell>/…       # STORE SHELLS — one directory each (§33, optional)
├── scripts/                 # TOOLING — generators, analyzers, measurement (§23.6)
└── tests/                   # Test suites (§20)
```

For a game whose deliverable *is* the deployed web page, the presentation
shell is also the web presence of §11.2 — see §11.4 and §11.5.
Generated content and generated assets are **build output**: they live
under a gitignored path inside the role that consumes them and are never
committed (§24.3).

`AGENTS.md` is the canonical file for AI coding agent guidance. Tool-
specific files (`CLAUDE.md`, `.github/copilot-instructions.md`,
`.cursorrules`, `.windsurfrules`, `GEMINI.md`, etc.) must exist as
**symlinks** to `AGENTS.md` rather than as separate copies — see §7.

`docs/` is required. `examples/` is required once the game has a surface
outsiders build against (a mod format, a plugin API); a game with no such
surface may omit it. There is no `website/` directory in the baseline
tree: a game's web presence is either the game itself or a landing page,
and §11.2 says which.

## 2. License

Every project must include a `LICENSE` file at the repository root. The
file must contain the full, unmodified license text, the copyright year,
and the copyright holder.

Recommended defaults:

- **MIT** for maximum permissiveness and minimal friction.
- **Apache-2.0** when explicit patent grants matter.
- **MPL-2.0** for file-level copyleft without infecting dependent code.
- **AGPL-3.0** only when the project is a hosted service whose source must
  remain open to users who interact with it over a network.

Every source file's header comment (where the language conventionally has
one) should reference the license by SPDX identifier:
`SPDX-License-Identifier: MIT`.

**A game's assets need their own answer, and it is not automatically the
code's.** Art, audio, fonts, and any third-party content ship under
licenses of their own, and a permissive code license over a font that
forbids redistribution is a takedown waiting to happen. A conforming
project therefore:

- States the license for **code** and the license for **assets**
  separately when they differ (a common pairing is a permissive code
  license with a Creative Commons license for art and audio).
- Keeps a record of every third-party asset it ships — source, license,
  and any attribution the license requires — and displays the required
  attributions in the game or in a file that ships with it.
- Confirms that generated assets (§29) may be licensed the way the
  project intends, given the tooling that produced them.

## 3. README.md

The `README.md` is the project's front page, and for a game the median
reader is a **player**, not a contributor. It must answer, in this order
— players first, then the people who want to build it:

1. **What the game is** — one sentence directly under the title. Genre,
   premise, and what a session is like. No marketing fluff.
2. **Where to play it** — the live URL, the store links, and the install
   affordance (§11.4.6). A game whose README opens with `git clone` has
   buried its own front door.
3. **What it looks like** — a capture from the real build, generated by
   the pipeline of §29.4 rather than hand-cropped, so it cannot go stale
   without anyone noticing.
4. **How you play it** — the controls and the input devices supported.
5. **What it costs the player** — price or "free", account required or
   not, network required or not, and the age rating if §35.5 applies.
6. **Prerequisites** — the toolchain versions needed to build it.
7. **Build and run** — the commands that take a fresh clone to a running
   game, and the developer entry points of §9.1.
8. **Configuration** — settings, environment variables, developer flags.
9. **Troubleshooting** — common failure modes and their fixes.
10. **Documentation** — links to `docs/` pages.
11. **Contributing** — a pointer to `CONTRIBUTING.md`.
12. **License** — a pointer to `LICENSE`, code and assets both (§2).

The top of the README should carry a row of status badges — CI, the
deploy or release status, and the license, plus any quality gate the
project wants visible at a glance (§11.3.9). Badges must be clickable
and point at the corresponding run, release, or page.

## 4. CONTRIBUTING.md

`CONTRIBUTING.md` is the contract between the project and external
contributors. It must cover:

- **Prerequisites** — exact tooling versions required to build and test.
- **Getting the source** — `git clone` command and initial setup.
- **Build / test / lint** — the canonical commands (see §9 Makefile).
- **Development workflow** — fork, branch, commit, PR.
- **Commit message conventions** — conventional commits (see §8).
- **Branch naming** — e.g. `feat/<slug>`, `fix/<slug>`.
- **Testing expectations** — where tests live, how to add them, coverage
  expectations if any.
- **Documentation expectations** — which docs must be updated alongside
  code changes (README, man pages, `docs/` topics, agent guidance files).
- **Pull request process** — review requirements, merge strategy, and who
  can merge.
- **Code of conduct reference** — a link to `CODE_OF_CONDUCT.md`.
- **Security reporting reference** — a link to `SECURITY.md`.

## 5. CODE_OF_CONDUCT.md

Projects must adopt a code of conduct. The recommended baseline is the
[Contributor Covenant](https://www.contributor-covenant.org/) v2.1 or
later.

`CODE_OF_CONDUCT.md` **must link out** to the canonical external text of
the chosen code (e.g. the Contributor Covenant v2.1 URL) rather than
embedding the full document verbatim. This is a deliberate constraint:
AI coding agents — which bootstrap and maintain many conforming
projects — are commonly blocked by content filters from reproducing
sections of a code of conduct verbatim (harassment examples, protected
characteristics, etc.), so a link-first policy is the only form that can
be reliably generated and updated end-to-end by an agent.

The file must:

- Name the code being adopted and link to its canonical URL.
- Describe briefly where it applies (project spaces, issues, PRs, chat).
- Point reporters at the contact path defined in `SECURITY.md` for
  reporting violations — `SECURITY.md` is the single source of truth for
  contact addresses; do not duplicate an email here.

The file must **not** be required to contain the full Contributor
Covenant text, a named individual enforcement responder, or a contact
address of its own. Conformance checks (including AI quality review)
must not flag a link-only `CODE_OF_CONDUCT.md` as a violation.

## 6. SECURITY.md

`SECURITY.md` must describe:

- **Supported versions** — which release lines receive security fixes.
- **Reporting channel** — a private reporting path (GitHub Security
  Advisories, dedicated email, or HackerOne). Public issues must not be
  the intake channel for vulnerabilities.
- **Response expectations** — acknowledgment and triage timelines.
- **Disclosure policy** — coordinated disclosure window.
- **Scope** — what is considered in-scope vs. out-of-scope for the
  project's threat model.

## 7. AI agent guidance — AGENTS.md as the single source of truth

Modern OSS projects are regularly edited by AI coding agents. A
machine-readable guidance file at the repository root captures the
project's conventions so agents produce changes that match the rest of
the codebase on the first attempt.

**`AGENTS.md` is the canonical and only source of truth** for agent
guidance. It must live at the repository root and cover:

- **Build and test commands** — the canonical Makefile or script targets.
- **Commit and PR conventions** — conventional commits, PR title format,
  squash-merge policy.
- **Architecture summary** — a paragraph or two on module layout and
  dependency direction.
- **Where new code goes** — a routing table mapping common change types
  to the directories they belong in.
- **Test file conventions** — where tests live and how they are named
  (see §20 for the naming rule and rationale).
- **Documentation sync points** — a table of "if you change X, update Y".
- **Parity / checklist rules** — any cross-cutting rule that must be
  applied in more than one place at once (a vocabulary defined in two
  files, an artifact regenerated with a change, two shells kept paired).
- **Web-presence staleness policy** — a pointer to §11.2 stating that
  the page must be regenerated whenever source-derived content changes.
- **Maintenance skills** — a pointer to §21 describing the agent
  skills the project ships for keeping drift-prone artifacts in sync.

### 7.1 Tool-specific files as symlinks

Every AI tool expects its guidance file at a different path. To avoid
duplication and drift, projects must create every tool-specific guidance
file as a **symbolic link** to `AGENTS.md`, not as a copy:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s ../AGENTS.md .github/copilot-instructions.md
ln -s AGENTS.md .cursorrules
ln -s AGENTS.md .windsurfrules
ln -s AGENTS.md GEMINI.md
ln -s AGENTS.md .aider.conf.md
```

Required symlinks:

| Link path                              | Tool                  |
|----------------------------------------|-----------------------|
| `CLAUDE.md`                            | Claude Code           |
| `.github/copilot-instructions.md`      | GitHub Copilot        |
| `.cursorrules`                         | Cursor                |
| `.windsurfrules`                       | Windsurf              |
| `GEMINI.md`                            | Gemini CLI            |

Editing any tool-specific file (rather than `AGENTS.md`) is forbidden and
should be prevented by a pre-commit hook that refuses commits which
dereference the symlinks into regular files. A CI job should additionally
verify that each listed path is a symlink and resolves to `AGENTS.md`.

Projects on platforms without symlink support (Windows without developer
mode, some CI runners) should enable symlinks explicitly rather than
abandoning the single-source-of-truth rule:

```bash
git config --global core.symlinks true
```

### 7.2 Additional `AGENTS.md` contents for a game

A game's `AGENTS.md` is the router into a much larger surface, and four
more sections are **required** (`kind = "game"`):

- **The role map** — which directory holds which §23 role, and the
  dependency direction between them, stated as a rule an agent can
  refuse a change against ("the core never imports the shell").
- **The content pipeline table** — every catalog of §24: its authored
  source, its generator, its generated output, and its drift guard. An
  agent that cannot see this table will hand-edit generated files.
- **The rules that bite** — the project's load-bearing invariants stated
  as imperatives with the file that owns each one: the determinism rules
  (§25), the accessors that must be used instead of a raw state read,
  the artifacts that must be regenerated in the same commit as the change
  that moves them. This section is where a project's hard-won
  post-mortems live; it is the highest-value part of the file.
- **The craft-skill index** — which skill (§21.9) to load before which
  kind of work: art, audio, level, enemy, balance, narrative, UI.

`AGENTS.md` must state that **generated content and generated assets are
never hand-edited**, and name the command that regenerates each.

## 8. Commits, versioning, and changelog

### 8.1 Conventional commits

Projects must use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

[optional body]

[optional footer(s)]
```

Allowed types:

| Type       | Purpose                                  | Changelog section | SemVer bump |
|------------|------------------------------------------|-------------------|-------------|
| `feat`     | New user-facing feature                  | Added             | minor       |
| `fix`      | User-facing bug fix                      | Fixed             | patch       |
| `perf`     | Performance improvement                  | Performance       | patch       |
| `docs`     | Documentation only                       | Documentation     | none        |
| `test`     | Test-only changes                        | Tests             | none        |
| `refactor` | Code change that is neither fix nor feat | —                 | none        |
| `chore`    | Tooling, dependencies, housekeeping      | —                 | none        |
| `ci`       | CI/CD configuration                      | —                 | none        |
| `build`    | Build system, packaging                  | —                 | none        |
| `style`    | Whitespace, formatting                   | —                 | none        |

Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer and force a
major version bump.

### 8.2 Pull request merging

Projects must pick and document one merge strategy. The recommended
default is **squash-merge**, in which case:

- The PR title must follow conventional-commit format, because it becomes
  the single commit on the default branch.
- Individual commits inside a PR branch have no effect on the changelog.
- When additional commits are pushed to an open PR, the PR title and
  description must be updated to reflect the combined scope.

### 8.3 Semantic versioning

Projects must follow [SemVer 2.0.0](https://semver.org). Version numbers
are bumped automatically from the conventional-commit stream at release
time (see §10.3). Pre-1.0 projects may break compatibility in minor
releases but must still flag breaking changes with `!` or
`BREAKING CHANGE:` so that the changelog reflects them.

### 8.4 CHANGELOG.md

Projects must maintain a `CHANGELOG.md` in the [Keep a Changelog](https://keepachangelog.com/)
format. The file must be **generated automatically** from the
conventional-commit history at release time. Manual edits to
`CHANGELOG.md` are forbidden and should be enforced by a pre-commit check
or a CI lint.

### 8.5 Player-visible changes need a fragment, not a commit type

For a game, the commit-type mapping of §8.1 is not sufficient on its own.
A `fix(engine)` may be invisible to players (a refactor guard) or the
headline of the release (the boss that could not be killed); a `feat`
may be a developer tool nobody playing will ever see. The changelog a
**player** reads is a different artifact from the one contributors read.

Games must therefore adopt a **changeset fragment** workflow alongside
conventional commits:

- Every pull request settles exactly one of two outcomes: it adds a
  fragment file under a directory such as `.changes/unreleased/`
  describing the change **in the player's vocabulary**, or it carries a
  label (`no-changelog`) declaring that no player would notice it.
  Never both, never neither.
- A fragment declares its own type (added / changed / fixed / balance /
  content / performance), and the release tooling derives the SemVer bump
  and the `CHANGELOG.md` section from the accumulated fragments.
- CI must enforce the pair: an unlabeled PR with no fragment fails.
- Fragments are per-PR files, not edits to a shared file, so parallel
  branches never conflict on the changelog.

The rule that makes this worth the ceremony: **balance and content
changes are player-visible even when no code changed.** A retuned drop
rate, a re-authored level, a re-recorded sound are exactly the changes a
commit-message-derived changelog silently drops, and exactly the changes
players notice first.

## 9. Build system — Makefile

Every project must expose a small, uniform set of developer entry points.
A top-level `Makefile` (or equivalent task runner for the ecosystem) is
the recommended mechanism. The following targets are required:

| Target         | Purpose                                           |
|----------------|---------------------------------------------------|
| `make build`   | Developer build                                   |
| `make test`    | Run the full test suite                           |
| `make lint`    | Run the linter(s) with zero-warning policy        |
| `make fmt`     | Format the codebase in place                      |
| `make release` | Release/optimized build                           |
| `make clean`   | Remove build artifacts                            |

Recommended optional targets:

| Target             | Purpose                                       |
|--------------------|-----------------------------------------------|
| `make fmt-check`   | Verify formatting without modifying files    |
| `make coverage`    | Run tests with coverage reporting            |
| `make docs`        | Build local documentation                    |
| `make dev`         | Run the game locally with hot reload         |
| `make bench`       | Run benchmarks                               |

CI pipelines must invoke these exact targets rather than reimplementing
their commands, so that local and CI environments stay in sync.

### 9.1 Required targets for a game

A game must additionally expose these entry points (`kind = "game"`).
Names are illustrative in the same way as everything else in this spec —
what is normative is that **each capability has exactly one documented
command**, because a capability reachable only by remembering a script
path and its flags is a capability contributors stop using:

| Target            | Purpose                                                    | Chapter |
|-------------------|------------------------------------------------------------|---------|
| `make content`    | Recompile every authored catalog into its generated output | §24     |
| `make assets`     | Regenerate every derived asset (sprites, atlas, icons)     | §29     |
| `make sim`        | Run the headless simulator over a scenario                 | §32.2   |
| `make playtest`   | Drive the real build with the autopilot and report         | §32.4   |
| `make bench`      | Measure simulation throughput against a recorded baseline  | §32.5   |

Two rules govern how these compose, and both are learned the hard way:

- **One pipeline, one entry point, run exactly once.** `build`, `test`
  and `lint` each open by bringing generated content and assets up to
  date, so they are correct on a fresh clone. Whatever *depth* of the
  pipeline a target needs is an **argument** to the one pipeline, never a
  second pipeline — a target that chains two entry points compiles the
  content tree twice and the cost lands on every contributor, every run.
- **The test command is the gate, not the test runner.** Contributors and
  agents must be told to verify with `make test`, never with the
  underlying runner invoked directly: the runner tests whatever happens
  to be on disk, and any artifact that is both committed and drift-tested
  against a fresh build (§24.4, §33.5) will agree with its own stale self
  while CI fails.

## 10. Continuous integration and release

### 10.1 CI pipeline

Every push to a branch and every pull request must run:

1. Checkout with full history (required for changelog generation).
2. Toolchain setup (pinned minimum version — see §10.3 for the
   per-language floor versions, and §10.5 for pinning the **exact**
   local-developer version that CI resolves against).
3. Dependency cache restore.
4. `make build`
5. `make test`
6. `make lint`
7. `make fmt-check`
8. Test result and coverage upload (optional but recommended).

The CI pipeline must fail on the first error and must treat warnings from
the linter as errors. CI must also run on multiple operating systems
(`ubuntu-latest`, `macos-latest`, `windows-latest`) for projects that
claim cross-platform support.

### 10.2 Status checks

The default branch must be protected. Required status checks must
include:

- All CI matrix jobs.
- At least one human review (or `CODEOWNERS`-based review routing).
- A passing `fmt-check` and `lint` job.
- Up-to-date branch before merge.

Force pushes and direct pushes to the default branch must be disallowed.

### 10.3 Release pipeline

Releases must be fully automated, reproducible, and triggered by an
explicit human intent — never by an incidental push. The canonical flow
uses **two chained workflows**, a `version-bump` workflow that a
maintainer dispatches manually, and a `release` workflow that runs
automatically when the tag that `version-bump` pushes lands on the
repository.

The release pipeline is triggered by the **`v*` tag push** that the
`version-bump` workflow performs — not by a `workflow_run` event on
`version-bump`. `workflow_run` from a sibling workflow does not
reliably fire when the upstream workflow pushed a tag with a PAT /
GitHub App token, and the event that does fire runs against the
default-branch commit rather than the tagged commit, which is the
wrong ref for every downstream build and publish step. Triggering on
`push: tags: ['v*']` is what works end-to-end, and it keeps the audit
trail simple: there is exactly one release per tag, and every tag can
only be created by a successful run of the `version-bump` workflow
(which is itself `workflow_dispatch`-only — see below).

Humans still must not push `v*` tags by hand. That restriction is
enforced by branch/tag protection rules on the repository, not by the
workflow trigger.

#### Workflow 1 — `version-bump`

Trigger: `workflow_dispatch` only, with a single input:

```yaml
on:
  workflow_dispatch:
    inputs:
      bump:
        description: 'Version bump type (auto | patch | minor | major)'
        required: false
        default: 'auto'
        type: choice
        options: ['auto', 'patch', 'minor', 'major']
```

Behaviour:

1. Check out the default branch (`main`) with full history.
2. Determine the next version:
   - `auto` (default) — read the conventional-commit range since the
     previous `v*` tag and pick `major`, `minor`, or `patch` according
     to the bump table in §8.1.
   - `patch` / `minor` / `major` — force the corresponding bump.
3. Verify the working tree is clean, the branch is `main`, and the
   computed tag does not already exist.
4. Create an **unannotated** lightweight tag `vX.Y.Z` on the current
   `HEAD` of `main` and push it to origin.
5. Exit successfully.

The version-bump workflow does **not** touch `CHANGELOG.md`, does
**not** rewrite package manifests, and does **not** push any commits.
All of that work happens in the release workflow, below. Keeping
version-bump small and read-only makes it safe to re-run if the
release workflow fails mid-flight.

The scripted logic (computing the next version, tagging, pushing)
should live in `scripts/release.sh` so a maintainer can also run it
locally, with the same semantics, as a break-glass procedure.

#### Workflow 2 — `release`

Trigger: the `push` event on any `v*` tag. The tag is pushed by the
`version-bump` workflow using `RELEASE_TOKEN` (see below), which is
what causes the downstream trigger to fire — the default
`GITHUB_TOKEN` deliberately suppresses recursive workflow triggers, so
`version-bump` must authenticate the tag push with a PAT or GitHub App
token.

```yaml
on:
  push:
    tags:
      - 'v*'
```

**Why not `workflow_run`?** A `workflow_run:
workflows: ['version-bump']` trigger does not work reliably: it fires
against the default-branch commit rather than the tagged commit, and
in practice it does not fire at all when the upstream workflow pushes
its tag with a PAT / GitHub App token. The `push: tags: ['v*']` form
runs cleanly end-to-end — the triggering event carries the tag ref,
so every downstream checkout/build/publish step sees the right
sources without any extra `git describe` gymnastics.

Hand-pushed tags must still not be accepted. That is enforced
out-of-band by tag protection rules on the repository (restricting
`v*` creation to the release bot identity that `version-bump` uses),
not by the workflow trigger.

The release workflow performs the following steps in order:

1. **Resolve the new tag.** The workflow reads the tag from
   `GITHUB_REF_NAME` (the tag that caused the `push` event). No `git
   describe` fallback is needed — the triggering event already names
   the tag.
2. **Check out the default branch** with full history
   (`fetch-depth: 0`) — not the tagged commit. The workflow must
   commit back to `main`.
3. **Generate `CHANGELOG.md`** from the conventional-commit range
   between the previous `v*` tag and the new one. A
   `scripts/generate-changelog.sh` helper is the recommended home for
   the logic.
4. **Update version numbers in every package manifest** the project
   ships. A `scripts/update-versions.sh` helper (or equivalent) must
   rewrite **all** of the following that apply:
   - `Cargo.toml` (and every workspace member).
   - `package.json` (and every workspace package, plus
     `package-lock.json`).
   - `pyproject.toml` / `setup.cfg` / `__version__.py`.
   - `*.csproj` / `Directory.Build.props`.
   - `build.gradle` / `build.gradle.kts` / `gradle.properties`.
   - `pom.xml`.
   - `Package.swift`.
   - Helm `Chart.yaml`, Docker image labels, and any embedded version
     constant in source.
5. **Commit the changes** back to the default branch with a
   conventional-commit message of the form
   `chore(release): update changelog and versions for vX.Y.Z`, then
   `git push origin main`. If both the generated changelog and every
   manifest are already in the correct state, the step must be a
   no-op and must not create an empty commit.
6. **Move the tag to the new commit and force-push it.** The tag
   pushed by `version-bump` (pointing at the last regular `main`
   commit) must now point at the release commit containing the
   generated changelog and bumped versions:

   ```bash
   git tag -f "${TAG}" HEAD
   git push origin "${TAG}" --force
   ```

   This is the **only** place in the entire project where
   force-pushing a git ref is permitted, and it is permitted only for
   the exact tag that `version-bump` just created. Branches must
   never be force-pushed.

   The commit-and-retag step must authenticate with the default
   `GITHUB_TOKEN`, not `RELEASE_TOKEN`. `GITHUB_TOKEN` deliberately
   suppresses downstream workflow triggers, so the force-push does
   not re-fire the release workflow on itself. Using `RELEASE_TOKEN`
   here would start a second release run that attempts to re-publish
   an already-published version and fails noisily.
7. **Build release artifacts in a matrix** covering every target
   platform the project ships — operating systems, architectures,
   language toolchains, container variants. Matrix jobs run in
   parallel, each checking out the **rewritten** tag so they see the
   bumped versions and generated changelog.
8. **Run the project's test suite** on the rewritten tag in at least
   one matrix job before any artifact is published.
9. **Deliver the build to every channel the game ships through**:
   GitHub Releases for the downloadable builds, the web deploy (§10.4),
   each store's upload channel, and any package registry the project
   genuinely publishes to (a mod SDK, a dedicated-server image).
   Publish jobs depend on successful matrix builds. **Every publish
   step that targets a registry supporting it must authenticate via
   OIDC-based trusted publishing** — never a long-lived API token or
   password. See "Trusted publishing" below. Store uploads generally
   cannot: see §33.5 for what a store release owes instead.
10. **Extract release notes** for the new version from `CHANGELOG.md`
    (the section between the latest and previous `## [vX.Y.Z]`
    headings) and attach them to the GitHub Release along with the
    built artifacts.
11. **Publish signed artifacts with provenance attestations** (SLSA
    level 3 recommended; GitHub's built-in artifact attestations are
    a reasonable baseline).

Design constraints:

- **Single entry point.** `workflow_dispatch` on `version-bump` is
  the only supported way to start a release. Hand-pushing `v*` tags
  must be prevented by tag protection rules on the repository — the
  release workflow will happily run against any `v*` tag push, so
  the integrity of the pipeline depends on the protection rule
  scoping tag creation to the release bot identity.
- **Idempotent version-bump step.** If the computed version already
  matches every manifest, step 5 is a no-op.
- **RELEASE_TOKEN secret.** `version-bump` needs a PAT or GitHub App
  token with write access to tags, because `GITHUB_TOKEN`
  deliberately suppresses downstream workflow triggers and a tag
  pushed with it would not fire `release`. `release` itself uses the
  default `GITHUB_TOKEN` for its commit-to-`main` and retag steps —
  that same trigger suppression is what prevents the retag from
  starting a duplicate release run.
- **Branch protection.** `main` must be protected, and the release
  bot (or `github-actions[bot]`) must have a narrowly scoped
  exception to push the `chore(release): ...` commit. Disable branch
  protection globally at your peril.
- **Trusted publishing wherever the channel supports it.** Every
  package the release pipeline publishes to a registry that offers
  OIDC-based trusted publishing **must** use it — long-lived API
  tokens, passwords and personal access tokens must not be used.

  Store upload channels mostly do not offer it, and that exception is
  expected rather than shameful. Where a credential is unavoidable, the
  project must (a) document the exception in `SECURITY.md`, (b) scope
  the credential to a single channel and a single title, (c) store it
  as an environment secret gated on the `release` environment with
  required reviewers, and (d) prefer the platform's own upload identity
  (a dedicated CI account with only upload rights) over a personal one.
  A store credential in a repository secret with no environment gate is
  the most valuable thing in the repository, protected the least.

- **Pinned toolchain minimum versions.** Every CI and release job
  that sets up a language toolchain **must** declare an explicit
  minimum version, not a floating specifier such as `stable`,
  `latest`, or `lts/*`. Trusted publishing gives the registry a
  cryptographic guarantee about who is publishing; pinning the
  toolchain gives *reviewers* a guarantee about **what** is being
  built. The two controls are complementary: an OIDC-authenticated
  publish that silently built with a toolchain the author has never
  tested is still a supply-chain risk.

  The floor versions below apply to every language this spec
  supports. Projects are free to pin higher; a conformance check must
  fail the build if a workflow declares anything lower or uses a
  floating specifier:

  | Language | Minimum | `setup-*` specifier |
  |---|---|---|
  | Rust   | 1.88 | `dtolnay/rust-toolchain@1.88.0` |
  | Python | 3.12 | `actions/setup-python` with `python-version: "3.12"` |
  | Node   | 24   | `actions/setup-node` with `node-version: "24"` |
  | Go     | 1.22 | `actions/setup-go` with `go-version: "1.22"` |

  The same minimums must be reflected in `README.md` "Prerequisites"
  (§3) and `CONTRIBUTING.md` "Prerequisites" (§4) so that
  contributors discover them before a CI failure does.

  **Local/CI parity.** The toolchain version pinned in CI **should**
  match the version developers use locally (e.g. via
  `rust-toolchain.toml`, `.python-version`, `.node-version`, or
  `.go-version`). When local and CI environments diverge, code that
  passes on a developer's machine may break in CI — or vice versa —
  leading to wasted cycles and eroded trust in the pipeline.
  Projects should treat their CI configuration as the canonical
  environment definition and keep local tooling in sync.

- **Least-privilege workflow permissions.** Every job that publishes
  a release artifact **must** declare an explicit job-level
  `permissions:` block. Implicit, workflow-level, or default
  `GITHUB_TOKEN` scopes are not acceptable for publish jobs — the
  scopes must be written down where the job runs so that a reviewer
  can audit them in one place. The minimum for a trusted-publishing
  job is:

  ```yaml
  permissions:
    contents: read     # checkout only; bump to `write` only if
                       # the job itself pushes commits or tags
    id-token: write    # required to mint the OIDC token that
                       # trusted publishing exchanges for a
                       # short-lived registry credential
  ```

  Additional scopes (`packages: write` for GHCR, `attestations:
  write` for SLSA provenance, `pull-requests: write` for release
  PRs, etc.) must be added explicitly and only on the jobs that
  need them. The top of the workflow file must set
  `permissions: {}` (or the most restrictive scope required by
  non-publish jobs) so that any job without its own block gets
  nothing by default. A CI check must fail the build if a publish
  job is missing `id-token: write`, if it relies on the default
  token scopes, or if `contents: write` is granted to a job that
  does not push to the repository.

The tag created by `version-bump` (`vX.Y.Z` pointing at the last
regular commit on `main`) and the final tag state (`vX.Y.Z` pointing
at the generated release commit) are intentionally different.
Consumers and downstream CI always see the final, rewritten tag.

### 10.4 Web deployment — every commit to `main`

A project that publishes a web page — the game itself (§11.4) or a
landing page (§11.2.1) — deploys it on **every push to the default
branch**, not only on release. A dedicated `pages` workflow triggered by
`push: branches: ['main']` (with a `workflow_dispatch` escape hatch)
installs the page's dependencies, runs the source-data extraction step
of §11.2.2, builds, uploads the output as a Pages artifact, and deploys
it via `actions/deploy-pages`.

Because the extractor reads from the latest `v*` tag when one exists
(see §11.2.2), the deployed page describes the most recent **released**
version rather than unreleased work, even though the workflow runs on
every `main` commit. Where the page *is* the game, the released build
and the in-progress build are served from separate slots instead —
§11.5.

Concurrency must be configured so that only one deploy runs at a
time (`concurrency: { group: pages, cancel-in-progress: false }`) and
in-flight deploys are never cancelled.

The `pages` workflow is independent of the release pipeline: a
release does not wait for Pages, and a Pages deploy does not wait for
a release. Each delivers its own artifact to its own audience.

### 10.5 Local/CI environment parity

Every project must pin its language toolchain in a **repository-root
pin file** that both the local developer's toolchain manager and the
CI workflow read. CI's toolchain step must resolve to that same file
(or to a literal that matches it exactly). A lint, test, or build
that succeeds locally must not fail on CI solely because the two
environments booted different toolchain versions.

Why this matters:

- Linters and compilers gain, remove, and reword diagnostics between
  minor versions; an unpinned local toolchain produces noise that
  only shows up on CI (the canonical failure mode: `cargo clippy`
  passes on the contributor's Rust 1.90 install, then fails on CI's
  pinned 1.88.0 because a new lint fired).
- A single pin file prevents the version string from being duplicated
  in CI YAML, where it silently drifts.
- Contributors running `rustup show` / `pyenv install` / `nvm use` /
  `go build` in a fresh clone pick up the correct version without
  reading the CI config.

Per-language pin file (`must`):

| Language | Pin file | Example contents | CI reads it via |
|---|---|---|---|
| Rust | `rust-toolchain.toml` | `[toolchain]`<br>`channel = "1.88.0"`<br>`components = ["clippy", "rustfmt"]`<br>`profile = "minimal"` | `dtolnay/rust-toolchain@<channel>` matching the pin, or `rustup show` (auto-reads the file) |
| Python | `.python-version` | `3.12` | `actions/setup-python@v5` with `python-version-file: .python-version` |
| Node | `.nvmrc` (+ `"engines": { "node": ">=24" }` in `package.json`) | `24` | `actions/setup-node@v4` with `node-version-file: .nvmrc` |
| Go | `go.mod` with a `toolchain` directive | `go 1.22`<br>`toolchain go1.22.6` | `actions/setup-go@v5` with `go-version-file: go.mod` |
| Generic / polyglot | `.tool-versions` (asdf / mise) or a devcontainer | `rust 1.88.0`<br>`python 3.12.5` | Matching `asdf install` / devcontainer setup step |

Floating specifiers (`stable`, `latest`, `lts`, `lts/*`, `*`) are
**not permitted** in the pin file, same as in CI (§10.3).

Enforcement: a conformance check detects the project's languages from
their root manifest (`Cargo.toml`, `pyproject.toml`, `package.json`,
`go.mod`) and requires the corresponding pin file for each one. It
also cross-checks the pin-file version against the version referenced
by `ci.yml` and reports a violation if they disagree.

## 11. Documentation and the web presence

A game addresses two different readers, and conflating them is why game
repositories so often have documentation nobody reads:

- **Players** meet the game through its page (§11.2) and its store
  listings. They do not read `docs/`.
- **Contributors and modders** meet it through `README.md` (§3) and
  `docs/` (§11.1). They do not need marketing copy.

Write each surface for its reader, and derive every shared fact from one
source (§11.2.2) so the two cannot disagree.

### 11.1 `docs/` directory

`docs/` is the authoritative reference for people who work on the game.
Each topic lives in its own markdown file and is linked from the
README's "Documentation" section. The topics a game owes, beyond the
usual `getting-started` / `configuration` / `troubleshooting`:

- `docs/architecture.md` — the roles of §23 and the dependency direction.
- `docs/content-pipeline.md` — every catalog, its generator, its output
  and its drift guard (§24).
- `docs/modding.md` — the mod boundary (§27.2), if mods are supported.
- `docs/scripting.md` — the scripted-rule seam (§26), if it exists.
- `docs/multiplayer.md` — the session architecture (§34), if it exists.
- The narrative tiers (§30) — the gist and the script, which are
  documents in their own right rather than sections of another page.

Topic files must avoid duplicating the README's quick start and must
instead go deeper. Each file should be self-contained enough to stand
alone when linked from an issue or a search result.

Documentation is kept in sync with code via the "documentation sync
points" table in `AGENTS.md` (see §7) so that contributors know exactly
which pages to touch for each kind of change.

### 11.2 The game's web presence

**Every game must have one canonical page a player can reach**, and what
that page *is* depends on how the game is delivered:

| Delivery | The page | Governed by |
|---|---|---|
| The game runs in the browser | **The page is the game.** There is no separate marketing site to keep in sync, and the landing content lives on the same origin as the build. | §11.3, §11.4, §11.5 |
| The game is downloaded or bought from a store | A **landing page**: what the game is, what it looks like, and where to get it. | §11.2.1, §11.3 |

There is no requirement to publish a hosted documentation site. A game's
`docs/` (§11.1) is written for contributors and modders, and a
repository renders it perfectly well; a game that *wants* a docs site may
ship one, but the spec does not ask for it and a game with no such site
is fully conformant. This is a deliberate departure from
general-purpose-software convention: players do not read reference
manuals, and time spent building a docs site is time not spent on the
game.

#### 11.2.1 What a landing page must carry

1. **Identity** — the title, the one-line pitch, and the key art.
2. **What playing it looks like** — captures or a short video from the
   real build, generated by the pipeline of §29.4 rather than
   hand-collected, so an art pass cannot leave the page showing a game
   that no longer exists.
3. **How to get it** — every store, platform and download, with the
   requirements a player needs before clicking (platform, input,
   network, price, age rating).
4. **What is in it** — enough concrete detail for a player to decide:
   the genre, the shape of a session, what makes it different.
5. **Links out** — the repository, the changelog, the community venue
   (§18), and the security contact (§6).

A game that ships to stores should treat the storefront as the primary
sales surface and the landing page as the canonical, un-gatekept one —
the page that still works when a store delists it.

#### 11.2.2 Facts come from source, never from a copy

Whatever the page is, **any fact that already exists in the repository is
extracted at build time**, not re-typed into the page. At minimum: the
title, pitch and descriptions from the identity manifest (§35.6), the
current version from the release tag or manifest, the platform list, the
latest changelog section, and the capture set (§29.4).

A conforming project ships an extraction step that runs as the first
step of the page's build, writes a single generated data file the page
imports, and **fails loudly** when an expected source marker is missing
rather than silently emitting stale data. The generated file is build
output (§24.3): gitignored, regenerated every build.

Hard-coded duplicates of source facts are the most common rot in this
whole chapter, and they rot invisibly — nothing breaks, the page just
starts lying about the game.

### 11.3 SEO and discoverability

**The page of §11.2 must be findable.** Search engines, AI crawlers and
social-card unfurlers each consume a different slice of the same HTML,
and a game that ships an empty JavaScript shell is invisible to all
three — which for a browser game means invisible to the audience that
would have played it. This section is prescriptive about what every
route emits and how the build verifies it before deploy.

The mechanics are shape-agnostic; the *content* of titles, descriptions
and structured data is the project's to write.

#### 11.3.1 Prerendered HTML body — never an empty SPA shell

Every public URL the page serves must return HTML whose `<body>`
contains the visible content (heading, prose, internal links) at
request time, not after a JavaScript framework hydrates. A bare
`<body><div id="root"></div></body>` is the classic indexing-killer:
Google's two-stage pipeline indexes the initial HTML first and queues
JS rendering on a separate, heavily-deprioritised pass, so SPAs that
ship empty bodies regularly sit at "Discovered – currently not indexed"
indefinitely.

Required pattern:

1. A static-site generator or post-build SSR step emits a real HTML
   file per route under `dist/`.
2. The prerendered body includes the page's `<h1>`, the full prose,
   breadcrumbs, and the page's outbound internal links.
3. If the site is a JS app, it hydrates the prerendered HTML rather
   than wiping the root and re-rendering. In React this means
   `hydrateRoot` (not `createRoot`), `renderToString` (not
   `renderToStaticMarkup`, so Suspense boundary markers are emitted),
   and any state that depends on browser-only APIs (`localStorage`,
   `window`, media queries) is deferred to `useEffect` so the first
   client render matches the server render exactly. Other frameworks
   have equivalent hydration entry points; the requirement is that no
   route's first paint blanks the prerendered body.

A `dist/404.html` copy of the shell with `noindex,follow` keeps
SPA-fallback hosting sensible on unknown URLs without leaking
soft-404 signals when crawlers guess URLs.

#### 11.3.2 Per-route `<head>` requirements

Every prerendered HTML file must include, in `<head>`, values that
describe **that page** rather than the site as a whole:

- `<title>` — page-specific, ≤ 60 characters where possible (Google
  truncates around 60).
- `<meta name="description">` — page-specific, ≤ 160 characters.
- `<link rel="canonical">` — absolute URL on the canonical host.
- `<meta name="robots">` — `index,follow,max-image-preview:large` on
  real pages; `noindex,follow` on `404.html`.
- `<meta charset="utf-8">`, `<meta name="viewport">`, and
  `<html lang="…">` on the root element.
- Open Graph: `og:type=website`, `og:title`, `og:description`,
  `og:url`, `og:image` (with `og:image:width`, `og:image:height`,
  `og:image:alt`), `og:site_name`, `og:locale`. The image is key art or
  a real capture — a game shared into a chat is judged on that image
  before a word of the description is read.
- Twitter card: `twitter:card=summary_large_image`, `twitter:title`,
  `twitter:description`, `twitter:image`, `twitter:image:alt`. The
  `:alt` is separately required — Twitter does not fall back to
  `og:image:alt`.
- `<meta name="theme-color">` with `media="(prefers-color-scheme:
  light)"` and `(dark)` variants matching the rendered backgrounds.
- `<meta name="referrer" content="strict-origin-when-cross-origin">`.

All SEO copy and configuration — name, tagline, description, canonical
URL, keywords, OG image dimensions, language, sitemap path — is read
from the identity manifest (§35.6) through a single module imported by
both the runtime and any build-time generator. Tweaking the pitch must
be a one-file change, and that file must be the same one the game and
the store metadata read.

#### 11.3.3 Structured data (JSON-LD)

Every page ships at least one `<script type="application/ld+json">`
block. For a game the useful types are few:

- **The page a player lands on:** `VideoGame` (a subtype of
  `SoftwareApplication`) with `name`, `description`, `image`,
  `genre`, `gamePlatform`, `applicationCategory: "Game"`,
  `operatingSystem`, `inLanguage`, `author` / `publisher`, and an
  `offers` block stating the price — including `"price": "0"` for a
  free game, which is what makes "free" show up in a result.
- **The site itself:** `WebSite` with the canonical URL, so the graph
  has a root.
- **404:** none — the page is `noindex`.

Invariants the structural check (§11.3.9) must enforce:

- The JSON-LD `image` equals the `og:image` URL. Rich results read the
  structured image, not the meta tag, and silent drift between them is
  a frequent regression.
- Every JSON-LD block parses and sets `@type`.
- Every external profile the project maintains (repository, store
  pages, community) appears in `sameAs`.

Use absolute, stable `@id` URLs so the graph composes across deploys.

#### 11.3.4 Internal link graph

Every URL listed in `sitemap.xml` must be reachable from the homepage
by following static `<a href>` links in prerendered HTML — not via
JavaScript-driven navigation. Patterns that satisfy this:

- A site-wide footer (rendered into every page) carries the canonical
  internal anchors — the repository, the store links, the changelog.
- The landing page lists its child pages (a companion wiki, a press
  page, a mod index) as real `<a href>` elements, not buttons that
  route on click.

A page that the sitemap lists but no other prerendered HTML links to
is *orphaned*. Google heavily downweights orphaned URLs even when
they are in the sitemap.

#### 11.3.5 Heading hierarchy

The heading outline must not skip levels. A page with `<h1>Title</h1>`
followed immediately by `<h3>Section</h3>` (no `<h2>` between them)
fails Lighthouse accessibility and reads as a structural smell to
Google. Markdown body content is rendered with `<h2>` for top-level
sections, not auto-shifted to `<h3>`. Page templates that render a
page title as `<h1>` must accept body-content `<h2>`s as the next
level.

#### 11.3.6 Site-wide discovery files

The build must emit, at the dist root:

- **`/sitemap.xml`** — every indexable URL with `<lastmod>` (derived
  from real source data — file `mtime`, latest git commit touching
  the source, etc. — never a build-time `now()`), `<changefreq>`, and
  `<priority>`. Generated from the source-derived data file (§11.2),
  never hand-maintained. The sitemap must also be advertised in the
  shell's `<head>` via
  `<link rel="sitemap" type="application/xml" href="/sitemap.xml" />`.
- **`/robots.txt`** — `User-agent: * / Allow: /` plus an absolute
  `Sitemap:` line.
- **`/llms.txt`** — per the [<llmstxt.org>](https://llmstxt.org)
  convention: site title (`# Title`), one-line description (`> …`),
  section headings (`## Posts`, `## Commands`, `## API`, etc.), and
  each item as `- [name](url): summary`. AI crawlers (Claude,
  Perplexity, ChatGPT) increasingly check for this; it costs nothing
  to generate from the same source data the sitemap uses.

#### 11.3.7 The share image

Every route must reference a 1200×630 PNG suitable for the places a
game gets shared — chat, social, forums. Ship a default; generate it
from the same identity manifest and captures the page uses (§11.2.2,
§29.4) rather than exporting it by hand, so an art pass cannot leave
the share card showing last year's game.

A game with several public routes (a landing page, a press page, a mod
index) should give each its own image on the same terms. A single-route
game needs exactly one.

A project that publishes release notes or devlogs **may** additionally
ship a feed (RSS, Atom or JSON Feed) for them. It is not required —
most games have no time-ordered surface, and an empty feed is worse
than none.

#### 11.3.8 Page-weight budgets

The bytes needed to reach the first interactive screen must stay under
a fixed budget, stated with the device and network it is derived from.
For a browser game this budget and the startup-path budget of §23.9 are
the same number enforced in the same place — the game's own code is
what threatens it, and the §23.9 trap (a menu importing the simulation)
is how it gets blown.

A useful default for a page a player waits on over a mobile connection
is **175 KB gzipped** of critical-path JavaScript. Projects targeting
slower networks should lower it. It is achieved by:

1. **Splitting heavy libraries into their own chunks** so each caches
   independently.
2. **Lazy-loading whatever the first screen does not need** — the run
   itself, the editor, the modal nobody has opened. A lazy boundary
   that always renders (returning nothing when closed) still fetches
   its chunk eagerly; gate it on the flag that opens it.
3. **Keeping lazy chunks out of the preload list.** Bundlers commonly
   preload every transitive dependency, including chunks reached only
   through a lazy boundary, which silently undoes the split.

#### 11.3.9 CI enforcement

Two workflows guard the page, separate from the unit-test pipeline
(§10). The deterministic `seo` workflow gates pull requests; the
measured `lighthouse` workflow is a scheduled audit that can also be
dispatched manually.

**`seo` — structural assertions.** A script walks every HTML file in
the build output and asserts:

- `<body>` contains substantive content (≥ 20 words).
- Exactly one `<h1>` per page; heading levels do not skip.
- Non-empty `<title>` (≤ 70 chars) and meta description (≤ 160 chars).
- Absolute canonical on the canonical host.
- Robots meta indexable on real pages; `noindex` on `404.html` only,
  and on every non-production slot (§11.5.1).
- `og:image` resolves to a real file in the output;
  `twitter:image:alt` present.
- All JSON-LD blocks parse; the structured `image` matches `og:image`.
- Every `<img>` carries `alt`, `width`, `height`, and `loading`.
- `sitemap.xml` lists every indexable HTML file.
- `robots.txt` advertises the sitemap and does not `Disallow: /`.
- `llms.txt` exists with a top-level `# Title` heading.
- Critical-path JS stays under the §11.3.8 budget.

Each failure emits a CI annotation tied to the specific output file so
the pull-request view highlights it.

**`lighthouse` — measured signals.** Runs weekly and on manual dispatch
against a static serve of the build, for the page a player lands on.
Keeping it off the pull-request path avoids making shared-runner timing
noise part of delivery latency; structural SEO and the byte budget
remain deterministic PR gates. Reference thresholds:

| Category / metric | Threshold |
| ----------------- | --------- |
| Performance       | ≥ 0.85    |
| Accessibility     | ≥ 0.9     |
| Best practices    | ≥ 0.9     |
| SEO               | ≥ 0.95    |
| LCP               | < 2500 ms |
| CLS               | < 0.1     |
| TBT               | < 300 ms  |

Measured performance and best-practice assertions stay **warnings**: one
shared-runner sample finds trends, it does not decide whether a change
may merge. Deterministic assertions may be errors. Accessibility is the
one to watch rather than wave through — §35.4 is the mandate it
measures.

### 11.4 When the page is the game

**A game that runs in the browser must ship as an installable,
offline-capable app.** This section applies whenever the deployed page
*is* the product; it does not apply to a landing page for a game that is
downloaded from a store (that page follows §11.2.1 and §11.3 only).

The reason it is prescriptive: "almost installable" fails silently. A
manifest with no maskable icon installs on Android with a launcher-eaten
glyph; icons with no service worker install but cannot launch without a
network; a service worker with no update prompt swaps the running build
mid-session and takes the player's run with it (§36). The mandate is not
"tick a box in an audit tool" — it is "ship the whole shape so the
installed thing behaves like a game and not like a bookmark".

A conformance check detects opt-in from the presence of a web app
manifest, a service-worker registration, or a known build plugin; once
any of those appears, completeness is required.

#### 11.4.1 Web App Manifest

Every PWA must ship a [Web App Manifest](https://www.w3.org/TR/appmanifest/)
served from the site root and linked from the document head:

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

The manifest may be a checked-in static file (`public/manifest.webmanifest`)
or generated at build time by a plugin (vite-plugin-pwa, next-pwa,
@angular/pwa, workbox-build). Either path is acceptable; the
generated output must end up at a stable URL the browser fetches on
first navigation.

**Required manifest fields:**

- `name` — full application name, used by the install prompt and
  splash screen.
- `short_name` — ≤ 12-character name used by the home-screen launcher.
- `id` — stable app identity (W3C recommendation; defaults to
  `start_url` if omitted, which breaks identity across slot moves).
  Set it explicitly to the scope path.
- `start_url` — relative URL the launcher opens.
- `scope` — URL prefix the service worker controls. Must match (or be
  a prefix of) `start_url`.
- `display` — `standalone` (default), `minimal-ui`, or `fullscreen`.
  `browser` is **not** acceptable; it produces a tabbed install that
  feels like a bookmark rather than an app.
- `theme_color` — UA chrome / status bar tint. Must match the
  `<meta name="theme-color">` value in `index.html` so the splash
  screen and the loaded app agree.
- `background_color` — splash-screen background, shown before the app
  paints its first frame. Pick a colour that matches the app's first
  rendered background so there is no flash on launch.
- `icons` — at minimum:
  - 192×192 PNG (any purpose — used for the launcher and notification
    icon on most platforms).
  - 512×512 PNG (any purpose — used for the splash screen).
  - 512×512 PNG with `"purpose": "maskable"` — required for Android's
    [adaptive-icon mask](https://www.w3.org/TR/appmanifest/#dfn-purpose).
    The artwork must fit inside the W3C 80%-diameter safe zone or
    Android's launcher mask will eat the edges.

Recommended (not enforced): `description`, `categories`, `orientation`,
and `lang`.

#### 11.4.2 Icon generation from a single source

Icon PNGs must be **generated from a single vector source**, not
edited pixel-by-pixel into the repo. The generator runs from a
documented Makefile target or npm script (`make icons`, `npm run
icons`, etc.) and overwrites every committed raster. Hand-edited PNGs
drift from the source on every redesign and produce inconsistent
chrome across devices.

The reference toolchain is
[`@vite-pwa/assets-generator`](https://github.com/vite-pwa/assets-generator)
driven by a checked-in `pwa-assets.config.{ts,mjs,js}`. Any equivalent
SVG-to-PNG pipeline (pwa-asset-generator, sharp scripts, ImageMagick
recipes) is acceptable; the spec only requires that one source
artwork (`public/favicon.svg` or `public/icon.svg`) is the canonical
input and the script that derives PNGs from it is tracked.

#### 11.4.3 Service worker and offline shell

The PWA must register a service worker that precaches the application
shell so the first paint after launch does not require the network. A
build plugin (vite-plugin-pwa, next-pwa, workbox-cli) is the
recommended path — they emit a precache manifest from the build
output and handle versioning across deploys. Hand-written service
workers are allowed; they must still precache the shell and
configure a `navigateFallback` so deep links resolve when offline.

Required behaviour:

- The service worker is registered on every page load — either via the
  framework hook (`useRegisterSW`, `register: 'autoUpdate'`) or via an
  explicit `navigator.serviceWorker.register(...)` call in source.
- A `navigateFallback` (workbox) or hand-rolled fetch handler returns
  the precached shell for unknown SPA routes when offline.
- Precache covers the routes a returning player is most likely to
  open — at minimum the entry HTML, the main bundle, the CSS, and the
  manifest itself.
- **For a game, "the shell" includes what a run needs**: the compiled
  content, the sprite atlas and the audio the first session will reach.
  An installed game that launches offline into a menu it cannot start a
  run from has satisfied the letter of this section and none of its
  point.

Dev-mode service workers usually interfere with HMR; gating them
behind an env flag (`VITE_PWA_DEV=1` or equivalent) is the standard
workaround and does not violate the spec.

#### 11.4.4 Update strategy must be user-visible

A new build deploying mid-session must **not** silently refresh the
page. A service worker that takes control without asking will replace
the running build the next time the player navigates or refreshes,
which for a game means losing the run they were in the middle of —
the single most infuriating way to lose progress, because nothing
crashed and nobody warned them.

The PWA must surface a non-blocking "reload to apply" affordance —
typically a toast component that appears when the service worker's
`waiting` state transitions, with an explicit user-triggered reload.
The affordance lives in source as a named component (`UpdateToast`,
`UpdatePrompt`, `ReloadBanner` — the name doesn't matter, the
behaviour does) wired to the framework's "new SW available" hook.

#### 11.4.5 iOS install metadata

iOS does not consume the Web App Manifest for home-screen installs.
The document head must carry the equivalent legacy meta tags so the
installed app launches without Safari chrome and shows the correct
icon and title:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="<App name>" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#1d2027" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#eef0f2" media="(prefers-color-scheme: light)" />
```

The `apple-touch-icon` PNG is part of the icon-generation pipeline
(§11.4.2) — typically 180×180, painted to the manifest's
`background_color` so the home-screen tile bleeds full-frame instead
of revealing a white border under iOS's corner rounding.

#### 11.4.6 Installability documented in the README

The README (§3) must tell users they can install the app. A single
short paragraph under the Usage section, or a screenshot of the
install prompt on a real device, is sufficient. Users overwhelmingly
do not try "Add to Home Screen" on a hunch; if installation is not
mentioned, the install rate drops to ~zero regardless of how
correctly the manifest is configured.

#### 11.4.7 Installability is checked, not assumed

Installability must be guarded by deterministic checks in CI — the
manifest's required fields, the icon set including the maskable one, the
service-worker registration, and the offline entry route. Where the
project's audit tooling exposes an installability score, the scheduled
workflow of §11.3.9 should assert it too; audit categories come and go,
so the deterministic checks are the ones that must always exist.

#### 11.4.8 Disjoint scopes for preview deployments (recommended)

Projects that publish a preview slot alongside production (e.g. `/`
and `/preview/` on the same Pages domain — see the slot topology in
§11.5) should branch every identity-bearing field on the slot:

- `manifest.id`, `manifest.scope`, `manifest.start_url` — `/` vs
  `/preview/` vs `/branch/`. Distinct identity means iOS / Android
  install each build as a separate app with separate storage.
- `manifest.name` / `short_name` — make the slot visible in the
  installed app's title.
- The service worker's cache id (workbox `cacheId`, or equivalent)
  — disjoint cache keys so the builds never poison each other's
  precache.

This is recommended rather than required because not every project
publishes secondary slots. When a project does, omitting the
branching causes the installs to fight over the same scope and
manifests as random "white screen on launch" reports — the kind of
bug that only appears on real installed devices, not in dev mode.

### 11.5 Deployment slots

This section applies to the same projects as §11.4 — those whose
deliverable **is** the deployed page. A landing page for a downloaded
game deploys a single artifact per §10.4 and can skip it.

For a game served from the web, "deploy" is not one thing. Maintainers
need the last released build serving stable URLs to players, the current
default branch serving somewhere safe to dogfood before it is released,
and — often — one in-flight branch reachable on a real phone for review.
A single hosting target must therefore carry **several builds at once**
without them colliding, and the collisions to avoid are not only visual:
two builds sharing an install identity share the player's saves (§36).

#### 11.5.1 The slot model

A web-app project **should** serve its builds from disjoint path
prefixes on a single hosting target (e.g. one GitHub Pages domain),
one prefix per slot. The reference topology is three slots:

| Slot | Path | Source | Audience | Indexed (§11.3) | Analytics |
|---|---|---|---|---|---|
| **Production** | `/` | The highest released `v*` tag | End users | Yes — the only indexed slot | Yes — the only slot with the tracker |
| **Staging** | `/preview/` | Current default-branch (`main`) HEAD | Maintainers dogfooding the next release | No (`noindex,nofollow`) | No |
| **Branch** (optional) | `/branch/` | One manually-chosen feature branch | Reviewers testing a single PR on a real device | No (`noindex,nofollow`) | No |

Two-slot (`/` + `/preview/`) is the common minimum; the `/branch/`
slot is optional and exists only when a maintainer parks a branch in
it. Production is sourced from the **highest semver tag**, not the
nearest reachable commit, so a release cut from an earlier commit
(e.g. a hotfix off an older point) is still the one served at `/`
regardless of ancestry. Until the first release tag exists,
production falls back to serving `main` at `/` and the `/preview/`
slot is skipped.

Only the production slot is indexable and only the production slot
carries the analytics tracker (§11.3, §11.3.9). Secondary slots must
ship `noindex,nofollow` so search engines never index a second copy
of the app, and must omit the tracker so dogfooding and review traffic
never pollute production metrics. Each slot is otherwise a complete,
independently installable PWA with disjoint identity per §11.4.8.

#### 11.5.2 One deploy, several packages

The slots are assembled by a **single** Pages workflow run, not one
workflow per slot. Each slot is built separately — the same source
built once per slot with a slot-specific base path (`VITE_BASE_PATH`
or the framework equivalent) so every asset URL is rooted at the
slot's prefix — and the resulting directories are merged into one tree
(`/`, `/preview/`, `/branch/`) that is uploaded as a single Pages
artifact and deployed once. Every trigger therefore produces one
deploy carrying up to three freshly-positioned packages.

The workflow triggers are:

- `push` to the default branch — rebuilds the staging slot (and
  re-emits production from the current release tag).
- `workflow_call` from the release pipeline (§10.3) — the release
  workflow, after tagging `vX.Y.Z`, chains into the Pages workflow and
  passes the new tag in so production at `/` updates immediately rather
  than waiting for the next push.
- `workflow_dispatch` — the manual escape hatch, and the way a branch
  is parked in the `/branch/` slot (§11.5.3).

Concurrency is configured exactly as in §10.4
(`concurrency: { group: pages, cancel-in-progress: false }`) so the
several-package assembly is never interrupted mid-merge.

#### 11.5.3 The branch slot is stable and persistent

The `/branch/` slot's defining property is that **its URL never
changes — only what is parked in it does.** A reviewer (or the
maintainer's installed PWA) points at `/branch/` once; subsequent
dispatches swap the build underneath that stable URL. This is what
makes it reviewable on a real device: the install survives the swap.

Because the slot is fed by an occasional manual dispatch but the Pages
artifact is rebuilt on every push, the parked build must **persist
across deploys that did not target it**. The reference mechanism is a
dedicated orphan branch (e.g. `branch-deploy`) that stores the most
recently dispatched `/branch/` build:

- A `workflow_dispatch` carrying a branch ref builds that ref at the
  `/branch/` base path and force-pushes the output to the orphan
  branch.
- **Every** Pages run (including plain pushes to `main`) rehydrates the
  `/branch/` slot from the orphan branch and carries it forward into
  the new artifact untouched.

So the slot holds whatever was last dispatched until the next dispatch
overwrites it, and ordinary releases and `main` pushes never disturb
it. A project that does not need on-device branch review can omit this
slot entirely; the two-slot `/` + `/preview/` topology remains
conformant.

#### 11.5.4 Per-slot build identity

So that a running build reveals which slot and which source it came
from, each build should embed a slot-aware build label (a short string
combining the version/commit with a slot suffix — e.g. `pre` for
staging, `br[-<source-branch>]` for the branch slot) and expose it to
the update affordance (§11.4.4) and, for the branch slot, surface the
source branch name even though the URL is stable. Combined with the
disjoint PWA identity of §11.4.8, this is what lets a user tell at a
glance whether they are looking at production, staging, or a parked
feature branch.

## 12. The developer toolbelt

A game accumulates dozens of internal commands — content compilers,
asset generators, headless simulators, preview renderers, balance
analyzers, capture drivers, packaging scripts. They are the project's
real working surface for contributors and agents alike, and they rot
exactly the way undocumented tooling always does.

Mandates:

- **Every tool is reachable by one documented command** (§9.1) and is
  listed with a one-line description of what it does. A tool nobody can
  find is a tool that gets reinvented, badly, next quarter.
- **Every tool supports `--help`**, printing its flags with defaults, and
  exits non-zero on an unknown flag rather than ignoring it. A
  measurement tool that silently ignores a mistyped flag reports a
  confident wrong number.
- **Every tool that measures prints its inputs with its outputs** — the
  seed, the scenario, the build identity, the tuning in force (§32.3).
  A measurement whose conditions were not recorded cannot be compared
  against the next one, which is the only thing measurements are for.
- **Every tool that writes prints what it wrote**, so a generator's
  effect is visible in a log rather than inferred from a diff.
- **Tools live in the tooling role** (§23.6): they may import from any
  other role, and nothing may import from them.

`AGENTS.md` (§7.2) carries the full index; `README.md` and
`CONTRIBUTING.md` carry the subset a new contributor needs on day one.

**A CLI the project ships as a product** — a mod compiler handed to
modders, a dedicated-server binary handed to hosts — is a deliverable in
its own right and owes its users more than the above: a stable
command-line contract, documented exit codes, and reference
documentation for every command and flag, generated from the same
definitions the CLI itself reads so the two cannot drift.

## 13. Examples and prompts

### 13.1 Worked examples (`examples/`)

A game's examples are not "sample programs" — nobody embeds a game as a
library. They are the worked references for whatever surface outsiders
build against:

- **A sample mod** for each thing a mod can do (§27), buildable by the
  shipped tooling and exercised by CI so the format cannot rot
  unnoticed. This is the highest-value example a game ships: it is
  simultaneously documentation, a regression test for the mod pipeline,
  and the thing a modder copies to start.
- **A sample of any authored catalog** whose schema is non-obvious, kept
  next to that schema.
- **A minimal host** where the core is embeddable — the smallest program
  that steps the simulation and prints the result, which doubles as
  proof the core really is framework-free (§23.1).

Each example lives in its own directory with a `README.md`, builds with
the project's own toolchain, and is exercised by CI. Examples that only
restate the README's quick start are noise; delete them.

Examples the project ships are **its own content** and follow its
naming and narrative rules (§27.5, §30).

### 13.2 LLM prompts (`prompts/`)

Any project that sends prompts to a large language model — directly via
an SDK or HTTP call, or indirectly through a wrapper — must store those
prompts as versioned files on disk under `prompts/`, not as inline
string literals in source code.

**Layout.** One subdirectory per logical prompt; one Markdown file per
version inside it:

```
prompts/
├── interpret-prompt/
│   ├── 1_0_0.md
│   └── 1_1_0.md
├── fix-conformance/
│   ├── 1_0_0.md
│   └── 1_1_0.md
└── …
```

**File name.** `<major>_<minor>_<patch>.md`, matching [semver]
(https://semver.org/). Bump **patch** for wording fixes that do not
change the contract (typos, clarifications). Bump **minor** for
non-breaking additions (new placeholders, expanded scope, new
guidance bullets). Bump **major** for breaking rewrites (removed
placeholders, changed JSON schema, fundamentally new task). Loaders
must always pick the highest version of a prompt unless explicitly
pinned.

**Never edit an existing versioned file.** Once a `<major>_<minor>_
<patch>.md` file is committed, its contents are immutable — every
change, no matter how small, lands as a new file at a new version.
This keeps every prompt a point-in-time artifact that can be diffed,
bisected, and blamed. The only time you may edit an existing file is
to correct a bug *before* it has ever been shipped or referenced from
a tagged release.

**Required YAML front matter.** Every prompt file must begin with a
YAML front-matter block declaring the prompt's `name`, `description`,
and `version`. The `version` value must match the filename stem
(e.g. `1_0_0.md` → `version: 1.0.0`). Loaders must strip the front
matter before passing the prompt to the model — it is metadata, not
instruction content.

```markdown
---
name: <prompt-name>
description: "<one-sentence description of what this prompt does>"
version: <major>.<minor>.<patch>
---

# <prompt-name>

## System

…system instructions for the model…

## User

…user message body. May contain {{ jinja }} placeholders that the
loader renders with runtime values…
```

The `## System` section is sent verbatim as the system prompt. The
`## User` section is rendered with whatever templating engine the
project already uses and sent as the user message. The YAML front matter, the `# Title` heading, and any other
prose outside the two required sections are ignored by the loader and
exist purely for humans reading the file.

**Why.** Inline prompts are invisible to reviewers, impossible to diff
across versions without reading source, and indistinguishable from
ordinary string literals to anyone trying to audit what a model is
being asked to do. A versioned `prompts/` tree makes prompt changes
first-class artifacts: they show up in PR diffs, they can be linted
and snapshot-tested, and the history of what the model was told is
preserved next to the code that calls it.

A project that performs no LLM calls may omit `prompts/` entirely.
Any project that *does* call an LLM must satisfy this rule before its
first public tag.

**Generative content prompts count.** A game that uses a model anywhere
in its authoring pipeline — to draft an enemy's dialogue, to generate a
sprite concept, to name a weapon, to write a level's description, to
produce marketing copy from the shipped build — stores that prompt here
under the same rules. Two reasons this is not optional for a game:

- The prompt is what produced the asset, so it is the only honest record
  of how the asset came to exist. Regenerating a sprite a year later
  with a drifted prompt silently changes the art direction.
- A shared style preamble (§29.2) referenced by every art prompt is the
  project's visual constitution. Versioning it means an art pass can be
  reproduced, diffed and reverted like any other change.

The generated **output** is not a prompt artifact: it is authored
content (§24) or a derived asset (§29) and follows those chapters.

## 14. Dependency hygiene

- Enable automated dependency updates via `.github/dependabot.yml` or
  equivalent (Renovate). Configure it for the package ecosystem, GitHub
  Actions versions, and Docker base images.
- Enable secret scanning and push protection on the repository.
- Enable dependency review on pull requests.
- Pin CI actions by commit SHA, not by floating tag, to prevent
  supply-chain substitution.
- Run a software composition analysis tool (`cargo audit`, `npm audit`,
  `pip-audit`, `osv-scanner`, or similar) as a CI job, and fail the
  build on high-severity advisories.

## 15. Issue and pull request templates

`.github/ISSUE_TEMPLATE/` must contain at least:

- `bug_report.md` — reproduction steps, expected vs. actual behavior,
  environment details, version.
- `feature_request.md` — problem, proposed solution, alternatives.
- `config.yml` — disable blank issues and link to `SECURITY.md` for
  vulnerability reports.

`.github/PULL_REQUEST_TEMPLATE.md` must prompt the author for:

- A short summary.
- A linked issue (if any).
- A test plan.
- Checklist items: tests added, docs updated, changelog-relevant type in
  the PR title.

## 16. Formatting, linting, and pre-commit hooks

Projects must enforce formatting and linting in CI. They should also
enforce them locally via a pre-commit framework
([`pre-commit`](https://pre-commit.com/), `lefthook`, `husky`, or
equivalent) with hooks for:

- Formatter (`make fmt-check`).
- Linter (`make lint`).
- Commit message validation (conventional commits).
- Trailing whitespace and end-of-file fixes.
- Forbidden edits (e.g., `CHANGELOG.md` outside release commits).

Pre-commit hooks must be installable with a single documented command.

### 16.1 Shell scripts and workflow YAML

Linting is not just about the primary language. Shell scripts and
GitHub Actions workflow files are production infrastructure and must
be linted with the same zero-warning rigor as the rest of the
codebase:

- **Shell scripts** (`*.sh`, `*.bash`) must be linted with
  [`shellcheck`](https://www.shellcheck.net/). A project with any
  shell scripts must expose a `make shellcheck` target that runs
  `shellcheck` against them.
- **GitHub Actions workflow files** (`.github/workflows/*.yml`) must
  be linted with [`actionlint`](https://github.com/rhysd/actionlint).
  A project with any workflow files must expose a `make actionlint`
  target.

Both tools must run in CI (typically in a dedicated `shell-lint` job
on `ubuntu-latest`, where `shellcheck` is preinstalled and
`actionlint` can be fetched via its official installer script). CI
must fail on any `shellcheck` or `actionlint` finding. These targets
should also be wired into the pre-commit hook alongside `make lint`
so shell and workflow issues are caught locally before they hit
review.

## 17. Governance

Every project must document its governance model, even if it is as
simple as "the author merges everything". Options include:

- **BDFL** — one person has the final say; good for young projects.
- **Maintainer team** — a named group with merge rights; scaling option.
- **Steering committee** — for larger projects with multiple stakeholder
  organizations.

The governance document must specify:

- Who has commit / merge rights.
- How decisions are made.
- How new maintainers are added.
- How the project handles disagreements.
- How the project can be forked or transferred if it is abandoned.

For small projects, governance can live as a section at the bottom of
`CONTRIBUTING.md`. Larger projects should promote it to `GOVERNANCE.md`.

## 18. Communication channels

Projects should declare, in the README and in `CONTRIBUTING.md`, where
discussion happens:

- GitHub Issues for bugs and feature requests.
- GitHub Discussions (or a dedicated forum) for questions and ideas.
- A chat channel (Discord, Matrix, Slack) if real-time discussion is
  expected.

The absence of a discussion venue pushes all conversation into issue
threads, which degrades triage quality.

## 19. Logging and diagnostic output

A project must use structured logging rather than raw print statements
(e.g. `println!` in Rust, `print()` in Python, `console.log` in Node,
`fmt.Println` in Go). All diagnostic output must flow through a central
output module so formatting and routing can be changed in one place.

### 19.1 Log levels

| Level   | Purpose                                           | Destination        |
|---------|---------------------------------------------------|--------------------|
| `error` | Unrecoverable failures                            | stderr + log file  |
| `warn`  | Recoverable issues the user should know about     | stderr + log file  |
| `info`  | Normal operational messages (status, progress)    | stderr + log file  |
| `debug` | Verbose diagnostics for troubleshooting           | log file (always); stderr only with `--debug` |

### 19.2 Always-on file logging

Every run must append to a persistent log file at a platform-appropriate
location (e.g. `~/.local/state/<project>/debug.log` on Linux,
`~/Library/Application Support/<project>/debug.log` on macOS). The file
log captures all levels including `debug`. No user action is required to
enable file logging — it is always on.

Log files should include timestamps and log levels. Rotation is optional
for v1 but must be documented (e.g. "truncate the file manually or set
up logrotate").

### 19.3 A documented way to raise verbosity

Every runnable surface — the game, the tools, the session service — must
expose a documented switch that promotes `debug`-level messages to the
terminal (or to the in-build console). A `--debug` flag is the terminal
form; a URL parameter, a developer menu or a build flag are equally
conformant. Whichever it is, `docs/configuration.md` names it.

### 19.4 Central output module

All user-facing output must route through a central output module (e.g.
`src/output.rs` in Rust, `lib/output.ts` in Node) that provides semantic
functions:

- **status** — success messages (e.g. green checkmark prefix).
- **warn** — warning messages (e.g. yellow prefix).
- **info** — informational messages.
- **header** — bold section headers.
- **error** — error messages (e.g. red prefix).

Each function writes to the terminal with appropriate styling **and** to
the log file via the logging framework. Raw print statements
(`println!`, `print()`, `console.log`, `fmt.Println`) must not appear
outside the output module except for machine-readable output required by
a contract — a tool's machine-readable output, which must be plain text
on stdout with no ANSI escapes so it can be piped and parsed.

### 19.5 Diagnostics in a game

A game runs its logic tens of thousands of times a second, in a process
that usually has no terminal attached. Three amendments follow, and each
one is a bug this spec has seen shipped:

- **The simulation core logs through the same central module** (§23.1),
  which for a game means an in-memory ring buffer that the running build
  can dump on demand, in addition to the file/stderr sinks. A player
  reporting a bug can then attach what the simulation actually did.
- **Nothing logs per entity per frame.** A diagnostic on a hot path is
  not a diagnostic, it is a frame-rate regression and a buffer that
  overwrites the interesting part of its own history. Per-frame
  diagnostics belong behind an explicit developer switch, aggregated
  (counts, min/max/mean per second), or in a purpose-built overlay —
  never in the ordinary log stream.
- **Diagnostic output must never change the simulation.** Formatting a
  message must not consume a random draw, mutate state, or force a lazy
  computation that the simulation would otherwise skip; a run that
  behaves differently with diagnostics on has broken §25.1 and the
  replay guard will not catch it, because both runs were logged.

A game must also expose an **in-build developer surface** — a way to
reach live state, toggle diagnostics, and stage a situation without a
rebuild (§32.6). §19.3's `--debug` flag is its terminal equivalent; a
URL parameter, a hidden menu or a debug build flag are equally
conformant, and `docs/configuration.md` (§11.1) must document whichever
it is.

## 20. Source and test organization

This section covers how source code is organized — both the separation
of tests from production source and the size of source files
themselves. The two rules reinforce each other: keeping tests in
dedicated files makes it easier to keep source files small, and the
size cap in §20.5 makes it harder for inline tests to accumulate
unnoticed.

Tests must live in **dedicated test files**, separate from the source
files they exercise. Inline test blocks embedded in production source
files (e.g. Rust `#[cfg(test)] mod tests { … }`, Python `if __name__ ==
"__main__"` test harnesses, or ad-hoc assertions at module scope) are
forbidden.

Using `#[cfg(test)]` to **import** a separate test file (e.g.
`#[cfg(test)] mod check_test;`) or to gate test-only `use` statements
is allowed — the rule targets inline test *bodies*, not the conditional-
compilation attribute itself.

### 20.1 Why separate test files?

Keeping tests out of source files provides three concrete benefits:

1. **Different rules for source and tests.** Linters, formatters, and
   review tools can apply stricter policies to production code (e.g.
   no `unwrap()`, mandatory doc comments) while relaxing them in test
   code — without file-level `#[allow(...)]` annotations or language-
   specific lint toggles.
2. **Agent hooks and automation.** CI, pre-commit hooks, and AI coding
   agents can detect when a change modifies tests vs. production code
   by simple path or filename matching. This enables workflows like
   "require a test change for every source change" or "re-run only
   affected test files."
3. **Clean reading.** Agents and humans reading source code see only
   production logic, without hundreds of lines of test scaffolding
   interleaved. Agents that need to understand the test suite can
   target the test directory directly.

### 20.2 Test file naming convention

Every test file's **stem** (the filename without its extension) must end
with one of the following suffixes:

| Suffix   | Example                          |
|----------|----------------------------------|
| `_test`  | `check_test.rs`, `utils_test.py` |
| `_tests` | `check_tests.rs`, `utils_tests.py` |
| `Test`   | `CheckTest.java`, `UtilsTest.kt` |
| `Tests`  | `CheckTests.cs`, `UtilsTests.swift` |

Expressed as a regex on the stem: `_?[Tt]ests?$`.

This convention is already idiomatic in most ecosystems (Go's `_test.go`,
JUnit's `*Test.java`, pytest's `test_*.py` / `*_test.py`) and enables
glob-based tooling (`*_test.*`, `*Test.*`) to enumerate all test files
without parsing build configs.

### 20.3 Where test files live

| Language / ecosystem | Test location | Notes |
|---|---|---|
| Rust | `tests/` directory at crate root | No `#[cfg(test)]` blocks in `src/`. Functions that need testing from outside the crate must be `pub`. |
| Python | `tests/` directory at project root | Follow pytest discovery: files named `test_*.py` or `*_test.py`. |
| Go | `*_test.go` alongside source files | Go enforces separate test files by convention; they already match the naming rule. |
| Node / TypeScript | `tests/` or `__tests__/` directory | Frameworks like Jest and Vitest discover `*.test.ts` / `*.spec.ts` by default; prefer `*_test.ts` or `*Test.ts` to stay within the naming convention. |
| JVM (Java, Kotlin) | `src/test/` per Maven/Gradle convention | Files named `*Test.java`, `*Tests.java`, `*Test.kt`, etc. |
| C# / .NET | Separate test project (e.g. `*.Tests.csproj`) | Files named `*Test.cs` or `*Tests.cs`. |

Projects using a language not listed above must document their test
location and naming convention in `AGENTS.md` and ensure the naming
rule in §20.2 is satisfied.

A game splits its suites by **what they are allowed to depend on**, and
the split is load-bearing rather than cosmetic:

| Suite | Depends on | Survives |
|---|---|---|
| **Rule tests** | The simulation core and **synthetic fixtures only** — invented ids registered through the mod seam (§27.1) | Deleting every shipped catalog |
| **Content tests** | The shipped catalogs — that the levels are completable, the drops are reachable, the story ids resolve | Only this game |
| **Shell tests** | The presentation or platform shell, per shell, in that shell's own toolchain | Replacing the shell |

The rule to hold: **a test of an engine rule must not name a shipped
content id.** When the sequel deletes the catalogs (§23.8), the rule
suite must still run green — that is the proof that the rule lives in
the core and not in the content. Every game that has ignored this has
found out during a content rewrite, when hundreds of "engine" tests
failed for content reasons and nobody could tell which failures mattered.

### 20.4 AGENTS.md must describe testing patterns

The `AGENTS.md` file (§7) must include a **Test conventions** section
that tells agents and contributors:

- Where test files live (directory / path pattern).
- The naming convention in use (which suffix from §20.2).
- How to run tests (`make test` at minimum, plus any subset commands).
- Any test-specific dependencies or setup (e.g. `tempfile` crate,
  Docker containers, fixture files).

### 20.5 Source file size limits

No non-test source file may exceed **1000 physical lines** (raw
newline-delimited lines, as reported by `wc -l`). Test files — those
whose stem matches the §20.2 regex `_?[Tt]ests?$` — are exempt; their
size is governed by whatever the test subject requires.

The limit is a **size smell**, not a precise complexity metric.
Physical lines are deliberately chosen over SLOC or cyclomatic
complexity so the rule is trivial to measure, predictable for
contributors, and immune to language-specific comment conventions. A
file over 1000 lines is almost always doing too much: aggregating
unrelated responsibilities, hiding inline tests, or waiting to be
split by concern.

**Why this rule.** Three motivations converge here:

1. **Readability.** Files that fit in a single screenful of a human
   reviewer's attention — or a single AI agent's working context —
   get reviewed carefully. Files that exceed it get skimmed.
2. **Decomposition pressure.** A hard line cap pushes authors to
   extract submodules, helpers, and sibling files before a large
   concern calcifies into an unsplittable monolith.
3. **Teeth for §20.** The easiest way to blow the 1000-line limit is
   to keep tests inline. §20.5 and §20 reinforce each other:
   extracting inline test blocks to their own file is usually
   sufficient to bring a large source file back under the cap.

#### 20.5.1 Exception mechanism

A file may declare itself exempt by carrying an **allow-large-file
marker** in any comment within its **first 20 lines**:

```
game-spec:allow-large-file: <reason>
```

The marker's comment syntax follows the host language (`//` for
C-family, `#` for Python/Ruby/shell, `--` for SQL/Haskell, etc.) —
only the literal `game-spec:allow-large-file:` token and the reason
are checked. The reason **must be non-empty**: a marker with no
motivation does not exempt the file. Validators must reject
`game-spec:allow-large-file:` followed only by whitespace.

Exceptions are expected to be **rare and per-file**, not a project-
wide dial. Legitimate reasons include:

- **Generated code** — a file produced by a build step (protobuf,
  OpenAPI bindings, parser tables) that is not meant to be edited by
  hand.
- **Cohesive state machines** — a single enum or match tree whose
  arms cannot be meaningfully split without obscuring the design.
- **Third-party snapshots** — vendored code checked in verbatim.
- **Inherent density** — a configuration schema, rule catalogue, or
  lookup table that only grows linearly with real-world coverage.

Reviewers should treat an added or edited marker the same as any
other code change: ask whether the reason is honest, whether the
file has since become splittable, and whether the alternative (a
mechanical split) is genuinely worse than leaving the file oversized.

#### 20.5.2 Auto-fix scope

When an automated conformance fixer encounters
a §20.5 violation, it must only attempt an **easy** refactor:
extracting inline test blocks (a §20 violation that commonly
co-occurs with §20.5) into a separate file under `tests/`. In
practice, doing so resolves both findings at once on files whose
bulk came from tests.

Automated refactors of **genuinely large source files** — splitting
modules, extracting helpers, decomposing responsibilities — are out
of scope. They require design judgment the tooling cannot
responsibly make. When the auto-fixer sees a §20.5 violation on a
file without a companion §20 violation, it must leave the file
alone and surface the finding for a human to either split manually
or annotate with a `game-spec:allow-large-file:` marker.

## 21. Agent skills — maintenance playbooks for drift-prone artifacts

### 21.1 Motivation

Every non-trivial project has curated or generated artifacts whose truth
lives somewhere else: a README that describes the game, docs that explain
its systems, a page that restates its features, a mod catalog that
mirrors the schemas, store metadata that mirrors the build. When the
source of truth changes and the mirror doesn't, the project rots — and
readers get contradictory answers depending on which file they read
first.

CI can *detect* drift (§24.4 snapshot guards, §11.2.2 extraction
failures) but cannot usually *fix* it. An **agent skill** closes that
gap: it is a versioned, machine-readable playbook that gives an AI
coding agent the exact procedure for bringing one drift-prone artifact
back into sync with its sources of truth. Skills are stored alongside
the code, improved over time, and re-run on demand.

### 21.2 Canonical location

Agent skills live at:

```
.agent/skills/<skill-name>/SKILL.md
```

`.agent/` is the generic, tool-neutral home for any file an AI coding
agent needs but a human typically does not. Tool-specific directories
(e.g. `.claude/skills/` for Claude Code) must be **symbolic links** to
`.agent/skills/` so that any tool which discovers skills from a fixed
path sees the same canonical set. This is the same single-source-of-
truth rule as §7.1.

Required directory symlinks:

| Link path            | Tool          | Target            |
|----------------------|---------------|-------------------|
| `.claude/skills`     | Claude Code   | `../.agent/skills`|

Additional tool-specific paths may be added as support lands, but every
such path must be a symlink — editing skills through a tool-specific
path (turning the symlink into a real directory) is forbidden and
should be caught by the same kind of symlink-verification job used in
§7.1.

### 21.3 Required SKILL.md structure

Every `SKILL.md` must contain:

1. **YAML front matter** with at least `name` and `description`:

   ```markdown
   ---
   name: update-readme
   description: "Use when README.md may be stale. Discovers commits since the last README update, identifies what changed, and merges updates into README.md."
   ---
   ```

   The `description` must be a one-sentence imperative that tells an
   agent *when* to invoke the skill. This field is what a parent agent
   reads when deciding whether the skill applies to the current task.

2. **An H1 heading** naming the skill's purpose.

3. **A "Tracking mechanism" section** pointing at a sibling `.last-updated`
   file that holds the git commit hash of the last successful run.

4. **A "Discovery process" section** containing the exact shell commands
   the agent should run to compute what has changed since the baseline
   (typically `git log` and `git diff --name-only`).

5. **A mapping table** that maps changed source paths or commit scopes
   to the output files that need updating. This is the skill's core
   asset — it is where domain knowledge accumulates.

6. **An "Update checklist"** the agent walks through while fixing drift.

7. **A "Verification" section** describing how the agent confirms the
   update is correct (typically by re-reading the updated files and
   comparing them against the sources of truth, and by running the
   relevant checks such as `make test`).

8. **A "Skill self-improvement" section** that instructs the agent to
   update the mapping table, patterns, and checklist with any new
   knowledge discovered during the run, and to commit those skill
   edits alongside the documentation edits. Without this, the skill
   rots the same way the docs it fixes would.

### 21.4 Tracking file

Each skill directory must contain a `.last-updated` file:

```
.agent/skills/<skill-name>/.last-updated
```

It holds a single line: the git commit hash of the last successful run
of the skill. The skill updates it at the end of every run. An empty
file means "never run"; the skill must then use the repository's
initial commit as the baseline.

Using a committed tracking file (as opposed to, say, a git tag or CI
artifact) keeps the baseline visible in diffs and lets agents reason
about staleness without network or API access.

### 21.5 Required maintenance skills

Every project must ship at least one maintenance skill for each
drift-prone artifact it publishes. The following are required whenever
the corresponding artifact exists:

| Artifact      | Required skill      | Exists when                        |
|---------------|---------------------|------------------------------------|
| `README.md`   | `update-readme`     | Always (§3)                        |
| `docs/`       | `update-docs`       | Always (§11.1)                     |
| The web page  | `update-website`    | A page is published (§11.2)        |
| *(umbrella)*  | `maintenance`       | Always — routes to all `update-*`  |

A **game** ships these in addition, whenever the artifact exists:

| Artifact                        | Required skill  | Exists when         |
|---------------------------------|-----------------|---------------------|
| The narrative tiers             | `update-story`  | The game has authored narrative (§30) |
| The published mod catalog       | `update-mod-catalog` | Mods are supported (§27.4) |
| Store metadata and listings     | `update-store`  | The game ships to a store (§33.5) |

The last two may instead be satisfied by a **documented regeneration
command enforced by a drift test** (§24.4) where the fix is purely
mechanical — a skill earns its place when the update needs judgement,
not when it needs a command. The narrative tiers always need judgement,
so `update-story` is not substitutable.

Projects with additional drift-prone surfaces should add further skills
such as `update-bindings` (SDK bindings mirroring a core API) or
`update-examples` (examples exercising the current surface). Skill names
must be kebab-case and should start with a verb.

Any project that claims conformance to this spec must additionally ship
a **`sync-game-spec`** skill whose job is to walk this document's
mandates against the repository, chapter by chapter, and fix each
violation until the repo is back in conformance. It is a **standalone**
procedure: it reads the copy of the spec at the repository root and must
not depend on any external validator binary, network fetch, or upstream
document — a project that cannot run its conformance skill offline
cannot run it at all. Running `sync-game-spec` as the final step of a
drift sweep catches residual violations that the per-artifact skills
(`update-readme`, `update-docs`, etc.) did not touch.

When the repository's copy of this spec is deliberately amended, the
same pull request must propagate the new mandate into the repo, or
record why it does not yet apply. The spec and the tree it governs move
together; a spec edit merged alone is a violation that ships as
documentation.

The skills in §21.5 are the floor, not the ceiling. A healthy project
adds a skill for every recurring "I forgot to update X when I changed
Y" bug report.

### 21.6 The `maintenance` umbrella skill

In addition to the per-artifact skills above, every project must ship a
**`maintenance`** skill whose sole job is to dispatch to the individual
`update-*` skills in the correct order and aggregate their output.
`.agent/skills/maintenance/SKILL.md` is the entry point for any agent
that wants to bring the whole repository back into sync without first
diagnosing *which* artifact is stale.

The `maintenance` skill must contain a **Registry** section: a single
table listing every `update-*` skill that exists in the repository,
together with a deterministic **run order**. The registry is the only
source of truth for which sync skills exist — adding a new `update-*`
skill without adding its row to the registry is a drift bug in its own
right.

Run order matters: upstream fixes must land before downstream skills
read them. A typical order for a game is `sync-game-spec` →
`update-story` → `update-docs` → `update-readme` → `update-website`,
because each reads what the one before it rewrites. Projects that do not
publish a given artifact simply omit its row.

The `maintenance` skill does no rewriting itself. It only schedules
other skills, runs them in order, aggregates the combined diff, and
(after a successful sweep) rewrites its own `.last-updated` file.

### 21.7 What skills are not

- Skills are **not** CI jobs. They complement CI: CI detects drift;
  skills fix it. A skill run may be initiated by a human, by an agent
  noticing a failing CI check, or by another skill.
- Skills are **not** git hooks. Hooks run synchronously and must be
  fast; skills are long-running procedures that expect an agent in the
  loop.
- Skills are **not** one-shot prompts. They are iterated on over time
  and committed to version control; the mapping table and checklist are
  the skill's long-lived memory.
- Skills are **not** a substitute for good module boundaries. If a
  skill's mapping table keeps growing without bound, that is a signal
  that the underlying code needs refactoring, not that the skill needs
  more entries.

### 21.8 AGENTS.md integration

The `AGENTS.md` file (§7) must include a **Maintenance skills** section
that lists every skill the project ships and describes when each one
should run. This is the discovery surface for agents that do not yet
autoload skills from `.agent/skills/`.

### 21.9 Craft skills — the second class, required for a game

Maintenance skills fix drift. A game needs a second class of skill that
does something maintenance skills never do: **carry the craft**. Adding
an enemy, drawing a sprite, tuning a drop table, writing a line of
dialogue, laying out a HUD panel — each is a discipline with its own
workflow, its own quality bar and its own traps, and each is done by a
contributor or an agent who has probably never done that particular one
before.

A game must ship a craft skill for every authoring discipline it has
content for. The set follows the project's catalogs (§24) and its
presentation surfaces; a representative floor:

| Discipline | Covers |
|---|---|
| Content authoring | One skill per catalog kind — level, enemy, item, quest, ability |
| Art | Creating and revising visual assets, and auditing the weakest ones |
| Audio | Sound effects and music, and how to audition them |
| Interface | HUD and menu layout, reviewed at the reference viewports (§35.2) |
| Narrative | Any spoken or written line, walking the tiers of §30 |
| Balance | Measuring with the simulator (§32.2), not judging by eye |
| Verification | Driving the real build to confirm a change (§32.4) |
| Debugging | Reproducing deterministically from a seed (§25.1) |

Every craft skill must state, beyond the §21.3 structure:

1. **The loop** — the cycle of make → observe → judge → revise, with the
   exact command that produces the observation. A craft skill whose
   output is judged from source rather than from a rendered frame, a
   played run or a measured number is not a craft skill.
2. **The quality bar** — what "good" is for this discipline, concretely
   enough that two different agents reach the same verdict.
3. **The traps** — the mistakes that pass every automated check and are
   caught only in review or, worse, by players.
4. **What the change obliges elsewhere** — the regenerate step, the
   drift-tested artifact, the doc tier, the test suite.

**A session that loads a skill owes it a reflection.** Craft knowledge
is discovered while doing the work, and a project that does not capture
it re-learns it every time. Conforming projects must define a mechanism
for a completed session to feed corrections and new lessons back into
the skill it used — as append-only fragments per session rather than
edits to a shared file, so parallel work never conflicts — and to
promote what is universally true into the skill body itself. Anything
the skill said that turned out to be **wrong** is fixed in the same
pass; a skill that misleads is worse than no skill.

## 22. Bootstrap checklist

Use this checklist when creating a new repository. Every box should be
checked before the first public tag.

```
[ ] LICENSE                                             (§2)
[ ] README.md with badges and quick start               (§3)
[ ] CONTRIBUTING.md                                     (§4)
[ ] CODE_OF_CONDUCT.md                                  (§5)
[ ] SECURITY.md                                         (§6)
[ ] AGENTS.md as single source of truth                 (§7)
[ ] CLAUDE.md / copilot-instructions.md / .cursorrules
    as symlinks to AGENTS.md                            (§7.1)
[ ] Symlink-verification CI job                         (§7.1)
[ ] CHANGELOG.md (empty, auto-generated)                (§8.4)
[ ] Conventional commits enforced                       (§8.1)
[ ] Default branch protected with status checks         (§10.2)
[ ] Makefile with build/test/lint/fmt targets            (§9)
[ ] CI workflow: build, test, lint, fmt-check           (§10.1)
[ ] version-bump workflow (workflow_dispatch, pushes
    `v*` tag via RELEASE_TOKEN)                         (§10.3)
[ ] release workflow triggered by `push: tags: ['v*']`,
    generating changelog, updating versions,
    force-pushing the rewritten tag, matrix-building
    and publishing                                      (§10.3)
[ ] RELEASE_TOKEN secret used by version-bump only;
    release workflow uses the default GITHUB_TOKEN for
    its commit-to-main and retag steps                  (§10.3)
[ ] Trusted publishing (OIDC) configured for every
    target registry; no long-lived publish tokens       (§10.3)
[ ] Publish jobs declare explicit least-privilege
    permissions (contents: read, id-token: write)       (§10.3)
[ ] docs/ with the topics a game owes                   (§11.1)
[ ] A canonical page: the game itself, or a landing page (§11.2)
[ ] Page facts extracted from source, failing loudly    (§11.2.2)
[ ] pages workflow deploys on every main push           (§10.4)
[ ] SEO structural check in CI                          (§11.3.9)
[ ] Developer tools indexed, each with --help           (§12)
[ ] examples/ (if applicable) exercised by CI           (§13.1)
[ ] prompts/<name>/<major>_<minor>_<patch>.md for every
    LLM prompt the project sends (if applicable)        (§13.2)
[ ] Every prompt has YAML front matter with name,
    description, and version fields matching the stem  (§13.2)
[ ] Dependabot / Renovate configured                    (§14)
[ ] Secret scanning enabled                             (§14)
[ ] CI actions pinned by SHA                            (§14)
[ ] .github/ISSUE_TEMPLATE/ populated                   (§15)
[ ] .github/PULL_REQUEST_TEMPLATE.md                    (§15)
[ ] Pre-commit hooks installable                        (§16)
[ ] Governance documented                               (§17)
[ ] Communication channels linked in README             (§18)
[ ] Tests in separate files (*_test, *_tests, *Test,
    *Tests), no inline test blocks in source              (§20)
[ ] AGENTS.md documents test conventions                  (§20.4)
[ ] Central output module, no raw print statements       (§19.4)
[ ] Always-on debug log file                             (§19.2)
[ ] A documented switch that raises verbosity            (§19.3)
[ ] .agent/skills/update-readme/ with SKILL.md +
    .last-updated                                       (§21.5)
[ ] .agent/skills/update-docs/ with SKILL.md +
    .last-updated                                       (§21.5)
[ ] .agent/skills/maintenance/ umbrella skill routing
    to every update-* skill                             (§21.6)
[ ] .claude/skills symlinked to ../.agent/skills         (§21.2)
[ ] AGENTS.md documents maintenance skills                (§21.8)
```

A repository that satisfies this checklist has the foundational
infrastructure of a healthy open source project and is ready to accept
its first contribution. **A game is not conformant on this checklist
alone** — §23–§37 apply on top of it, and their combined checklist is
§37.

---

## 23. The game project shape

This chapter is the spine of the game half of the spec. It defines the
**roles** a conforming game is built from, the single direction its
dependencies point, and the properties that must survive a change of
language, engine, renderer or platform.

Everything here is stated in terms of roles because that is the part
that has to outlive the stack. A project that keeps these boundaries can
replace its renderer in a branch and its language over a year, one role
at a time. A project that lets the boundaries dissolve into whatever
framework it started with cannot do either without rewriting the game.

### 23.1 The simulation core

**The core is the game.** It owns every rule: how the world advances,
what a hit does, what a level is, what an item is worth, when a run
ends. It is the only role permitted to decide anything about the game
state.

Mandates:

- **Framework-free.** The core must not import a UI framework, a
  rendering library, an audio library, an input library, or any
  platform SDK. Not "should avoid" — must not. This is what makes the
  rest of the chapter possible.
- **Headless.** The core must run to completion with no display, no
  audio device, no input device and no window, driven only by a step
  function and an input structure. If it cannot, every mandate in §32
  (measurement) is unreachable and the project will balance its game by
  opinion.
- **Deterministic.** Same inputs, same seed, same result — see §25.
- **Host-agnostic.** The core must be embeddable in at least two hosts
  without modification: the interactive build, and a headless harness.
  Projects with a session service (§34) get a third for free, which is
  the point.
- **One public entry surface.** Everything a host may call is exported
  from a single documented module. Reaching into the core's internals
  from a shell is a layering violation, and the export list is the only
  place a reviewer can see the whole contract.

The core also owns the **content catalogs** as data (§24) — the ids, the
definitions, the tables. Content is not a separate role from the core's
perspective; it is the core's input.

### 23.2 The presentation shell

The presentation shell turns a state into a picture, a noise and a set
of gestures. It owns rendering, input handling, audio playback, the
interface, the storage of player preferences, and the packaging of the
build for its primary distribution target.

Mandates:

- **The shell depends on the core; the core never depends on the shell.**
  There is no exception, no callback, no "the engine just needs to know
  the canvas size". A measurement the core needs is an input the host
  passes in.
- **The shell holds no rules.** If a number decides an outcome, it lives
  in the core. A shell that computes damage to draw a number has
  created a second source of truth that will disagree with the first
  under lag, replay or a mod.
- **The shell is replaceable.** A second shell over the same core must be
  possible without touching the core. Projects that ship one shell
  should still be able to state what the second would have to do.

### 23.3 Platform shells

A platform shell wraps the built game for a distribution channel that
the primary shell cannot reach on its own — a console, a desktop store,
a mobile store — and supplies what that channel provides: achievements,
cloud saves, purchases, overlays, haptics, native input. §33 governs
them in detail.

### 23.4 The session service

For multiplayer, the core is hosted in a process of its own so a session
simulates once, authoritatively, rather than in one participant's
renderer. §34 governs it. Single-player games omit the role.

### 23.5 Content

Authored data — every catalog the game is made of. §24 governs it. It is
a first-class role with its own directory, its own schemas and its own
compile pipeline, and it is deliberately **not** source code.

### 23.6 Tooling

Generators, compilers, analyzers, preview renderers, simulators,
packaging scripts. Tooling sits outside the dependency direction: it may
import from any role, and nothing may import from it. Authored data
never lives here — a generator is tooling, the table it reads is content.

### 23.7 The dependency direction

```
        content ──▶ simulation core ◀── tooling
                          ▲                 │
                          │                 │
      presentation shell ─┘                 │ (may read everything)
              ▲                             │
              │                             ▼
      platform shells                 session service ──▶ core
```

Stated as rules a review can refuse a change against:

1. The core imports nothing from any shell, any service, or any tool.
2. A shell imports the core, never another shell.
3. The session service imports the core and nothing from any shell.
4. Tooling may import anything; nothing imports tooling.
5. Reusable code that is not about *this* game (math, containers,
   scheduling, generic widgets) lives in a clearly separated pool inside
   the role that owns it, imported through a stable alias rather than a
   relative path — so that extracting it later is a move, not a rewrite.

**Enforce direction with a test, not with discipline.** A conforming
project ships a check that walks the real import graph and fails when an
arrow points the wrong way. Discipline degrades under deadline; the
graph test does not, and it is the single highest-value structural test
a game repository has.

### 23.8 The sequel test

The clearest statement of whether the shape is real:

> Delete every piece of authored content and every asset. The rule tests
> must still pass, the build must still build, and what remains must be
> a working game engine waiting for a game.

A project that can do this can make a sequel, hand its engine to a
different game, or survive a total content rewrite. A project that
cannot has content welded into its rules, and the welds are exactly what
makes a five-year-old game impossible to change.

Conforming projects should keep this honest by shipping the rule suite
against synthetic fixtures (§20.3) — the same discipline, checked
continuously instead of annually.

### 23.9 The startup path is a budget, not a preference

A game's first frame competes with the player's patience, and on the
web it competes with a 3G connection. So the amount of code needed to
reach the **first interactive screen** is a number a conforming project
writes down and enforces in CI.

The trap this mandate exists for is subtle and catches every project
once: a menu needs one fact from the core — a level's name, a saved
hero's stats — and imports it. Now the menu's module graph contains the
whole simulation, the entire content catalog and every generator they
reference, because **an import is an import** and tree-shaking will not
save you: it is a global analysis, so an export used by any chunk keeps
its bytes wherever its module was placed, and its module is now on the
startup path.

Required:

- **A named budget** for the critical path, with a stated basis (a
  device and a network, or a cold-start time on target hardware).
- **A CI gate** that fails the build when the budget is exceeded. When it
  trips, the fix is to find what reached back into the simulation — not
  to raise the number.
- **A narrow entry surface for the startup path**, exposing only the
  facts the pre-run screens need, and re-exporting nothing that
  simulates. Content compiled for menus (names, ordering, unlock state)
  is emitted separately from content compiled for runs (geometry,
  spawn tables, loot) so the menu can read the first without dragging in
  the second.
- **Runtime toggles in an import-free leaf**, so that reading a flag
  never pulls a subsystem onto the path.

## 24. Content is data

A game is mostly content, and content authored as code is content that
only programmers can change, that cannot be validated as a set, that
cannot be shipped to modders, and that turns every balance tweak into a
code review. **Every catalog a conforming game ships is authored as
data, validated, and compiled.**

### 24.1 The shape

One shape, repeated per catalog:

```
authored source (data)  →  schema validation  →  generated output
   content/<catalog>/         per-catalog            (gitignored,
     <id>.<ext>               schema module           regenerated
                                                      every build)
```

- **Authored source** lives under the content role (§23.5), one file per
  entity where entities are individually meaningful (a level, an enemy,
  an item), one file per table where they are not (a rarity ladder, a
  curve).
- **Ids are the reference mechanism.** Content refers to other content by
  id, never by file path, position or object reference. Ids are stable;
  renaming one is a migration, not an edit.
- **The generated output is build output.** It is written into the role
  that consumes it, is gitignored, and is regenerated by the pipeline
  entry point (§9.1). Editing or committing it is a defect — see §24.3.

Serialization format is the project's choice (YAML, JSON, TOML, a
binary export from an editor); what is normative is that it is **data**,
diffable in review, and validated before it reaches the game.

### 24.2 The schema owns what may be said

Every catalog has a **schema module of its own** that defines the fields
it accepts, their types, their ranges and their cross-references. The
schema — not the generator — is the authority:

- A new field is added to the schema first, with its validation rule and
  its error message, before any generator or consumer reads it.
- Validation must resolve **cross-catalog references** (this level's boss
  id exists; this item's sprite exists; this quest's giver exists) and
  fail the build when one dangles. A dangling id that reaches the
  running game is a crash the player finds.
- Validation runs against the **live catalogs**, not against a copy, so a
  rule the engine enforces and a rule the schema enforces cannot drift.
- The same schema modules must be usable by the mod compiler (§27), so
  what a mod may say is exactly what the shipped content may say. Any
  deliberate exception (a catalog only the base game may define) is
  listed in the modding documentation, not discovered by a modder.

### 24.3 Generated output is never edited

Committing generated content produces the worst failure mode in this
whole spec, because it fails **quietly**: a stale generated file compared
against an equally stale build agrees with itself, the suite goes green,
and CI fails on exactly the drift the test existed to catch.

Rules:

- Generated content and generated assets are gitignored.
- Every entry point that builds, tests or lints regenerates them first,
  so a fresh clone and a working tree behave identically.
- `AGENTS.md` (§7.2) states, in imperative terms, that these paths are
  never hand-edited and names the command that rebuilds them.

### 24.4 Drift guards

Two kinds of guard, and a conforming project ships both:

- **Round-trip guards.** Compile the authored source, re-serialize it
  from the compiled form, and assert the result matches the source.
  This catches a generator that silently drops a field — the failure
  that otherwise surfaces months later as "that stat never worked".
- **Snapshot guards** for artifacts that are *deliberately* committed
  (§33.5, §27.4) because an external system consumes them: a store's
  achievement list, a published mod catalog, a parity report. Each is
  regenerated in the same commit as the change that moves it, and a test
  compares the committed copy against a fresh build.

An intentional change is accepted by **re-running the generator**, never
by hand-editing the expected fixture. A project that lets contributors
edit snapshots to make tests pass has deleted the guard.

### 24.5 The pipeline is ordered, and it runs once

Catalogs depend on each other: items reference sprites, levels reference
enemies, quests reference both. The compile pipeline is therefore a
single ordered step list — one entry point, documented in
`docs/content-pipeline.md` (§11.1) — and the order is a dependency
order, not a preference.

Two rules that only ever get learned by paying for them:

- **Exactly one entry point per invocation.** A tool that needs fresh
  content calls the pipeline once and then does its own work. A script
  that chains two entry points compiles everything twice.
- **How much of the pipeline runs is an argument.** Expensive optional
  work (preview renders, high-resolution exports, documentation images)
  is selected by a flag on the one pipeline; everything the game itself
  ships is built and checked identically in every mode. Otherwise the
  cheap mode becomes a mode where the game is not actually verified.

## 25. Determinism and simulation integrity

Determinism is not a nice-to-have for a game; it is the precondition for
debugging it, balancing it, testing it, replaying it and networking it.
A game that cannot reproduce a run cannot investigate a bug report.

### 25.1 Seeded, reproducible runs

- **All simulation randomness comes from a seeded generator owned by the
  run state.** No global random source, no wall-clock seeding inside the
  simulation, no per-subsystem generator that nobody threads through.
- **A run is identified by its seed plus its parameters**, and both are
  recorded anywhere a run is reported: a bug report, a benchmark, a
  balance measurement, a crash log.
- **Time advances in fixed steps.** Frame-rate-dependent rules produce a
  different game on different hardware and make every measurement
  incomparable. Render as often as you like; step the simulation on a
  fixed interval.
- **Iteration order is deterministic.** Anything the simulation walks —
  entity collections, spatial buckets, event queues — has a defined
  order that does not depend on hash layout, insertion timing or
  platform collection internals.

### 25.2 Presentation must not consume the simulation's randomness

This is the single most-violated rule in this chapter, and the one whose
violations are hardest to attribute.

**Never spend a simulation random draw on something the player only
looks at.** A cosmetic scatter, a jitter, a particle direction, a
variant sprite pick — each consumes a draw, and every draw after it in
the stream shifts. The seeded run diverges, the A/B measurement compares
two different games, and the bug reproduces on nobody's machine.

The correct sources for presentation variation:

- A hash derived from something the simulation already decided (the
  entity's id, the item's identity, the tick number).
- A separate generator owned by the *presentation* layer, never the run.

The same rule applies to any optional subsystem that may be disabled:
if switching a feature off changes the draw sequence, then two players
with different settings are playing different games.

### 25.3 Replay and digest guards

A conforming project proves determinism continuously rather than
assuming it. Two levels, and the first is required:

- **Required — run-to-run equality.** A test runs a fixed scenario for a
  fixed number of steps twice from the same seed and asserts the
  resulting states are identical. This catches the common regressions:
  an unseeded source, a wall-clock read, an iteration order that depends
  on hash layout.
- **Recommended — a stored digest.** Reduce the end state to a digest and
  commit the expected value for a few canonical scenarios. This is
  strictly stronger, because it also catches a change that is
  deterministic but *different*: a deliberate rule change then updates
  the expected digest in the same commit, which usefully makes every
  gameplay change state, in its own diff, that it changed the game.
  Where the simulation runs on more than one platform (a session
  service, a native build), assert the digest across platforms too —
  that is the only cheap way to catch a platform-dependent numeric or
  ordering difference before players in one session desync from players
  in another.

### 25.4 Authoritative state, single ownership

- Every piece of run state has exactly one owner, and derived values are
  derived, not stored twice. Two copies of "current health" is a bug
  waiting for a code path to update one of them.
- The simulation is the authority over what happened; presentation and
  network layers report it. Where a network is involved, §34 says who
  the authority is and what a client may assume.
- Anything the host wants to set up before the first step is a **run
  parameter**, passed into run creation — never a mutation applied
  afterwards. A field only one host applies is a divergence that
  presents as a networking bug and is actually a setup bug.

## 26. Scripted rules — the moddable formula seam

A game whose rules are all compiled is a game only its developers can
change. A game whose rules are all scripted is slow and unpredictable.
The conforming middle is explicit: **a defined set of formulas is
authored as scripts, evaluated in a sandbox, and everything else stays
compiled.**

This chapter is required for any game that intends to support total
conversions (§27); it is recommended otherwise, because the same seam is
what lets designers tune rules without a rebuild.

### 26.1 What may be a script

- **A hook is a formula, not a frame.** Scripted hooks are called per
  discrete event — a kill, a drop, a spawn, a level-up, a purchase — and
  never per entity per frame. Anything on a hot path stays compiled;
  the sandbox boundary is not free and a per-frame hook makes the
  frame budget the mod author's problem.
- **The engine keeps the dice.** A hook decides what a random draw is
  measured *against* — a threshold, a weight, a multiplier — never how
  many draws are taken or in what order. Otherwise a mod breaks
  determinism (§25) for every run, including seeded ones the mod is not
  loaded into.
- **A hook receives a value and returns a value.** It does not mutate
  engine state, does not perform I/O, and cannot reach outside its
  sandbox.

### 26.2 The sandbox

The scripting runtime must be embedded and restricted: no filesystem, no
network, no process access, no host-object escape. Execution must be
bounded — an instruction or time budget that aborts a runaway script
with a diagnosable error rather than hanging the game.

### 26.3 The fallback is not a second implementation

Every hook has a compiled fallback used when no content tree is present
(a fixture-only test suite, a fresh clone, a build with content
disabled). That fallback is **the same formula**, and a parity test must
assert the compiled fallback and the authored script agree — value for
value, across a swept input range.

Without that test the two drift, and the drift surfaces as "the game
balances differently in tests than it does when you play it", which
takes a week to diagnose and is obvious in hindsight.

### 26.4 Adding a hook is a complete change

Adding a scripted rule touches, in one commit: the hook definition
(name, signature, when it is called), the authored script, the binding
that wires the two together with its compiled fallback, and the
published catalog of what mods may hook (§27.4). A hook missing any of
those is either invisible to modders or a promise the game does not
keep.

`docs/scripting.md` (§11.1) documents the hook list, the sandbox's
limits, and exactly what a script may read.

## 27. Mods and user content

A moddable game outlives an unmoddable one, and the seam that makes
modding possible is the same seam that makes the game testable. This
chapter is **recommended** for every game and **required** for any game
that advertises mod support or ships to a platform with a workshop.

### 27.1 One registration seam, used by everyone

Mods add and override content through a single documented registration
call — and **the game's own tests use the same call** to install
synthetic fixtures (§20.3). One seam, two consumers, so the seam cannot
rot: if registration breaks, the entire rule suite goes red immediately
rather than a modder discovering it after release.

Required properties:

- **A mod applies to a run, not to an installation.** Loading is scoped,
  and there is a documented restore that returns the process to the
  shipped catalogs. Anything else leaks a mod's rules into the next run
  the player starts, which manifests as an unreproducible bug report.
- **Load order is defined and visible** when several mods are active, and
  a conflict (two mods redefining one id) is reported to the player
  rather than resolved silently.
- **A mod cannot escape the schemas.** Mod content is validated by the
  same schema modules as shipped content (§24.2). A mod that would crash
  the game must fail to load with a message naming the file and the
  field.

### 27.2 What a mod may change

Document, in `docs/modding.md`, the exact boundary — which catalogs a
mod may add to, which it may override, which it may not touch, and which
scripted hooks (§26) it may implement. The boundary is a promise; state
it explicitly rather than letting modders discover it by experiment.

### 27.3 Determinism and safety still apply

Mod-supplied scripts run in the same sandbox with the same budget
(§26.2), and mod content participates in the same seeded run (§25). A
mod may change what a formula computes; it may not change how many draws
the run takes.

### 27.4 The published catalog is a committed, drift-tested artifact

Mod authors need a machine-readable list of every id, field and hook
they may reference. That catalog is generated from the live schemas and
catalogs, **committed** (because it ships to people outside the repo),
and drift-tested against a fresh build (§24.4). A content change that
adds or retires an id regenerates it in the same commit.

### 27.5 Mod content is not governed by the project's own content rules

The narrative chain (§30) and the naming rules (§31) govern **the
shipped game**. A mod authored by a stranger has no tier above it, is
never filed into the project's story documents, and must never be
"corrected" to match them. The rule is about **origin**, not format: the
identical file in a mod's folder answers to its author and to the schema
alone. Example mods shipped by the project are shipped content and do
follow the project's rules.

## 28. Interface as content

A game's interface changes constantly, is judged visually, and is the
surface modders and designers most want to touch. Conforming games
therefore **author the interface as content** (§24) rather than as
components: every bar, readout, panel, menu row, modal and dialog is a
data definition, rendered by a small set of general renderers.

This is recommended for every game and required for any game whose
modding boundary (§27.2) includes the interface.

### 28.1 The split

| Concern | Where it lives |
|---|---|
| What exists, where it sits, what it says, how it sounds | Authored interface content |
| The **judgement** behind a value (a colour ladder, a threshold, whether a row is worth its space) | A scripted expression (§26) beside the content |
| The **irreducible** insides of a few elements (a map canvas, a gesture surface, a chart) | A widget implemented in the shell, still placed, gated and sounded by content |
| The vocabulary of what content may say | A schema (§24.2) — extending it is a deliberate, reviewed change |

### 28.2 The rules that keep the seam honest

- **A new interface element is a content file, not a component.** The
  moment "move the ammo counter" requires editing shell source, the seam
  has stopped paying for itself.
- **Every element has a stable id**, because that id is how a mod
  replaces it and how an addition is ordered relative to existing rows.
- **Interface sounds are routed through content**, not called
  imperatively from the shell — a sound a mod cannot reach is a sound
  the interface hard-codes.
- **Adding a binding, action or widget means extending the schema and
  answering it in the shell**, in one commit, with a test that asserts
  the vocabulary and the implementation agree.
- **The catalog must answer every interface state the core can raise.**
  A state with no content definition is a screen the player reaches and
  finds empty; the generator must refuse to compile a catalog with a
  hole in it.

## 29. Assets and audio

### 29.1 Every derived asset is generated from a single source

Sprites, atlases, icons, fonts, store rasters, previews — each has one
authored source and a documented command that derives every output from
it. Hand-edited derivatives drift from their source on the next
regeneration and produce inconsistent art across surfaces.

Consequences a conforming project accepts:

- Derived outputs are gitignored build artifacts (§24.3), except the few
  an external system consumes, which are committed and drift-tested
  (§24.4).
- The regeneration command is part of the pipeline (§9.1, §24.5), so a
  fresh clone produces byte-identical assets.
- Assets referenced by content are validated as cross-references at
  compile time (§24.2) — a missing sprite fails the build, not the frame.

### 29.2 A shared style definition

The project's visual identity is written down — a palette, a resolution
or scale rule, silhouette and readability rules, per-family anchors —
and every asset is judged against it. When assets are produced with
generative tooling, this definition is the shared preamble every prompt
references, and it is versioned with the prompts (§13.2).

### 29.3 Audio is content too

Sound effects and music are catalog entries (§24) with the same
validation, whether they are synthesized from authored parameters or
shipped as recordings. Two mandates:

- **The routing key is one definition, used everywhere.** An event finds
  its sound through a key built from a fixed set of fields. Every place
  that builds or matches that key — the runtime, each generator, the mod
  compiler, the schema — must derive it from **one** definition, and a
  test must assert the agreement through the runtime rather than by
  restating the formula. A field added to one of them makes every lookup
  miss, and the failure is silent: fallbacks keep playing, and only
  mod-supplied replacements go quiet.
- **A sound the simulation does not know it is making is a cue, not an
  event.** A footfall belongs to the renderer, which knows the entity
  has legs and which frame of the walk it is on. Per-entity-per-frame
  moments must not enter the simulation's event stream (which is
  replicated, recorded and replayed); they are raised through a separate
  cue channel that is **rate-limited in the funnel**, because a limit
  each caller re-implements is a limit somebody forgets.

### 29.4 Screenshots and store rasters are generated

Marketing and store images are produced by driving the real build to a
defined situation (§32.6) at the exact required rasters, not cropped by
hand from a session. Otherwise every art change silently invalidates the
store listing and nobody notices until a reviewer does.

## 30. Narrative

A game's story lives in three tiers, and **changes flow downward, never
up**:

1. **The gist** — the whole plot in prose, in narrative order. Ground
   truth.
2. **The script** — every spoken line, monologue, caption and piece of
   found text, verbatim.
3. **The game** — the content catalogs (§24) that play the script.

When two tiers disagree, the **higher tier wins**; correct the lower
one. A game with no story in tier 1 has no way to notice that two
characters now contradict each other, because nothing above the content
files says what is true.

### 30.1 The unit is a line

The chain is walked for **any** change to a line the game speaks — not
only for plot movement. A retone, a second page on a monologue, a bark, a
merchant's greeting, a death quote, a companion's joining words: each is
transcribed in tier 2, so each owes the chain a walk. **A change that
edits a spoken line and leaves tiers 1 and 2 untouched is incomplete.**

### 30.2 Changing the story is a two-step commitment

If a change contradicts the script, the script must be updated too — but
only with the owner's explicit confirmation. A contributor may be
pre-authorized ("rewrite this speech and update the manuscript");
otherwise, ask. Never silently edit a line and leave the tiers stale, and
never rewrite the tiers without that confirmation.

### 30.3 What is not story

Brand strings (title, tagline, store description) live in the project's
identity manifest (§35.6). Loose interface copy — button labels, hints,
error text — lives with the interface. Neither is governed by the chain;
conflating them makes the chain too heavy to walk and it stops being
walked.

## 31. Naming and intellectual property safety

**Nothing in a shipped game is named after a real person, company,
product or franchise — including the near-miss pun.** Satire targets a
*phenomenon*, never a nameable party. This is both the better joke and
the only version that ships: a storefront may refuse a game whose
antagonists are a real company, under its own content guidelines, after
the work is done.

### 31.1 Identity has four carriers, and they move together

Renaming is the part people do; it is one quarter of the job.

| Carrier | What identifies |
|---|---|
| **The name** | Id, display name, file name, asset name |
| **The voice** | Dialogue, catchphrases, and any verifiable biographical fact — a real quote identifies with no name attached |
| **The art** | The silhouette, the costume, and a brand's colour sequence, which is protectable on its own |
| **The description** | The text that ships in companion material **and** drives the next asset regeneration — a cleaned image with a dirty description grows its likeness straight back |

### 31.2 Name the role, not the person

THE FOUNDER, THE MODERATOR, THE FULFILLER. The archetype is funnier than
the caricature, it does not date, and it cannot be sued.

### 31.3 Write the rule down

The project keeps a naming document stating what is safe (myth, trade
vocabulary, historical events, the long dead, invented brands), what is
refused, and the mechanical traps that defeat rename sweeps — chiefly
that a sweep which fixes only the name leaves the other three carriers
intact and the likeness survives.

This governs the shipped game. A mod's names are its author's business
(§27.5).

## 32. Balance, measurement and playtesting

Balance is the part of a game most often decided by opinion and most
easily decided by measurement. A conforming project can answer "is this
change better?" with numbers from the real rules, and can answer "does
it feel right?" from the real build. Both loops are required.

### 32.1 Judge a change by the loop that matches it

| Question | Instrument |
|---|---|
| Does the rule do what I think? | A rule test on synthetic fixtures (§20.3) |
| Is the game harder / faster / richer than before? | The headless simulator (§32.2) |
| Does the change hold up across a whole progression? | A simulated campaign (§32.2) |
| Does it read, feel and sound right? | A driven playtest of the real build (§32.4) |
| Is it fast enough? | A benchmark against a recorded baseline (§32.5) |

The failure this table prevents: judging balance from a screenshot, and
judging feel from a number.

### 32.2 The headless simulator is required

Because the core is headless (§23.1), the project must ship a tool that
plays the game without a renderer and reports what happened. It must:

- Run a **single scenario** (one level, one encounter, one build) and a
  **whole progression** (the full ladder of content, carrying state
  forward as a player would).
- Be driven by an automated player (§32.3) rather than by scripted
  inputs, so the measurement reflects play rather than a fixed sequence.
- Report the numbers a designer actually asks about: progression pacing,
  damage dealt and taken, time-to-kill per opponent, resource and reward
  flow, what dropped and when, where and why the player died, and what
  the content's own limits withheld.
- Take a **seed** and print it, so every number is reproducible (§25.1).
- Support **A/B comparison** of two configurations and a **verdict**
  summary — a small set of pass/warn/fail judgements against the
  project's stated design targets — so a contributor who is not a
  designer can still tell whether a change is acceptable.
- Support probing candidate tuning **without a rebuild**, so exploring a
  parameter space is minutes rather than hours.

Deaths in a measurement run are data, not failure: a calibration run
records every one with its cause and location and keeps going. A mode
where death ends the run is a separate, explicitly requested mode.

### 32.3 The automated player

The simulator needs something to play the game. That automated player is
a first-class, maintained subsystem, and its target is **human
capability**: it should make the decisions a competent player makes and
never the ones no player would make.

- It must be **deterministic** given the seed (§25.1).
- Its tuning lives in content (§24), not in constants, so a designer can
  adjust it.
- It must not be given advantages a player lacks — a measurement taken by
  an omniscient player measures nothing about the game as played. In
  particular it must be limited to what the player can actually perceive
  (§35.3).
- When the game's content grows a mechanic the automated player cannot
  handle, teaching it that mechanic is part of shipping the mechanic.
  Otherwise every future measurement is taken on a game the tool cannot
  play.

### 32.4 Playtesting the real build

Measurement cannot see a frame. A conforming project ships a command
that launches the **real build**, drives it with the automated player,
captures frames at the reference viewport (§35.2), and reports run
statistics. This is the closing step of every gameplay change: rules are
verified by tests, balance by the simulator, and the thing the player
receives by looking at it.

### 32.5 Performance is measured against a baseline

Ship a benchmark for the simulation (steps per second on a defined
scenario, best-of-N, verified against a digest so an optimization that
changes behaviour is caught rather than celebrated) and a way to observe
frame cost in the real build. Record baselines; a change that moves them
says so in its pull request.

### 32.6 Staging an exact situation

Reproducing a bug, judging an effect, or capturing a store screenshot
all need the game in a **specific** state — a particular opponent, a
particular loadout, a particular moment. A conforming project ships a
scenario mechanism that stages such a state in the running build from a
declarative description, without editing code and without playing to it.
Without it, every visual investigation begins with twenty minutes of
manual play, so it does not happen.

## 33. Platform shells and store releases

A platform shell (§23.3) wraps the built game for one distribution
channel. This chapter applies to any game that ships beyond its primary
target; a browser-only game satisfies it trivially.

### 33.1 A shell adds reach, never rules

A shell may add platform capability — achievements, cloud saves,
purchases, overlays, haptics, native input, native audio behaviour. It
may not add or change a game rule (§23.2). If two shells could produce
different outcomes from the same inputs, the difference is a rule that
escaped the core.

### 33.2 The shells differ only in their pipe

Where several shells exist, they wrap the same build and answer the same
protocols; what differs is how a message travels. **That difference, and
only that difference, is abstracted.** Everything else — the protocol,
the payloads, the ordering — is shared.

Two consequences worth stating because they are what make a second shell
cheap:

- **Ask "which shell" only for platform-capability questions**, never to
  decide how to talk to one. A capability check is a feature question; a
  transport check is a leak.
- **Each platform capability follows the same layered shape** — a
  transport-neutral bridge, a provider that implements it for one
  platform, and the platform's own code — so adding a new platform to an
  existing capability is one new file, not a new seam.

The test of whether the seam sits in the right place: **adding a second
shell should change no line of the core and no line of the presentation
shell.** If it does, the boundary was drawn in the wrong place, and the
next platform will cost the same again.

### 33.3 Each shell is its own tree, with its own checks

A shell has its own dependency tree, its own build, and its own test
suite in its own toolchain — the primary suite stops at its edge. The
project documents, per shell, how to build it, how to test it, and how
to release it, and CI runs each shell's checks when that shell changes.

### 33.4 Comparing two shells is an artifact, not an opinion

When a project maintains more than one shell for the same platform (for
example while evaluating a replacement), which one ships is decided by
**recorded measurements** — package size, cold start, memory, capability
coverage — and the pairing between the two implementations is itself a
generated, drift-tested artifact (§24.4) so an unpaired module cannot
slip through review.

### 33.5 Store metadata is generated and drift-tested

Achievement lists, leaderboard definitions, capability declarations,
age-rating questionnaires and listing copy are derived from the same
sources as the game and committed as artifacts an external system
consumes (§24.4). A store release runs from a written preflight
checklist that includes: the release build strips developer tooling, the
committed metadata matches a fresh build, and the platform project files
are re-synced rather than shipped stale.

## 34. Multiplayer and session services

This chapter applies to games with networked play. Single-player games
skip it, but should keep §23.1 and §25 intact — they are what make
adding multiplayer later a project rather than a rewrite.

### 34.1 The session simulates in one place

Host the core in a process of its own (§23.4) so a session advances
once, authoritatively, rather than in a participant's renderer. The same
binary is the dedicated server. The session service imports the core and
nothing from any shell — enforce it with the import-graph test of §23.7,
because this particular arrow gets violated by a single convenience
import and is invisible until someone tries to run the server headless.

### 34.2 One client implementation

There is exactly **one** implementation that turns received state back
into a playable run, used by both the game's own client and any headless
bot client. Two implementations mean the thing the bots prove playable
is not the thing players play.

### 34.3 Commands are a narrow, versioned, allow-listed surface

- Every action a client may request of a session is an explicit command
  with scalar arguments — never an arbitrary state mutation.
- The allow-list is versioned; the protocol version increments when it
  changes, and mismatched versions are refused with a clear message.
- **The acting participant comes from the session's own admission
  record**, never from a field in the message. A client that can name
  who it is acting as can act as anyone.
- Where the allow-list must exist in two places for structural reasons
  (for example a startup-path budget, §23.9), a drift test enforces the
  pair.

### 34.4 Parameters, not post-hoc mutation

Everything the host sets up before a session's first step is a session
parameter (§25.4). Every participant builds the same run from the same
parameters; a field only one of them applies is a desync that presents
as a replication bug and is actually a setup bug.

### 34.5 The party is a first-class concept in the rules

Single-player assumptions are the hardest thing to remove later, so name
them now:

- A read about **one** participant (inventory, progression, equipment) is
  a parameter, never a lookup of "the player".
- A read about **the group** (nearest, any within range, centroid,
  aggregate level) has its own accessor with a defined answer.
- "Is this participant someone the world should react to" is its own
  predicate, distinct from "is alive" — a disconnected or departed
  participant is neither.
- A blocking interface (an inventory, a shop, a pause) belongs to **one**
  participant, and the world stops only when everyone present is
  blocked. A design that freezes a session because one player opened a
  menu is a design that cannot ship multiplayer.

### 34.6 Sessions must survive real networks

Document and test reconnection, admission, latency, loss and
out-of-order delivery. A conforming project ships a way to run a session
under simulated adverse conditions with headless clients, because the
first time a session meets a bad network must not be in front of
players.

## 35. Player-facing quality gates

The chapters above govern how the game is built. This one governs
whether it is fit to be played, and each gate is a number or a check —
not a judgement call made at release time.

### 35.1 Performance targets on the reference device

The project names the **device class it targets** and the frame rate it
holds there, and measures against it (§32.5). "It runs fine on my
machine" is not a target. A game that ships to phones states the phone.

### 35.2 The reference viewport

The project names the **reference display** — the size and orientation
the interface is designed against — and every layout decision, playtest
capture and interface review happens there first. Larger displays scale
up from it; they do not define it.

Interface work is additionally reviewed across the full set of target
sizes, and the review is done from **captures of the real build**, never
from markup. Clipping, overflow and unreachable controls are invisible
in source and obvious in a screenshot.

### 35.3 Perception rules are part of the rules

Anything the game chooses automatically on the player's behalf — an
auto-targeted opponent, a summon's destination, an assist — must be
limited to what that player can actually **perceive**. This is a rule,
not a nicety: an automatic action taken against something the player
cannot see reads as a bug, and it is one.

Note that perception is usually more than one fact — what is currently
displayed *and* what is revealed or remembered are different questions,
and using the wrong one produces exactly the class of bug where the
character acts on knowledge the player does not have.

### 35.4 Accessibility

Required, at minimum:

- **Reduced motion** is honoured by every effect that shakes, flashes or
  scrolls the whole view, following the platform's own setting where one
  exists.
- **No information is carried by colour alone** — a state distinguished
  only by hue is invisible to a large minority of players.
- **Input is not assumed.** Every action is reachable on every input
  device the project claims to support, and remappable where the
  platform expects it.
- **Text is legible at the reference viewport** (§35.2) without zooming.

### 35.5 The mature-content gate

If the game contains content that is not appropriate for all audiences,
one setting governs all of it, and:

- **The gate sits where the thing is decided, not where it is drawn.** A
  check at the draw call leaves the simulation generating the content
  invisibly — the cost is still paid, and the state still fills up.
- **A new mature feature adds a check to the existing gate, never a new
  setting.** Two settings mean a player who disabled one is still shown
  the other.
- The gate's default is the project's call, but it must be documented
  and must match what the store listing and age rating claim.

### 35.6 One identity manifest

Title, short name, tagline, descriptions, store identifiers, URLs,
colours, storage prefixes: one manifest, read by every surface that
needs them — the build, the interface, the store metadata, the page,
the icons. Renaming the game is then one edit and a regeneration, not an
archaeology expedition. Nothing else may hard-code the game's name.

## 36. Save data and compatibility

A player's progress is the one thing in a game that cannot be
regenerated. Treat it accordingly — and distinguish the two kinds of
persisted data, because they get different promises:

| Kind | Examples | Promise |
|---|---|---|
| **Progress** | Roster, unlocks, currency, achievements, settings, statistics | Migrated forward from every version ever shipped. Never silently reset. |
| **A parked session** | A run in progress, mid-level state, an undo stack | May be discarded when the format changes incompatibly — but the discard is deliberate, announced in the changelog, and must never take progress with it. |

- **Every persisted structure carries a version.** For progress data, an
  unreadable payload fails **visibly** with the data left on disk, so a
  bug is recoverable instead of terminal. For a parked session, a version
  mismatch may drop the session, and the release notes say so (§8.5).
- **Prefer defaulting a new field over bumping the version.** An
  additive field that reads sensibly when absent costs nothing; a
  version bump for it throws away every parked session in the wild. Say
  which choice was made, and why, where the version constant lives.
- **Migration is tested with fixtures** captured from real shipped
  versions, not from the current writer. A round-trip through today's
  code proves nothing about yesterday's data.
- **Storage identity is explicit and namespaced** (§35.6). Where the
  platform keys storage by origin or container, a change to that key
  orphans every existing save — so shells that serve the build from a
  private scheme or a new origin must keep the key stable deliberately,
  and any move is a migration, not an accident.
- **Parallel deployments must not share storage** (§11.4.8): a preview
  build and the production build with the same identity will fight over
  the same saves and corrupt both.
- **Cloud sync, where a platform provides it, resolves conflicts
  explicitly** and never by "last writer wins" on a whole profile. Tell
  the player when their progress was replaced.
- **State the compatibility promise** in the release process: which save
  versions a release can read, and what a breaking change to save data
  obliges (a migration, a warning, a major version bump — §8.3).

## 37. Game bootstrap checklist

Use this checklist in addition to §22. Every box should be checked
before the first public release.

```
Shape (§23)
[ ] Simulation core is framework-free and runs headless        (§23.1)
[ ] Presentation shell holds no rules; depends on the core     (§23.2)
[ ] Content, tooling and shells are separate roles             (§23.3–23.6)
[ ] Import-graph test enforces the dependency direction        (§23.7)
[ ] Rule suite passes with all shipped content deleted         (§23.8)
[ ] Startup-path budget named and gated in CI                  (§23.9)

Content (§24)
[ ] Every catalog authored as data, referenced by id           (§24.1)
[ ] One schema module per catalog; cross-references validated  (§24.2)
[ ] Generated output gitignored; never hand-edited             (§24.3)
[ ] Round-trip guards per catalog; snapshot guards for
    committed artifacts                                        (§24.4)
[ ] One ordered pipeline, one entry point per invocation       (§24.5)

Determinism (§25)
[ ] All simulation randomness from a seeded, run-owned source  (§25.1)
[ ] Fixed simulation timestep; deterministic iteration order   (§25.1)
[ ] No presentation draw consumes the simulation's randomness  (§25.2)
[ ] Run-to-run equality test in CI; stored digest recommended  (§25.3)
[ ] Pre-run setup expressed as run parameters                  (§25.4)

Rules, mods and interface (§26–§28)
[ ] Scripted hooks are formulas, sandboxed and bounded         (§26.1–26.2)
[ ] Compiled fallback pinned to the script by a parity test    (§26.3)
[ ] One registration seam shared by mods and test fixtures     (§27.1)
[ ] Mod boundary documented; mod content schema-validated      (§27.1–27.2)
[ ] Published mod catalog committed and drift-tested           (§27.4)
[ ] Interface authored as content with a schema and stable ids (§28)

Assets, story, names (§29–§31)
[ ] Every derived asset generated from a single source         (§29.1)
[ ] Shared style definition, versioned with any prompts        (§29.2, §13.2)
[ ] Audio routing key derived from one definition, tested      (§29.3)
[ ] Cues rate-limited in the funnel, out of the event stream   (§29.3)
[ ] Store/marketing images generated from the real build       (§29.4)
[ ] Three narrative tiers exist; changes flow downward         (§30)
[ ] Naming rules written down; four identity carriers checked  (§31)

Measurement (§32)
[ ] Headless simulator: scenario, progression, seed, A/B,
    verdict, no-rebuild tuning                                 (§32.2)
[ ] Automated player is deterministic, content-tuned, and
    limited to what a player can perceive                      (§32.3)
[ ] Playtest command drives the real build and captures it     (§32.4)
[ ] Simulation benchmark with recorded baselines               (§32.5)
[ ] Scenario staging for exact situations                      (§32.6)

Platforms, sessions, players (§33–§36)
[ ] Shells add reach, not rules; only the transport differs    (§33.1–33.2)
[ ] Each shell has its own build, tests and release doc        (§33.3)
[ ] Store metadata generated, committed and drift-tested       (§33.5)
[ ] Sessions simulate authoritatively; one client impl         (§34.1–34.2)
[ ] Commands allow-listed, versioned, actor from admission     (§34.3)
[ ] Adverse-network soak with headless clients                 (§34.6)
[ ] Reference device and frame-rate target measured            (§35.1)
[ ] Reference viewport defined; interface reviewed from
    captures at every target size                              (§35.2)
[ ] Automatic choices limited to what the player perceives     (§35.3)
[ ] Reduced motion, non-colour-only state, input coverage      (§35.4)
[ ] Mature content behind one gate, checked where decided      (§35.5)
[ ] One identity manifest; nothing hard-codes the name         (§35.6)
[ ] Saves versioned, migrated, and tested from real fixtures   (§36)
[ ] Deployment slots do not share save identity                (§36, §11.4.8)

Process (§8.5, §21.9)
[ ] Player-visible change fragments enforced in CI             (§8.5)
[ ] A craft skill per authoring discipline, with a loop, a
    quality bar and its traps                                  (§21.9)
[ ] Sessions feed lessons back into the skill they used        (§21.9)
[ ] sync-game-spec skill walks this document offline           (§21.5)
```

A repository that satisfies both checklists has a game that can be
measured, modded, ported, re-skinned and handed to its sequel — and an
open source project that can accept a contribution to any of it.
