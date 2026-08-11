---
title: A remote session's working copy is CACHED and reused, not re-cloned — so a gitignored directory survives the rename that retired it, forever
date: 2026-08-09
concepts: [build-artifacts, drift, quality-gates, false-green]
---

"This is a fresh clone, so an ignored directory cannot be here" is FALSE in a
Claude-Code-on-the-web container. `git reflog --date=iso` is the proof and the
first thing to run: a container that reports its checkout minutes ago will show
an ENTRY FROM DAYS EARLIER at an older commit — the workspace is snapshotted and
fast-forwarded, not cloned. `stat -c '%y'` agrees: tracked files carry today's
checkout time, the stale ignored ones carry the day the snapshot was built.

That is the whole reason retired `src/generated/` "keeps coming back" after the
root tree was renamed src/ -> engine/ (#1046). Nothing writes there — proven by
deleting it and running the full `npm run assets` chain, which recreates only
`engine/generated/` and `pwa/src/generated/` — but git cannot delete an IGNORED
directory across the checkout that moves past the rename, and the cached
workspace carries it into every resumed session. The three ignore entries
(`.gitignore`, `.prettierignore`, `eslint.config.js`) only SUPPRESS it; they
never remove it.

So a retired build-output path needs a FOURTH thing beyond the three ignore
lists: something that actually prunes it on a cached workspace. `make clean`
does it on demand; `.claude/hooks/session-start.sh` now does it every remote
session. When investigating any "generated file that should not exist", check
the reflog before hunting for a generator — the answer is often that nothing
created it recently at all.
