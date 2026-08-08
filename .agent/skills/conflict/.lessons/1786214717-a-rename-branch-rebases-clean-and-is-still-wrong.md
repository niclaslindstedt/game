---
title: A rename branch rebases CLEAN and is still wrong — the new base's additions keep the OLD path, and git raises no conflict about it
date: 2026-08-08
concepts: [rebase, rename, false-green, drift, sweep]
---

Rebasing the `src/` → `engine/` rename onto three new `main` commits reported
"Successfully rebased" with zero conflicts, and `make lint` / `make test` /
`make build` were all green on the result. It was still incomplete.

A rebase replays YOUR commit onto the new base. Your commit says "rename these
N files and rewrite these path strings" — it says nothing about files the base
ADDED, so anything `main` landed under the old path stays there, and any NEW
path string `main` wrote (`scope: src/game/drive/` in two lesson fragments that
arrived with those commits) keeps naming a directory that no longer exists.
Git has no conflict to raise: nobody edited the same lines.

So after rebasing a rename branch, re-run the ORIGINAL sweep's detection over
the merged tree rather than trusting the clean rebase:

```sh
git ls-files <old-path>/           # must be empty — files the base added there
rg --pcre2 '(?<![\w./-])<old>/'    # path strings the base introduced
node scripts/skill-lessons.mjs --check   # lesson `scope:` naming the old path
```

The third caught two fragments here; the first two were clean. Also verify the
base's work SURVIVED rather than being reverted by the rename: for each file
the base touched under the old path, `git diff origin/main:<old> HEAD:<new>`
should show only your own substitutions, and files with no substitution in them
should show nothing at all.
