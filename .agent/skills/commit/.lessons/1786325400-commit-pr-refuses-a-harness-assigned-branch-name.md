---
title: `scripts/commit-pr.mjs` refuses a harness-assigned branch name — use the manual fallback rather than renaming the branch
date: 2026-08-08
scope: scripts/commit-pr.mjs, .github/workflows/
concepts: [commit, pr, branch-naming, remote-session]
---

`--branch` is validated against `type/short-description`, where `type` is one of
the conventional-commit types. A remote session is handed its branch by the
harness — `claude/<topic>-<id>` — and `claude` is not a type, so the preferred
one-command path dies before touching Git:

```
error: --branch must look like feat/short-description using lowercase kebab-case
```

The designated branch is not negotiable ("NEVER push to a different branch
without explicit permission"), so the answer is the skill's manual fallback —
`git add <paths>`, `git commit`, `git push -u origin <branch>`, then
`create_pull_request` — and NOT renaming the branch to satisfy the validator.
Reach for the fallback as soon as the branch name starts with anything the
validator will not accept, instead of discovering it at the commit.

Two things the fallback does not do for you, both easy to drop:

- The PR body still comes from `.github/PULL_REQUEST_TEMPLATE.md`.
- Every GitHub post owes the Claude Code attribution footer; `commit-pr.mjs`
  appends it, `create_pull_request` does not.

## Renaming a workflow file costs its run history

Separate from the above, and worth saying in the PR body when it applies: GitHub
keys a workflow's Actions history by FILE PATH, not by `name:`. Changing only
`name:` renames the sidebar entry retroactively and keeps every past run;
renaming the file starts a fresh entry and leaves the old runs filed under the
old one. Do the file rename anyway when the stem has drifted from the name —
this repo's convention is that they match — but do it knowing that is the price,
and check `paths:` filters and `concurrency.group` for the workflow's own name,
which are the two self-references that travel with the file.
