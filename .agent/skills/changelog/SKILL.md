---
name: changelog
description: "Use when opening any PR, to settle the one call every PR owes: a changeset fragment under `.changes/unreleased/` when the change is something a player would notice, or the `no-changelog` label when it isn't. Covers the fragment format, the type-to-semver mapping, the skip-list traps, and the release-time constraints a missing or malformed fragment breaks."
---

# Changelog fragments

The changelog is never written at release time and never comes from commit
messages or PR titles. It is assembled from **one small file per change**,
dropped under `.changes/unreleased/` by the PR that makes the change. At
release time `release.yml` collates those files into a dated `CHANGELOG.md`
section, publishes it as the GitHub Release body, and — reading the same
front-matter — derives the semver bump.

## The one decision, and every PR makes it

**A PR gets exactly one of these. Never both, never neither.**

| The PR…                                  | Do this                        |
| ---------------------------------------- | ------------------------------ |
| changes something a player would notice  | add a fragment (below)         |
| changes nothing a player would notice    | label the PR **`no-changelog`** |

CI's `changeset` job (`scripts/release/check-changeset.mjs`) fails a PR that
does neither. It re-runs on `labeled`/`unlabeled`, so applying the label
clears a red check without a push.

"A player would notice" is the whole test. Not "is this file important" — a
rewrite of the entire renderer that changes nothing on screen is
`no-changelog`; a one-word change to a menu row is a fragment.

## Writing a fragment

```
.changes/unreleased/$(date +%s)-short-slug.md
```

```markdown
---
type: Added # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title # optional — bolded at the head of the bullet
breaking: true # optional — forces a major bump
---

One sentence a player can read.
```

- **One file per change, always a new one.** Never append to a fragment
  somebody else added. Separate files are the entire reason parallel PRs
  never conflict here; the `<unix-ts>-` prefix sorts lexically, which
  loosely tracks commit order.
- Front-matter is plain `key: value` lines, keys `[A-Za-z]+` only — no
  nesting, no quoting needed. A malformed line, an unknown `type`, or an
  empty body fails the release loudly (`scripts/release/fragments.mjs`).
- The bullet renders as `- **<title>** — <body>`. With no `title:` the body
  is the whole bullet.

### ONE SENTENCE — the rule that drifts

The `title:` is the scannable headline. The body is **one sentence saying
what changed for the player** — not a design note, not the rationale, not a
tour of the sub-features. The long-form explanation belongs in `docs/`.

This is the rule most worth holding, because nothing enforces it. Going into
the first release, 165 fragments had accumulated with the one-sentence rule
written in four places and checked in none: median body 320 characters, p90
1068, the longest 2536 across 18 sentences, and 96 of the 165 running to
multiple sentences. It held nowhere because it cost nothing to break.

```markdown
<!-- good -->

The hero's coat now soaks blood and dries off over the next minute.

<!-- bad: three sentences, implementation detail, no player in it -->

Blood on the hero is now tracked per-band in a Uint8 grid rather than a
particle list. Bands decay on a timer seeded from the wound. This also
fixes the memory growth on long runs.
```

## What each type buys

| `type`                                | Bump    |
| ------------------------------------- | ------- |
| `Added` `Changed` `Removed` `Deprecated` | minor   |
| `Fixed` `Security`                    | patch   |
| any type **+ `breaking: true`**       | major   |

The release takes the **highest** level across all fragments, so one
`breaking: true` makes the whole release a major.

**`Removed` alone is a minor.** A removal an older build cannot survive — a
break to a persisted shape, a save an update can't load — is `type: Removed`
**plus** `breaking: true`. Removing a feature is not by itself breaking.

## When `no-changelog` is the honest answer

Pure refactors, CI and build tweaks, comment and docs edits, test-only
changes, formatting. Apply the label to the PR; the job re-runs and passes.

A PR is also let through automatically when **every** changed file matches
the skip-list in `check-changeset.mjs`: `tests/`, `.github/`, `.agent/`,
`.claude/`, `.changes/`, `docs/`, `examples/`, `prompts/`, `scripts/`,
`pwa/scripts/`, the shells' `scripts|tests|store/`, `Makefile`, **any
`*.md`**, the dotfile configs, `eslint.config.js`, `vitest.config.ts`,
`pwa/vite.config.ts`, any `tsconfig*.json`, and `package-lock.json`.

**THE TRAP: `engine/` and `pwa/src/` are deliberately NOT skip-listed.** The
check reads paths, not diffs, so a comment-only or rename-only PR under
either still demands a fragment. That is the common false red. The answer is
the label — never a fragment invented for a change no player can see. (This
is not hypothetical: a PR that only rewrote stale header comments across 36
`lib/` modules went red on exactly this.)

## Constraints that bite at release time

1. **Never an empty set.** `collate-changelog.mjs` exits 1 on zero fragments
   ("Refusing to write an empty release") and takes `release.yml` down with
   it at the Collate step. A release with genuinely nothing to say still
   needs one fragment.
2. **The `## [Unreleased]` anchor must survive.** Collate splices each new
   section in under it and exits 1 when it is missing, so deleting it means
   no release can be cut at all. `tests/release_notes_test.ts` guards it.
3. **There is no dedupe.** Collate inserts under the anchor without checking
   what is already there, so re-releasing a version that already has a
   section writes a second one above the first.
4. **Do not use `doc:`.** It renders `[Learn more](feature:<slug>)` — a URI
   scheme nothing in this repo resolves, pointing into a `docs/features/`
   directory that does not exist. It is a dead link in both `CHANGELOG.md`
   and the GitHub Release.
5. **Mind the doubled dash.** With a `title:`, the renderer already supplies
   ` — `; a body that opens with its own dash-led clause ("First release —
   an offline…") reads as `**Title** — First release — an offline…`.
6. **125,000 characters** is the GitHub Release body limit. A longer section
   is truncated at a line boundary with a pointer to the full changelog on
   the tag (`capBody` in `extract-section.mjs`) — the CHANGELOG itself keeps
   everything.
7. **Collating CONSUMES the fragments** — it deletes every file it read. The
   local preview is therefore destructive.

## Verify before you push

```sh
make bump                       # the bump these fragments derive
make changelog VERSION=X.Y.Z    # preview the section — DESTRUCTIVE
git checkout -- CHANGELOG.md .changes/   # …so always revert it
```

`make bump` prints one line per fragment (`<file>: <type> → <level>`) and the
resolved bump, which is the fastest way to catch a `type` that implies more
or less than you meant.

## What the release does with them

`release.yml` is manual dispatch. `bump: auto` (the default) takes the
derived bump; an explicit `patch`/`minor`/`major` overrides it. It then
collates the fragments into `CHANGELOG.md`, rewrites every version string via
`scripts/update-versions.sh`, commits, tags `vX.Y.Z`, publishes the Release
with the new section as its body, and chains into `pages.yml` so the tag is
served at `/`.

**The next version is computed from the highest existing `v*` tag**, not from
`package.json` — and from `0.0.0` when no tag exists. So the bump the
fragments derive only tells you the *step*, never the destination.
