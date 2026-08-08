---
title: A workflow `run:` block is exercised by NO local check — extract it from the YAML and execute it
date: 2026-08-08
scope: .github/workflows/
concepts: [ci, workflow, quality-gates, deploy-slots, pages]
---

Nothing in the fast column reads inside a `run:` block. `make fmt-check` sees
YAML, `make lint` never opens `.github/`, and `make actionlint` fails outright
in a remote session because no binary is installed — fetch one first, which the
agent proxy does allow:
`bash <(curl -sSf https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)`,
then run `./actionlint`. Even when actionlint DOES run it only
shellchecks the shell — a `jq` program sitting inside a single-quoted argument
is an opaque string to it.

That gap shipped `#1024`, whose matrix-planning step wrote
`{ include: […] + (…) }`. An object value in jq is an `ExpD` — a term,
optionally piped — so `+` is a compile error, not a value. The `resolve` job
died on every push for twelve commits; because it is the job that plans the
matrix, `build`/`assemble`/`deploy` never started and the site silently stopped
publishing while `main` moved on. A red workflow nobody watches is invisible in
a way a red PR check is not.

So when a commit touches a workflow, RUN the step. Parse the YAML and execute
the body under the shell the runner uses, with the step's `env` supplied — for
each branch of its inputs, not just the happy one:

```sh
node -e "const {parse}=require('yaml'),fs=require('fs');
  const wf=parse(fs.readFileSync('.github/workflows/pages.yml','utf8'));
  fs.writeFileSync('/tmp/step.sh',
    wf.jobs.resolve.steps.find(s=>s.name==='Plan the slots').run)"
ROOT_REF=v1.0.0 BRANCH_REF= SHA=deadbeef GITHUB_OUTPUT=/tmp/gho bash -e /tmp/step.sh
```

Extracting rather than retyping is the point: a retyped copy is a different
program, and it is the one that passes.

Second half of the same lesson: when a workflow change moves a job onto its own
runner, whatever that job now does for the first time is also unchecked. `#1024`
gave the root slot its own runner and therefore its own `npm ci` against the
RELEASE TAG's lockfile — a path that had never run anywhere. Verify it the only
way that means anything, in a throwaway worktree:
`git worktree add <tmp> v1.0.0 && npm ci && VITE_BASE=/ npm run build --workspace pwa`.
