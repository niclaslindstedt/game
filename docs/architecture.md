# Architecture

## The shape of the project

This is a **webapp-kind** project per OSS_SPEC §11.4: the deployed website
_is_ the game. There is no marketing site — every build artifact is the
playable app.

Two layers with a one-way dependency:

```
website/  (the app: Vite + React PWA shell, rendering, deploy concerns)
   │  imports via @game/core
   ▼
src/      (the engine: framework-free TypeScript game logic)
```

### `src/` — the engine

Pure TypeScript with no React and no build-tool coupling. This is where the
gameplay systems will live as they are built:

- the fixed-timestep simulation loop,
- pointer/touch steering (hold to move, release to stop),
- the autonomous combat model — the character acts according to the weapons
  and items it has picked up,
- enemy waves, spawning, and scroll progression.

Today it contains the public entry point (`src/index.ts`), the embedded
version constant (`src/version.ts`), and the central output module
(`src/output.ts`, OSS_SPEC §19.4) through which all diagnostic output flows:
semantic helpers (`status`/`warn`/`info`/`header`/`error`/`debug`), an
always-on in-memory log buffer (`recentLogs()`), and a debug switch
(`?debug` URL param or `setDebugEnabled`). Raw `console.*` calls outside
this module fail lint.

### `website/` — the app

A Vite + React 19 shell that mounts the engine and owns everything
deploy-shaped:

- **`website/src/App.tsx`** — currently the title screen; the game canvas
  will mount here.
- **`website/pwa-plugin.ts`** — emits the service worker, `version.json`,
  and `precache-manifest.json` at build time (the pattern is borrowed from
  the oss-framework demo). The worker precaches the app shell, parks new
  builds in `waiting`, and only takes over when the player accepts the
  update toast — a mid-run silent refresh would destroy the run.
- **`website/src/app/pwa.ts`** — the per-slot precache cache id shared by
  the plugin (Node side) and the app (browser side).
- **`website/scripts/`** — source-data extraction (§11.2), SEO generation
  (sitemap/robots/llms/404, §11.3), and the structural SEO checker
  (§11.3.10).

The app consumes
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
for local-first PWA plumbing (today: `usePwaUpdate` + `UpdateToast`; more as
the game grows). Game-agnostic code is kept in the dedicated `src/lib/` and
`website/src/lib/` areas so it can be extracted into the framework for reuse
in later games once it has matured through playtesting — see `AGENTS.md` for
the policy.

## Deployment topology

GitHub Pages serves three deploy slots on one origin (OSS_SPEC §11.5),
assembled by a single `pages.yml` run into one artifact:

| Slot       | URL              | Source                                                                                     | Indexed        |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Production | `/game/`         | Highest `v*` tag (or `main` before the first release)                                      | Yes            |
| Staging    | `/game/preview/` | `main` HEAD, every push                                                                    | No (`noindex`) |
| Branch     | `/game/branch/`  | Last branch parked via `workflow_dispatch`, persisted in the `branch-deploy` orphan branch | No (`noindex`) |

Each slot is built separately with its own `VITE_BASE`, gets its own service
worker scoped to its base, and a disjoint precache id (`game`,
`game-preview`, `game-branch`) so the builds never poison each other. The
production worker's scope covers the nested slots, so it carries a
navigation denylist and refuses to answer their navigations.

Releases: a maintainer dispatches `version-bump.yml`, which computes the
next semver from conventional commits and pushes a `v*` tag using
`RELEASE_TOKEN`. That tag push fires `release.yml`, which regenerates
`CHANGELOG.md`, rewrites every version string
(`scripts/update-versions.sh`), commits to `main`, force-moves the tag to
the release commit, runs the build + tests, publishes a GitHub Release, and
chains into `pages.yml` so the new tag is live at `/game/` immediately.

## Design decisions

- **Engine/app split** — gameplay logic stays renderer-agnostic so it can be
  unit-tested in Node without a DOM, and so a future renderer change (canvas
  → WebGL/WebGPU) never touches game rules.
- **Hand-rolled service worker over Workbox** — the framework's
  `usePwaUpdate` needs three emitted files and one cache-naming convention;
  emitting them from a small Vite plugin is cheaper than adopting the
  Workbox toolchain, and the update flow stays fully inspectable.
- **No gameplay before structure** — this scaffold intentionally ships zero
  game code. The first gameplay PRs should land systems in `src/` with tests
  alongside, and mount rendering in `website/src/App.tsx`.
