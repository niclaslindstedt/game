# Configuration

## In-game settings

The main menu's **SETTINGS** screen holds the player-facing configuration,
persisted on-device in `localStorage` under `<storagePrefix>:settings`
(`website/src/game/settings.ts`). The `<storagePrefix>` is the `storagePrefix`
field of the identity config (`game.config.json`) — this game ships it as its
own namespace, and a sequel changes it there once:

| Setting                    | Values                                                      | Default                                                     |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Controls → Mouse           | follow cursor / hold to steer                               | follow cursor on fine pointers, hold on touch-first devices |
| Controls → Keys            | WASD move / mouse only                                      | WASD move on fine pointers, off on touch-first devices      |
| Controls → Powerups (use)  | use on pickup / use manually (tap a slot, click, E, or 1-3) | manual everywhere                                           |
| Controls → Powerups (side) | lower left / lower right                                    | lower left                                                  |
| Music volume               | 0–100% in quarter steps                                     | 80%                                                         |
| Sound FX volume            | 0–100% in quarter steps                                     | 100%                                                        |

Desktop keyboard controls (when **Keys** is set to WASD): WASD or the arrow
keys run, **Shift** walks, **Space** jumps, **1/2/3** fire the powerup dock
slots, **Q** opens the weapon switcher (then **1-4** equip a weapon), **E**
spends the oldest powerup, **I** toggles the bag, and **P** pauses the run
(and its music). The run also auto-pauses when the tab or app loses focus;
clicking the screen or pressing **P** again resumes.

Story progress is persisted the same way (`website/src/game/progress.ts`):
cleared levels are recorded under `<storagePrefix>:completed-levels` (keyed
per difficulty). Until the whole campaign is cleared at a difficulty, choosing
that difficulty drops you straight into the next unbeaten level (the story
runs in order); clearing the last level opens the menu's level-select screen
as a replay picker and lights up NEXT LEVEL on the victory splash. Every
finished run is banked per difficulty under `<storagePrefix>:highscores` with
its survival time, kills, and a full end-of-run session snapshot
(`website/src/game/highscores.ts`); the end-of-run screen shows that
difficulty's best survival time, and the menu's HIGH SCORES board ranks the
runs and opens any banked run into a full-session detail card. Cutscenes
always play at the start of a run (dismiss with the top-right SKIP button).
Clearing site data resets all of it; the `?cutscene=<id>` workbench replays
any scene regardless, and `?level=<id>` reaches any level regardless of
unlock state.

Everything else configurable concerns the build and the development
environment.

## Environment variables

| Variable     | Read by                                        | Effect                                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT` | `.npmrc` (every npm command), all CI workflows | Auth token for GitHub Packages — required to install `@niclaslindstedt/oss-framework`. Needs the `read:packages` scope. CI prefers the `GITHUB_PAT` secret and falls back to the workflow token.                                                        |
| `VITE_BASE`  | `website/vite.config.ts`                       | The deploy-slot base path: `/` (production), `/preview/` (staging), `/branch/` (branch slot). Defaults to `/` for local dev and the CI quality gates. Drives asset URLs, the service-worker scope, the per-slot robots meta, and the precache cache id. |
| `GITHUB_SHA` | `website/vite.config.ts`                       | Stamps the build label shown in the update toast and title screen; falls back to `git rev-parse` / a timestamp locally.                                                                                                                                 |

## URL parameters

| Parameter         | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug`          | Enables debug-level console output (`src/output.ts`, OSS_SPEC §19.3). All levels are always captured in the in-memory buffer regardless; the flag only controls console verbosity. Additionally exposes the live engine state as `window.__game` (`website/src/game/GameScreen.tsx`) so DevTools and the playtest harness (`website/scripts/playtest.mjs`) can inspect real runs.                                                                                                                                                                                                                                                                                       |
| `?bot=<strategy>` | Hands the run to the engine autopilot (`src/game/bot.ts`): the bot skips any prelude cutscene, dismisses the intro, steers, jumps, and spends level-up points itself. Strategies: `idle`, `rush`, `kite`, `boss`, `survivor`. Unknown names are ignored (normal input applies). Used by the playtest harness (usually combined with `?debug`) and the seed for an AI-controlled second player.                                                                                                                                                                                                                                                                          |
| `?level=<id>`     | Dev override that starts runs on a specific catalog level (`src/game/defs/levels/` — this game's ids: `spacez_hq`, `moon`, `mars`) instead of the level picked in the menu's level-select screen. It bypasses the campaign unlock gate, so it reaches any level regardless of saved progress. A mid-campaign jump with no banked loadout starts with the engine's derived stand-in (`deriveArrivalLoadout`) — roughly what clearing the earlier levels would have banked — so testing later levels stays realistic. Unknown ids are ignored (the menu selection applies). Normal play uses the level-select screen; `?level=` is for testing a specific level directly. |
| `?seed=<n>`       | Pins the run's layout seed (a positive integer) so retries and bug reports lay the level out identically. Absent or invalid, the seed derives from the clock. See the debug-game skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `?cutscene=<id>`  | Opens the cutscene workbench instead of the game: plays one scene from the catalog (`src/game/defs/cutscenes.ts`) with TAP/SKIP/REPLAY controls, for iterating on scene authoring. With `?debug`, exposes the live scene as `window.__cutscene` for the preview harness (`website/scripts/cutscene-preview.mjs`).                                                                                                                                                                                                                                                                                                                                                       |

## Gameplay tuning

All balance knobs — level size, player/enemy speed and hp, weapon cooldown
and range, item heals, spawn counts — live in one file:
[`src/game/config.ts`](../src/game/config.ts). They are compile-time
constants by design; tuning happens by editing that file and playtesting
(see the `playtest` skill). The difficulty ladder's multipliers live in
[`src/game/defs/difficulties.ts`](../src/game/defs/difficulties.ts) —
MEDIUM is the exact 1.0 baseline the levels are tuned at.

## Repository pins

| File                          | Pins                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`                      | Node 24 — both local (`nvm use`) and every CI workflow (`node-version-file`) resolve this single file (§10.5). |
| `package.json` `engines.node` | `>=24`, so npm warns on a stale local Node.                                                                    |

## Release configuration

| Secret       | Used by                                   | Purpose                                                                   |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| `GITHUB_PAT` | ci/pages/release/seo/lighthouse workflows | GitHub Packages reads (optional — workflows fall back to `github.token`). |

No `RELEASE_TOKEN` is needed: `release.yml` is dispatched manually and
chains into `pages.yml` via `workflow_call` inside the same run, so the
default `GITHUB_TOKEN` suffices end to end.
