---
title: On a `no-changelog` PR the FIRST changeset run always fails — the `labeled` re-run is the verdict
date: 2026-08-08
scope: .github/workflows, scripts/release/check-changeset.mjs
concepts: [no-changelog, ci, changeset, labels, false-red]
---

A PR that settles its changelog call with the `no-changelog` label goes red on
`changeset` exactly once, every single time, and it is not a failure. The
sequence is forced by the tooling: opening a PR starts CI immediately, and
neither `gh pr create` nor the `create_pull_request` MCP tool takes labels — so
the label can only be applied afterwards, and the first `changeset` run
genuinely sees a PR with no fragment and no label. Applying the label fires the
`labeled` re-run, which passes.

**The webhook only ever reports the first run**, so the notification says
"changeset: failure" and points at the run that is already superseded. Read the
check runs for the head SHA before investigating: there will be two `changeset`
jobs in two workflow runs on the same commit, and the newer one is the answer.
`mcp__github__pull_request_read` with `method: get_check_runs` shows both.

Nothing to fix when this happens — no push, no comment, no re-run to trigger.
It cost two rounds of investigation across #1031 and #1032 before it was
recognised as structural rather than a flake.
