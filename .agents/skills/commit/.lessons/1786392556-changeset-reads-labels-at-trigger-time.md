---
title: The `changeset` job reads labels from the EVENT PAYLOAD, so `no-changelog` applied after the PR opens arrives too late for that run
date: 2026-08-10
scope: .github/workflows/ci.yml, scripts/release/check-changeset.mjs, scripts/commit-pr.mjs
concepts: [quality-gates, ci, changeset, pull-request, false-red]
---

`ci.yml` hands the changeset gate `LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}`
— a SNAPSHOT taken when the event fired, not a live read. A PR opened with no
labels therefore runs `check-changeset.mjs` with `LABELS=[]`, and any PR whose
honest answer is the label rather than a fragment goes red on `changeset`
immediately, before there is any opportunity to label it.

This bites hardest on the API path, which is what a remote session has:
`mcp__github__create_pull_request` takes NO `labels` argument, and neither does
`scripts/commit-pr.mjs` — so both open the PR bare and the first run is doomed.
`gh pr create --label no-changelog` is the only entry point that gets it right
in one call.

Labelling afterwards is not wasted — it retriggers the workflow on the
`labeled` event, and that later run's `changeset` passes and supersedes the
failed one for branch protection. But the red X stays visible on the superseded
run, `rerun_failed_jobs` is refused with `403 This workflow is already running`
while its siblings finish, and a reviewer sees a failure that means nothing.
When the label could not be set at creation time, the clean fix is to push the
next commit (a lesson fragment, a review fix) and let the fresh head SHA retire
the whole first suite.
