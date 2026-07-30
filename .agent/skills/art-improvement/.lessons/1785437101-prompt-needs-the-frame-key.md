---
title: `sprite-author.mjs prompt` needs the exact frame key for an animated sprite
date: 2026-07-30
---

`node scripts/sprite-author.mjs prompt <base>` errors with *no base sprite
"<base>"* for anything that ships walk frames — the authored files are
`<base>_0.yaml` / `<base>_1.yaml` and there is no `<base>.yaml` to read the
`description`/`subject` from. Ask for `<base>_0`. (Props with a single grid —
`rocket`, `crate`, `conveyor`, `server` — take the bare name.) Same for
`verify`. Don't read the error as "this sprite has no acceptance target" and
skip Phase 4 step 1; it has one, under the frame key.
