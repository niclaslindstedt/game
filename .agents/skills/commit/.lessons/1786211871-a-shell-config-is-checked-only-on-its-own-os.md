---
title: A shell's config is checked only on the OS it is FOR — `make lint`/`make test` on Linux prove nothing about the macOS branch
date: 2026-08-08
scope: tauri/src-tauri, electron, native, .github/workflows
concepts: [quality-gates, ci, shells, packaging, false-green]
---

The root gates (`make fmt-check`, `make lint`, `make test`, `make build`) do
not reach the desktop shells' own toolchains at all, and the shell gates that
do (`make tauri-test`, `make tauri-lint`) still only exercise the branches
their runner's OS takes. `tauri-build` resolves `bundle.macOS.frameworks` at
COMPILE time and **only** when the target triple contains `darwin`, so a
release-profile path written into `tauri.conf.json` passed every check in the
repo and every job in `tauri-build.yml` (ubuntu) while breaking `npm run tauri`
and `npm run tauri:lint` on every macOS checkout that had not already made a
release build.

So when a change touches a shell's manifest, ask which OS reads the field
before trusting a green run, and put the guard somewhere OS-independent: a
plain vitest in `tests/content/` reading the JSON runs everywhere, which is
what `tests/content/tauri_config_test.ts` now does.
