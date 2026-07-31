# Agent guidance for game

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`,
`.aider.conf.md`, and `.github/copilot-instructions.md` are symlinks to this
file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo; its version is recorded in
the YAML front matter at the top of the file.

Run `oss-spec validate .` to verify conformance. When in doubt about a layout,
naming, or workflow decision, consult the relevant section of `OSS_SPEC.md` —
it is the source of truth for the conventions this repo follows.

## Leave the tree cleaner than you found it

- **Fix every error and warning you encounter, even ones you didn't cause.**
  A `make lint` / `make test` / typecheck run that surfaces a pre-existing
  error or warning (a generator's `!` warning included) is part of your job:
  fix it in the same session rather than working around it or reporting it as
  "not mine". The repo's baseline is zero errors and zero warnings — anything
  above zero hides the next real regression.
- **Fix inefficient algorithms on sight.** If, while doing any task, you spot
  code with a needlessly bad complexity or a hot-path pattern that clearly
  wastes work (an O(n²) scan a hash/grid would collapse, per-call
  recomputation of an invariant, per-frame allocation in a loop that runs at
  60 Hz), fix it — even when it's unrelated to what you were asked to do.
  Keep such fixes behavior-preserving, verify with the relevant tests or a
  quick benchmark, and mention them in the PR description.

## Build and test commands

```sh
make build         # developer build
make test          # full test suite
make lint          # zero-warning linter
make fmt           # format in place
make fmt-check     # verify formatting (CI)
make assets        # regenerate in-game pixel assets + previews
make sim-bench     # benchmark the headless simulator (best-of-N, digest-checked)
make bump          # print the release bump derived from .changes/unreleased/
make changelog VERSION=X.Y.Z  # preview a release's CHANGELOG section
```

**VERIFY WITH `make test` (or `npm run test`) — NEVER with a bare
`npx vitest run`.** They are not the same check, and the difference passes
locally and fails in CI. `npm run test` fires the `pretest` hook, which rebuilds
the generated content and the sprite atlas first; `npx vitest run` skips it and
tests whatever happens to be on disk. Several COMMITTED artifacts here are
drift-tested against a fresh build — `mod/catalog.json`,
`native/store/game-center-achievements.json`,
`native/store/game-center-leaderboards.json`,
`electron/store/steam-achievements.json` — so a stale artifact compared against
an equally stale build MATCHES, and the suite goes green over exactly the drift
the test exists to catch. (This is not hypothetical: a merge brought in sprites
from other PRs, `mod/catalog.json` was regenerated after `npm run levels` —
which deliberately does not run `generate-assets.mjs` — and `npx vitest run`
happily agreed with itself while CI failed.) The same applies to `make lint`,
whose `prelint` hook does the same rebuild.

The native wrapper in `native/` is **not** part of the npm workspace, so the root
package.json forwards to it with `npm --prefix native`:

```sh
npm run dev                 # website dev server (http://localhost:5173)
npm run native:install      # install native/ dependencies (its own tree)
npm run native:bundle       # build the site + pack it into native/assets/webroot.zip
npm run native:ios          # build & run the native app on an iOS simulator
npm run native:ios:device   # Release build on a USB iPhone (standalone, no Metro)
npm run ios:debug           # Debug build on a USB iPhone (JS from Metro over USB)
npm run native:android      # build & run on an Android emulator/device
npm run native              # just the Expo dev server (native/ already installed)
```

The desktop/Steam shell in `electron/` is likewise outside the workspace, with
its own tree, its own `tsc` and its own vitest (the root suite stops at its
edge — `npm run electron:test` is the only thing that runs it locally, and
`.github/workflows/desktop-build.yml` the only thing that runs it in CI):

```sh
npm run server:build        # compile the engine for Node into electron/server-dist/
npm run electron:install    # install electron/ dependencies (its own tree)
npm run electron:bundle     # build the site + copy it into electron/webroot/
npm run electron            # compile the shell and launch it
npm run electron:test       # the shell's own unit tests
npm run electron:dist       # package a developer build for this platform
```

Shipping to Steam is `electron/RELEASING.md` — the store records, the asset
dimensions, signing, and `npm run steam:upload` (from `electron/`), which is
also the preflight checklist: it refuses to upload and names what is missing.
Note `release:*` vs `dist:*` — the former strips the developer tooling out of
the embedded site and is the ONLY correct one for a store build.

The `native:ios*` scripts run `expo prebuild --platform ios` first, so a change to
`native/app.config.js` (orientation, Info.plist keys, plugins) always re-syncs into
the gitignored native project instead of shipping a stale one.

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.
- **Do not babysit PRs — but do fix what breaks.** Once a PR is opened, write
  out its URL and a short summary of what was done, then stop. Don't
  proactively subscribe to PR activity, poll CI, or schedule check-ins, and
  leave code review and the merge decision to a human.
  - **Never call the PR-activity subscription tools** — in particular don't
    `unsubscribe_pr_activity`. If the harness auto-subscribes the session,
    leave the subscription alone: every such tool call burns tokens and delays
    the human review that is the whole point of opening the PR.
  - **Act on the events that subscription delivers when they're actionable:**
    if a CI failure or a merge conflict arrives for the PR and you can fix it,
    push the fix. Leave everything else (review comments, questions, style
    nits) to the human — don't auto-push follow-up fixes for those. Only
    otherwise return to a PR when explicitly asked.

## Resolving merge conflicts — cut a backup branch FIRST

**Before starting a merge or a rebase that may conflict, park the branch:**

```sh
git branch -f backup/<branch-name>-premerge HEAD    # then merge
```

A conflicted working tree is the most fragile state a repo gets into, and the
commands that feel like "let me just look at something else for a second" —
`git stash`, `git checkout <ref> -- .`, `git reset`, adding a worktree — will
happily throw the resolution away, clear `MERGE_HEAD`, and leave no obvious way
back. With the backup branch in place the recovery is one line
(`git reset --hard backup/<branch-name>-premerge`) instead of an archaeology
session in the reflog; without it, any unpushed work in the merge is gone.

Delete the backup once the merge is committed, verified, and pushed — it is a
seatbelt, not a branch anybody should review.

Two rules that go with it, both learned the same way:

- **Never run an exploratory command against the working tree mid-conflict.**
  To see what another ref says, ask git directly (`git show <ref>:<path>`,
  `git diff <ref>`) — those read without touching a file. If a build genuinely
  has to run on another ref, `git worktree add` a SEPARATE directory, and do it
  before the merge starts, never during it.
- **Resolve, `git add`, and commit in one unbroken stretch.** Don't leave a
  conflicted tree parked across unrelated work.

## Changelog fragments

Every PR that changes something user-visible must add a changeset fragment
under `.changes/unreleased/` — CI's `changeset` job enforces it (label the
PR `no-changelog` to opt out for pure refactors/CI/docs changes; files in
`tests/`, `docs/`, `scripts/`, `.github/`, etc. are skip-listed anyway).

```
.changes/unreleased/$(date +%s)-short-slug.md

---
type: Added         # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title  # optional — bolded at the head of the changelog bullet
breaking: true      # optional — forces a major version bump
---

One-sentence user-facing summary.
```

At release time `release.yml` (manual dispatch) derives the semver bump
from the fragments (`breaking` → major, Added/Changed/Removed/Deprecated →
minor, Fixed/Security → patch), collates them into `CHANGELOG.md`, updates
every version string via `scripts/update-versions.sh`, tags, publishes a
GitHub Release, and deploys. Preview locally with `make bump` (shows the
derived bump) and `make changelog VERSION=X.Y.Z` (consumes fragments —
revert afterwards).

## Architecture summary

This is a **webapp-kind project (OSS_SPEC §11.4/§11.5): the deployed website
IS the game** — an offline top-down survival scroller shooter, steered by
holding pointer/touch, where the character acts autonomously according to
picked-up weapons and items.

**THE ENGINE HAS TWO ENTRY POINTS, and picking the wrong one is a silent
regression.** `@game/core` (`src/index.ts`) is the whole public API,
simulation included. `@game/menu` (`src/menu.ts`) is the narrow slice the app's
STARTUP path may reach: the catalogs (levels, difficulties, equipment), the
saved-hero math, and the engine flags the settings screen applies — and nothing
that simulates. **The app shell imports `@game/menu`; the game imports
`@game/core`.** Because an import is an import: the title menu wants a level's
NAME, and one module graph away sit `createGame`, the step pipeline, the
autopilot, the loot roller, the spawners and the enemy catalog. Tree-shaking
does not save you — it is global, so an export used by ANY chunk keeps its
bytes wherever its module was placed, and the module was on the startup path.
Both aliases resolve to the SAME modules (one definition of everything; nothing
duplicated in the bundle — `tests/content/menu_entry_test.ts` pins that), so
the split is purely about REACHABILITY. Two patterns keep it workable, and both
are the right move when a new one is needed: the engine's runtime toggles live
in the import-free leaf `src/game/flags.ts` (a settings screen must not import
the dialogue system to mute it), and the compiled content is emitted in
menu-facing and run-facing halves (`generated/level-index.ts` beside
`generated/levels.ts`; `generated/items.ts` beside `generated/uniques.ts`),
read through `defs/levels/summary.ts`. `pwa/scripts/check-seo.mjs` polices the
result as a **170 KB gzipped critical-path budget** — web.dev's
performance-budget figure for a ~5 s time-to-interactive on a slow 3G phone.
When it trips, find what reached back through `@game/core` (or make that screen
lazy); do NOT raise the number.

**THE WORLD PROJECTION — the simulation is square, the PICTURE is not.**
`pwa/src/game/render/tilt.ts` is the one leaf that decides how the flat
top-down world reaches the screen, and it has exactly two knobs. **PITCH** is
how far the camera looks DOWN: the ground plane foreshortens, so a step north
covers less screen than a step east and the floor rakes away from the eye
(shipped at 0.75, a ~41° lean). **YAW** is how far it stands round from
square-on — the half that turns a tiled floor into DIAMONDS, i.e. the thing
people mean by isometric; 45° with pitch 0.5 is Diablo's 2:1 floor. Both are
live sliders on DEVELOPER → VISUALS (persisted as `cameraPitch`/`cameraYaw`,
stripped from a store build like every developer setting), because the answer to
"how far down, how far round" is settled by dialling it on a real field, not by
rebuilding to look. **Yaw ships at 0**: front-facing structures whose sprites no
longer cover their axis-aligned collision boxes still read wrong under a turned
camera, and a proper isometric look needs that structural art redrawn as iso
pieces — which is an art project, not a render setting.

The whole thing rests on one split, and getting it backwards is the only way to
break it: **the FLOOR lies down and the BODIES stand up.** Anything painted on
the ground — the baked ground layer, blood, burn scars, craters, AoE footprints
— is drawn through the projection and takes it whole (a ground ring becoming an
ellipse IS the effect, which is why none of those passes has a line about the
tilt in it). Anything with a body — a character, a rock, a shot in flight, a
floating damage number — is anchored at its projected spot and then drawn
upright at FULL size through `billboard`, whose composite works out to exactly
the identity at a whole-pixel offset so the pixel art stays crisp. Billboarding
a pass is therefore a one-line wrap, never a rewrite of its arithmetic — which
is how the yaw knob was added later without touching a single draw pass.

**WHICH SIDE OF THAT SPLIT A PIECE OF FURNITURE FALLS ON IS THE ART'S CALL, NOT
THE PASS'S — `plane:` on the sprite.** A boulder and a house front are drawn in
elevation and have to stand; a wall panel, a painted lane marking, a hatch and a
crate seen from above are drawn in PLAN and have to lie. Standing plan-view art
up is loud: the panel comes out taller than the floor grid it is set into, and
under a yaw a straight run of them staircases diagonally across a floor whose
own seams run the other way. So `content/sprites/<family>/<id>.yaml` carries
`plane: upright | floor` (**upright is the default**, so a sprite that says
nothing keeps the look it has), the build emits the floor-plane names to
`assets/sprite-planes.json`, and `render/plane.ts` is the ONE place that acts on
it — read by the obstacles, the decor, the landmarks, the lair doors and the
elevator pads, never by an actor. A floor-plane sprite is **baked through the
projection once** (`flatSprite`) for exactly the reason the ground layer is:
transforming pixel art per frame re-picks which rows the nearest-neighbour
resample drops, and the wall boils as the camera pans.

**A DISTANCE ACROSS THE FLOOR IS NOT A DISTANCE ACROSS THE SCREEN —
`projectOffset`.** The billboarded EFFECTS layer projects its ANCHOR and draws
everything else at full size in screen px, which is right for a thing happening
in the AIR above a point (an explosion, a rising damage number, a muzzle flash)
and wrong for anything that measures ground: a blood drop's travel, a jump's
dust smear, a corpse punted along a bearing, the wedge of floor a swing sweeps.
Those go through `projectOffset`, so they stay over the marks they leave — a
spray whose drops flew along the screen while its own spatter landed on the
turned floor was the tell. A VERTICAL is the exception and stays a true screen
vertical: a drop's hop, a corpse's arc, dust drifting up. Beware the tempting
shortcut this replaced — a hardcoded `FLATTEN` squash faking the foreshortening,
which is wrong at every pitch but the one it was eyeballed at.

**A PUSH IS A SCREEN DIRECTION AND HAS TO BE CONVERTED LIKE ANY OTHER —
`screenDirToWorld`.** A destination goes through `toWorld`, but the controls that
STEER rather than point (the touch dpad, the stick, the WASD cluster) have no
destination to convert: they hand the simulation a direction. Passing the raw
screen vector is the bug the pointer would have had without the inverse — under
a yaw, down the screen is south AND west, so a hero told to walk "down" sets off
45° from where the player pushed. Only the BEARING comes from the projection; the
length is normalized away, because the caller's own magnitude is the PACE and the
foreshortening would otherwise make walking north slower than walking east.

**THE FOG IS COMPOSITED IN SCREEN SPACE, SO IT SNAPS TO A SCREEN PIXEL.** Its
Bayer stipple is a rigid lattice on its own buffer, so the buffer has to be
registered the way every other pass is: `fogGridAnchor` seats the camera on the
PROJECTED ground grid, rounded to a whole pixel, exactly as the ground blit does,
and the dither is indexed there. Snapping in WORLD units instead (what this did
before the projection existed, when the two were the same thing) leaves the fog
looking at a floor up to a whole world unit from the one under it — a
fractional, continuously-varying number of screen pixels once the floor is
foreshortened and turned. That misregistration is the crawl: the frontier band
slides against the ground and the stipple re-phases as the hero walks.

Three consequences to keep in mind. The ground layer is **baked already
projected** (`groundLayer`, keyed on the projection so a knob change re-bakes):
a nearest-neighbour resample picks which rows to drop from the destination
offset, so transforming per frame re-picks them every time the camera moves a
pixel and the floor visibly boils. **The hero is always at the middle of the
screen** — `computeCamera` no longer clamps the view to the level, because a
projected view is bigger than the canvas in world units and the old clamp bit on
nearly every map, sliding him off toward a corner; the letterbox showing past a
map edge is the cheaper price. And every screen↔world crossing OUTSIDE the
renderer goes through the viewport's `toWorld`/`toCss` pair (GameScreen), which
are functions rather than two scale factors because the projection is a matrix:
where the player is pointing, which foe the cursor aims at, whether a tap hit the
merchant, and where a floating DOM label pins itself all follow from that pair.

**HOW THE PICTURE IS PRESENTED — SETTINGS → VIDEO, and the split that decides
where each effect goes.** Four player-facing knobs (`render/postfx.ts`): BLOOM,
COLOR GRADE, VIGNETTE and DEPTH HAZE, each an amount whose 0 is a true off. They
are PLAYER settings, not developer ones — every one costs frames on a phone — so
they are deliberately absent from `stripDeveloperState` and ship in the store
build. **BLOOM ships at 0 and the other three ship on**, which is a judgement
rather than an oversight: on pixel art at this size every luminance point a halo
adds is a point of the artist's own shading it paints over, so the halo is
offered rather than assumed. Do not "restore" it to 1 because the field looks
unlit.

**AND ITS THRESHOLD IS MEASURED AGAINST THE GAME'S OWN FLOORS, NOT EYEBALLED.**
The bloom decides what counts as light with one luminance knee, and the thing
that makes that hard here is that the ground is not a minority of a frame, it IS
the frame — the moon's regolith (0.554) and GOODCO HQ's deck (0.701) are each the
50th AND the 90th percentile of their own picture, while the lights live in the
top half-percent. A knee below them classes the floor as a light and adds it back
over itself, which is haze rather than bloom: shipped that way once, it lifted
the whole picture's brightness 14–24% and the moon came out milky lavender.
`tests/content/bloom_threshold_test.ts` holds the knee above every ground tile
the campaign lays down, so a new pale floor says so instead of quietly starting
to glow. The other half of that pass is the DOWNSCALE, and it is the one place a
draw call cannot be saved: Canvas2D minification is a 2×2 bilinear tap with no
mipmap, so it is an honest box filter at exactly ×0.5 and an undersample at
anything smaller — a ×4 minify of a 4×4 with one white pixel returns 0 where the
average is 16. Reaching the quarter-size buffer in one step therefore drops
lights in and out as the camera pans a pixel at a time, and that pulsing IS the
flicker. Two halvings, always.

**THE CANVAS IS ~422×195 AND NEAREST-UPSCALED, AND THAT — NOT TASTE — DECIDES THE
MECHANISM.** The canvas is sized in WORLD units (`viewScaleFor`) and CSS blows it
up 2–3× with `image-rendering: pixelated`. So there are two places to put an
effect and they are not interchangeable. **ON THE CANVAS** is chunky, at world
resolution, in the same pixel grid as the art — where BLOOM belongs, because the
light it blooms is the game's own baked glow art (`glowSprite`, `beamSprite`, the
loot shafts, the muzzle flashes) living on that same grid; a bloom computed at
device resolution is smoother than the light casting it, which reads as a photo
filter over pixel art rather than as pixel art glowing. **IN CSS** is smooth, at
device resolution, and per-frame FREE — where the GRADE, the VIGNETTE and the
HAZE belong, because all three are broad low-frequency washes that on the canvas
would cost a full-frame composite every frame to come out in 2–3 px staircase
bands. The CSS half is three custom properties from `fxStyleVars` written on the
GAME SCREEN ROOT (not on the overlay — the grade is a `filter` on the canvas,
which is the overlay's SIBLING and would never inherit them), and the overlay
sits at `z-index: 0` directly after the canvas so every positioned HUD element
after it paints on top: the corners of the SCREEN going dark is atmosphere, the
corners of the HEALTH BAR going dark is a bug.

**THERE IS NO SHADER PASS, and that is a conclusion rather than a gap.** A WebGL
stage would have to own the whole present path — the world would move to an
offscreen target and the visible canvas would become the GL one, touching every
screen↔world crossing, the DOM overlay pinning, the screenshot tooling and the
gallery — and for these four effects it buys nothing: three are strictly better
in CSS and the fourth wants to be chunky. What a shader WOULD buy is CRT
curvature, chromatic aberration and a real 3D LUT. That is the day to write it.

**DEPTH OF FIELD IS THE ONE REQUEST TO REFUSE.** There is no depth to focus on —
the whole field is ONE ground plane and the hero is always at the middle of it —
so a distance blur would blur a mob standing beside him exactly as hard as one
the same distance north, and hide half the horde while it was at it. DEPTH HAZE
is the honest version: what reads as distance on a raked plane is losing contrast
toward the horizon. It is scaled by the live PITCH (`fxStyleVars`), because a
camera looking straight down has no horizon to fade toward.

**ANTI-ALIASING IS THE OTHER ONE, EXCEPT AT ONE PLACE.** The whole renderer is
built for crisp integer pixels — `imageSmoothingEnabled = false`, an INTEGER
`VIEW_SCALE × uiScale`, `billboard` composing to the identity at a whole-pixel
offset. The one place averaging is right is a PROJECTED BAKE, because it happens
once: `flatSprite` bakes at `BAKE_SUPERSAMPLE`× and box-averages down, so a wall
panel's turned edges come out antialiased instead of as a staircase of single
pixels, and at yaw 0 / pitch 1 it is a no-op by construction (a square-on sprite
downsampled from an integer upscale of itself is bit-identical). The GROUND LAYER
is deliberately NOT supersampled, for two independent reasons either of which
stands alone: the intermediate for a big map would be ~7200×3000 (~86 MB, and
larger maps walk into the browser's canvas cap), and it would look WORSE anyway —
a wall panel is a small outlined silhouette, but the floor is a texture covering
the whole screen, and averaging its rotation softens every speckle and seam at
once, which reads as the one surface in the game being out of focus. The
staircase on a yawed floor seam is the honest cost of turning pixel art; the fix
is iso-drawn tile art, not a filter.

**Mobile-first, landscape.** The reference device is a phone held
horizontally: a ~844×390 CSS viewport (≈422×260 world units at the app's
`VIEW_SCALE` of 2 and the shipped pitch — the projection makes the view taller
in world units than the canvas is in pixels). Design every element — HUD,
overlays, spawn distances, weapon ranges, anything sized against "the screen" —
to fit and feel right at that size. Run playtests and visual checks at this
viewport (the playtest harness defaults to it), not at a desktop size.

Large screens render the whole presentation at **2× the phone baseline** so
the phone-tuned HUD, text, and sprites stay legible instead of shrinking:
`viewScaleFor` (render.ts) doubles the world zoom, and a `min-width/height:
700px` media query doubles the root font-size (styles.css) so the rem-sized
DOM UI — PixelText canvases included — scales in lockstep. Keep the two
breakpoints in sync (`UI_SCALE_BREAKPOINT_PX`). A desktop still never sees
_less_ moon than the phone; it just sees it at phone-sized zoom rather than
zoomed out.

**A THIRD tier at 1200 (`UI_SCALE_3X_BREAKPOINT_PX`) exists for a BALANCE
reason, not a legibility one.** The view rect is the viewport divided by the
zoom, so a fixed zoom hands a bigger monitor a bigger slice of the world — and
in a game about being surrounded, seeing further is an advantage rather than a
preference. Measured against the phone's ~422×195 world units: a 1440p monitor
at the 2× tier saw **2.8×** the phone's map, and 4K saw 6.3×. The 3× tier pulls
those to 1.24× and 2.8×. Keep every tier an INTEGER — `VIEW_SCALE × uiScale` is
the sprite upscale factor and a fractional one resamples the pixel art — and
keep each one's media query in styles.css in step, or the HUD and the field
disagree about how big a pixel is. Note the tiers are deliberately not
monotonic (1080p tops the 2× tier at 1.57× while 1440p starts the 3× at 1.24×);
discrete tiers can't avoid that, and a test pins it so it stays a known oddity.
Anything reading the scale should treat it as a NUMBER, never test for one tier
(`=== 2`) — that is exactly what silently breaks when a tier is added.

Three layers, one dependency direction (each depends only on the ones above it):

- **`src/` — the engine.** Framework-free TypeScript: the simulation
  (steering, jumping, combat, XP/stats, mana/spellcasting, loot, inventory) plus the content
  catalogs under `src/game/defs/` (levels, enemies, equipment — content is
  data, referenced by id). It must stay importable
  from any renderer; no React, no DOM assumptions beyond what a browser
  provides. `src/output.ts` is the central output module (§19.4) — all
  diagnostic output routes through it; raw `console.*` elsewhere fails lint.
- **`pwa/` — the app.** A Vite + React 19 PWA shell that mounts the
  engine (imported via the `@game/core` alias → `../src/index.ts`), renders
  it, and owns everything deploy-shaped: the service worker build
  (`pwa/pwa-plugin.ts`), manifest, icons, SEO surfaces, and the update
  toast. The app depends on the engine; the engine never imports from the
  app.
- **`native/` — the native store wrapper.** A thin Expo / React Native shell whose
  entire content is a full-screen WebView, so the App Store / Play Store build
  looks and plays exactly like the website. It bundles the built site inside
  itself (`assets/webroot.zip`, a gitignored build artifact from
  `npm run native:bundle`) and serves it from a local HTTP server on a fixed port,
  and adds the things a browser can't give iOS: Taptic haptics (via a
  `navigator.vibrate` polyfill the engine's existing driver feature-detects),
  an audio session that plays through the ringer switch, the coin store's
  in-app purchases (StoreKit / Play Billing via expo-iap; the title menu's
  STORE row exists only in native builds — see `pwa/src/game/store.ts` and
  `native/src/store-purchases.ts`), and **CLOUD SAVE** (below). It has **its own
  dependency tree** — it is not an npm workspace member — so it needs its own
  `npm install` (`npm run native:install`). It reads the game like any browser
  would; no engine or pwa code is native-specific. See `native/README.md`.
- **`electron/` — the desktop store wrapper.** The same idea for **Steam** on
  Windows, macOS and Linux: an Electron shell whose entire content is the built
  site, copied inside it (`webroot/`, a gitignored artifact from
  `npm run electron:bundle`) and served from a private `game://app` scheme —
  NOT `file://`, because `localStorage` is keyed by origin and an opaque origin
  would orphan the player's whole roster. It adds Steam Cloud and Steam
  achievements over the SAME three-file seam the mobile shell uses (bridge →
  provider → platform), so the web side never learns which platform answered.
  Like `native/`, it has **its own dependency tree**, its own `tsc`, and — since
  the root suite stops at its edge — **its own vitest**. See
  `electron/README.md`.
- **`server/` — the session server.** The engine compiled for **Node** and
  shipped inside the desktop app, so a MULTIPLAYER session simulates in a
  process of its own rather than in the renderer (see **MULTIPLAYER** below and
  `docs/multiplayer.md`). Top-level like `mod/` because it is engine code rather
  than shell code — and because from PR 5 of the plan the same file IS the
  standalone dedicated server. It imports `@game/core` and NOTHING under
  `pwa/`; `tests/content/server_deps_test.ts` walks the real import graph to
  prove it, exactly as the mod toolchain's own test does.

**THE SHELLS DIFFER ONLY IN THEIR PIPE.** Both wrap the same built site and
answer the same four bridge protocols; they differ in how the JSON travels
(`ReactNativeWebView.postMessage` vs Electron IPC), so that — and only that —
lives behind `pwa/src/app/shell-bridge.ts`. The RETURN path needed no
abstraction at all: both shells call the page's `window.__gis*Event(...)` from
OUTSIDE (`injectJavaScript`, `executeJavaScript`), which is why adding a second
shell changed no bridge's protocol. `shellPlatform()` answers WHICH shell, and
is read only for platform-feature questions — never to decide how to talk to
one. Two ride on it today: the **coin store does not exist on Steam** (the game
is bought once there; the AUTO PILOT purse is funded by selling loot, exactly
as on the web), and **`canVibrate()` excludes Steam** (no motor, so the
VIBRATION row is hidden rather than offered as a dead switch).

**What Steam does NOT get, and why it is written at the seam.** There is no
Steam leaderboard provider: `steamworks.js` binds no leaderboard API, and
Steam's overlay has no leaderboard page either — so the "the ranking is the
platform's to draw" rule that lets the game ship no board UI has no Steam
counterpart. `electron/src/leaderboards-provider.ts` returns null with that
reasoning in it, which is the seam's own idiom (Android does the same), and the
web side already hides every leaderboard row when it sees it. Achievements DO
travel, but Valve caps a NEW app at 100 until it clears the Profile Features
threshold, so Steam ships the same curated list Game Center does — with
`STEAM_FULL_CATALOG` (`platform-achievements.ts`) as the one switch that lifts
it to all 226 afterwards. That switch goes false → true and **never back**: a
Steam achievement id is permanent once any player has unlocked it. Steam has no
point system at all, so the Game Center point apportionment must not run for it;
the two portals therefore have separate row types and separate committed
manifests (`electron/store/steam-achievements.json`, generated by
`scripts/steam-achievements.mjs`, drift-tested like Game Center's).

**CLOUD SAVE — the roster and the paid coin bank belong to the PLAYER, not to
a device.** Native builds only (a browser has no platform cloud, so every entry
point is a no-op there). It carries the whole roster, the undistributed coin
bank, and the hardcore score board through iCloud key-value storage, with Game
Center naming the player; SETTINGS → DATA → CLOUD SAVE shows the state and syncs
on demand, and it syncs on its own at launch, on foreground changes, on the
cloud's change notification, and after a purchase. Two rules govern every change
here:

1. **A merge must never have to make a judgement call about money.** The bank is
   NOT a stored number — it is a set of grow-only per-device counters
   (`CoinLedger` in `pwa/src/game/store.ts`) whose sum IS the balance, so
   merging is a per-device max: commutative, idempotent, and incapable of
   losing a purchase. Heroes merge one at a time on an `updatedAt` stamp that
   `saveCharacters` writes ONLY for the heroes a save actually changed (rewrite
   that and a stale device starts winning merges with data it never touched);
   deletions travel as tombstones; the score board is a union. Payload equality
   is judged on canonical JSON (`@ui/lib/canonical-json.ts`) so two devices
   can't push the same save back and forth forever.
2. **The native side must stay dumb.** `native/src/cloud-save.ts` moves ONE
   opaque string in and out of a `CloudProvider` (`native/src/cloud-provider.ts`
   — five methods, no game concepts). The whole payload and merge live in
   `pwa/src/game/cloud-save.ts` over `pwa/src/app/cloud-bridge.ts`, mirroring
   the coin store's bridge. **Google Play support is therefore one new file**
   (`cloud-play-games.ts`: Saved Games snapshots + Play Games sign-in) returned
   from `cloudProvider()` — no protocol, web, or merge change. iOS's provider is
   backed by a local Expo module (`native/modules/cloud-save/`, Swift:
   `NSUbiquitousKeyValueStore`); its entitlements come from
   `native/app.config.js` and need iCloud (key-value) + Game Center enabled on
   the App ID (`EXPO_PUBLIC_CLOUD_SAVE=off` drops them for a local build).

**GAME CENTER — the badges also live on the player's PROFILE, and the mirror
runs ONE WAY.** Native builds only, on the exact same three-file seam as cloud
save: `native/src/achievements.ts` (bridge) over `achievements-provider.ts`
(seam) and `achievements-gamecenter.ts` (Apple), backed by
`native/modules/game-center/` (Swift: `GKLocalPlayer` + `GKAchievement`), talked
to from `pwa/src/app/achievements-bridge.ts`. Game Center authentication is a
single global thing, so that module is its ONE owner in the app — cloud save
asks it for the player's name (`native/src/game-center.ts` memoizes the sign-in)
rather than authenticating a second time. Four rules:

1. **The game's ledger is the truth; the platform is a copy.** Nothing is ever
   read back — a platform that disagreed could otherwise grant a badge the game
   never awarded, and the shelf, the toast and the point total would all have to
   answer for it. That one-way rule is what makes the sync trivial: both
   platforms keep the highest percentage they've seen for an id, so a report is
   idempotent, a failure is just retried, and nothing can un-earn a badge.
2. **The list is CURATED, because the platforms cap it.** Game Center allows a
   game 100 achievements and 1,000 points TOTAL; the game ships 226 badges. So
   `pwa/src/game/platform-achievements.ts` drops the two families that read as a
   set rather than a brag — the 131 per-unique `unique_*` badges and the nine
   `equip_*` onboarding nudges, each already rolled up by a ladder that does
   travel (`uniques_*`, `outfit_full`) — leaving 86 with headroom for the next
   badge. Point values are APPORTIONED from the badges' own tiers rather than
   typed, because the budget is fixed while the catalog grows.
3. **A badge only exists once it is in the portal.** The list is generated and
   COMMITTED (`native/store/game-center-achievements.json`, via
   `scripts/game-center-achievements.mjs`), so a catalog change diffs into the
   exact rows to create in App Store Connect; the suite fails when it drifts.
   The badge id IS the Game Center id — but Play Console GENERATES its ids,
   which is why `platformId` lives on the native provider rather than the web
   side, and why Play support stays one new file.
4. **Restraint is the web side's job.** `achievement-sync.ts` reports a ladder
   only when it crosses a 5-point step (a run must not put a network call behind
   every kill), debounces a burst into one round trip with a ceiling on the wait,
   remembers what was delivered ACROSS LAUNCHES, and leaves a refused batch
   pending. The game's own toast stays the only celebration — the system banner
   is suppressed (`showsCompletionBanner = false`).

**LEADERBOARDS — the game's own board ranks the player against THEMSELVES; the
platform's ranks them against everyone.** The achievements' twin, on the same
seam again (`native/src/leaderboards.ts` → `leaderboards-provider.ts` →
`leaderboards-gamecenter.ts`, talked to from `pwa/src/app/scores-bridge.ts`),
sharing the same module and the same memoized sign-in — so **Play support is one
new file** for this too. It ships **no board UI at all**: HIGH SCORES → WORLD
RANKINGS opens Game Center's own board, because the ranking, the player's rank,
their friends and the time scopes are the platform's to draw. Four rules:

1. **Every board must be UNCAPPED.** A ranking of something with a ceiling
   (highest hero level, relics recovered, trophy points) fills up with players
   tied at the top and stops ranking anything — the first hundred to finish
   share first place and nobody after them can move. The five boards are the
   hardest single blow ever landed, lifetime kills, the best kill rate SUSTAINED
   across a full ten minutes of combat clock, and the longest survival / most
   kills in a hardcore JESUS campaign.
2. **Nothing is tracked FOR a board.** Every value is a record the game already
   keeps for itself — the lifetime ledger (`achievement-totals.ts`) and the
   hardcore campaign book (`highscores.ts`) — read by `game/leaderboards.ts`. A
   leaderboard is a second READER of the player's own records, never a second
   bookkeeper, so no ranking can disagree with what the game already shows the
   player. The one new counter, `bestKillRate`, is a lifetime total like any
   other; its rolling window (`kill-rate.ts`) is bucketed rather than a list of
   kill timestamps, and reads the farm-proof COMBAT clock so a cleared field
   can't dilute a rate.
3. **A board only exists once it is in the portal, and its FORMAT must match the
   game's SCALE.** A platform score is one Int64, so a rate goes out ×100 and a
   duration in whole seconds; if App Store Connect's score format disagrees,
   every score on that board is silently wrong by a factor of a hundred. So the
   format is the one authored knob and the scale is DERIVED from it
   (`FORMAT_SCALE` in `pwa/src/game/platform-leaderboards.ts`), and the portal
   list is generated and COMMITTED (`native/store/game-center-leaderboards.json`
   via `scripts/game-center-leaderboards.mjs`) with the suite failing on drift.
   The board key IS the Game Center id; Play generates its own, hence
   `platformId` on the native provider.
4. **The declaring half and the reading half are separate files, and the KEYS
   are separate again.** `platform-leaderboards.ts` is pure data (a build script
   and a test import it, so it must not reach the ledger); `leaderboards.ts`
   does the reading; and the keys sit in `app/scores-bridge.ts` because the HIGH
   SCORES screen is on the app's STARTUP path — a WORLD RANKINGS button that
   reached the catalog would drag `@game/core` into the 170 KB critical-path
   budget for every player who never opens a board.

Device-shaped state is deliberately NOT synced: settings, key bindings, the
active-hero selection, and the parked run.

**THE DEVICE CONTENT SWITCHES — the controls the PLAYER'S GUARDIAN owns, not the
player.** Two switches on the app's own page in iOS Settings (native builds only;
a browser has no such page, so every entry point reports UNMANAGED and the game
plays whole): **MATURE CONTENT**, which gates the gore and the screen-nuke's
burning dead, and **COIN STORE**, which decides whether this install has a store
at all. Both default ON — the game ships as it was made, and a guardian turns
things off. They live OUTSIDE the game on purpose: a control reachable from
inside the thing it restricts is not a restriction, so there is no in-game row
for either, and the device's answer OUTRANKS every in-game setting and developer
flag (every GORE switch and FORCE STORE included). Same three-file seam as cloud save
and the achievements — `native/src/device-settings.ts` (bridge) over
`device-settings-provider.ts` (seam) and `device-settings-ios.ts` (Apple), backed
by `native/modules/device-settings/` (Swift: `UserDefaults`) with the page itself
written at prebuild by the local config plugin
`native/plugins/with-settings-bundle.js` — so **Android support is one new file**
plus wherever Android puts its own parental controls. Four rules:

1. **NSFW IS THE UMBRELLA GATE FOR EVERYTHING "NOT SAFE FOR KIDS", and every new
   such feature MUST hang off it.** The blood, the incinerated dead — and
   whatever comes next: dismemberment, a decapitation, swearing in the dialogue,
   drug or alcohol references, sexual content, an unusually cruel death
   animation. The test is not "is this gore", it is "would a parent handing over
   this phone want it off". Adding a second switch per new kind of content is how
   a parental control rots: the guardian answered once, years ago, and every
   feature shipped since defaults to showing them. So a new mature feature adds a
   `nsfwAllowed()` check, never a new setting — and it belongs in the same review
   as the feature, because a mature feature that ships ungated has already been
   seen by the players the switch exists for.
2. **THE GATE GOES WHERE THE THING IS DECIDED, NOT WHERE IT IS DRAWN.** `bloodBlow`
   returns null and the floor's saturation grid never records the hit; the
   `incinerated` flag is dropped at the top of the kill's fx so the blast falls
   back to the ORDINARY corpse punt-and-topple, which is what makes a censored
   nuke read as a bomb that hits hard rather than one whose victims vanish. A
   gate at the draw call leaves the state filling up invisibly and hands the
   player everything it was hiding the moment the switch comes back.
3. **IT FAILS OPEN, ALWAYS.** No native module, an Android build, a malformed
   payload, a browser: every one of those plays the full game. A guardian's
   switch is a deliberate act, honoured exactly; the ABSENCE of an answer is not
   one and must never be read as one. Note the trap this exists for: iOS does NOT
   write a `Settings.bundle` `DefaultValue` into `UserDefaults` until the page is
   visited, so the key is MISSING on every fresh install — read it as `false` and
   every player gets the censored game.
4. **THE POLICY IS IN THE PAGE BEFORE THE GAME'S FIRST FRAME.** It gates what may
   be DRAWN and which rows may be OFFERED, so it is injected onto `window` before
   the WebView loads a byte (`policyBootScript`) and read synchronously
   (`pwa/src/app/device-policy.ts`) — never awaited. A round trip would flash a
   STORE row at an install that has none. Only LATER changes travel as events,
   and the title menu rebuilds on them through the same `bumpSettings` tick its
   own settings use.

Deployment is three GitHub Pages slots on one origin (the `siteUrl` in
`game.config.json`, a custom domain on the GitHub Pages origin): `/` serves
the highest
`v*` tag (or `main` before the first release), `/preview/` serves every
`main` push, `/branch/` serves a manually parked branch persisted in
the `branch-deploy` orphan branch. `.github/workflows/pages.yml` builds all
slots into a single Pages artifact; each slot gets its own service worker and
a disjoint precache cache id (`pwa/src/app/pwa.ts`).

## GENERATED MAPS — THE ONLY MAPS. The mission is a recipe, carved per run

**A MISSION IS NOT A MAP.** A hand-drawn one pinned its boss on a known rock and
threaded an intended `path` to it, so the second run of a map was a commute.
There are none left: every mission's geometry is carved fresh from a **v2
BLUEPRINT** — `content/maps/<id>.yaml` — on the run's own seed, so the boss has
to be FOUND. That is the whole feature: no `path` is emitted, which silences the
app's guidance arrow (`nextPathWaypoint` answers null without one), and the
fog-of-war minimap becomes the only record of where you have been.

**THE SPLIT IS IN THE TYPES, and it is what keeps it honest.** `MissionDef`
(`content/levels/<id>.yaml`, the catalog `levelDef()` answers with) is a venue
MINUS its floor: its name, story, ladder rung, hazards, merchant, loot pools and
thought pins. `LevelDef` is what a RUN is played on — the same fields plus every
wall, prop, knot and pickup — and the only way to get one is `resolveLevelDef`,
i.e. a carve. So a mission that authors geometry is refused BY NAME at build time
(`scripts/level-data/load-yaml.mjs` names where each field went), and inside a
run `runLevelDef(state)` is the one accessor: the catalog cannot answer a
question about a floor it does not have. The old developer flag is gone — there
is nothing left to switch between — and only the **MAP SIZE** row remains.

**A blueprint is a RECIPE, not a layout.** It carries only what the carving
needs: a purpose-typed **object palette**, an **area palette** saying what kinds
of place the map is made of, the horde's breeds and the depths they hold, the
cast (elites, cache keepers, the boss, the errands' non-combatants), three sizes,
and the compass regions the boss may be hiding in. Everything else about the
mission — name, story, intro, cutscenes, loot pools, merchant persona, hazards,
thought pins, travel gates — is **INHERITED** from the level it names, so the
story lives in exactly one place and a carved THE MOON is still the moon. Like a
level YAML it names **ramps** rather than per-difficulty numbers, expanded
against `content/ladder.yaml` by the same shared reader
(`scripts/level-data/ladder.mjs`), so a `savage` knot means the same mob level on
every map.

**A KEYCARD OPENS A ROOM THE CARVE PICKED — `lock:` on an area, `locks:` on the
blueprint.** The campaign's keycards were lore for as long as a carve had no way
to say "this district is sealed": a blueprint names a `lock: true` AREA (the kind
of place worth locking — GoodCo's vault, Mars's shrine) and a `locks:` list of
STORY ITEM ids, and the carve hangs one door per key on the borders of the
deepest district it can afford to seal. Five rules make it a room rather than a
soft-lock:

- **A ROOM IS A DISTRICT, NOT A CELL.** Adjacent lockable cells are grouped into
  one room first; hanging a door per cell would put a second lock inside the
  room the first key already opened.
- **SEALING IT MUST NOT CUT THE MAP IN HALF** (`survivesWithout`). A district
  can grow across the map's waist, and a door there locks the boss away behind a
  key that is also behind it. A candidate whose removal disconnects the carve is
  refused and the next one tried.
- **NOTHING THE RUN NEEDS GOES INSIDE.** The landing, the objective, the boss's
  home, every set piece, bystander, placed item and well are excluded from the
  vault cells (`openCells`, `offMap`), so the key is always somewhere the hero
  can reach without it.
- **A LOCKABLE DISTRICT DOES NOT SPREAD** (`areas.ts`). Seeded like any other, it
  would swallow a small map; it stays the cell it was seeded on, and one seed per
  key is `promised` to `carveChambers` so a declared key always has a room.
- **THE ROOM PAYS FOR THE WALK.** Each vault gets its own cache and keeps its
  knot: what is worth locking up is worth standing over.

The ANNEX takes the same treatment through `annex.lock` — a keyed ELEVATOR
(`ElevatorState.opensWith`), refused in `elevator.ts` with an `elevatorLocked`
event rather than silently, so the app can answer with a locked call light and
the key's name.

**AND THE SENTRIES WALK A BEAT — `patrol: true` on an elite set piece.** A route
is DERIVED, never authored: `patrolBeat` sweeps the pinned elite down the long
axis of its own cell, inset off the walls, so the beat fits whatever room the
carve grew it in. One waypoint is the whole route (the engine walks `at →
patrol[0]` and back), and it deliberately avoids the cell's centre, which is
where the furniture stands — a patroller wedged on a crate is a patroller
standing still.

**Objects are typed by PURPOSE, never by position** (`wall`, `obstacle`, `cover`,
`crate`, `chest`, `decor`, `landmark`, `building`). The type is what lets the
generator place a thing without being told where — a `chest` belongs at the end
of a dead end, `decor` may land anywhere — so adding a purpose means teaching
`generate.ts` where that purpose goes, never adding a free-form sprite list.
Counts come from a **density** (per 1,000,000 world px²) rather than a number,
because a blueprint is carved at three sizes and a fixed count leaves LARGE bare.

**AREAS are the rule engine, and WALLS ARE DERIVED FROM THEM.** Every carved cell
is assigned an area, and the barrier between two cells falls out of the PAIR:
nothing at all between two open plains, a wide gate into a yard, a solid wall with
one doorway into a compound — built from the owning area's own material, so one
map fences its plains with rubble and seals its domes with panel. An area also
decides which props scatter there (`MapObject.areas` → a `within` restriction on
the emitted scatter line), how thick the horde stands, whether the cell may hold
the boss or the hero's landing, its own floor, an entrance `apron` of hard
standing just inside its doorways, and — via `shellOf` — whether it is a BAND
wrapped around another area rather than a district of its own (Mars's outer dome
around its inner terrarium).

Two decisions in the geometry are load-bearing and easy to undo by accident:

- **Walls are emitted per BORDER, not per split line.** A split line spans a whole
  ancestor rectangle and knows nothing about which cells ended up either side of
  it, so emitting from split lines produces stubs jutting into open floor and
  doorways jammed against corners. A border knows exactly which two cells it
  separates, so its wall is as long as those cells are adjacent and its doorway
  sits in the MIDDLE of it.
- **Districts are grown from SEEDS, not by inheriting from neighbours.** An
  inherit-with-probability walk COMPOUNDS — whichever type it rolled first
  swallows the map, and a palette weighted 4:3:2 comes out as one biome with a
  couple of freckles. Seeding decouples the knobs: `layout.cluster` controls how
  BIG a district is, the weights control WHICH districts appear.

A ridge is rubble, so a wall material may name a **sprite pool** and a **wander**
(`LevelDef.walls`): each stone picks its own sprite and the chain drifts off true,
as a bounded random walk tapered to nothing at both ends — so it still SEALS and
still meets the wall it joins. Both are drawn from the level's own wall rng
stream, so a map that asks for neither lays out byte-identically to before.

Three more rules shape what the districts CONTAIN:

- **`once` makes a district singular.** Weights cannot say "there is A town": low
  odds give runs with none, high odds give runs with five, and either way the map
  reads as suburbs. A `once` area is withdrawn from the palette the first time it
  wins a seed, so boot_hill grows exactly one town in a rolled corner of a big
  empty country — and finding it is worth something.
- **`blocks` lays a MAIN STREET.** What makes a town read as a town is alignment,
  not density: two rows of frontages facing each other across a lane. An area with
  `blocks: <street width>` walks its `building` palette down both sides of its
  cell's long axis instead of scattering it (`streetBlock` in `place.ts`).
- **A `lair` is a house somebody is in.** Every other pinned elite stands in the
  open, which is why they all feel the same — the hero sees the duel coming two
  rooms out. A `lair` object gives the elite a STRUCTURE and a door with a shut
  frame and an open one; the mob stays off the field until the hero walks up, then
  the door bangs open and it comes out to greet him (`src/game/lairs.ts`,
  `LevelDef.lairs`, modelled on placed packs). A lair names the `areas` it belongs
  in and the elite is re-homed into a cell of that kind, so the marshal's house is
  on the street rather than alone in the desert.

**THE ENDING IS NOT ON THE MAP: the ELEVATOR and the ANNEX.** The search worked,
but its last stretch did not — the fog-of-war minimap fills in as the hero walks,
and a walled compound with a doorway is SHAPED like the end of a mission, so the
player read the answer off the minimap a district or two early. An **annex**
(`MapAnnex`) fixes it by putting the boss somewhere the floor plan does not reach:
a sealed room in a band of its own past the carved rectangle, with no border to any
cell, so nothing adjoins it and the minimap has nothing at all to show where it is
until the hero has stood in it. The only way in is an **elevator** pad
(`LevelDef.elevators`, `src/game/elevator.ts`) standing in the carved cell the
boss's compass regions picked — so the last thing to FIND is the way to the boss,
and it could be in any of thirty rooms. Two details carry it: the annex joins the
grid as a real chamber with an EMPTY neighbour list (so every dressing pass treats
it as the district it is, with no special cases — only the wall pass knows, and
gives it a sealed box), and `widthFrac` sizes it off the map so the band it costs
stays mostly room at all three sizes. Boot Hill ends in the buried ZAI CONTROL
ROOM; the bunker's vault is below its floor, because you do not walk to a vault.

**FAUNA is the canopy's twin on the ground plane.** A level whose only moving
things are trying to kill the hero reads as an arena with a texture on it; a field
with cattle standing in it was a field before he arrived — and on a map built
around SEARCHING that matters, because the player is looking at a lot of ground he
has no fight in. `LevelDef.fauna` places critters; the wander is a closed-form
function of the render clock (two incommensurate sines per axis — a Lissajous path
that never repeats), so a herd of forty costs the simulation nothing, cannot desync
a replay, and is not an actor: it collides with nothing, cannot be hurt, and never
blocks a shot.

**THE RUN READS ITS OWN MAP — `runLevelDef(state)`, never `levelDef(state.level.id)`.**
`createGame` resolves the level once, but a run keeps ASKING the level questions
for as long as it lasts: which zones suppress spawns, whose lair this door is,
where the exit stands, what is scattered here. Every one of those used to go back
to the CATALOG, which now holds a MISSION with no geometry on it at all — so
those reads have nowhere to land, and the type system says so (`levelDef()`
answers a `MissionDef`, whose geometry is optional). The carve travels on the
state (`GameState.carvedLevel`) and `runLevelDef` is the ONE accessor; the rule
is flat — inside a run, nothing reads the catalog for its own level.

**THE LANDING IS QUIET, NOT SAFE — and the opening beat's cast lands with the
hero.** A SAFE zone does not merely keep the horde from spawning in it, it REPELS
every minion out and holds them at its edge, so one centred on the hero is a
bubble he can stand in untouched all run. It also froze goodco_hq's opening beat
solid: `openingStrike` is held in order by `after` (the hero reads the crowd,
THEN the lone rusher breaks from the pack and starts swinging at him), and the
rusher was shoved straight back out of the pad it was placed in. A QUIET zone
gives the breather the landing wants — no ambient horde placed in it — without
the wall; the safe zone is spent on the trader's stall instead. The gate's other
half is distance: the
carve pins a few of the `firstSightThoughts` breed the `after` thought names
around the landing, inside that pin's own radius, because a crowd carved a
district away leaves the gate shut and the hero walking the map holstered.

**THE HORDE IS A DENSITY, and it is priced over the floor that may HOLD it.** One
knot per CELL is a count wearing a density's clothes: the carve grows its cells
with the map, so the horde thinned out exactly as the search got longer —
measured, 0.8–1.2 spawn points per million px² against the authored campaign's
1.6–3.8, which played as "no mobs on the map, just the elites and the boss".
`KNOT_DENSITY` (generate.ts) is the map's allowance in knots per million px², and
it is spread over the cells that may hold a horde rather than over the map,
because a third of the floor is quiet by design (the boss's cell, the caches, the
trader's) and pricing it per cell hands that third back as emptiness. A cell takes
as many knots as its floor is worth, cut into bands along its long axis so a hall
gets a fight at either end; the first keeps the cell's plain `k<id>` name for an
elite's `alarms` link. The horde's DEPTH axis is rescaled the same way — over the
knot-bearing cells, not the carve — or the deepest ramps of the ladder (and the
breed authored for `[0.8, 1]`) are never reached, because the deepest cells are
precisely the quiet ones.

**A MOD MAY SHIP ONE TOO, and that is why the registry is a LEAF.** A blueprint
is content like a level (`maps/<id>.yaml` beside `levels/<id>.yaml`, through the
same loader and the same `validateMap`), so a mod's venue is carved per run
rather than being permanently hand-drawn — see **STEAM WORKSHOP MODS** below.
The catalog therefore has to be swappable, and it lives in the import-free
`mapgen/blueprints.ts` so `registerDefs({ blueprints })` can replace it without
the def registry importing `generate.ts` and the whole carve behind it. Two rules
fall out. **A blueprint carves the mission it is NAMED AFTER** (stem == `id` ==
`level`), so one named after a shipped venue re-cuts that venue — a conversion's
business, refused for an addon. And **the compass grammar cannot travel**: the
mod compiler runs in the desktop app's main process, which has no TypeScript to
call `regions.ts` with, so `mod/catalog.json` carries the names the engine's OWN
parser accepts, enumerated from it by `mod/tools/catalog.mjs` off the exported
`REGION_TERMS`. Never re-implement the grammar in the SDK; snapshot what the one
parser says yes to.

Where the code lives: `src/game/mapgen/` (`types.ts` the blueprint shape,
`regions.ts` the compass grammar, `areas.ts` the area rules, `rooms.ts` the carve
and the borders, `place.ts` the dressing, `generate.ts` the decisions,
`blueprints.ts` the swappable registry, `index.ts` `resolveLevelDef` — the ONE
seam `createGame` hangs off). The compile step is `scripts/generate-maps.mjs` + `asset-tools/map-schema.mjs`

- `map-data/load-yaml.mjs`, emitting the gitignored
  `src/generated/map-blueprints.ts`. `tests/content/generated_maps_test.ts` is the
  guard: it holds every carved def to the SAME `validateLevel` the build runs
  over the missions themselves (plus the geometry a carve owes, `carved: true`),
  and asserts the objective, every cache and every placed
  item stay reachable using the engine's OWN `buildNavGrid`/`findPath` — a check
  that is only meaningful if the grid and the def come from the same carve, so it
  sets the size before building the run.

**Nothing outside a run may import `mapgen/`.** The menus reach levels through
`defs/levels/summary.ts`; pulling the generator onto the startup path would put
the whole level catalog and the carve in the app's critical-path budget.

LOOK at a map rather than reading its JSON: `node scripts/level-render.mjs <id>
--size large --seed 3 --dormant` draws one run's carve with the real sprites and
the real horde standing in it, and `scripts/map-layout.mjs <id> --seed 3` gives
the schematic with con colours. Both render a CARVE, because there is nothing
else to render — change the seed to see another run's map.

## QUESTS — the errands the field's non-combatants ask of the hero

Every other figure on every map is either trying to kill the hero or is a boss
explaining why, which makes each venue read as a LEVEL rather than as a PLACE:
nobody lives here, nobody worked here, nobody got left here. A **QUEST GIVER**
is the counterweight — a person the horde was inflicted on rather than a person
the horde is, still doing a job that stopped making sense some time ago. Two
stand on every map with the venue's own side errands, plus a THIRD carrying the
campaign chain (`content/quest-givers.yaml`); the horde is warded off all of
them and nothing can hurt them, exactly as with the merchant.

**THE GIVER AND THE QUEST ARE SEPARATE CATALOGS.** A giver is a PERSON — a
sprite, a name, a spot, a reason for being there — and one person hands out a
whole CHAIN. Folding the giver into the quest would repeat that person once per
errand and let the copies disagree; folding the chain into the giver would make
a quest unaddressable, and a chain link (`requires`), a reward and a tracker row
all need to name one. Both compile from YAML through the same loader and schema
a MOD's quests go through, and arrive via `registerDefs` — so "it works in my
mod" and "it works in the game" mean the same thing (`mod/FORMAT.md`).

Four kinds of errand, and each is a different reason to walk somewhere: `kill`
(N of a breed), `killNamed` (one pinned elite or boss), `collect` (tokens the
quest itself defines, dropped by breeds or lying on the floor), and `escort`.
Five rules are load-bearing:

1. **THE REWARD'S XP IS A SHARE OF THE HERO'S OWN BAR, NEVER A NUMBER.** A flat
   figure authored against GOODCO HQ is a rounding error by Boot Hill and an
   instant ding on JESUS, so `xpShare: 0.25` means "a quarter of the level you
   are on" and prices itself correctly at every rung for free. Coins are flat
   (the purse is a flat economy) and the LOOT is rolled through the ordinary
   drop pipeline — a quest is a second CALLER of the loot system, never a second
   loot system.

   **AND THE GEAR IS DECIDED BEFORE THE PLAYER SAYS YES —
   `quests/reward-choices.ts`.** An errand used to promise "AN ITEM" and roll it
   at the handover, which is two problems wearing one sentence: the player could
   not tell whether the job was worth doing, and the piece that arrived had no
   relation to the build they were playing. The gear is now MINTED ONCE, when
   the conversation first opens (`GameState.questRewards`, keyed by quest id),
   and shown in full — real bases, real tier, real rolled affixes, drawn with
   the bag's own `affixLine` and tier colours. Four rules:
   - **IT IS THE ORDINARY PIPELINE, CALLED THREE TIMES.** Every row is a
     `rollEquipment` off the level's own pool at the SAME tier and quality, so
     the choice is about the build and never about which row rolled better.
     `eligibleBases` is exported from `items/rolling.ts` for it rather than
     re-derived, or the level gates, the material gates and the base-level floor
     would exist twice.
   - **THE THREE ARE ONE PER CLASS, AND THE GAME ALREADY HAD THE THREE.** A
     weapon reward offers a MELEE, a RANGED and a MAGIC base (`WeaponClass`); an
     armor reward offers MAIL, LEATHER and CLOTH — and those materials already
     lean STR/DEX/INT in their own `ARMOR_TYPES[…].statWeights`, so the class
     flavour of the affixes falls out of picking the base and nothing reaches
     into the affix roller. PLATE is deliberately not a lane (NIGHTMARE-gated,
     so it would be empty for most of the campaign).
   - **SOMETHING EVERYONE WOULD WANT IS OFFERED ALONE.** A charm or a bag has no
     material, no weapon class and an even affix spread, so there is no second
     version of it to want instead — three copies of one piece is a menu with
     one dish.
   - **MINTED AT THE CONVERSATION, NEVER AT THE RENDER.** The app is a pure
     READER (`questRewardChoices`); minting per render would spin a slot machine
     while the player read it and mint an item id every frame. The pick is
     `chooseQuestReward` (a run command like every other verb) and rides the
     errand, so it survives walking away and coming back.
   - **SHOWN AT THE ASK, CHOSEN AT THE HANDOVER.** The offer lists them under
     ITEM REWARDS as a prospectus — what the job pays — and the slots are
     viewable but not selectable there: choosing at the ask would make the
     player commit at the one moment they know least about the build they will
     have when they come back. The handover says CHOOSE ONE and the slots take
     the press.
   - **THEY ARE BAG SLOTS, AND THE CARD IS THE BAG'S.** A row per piece with its
     name and every affix under it is three stacked paragraphs in a box that
     already carries a speech and a contract, and the icon says what the thing
     is faster than the words did. So the gear draws as `.inv-cell` slots with
     no names, and a press (or a hover) opens the piece's own `ItemTooltip` —
     the same card, with the same worn-piece comparison, that the player reads
     every other piece of gear on.

2. **THE LOG IS THE TRUTH; THE MARK IS DERIVED.** `giverMark` recomputes the
   `!` / `?` over a head from the quest log every time it is asked, and nothing
   caches it — a stored mark goes stale the instant a kill three rooms away
   completes an objective, and a `?` that isn't there is a quest the player
   never hands in. The three states are WoW's: gold `!` (work to take), gold `?`
   (work to hand in), grey `?` (work running).
3. **A CONVERSATION NEVER STARTS ITSELF, AND A TAP OPENS THE WHOLE SLATE.**
   Walking up MEETS somebody — discovered, pinned on the map, `!` over the head
   — and that is all it does; `talkToQuestGiver` is the only door in, and only a
   tap on the person calls it. It used to auto-open on approach, on the theory
   that a quest nobody notices is a quest nobody takes, and what that actually
   did was freeze the run into a modal the player had not asked for because
   they rounded the wrong crate mid-fight. The head mark carries the invitation
   instead — WoW has never needed more than one — which is also why the
   GREETING is written as an ASK ("CAN I ASK YOU A FAVOR?") rather than as a
   line of ambient character: it is now heard only by a player who deliberately
   walked up and pressed, so it has to pay for the press. A giver with more
   than one thing to say opens on the **PICK LIST** (WoW's gossip window)
   rather than handing back one errand at a time, because the one-at-a-time
   rule makes a second quest reachable only by refusing the first — which reads
   as the game losing track of what it already offered. Every exit from an
   errand returns to the slate, so taking three off one person costs one
   walk-up. With exactly one topic the list is skipped: a menu of one is a menu
   nobody wants. **A LIST ROW IS A BUTTON AND IS SIZED LIKE ONE** — the same
   vertical padding as `.pixel-button`, because a row at text height is a
   quarter of the tap target of the GOODBYE button sitting under it, and the
   row is the one the player came to press.
4. **PROGRESS IS BOOKED WHERE IT HAPPENS, NOT SCANNED FOR.** `creditQuestKill`
   is called from `killEnemy` and `creditQuestPickup` from the item pass — the
   tally counts what the hero DID, not what is left standing.
5. **THE ERRAND-GIVERS STEP LAST.** A quest conversation takes the stage by
   setting `phase = "quest"`; a sight-pinned thought, the opening strike and a
   lair's occupant all take it by setting `phase = "dialogue"`. Whichever runs
   LAST wins — and when the thought won it left the offer set behind a dialogue
   the player tapped away, so the offer never appeared and the giver was stuck
   mid-conversation for the rest of the run. `stepQuests` therefore runs after
   every other scene-raising pass in `step/index.ts`.
6. **THE PERSON OWES A PARAGRAPH AND SO DOES THE JOB.** `QuestGiverDef.lore` and
   `QuestDef.lore` are both REQUIRED and both DESCRIBED rather than spoken, in
   the register of an item's `description` — the same rule `EnemyDef.lore`
   follows, and for the same reason: without them an errand's only prose is its
   offer dialogue, which is written to be heard while standing in front of
   somebody and which the library keeps behind a spoiler cover. Nothing in the
   simulation reads either; the library's ERRANDS section prints both in the
   open, and the manuscript governs them without transcribing them.

**AN ESCORT IS A TIMER WITH A BODY, NOT A SECOND COMPANION.** It walks toward
the hero, stops when left past its leash, and the horde bites it when the horde
is close — so it costs one pass of its own and changes nothing in
`step/enemies.ts`, while still creating the errand's whole tension: the fight
wants the hero to kite and the follower wants him not to. The horde reaches it
BECAUSE it follows the hero, never because anything retargets; retargeting was
considered and rejected, since it turns every escort into a fixed-rate damage
race the player cannot influence, which is the thing escort quests are hated
for.

**A CAMPAIGN CHAIN BELONGS TO THE HERO, NOT TO THE RUN — `QuestDef.campaign`.**
An ordinary errand's log dies with the level and a fresh visit offers everything
again, which is right for pacing one map and wrong for **THE SEVERANCE**, the
one chain the game ships that crosses all five venues. A campaign errand's
progress and its FLAGS ride the character (banked per difficulty, exactly as
clears and story beats are — see `quests/campaign.ts` and the roster's
`campaignQuests`), its chain may cross maps, and its objectives may sit on maps
its giver does not stand on. Three rules keep it from going wrong:

1. **A CHAIN MAY NOT MIX THE TWO** (enforced at build time). A campaign link
   waiting on a run quest waits on something that will be forgotten before the
   hero arrives; a run link waiting on a campaign one is a gate that reads as
   random to a player who did the prerequisite three venues ago.
2. **PROGRESS ONLY EVER CLIMBS.** `mergeCampaignQuests` keeps the FURTHER of the
   two readings per errand, so a run abandoned halfway, a death, or a level
   replayed from a stale checkpoint can never walk the chain backwards — the one
   bug here that would actually hurt, since it costs hours silently. A DECLINE
   deliberately ranks BELOW an untaken offer, so saying no on a later visit
   cannot overwrite a run that took the job.
3. **IT IS BANKED ON EVERY QUEST EVENT, NOT AT THE LEVEL'S END.** The case that
   matters is a player who quits to the menu halfway through; a bank that waited
   for a victory would lose exactly that.

**FOUR MORE OBJECTIVE KINDS, AND EACH IS A DIFFERENT REASON TO DO SOMETHING
THAT IS NOT KILLING.** `visit` (stand somewhere, worded as the authored SENTENCE
rather than a coordinate, so it is a search rather than an arrow), `flag`
(something was learned, admitted or talked into — the bridge from a conversation
tree), `sell` (a piece goes across the trader's counter), and `reachLevel` (the
hero's own level, worded by the tracker as the CLIMB — `LEVEL 96/99` — because a
tick-box that sits unticked for a whole campaign says nothing). The three that
have no moment to be booked at are POLLED once a tick over the running errands
only; everything else is still booked where it happens.

**AN ERRAND MAY RUN THROUGH THE TRADER — `QuestDef.merchant`, and the ORDER is
the mechanic.** Sell him the thing you took off a body and what he puts on his
counter afterwards is the thing the errand actually wanted. It is on the QUEST
rather than on the merchant because his stall is rolled fresh per run: a
permanent row for an errand nobody has taken would be a mystery item in every
shop in the game. The rows are DERIVED per open (`questStallRows`), never
stored, for the same reason a giver's head mark is — and a piece BOUGHT credits
the same `collect` tally a piece prised off a corpse does, so nothing downstream
can tell the two apart.

**NEUTRAL MOBS — `EnemyDef.disposition`, and `src/game/disposition.ts` is the ONE
predicate.** A bystander is not fighting anybody: `inert` excuses it from every
damage pass, every AoE gather, every target search and the level's foe tally —
the same predicate an apparition rides, because a quest mob the player can
cleave in half while swinging at the horde behind it is a chain that dead-ends
with no error to explain it. It is not mist, though: `provokeEnemy` latches
`Enemy.hostile` and the same body is an ordinary monster from that tick on,
which costs the combat code nothing precisely because every site already asks
one predicate. `ai.idle: "roam"` walks one across the WHOLE map rather than
around a post, so a quest can ask for somebody who has to be FOUND.

**CONVERSATIONS ARE THE TALKS THE HERO STEERS — `content/conversations/<id>.yaml`,
`src/game/conversation.ts`.** Every other spoken thing in the game is a monologue
with a NEXT button; a tree is a choice, and the branch the player picks is the
mechanic. What a branch may DO is deliberately four things and no scripting hook
(a mod ships these files): set a FLAG, PROVOKE the speaker, hand over a piece, or
go to another node. Everything a conversation appears to accomplish elsewhere is
something else reading a flag. Three rules: a bystander is TAPPED rather than
triggered, exactly as a quest giver is — a venue holds a dozen of them and
self-opening would be a stream of modals over a fight; the app indexes the
ENGINE's FILTERED choice list, or a gate shifts which branch a tap takes; and a
gated row is left OUT rather than greyed, because a greyed row is a spoiler
printed in the shape of a locked door. Re-entry is by FLAGS alone — there is no
saved cursor, because a cursor would have to be persisted, merged and migrated to
say what three flags already say.

**THE ONE RESPEC IN THE GAME IS A QUEST REWARD — `reward.cleanSlates`.** A CLEAN
SLATE (`Player.cleanSlates`; the campaign's carrier of one is THE BIBLE) runs the
SAME `beginRespec` a LEVEL TOKEN used to, because there is one respec and one
screen for it. It lives on the player rather than in the bag for the reason a
thing that must never be dropped, sold, or lost to a full bag does not belong in
a container the player empties, and it is spent from the PAUSE screen. Keep it
rare: a build's whole weight comes from being a decision, and a game that hands
these out has no build decisions in it, only postponed ones.

App side: `pwa/src/game/overlays/TalkOverlay.tsx` is the conversation tree (the
errand box's gold, with a column of things the hero might say where ACCEPT and
DECLINE would be); `pwa/src/game/overlays/QuestOverlay.tsx` is the gold parchment box
(the one modal the player is asked to make a DECISION in, which is why it is the
one surface off the shared steel skin — after two of them, gold means "somebody
is asking you for something"); its speech crawls on the same typewriter every
other spoken line in the game uses, while the objectives and reward print
instantly because they are a contract rather than a voice. **THE FOOTER IS THE
DECISION, NEVER A `NEXT`** — ACCEPT/DECLINE on the ask, COMPLETE on the
handover, shown from the first page rather than revealed on the last; a button
that says NEXT names the mechanism instead of the choice and hides the fact
that there is anything to decide. The remaining pages are turned by TAPPING THE
SPEECH, which is the in-world dialogue box's own gesture.
`QuestLogOverlay.tsx` is the full log, `QuestTracker.tsx` the on-screen strip
over the fight, `QuestFlash.tsx` the centre announcement, and
`render/quests.ts` draws the givers, their head marks and the escorts. The
list's row marks are drawn in the PIXEL FONT rather than as the head sprite —
the sprite is sized to be read across a room, so in a text row it is a
different size on a different baseline, and every attempt to line that box up
with a text canvas is a magic number that breaks again at the other UI scale
tier.

**THE ERRANDS ARE ANSWERED ON THREE SURFACES, AND EACH ANSWERS A DIFFERENT
QUESTION** — which is why none of them can be folded into another:

- **THE TRACKER** (right of the field, under the minimap — WoW's objective
  tracker) is "how many more", read without stopping. It shows only RUNNING and
  finished-not-handed-in work, caps at three, and is tap-transparent, because
  the right-hand third of a landscape phone is where the steering thumb lives.
- **THE FLASH** (`QuestFlash.tsx`) is "that one counted", over the MIDDLE of the
  field. The tracker is always right and nobody is looking at it: a player who
  just killed the thing on their list is looking at the thing they just killed.
  It rides the engine's `questProgress`, emitted from the ONE `bump` every kind
  of progress goes through, so a kill off a list, a named elite going down, a
  fetch piece walked over and an escort delivered are all announced without four
  call sites — and it words itself with `objectiveLine`, so it can never
  disagree with the strip it is announcing.
- **THE LOG** is "what was I doing", read with the play stopped. It is raised by
  the HUD's own `!` button (beside the bag pouch) and freezes the run in its own
  **`questLog` phase**, exactly as the fog-of-war map does — a phase rather than
  an app-side pause, so nothing else has to be told a screen is up and the pause
  menu stays the pause menu. The button is GOLD once the run has taken an errand
  and grey until then; an untaken OFFER deliberately does not light it, since
  two givers stand on every map from the first frame and counting those would
  leave it permanently gold and saying nothing (that offer is already announced
  by the gold `!` over the person's own head). It used to hang off the pause
  menu, which put the answer to "what was I doing" two presses deep behind a
  screen about quitting.

The wording those three share is the leaf `pwa/src/game/quest-text.ts`
(`objectiveLine`), not the offer modal it used to live in: the run loop's event
pass reaches it on every bump, and a wording helper inside a modal component
would drag the modal into the loop to get at it. The tracker is kept live by the
quest tally being folded into the HUD change-key (`hud-model.ts`) — it reads
`state` directly, so without that a delivered escort moved nothing the key was
watching and the strip sat on a stale count.

## MULTIPLAYER — the simulation moves out of the renderer

**Steam builds only, except the DEDICATED SERVER, which is plain Node.** PRs 1,
2, 1.5, 1.75, 2.5, **PR 3's §3.1**, **PR 4's §4.2-abandoned-hero + §4.3** and
**PR 5** of the ten in `docs/multiplayer-plan.md` have landed: a session server,
the wire, the fifth bridge, two transports, a challenge handshake, chat,
`/players N`, a closed list of 74 named commands covering everything the app
DOES to a run, the three doors a player walks through (HOST GAME, the server
browser, JOIN BY ADDRESS), the in-run chat, the live session panel, the invite
launch arguments — from PR 3, a run that carries a **PARTY** — from PR 4, the
**CO-OP RULES** (whose the XP is, whose the loot is, what heats the meter, and
what a body nobody is steering means) — and from PR 5, **PRODUCTION**: the party
stamp, the joiner's loadout check, the packet budget and the fuzzed decoders,
RECONNECT, TRADE, and a standalone dedicated server.

**FIVE PR 5 RULES, AND EACH IS A DIFFERENT KIND OF TRUST.**

1. **A CO-OP RUN BANKS NO RECORD — `GameState.party`, a `PartyStamp`.** The host
   is a player, so the host can cheat, and seven people helping inflates every
   board-facing figure without anybody having to. It is LATCHED in `seatHero`
   rather than passed in as a session parameter, deliberately: a run is marked
   by what HAPPENED to it (a host playing alone with the door open is playing
   solo), a parameter is a thing one of three builders can forget, and as
   ordinary DYNAMIC state the latch replicates for free. It never clears. The
   two readers genuinely disagree, so the ledger keeps both — a party kill
   counts for everyone on the BADGES, and for nobody on the BOARDS, which read
   `LifetimeTotals.solo`.
2. **A JOINER'S HERO IS A CLAIM — `validateLoadout`.** Level inside the ladder,
   each stat inside the level's own `statCap`, every item mintable from the
   catalogs. That last one is the CRASH rather than the cheat: `gearDef` throws
   on an id it does not hold and is called from the damage pass and the paper
   doll. It SANITIZES rather than refuses (the case it fires on most often is an
   older save with a retired id), logs host-side only, and is **a speed bump,
   not a wall** — everything it checks is something a real hero could have.
3. **A SEAT IS A LICENCE TO BE HEARD, NOT AT ANY RATE.** The hub's three older
   bounds stop a stranger; the packet budget covers the peer who got IN. Over
   the allowance a packet is DROPPED (what the reliability layer already does to
   a lost datagram); only a real DEBT is a kick. And **every decoder is fuzzed**
   — which found four crashes in the DELTA APPLIER, reachable by a malicious
   HOST rather than a client, since a joiner applies whatever it is sent.
4. **A DROPPED PLAYER COMES BACK TO THEIR OWN HERO.** The seat is HELD for
   thirty seconds and the person who left holds the only ticket. The ENGINE only
   honours a flag (`Player.held`) because it has no clock; the SESSION owns the
   window. A resume IGNORES the loadout on the join — the hero on the field is
   the authority — and an unknown ticket is an ordinary arrival, never a refusal.
5. **A TRADE IS ONE TRANSACTION OR IT DOES NOT HAPPEN — `src/game/trade.ts`.**
   An offer names a CELL and an ID and the cell is re-read at settlement (a cell
   alone may have changed; an id alone would have to be searched for, which is
   how a trade hands over something nobody put on the table). Any change clears
   both acceptances. An offered piece may not be equipped, discarded or moved. A
   departing seat's trade goes with it. There is deliberately **no shared
   stash** — that is account-shaped state with a migration ladder, and what
   players mean by "trade" is handing a friend the sword you just found.

**AND `applyRunCommand` TAKES THE ACTING HERO** (PR 3's §3.6 debt, paid because
trade could not be correct without it). It dispatched all 69 verbs against
`state.players[0]`, so a joiner's shop, equip and stat spend acted on the host's
hero. The hero comes from **the seat the session admitted that client into** and
never from a field on the frame: letting a client name a seat would hand a
stranger somebody else's inventory in one field. Seat 0 is the default, so
single player is unchanged.

**THE DEDICATED SERVER IS THE SAME CODE, AND `server/host.ts` IS WHY.** It owns
the session, the admission desk, the sockets, the router mapping and the one
fixed-timestep loop; `main.ts` picks its entry from whether anybody forked it
(`parentPort` → the game's session server, none → `dedicated.ts`). Running one
found the bug it exists to find: the host is identified by being the FIRST
client to ask for a seat, which holds only because the shipped topology always
seats a renderer over a `MessagePort` first — so the first network joiner was
mistaken for the host and handed a DEFAULT hero. `SessionOptions.ownerless` is
the answer, and three rules follow: seat 0 starts DEPARTED so the first arrival
takes it with their own loadout, an empty server does not simulate at all, and
the run is a PARTY run from the first tick.

**THE RUN IS A PARTY, AND `game/party.ts` IS THE ONE MODULE ALLOWED TO ASK IT A
QUESTION.** `GameState.players` is a NON-EMPTY tuple of heroes in SEAT order
(`[Player, ...Player[]]` — the type states the invariant, so `players[0]` is a
`Player` while `players[seat]` is `Player | undefined` and has to be checked).
Seat 0 is the host's and is the only seat a single-player run has; nothing in the
engine treats the one-element case specially, because a pass written against one
hero silently means "seat 0" the day a second player arrives.

**THE READS SPLIT EXACTLY TWO WAYS, and knowing which you have is the whole
job.** A **PRIVATE** read — the bag, the purse, the build, the talents, the worn
kit — is about ONE hero and is a **PARAMETER**, never a lookup:
`effectiveStat(state, player, stat)`. A pass reaching for seat 0 to find a bag is
a pass that has not been parameterized yet. A **GEOMETRY** read is about the
party and needs a party-aware answer — nearest, any, all, or centroid — and
picking the wrong one is a design bug rather than a typo: `anyHeroWithin` wakes a
pack (one half the party walked past is a pack that never fights) where
`nearestHero` is what a mob chases.

**WHOM A MOB CHASES IS THE NEAREST _VISIBLE_ HERO, WITH HYSTERESIS**
(`src/game/aggro.ts`), and each word is load-bearing. Nearest, or a party parks
one hero across the map and farms with seven. Visible, because the horde already
refuses to chase a hero it cannot see, and ignoring sight leaves mobs grinding
into walls toward the nearest hero while a second stands beside them in the open
(sight OUTRANKS the hysteresis — a lost quarry is given up however near it is).
Hysteresis, because "nearest" alone is a coin flip between two players a pixel
apart, re-tossed sixty times a second. The answer is remembered on the mob
(`Enemy.quarry`) so the move, the reach, the ranged lead and every mechanic's
locked bearing agree about who is being fought.

**THE HORDE IS BUDGETED AROUND THE PARTY AND PLACED AROUND A HERO.** The camp
anchor tracks the centroid (on seat 0 a group farms forever by parking one
player); the wave ring is drawn on ONE player, because a ring round the centroid
delivers the horde into the empty floor between two players at opposite ends of a
hall; its level is the party's HIGHEST (D2's rule — an average carries a level-1
alt through a level-90 map by arithmetic). A **BLAST** bills every hero in range;
the single-victim hazards keep their single victim BY DESIGN, because `struck` is
a fact about the gust rather than about the party. The **FOG IS SHARED** — one
grid on the run, lifted by whoever walks. The **RUN ENDS WHEN THE PARTY FALLS**
(`partyWiped`), not when a hero does.

**A SEAT IS APPENDED, NEVER INSERTED, AND NEVER SPLICED OUT** (`seatHero`,
`src/game/seating.ts`). Every command and input frame in flight names a seat by
INDEX, so renumbering the party mid-run delivers seat 4's steering to seat 3's
hero. A joiner arrives BESIDE the party rather than at the level's spawn, with a
hero built by the same `createHero` seat 0 was and dressed in the loadout they
brought; the seat is the SERVER's answer and travels back in the `welcome`. App
side, `localHero(state)` (`pwa/src/game/local-seat.ts`) is which hero this screen
is about — 0 offline and for the host, so single player never goes near it.

**SO A PLAYER WHO LEAVES IS `departed`, AND `heroInPlay` IS THE ONE PREDICATE
THAT SAYS WHAT THAT MEANS.** The body stays at the index it always had and the
world stops answering for it: not chased, not in the centroid, not in
`partyLevel`, not a pack's alarm clock, not a hazard's victim, not a share of the
menace meter's per-capita read, not stepped at all — and NOT ALIVE, so
`partyWiped` fires. That last one is the whole point: four separate rules used to
answer for the body by accident, and the worst of them made a group whose fourth
player quit UNDEFEATABLE — the abandoned hero stood at full health for the rest
of the run while the three still playing were wiped over and over. The predicate
folds "at 0 hp" and "nobody is steering this" into ONE check on purpose, because
every question above has the same answer for both and splitting them is how one
of the eight sites quietly keeps reacting to a body nobody is behind.
`nextFreeSeat` then RE-USES the emptied seat, which is only safe because the
departing player's commands and frames left with them — a seat vacated by
anything else (a dead hero, a player in a menu) must never be recycled.

**WHAT A KILL IS WORTH, AND WHOSE IT IS — three rules that are each an exact
no-op at one hero, which is what makes them safe and is also the trap: a
single-player test proves nothing about any of them.**

1. **XP IS PROXIMITY-GATED AND LEVEL-WEIGHTED** (`src/game/xp-share.ts` —
   D2's shape, and both halves are counter-intuitive in the same direction).
   Without the GATE a party's optimal play is to scatter to four corners and farm
   four fights at once, which is four solo runs sharing a lobby. Without the
   WEIGHTING — i.e. with the even split that LOOKS generous — a level-90 running
   a level-12 hands over half of every kill, so grouping with somebody below you
   is a straight tax and nobody does it; weighted, the veteran keeps most of the
   pot and the newcomer still gains far more than they could alone, because the
   horde is priced against `partyLevel` and a sixth of a level-90 kill is a sixth
   of something enormous. **Only a KILL is the party's**: an arrow, an errand and
   a scripted award have an obvious owner and go through
   `grantXp(state, hero, amount)` directly, since sharing one out is a gift from
   the player who earned it to one who did not. The per-map XP cap reads the
   RECIPIENT's level, so a level-90 in the party cannot throttle the level-20
   beside them to an outgrown map's trickle.
2. **LOOT IS FREE-FOR-ALL BY DEFAULT, WITH A HOST TOGGLE FOR ALLOCATED**
   (`GameState.lootMode`, HOST GAME → LOOT) — decided deliberately rather than
   inherited from `Item` having had no owner field. `Item.owner` is stamped ONCE,
   in `dropItem` (the one funnel every drop goes through, which is why no call
   site had to learn who killed anything), from the heroes who were in the fight,
   and never re-decided. **The roll is off the ITEM'S HASH, never `state.rng()`**
   — the same rule the toss scatter follows — or an allocated session would roll
   DIFFERENT ITEMS from the same seed than a free-for-all one.
3. **THE MENACE METER READS THE PARTY'S OUTPUT PER CAPITA** (`tickMenace`). What
   it is handed is the RUN's summed damage and kills, and "is this too easy" with
   eight people in the room honestly means "is it too easy FOR EACH OF THEM". Fed
   the raw sum it reads eight times the DPS it was tuned against, saturates within
   a minute, and — because the evolution ratchet is a PERMANENT floor within a run
   — never comes back down: an untuned meter does not make co-op hard, it makes it
   hard FOR EVER after the first minute.

**AND `stepItems` IS TWO LOOPS, NOT ONE.** A toss's arc and a mercy angel's
descent are facts about the ITEM (one dt each per tick); a pickup is a question
each HERO asks. One loop over the party counts every arc down N times as fast, so
every drop in the game lands in an eighth of its flight the day a second player
joins. Heroes reach in SEAT order, which is the only tie-break that replicates.

**WHAT IS STILL OWED HERE — and §4.3's measurement is the sharp one.** PR 4's
"measured pass, not a guessed one" for the menace and `/players N` COULD NOT BE
RUN: `scripts/simulate-run.mjs` flies exactly one hero, because the autopilot
reads `state.players[0]` at 164 sites across `src/game/bot/` and `botAct` has no
notion of WHICH hero it steers. The rules above are therefore STRUCTURE with
their reasoning stated and unit-level proof (`tests/engine/coop_rules_test.ts`),
not tuned numbers — do not record them as measured. Parameterizing the bot on a
`Player` is the prerequisite and **has landed** — `botAct(bot, state, hero)`,
164 sites, proven byte-identical on two full seeded campaigns — so the simulator
flying a party (§7.2) is what the measured pass now waits on; then
`XP_SHARE.partyBonusPerHero` and the `/players N` pairing are the levers. §4.2's
corpse and respawn are BLOCKED on §3.2's per-player `dying` screen.

**EVERY ONE OF THOSE IS NOW INVENTORIED IN THE PLAN'S PR 5.5 — "THE REMAINDER" —
AND THAT IS THE ONE PLACE TO LOOK.** A dozen "NOT LANDED" boxes scattered across
eleven PR sections is how a debt stops being anybody's, so §5.5 collects them,
says which are BLOCKED and on what, and gives the order they unblock each other
in: **§7.1 (landed)** → §7.2 → §4.3's measured pass → §7.2.5 → §5.6's soak →
§3.2 → §4.2's corpse → §3.3.

**THE BOT TAKES THE HERO IT STEERS — `botAct(bot, state, hero)`.** Nothing under
`src/game/bot/` reads `state.players[0]` any more, and a new one is a
regression: the app passes `localHero(state)`, the simulator passes the seat
each of its bots was given, and a single-player caller passes seat 0, which is
the identity case that let 164 sites move at once. `tests/engine/bot_party_test.ts`
is the guard — every OTHER bot suite flies one hero and would pass with the
refactor reverted. It also separates out the FOUR that no diff can close (a packaged
Electron launch, eight machines through a real NAT, a real router, the per-OS
firewall prompts) — those need a human with hardware, and writing them as work
items is how they get ticked from a diff.

**WHAT §3.1 DELIBERATELY LEFT — see the plan's §3.6.** A screen one player opens
still stops the world for everybody (`Player.screen` and the non-blocking
level-up are §3.2, and the level-up is a real single-player behaviour change that
owes the changelog its own line); nothing is predicted, so a client shows its
hero where the last snapshot put him (§3.3); and a joiner
still plays on the THROWAWAY `spectatorCharacter`, so nothing they earn reaches
their roster (PR 4's §4.5). The command channel's missing SEAT was the third of
these and is PAID — see the rule above. Their run commands travel but are NOT applied locally
(`setCommandSink(…, { optimistic: false })`) — the server is authoritative over
the result, so an optimistic apply would draw an outcome the next snapshot may
not agree with.

**THE PLAN WAS AMENDED TWICE FOR THE SAME FAILURE — a layer ships and the cutover
does not — and PR 2.5 found the third instance of it**: `hub.ts` was the host's
admission desk and NOTHING spoke the other side of that conversation, so a JOIN
screen built to the plan's own letter would have been a door into a handshake no
client could complete. `server/net/connect.ts` is that other side, and the
session process has TWO ROLES because of it: `start` makes it a HOST (it
simulates), `connect` makes it a JOINER (nothing simulates; a socket is opened
outward and the same `MessagePort` carries somebody else's frames to the same
renderer). The page's client cannot tell the two apart — which is the whole
reason joining cost one module rather than a second client, and the shape to
preserve.

**A HOSTED GAME IS A RUN, NOT A LOBBY.** HOST GAME is the SESSION's settings and
its START row walks into the ordinary difficulty and mission pickers; the one bit
that travels from the screen to the run is `armHosting` (`session-intent.ts`),
consumed by `run-driver.ts`, which opens the doors once the session is up. So the
LIVE status rows (the port the socket actually GOT, the address to hand a friend,
the router's answer, the seats and their pings) are on the PAUSE screen
(`game-screen/SessionPanel.tsx`) rather than on the title menu's HOST screen: a
session exists only while a run does. Building the lobby instead would mean a
second idle simulation standing on the map, and would make the host's own
renderer a client of a session it did not build — which is PR 3's cutover.

**A RUN IS NOT `createGame(params)`, AND THAT IS THE RULE TO CARRY.** The app
performed six mutations after `createGame` that no session parameter could
express — the hero's campaign quest chain, the purse funded from his whole
banked wealth, the thoughts he had already read, a `?scenario=`, an opening
already watched on this difficulty, and a bot run's dialogue mute — so a session
built from those parameters held a DIFFERENT world from the one the app built,
and the client's first delta (the one whose emptiness the whole static tier
rests on) would have carried the difference as corrections to a run that was
right to begin with. Five of them are parameters now, applied by ONE function
(`createRunFromParams`, `src/game/session-setup.ts`) that the app, the session
and an arriving client all call; the sixth is dev-only and deliberately does not
travel. **Anything the app does to a run before its first tick is a session
parameter, not app code** — a field added to `createRunSession` and not to
`RunParams` is a desync that presents as a replication bug.

**WHAT IS STILL OWED, and none of it can be met by reading a diff:** the eight
machines over each transport through a real NAT, the UPnP mapping against a real
router, the firewall remedies on each OS, and a PACKAGED launch (`npm run
electron`) — PR 1.75's own §1.75.4 debt, inherited. Five of the autoplay bot's
housekeeping calls also still mutate the state directly (four are plain verbs;
the fifth carries the bot's own swap memory and is a real design question).
`docs/multiplayer.md` is the shipped architecture; the plan is the roadmap and
carries the amendments. Nine rules are load-bearing:

1. **ONE PROCESS PER SESSION, AND THE HOST IS JUST ANOTHER CLIENT.** The
   simulation runs in a `utilityProcess` (`server/main.ts`, forked by
   `electron/src/session-host.ts`) rather than in the main process or the
   renderer. Three independent reasons: a 60 Hz simulation must not compete
   with the main process's IPC, window, Workshop and Steam duties; the engine
   holds 36 process-global mutable bindings (the `BALANCE` object, the flags in
   `src/game/flags.ts`, every `activeXDefs` catalog `registerDefs` swaps for a
   mod) which are not per-`GameState`, so a process boundary is what stops two
   sessions stomping each other; and it leaves exactly ONE code path, which is
   why nothing in this feature has an "and also, when you are the host…" clause.

2. **THE STATE SPLITS THREE WAYS, and `server/wire/split.ts` is the one table.**
   STATIC is never sent — the level is a deterministic function of the
   `SessionParams`, so the client's own `createGame` builds the obstacles, the
   decor, the canopy and the carve (~100 KB per level, per client, that the wire
   never carries). DYNAMIC is delta-coded every third tick. PRIVATE — the bag,
   the purse, the build — goes to its owner ALONE, and that is a WITHHOLDING
   rather than an omission: a client that never RECEIVES another player's bag
   cannot manipulate it, which is the anti-cheat boundary PR 5's trade window
   rests on. The client deletes the private fields its own `createGame`
   invented, or a spectator's HUD draws a bag belonging to nobody.

3. **A DELTA IS CODED AGAINST WHAT THE CLIENT ACKNOWLEDGED**, never against the
   last thing sent — so a lost frame costs one frame of smoothness and can never
   desync, and every publish between two acks re-sends the same ground. Its
   corollary is the trap that would be silent: the server's stored baseline must
   be its OWN data, not a reference into the live state. `diffState` copies
   nothing (deliberately), so a baseline holding live objects compares the
   running world against itself, finds nothing changed, and the client simply
   stops receiving updates.

4. **THE DIFFER IS GENERIC, AND MUST STAY THAT WAY.** A hand-written packer per
   engine type is a second definition of every one of the ~120 shapes under
   `src/game/types/`, and its failure mode is silence — a def grows a field, the
   packer does not, and the field stops replicating with every test green. So
   `server/wire/delta.ts` walks whatever it is given and picks a strategy by
   LOOKING (nested object, id-keyed array, byte array, plain value). The one
   thing it must be told is `split.ts`. Beware a "cheap guard": obstacles were
   once skipped unless `obstaclesVersion` moved, which is the counter the
   autopilot's nav grid uses — it bumps on add/remove and never when a crate is
   SHOT, so every breakable froze at full health on the client.

5. **EVENTS RIDE THE SNAPSHOT, and the server must not lose any.**
   `state.events` is how the app plays every sound, flash, gore burst, blood
   soak and haptic, so replicating it made the entire FX layer work on a client
   with no change at all — the cheapest thing in the whole plan. But `step()`
   clears the list every tick and a snapshot goes out every THIRD tick, so
   publishing it live drops two ticks in three. `session.ts` accumulates them.

6. **A CLIENT MAY SEND INPUT AND NAMES FROM A CLOSED LIST — nothing else.**
   Input frames carry `GameInput` (never a position: a client that sends
   positions is a client that can teleport). Everything else the app used to do
   by calling the engine directly travels as a COMMAND whose name must be in
   `COMMANDS` (`server/wire/protocol.ts`) and is dispatched through an explicit
   `switch`. A channel that resolved a function name dynamically would hand a
   client `grantXp` and `mintUnique` the day PR 2 opens a UDP port. PR 1 shipped
   the nine scene-advance verbs; **PR 1.5 added the other sixty** — the screens,
   the run's flow, the bag, the counter, the build, the party, the errands, the
   conversations, the vault and the ride (the plan first said PR 3, which was
   circular, since the run loop cannot move into the server until every verb it
   calls can travel). Those are two jobs on the same names: PR 1.5 makes them
   TRAVEL with today's blocking semantics exactly preserved, PR 3 makes them
   NON-BLOCKING per player.

   **THE ARGUMENTS ARE PART OF THE SAME MODEL AND ARE SCALARS ONLY** — a number,
   a string or a boolean, never a structure, because a verb whose payload is a
   structure is a verb whose payload a stranger gets to shape. Each verb's arity
   and argument types are declared beside it in the ENGINE
   (`RUN_COMMAND_ARGS`/`applyRunCommand`, `src/game/commands.ts`) and checked
   before anything dispatches, with a string that names one of the engine's own
   unions checked against that union's runtime list rather than against `typeof
"string"`. **The names exist TWICE and the drift test is what keeps them
   honest**: the engine owns what a verb does, `server/wire/protocol.ts` keeps a
   literal copy for its allow-list because that leaf is read from the app's
   startup path where the 170 KB budget forbids `@game/core`, and
   `tests/engine/run_commands_test.ts` fails the build when the two disagree.
   **The app has ONE door onto the list** (`pwa/src/game/run-commands.ts`) and
   every call site goes through it; it applies through the same dispatch the
   server uses, so a verb cannot behave one way in single-player and another in a
   session. The one verb whose argument was NOT a scalar is why the AUTO PILOT's
   build baseline now lives on the run (`state.autopilot.build`, seeded from
   `SessionParams.autopilotBuild`) rather than on the app's flight session: a
   flight outlives a run, so the refund it owes has to survive the simulation
   moving out of the renderer.

   PR 2 adds CHAT, whose slash commands are a SECOND closed list
   (`server/wire/chat.ts`) for exactly the same reason — a chat box that handed
   the session an arbitrary verb would undo the command channel's allow-list
   beside it.

7. **THE TRANSPORT SEAM LIVES IN `server/net/`, NOT IN THE SHELL — and that is
   a deliberate departure from the plan's own file list.** The plan sketched
   `electron/src/net-transport*.ts`; its own §5.5 says the dedicated server "is
   the same file" as this one, minus Electron, and both cannot be true. So the
   seam (`transport.ts`), the reliability layer and the UDP transport sit beside
   the session, and only STEAM stays in the shell — because `steamworks.init()`
   is a single global handshake `electron/src/steam.ts` owns and the session is
   a different process. Its packets are RELAYED over the control channel into
   `server/net/relay.ts`, which presents them as an ordinary transport. Each
   half lives where the resource it needs lives; the session's view of the two
   is identical. The seam is POLLED and PACKET-SHAPED because the narrower API
   forces it: the binding is the legacy `ISteamNetworking`, with no sockets and
   no callbacks. Nothing owns a timer below the session — `Transport.tick()` is
   pumped from the session's own clock, retransmits, rate-limit expiry and
   router lease alike.

8. **NOTHING REACHES THE SIMULATION BEFORE THE CONNECTION IS ESTABLISHED —
   `server/net/hub.ts` is the one door.** An unadmitted peer may send exactly a
   padded `hello` and a `join`; every other frame from it is dropped unlooked-at.
   Three details are the whole security model and each is easy to undo:
   **the padding IS the anti-reflection rule** (a connectionless request must
   never be answered with more bytes than it contained, so a short probe is
   dropped in SILENCE — saying "you did not pad it" is itself the forbidden
   reply); **the challenge is a DERIVED cookie, not a remembered nonce**, so
   nothing is allocated between the probe and the join and there is no half-open
   table to exhaust — if this ever grows one, the flood defence is gone; and
   **the refusal ORDER is protocol → build → mods → challenge → password →
   seats**, cheapest and most fundamental first, so garbage is cheap AND the
   message names what the player can actually fix.

9. **THE BOUND PORT IS NOT THE REQUESTED PORT.** The socket walks 27015→27030 on
   `EADDRINUSE`, and every surface downstream — the status row, the lobby's
   advertised address — reads what it GOT (`Transport.bound`). A host reading
   27015 off a settings page while the socket is on 27016 is the exact bug that
   makes "direct connect doesn't work" unanswerable. Its two neighbours are
   separate files reporting separate rows on purpose, because conflating the
   three things that block an inbound connection is why "open your ports" is
   folklore: the ROUTER (`server/net/upnp.ts` — fully automatic, no permission,
   NAT-PMP then UPnP-IGD, asked for as a renewed LEASE so a crash cannot leak a
   permanently open port, and the external address comes from the router's own
   reply rather than from a STUN or "what's my IP" service the game promises it
   never talks to) and the FIREWALL (`electron/src/net-firewall.ts` — one
   prompt, once, on an explicit press, never at launch; it returns what the
   RE-CHECK said rather than whether the command exited zero, and always leaves
   the exact command copyable beside the button). And the honest limit, which
   the HOST screen must say out loud: reachability from the outside cannot be
   self-tested without an outside — the only proof is the first joiner.

**`/players N` MOVES `mobHp` AND `xpGain` TOGETHER, ALWAYS** — one pure function
in `server/wire/players.ts` because both ends read it. Kill XP is level-based,
so a hp-scaled mob is tougher and pays exactly the same XP for its level;
scaling `mobHp` alone makes `/players 8` strictly punishing rather than the
risk/reward trade D2 intends. The measured tuning pass is PR 4's.

**THE 170 KB CRITICAL-PATH BUDGET IS A LIVE HAZARD HERE.** The HOST and JOIN
screens ARE title-menu screens, i.e. the app's startup path. They may import
`@game/menu` and the import-free `@game/wire/*` leaves — never
`pwa/src/game/net/`, which reaches `@game/core` and would drag the whole
simulation into every player's first download. That is why the screens' own
files (`title-screen/menus-net.ts`, `use-sessions.ts`, `session-intent.ts`,
`net-text.ts`) talk to `pwa/src/app/net-bridge.ts` and to the wire alone, and why
the run's client is loaded behind the run's own lazy chunk.
`tests/content/net_reachability_test.ts` states the rule at the SOURCE level and
`pwa/scripts/check-seo.mjs` measures the bytes; do not raise the number.

**AND THE ENGINE NEEDED A NODE SHIP TARGET, which is its own small story.**
`npm run server:build` (`scripts/build-server.mjs`) STAGES the sources with the
`@game/…` aliases rewritten to relative paths, then compiles the copy — because
TypeScript refuses to emit a file whose import is both aliased and carries a
`.ts` extension (TS2877), and the engine's 112 `@game/lib/*.ts` imports are
exactly that. Type stripping was spiked and refused: it works, but it does not
resolve the aliases, and `utilityProcess` runs ELECTRON's bundled Node — a
runtime whose version moves with Electron, so a ship target resting on an
experimental flag in it breaks in a released build for a reason nobody changed.

## STEAM WORKSHOP MODS — players author content in the game's own format

**Steam builds only** (a browser has no Workshop and no filesystem). A mod is a
folder of YAML that players publish to the Steam Workshop; the SDK lives at the
repo's top level in **`mod/`** so it is findable in the open-source tree —
`mod/README.md` (the guide), `mod/FORMAT.md` (the reference),
`mod/examples/greenhouse` (a worked mod), `mod/tools/` (the compiler and CLI).
`docs/modding.md` is the architecture half. Four rules:

1. **A MOD IS COMPILED, NEVER INTERPRETED.** The desktop shell's main process
   compiles each mod once at load into a `ModBundle` of plain JSON, and only
   that reaches the page — which keeps the renderer sandboxed with no
   filesystem and no YAML parser in it. The format has **no scripting hook**,
   and adding one would turn "subscribe to a mod" into "run a stranger's code".
2. **ONE COMPILER, ONE SCHEMA.** A mod's level, MAP BLUEPRINT (`maps/`), enemy,
   item, item SET (`sets.yaml`), sprite, sound,
   score, power, TALENT (`talents.yaml`), COMPANION (`companions.yaml`) and
   STORY (`cutscenes/`, `thoughts.yaml`, `story-items.yaml`) are
   the same files as `content/levels/`, `content/maps/`, `content/enemies/`,
   `content/items/`, `content/sets.yaml`,
   `content/sprites/`, `content/talents.yaml`, `content/companions.yaml`,
   `content/cutscenes/` and the
   rest, going through the same loaders and the same validators —
   which is why `scripts/*-data/load-yaml.mjs` take a DIRECTORY rather than
   owning a constant, and why the item COOKING is shared out into
   `scripts/item-data/compile.mjs` rather than living in the generator. `node mod/tools/cli.mjs check` runs the code the game runs at
   load, so "it works in my mod" and "it works in the game" mean the same
   thing. Never add a second, friendlier mod schema; it drifts within a release.
3. **THE CATALOGS GO IN THROUGH `registerDefs`** (`pwa/src/game/mods.ts`) — the
   seam the engine test suites already used for synthetic fixtures, which is why
   mods needed no engine change. Sprites merge into the loaded
   `Record<name, ImageBitmap>` the renderer reads through `spriteByName`, so a
   mod's frames are indistinguishable from the atlas's. **A mod applies to a
   RUN, not an install**: `restoreBaseDefs()` puts the shipped game back when
   the run ends, and a hero carries a `ModStamp` rather than the mod's content,
   so a roster still reads correctly after the player unsubscribes.
4. **`mod/catalog.json` IS COMMITTED AND DRIFT-TESTED.** It is every id a mod
   may name, snapshotted as JSON because the compiler runs in the shipped app's
   main process, which has no TypeScript and no `src/generated/`. A content
   change that adds or retires an id runs `make mod-catalog` in the same commit
   (`tests/content/mod_catalog_test.ts` enforces it), exactly like the Game
   Center and Steam achievement manifests. It carries **no numbers** — a mod may
   NAME the game's content, never read its tuning out of a file that would then
   have to stay compatible for ever.

**THE LOAD ORDER IS THE FIFTH RULE, and it exists because the compiler cannot
help.** A clash with the BASE game is caught at compile time (an addon may not
shadow a shipped id; a conversion may). A clash between two MODS cannot be —
each is compiled alone, and its author never saw the other — so it resolves at
load by one rule covering sprites, levels and enemies alike: **later in the
player's order wins**. `pwa/src/game/mod-order.ts` is a leaf of pure functions
over the persisted `modOrder` setting, and three of its decisions are
load-bearing: the PERSISTED list is the source of truth for order (a list
rebuilt from what is installed would reshuffle itself, and silently change the
winner, every time the player subscribed to anything), a newly-seen mod is
APPENDED so a fresh subscription wins by default, and a move steps OVER
uninstalled entries so one press moves one visible row. `applyMods` re-merges
from the SHIPPED catalogs every time — never from what the last apply left
behind, or switching a mod off would not remove its content until a relaunch —
and RECORDS every override (`ModClash`) so the MODS screen can tell a player
which of their mods is losing and that moving it down fixes it.

**A POWER IS A COMPOSITION OF EFFECTS, AND THE EFFECT LIBRARY HAS TWO
CARRIERS.** `AbilityDef.kind` is a LABEL, never a dispatch key: it names the
effect a power leads with (for the surfaces that need one word for a whole
power — the dock, the bot's valuation, the ONE NUKE loot rule) while the engine
steps and the app draws whichever effect BLOCKS are present. So a def carrying
`trail` and `immolation` does both, and a mod can build a power the shipped
catalog has no equivalent of without the engine growing a member per idea.
Read `abilityBlocks(def)`, never `def.kind`, anywhere a power's BEHAVIOUR is
being judged. Composition is why `ActiveAbility.clocks` is keyed per block: one
shared cooldown was safe only while every def carried exactly one block, and
the moment one carries two, an orbit's bite resets a storm's strike timer.

The effects themselves live ONCE, in `src/game/ability-effects.ts`, because a
powerup and a GRANTED SPELL (the `spell` affix on gear, and the magic tree's
`conjure` talents) were two implementations of the same six things — same ring,
same prefilter, same `hitEnemy` path, in two files drifting apart. A carrier
supplies only what genuinely differs: where the numbers come from (a flat
authored block vs a rank curve that INT quickens — `<kind>SpellBlock` returns
the very block shape the YAML authors), the scratch, and the BILLING (a
powerup's output is exempt from the menace meter; a granted spell's heats it
like a weapon blow). Adding an effect means one function there plus a block on
`AbilityDef` plus its entry in `KIND_BLOCKS` — and both carriers get it.

**A POWER OWNS ITS LOOK AND ITS SOUND, because otherwise a mod's power can only
look and sound like whichever shipped power shares its effect.** The colour kit
is `AbilityDef.look` — authored in `content/powerups.yaml` beside the numbers it
colours, not in the app — and it is what makes two powers sharing an effect read
as different things (the DUST DEVIL and the EVENT HORIZON are both nothing but a
`well`). `pwa/src/game/powerup-fx.ts` is now only the accessor and the neutral
default an un-styled power falls back to. `AbilityDef.sfx` is the same idea for
audio, on the same seam `WeaponDef.sfx` rides: the id travels on the event and
the sound bus tries it before the event's own key. A burst carries its power's
kit onto the `Effect` (via the event's `defId`), so a mod's rain lands in its own
colours rather than in MOONFALL's grey.

The Workshop itself is the same three-file seam as cloud save and the
achievements: `electron/src/workshop.ts` is the ONLY module that knows Steam
exists, `electron/src/mods.ts` is the bridge above it, and what is uploaded is
the **authored folder**, not a compiled bundle, so a published mod stays
readable and forkable the way the game's own content is. The BUILD SYSTEM travels too: the three passive TALENT trees are
`content/talents.yaml`, so a conversion's hero no longer grows this game's
Warlord / Windrunner / Archon — and, because a talent's structured PROCS carry
their own numbers on the def and are found BY BLOCK rather than by id, a mod's
talent can fire one with its own tuning (one carrier per proc, checked over
base ∪ mod). Two things a mod may
NOT author, and both refusals are deliberate: a `grades:` ladder (minted at
engine load from a catalog compiled into the build, so there is no runtime seam
to add to) and the loot economy itself (`item_quality.yaml`/`item_rarity.yaml` —
a mod that moved the tier ladder would be rebalancing the campaign rather than
adding to it). A CONVERSION may also rename the game itself on the title screen
(`brand:` in its manifest) — the screen only, never the storage prefix, the
precache id or any discovery surface, and never for an addon. **THE COMPILER SHIPS OUTSIDE THE ASAR**, in a tree that MIRRORS
the repo's layout under `resources/modtools/` (`extraResources` in
`electron-builder.config.cjs`, resolved by `electron/src/resources.ts`): every
module in it finds its neighbours by relative path, so a flattened copy resolves
to nothing, and `yaml` has to travel with it because a package inside the asar
is not resolvable from a module outside it. Every `scripts/` directory the
compiler imports has to be listed there — a missing one is a mod that compiles in
the repo and fails on a player's machine with a resolve error, which is what
`tests/content/mod_toolchain_deps_test.ts` now walks the import graph to prove.

**A MOD'S STORY IS THE MOD'S.** The three-tier chain that makes
`docs/manuscript.md` the authority on every spoken line covers the SHIPPED
campaign and stops at the mod folder's edge: a mod's scenes, monologues and lore
are never filed into the manuscript and never corrected to match it (see **Story
& dialogue** below). The one thing a mod's story answers to is the schema.

**AND THE MEASURING INSTRUMENTS ARE THE MOD'S TOO — one `--mod <dir>` flag,
`scripts/mod-support.mjs`.** The compiler answers "is this valid"; nothing
answered "is this any good", so a mod author authored blind against a game whose
own content was built by rendering it, simulating it and pricing it. Every
analyzer, renderer and simulator in `scripts/` now takes `--mod` (repeatable, in
load order) — the map renderers, the campaign simulator, the drop/progression
probes, the whole weapon and relic battery, the sprite sheets — plus
`pwa/scripts/playtest.mjs`, which drives a mod in the REAL renderer. Three rules
hold it: the flag runs the SAME `buildMod` compiler the shipped app runs (there
is no looser tooling loader); the result goes in through the SAME `registerDefs`
seam `pwa/src/game/mods.ts` uses; and, tooling-only, the shipped catalog records
are merged IN PLACE as well, because half these scripts report on a catalog by
reading `ENEMY_DEFS`/`LEVEL_ORDER` directly rather than by playing it — which is
what makes `--mod` one line per script instead of a rewrite of each one's data
access. The browser half is the same seam from outside: a `__DEV_TOOLS__` +
`?debug` hook (`window.__mods`) hands the compiled bundles to the app's own
`applyMods`, so the harness loads a mod exactly as the MODS screen does. What a
mod author should run, and when, is `mod/AGENTS.md` step 5.

## THE TITLE MENU IS CONTENT — `content/mainmenu.yaml`

**The whole menu tree is authored, not coded.** Every screen the title menu can
be on, the ORDER of its rows, each row's LABEL, ICON and HELP line, and which row
opens which child screen live in one file — compiled by `make levels`
(`scripts/generate-menu.mjs` + `asset-tools/menu-schema.mjs` + `menu-data/`) into
the gitignored `pwa/src/generated/menu.ts`, which the builders read through
`pwa/src/game/title-screen/menu-tree.ts`. It emits into `pwa/src/generated/`
rather than `src/generated/` for the reason the sound bank does: a menu is an APP
concern, and the engine has no idea the game has a title screen.

**THE SHAPE IS THE FILE'S; THE BEHAVIOUR IS THE BUILDER'S.** A row's `action` —
what pressing it does, and whether this build offers it at all — stays in the
`menus-*.ts` builder that owns its screen; the two meet on the row's `id`.
`assembleRows(screen, rows)` lays a build's rows out in the TREE's order, taking
`null` for a row this build has no answer for (no parked run, no platform cloud,
no Workshop, no mature content) and THROWING for a row id no builder mentions —
because "deliberately absent" and "renamed on one side only" must not look alike.
Rows that come from a CATALOG rather than from the tree (the difficulty ladder,
the mission list, the rebindable actions, the balance knobs, the roster, the
installed mods, the coin packs) are built in code and concatenated around that
block; a screen then authors only its own fixed rows, and the alternates that
stand in for an empty list (LOADING, NO MODS INSTALLED, NO HEROES YET) sit where
the list would have been, so exactly one of them is ever on screen.

**TWO THINGS ARE DERIVED FROM THE HIERARCHY, and both used to be typed out
twice.** A screen's `parent` is where BACK and Escape go, and its `home` is the
row of that parent the cursor lands on — defaulting to the parent row that
`opens` it, so most screens never write one down.

- **THE TRAIL.** A heading's breadcrumb (`SETTINGS » CONTROLS`) is the chain of
  parent names, built at compile time. It used to be a string per screen in a
  `switch`, which is a second copy of the tree free to disagree with the first.
- **THE CURSOR.** `backRow(ctx, screen)` resolves the landing by ROW ID against
  the parent's list as it is built RIGHT NOW. Every BACK row used to carry a
  hardcoded INDEX (`backTo(ctx, "settings", 4)`), so inserting one settings row
  silently landed four other screens' back rows on the wrong thing — and a build
  that HIDES a row (no developer tooling, no cloud, no parked run) was off by one
  wherever it looked. Nothing passes an index any more except the handful of
  screens whose parent's rows come from a catalog, which the compiler makes
  declare `home: dynamic` rather than leave blank.

Escape reads the same `parent`, so it can no longer drift from the BACK row — it
had, and Escape from three of the settings pages walked the player out to the
front door instead of up one screen. Four more per-screen facts ride along
(`form`, `surface`, `scroll`, `notice`), each of which was a hardcoded list of
screen ids in `TitleScreen.tsx`.

**THE COMPILER REFUSES WHAT A TEST CANNOT SEE.** A parent chain that loops, a
`home` naming a row that is not there, a row that `opens` a screen whose BACK
would not come back, a plain page hanging under a developer one, a label or help
line using a glyph the pixel font has no cell for (it renders as `?`, silently),
an icon the atlas cannot answer for, two rows on one screen wearing the same
emblem, a label too long to sit beside its control on a phone. What the compiler
cannot check is the other half of the seam — that every authored row has a
builder — and `tests/content/menu_tree_test.ts` closes it by building every
screen for real.

**A MOD MAY NOT SHIP ONE, and that is a security rule rather than a tidiness
one.** Every other catalog arrives through `registerDefs` so a conversion can
replace it; this one does not. The tree decides which screens EXIST, so a mod
that could rewrite it could hand itself the hidden DEVELOPER tree — the level
warp, the balance multipliers, the free coin grant — on a shipped store build.
`scripts/menu-data/load-yaml.mjs` therefore takes no directory (the one loader
here that doesn't), and `mod/tools/build.mjs` REFUSES a mod that ships a
`mainmenu.yaml` rather than ignoring it, so the rule reaches the author instead
of being discovered.

**THE SHAPE ITSELF FOLLOWS THE ESTABLISHED PATTERNS, because a menu nobody has
to learn is the whole job.** The front door leads with the play verbs (RESUME
when a run is parked, then NEW GAME, then LOAD GAME once a hero exists to load)
exactly as it has since
Doom, and everything that is neither playing nor configuring is folded into
**EXTRAS** — the badges, the boards, the buy-back and the field guide. Flat, that
material ran the front door to eleven rows on a phone held in landscape. QUIT
sits last and exists only in the desktop shell (`pwa/src/app/quit-bridge.ts` — a
browser tab cannot close itself and a phone has a home button), so it is absent
rather than dead everywhere else. SETTINGS is six pages named the way every other
game names them — **GAMEPLAY** (what the game does for you), **CONTROLS** (how
you tell it what to do), **INTERFACE** (what the HUD draws), **VIDEO** (how the
picture is presented), **AUDIO**, **DATA** — because a player looking for the
blood switch opens VIDEO and a player tired of wearing every sword they pick up
opens GAMEPLAY. Nobody should ever have to hunt through THIS game's own filing
system.

## Developer menu (hidden)

The title screen hides a **DEVELOPER menu** behind a gesture in TWO MOVEMENTS,
and the split is deliberate: the first is a SECRET, the second is a TEST.
**Seven quick taps on the sun** (`SUN_TAPS`, `TAP_WINDOW_MS` — 0.9 s between
taps — in `pwa/src/game/title-screen/use-sun-charge.ts`) no longer unlock
anything; they ARM the star. Holding it then costs something — see **THE CLICK
RACE** below — and only the race's top detonates the sun and latches
`developerUnlocked` in the persisted settings (`pwa/src/game/settings.ts`),
after which the gesture disarms. The BUILD-UP is
half the secret: `sunChargeIntensity` maps the taps banked so far onto one 0..1
`--sun-charge` (registered with `@property` so it TWEENS, which is what makes the
charge swell in and ebb back out), and each layer in `styles.css` ramps off it
with its OWN threshold — tap 1 shows nothing at all, tap 2 is a breath of extra
glare, and only from tap 3 does the star plainly throw fire, shake and burn
hotter. Stop tapping and the burst lapses. The gesture is a plain **window
listener that hit-tests the press against the sun's rect** — not a button on the
sun: the sun is decoration the sky driver sizes and places each frame, and a
transparent target parked over it would swallow presses meant for whatever menu
row sits under it (a press on any real control is ignored outright).
`TitleBackdrop.tsx` owns the charge layers and plays the blast off its `detonate`
prop, reporting back when it's done. Every piece of the blast rests at
`opacity: 0` — they are all animation-driven, so a frame that paints one without
its animation applied would dump an opaque disc (or a white screen) over the
menu. The blast is anchored on the sun's STATIC seat (`SUN_X`/`SUN_Y` in
`title-sky.ts`, mirrored by `.sun-boom` in `styles.css` — keep the two in step)
rather than a per-frame custom property: writing one onto the shared parent
dirties the style of every node under it, sixty times a second. The detonation
does nothing else — the player then opens SETTINGS on their own,
where a **DEVELOPER** row now appears (it stays available across launches once
unlocked).

**THE CLICK RACE — the second movement, and the reason the sun is the meter.**
Seven taps is a secret you can be TOLD; once told, it costs nothing, which is
exactly the wrong price for a switch that turns on level warping and the
balance knobs. So the arming tap starts a race
(`pwa/src/game/title-screen/sun-race.ts`, a pure leaf over a clock): a press at
least every `RACE_BEAT_MS` (250 ms) is ON TEMPO and banks REAL TIME into
`heldMs`; drop the beat and the bank drains at `RACE_DECAY` (1.5×) the rate it
filled. `RACE_HOLD_MS` (5 s) banked and the star lets go — the same detonation
the seventh tap used to fire. Sit at empty for `RACE_LAPSE_MS` and the race
gives up, the star cools, and the gesture rearms at seven taps. Four rules:

1. **THE BANK IS FILLED BY TIME, NOT BY PRESSES.** A press is a promise about
   the next 250 ms, not a deposit — so mashing at 20 Hz buys nothing beyond
   never missing the beat, and the five seconds are five real seconds however
   hard the player hammers. Counting presses instead would make the target a
   number to game rather than a tempo to hold.
2. **THE DECAY IS ABOVE 1 ON PURPOSE.** At parity a lost beat costs exactly
   what it saves, so the race becomes an endurance test you may pause in the
   middle of. At 1.5× a slip SETS YOU BACK, which is what makes holding the
   tempo the thing being tested. (Worked example: 4 s banked, 1 s dropped
   leaves 2.5 s, so 2.5 s more are owed — not 1.5.)
3. **THE SUN IS THE METER — there is no bar, no counter and no number.**
   `--sun-race` (0..1) swells the disc to ~2.7× and burns it toward white;
   `--sun-tempo` cools it back toward red as the beat slips. Both are written
   STRAIGHT ONTO the sun and the glare by the hook's own rAF loop and are NOT
   tweened by CSS: the JS already owns the curve, and a transition over a
   per-frame write would lag the disc a quarter-second behind the thumb — which
   on a 250 ms beat is the whole game. Routing them through React state would
   re-render ten flame spans and eight embers sixty times a second to move one
   number. (`--sun-charge`, which IS tweened, is the opposite case: it steps
   once per tap.)
4. **THE SCALE IS FOLDED INTO THE SHAKE'S KEYFRAMES.** An element has one
   transform, so a `scale()` in a rule beside `sun-race-shake` would REPLACE the
   shake rather than compose with it. Same trap as the charge shake above it.

The growing disc is also its own growing TARGET — the hit test measures the
sun's live rect, transform included — so the race gets kinder to the thumb
exactly as it gets harder to sustain. Under `prefers-reduced-motion` the growth
stays (it is the meter) and the buzz goes. That screen offers **SELECT LEVEL** (the warp picker: pick any
difficulty and mission regardless of unlock state, skipping the intro), **VIEW
ARSENAL** (`ArsenalScreen.tsx` — a
scrollable gallery of every unique/legendary item, ordered by ilvl, each minted
via `mintUnique` and drawn through the shared `ItemCard.tsx` icon + card the
inventory tooltip reuses so the two never drift), **VIEW EFFECTS** (the EFFECTS
GALLERY — see below), a **BALANCE** subpage (see
below), a **DEBUG MODE** toggle
(`debug: "on" | "off"`, also persisted), a **FORCE STORE** switch
(`storeForce`, persisted — surfaces the coin store in any build with packs
granted FREE; see `pwa/src/game/store.ts`), a **MAP SIZE** row
(`generatedMapSize`, persisted: SMALL/MEDIUM/LARGE/RANDOM — every mission is
carved from its blueprint, so the size is the one knob left over the generator;
see **GENERATED MAPS** above), a
**VISUALS** subpage (the KNOCKBACK and BLOOD amounts, plus the **CAMERA PITCH**
and **CAMERA YAW** sliders that dial the whole world projection live — see **THE
WORLD PROJECTION** above), and
a feature flag. DEBUG MODE
shows the in-run FPS meter (`GameScreen.tsx` `showFps`, written to the DOM by
the render loop — the first probe for performance regressions) and is the hook
further developer diagnostics wire to via `getSettings().debug`. Keep it
distinct from the `?debug` URL param (console verbosity, `window.__game` /
`window.__scenario`, and the same FPS meter forced on — see
`docs/configuration.md`).

**NONE OF IT SHIPS IN THE STORE BUILD — and "does not ship" means the code is
gone, not hidden.** The reveal, the whole DEVELOPER tree, and the commit hash
beside the version in the title footer are gated on `__DEV_TOOLS__`, a
build-time literal `pwa/vite.config.ts` sets from `VITE_DEV_TOOLS`. It is TRUE
everywhere a human might want the tooling — the website, the installed PWA, the
`/preview/` and `/branch/` slots, local dev, and the native `preview` and
`testflight` apps — and FALSE for exactly one build: the `production` EAS
profile, the binary uploaded to the App Store / Play Store, whose embedded site
`native/scripts/bundle-web.mjs` builds with `VITE_DEV_TOOLS=off`. Because the
flag folds to a literal, Rollup drops `menus-developer.ts` and the arsenal /
effects-gallery chunks out of that bundle entirely. So a NEW developer surface
must hang off an entry point that is already gated (a DEVELOPER row, a screen in
`buildMenu`) or take its own `__DEV_TOOLS__ &&` guard — and a new persisted
developer SETTING must be reset in `stripDeveloperState` (`settings.ts`), which
scrubs the developer-owned settings on load so a TestFlight tester's unlocked
menu, FORCE STORE, or BALANCE multipliers can't survive into the store build on
the same device.

The **EFFECTS GALLERY** (`pwa/src/game/effects-gallery/`, also reachable at
`?effects[=<id>]`) is the FX iteration loop's front door: every visual effect the
game ships, one per screen, each staged as a REAL fullscreen game situation and
replayed on a loop — browse with the side buttons / ←→ (↑↓ jump a whole shelf),
narrow the catalog with the search box, a tap on the field (or `Enter`) runs the
show again, **`S` (or the SPEED chip) steps the diorama down through `1X` →
`1/8X` SLOW MOTION** (it scales SIM time, so the effect and the loop's own
show/replay rhythm stretch together — the only way to judge a burst that is over
in a fifth of a second), `H` hides the gallery's chrome for a clean look. Nothing is parked
in the middle of the frame — an effect detonates on the hero, so a button there
would be watched through. Two rules keep it honest. **The staging is the
engine's own scenario system**: an exhibit is a `ScenarioSpec` (the display-case
fields `reveal` / `muteDialogue` / `noVictory` / `runAbilities` exist for it), so
adding one is data, not a harness. **The firing goes through the engine EVENT
stream**: an exhibit pushes the same `GameEvent` a real fight would and the run's
own consumers (`applyEventFx`, the full-screen CSS bursts, the sfx bus) draw it —
so an exhibit can never drift from what ships, the way the ARSENAL reads items
through the in-game `ItemCard`. The MELEE, SHOTS and TALENTS shelves are
GENERATED from `weapon-fx.ts` and the talent catalog (`weapon-exhibits.ts`,
`talent-exhibits.ts`), so a new signature weapon or talent appears in the gallery
on the next build; `tests/content/effects_gallery_test.ts` fails the build when
one doesn't, when an exhibit's icon is missing from the atlas, or when it stages
an id that no longer exists. `pwa/scripts/effects-gallery.mjs` drives the same
deep link (`?effects=<id>&speed=…`) to write a numbered contact sheet of the
whole catalog: `--strip N` spreads N frames evenly across an exhibit's own show
(a filmstrip of the WHOLE effect rather than two moments of it), `--speed`
shoots it in slow motion, and every run composites into a single `sheet.png` —
a row per exhibit, frames left to right — which is what a review actually
reads.

The **BALANCE** subpage holds ~10 runtime balance multipliers (leveling pace,
mob strength, loot percentages, …) so the game's balance can be probed without
editing `src/game/config/` and rebuilding. The engine side is
`src/game/tuning.ts` (`setBalanceTuning`, neutral 1 defaults — except the world's
shipped PACE, which the HERO SPEED / MOB SPEED pair carries at 0.8 so TEMPO stays
a free lever at 1 — values clamped to
`[0, 100]`); each knob is applied at the ONE read site that owns its rule
(`grantXp`, `weaponDamageFor`, `spawnEnemy`, the drop ladder, `rollTier`,
`menaceSensitivity`, …), so it moves every surface of that rule together. Each
row is a **slider** (drag, tap the track, or steer with ←/→) spanning **0×
(system off) to 100×** the engine's authored value, where **1× is that value** —
never a percentage. The track is exponential: its four quarters cover 0→1, 1→2, 2→10,
10→100, so the useful low end gets most of the travel. The mapping
(`sliderToBalance`/`balanceToSlider`), the snap grid, the `×` readout, and the
knob catalog (labels, blurbs) live in `pwa/src/game/balance-knobs.ts`; the
drag track is the shared `@ui/lib/PixelSlider.tsx`. The values persist in the
settings (`balance` in `settings.ts`, applied on load like the other engine
flags) and a RESET ALL row restores the shipped 1× tuning. Keep the page around
ten knobs — one lever per system, not a config editor.

**Settings controls share three reusable pixel widgets** (generic React/UI, in
`pwa/src/lib/`, imported via `@ui/lib/*` for eventual extraction to
oss-framework): `PixelSlider.tsx` — the 0..1 drag track used by every slidable
row (the BALANCE knobs and the SOUND music/SFX volumes); `PixelToggle.tsx` — a
pixel ON/OFF switch drawn as the slider frozen at its two ends (same amber track

- blocky knob; off is empty/knob-left, on is filled/knob-right) used by every
  row that reads as a straight on/off (DEBUG MODE, AUTO LEVEL STATS, VIBRATION,
  XP ON KILL); and `PixelCheckbox.tsx` — a pixel
  tick-box (an empty grey square that fills with a smaller amber square when
  checked) used by every **multi-select** row where one picks one of MANY rather
  than flipping a setting (the EXPORT CHARACTER roster picker). The control (and
  a label-cycling `value`/`binding`) renders in `.menu-item-control` — a direct
  flex child of the row button, `margin-left: auto` to a shared right edge and
  vertically **centred across the whole row**, so a two-line row (the EXPORT
  picker, whose per-hero "LV 34 - SOFTCORE" is a `MenuEntry.subtitle`, not a
  blurb) centres the tick-box between both lines. All three widgets are
  presentational; the title menu wires them up via a `MenuEntry`'s
  `slider`/`toggle`/`check`/`value` field (`pwa/src/game/title-screen/` —
  `menu-model.ts` defines the row shape, the `menus-*.ts` builders fill the
  screens, `MenuList.tsx` renders the rows, and `TitleScreen.tsx` orchestrates),
  and the arrow keys steer the focused row's control (←/→). Pick the widget by meaning: a **switch** for a straight
  on/off setting, a **tick-box** for a pick-one-of-many list. Two-mode rows that
  are NOT on/off (MOUSE follow/hold, POWERUPS on-pickup/manual, QUICK BARS
  left/right corner) stay label-cycling buttons — a switch implies
  enabled/disabled, which those don't. AUTO-EQUIP does read as enabled/disabled
  (wear stronger finds at once, or leave them in the bag), so it's a switch.

**CONTROLLER NAVIGATION IS A TRANSLATION, NOT AN EMULATION.** A gamepad drives
every menu in the game — the title tree, the pause menu, the inventory, the
shop, the level-up chooser, the talent picker, the vault, the achievements
shelf, the arsenal, the high-score board, the item card, the effects gallery —
and NONE of them knows a gamepad exists. `@ui/lib/gamepad-keys.ts` dispatches
the synthetic arrow/Enter/Escape `keydown` events those surfaces already listen
for, and the fact that makes it work is that every one of them listens on
`window`. So the bridge is mounted ONCE, globally, in `App.tsx`, and a screen
added later is navigable without opting in — which is the opposite of threading
a gamepad prop through a dozen components, and the reason to keep it that way.
A pad button therefore earns a menu behaviour by being mapped to a KEY, never
by a menu learning to read a pad.

The one hazard is the FIELD, where the stick is already steering the hero and
arrow keys are rebindable to movement. The run suspends the bridge
(`setGamepadKeysSuspended`) off its own phase: `playing` means the run owns the
input, and EVERY menu and overlay the game can raise is a different phase
(`paused`, `levelup`, `shop`, `dying`, `victory`, `dialogue`), so they all keep
navigation and only live play gives it up. It is set every tick rather than on
transitions so no path out of a phase can leave it stuck, and cleared on
unmount so leaving a run always hands navigation back.

**The menu's selection cursor is pointer-type-dependent.** A mouse hovers, so it
keeps the **wisp** sprite riding the highlighted row (Doom's skull cursor). A
touch device hovers nothing — the wisp would just linger wherever the last tap
landed, leaving a column of rows that reads as flat text — so it drops the wisp
and gives each **navigation** row its OWN hovering icon instead
(`MenuEntry.icon`, a sprite name from the atlas: the front door, the EXTRAS
shelf, the SETTINGS index, the DATA rows and every BACK row). The icons bob like the wisp
does, each at its own rate and phase (`bobStyle` in `MenuList.tsx`, off the same
row-id hash the store's coins spin off), and each is drawn in its row LABEL's
color — grey until the row is selected, then amber — by `spriteMonoUrl`
(`assets.ts`) over `monochromeDataUrl` (`@ui/lib/atlas.ts`), which re-hues a
sprite while keeping its brightness, so the icon stays shaded art instead of
collapsing to a silhouette the way the pixel font's flat `source-in` tint
would. Both live in the same slot at the same
width, and a row without an icon still renders it empty, so the labels line up
identically either way; the swap itself is pure CSS (`(any-pointer: fine)` on
`.menu-icon` / `.menu-cursor`), so plugging a mouse into a tablet switches them
live. New icons are authored like any sprite — `content/sprites/icons/`, see the
`pixel-assets` skill — and an existing item icon is fair game when one already
fits (HIGH SCORES wears `icon_trophy`, STORE `icon_coins`).

**WHEN a row lights up is pointer-type-dependent too, and a highlighted row
GLOWS.** The highlight (amber label, lit icon, and an amber `drop-shadow` on the
label — `.menu-item.selected .menu-label`) marks the row the input is ON. A mouse
hovers and the arrow keys step, so both leave it resting where they left it. A
TOUCH has neither: `pointerenter` fires on a tap too, so a tapped row used to
stay lit as a stale cursor parked wherever the last finger landed. On touch the
highlight now follows the PRESS — lit while the finger is down, released with it
— with ONE exception: a row that carries help text AND is a control (`latches` in
`MenuList.tsx` — a switch, slider, tick-box, bound key, or cycled value) keeps
it, because the help line below has to name whose help it is showing and the
state the player just changed. A row that merely opens another menu explains
nothing once the finger is gone, so it doesn't latch. The press is tracked by row
ID, not index (a press that changes screens unmounts its row before release), and
released on a WINDOW `pointerup` for that same reason. That amber glow is the
selection's alone: the STORE row and the coin packs (`MenuEntry.shiny`) used to
breathe one permanently, which said "store" where the menu needs it to say "this
is the row you're on" — their treasure look is the struck metal and its
travelling glint (`PixelShinyText`), not light around the words.

**Every sub-screen leads with its own name, not with the brand.** Off the main
menu the title logo shrinks and dims to a watermark (`.title-header.sub`) and
the screen's **page header** (`MenuHeading.tsx`, fed by `screenHeading` in
`menu-tree.ts` — title, tone and the DERIVED trail, straight off the compiled
tree) takes over: the leaf name drawn LARGE and bright, the path to it
(`ScreenHeading.trail`) small and dim on the same baseline beside it
(`SETTINGS » CONTROLS`, using the font's own `»` glyph), and a rule underneath
that fades out at both ends to close the header off from the rows. The title's
scale is MEASURED, not fixed — `fitScale` steps it down until
`font.measure(title) × scale × uiScale` fits a share of the viewport, which is
what lets a long title (`CHOOSE YOUR NIGHTMARE`) share one rule with a short one
(`SOUND`) without either overflowing a phone or looking timid on a desktop.
Colour is a `HeadingTone`, not a per-screen hex: `player` and `dev` both print a
bone-white title (the tone shows in the trail and the rule — amber, mint) so
**amber stays the selection's alone**; only the coin vault's `store` tone gilds
the title itself. The sub-screens also lay a soft dark wash over the sky
(`.title-plate`, z-index 13 — above every orbiting body and the sun glare, below
the menu column, `pointer-events: none` so the hidden sun gesture still
hit-tests) because the sky drives the sun straight through the middle of the
viewport, which is exactly where a settings column's text sits. The main menu
keeps its undimmed logo, tagline and clean hero sky.

The **SETTINGS tree** (`SETTINGS_TREE` in
`pwa/src/game/title-screen/menu-tree.ts`, DERIVED from the screens the menu tree
marks `form: settings` — gameplay, controls, keybindings, interface, video,
audio, data, export, developer, visuals, balance, seed, and the BOT VIEW
`botspeed` step; NOT the `settings` index itself, which is a nav menu, so a new
settings page joins the tree by being authored rather than by being remembered)
renders as a **stable form** so changing a setting never reflows the page: the
menu takes a **fixed width** (`.title-menu.settings-menu`) so a cycled value or a
live `×`/`%` readout can't resize the block and shift the right-aligned controls
(a value row that isn't fixed-width gets its control shoved off the right edge
past a long inline blurb — the bug that put `botspeed` in the tree), and each
row's help `blurb` is hoisted OUT of the row to a single **bottom help line**
(`.menu-help`, a reserved-height slot showing the focused row's blurb) so
toggling a setting can't change a row's height or push the rows below it. Off the
settings tree the menus stay content-width with the blurb inline under each row
(difficulty taglines, per-level status, the front door and EXTRAS) — but a subtitle
that would just repeat one line on every row (the warp / BOT VIEW difficulty and
level pickers, whose heading already says the mode) is dropped, and the
`settings` index is a plain list of destinations with no subtitles.

**A settings row's help describes the state the setting is IN — never both
states at once.** "ON WEARS STRONGER FINDS AT ONCE - OFF KEEPS THEM IN THE BAG"
makes the player pick their own half out of a table on a line that's already
wrapping; "STRONGER FINDS GO ON THE MOMENT YOU GRAB THEM" (flipping to
"STRONGER FINDS WAIT IN THE BAG UNTIL YOU WEAR THEM") just tells them what the
game does right now. So a row's `help:` in `content/mainmenu.yaml` is a
map of STATE to line (`on`/`off`, a steering mode, a map size) rather than one
sentence — a bare string only for the rare row that reads the same either way —
and `onOffRow` / a label-cycling row (STEERING, POWERUPS, QUICK BARS, ITEM CARDS,
MINIMAP, GAME SPEED) picks the line for the state it is in. A row whose help is
COMPUTED (a live cloud sync state, how many mods are on, a level's clear status)
carries none in the tree and words itself in the builder.
Keep each line a single short statement in the present tense; the value column
already names the mode, so the help says what that mode DOES. **The help line
wraps at a fixed SHARE of the viewport** — `useHelpWrapRem`
(`use-title-layout.ts`), 80%, converted through the ACTIVE root font-size so the
one share holds across the 2× regime — never a fixed rem cap: a cap wide enough
to keep a desktop's help on one line ran a portrait phone's help wall to wall.
The tail of a wrapped line centres under the line above it (`PixelText`'s
`align="center"`), and `.menu-help`'s reserved height already fits two lines, so
folding one never moves the rows.

The AUTO LEVEL STATS flag gates a recently-added system so it can be toggled at
runtime — **opt-in, off by default** (the app applies the off state on load); a
developer turns it on from the DEVELOPER menu:

- **AUTO LEVEL STATS** (`autoLevelStats: "on" | "off"`) gates the automatic
  per-level base-stat growth (`src/game/leveling.ts`). The app applies it to
  the engine via `setAutoStatGainsEnabled` from `settings.ts` (mirroring how
  audio/haptics are applied). Off makes `autoGainAt` return 0, which cascades
  through `baseStatBonus`, `levelStatGains`, and `autoPowerScale` — so the
  hero's free gains AND the horde's compensating hp scale (menace.ts) switch
  off together and the balance stays whole. It gates simulation, so it needs an
  engine-side setter; a pwa-only flag would leave the engine unaware.

**A BOSS IS A CHARACTER, NOT FOUR FIELDS — the BOSS ABILITY CATALOG.** A boss's
set-piece moves used to be a CLOSED union of four (`charge`, `slam`, `enrage`,
`summon`), so every boss in the game was a permutation of the same four and a new
idea meant widening a type the whole engine reads. An ability is now a NAMED
entry in a catalog: authored as data in `src/game/defs/enemies/abilities.ts`,
stepped by one module under `src/game/mechanics/`, registered by id in
`mechanics/catalog.ts`. Adding one is a variant in the authored union plus a
module beside its siblings plus the boss YAML that names it — nothing else in the
engine grows a member per idea. The four originals stay named fields (a pile of
content authors them that way); they are the catalog's grandfathered entries, not
its future.

**Every ability obeys the same THREE BEATS, and the orchestrator owns two of
them** — which is what makes a fight learnable rather than a coin flip:

1. **TELL** — the boss strikes its OWN authored CAST POSE (`<sprite>_cast_0/1`,
   resolved by naming convention like the wound stages, so a boss earns the
   treatment by shipping two frames and nothing is registered anywhere) for a
   fixed, never-rolled `windupMs`. `stepEnemyMechanics` starts the windup, so no
   ability in the catalog can ever ship without one.
2. **CAST** — the move commits to a marker that is a THING IN THE FICTION. The
   bearing LOCKED at the tell reaches the handler as `AbilityCtx.lockedDir`, and
   it has to travel that way: the orchestrator clears the telegraph the instant
   the windup ends (that is what un-roots the mob), so an ability reaching back
   for `mech.telegraph` inside `cast` finds nothing, silently re-aims onto the
   hero, and quietly breaks the promise every tell in the game makes.
3. **RESOLVE** — damage lands, the cooldown starts (in the orchestrator, counted
   from the CAST, because the gap between casts is what a player learns to
   count), and the FIRST cast fires the ability's one-time `bark`.

**A BARK IS NOT DIALOGUE.** Every other spoken line freezes the run into the
`dialogue` phase, which is exactly wrong for a line whose whole job is to name a
move WHILE it is being dodged. A bark is its own event (`bossBark`) the app
floats over the speaker; play never stops. Manuscript-governed like any other
line.

**THE TOP RUNGS ADD MOVES, THEY DON'T JUST MULTIPLY NUMBERS.** Each entry carries
`minDifficulty` (compared on `DifficultyDef.index`) so NIGHTMARE and JESUS hand
the player a new thing to learn on a fight they already know, and
`windupFloorMs`, which squeezes a known move faster up the ladder but never below
an authored floor — a tell shorter than a reaction is not a tell, and the
build refuses a floor above its own windup.

**THE SET-PIECE FX ARE SPRITES, NOT SHAPES.** What this replaced was a strobing
`ctx.arc` ring around the body, a stroked circle for the slam's footprint and a
`ctx.lineTo` for the charge's bearing — primitives in a game whose every other
pixel is authored, and a stroked circle reads as a debug overlay because that is
what it is. The read is carried instead by the cast pose on the mob, then by the
GROUND (`render/boss-fx.ts`): a slam pools a soft pressure shadow, a charge kicks
authored grit down its locked lane, a beam is an authored slice tiled along its
own axis, and burning floor is a mottled outline-free char sprite with flame
licks standing on it. Three engine events (`enemySlam`, `enemySummoned`,
`enemyEnraged`) were emitted and consumed by NOBODY — a boss's slam landed for
more than its contact damage with nothing on screen at all — and are answered in
`event-fx.ts` now, in authored dust rather than in expanding rings.

THE CATALOG NOW CARRIES SIX, and four of them exist to prove the seam holds:
an ability may reach the world through its own PROJECTILES (`coin_cannon` — a
fan of coins that RICOCHET, `Projectile.bouncesLeft`, so cover stops being the
answer and the room starts being the question), its own STATE LIST (`bait_drop`
— PUMP AND DUMP, piles that look exactly like loot and price the pickup reflex;
they arm on a delay long enough to walk out of and go cold on their own, which
is what keeps a nasty move fair), or — twice — through an EXISTING HAZARD
SYSTEM pointed at a boss's intent instead of a level's timer. That last one is
the most valuable trick in the file: `airstrike` (ORBITAL DELIVERY) drops pods
that ARE meteors (`Asteroid.sprite`/`hatch`), so it inherits the firming ground
shadow the player has already been taught to read and is legible the first time
it is used; `call_horde` (CALL OF INCELS) calls a STAMPEDE, so it inherits the
approach dust, the trample and the answer ("get out of the lane"). Prefer
pointing an existing system at a new author over building a second one.

THE LAST TWO CLOSE THE SET, and both are shaped like an ANSWER rather than a
threat. `recompile` is a boss healing itself — the oldest cheap trick there is,
because the only response to a rising bar is "hit harder", which is a scolding
rather than a decision. It becomes a mechanic by putting the repair OUTSIDE the
boss: a node goes up, a visible tether runs to it, and breaking the node beats
any amount of extra damage. `lockdown` drops blast shutters in a ring around the
hero with exactly ONE gap — not a trap, a corner. A sealed box is a damage
window; a box with a door is a question, and the gap's bearing is rolled so it
stays a search. Both reuse machinery whole: the node is another `structure`
EnemyDef like the planted flag, and the shutters are ORDINARY `state.obstacles`,
so collision, line of sight, shot-blocking and the renderer all came free.

The one thing that was NOT free is `state.obstaclesVersion`. The autopilot builds
its nav grid once per level and caches it, so a wall that appears mid-run is a
wall it cannot see — it routes straight through and grinds. Anything that adds
or removes an obstacle must bump that counter; `ensureRoute` rebuilds when it
moves. Any future dynamic obstacle inherits the fix.

THE FLAGBEARER carries the catalog's first two. **LASER EYES** sweeps a beam one way
across a locked arc and leaves the regolith it crossed ON FIRE (`state.scorches`,
stepped in `hazards.ts`): the beam is one dodge, but the floor it leaves is what
makes a long fight cost the player their room. Two rules keep it honest — the
fire BITES ONCE PER CADENCE however many patches overlap (a sweep lays a band
several patches deep, so billing per patch would turn a readable hazard into a
spike set by how finely the beam sampled its own lane), and it BURNS OUT: a boss
may carve the floor, never delete it. **FLAG PLANT** (nightmare+) is the summon
with an ANSWER — the adds come out of a real, stationary, killable body
(`the_planted_flag`, an ordinary `EnemyDef` marked `structure: true` and paying
no xp) rather than out of the boss, so "break the thing making these" is a right
answer the player can find. Reach and arc are sized against the PHONE viewport
and judged in the EFFECTS GALLERY's own BOSSES shelf, never guessed — a sweep
that covers the whole visible floor is not a hazard, it is a wall.

**EVERYTHING ON THE FIELD CARRIES ITSELF — `render/gait.ts`.** A body that
slides across the floor at a fixed sprite rate reads as a token being dragged,
so every actor the renderer draws (the hero, the horde, the companions, the
merchant, the fauna) is animated by HOW IT MOVES. Two things make it work:

- **The walk is driven by GROUND COVERED, not by the clock.** The stride phase
  advances by `distance / STRIDE_PX`, measured frame to frame, so the tip and
  the two-frame walk sprite BOTH keep pace with the walker for free — a nudged
  stick creeps, a full push runs, a hero wedged against a wall stops walking on
  the spot — with no notion anywhere of how fast anything is supposed to be
  going. A walk is a soft tip about the FEET plus a rise on each step, and the
  two peak together, because they are the same moment (a body vaults over the
  planted foot) — ONE lean per step, alternating. The tip is SHARPENED (cubed,
  `TILT_SHARPNESS`) so the body stands upright between steps and leans only
  briefly over each one: a plain sine sits near an extreme most of the stride,
  which reads as a slow drunken sway rather than as walking. Standing still, it
  breathes instead, so a mob is visibly alive through its own dialogue.
- **`EnemyDef.locomotion` says which gait.** `legs` (the default) walks;
  `float` HOVERS a few px up on a slow drift over a ground SHADOW — ghosts,
  wisps, drifting cores, anything with no legs; `wheels` does neither, because
  a rover that rocked like a walker reads as a machine pretending to have legs.
  Presentation only, like `gore` — but note `canonicalEnemyDef`
  (`defs/enemies/index.ts`) rebuilds every def through a fixed field list for
  V8 monomorphism, so a new `EnemyDef` field must be added THERE too or it
  silently reads `undefined` with every check still green.

**A JUMP HAS THREE BEATS: takeoff, flight, landing.** The engine's `jump`/`land`
events carry the point, the `impact` (touchdown speed as a fraction of a
standing hop, so a Spring Heels launch lands heavy) and the ground `speed`. The
app answers with SQUASH AND STRETCH on the doll — he stretches off the floor and
folds into the landing (`impactScaleY`, keeping his volume by taking the inverse
scale across) — and with DUST at both ends (`render/dust.ts`): authored puff and
gravel sprites (`dust_puff_0..2`, `ground_grit_0..1`) drawn in neutral greys and
TINTED per landing to the colour of the floor he actually touched, sampled off
the baked ground layer (`groundColorAt`). That last part is the point: the moon
throws pale regolith, Mars rust, a base's deck plate grey — on carved maps and
any venue added later, with nothing authored per level. Impact sizes the cloud;
his ground speed smears it along his heading.

**BLOOD SCALES WITH THE BLOW, AND THE FLOOR REMEMBERS IT.** A hit that takes a
mob's whole bar and a chip that finishes one already down to its last fifth used
to throw the identical two-frame splash, so nothing the player did read as
harder than anything else. `bloodBlow` (`game-screen/blood-hit.ts`, a pure leaf
beside `corpse-launch.ts`) prices every landed blow in the victim's own STARTING
HEALTHBARS — `damage / maxHp`, the same number the kill launch rides, which is
what keeps it honest across the campaign instead of drowning the late game in
gore as the damage figures grow.

**That number then SPLITS IN TWO, and the split is the whole design.** VOLUME is
how much blood came out and it SATURATES — a body holds one body's worth, so a
blow ten times its health cannot spill more than it had; it owns the count of
the blood and how wet the floor gets. FORCE is how hard it was hit and has NO
CEILING — the same pint can be pushed out or blown clear across the room; it
owns the reach, the haze, the size of the pieces, and how far up the wound's
frame chain the splash gets. One shared severity was the first design and it
flattened the top of the range (a 3× and a 10× overkill both hit the cap and drew
the same picture); the split is what lets a level 99 hero in a level 1 crowd keep
escalating for ever. Three pieces:

- **THE SPRAY** (`render/blood.ts`, built like `dust.ts`): a CLOUD of colour
  under everything, a wound splash at the point of impact, droplets thrown along
  seeded bearings that arc up and back down, and a haze only a blow worth more
  than a scratch makes at all. The **CLOUD** is the one part that is not authored
  art and deliberately so — it is atomized liquid with no shape of its own, and
  pixel art is the wrong tool for a soft edge — so it is a handful of BAKED
  radial glows (`glowSprite`) thrown down the same cone the drops fly, blooming
  and thinning, and it is what makes a landed blow read before a single drop has
  travelled anywhere. It is **composited with plain alpha, never `lighter`**, and
  that is what lets one pass serve four families: additive is the obvious choice
  for a glow and is wrong here, because a machine's cloud is near-black and
  adding black to a floor draws nothing at all. Plain alpha lets red, green and
  violet lie over the ground as colour AND lets the oily one genuinely DARKEN it.
  Its alpha is deliberately low — this is a wash the fight is seen THROUGH, and a
  solid one hides the mob being hit, which is the one thing a hit effect may
  never do. The splash
  grows by walking FURTHER UP ITS OWN FRAME CHAIN rather than by being scaled —
  scaling a pixel sprite just resamples the art — and the chain runs past the
  16 px `blood_hit_*` ring into the `blood_burst_*` gore detonations, because a
  ring is the right picture for a solid kill and the wrong one for a blow a
  hundred times a body's health. Past `CHUNK_FORCE` the drops become authored
  PIECES (`blood_chunk_*`) instead of beads.
- **THE FLOOR** (`render/blood-ground.ts`) is **ONE BYTE PER TILE** — a
  `Uint8Array` of saturation over the level's tile grid, 28 KB for the biggest
  map, permanent, never evicted. A list of stains would grow with every kill and
  eventually have to start forgetting; a grid does not, so painting is `+=` and a
  floor with forty thousand hits on it draws exactly as fast as one with forty.
  **Making a grid of squares read as spilled blood is the entire difficulty**, and
  it takes four rules that each fix a distinct way it comes out looking stamped:
  1. **A LADDER, NOT A SWITCH** — four authored rungs (`blood_tile_0..3`), two
     variants each, mirrored on both axes off the tile hash, with the alpha
     ramping inside a rung so a stain darkens smoothly.
  2. **THE HEAVY RUNGS OVERHANG THEIR CELL** — they are 24 px blobs drawn
     CENTRED on a 16 px cell and nudged by the tile hash (`blot`, `JITTER_PX`),
     never blitted into the cell rect, so neighbours overlap and the boundary of
     a mess is the ragged union of a dozen blobs rather than the outline of the
     cells that happen to be stained.
  3. **THE TOP RUNG IS INTERIOR-ONLY** (`drawnRung`, its own leaf
     `blood-rungs.ts` so it is testable) — a cell may climb one rung above its
     four orthogonal neighbours AND may only reach the near-opaque top rung when
     all EIGHT are heavy. The orthogonal cap alone is not enough and believing
     otherwise shipped a bug: land a few kills together and every cell in the
     blob has soaked neighbours, clears the cap, and the blob draws as a
     RECTANGLE.
  4. **THE RIM IS AUTHORED, NOT FADED** (`blood_fringe_h/v`) — a pool's edge is
     not a fainter pool, so a cell much bloodier than the neighbour it faces
     frays into it with real edge art: transparent inside, a scalloped lip, then
     droplets petering out. Two sprites cover four directions via the flip cache.
     The interior MUST be transparent — a fringe with a solid inner half is a
     half-plane, and four of them on one cell union into a filled square.

  The floor is deliberately **STILL**: nothing on it animates. A moving specular
  glint over the soaked cells was tried and cut — a highlight that travels across
  a dark red mass reads as the blood BUBBLING, and a floor that simmers is a
  floor nobody believes. Blood on the ground is settled; the only thing that
  moves is the spray, and that is over in a third of a second.

- **ONE GATE, CHECKED IN ONE PLACE — `game-screen/gore-gate.ts`.** The device's
  MATURE CONTENT switch, the player's own GORE switches and the DEVELOPER →
  VISUALS **BLOOD** amount fold into one answer, `goreAmount(family)`, which is
  what everything that spills anything asks, `bloodBlow` included. Off means
  nothing is drawn AND nothing is recorded — a gate at the draw call would leave
  the grid filling up invisibly and hand the player a red floor the moment they
  switched it back on. Only ONE of the three is different in kind: a blow refused
  because the DEVELOPER amount is zero lands completely DRY, where one refused by
  the device or the player falls back to the plain two-frame splash (`splashOnly`)
  — that knob exists to clear a field for a screenshot, not to make the game
  gentler.

- **AND "IS THIS TOO MUCH" IS NOT ONE QUESTION — SETTINGS → VIDEO → GORE.** What
  was a single EXTRA GORE switch is a PAGE of eight, all shipping ON, because the
  one switch made a player who did not want to watch a PERSON opened up turn off
  the machines' sparks and the ghosts' ectoplasm with it. Three groups: one row
  per gore FAMILY (HUMAN GORE, GHOST GORE, ROBOTIC GORE, COSMIC GORE — so
  `goreBlood` off with
  the other three on is "no human gore", the request the split was built for),
  one per way a body comes APART (CLEAVES, GIBS — separate rows because a blade
  opening a body and a mass bursting it are separate sights, and both cross every
  family), and the two things blood leaves on the HERO (BLOODY HERO, BOOTPRINTS).
  Those last two are blood's own art in blood's own colours, so HUMAN GORE off
  leaves
  them nothing to do: they are shown LOCKED rather than hidden, the way a locked
  KEYS row shows where the movement went. A save carrying the retired `extraGore`
  key at `off` arrives as all eight off — a player who turned the gore off years
  ago must not be handed a page of switches that turned themselves back on. A
  ninth kind of gore is a switch here plus its row in `FAMILY_SWITCH`/`KIND_SWITCH`,
  never a new gate somewhere else.

**AND THE MAN DOING IT DOES NOT WALK AWAY CLEAN — THE SOAK AND THE TRAIL.** The
floor remembering a fight is only half of it; a hero still factory-fresh after
six hundred bodies is the loudest thing on the screen saying none of it happened.
So blood lands on HIM and stays, and his boots carry it out onto clean ground.
Both are pure presentation, priced off the very same `BloodBlow`, and both are
gated with everything else — at `heroSoakAmount()` / `bloodTrackAmount()`, which
are BLOOD's own gate plus each one's own switch.

- **THE SOAK IS FIVE NUMBERS, AND A ZONE IS A GEAR SLOT**
  (`game-screen/hero-soak.ts`): the four armor slots plus the weapon. That is the
  design, not a convenience — the only thing that ever CLEANS a zone is putting
  something new on it, compared on the piece's INSTANCE id, so swapping the
  breastplate freshens his front while the helmet he has worn all level stays
  crusted and a blade picked up off the floor comes up clean in his hand. The
  head zone is his FACE when he has nothing on it. There is no decay; he does not
  wipe it off.
- **IT ONLY LANDS AT CONTACT RANGE, AND THAT IS THE WHOLE BUILD DIFFERENCE.** A
  blow marks him if it landed about a melee swing away (`SPLASH_RANGE`, held
  UNDER the shipped blades' own 24–48 px) and not otherwise, so a hero who kills
  things by walking up to them wears every one of them and a gunslinger working
  at 160–300 px only wears what died in his face. Nothing anywhere reads a
  weapon's CLASS — the difference falls out of where the bodies were, which is
  also why a mage cornered in a doorway gets exactly as filthy as he should.
  GENEROUS IS THE FAILURE MODE: measured on autopilot runs, a 40 px range made a
  ranged build come out DIRTIER than a melee one, because in a swarm map almost
  everything eventually dies within a stride.
- **THE FLOOR MARKS HIM BACK, AND STOPS AT THE KNEES.** Standing in a pool wets
  the BOOTS fast and the shins a little (`wadeHero`), on a LOWER threshold than
  the trail's pickup — there can be far too little on a tile to track a print out
  of and still plenty to stain a boot. It never reaches his chest or his face,
  deliberately: the wade is the one source of soak that does not care how he
  fights, and a generous one climbing past his knees quietly erases the build
  difference above.
- **THE COAT IS MASKED TO HIS OWN SILHOUETTE AND IT MULTIPLIES**
  (`render/hero-coat.ts`). Authoring a bloodied twin of every sprite he can be
  drawn as is a combinatorial explosion (two costumes × three stride frames ×
  four slots × eighty generated overlays, plus whatever a mod adds), so the doll
  is composed into a scratch canvas and the coat is CLIPPED TO WHAT IS ACTUALLY
  THERE — it hugs gear that did not exist when the coat was drawn. And it
  `multiply`s rather than repaints: opaque red over him deletes the dark outline
  every sprite in the game is built on and a drenched hero becomes a red blob in
  the shape of a man, while multiply keeps the outline, keeps the shading, and
  makes the same four sprites work over white plate, brown leather and black
  mail. A second pass at `GLOSS` lifts it back toward blood red, because pure
  multiply over an already-dark boot goes to mud. **The WEAPON is composited
  separately**, inside its own swing pivot, or its blood would hang in mid-air
  while the blade swept out from under it. The DOM portraits (HUD bust,
  inventory, dialogue) run the same compositor off the same numbers — a hero
  drenched on the field and pristine in his own portrait is the feature
  contradicting itself on one screen.
- **THE TRAIL IS A CARRY, NOT A TIMER** (`render/blood-tracks.ts`). The boot
  holds a finite amount and spends one print per footfall, so the trail always
  fades out and always ENDS — a duration would print at full strength for N
  seconds and then stop dead, which reads as a bug. The step is GROUND COVERED,
  like the gait's (its own accumulator, because `walkGait` measures from its last
  call and a second call in a frame reads zero). Prints are PERMANENT like the
  floor's blood, so they cannot be a list that grows with the walking: they are
  BUCKETED BY TILE with a small per-tile cap, which bounds the whole record by
  the map's area however long the player paces one corridor. Orientation is
  quantized to the four compass steps and drawn from two authored sprites
  mirrored — the same trick the floor's fringe uses, because rotating pixel art
  to an arbitrary bearing resamples it. **A print must be DARKER than the spray,
  not fainter**: it lands on ground the fight has already freckled in the same
  three reds, so contrast is the only thing that separates it (the art carries a
  near-black pressed rim; a low-alpha print is invisible exactly where the trail
  matters most).

Judge both in the EFFECTS GALLERY — `blood-soaked` (DRENCHED) and `blood-tracks`
(BLOODY BOOTPRINTS) — and MEASURE the rates on a real autopilot run rather than
guessing: the whole feature is a curve over a map's worth of kills, and a
diorama cannot show you where that curve sits.

**AND PAST A POINT THE BODY DOES NOT SURVIVE THE BLOW AT ALL — THE CLEAVE AND
THE GIB.** The blood ladder above tops out at a spray; what it could not say is
that the body came APART. So a killing blow far past what a body could hold now
takes it apart, and **WHICH WAY IT COMES APART IS THE WEAPON'S DOING**: an EDGE
opens it (the sprite is cut in two along the swing and the halves keel outward),
a MASS bursts it (Quake's gibs — meat, gut, bone, organs and a head, thrown
across the floor). Everything else in the game lands blunt: a round, a bolt, a
spell, a bomb, a hazard, a bare fist.

**WHAT DECIDES WHETHER IS THE OVERKILL, AND IT IS QUAKEWORLD'S RULE —
`pwa/src/game/game-screen/overkill.ts`.** The measure is `damage - hpBefore`,
the health the blow spent PAST ZERO, carried in the victim's own healthbars so
one ladder holds from a moon rat to a rift horror; the engine supplies the
missing half on the kill event (`enemyKilled.hpBefore`, captured in `hitEnemy`
before the damage is spent, because a step later the mob's hp is negative and
the question is unanswerable). Quake bursts at `health < -40` against a
100-health bar, and `GIB_BARS` is that same four tenths — not an arbitrary
number, but the one that makes a rocket burst the man who was already hurt and
merely kill the one who was not.

**THE MISTAKE IT REPLACED IS THE ONE WORTH REMEMBERING, because it looks
identical from the code.** Judging on `damage / maxHp` — the size of the blow —
cannot tell a clean one-shot on a full-health mob from the same blow finishing
one already down to a sliver, and those are opposite events. So the honest
one-shot toppled while the mob hit by five times what was left of it came apart,
and what the player saw bore no relation to what they had just done — which is
what "it looks random" means from the outside, even though nothing in this
feature has ever rolled a die. Note the OTHER obvious reading, the ratio
`damage / hpBefore`, is wrong too and in a way a diorama will never show you: it
bursts a body on its last point of health with a blow of two damage, because two
is twice one. Spending the excess against `maxHp` keeps every case that was
wanted and costs a feeble tap nothing.

**THE RATE IS A READOUT, NOT A TARGET.** The share of deaths that come apart is
how far the hero's damage has outgrown the horde's health: an even trade dies
whole, a mob that dies in two hits and is left on a fifth of its bar bursts, and
a build one-shotting the fodder several times over bursts nearly all of it. So a
rising gib rate is the game reporting a rising power curve — measure it with
`scripts/gore-rate.mjs`, which plays campaigns and replays every kill through the
shipped ladder, and read the SPREAD across the rungs rather than the single
average. A flat rate at every difficulty is the one way this can be wrong while
still looking reasonable.

Five more rules:

1. **SHARPNESS IS CONTENT, NOT AN APP-SIDE LIST.** `WeaponDef.edge`
   (`edge: blunt` on the mauls, batons and knuckles; omitted means sharp,
   because most things that swing are blades) is resolved by the engine leaf
   `src/game/items/edge.ts` and rides out on `enemyKilled.edged`. The
   alternative — the app guessing from weapon NAMES — drifts the moment anyone
   authors a new one and could never include a MOD's. Nothing in the simulation
   reads it; damage, reach and cadence are identical either way.
2. **THE GATE IS `gore-gate.ts`, THE SAME ONE THE BLOOD ASKS**, checked in
   `kill-presentation.ts` where the death is DECIDED — and TWO switches have to
   agree, the victim's FAMILY and the KIND of dismemberment. What a refusal falls
   back to is the ORDINARY punt-and-topple, never the OTHER kind (turning cleaves
   off must not start bursting the bodies a blade would have opened) — the same shape the nuke's
   incinerate gate takes, and for the same reason (a censored blow whose bodies
   cease to exist reads as a bug, not as a gentler game). A boss NEVER comes
   apart: it speaks its last words over its own body and that corpse is the
   level's landmark of the fight. Nothing that doesn't bleed comes apart either
   — a wisp has no halves and a rover has no intestines.
3. **THE PIECES AND THE BLOOD ARE ONE LIST, READ TWICE.** `gore-burst.ts` owns
   what a body becomes and where each piece lands; `event-fx.ts` wets the floor
   at `landingSpots(burst)` and `render/gibs.ts` flies each piece to the same
   spot — so a head always comes down ON its own spatter. Either half deriving
   its own scatter is how you get blood pooled where nothing landed.
4. **A GIB FLIES LIKE LOOT DOES, AND WHAT BOUNCES IS WHAT IT IS MADE OF.** The
   arc, the shadow that tightens as it climbs and the tumble are the loot toss's
   (`items/toss.ts`) — a body's pieces and a body's drops leave the same corpse
   at the same instant, and the two reading as one event is most of what sells
   the kill. On top of it: a skull, a ribcage, a bone shard, a heart and a
   kidney are dense and BOUNCE; a liver, a gut, a hand and a slab of meat are wet
   and stick where they land. Get that pairing wrong and it is comically wrong —
   a bouncing liver is a beach ball.
5. **A BURST THROWS PIECES OF THE THING IT BURST.** `render/sprite-split.ts` is
   the one module in the game that takes authored art apart: `splitSprite` cuts
   a bitmap in two for the cleave, `shredSprite` cuts it into fragments that ride
   the burst — so a green alien throws green pieces, for every mob and every mob
   a MOD adds, with nothing authored per monster. Both are baked and cached
   (dropped by `ensureCaches`), and the cut angle is quantized into eight
   buckets: a cut is a canvas allocation, and one per body per frame on a
   screen-clearing kill is how a spectacle becomes a stutter.

**THE CLEAVE'S CUT IS ROLLED, NOT PICKED OFF A LIST, AND THE VARIETY IS THE
FEATURE** — a spectacle you have already seen is scenery, so a player a hundred
kills in should still be shown something new. A catalog of hand-authored cuts
gives however many rows somebody typed; `cleaveCut` (gore-burst.ts) instead ROLLS
the cut line — one of the four angles the pixel art survives, and a CONTINUOUS
offset along its own normal — which is unbounded. The bearing picks the family (a
blade that swept down the screen cannot open a body sideways) and the force
decides how near the MIDDLE the cut may fall, which is the whole ladder in one
number: a blade that just barely went through takes a head or a pair of legs, and
only a monstrous blow takes a man through the middle.

**EVERYTHING ELSE ABOUT A CUT IS DERIVED FROM WHERE THE LINE LANDED**, which is
what makes an unbounded catalog maintainable. `ANATOMY_BANDS` says what a person
is made of top to bottom (skull, neck, chest, belly, hips, legs) and WHAT IS
INSIDE EACH, and a cut spills the bands it PASSED THROUGH — so a cut at the neck
drops a skull and a brain, one across the belly drops the gut and the liver, and
one straight down the middle drops nearly everything, for free, because a
vertical line crosses every band on its way. Nobody wrote the bisection down.
Which piece is thrown clear and which is left standing is derived too: a piece
smaller than a third of the body is a LIMB, and a limb off the TOP flies (a head
has nowhere to stand) while one off the BOTTOM stays (a pair of legs is already
on the floor) — the game's two most memorable cuts, neither of them authored.
The geometry knob that matters is `BODY_WIDTH_FRAC`: a humanoid sprite is a
narrow column in a square frame, and measuring a diagonal's reach against the
frame instead makes every diagonal cross the whole body, every cut spill
everything, and the entire rule evaporate into one anonymous pile.

**THE THIRD AXIS IS DEPTH, AND IT IS AN ILLUSION A BILLBOARD CANNOT CONTRADICT.**
A body here is one flat sprite that always faces the camera, so a cut through its
THICKNESS has nothing to split — and that is exactly why it can be faked
perfectly. Picture a blade going in at the middle of the FRONT and coming out at
the SIDE of the BACK: on screen that plane crosses the silhouette TWICE, and the
band between the two lines is the wet face of the cut, seen foreshortened. So one
piece keeps a quarter of the body and the other keeps the rest plus a red wedge,
exactly as a real oblique slice would leave them — and nobody can tell the two do
not add up in depth, because nobody can see either one's other side.

`CleaveCut.depth` is how far the cut travels sideways between the front face and
the back, and `slicedPiece` (render/sprite-split.ts) draws ONE piece of it: its
own art out to the entry line, then its cut face out to the exit line. That one
function covers all three cuts — the lines coincide and it is a plain half; a
little apart and it is the oblique slice; right across and the blade took a slab
off the front and left a body-shaped mess with a rind of skin down one edge. The
RATIO between skin and red is how deep the blade went, and the eye reads it as
such with nothing else to go on. The wet face is the authored `gore_inside` tile
masked to the victim's OWN silhouette, so every monster and every mod's monster
gets a correct view of its own insides with nothing authored per creature.

Two bounds are load-bearing: an oblique slice is a MINORITY (a body opening
across the screen is the legible picture and has to stay the common one), and it
never goes all the way through — at a full slab the far piece starts at the
body's own edge and there is nothing left of it to draw, so the cut loses a half
instead of gaining a dimension.

**EVERY GIB IS SOMETHING THAT WAS ON THE INSIDE.** There is no severed head, no
hand, no foot and no arm in any pool — the victim's OWN SPRITE supplies those
(`splitSprite` hands the cleave two halves of the actual monster, `shredSprite`
hands the burst a fistful of its actual fragments, all in its own colours and
its own gear, for every mob and every mob a mod adds). An authored generic head
thrown beside them is a second, worse answer to a question already answered, and
a wrong one the moment the monster is not that shape. So the authored gore is
exactly what a sprite cannot show: organs, viscera, bone and meat.

Two things about the LOOK are worth knowing before touching it, because both
were shipped wrong first and are wrong again the moment they are "simplified".
**THE CUT IS NEVER AT THE BLOW'S TRUE BEARING** — the bearing chooses the family
and nothing else, because a cut at the exact angle is what a physicist would draw
and it is mush: a 16 px body ends up a red smear nobody can read. And **THE TWO
CLOCKS ARE SEPARATE** — the flight runs on the burst's own short duration
(`GORE_BURST_MS` / `CLEAVE_MS`) while the effect LIVES for seconds after it, so
the pieces come apart at the speed of a blow and then lie there at the speed of a
battlefield. One clock for both plays the whole thing in slow motion and reads as
a body politely disassembling itself.

**ONLY A PERSON LOSES A FACE.** `EnemyDef.anatomy` (`humanoid` by default, since
nearly everything on this roster that BLEEDS is a person; `beast` on the giant
lizard and the thing on wheels) decides whether the head, hands, feet, arms and
shins are in the pool at all. It is presentation only, like `gore` and
`locomotion` — and, like them, a new `EnemyDef` field has to be added to
`canonicalEnemyDef` or it silently reads `undefined` with every check green.

The gore art is `content/sprites/effects/gib_*` (a skull, a brain, a ribcage, a
heart, a liver, a kidney, two lengths of gut, a bone shard, two meat slabs — all
of them bloody, all of them things that were on the INSIDE) plus `cleave_wound`,
the cut face drawn in the gap a cleaved body opens. That one is
deliberately the DARKEST gore in the game: a bright band between two halves
reads as a light source rather than as an inside.

**AND EVERY KIND OF BODY COMES APART AS ITSELF — `EnemyDef.gore` IS A FAMILY, AND
`game-screen/gore.ts` IS ITS ONE CATALOG.** A ghost, a machine and a rift-thing
used to keep a plain two-frame splash and a plain corpse whatever killed them,
which made three quarters of the roster the one part of the game a hit did not
land on. There are four families now — `blood`, `ecto`, `sparks`, `cosmic` — and
each sprays, cuts, bursts, spills and hangs its own ambient. Adding a fifth is a
ROW IN THAT FILE plus its art, never an edit to the spray, the burst, the cleave,
the floor and the effect pass. Four things vary, and each is a different reason a
burst reads as one kind of thing:

- **THE PIECES**, which is the half that does the work. A rover has no liver and
  a collapsed star has no ribcage, so each family carries its own `bands` (what
  is inside a body of that kind, top to bottom — a machine's are sensor, chassis,
  core and drive), its own `signature` ladder and its own `filler` shower. The
  cut rule is untouched: it still spills WHAT IT WENT THROUGH, so a cut across a
  rover's head spills its eye for exactly the reason one across a man's neck
  spills his skull. Each family also says what BOUNCES, and a machine is the
  inverse of a body — everything it is made of is hard except its oil.
- **THE RAMP.** The spray, the haze, the floor rungs and the plain splash are
  BLOOD's authored art re-hued onto three stops (`render/recolor.ts`: luminance
  per pixel → a colour off the family's ramp, alpha untouched), not authored four
  times over — sixty sprites nobody would keep in step. A TINT cannot do this:
  tinting MULTIPLIES, which only darkens, and red art multiplied by green is
  near-black. **Blood's ramp is deliberately `null`** rather than the red one it
  would otherwise be: a re-hue of red art onto a red ramp is very nearly the
  identity and "very nearly" is a silent regression on the look that shipped.
- **THE CLOUD's COLOUR** — `GoreFamily.cloud`, the one colour that names the
  family. For the three re-hued families it is the ramp's own middle stop; blood
  states it outright, because blood has no ramp and the cloud still has to know
  what colour blood is.
- **THE AIR** (`AIR` in `render/blood.ts`) — what hangs once the pieces land, and
  the cheapest of the four differences as well as the one that names the family
  from across a room. Blood HAZES, a machine SMOKES (climbs three times as far
  and outlives the burst that made it), a haunting PUFFS (blows outward, gone
  fastest), a rift-thing GLIMMERS (hardly moves, just goes out).
- **THE FLOOR.** Blood, oil and a ghost's goo are all matter and all stay for the
  rest of the level; a rift-thing is LIGHT and marks nothing. That is recorded as
  a SECOND byte per tile — which family last spilled there — so the same eight
  authored rungs draw red, green or oil-black, with last writer winning the
  colour while the saturation stays the running total either way. `stains` is
  checked where the mark is DECIDED (event-fx.ts), never at the draw, exactly as
  the gore gate itself is. `bloodAt` — what the hero's boots wade through — is
  deliberately blood ALONE, because the soak and the trail are blood art in
  blood's colours and a tile of oil must not print red bootprints out of it.

The same gate covers all four — `goreAmount(family)`, one switch per family — so
a blow refused by the device or by the player's own row still falls back to the
plain splash and the ordinary corpse. **A boss is still the one body
that never comes apart**, and that is a rule about the FICTION — it has last
words to say over its own corpse, and that corpse is the level's landmark.

**JUDGE ALL OF IT IN THE EFFECTS GALLERY, AND THE RARE CUTS ARE PINNED SO THEY
CAN BE.** `cleave` (CLEAVED IN TWO) and `gib` (BURST INTO PIECES) show the roll
honestly; `gore-ecto`, `gore-sparks` and `gore-cosmic` put each family's cut and
burst on screen together, which is the only way to judge the claim that a ghost
comes apart as a ghost rather than as a person in green. The other four exist
because everything about a cleave is ROLLED, which is the feature and also what
makes its rare cuts impossible to LOOK at — an oblique slice comes up about a
fifth of the time, so tuning the depth illusion otherwise means replaying until
one appears. `Exhibit.cut` pins a PARTIAL cut over the roll for the length of a
show (`pinCleaveCut`, cleared when the gallery stops so it can never reach a real
run): `cleave-behead` and `cleave-legs` pin the two ends of the limb rule,
`cleave-oblique` and `cleave-slab` the two ends of the depth one. Pin the ONE
axis the exhibit is about and let the rest go on rolling — a diorama showing the
same picture every take would misreport a system whose whole point is that it
does not.

**THE SECOND ARM IS ONE SLOT AND TWO ANSWERS — `EquipSlot.offhand`.** It used
to hold a bag and nothing else, which made it a slot rather than a decision. It
now holds a **SHIELD** or a **BAG**, and a **TWO-HANDED** weapon
(`WeaponDef.twoHanded`) says neither — so every build spends the arm on exactly
one of survivability, room, or damage. Four rules hold it up:

1. **THE TWO KINDS ARE DEFINED BY WHAT THEY PAY, and the schema refuses a piece
   that pays neither.** A shield owes `armor` + `armorType` and may carry no
   cells; a bag owes `bagSlots` and may carry no armor. That is what keeps the
   choice a choice: a bag that protected, or a shield with pockets, would make
   the arm free.
2. **WHAT SEPARATES THE LANES IS THE STRENGTH FLOOR, not a class check.** A
   shield derives its gate the same way heavy armor does — a fraction of the
   hero's banked points, never authored per item — with a FLOOR under the
   material's own rate (`SHIELD.strReqFraction`, above a weapon's own 0.4), so a
   bruiser clears every shield with his own points and an archer or caster
   clears none. Bags are ungated, which is precisely why they are the light
   build's answer, and their stat block leans DEX/INT to say so. A bag's growth
   axis is ROOM: `LOOT.bagSlotsPerIlvl` stamps an ilvl-grown cell count at mint,
   exactly as `ARMOR.armorPerIlvl` stamps armor.
3. **THE CONFLICT IS RESOLVED IN ONE PLACE — `items/hands.ts`.** Every door a
   piece comes through (the bag's tap, a drag onto a named slot, both auto-equip
   sweeps, a loadout arriving from the last level) calls `freeHandsFor`, which
   either clears the arms or refuses the equip WHOLE. The awkward half is that
   the weapon slot is never empty, so taking a two-hander off is a REPLACEMENT:
   the same best-remaining-weapon pick the on-break swap makes lives there too,
   which is why it is not in `durability.ts` (that module is downstream of the
   bag and cannot be reached from it). The auto-equip sweep decides the HAND
   first and lets it win — `weaponScore` already prices a two-hander's premium,
   and there is no honest exchange rate between that and a shield's armor, so
   guessing one would just flap the build on whatever the horde dropped last.
4. **A TWO-HANDER IS PAID FOR IN THE CATALOG, NOT WAIVED.** It is forged at
   `TWO_HANDED_PREMIUM` (1.4) over the budget line every one-hander sits on
   (`scripts/weapon-budget.mjs`, mirrored in `defs/grades.ts` so a grade variant
   inherits it), because what it competes with is a fifth armor piece. A melee
   two-hander additionally swings a WIDER `sweepDeg` — and that costs nothing
   extra, because a wider arc raises the weapon's assumed targets and so lowers
   the per-hit damage the same premium hands back.

**AND ALL THREE SHOW ON THE HERO.** A build choice the player cannot see on his
own character is one he has to open a screen to remember making. The two
off-hand kinds ride the SAME generated-overlay machinery the worn armor does
(`asset-tools/worn.mjs` → `worn_<defId>`, coloured from the piece's own icon), so
a new shield or bag costs no art beyond its 12×12 icon: a shield draws raised
and broad, a bag slung low and small, one glance apart. The overlay is the one
worn template that hangs OFF the body silhouette, so it is the one that paints
its own outline (the `4` char in `wornRamp`) — every sprite in this game is built
on that near-black, and a shield without it reads as a smear. The off hand is a
SOAK ZONE of its own (`SOAK_ZONES`, `blood_coat_offhand_0..2`) for the same
reason every other zone is a gear slot: it is the piece held BETWEEN him and the
work, it catches the most of what comes back, and swapping it is what cleans it.
A **TWO-HANDER is posed differently** rather than redrawn (`render/player.ts`):
it rests across the body, and its swing turns about the low central grip both
hands are on — wound back past the cone's start edge and carried past its end,
over a longer clock — so it comes ROUND the hero instead of off one shoulder. The
cone the engine hit with is untouched; only the picture changes.

**LOOT IS THROWN, LANDS, AND THEN ADVERTISES ITSELF.** A drop that materialises
under the corpse is indistinguishable from the floor texture, and a legendary
that materialises the same way is the entire chase arriving with no more
presence than a medkit. So a drop now has three beats, and each one is owned by
exactly one place:

- **THE TOSS is the engine's, and it is a TIMER, not a trajectory**
  (`src/game/items/toss.ts`, `LOOT.toss`). Every drop in the game goes through
  the one funnel — `dropItem(state, item, from)` — which is what made the
  feature a two-line change at each of the twenty-odd sites that pay loot out.
  `item.pos` is the LANDING spot from the moment the item is minted, so the
  magnet, the pickup reach, the minimap and the bot's loot run all keep reading
  a position and need no notion of flight; the renderer arcs the icon in from
  `toss.from` over the countdown, tumbling it, with a shadow that stays on the
  ground. Airborne loot cannot be grabbed and the magnet leaves it alone — the
  same gate the angel delivery already used. **The scatter is HASH-DERIVED off
  the item's id, never `state.rng()`**: the drop ladder's draws are load-bearing
  (seeded runs, the simulator's A/B, every `rollEquipment` stream), so a
  presentational hop that consumed one would shift every roll after it.
- **THE LANDING IS WHAT MAKES THE NOISE, and what a thing sounds like is what
  it is MADE OF.** `stepItems` emits `itemLanded` carrying the item's MATERIAL
  (`itemVoice`: blade / gun / wand / plate / mail / leather / cloth / trinket /
  flask / scrap / spark / relic) — mail jingles, cloth flumps, plate clangs,
  glass clinks — and the app kicks a puff of dust in the FLOOR's own colour
  (`groundColorAt`, exactly as a jump does). A magic-or-better find rings a
  SECOND event over the top (`lootShine`, carrying the tier), which is the whole
  reason rarity and material don't multiply: layering two events is 12 + 6
  sounds where one combined event would have been 72. The old `itemDropped`
  event went with it — it fired once per SPILL rather than once per item, at
  the moment of minting rather than the moment of arrival, and after the sound
  moved to the landing nothing consumed it at all.
- **THE STANDING AURA is the app's, and it is a LADDER**
  (`pwa/src/game/render/loot-aura.ts`). Each layer switches on at its own rank
  and every one is lit in the tier's own colour (`TIER_RGB` — the colour the
  item's NAME is written in): regular keeps the plain warm halo, magic takes the
  tier colour and lights a pool on the floor, rare starts SMOKING, set thickens
  it, unique stands a LIGHT SHAFT over the piece (drawn twice — a wide soft
  flare with a narrow bright core, because one column cannot be both), legendary
  adds orbiting motes, and artifact pulses a ring out across the ground. It is
  closed-form off the render clock and the item's id, like the canopy and the
  fauna, so a floor covered in loot costs the simulation nothing and allocates
  nothing per frame; the light itself is BAKED (`glowSprite`, `beamSprite`),
  because building a gradient per item per frame is the most expensive thing a
  loot-covered floor can do. The four corner glint pixels this replaced are
  gone. Judge it in the EFFECTS GALLERY's WORLD shelf — `loot-rarity` stands the
  whole ladder side by side on the moon's dark regolith (a pale deck plate
  flatters every tier equally, which is the one thing a comparison must not do)
  and `loot-toss` runs a whole spill.

The field hero **always shows and swings his held weapon** — these were the
CHARACTER WEAPON and WEAPON SWING developer flags, now shipped as the default
look (no toggle). Both are pure render concerns:

- **The held weapon draws on the field hero sprite.** `render.ts` passes
  `{ weapon: true }` to `playerDollLayers` (`paper-doll.ts`) so the weapon layer
  rides the paper-doll alongside the worn armor. The HUD avatar and inventory
  portrait draw the weapon too, so every surface agrees.
- **The held weapon animates on each attack** — a blade whips through its slash
  arc, a gun recoils with the muzzle rising, a wand thrusts up on the cast —
  pivoting the weapon layer about the **shoulder** (`paper-doll.ts`
  `WEAPON_SHOULDER`, not the grip) so the whole implied arm sweeps. For a melee
  swing the blade sweeps through its **cone**: it cocks to the cone's start
  edge, whips through the full cone to the end edge, and folds home
  (`weaponPose`), and its **slash is drawn ON the blade** — `drawBladeSlash`
  fills the exact arc the blade carves, anchored to the same `WEAPON_SHOULDER`
  pivot in the doll's own space (via the blade's tip/base points
  `SLASH_REST_TIP`/`SLASH_REST_BASE`), so the effect rides the weapon instead of
  fanning out of the hero's centre. The generic ground `swing` cone
  (`drawEffects`) drops to a faint AoE footprint behind it (still the read for
  companion swings). The cone widens with INTELLIGENCE (`weaponSweepHalfAngle`,
  capped at a half circle — `STATS.aoeMaxHalfAngle`), so a max-INT slash swings
  a full 180° arc; the swing is handed the weapon's cone via `PlayerAction.arc`.
  GameScreen captures the hero's own `swing`/`shot` events into a `PlayerAction`
  (matched to his position so a companion's blow is ignored), and `render.ts`
  `drawPlayer` poses the weapon layer via `weaponPose`.

  **Signature effects (`weapon-fx.ts`).** Each weapon CLASS has a plain base
  look, and a UNIQUE gets its OWN, so a named weapon FEELS more powerful. **THE
  WEAPON OWNS ITS LOOK** — `fx:` in its own YAML (`UniqueDef.fx`: an ELEMENT from
  the shared vocabulary plus any channel it wants to tweak), for exactly the
  reason a power owns its `look:`: while the mapping was a table in the app keyed
  by shipped ids, a MOD's legendary could only ever swing the plain class look.
  The kits live in the import-free leaf `weapon-elements.ts` (the item pipeline
  reads the element names from it to check every authored `fx:`, and runs before
  the catalog `weapon-fx.ts` reaches through `@game/core`); the drawing is
  `weapon-fx.ts`, and the resolved style is memoized per weapon because a shot
  style is asked for per projectile per frame. **Melee** (`SLASH_ELEMENTS` →
  `SlashStyle` → `drawSlash`): a themed slash crescent (core/edge/glow, a `particle` stream,
  `afterimages`) plus a `gore` `burst` (`drawBurst`) thrown over the plain splash
  on the hero's own blows (GameScreen's `heroGore`) — Excalibur flares holy gold,
  Mjölnir spits sparks, Muramasa bleeds. **Ranged/magic** (`SHOT_ELEMENTS` →
  `ShotStyle` → `drawMuzzle` + `drawProjectileTrail`): a themed muzzle flash / cast
  bloom at the tip AND a glow trail riding the hero's round/bolt in flight
  (`render.ts`, gated to the hero's own shots via the projectile's
  `hostile`/`companionId`) — Pyrelight casts fire, Pale Rider fires a deathly
  shot. The hero faces where he MOVES, not where he shoots, so his flash pins to
  the barrel's facing side (the muzzle effect's `faceLeft`) — a shot at a foe
  behind him still fires at the weapon, not off his back. The PIXELS are the
  app's and the engine draws none of it; what travels on the def is the weapon's
  CHOICE. A weapon with no `fx:` keeps the plain class look, so the roster grows
  one weapon at a time. The eleven elements (fire, holy, frost, storm, void,
  blood, venom, cosmic, death, solar, tech) each have a slash kit AND a shot kit,
  so one word means the same element on a blade and on a gun — an asymmetric
  vocabulary would make `element: blood` mean nothing on a rifle. The engine's shared `nova` crit-AoE is NOT themed (it carries no
  weapon attribution).

  Tune and author all of it with the `weapon-swing` preview script
  (`pwa/scripts/weapon-swing.mjs`): `poses <weapon>` pins the swing/shot frame
  by frame, `live <weapon>` slows a real attack to show the slash + gore or the
  cast + projectile trail, `uniques` / `shots` render contact sheets of every
  melee slash / ranged-magic muzzle, and the debug `calibration_probe` weapon
  (red tip/base markers) calibrates the blade geometry. It drives the `?debug`
  `window.__swing` (pin the pose/muzzle, optionally
  with a cone) and `window.__timeScale` (slow the run) hooks.

## Reuse through oss-framework

This game builds on
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
(shared React components, hooks, and utilities for local-first PWAs —
storage, PWA update lifecycle, theming, achievements, i18n, …), installed
from GitHub Packages. **Prefer the framework over hand-rolling**:

- Before writing app-level UI or infrastructure (settings storage, update
  prompts, sidebars, achievements, encryption, sync, charts), check whether
  the framework already ships it and use that.
- **Keep generic game code separate, extract to the framework later.** Code
  that is not specific to THIS game (HUD widgets, input handling, game-loop
  utilities, sprite/audio helpers) goes in the dedicated generic areas —
  `src/lib/` for engine-side code, `pwa/src/lib/` for React/UI code —
  never tangled into game-specific modules. Do **not** upstream it into
  oss-framework immediately: publishing a framework release for every
  tweak makes iteration loops far too long. Iterate and playtest it here;
  once the code has matured and playtesting shows it works, extract the
  `lib/` module into oss-framework and swap the imports to the package.
  The clean separation is what keeps that extraction cheap.
- **Always import the generic pools through their aliases** — `@game/lib/*`
  (engine) and `@ui/lib/*` (React/UI), never by relative path. Extraction to
  oss-framework is then a prefix swap (`@game/lib/rng.ts` →
  `@niclaslindstedt/oss-framework/rng`) with no path surgery; keep framework
  subpaths named after the module. The alias maps live in `tsconfig.json`,
  `pwa/tsconfig.json`, `vitest.config.ts`, and `pwa/vite.config.ts`
  — keep all four in lockstep (they also carry `@game/core` and `@game/menu`).
- Installing `@niclaslindstedt/*` packages requires a `GITHUB_PAT` env var
  with `read:packages` (see `.npmrc`); CI falls back to the workflow token.

## Where new code goes

| Change type                                                       | Goes in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine/gameplay logic specific to this game                       | `src/...` (framework-free TypeScript); exported from `src/index.ts` (`@game/core`) — add to `src/menu.ts` (`@game/menu`) ONLY if the startup path needs it and it drags no simulation along                                                                                                                                                                                                                                                                                                                                                     |
| Authored sprite art                                               | `content/sprites/<family>/<id>.yaml` — committed source grids compiled by `make assets`; carries `plane: upright \| floor` (see **THE WORLD PROJECTION**); see the `pixel-assets` skill                                                                                                                                                                                                                                                                                                                                                         |
| The TITLE MENU's shape (a screen, a row, its order/icon/help)     | `content/mainmenu.yaml` — the whole menu tree, compiled to `pwa/src/generated/menu.ts` by `make levels`; the row's BEHAVIOUR goes in the `menus-*.ts` builder that owns its screen — see **THE TITLE MENU IS CONTENT**                                                                                                                                                                                                                                                                                                                          |
| A level (mission)                                                 | `content/levels/<id>.yaml` — the venue MINUS its floor plan (story, ladder rung, hazards, merchant, loot pools), compiled to `src/generated/levels.ts` by `make levels`; its geometry is `content/maps/<id>.yaml` — see the `level-design` skill                                                                                                                                                                                                                                                                                                |
| A GENERATED map (the "v2" blueprint for a mission)                | `content/maps/<id>.yaml` — the RECIPE a mission's geometry is carved from per run, compiled to `src/generated/map-blueprints.ts` by `make levels`; see **GENERATED MAPS** above                                                                                                                                                                                                                                                                                                                                                                 |
| The hero level curve (XP per level)                               | `content/leveling.yaml` — per-level XP up to the cap, compiled to `src/generated/leveling.ts` by `make levels`; see the `leveling-balance` skill                                                                                                                                                                                                                                                                                                                                                                                                |
| A powerup (a timed pickup power)                                  | `content/powerups.yaml` — the whole catalog in one file (id → power), compiled to `src/generated/powerups.ts` by `make levels`; the campaign introduces TWO NEW POWERS PER MAP. A power COMPOSES effect blocks and carries its own `look:`/`sfx:` — see **STEAM WORKSHOP MODS**                                                                                                                                                                                                                                                                 |
| A new EFFECT a power can carry                                    | `src/game/ability-effects.ts` (the implementation, shared by both carriers) + a block on `AbilityDef` + its entry in `KIND_BLOCKS` (`scripts/asset-tools/powerup-schema.mjs`)                                                                                                                                                                                                                                                                                                                                                                   |
| A passive TALENT (a rank the hero buys in a tree)                 | `content/talents.yaml` — the whole catalog in one file (id → talent), compiled to `src/generated/talents.ts` by `make levels`. A talent is what it CARRIES: an `effect:` bag of per-rank slopes, a `conjure:`, and/or a PROC BLOCK                                                                                                                                                                                                                                                                                                              |
| A new PROC a talent can fire                                      | a block type on `TalentDef` + its entry in `TALENT_BLOCKS` + one reader in `src/game/talent-effects.ts` + its entry in `PROC_BLOCKS` (`scripts/asset-tools/talent-schema.mjs`) — never a branch on a talent id                                                                                                                                                                                                                                                                                                                                  |
| A new GORE PIECE a burst body throws                              | `content/sprites/effects/gib_<part>.yaml` (the art — it must be something that was INSIDE) + its entry in the pools in `pwa/src/game/game-screen/gore-burst.ts` (`SIGNATURE` / `FILLER`, plus `BOUNCY` if it is dense and `HUMAN_ONLY` if only a person has one)                                                                                                                                                                                                                                                                                |
| A new ORGAN a cut can spill                                       | `content/sprites/effects/gib_<organ>.yaml` + the `ANATOMY_BANDS` band it lives in (`pwa/src/game/game-screen/gore-burst.ts`), plus `BOUNCY` if it is dense. Every cut through that band spills it from then on                                                                                                                                                                                                                                                                                                                                  |
| An enemy (minion/elite/boss)                                      | `content/enemies/<biome>/<id>.yaml` — one YAML file per mob (stem == id), compiled to `src/generated/enemies.ts` by `make levels`; see the `enemy-design` skill                                                                                                                                                                                                                                                                                                                                                                                 |
| A companion (who a spared elite joins you as)                     | `content/companions.yaml` — the whole roster in one file (id → companion), compiled to `src/generated/companions.ts` by `make levels`; an elite recruits one via `spareable:`                                                                                                                                                                                                                                                                                                                                                                   |
| An item SET (the kit a boss's green armor belongs to)             | `content/sets.yaml` — the whole catalog in one file (id → set: its members and their tiered bonuses), compiled to `src/generated/sets.ts` by `make levels`; the pieces themselves are `content/items/set/<id>.yaml` with a `setId:` back-reference                                                                                                                                                                                                                                                                                              |
| A CONVERSATION (a talk the hero steers, with choices)             | `content/conversations/<id>.yaml` — a tree of what a speaker says and what the hero may say back, compiled to `src/generated/quests.ts` by `make levels` (the QUEST pipeline); named by `EnemyDef.conversation` or `QuestDef.conversation`                                                                                                                                                                                                                                                                                                      |
| An errand (a quest) and the person who hands it out               | `content/quests/<id>.yaml` (one errand per file, stem == id) + `content/quest-givers.yaml` (the people), compiled to `src/generated/quests.ts` by `make levels`; see **QUESTS** below                                                                                                                                                                                                                                                                                                                                                           |
| An item (weapon/gear/named unique)                                | `content/items/<rarity>/<id>.yaml` — one YAML file per hand-authored item (stem == id, dir == rarity), compiled to `src/generated/items.ts` by `make levels`; see the `weapon-system` skill                                                                                                                                                                                                                                                                                                                                                     |
| Item quality / rarity knobs                                       | `content/item_quality.yaml` (the make-quality axis) and `content/item_rarity.yaml` (the tier ladder + rarity economy)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A sound effect                                                    | `content/sounds/<id>.yaml` — one YAML file per sound (stem == id), compiled to `pwa/src/generated/sounds.ts` by `make levels`; see the `sound-effects` skill                                                                                                                                                                                                                                                                                                                                                                                    |
| A music track                                                     | `content/music/<id>.yaml` — one YAML file per score (stem == id), compiled to `pwa/src/generated/music/` by `make levels`; see the `sound-effects` skill                                                                                                                                                                                                                                                                                                                                                                                        |
| A cutscene (a between-level scene)                                | `content/cutscenes/<id>.yaml` — one scene per file (stage, cast, timeline; `variants:` swaps a labelled part per difficulty), compiled to `src/generated/cutscenes.ts` by `make levels`                                                                                                                                                                                                                                                                                                                                                         |
| The hero's inner monologues                                       | `content/thoughts.yaml` — the whole catalog in one file (id → monologue) plus the `capRotation` the cap-farm mutter cycles, compiled to `src/generated/thoughts.ts` by `make levels`                                                                                                                                                                                                                                                                                                                                                            |
| A story item (keycard, dossier, recovered hardware)               | `content/story-items.yaml` — the whole catalog in one file (id → plot piece and its `lore` pages), compiled to `src/generated/story-items.ts` by `make levels`                                                                                                                                                                                                                                                                                                                                                                                  |
| Authored campaign/bot tuning                                      | `content/ladder.yaml` and `content/bot.yaml`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Generators, analyzers, previews, and maintenance commands         | `scripts/...` — executable tooling only; authored game data belongs under `content/`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Generic engine code (usable by any game)                          | `src/lib/...` — imported as `@game/lib/*`; earmarked for extraction to oss-framework once mature                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| App shell, rendering, PWA, game-specific UI                       | `pwa/src/...`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Generic React/UI game components                                  | `pwa/src/lib/...` — imported as `@ui/lib/*`; earmarked for extraction to oss-framework once mature                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| A library page's content, look, or wording                        | `pwa/scripts/library/...` — the generator; the pages themselves are build output and are NEVER hand-edited                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Native-only concern (haptics, audio session, store build)         | `native/src/...` — the Expo wrapper; never leak app-specific code into `src/` or `pwa/`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Desktop/Steam-only concern (window, Steam Cloud, overlay)         | `electron/src/...` — the Electron wrapper; same rule, never leak it into `src/` or `pwa/`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| The MOD SDK (format, compiler, examples, modder docs)             | `mod/...` — the published authoring surface, top-level so it is findable; see **STEAM WORKSHOP MODS** below                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| MULTIPLAYER: a read of "the hero" inside the engine               | ASK WHICH KIND IT IS. A PRIVATE read (bag, purse, build, worn kit) is a `Player` PARAMETER beside the run — never a lookup. A GEOMETRY read goes through `src/game/party.ts` (`nearestHero` / `anyHeroWithin` / `heroesWithin` / `partyCentroid` / `partyLevel`), and a mob's own target through `src/game/aggro.ts` (`quarryFor` / `quarryOf`). "Is this hero somebody the world should react to" is `heroInPlay` — never `hp > 0`, which misses a DEPARTED seat. `state.players[0]` left in engine code is an un-migrated site, not an answer |
| MULTIPLAYER: a payout, a drop, or anything else a kill produces   | A KILL's XP is the party's and goes through `shareXp(state, amount, pos)`; every other award has an owner and goes through `grantXp(state, hero, amount)`. A DROP goes through `dropItem` like every other drop, which stamps `Item.owner` on its own in an allocated session — never roll an owner at a call site, and never spend a `state.rng()` draw on presentation (use the item's hash, as the toss does)                                                                                                                                |
| MULTIPLAYER: anything the app does to a RUN before its first tick | `src/game/session-setup.ts` — a field on `RunParams` and a line in `createRunFromParams`, plus the matching field on `SessionParams` (`server/wire/protocol.ts`). Never a mutation in `createRunSession` alone: the session and the client build the same run from the same parameters, and a field only one of them applies is a desync that reads as a replication bug                                                                                                                                                                        |
| MULTIPLAYER: a rule about who may take, keep or move an item      | `src/game/trade.ts` when TWO players are involved — the swap is ONE transaction, and `isOfferedInTrade` is the predicate every verb that could spend a bag cell must ask; `items/` otherwise                                                                                                                                                                                                                                                                                                                                                    |
| MULTIPLAYER: a new VERB the app may run against a run             | `src/game/commands.ts` (the arg shapes + the `case`) **and** `COMMANDS` in `server/wire/protocol.ts` (the literal copy the allow-list reads) — the drift test enforces the pair — then bump `PROTOCOL_VERSION`. Call it from the app through `pwa/src/game/run-commands.ts`, never by importing the engine function                                                                                                                                                                                                                             |
| MULTIPLAYER: the session server, or the wire either end speaks    | `server/...` — engine code compiled for Node (`npm run server:build`). `server/wire/*` imports NOTHING, because the page reads it from the startup path; `server/session.ts` may import `@game/core`. Never anything under `pwa/`. See `docs/multiplayer.md`                                                                                                                                                                                                                                                                                    |
| MULTIPLAYER: a transport, admission, the router mapping           | `server/net/...` — the seam, the reliability layer, the UDP socket, the relay, the hub, UPnP. Node builtins only; it ships with the session, which is what makes PR 5's dedicated server the same file. See `docs/multiplayer.md`                                                                                                                                                                                                                                                                                                               |
| MULTIPLAYER: the shell's half (fork, supervise, hand the port)    | `electron/src/net.ts` + `session-host.ts` — the fifth bridge, over `__gisNet`; the page's control half is `pwa/src/app/net-bridge.ts` and the run driver is `pwa/src/game/net/`. STEAM-only concerns (`net-steam-p2p.ts`, `net-lobby.ts`) and the OS firewall live here because the client and the elevation prompt do                                                                                                                                                                                                                          |
| MULTIPLAYER: a read of "the hero" inside the APP                  | `localHero(state)` (`pwa/src/game/local-seat.ts`) — which hero THIS screen is about. 0 offline and for the host; a joiner's seat comes from the `welcome`. Never `state.players[0]` in app code                                                                                                                                                                                                                                                                                                                                                 |
| MULTIPLAYER: a HOST / JOIN screen, or anything they read          | `content/mainmenu.yaml` (the rows) + `pwa/src/game/title-screen/menus-net.ts` (the behaviour) + `use-sessions.ts` (the plumbing). STARTUP PATH: it may reach `pwa/src/app/net-bridge.ts`, `@game/menu` and the import-free `@game/wire/*` leaves — NEVER `pwa/src/game/net/`. A live status row belongs to the RUN instead (`game-screen/SessionPanel.tsx`), because a session exists only while a run does                                                                                                                                     |
| Mature, playtested generic code                                   | extract into `oss-framework`, then import the package here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tests                                                             | `tests/...` (engine) — name them `*_test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Docs update                                                       | `docs/...`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Examples                                                          | `examples/...`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| LLM prompt                                                        | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Test conventions

- **All tests live in separate files** — never inline in source files (no `#[cfg(test)]` blocks, no `if __name__ == "__main__"` test harnesses). This keeps source files free of test scaffolding and lets agents, hooks, and linters treat source and test code differently.
- Test files are named with a `_test` or `_tests` suffix (e.g. `output_test.ts`). The stem must match the pattern `_?[Tt]ests?$` per §20 of `OSS_SPEC.md`.
- Tests live in `tests/` and run with **Vitest** (`make test`, or `npx vitest run tests/engine/game_test.ts` for a single file). The include pattern (`tests/**/*_test.ts`) lives in `vitest.config.ts` — keep it in lockstep with the naming rule.
- **`tests/engine/` vs `tests/content/`.** Engine-rule suites live in `tests/engine/` and run against **synthetic fixtures** (`tests/engine/fixtures.ts`, plain ids like `test_level`/`test_minion`) installed via the engine's `registerDefs` hook — so they survive content deletion. This-game content suites (levels, story, bosses, sprite atlas) live in `tests/content/` and use the shipped catalogs via the root `tests/helpers.ts`; a sequel deletes and rewrites them. Lib tests (`chiptune`, `synth`, `output`, …) stay at the `tests/` root. Rule of thumb: if a test asserts an engine rule, it belongs in `tests/engine/` and must not reference a shipped content id (only `blaster`, the engine's built-in sidearm id, is shared).
- No test-specific setup is needed today; engine tests run in a plain Node environment.

## Source file size

- Non-test source files must stay under **1000 physical lines** (§20.5 of `OSS_SPEC.md`). When a file grows past the limit, prefer splitting by concern (extracting submodules, helpers, or sibling files) over relaxing the cap.
- A file may opt out by placing `oss-spec:allow-large-file: <reason>` in any comment within its first 20 lines. The reason must be non-empty and motivate why the file genuinely cannot be split (generated code, cohesive state machine, third-party snapshot, inherently dense rule catalogue).

## Documentation sync points

| When you change…                                                                   | Update…                                                                                                              |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| game identity (title, domain, …)                                                   | `game.config.json` only — the single source of truth; then `make icons` (OG art)                                     |
| engine public API (`src/index.ts`)                                                 | `docs/architecture.md`, `README.md` Usage                                                                            |
| the title menu (a screen, a row, an order, a page name)                            | `content/mainmenu.yaml` only — the compiled tree is the one source; then `docs/architecture.md`                      |
| game content (levels, enemies, story)                                              | `docs/game-content.md` (this game's walkthrough; a sequel replaces it wholesale)                                     |
| a plot beat / the story as a whole                                                 | `docs/story.md` (the gist — top of the chain), then push down (see **Story & dialogue** below)                       |
| story or dialogue text (any line)                                                  | `docs/manuscript.md` — the verbatim script; `docs/story.md` sits above it (see **Story & dialogue** below)           |
| Make targets / npm scripts                                                         | `README.md` Usage, `CONTRIBUTING.md`, this file                                                                      |
| deploy slots / pages workflow                                                      | `docs/architecture.md`, `README.md` Play table, `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`                                   |
| config knobs (env vars, URL params)                                                | `docs/configuration.md`, `README.md` Configuration                                                                   |
| PWA surface (manifest, icons, SW)                                                  | `docs/architecture.md`, regenerate icons via `make icons` and install shots via `make screenshots`                   |
| the shared art look (`STYLE_PREAMBLE`, a family `style:` anchor, the design rules) | `docs/art-style.md` — the house style guide; keep it and `STYLE_PREAMBLE` (`scripts/asset-tools/prompt.mjs`) in step |
| version anywhere                                                                   | never by hand — `scripts/update-versions.sh` owns it                                                                 |

The website must be regenerated whenever source-derived content changes
(§11.2): `pwa/scripts/extract-source-data.mjs` runs on every build and
fails if `src/version.ts` and `package.json` disagree.

## Story & dialogue — a three-tier chain, `story.md` on top

The story lives in a three-tier chain, and changes flow **downward, never up**:

1. [`docs/story.md`](docs/story.md) — **the gist**: the whole plot in prose, in
   narrative order (one paragraph per intro & per cutscene, two per level, every
   elite and boss named). This is the **ground truth**.
2. [`docs/manuscript.md`](docs/manuscript.md) — **the script**: every spoken
   line, monologue, caption, and piece of found lore, transcribed verbatim. An
   extrapolated version of the gist.
3. `content/` — **the game**: the roster, items, cutscenes, thoughts and story
   items that play the script. An extrapolated version of the manuscript.

**THE CHAIN GOVERNS THE SHIPPED CAMPAIGN, AND ONLY IT.** A MOD authors the same
files in the same format (`cutscenes/`, `thoughts.yaml`, `story-items.yaml` — see
**STEAM WORKSHOP MODS** above and `mod/FORMAT.md`), and none of this applies to
one: nobody governs a stranger's script. A mod's story has no tier above it, is
never filed into `docs/story.md` or `docs/manuscript.md`, and must never be
"corrected" to match them — a total conversion's whole point is that its plot is
not this one. So the rule is about ORIGIN, not about format: a line in
`content/` is the campaign's and answers to the manuscript; the identical line in
a mod's folder is its author's and answers to nobody. (The one thing a mod's
story does answer to is the SCHEMA — a scene still has to name a sprite that
exists.)

**A SPOKEN BEAT IS NOT ALWAYS A MONOLOGUE — `ThoughtDef.voice` AND `them:`
PAGES.** A pinned beat is the hero alone by default, and nearly all of them
stay that way. A few need somebody talking back — a shove answered with "we
have our orders" — so a def may name a second `voice: { speaker, portrait }`
and tag a page `{ them: [...] }`. It is the exact MIRROR of an arrival scene's
`{ hero: [...] }`: there the mob owns the scene and his replies are tagged,
here he owns it and theirs are. Both resolve through `dialogueContent` into one
`voices` array parallel to `pages`, so the dialogue box draws either without
knowing which kind of scene it is in — which is why adding the second voice
changed no renderer arithmetic. Reach for this rather than `EnemyDef.dialogue`
when a line has to land INSIDE a scripted beat: an arrival scene fires on its
own proximity trigger and cannot be sequenced with one. The scene kind is still
called `playerThought` — a MECHANISM name, since the pinned-beat machinery, the
read ledger and the `openingStrike` hook all key on it — so call the thing an
EXCHANGE everywhere a reader sees it and leave the key alone.

**AND THE CAMPAIGN'S FIRST FIGHT IS A REFUSAL — GOODCO HQ's THREE BLOWS.** The
hero walks into his old workplace with the wall piece holstered; a lab
scientist he knows breaks from the night shift and hits him, and he does NOT
hit back. He names the man, tells the floor to stand down, says he has never
raised a hand to anyone. They hit him again, and again, and only the third blow
is answered — with an apology. The horde on this map is his old colleagues, and
a hero who answered the first blow in the same tick would be somebody who came
here to fight, which he is not and never becomes. Mechanically it is
`OpeningStrike.warnings` (the beats the earlier blows play, in order) and the
READ LEDGER is the counter, so the escalation carries no run state, survives a
save, and a replay finds every warning read and arms on the first blow. Two
things are load-bearing and neither is a number: the striker is SHOVED OFF
between blows so the player watches him come again rather than reading three
stacked monologues, and `stepOpeningStrike` skips a striker whose recoil is
still LIVE — a contact radius tight enough to mean "on top of him" is one no
shove clears in a tick, so a beat gated on distance alone fires again the
instant the last one is tapped closed. The tonal whiplash on EASY, where the
peaceful man finally answers with grandpa's sawed-off, is the joke and not a
bug.

**A PAGE IS A PARAGRAPH, AND THE BOX BREAKS IT — THE AUTHOR DOES NOT.** Every
surface that speaks (the opening/closing monologue, the in-world dialogue box,
a cutscene caption, the merchant, a quest giver's ask) measures the text column
it ACTUALLY has on the device it is being read on and flows the page into it:
`useTextColumn` (`@ui/lib/use-text-column.ts`) + `wrapPage`
(`@ui/lib/text-pager.ts`), then `paginateLines` windows the folded rows into
tap-to-scroll screens. So where a row ends is the renderer's business, and an
authored line is a whole thought. The habit this replaced — typing three
~34-character lines against a fixed box — printed a ragged half-width column
with the right half of the window empty on anything wider than the phone it was
measured on, and folded into a mess on anything narrower.

A page is therefore authored as ONE entry, in `content/` and in the manuscript
alike. A SECOND entry is an **explicit line break**, and it has to earn itself:
a punchline held back, a second hand on the same note, a pause the punctuation
cannot carry (the typewriter already holds 260–440 ms on a full stop, so most
"beats" need no break at all). The whole shipped campaign spends FIVE — they are
tabled in the manuscript's "How a page is written". What the author still owns
is the PAGE: past ~120 characters, three rows of the narrowest box the game
supports, it costs the player a second tap, and the build warns
(`PAGE_WARN_CHARS` / `MAX_PAGE_LINES` in the story, quest and companion
schemas). A BARK is the exception on both counts — it floats over a boss's head
on the open field rather than in a box, so its lines stay hard rows.

When two tiers of the CAMPAIGN's chain disagree, the **higher tier wins**:
`story.md` beats the manuscript, the manuscript beats the data — correct the
lower tier to match.
**LOAD THE `update-story` SKILL** (`.agent/skills/update-story/`) BEFORE
TOUCHING ANY LINE THE GAME SPEAKS — not only when the plot moves. The unit is a
LINE, not a beat: a retone ("he shouldn't sound so cold"), a second page on a
monologue, a reworked scripted scene, a bark, a merchant greeting, a quest
offer, a companion's joining words — every one of them is transcribed in the
manuscript, so every one of them owes the chain a walk. The skill makes the
change at the top and carries it down (the manuscript, then the cutscenes,
level monologues, enemy roster, story items and uniques, pinned thoughts,
quests and companions — a boss swap re-homes that boss's drops). A PR that
edits a line of dialogue and leaves `docs/story.md` and `docs/manuscript.md`
untouched is incomplete.

**Changing the story is a two-step commitment:**

- If a change you make to the game conflicts with what the manuscript says, the
  manuscript must be updated too — but **only after the user confirms the
  manuscript change**. The user may grant that confirmation ahead of time (e.g.
  "rewrite THE FLAGBEARER's speech and update the manuscript" pre-approves the
  manuscript edit); otherwise, ask before rewriting it.
- Never silently edit story/dialogue in the data files and leave the manuscript
  stale, and never rewrite the manuscript without that confirmation. A PR that
  touches any dialogue/story text updates `docs/story.md` and
  `docs/manuscript.md` in the same change so the tiers never drift.

**Where the actual story/dialogue data lives** (the manuscript's implementation
— its own "Where the data lives" table is the authoritative map):

- `content/cutscenes/<id>.yaml` — one scene per file: its stage, its cast, and
  the `caption`/`say` beats of its timeline (the prelude, the launch, the two
  voyages, the rift doors). The prelude's per-difficulty `variants:` swap the
  weapon on the wall (compiled to `src/generated/cutscenes.ts` by `make levels`).
- `content/levels/<id>.yaml` — each level's `intro` (the hero's opening
  monologue) and `foes` label (compiled to `src/generated/levels.ts` by
  `make levels`).
- `content/enemies/<biome>/<id>.yaml` — every elite/boss `dialogue` (arrival
  scene) and `lastWords` (spoken on death) (compiled to
  `src/generated/enemies.ts` by `make levels`).
- `content/thoughts.yaml` — the hero's inner monologues, pinned to a kill or a
  sighting via a `LevelDef.firstKillThoughts` / `firstSightThoughts` entry, plus
  the `capRotation` the cap-farm mutter cycles (compiled to
  `src/generated/thoughts.ts`).
- `content/story-items.yaml` — `lore` pages on story items (keycards, dossiers,
  recovered hardware) (compiled to `src/generated/story-items.ts`).
- The engine modules beside those (`src/game/defs/cutscenes.ts`,
  `defs/thoughts.ts`, `defs/story.ts`) own the TYPES, the registries and the
  per-difficulty variant rule — never the lines.
- `pwa/src/game/copy.ts` — loose UI copy (how-to-play); flavor, not story.
- Brand strings (title, tagline) are **not** story — they live in
  `game.config.json` (see Parity rules below).

The engine that plays these lines is `src/game/story.ts`; the overlays that
render them are `pwa/src/game/overlays/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`.

## NAMING — invent it, don't borrow it

**Nothing in this game is named after a real person, company, product or
franchise — and that includes the near-miss pun.** The satire targets a
PHENOMENON (automation taking people's work, the people it makes rich, the
world it leaves behind) and never a nameable party. That is both the honest
version of the joke and the only version that ships: an app store may refuse a
game whose enemies are a real company on its own content guidelines, long
before anybody's lawyer reads a word of it.

**A NAME IS A QUARTER OF IT — this is the rule that gets missed.** A boss
renamed off a real person, still speaking that person's verbal tics, is that
person with a new nameplate. Four things carry identity and they move together
or not at all:

1. **THE NAME** — id, display name, file stem, sprite stem.
2. **THE VOICE** — `dialogue`, `lastWords`, barks, `lore`. A catchphrase, a
   signature insult, a manner of speaking, and any verifiable biographical fact
   (a filmography, a citizenship, a war, a court case) are each identification
   on their own.
3. **THE ART** — the sprite grid AND its `subject` slots. A silhouette
   identifies without a face: a stage costume, a distinctive hairline, the
   uniform somebody actually wears every day. **Trade dress counts double** — a
   brand's COLOUR SEQUENCE is protectable with no name attached, which is why
   the search baron wears a barcode rather than four coloured bars. And never
   trace a photograph: that puts a copyright question over the image on top of
   the likeness question over the person.
4. **THE DESCRIPTION** — `description`, every `subject.*` slot and the palette
   comments all ship in the generated library AND drive the next regeneration,
   so a cleaned grid with a dirty `subject` grows its likeness straight back.

**NAME THE ROLE, NOT THE PERSON.** THE FOUNDER, THE MODERATOR, THE FULFILLER,
THE SAFETY OFFICER, THE VENDOR, THE STRONGMAN, THE ROOT. The archetype is the
funnier half anyway — it is the thing being satirized, where the celebrity was
only ever one example of it — and it does not date. Read the shipped roster
before adding to it; new content joins that register, and a name needing
specialist knowledge to land at all (THE SUDOER) is off-register even when it
is safe.

What is SAFE, and generously so — most of this catalog already lives here:

- **Myth, folklore and antiquity.** The whole artifact tier (MJÖLNIR,
  EXCALIBUR, DRAUPNIR, GÁNDIVA, SAMPO) is public domain and always will be.
- **Real technical, historical and trade vocabulary.** A Tesla coil, a boot
  hill, a minute repeater, a perpetual calendar, a barcode, root access. These
  are words, not brands.
- **Historical EVENTS.** Alternate history is a genre. That the first landing
  happened, and when, is free; who specifically walked is not.
- **Long-dead figures — with the estate caveat.** TESLA (1943), HOUDINI (1926),
  EARHART (1937) and RASPUTIN (1916) sit outside any post-mortem publicity
  statute. A twentieth-century celebrity is a different thing: several states
  run a post-mortem right for decades (Ohio 60 years, and Tennessee's exists
  because of Elvis), and those estates enforce. "Dead" is not the test —
  "dead long enough, and with nobody left to act" is.
- **Invented brands.** GOODCO and TRUST ME BRO AI carry the whole corporate
  satire precisely because they are ours.

What to refuse, including the cases that do not feel like borrowing:

- A real person, **living most of all** — a living subject adds defamation to
  the publicity question, and depicting one committing a crime is the sharpest
  form of it. Note the dead are not automatically safe here either: Sweden
  prosecutes **förtal av avliden** where a claim about a deceased person wounds
  surviving relatives, and this repo's author is Swedish.
- A company or product name, **and the one-letter pun on it**. A swapped vowel
  is not a different mark.
- **A coined term from another fiction**, even where the premise is fair game.
  "Robot western theme park" is an unprotectable idea; calling the robots
  "hosts" borrows the expression. Premises are free, vocabulary is not.
- **A title echoing a franchise's construction** — especially where the swapped
  word is a SYNONYM rather than an opposite, since that is the same commercial
  impression, which is the actual test. EAST/WEST are opposites and distinguish;
  GONE/LOST are synonyms and do not.
- Real logos, mascots, slogans and brand colour sequences in grids or palette
  comments.

**THE MECHANICAL TRAP, if a sweep is ever needed again — it defeated four
consecutive passes that each looked exhaustive.** A regex word boundary does
NOT fire before `_`, so `\bmosque\b` silently skips `mosque_brand` and
`\bspacez\b` skips `spacez_armed`. Always follow a boundary pass with a
prefix-aware one, then grep for `<old>_` and `_<old>` separately. Three
neighbours of the same trap:

- **A display name may also be a JavaScript identifier** (`const EASTWORLD`), so
  a replacement containing a space breaks the parser rather than a test.
- **Library slugs are hyphenated** (`the-flagbearer`), so an id rename that
  writes `the_flagbearer` into a URL passes every type check and fails at
  runtime.
- **Scope content sweeps AWAY from `src/`, `server/` and `electron/`.** `host`
  is the multiplayer vocabulary as well as a park robot, and `content/mainmenu.yaml`
  carries the multiplayer HOST rows despite living under `content/`.
- **Anything auditing a rename must exclude itself**, or the bulk pass rewrites
  the list of names it was checking against and then reports clean.

**This governs the SHIPPED campaign.** A mod's names are its author's business
and answer to nobody — but `mod/examples/` is shipped content and follows the
rule like everything else.

## Parity / cross-cutting rules

- **Game identity is centralized.** `game.config.json` (repo root) is the one
  source for the title, tagline, description, `siteUrl`, `repoUrl`,
  `storagePrefix`, and `cacheIdPrefix`. App code reads it through
  `pwa/src/identity.ts` (`IDENTITY`, `FULL_TITLE`, `storageKey`); node
  build scripts import the JSON directly; `pwa/index.html` and
  `manifest.webmanifest` are filled/generated from it at build time by
  `pwa/pwa-plugin.ts`. Never re-hardcode a brand string elsewhere.
- `pwa/pwa-plugin.ts` `DEPLOY_SLOTS`, `pwa/src/app/pwa.ts`
  `cacheIdForBase`, and the slot paths in `.github/workflows/pages.yml` must
  agree — a mismatch makes slots clobber each other's precache or serve the
  wrong shell.
- `src/version.ts`, root `package.json`, and `pwa/package.json` versions
  must match; `tests/version_test.ts` and the extract script both enforce it.
- Icons are generated from `pwa/public/icon.svg` only (`make icons`) —
  never edit the PNGs. The OG card is generated the same way (`generate-og.mjs`,
  also part of `make icons`).
- **The manifest's install-prompt screenshots are REAL frames of the running
  game**, captured by `make screenshots`
  (`pwa/scripts/generate-screenshots.mjs`, which drives the build's own
  autopilot in headless Chromium — Playwright installed ephemerally, like the
  playtest harness). They are committed, because the manifest names them by
  path. Never hand-draw or compose one: an install prompt is a promise about
  what the player is about to get, and it is the one image surface where
  marketing art would be a lie. Re-run after an art pass or a HUD change
  (`check-seo` fails the build if a named file is missing, and warns if either
  the `wide` or `narrow` form factor is).
- In-game pixel assets (the sprite atlas, tiles, the UI font atlas) are
  generated from the `content/sprites/` YAML tree (one self-describing
  file per base sprite — see the `pixel-assets` skill) + `asset-tools/` only
  (`make assets`) — never edit the files under
  `pwa/src/game/assets/`. Those files are **gitignored and regenerated
  on every build** (like `src/generated/`, §11.2): `npm run assets` runs
  ahead of `vite`, `tsc`, and `vitest`, so the pixel grids are the sole
  committed source of truth. Never commit `pwa/src/game/assets/` — the
  binary atlas is a build output, not a reviewable artifact.
- **Levels are compiled from YAML**, the same way — and a level YAML is a
  MISSION, not a map: the geometry lives in `content/maps/<id>.yaml` and is
  carved per run (see **GENERATED MAPS**), so the loader refuses a mission that
  authors a wall, a spawn, a prop, a zone or a coordinate, naming where each one
  went. `content/levels/<id>.yaml`
  is the source of truth; `make levels` (folded into `make assets`, plus a root
  `pretypecheck`) validates it against the live engine catalogs and generates
  `src/generated/levels.ts` (the gitignored, regenerated-on-build output — never
  edit or commit it), which `src/game/defs/levels/index.ts` reads. The
  per-difficulty × per-map LEVEL LADDER — each map's `[start, end]` mob band +
  intended hero level per rung, PLUS the named DIFFICULTY RAMPS, the hp curves,
  and the three STAMINA ladders — lives in `content/ladder.yaml` (a
  hand-authored, committed source of
  truth like the level YAML, NOT in the level files). The stamina ladders price
  the sprint pool's whole economy per rung — `staminaDrain` (how fast a run
  spends it), `staminaRefill` (SECONDS a standstill breather takes) and
  `staminaEmptyLock` (SECONDS of dead-still a dry pool owes) — each climbing
  with the difficulty and validated as never easing; they compile into
  `DifficultyDef.staminaDrainMult` / `staminaRefillSec` / `staminaEmptyLockSec`
  and are tuned to one target: a build spending about a FIFTH of its stat
  points on STAMINA rides comfortably, one spending none runs dry, and the
  higher the rung the more that costs. A level's spawn points and
  pinned elites/bosses name a neutral, ordered **ramp** (`meek`→`monstrous` wave
  tiers off the band start, `endgame`/`apex` off the band end) and a single base
  `hp`; `loadLevels()` expands each ramp into the four [easy, medium, hard,
  nightmare] `mobLevels` / `level` + `hp` tuples (scaling hp by the map's
  `hpCurves` entry) and stamps `mobLevels` + `intendedLevel` onto every def — so
  the con viz and the engine read one ladder and every difficulty number is tuned
  from that one file. (A mission names no ramp of its own any more — its cast is
  the blueprint's, so `map-data/load-yaml.mjs` is what expands them now.) The
  round-trip guard (`tests/content/yaml_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/levels-snapshot.json`; accept an intentional
  level change with `node scripts/update-level-snapshot.mjs`. Read one run's
  carve of a map with `make map-layout LEVEL=<id>`
  (`scripts/map-layout.mjs` — a high-res visual overview: coordinate
  grid, walls, distinct shapes, and CON CIRCLES for spawns (area
  = count, colour = con vs the ladder's `intendedLevel`); `--seed` picks which
  run, `--size` the scale), and how it plays with `make map LEVEL=<id>`
  (`scripts/map-preview.mjs` — design/`--actual`/`--heatmap`).
- **The hero level curve is compiled from YAML**, the same way.
  `content/leveling.yaml` authors the XP each level costs (rows annotated with
  their kills-per-level equivalents); `make levels` runs
  `generate-leveling.mjs` first in the chain to validate it (levels 1..98, no
  gaps) and emit `src/generated/leveling.ts`, which the engine's `xpToLevelUp`
  reads. The per-difficulty tier slowdown and the endgame steepening stay
  config knobs applied on top (they power the DEVELOPER → BALANCE sliders).
- **Enemies are compiled from YAML**, the same way. `content/enemies/<biome>/<id>.yaml`
  is the source of truth — one self-describing file per mob, file stem == the
  enemy `id`, carrying the whole `EnemyDef` (`src/game/defs/enemies/types.ts`).
  `make levels` runs `generate-enemies.mjs` (loader
  `scripts/enemy-data/load-yaml.mjs`, schema
  `scripts/asset-tools/enemy-schema.mjs`) to validate every def against
  the live cross-ref catalogs (companions, uniques, story items, weapons/gear)
  and emit `src/generated/enemies.ts` (gitignored, regenerated on build — never
  edit or commit it), which `src/game/defs/enemies/index.ts` re-exposes as
  `ENEMY_DEFS`. It **must run before assets/levels** — both
  `generate-assets.mjs` (the sprite pipeline derives wound frames from every
  enemy's `role`/`gore`) and `generate-levels.mjs` (cross-ref the enemy ids)
  import the enemy catalog — so the chain is `generate-leveling →
generate-items → generate-enemies → generate-powerups → generate-assets →
generate-levels → generate-bot-tuning`. The biome directory is organizational
  only (the merged catalog is flat; a duplicate id fails the build). The
  round-trip guard (`tests/content/enemy_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/enemies-snapshot.json`; accept an
  intentional enemy change with `node scripts/update-enemy-snapshot.mjs`. See the
  `enemy-design` skill.
  **EVERY MONSTER OWES A PARAGRAPH — `EnemyDef.lore`, and the rank and file owe
  it most.** A named elite explains itself in its `dialogue`; a minion never
  gets to, which is precisely why a horde nobody wrote a line about reads as a
  texture rather than as the inhabitants of somewhere. So the field is REQUIRED
  of all 106 (the build refuses a def without it, and warns past 420
  characters), it is written in the same dry register as an item's
  `description`, and it is the one field on the def authored for a READER —
  nothing in the simulation touches it, and the library's bestiary prints it
  under the portrait, in the open rather than behind the spoiler reveal. It is
  bound by the story chain like any other story text: it may only ELABORATE
  what `docs/story.md` and `docs/manuscript.md` already establish, never
  introduce a plot fact of its own, which is what keeps it out of the
  manuscript's verbatim transcription (exactly as an item's description is).
- **Powerups are compiled from YAML**, the same way — and they are the one
  catalog that lives in a SINGLE file. `content/powerups.yaml` is the source of
  truth for every timed pickup power (a `powerups:` map of id → power, the
  catalog key stamped in as the def's `id`), carrying every duration, damage
  figure, radius and interval, so a rebalance never touches engine code.
  `make levels` runs `generate-powerups.mjs` (schema
  `scripts/asset-tools/powerup-schema.mjs`) to validate each power — required
  fields, a known `kind`, EXACTLY the param block that kind requires and no
  other kind's, non-negative numbers, and every `icon`/`sprite` cross-checked
  against the sprite tree — and emit `src/generated/powerups.ts` (gitignored,
  regenerated on build — never edit or commit it), which
  `src/game/defs/abilities.ts` re-exposes as `ABILITY_DEFS`. That module keeps
  the TYPES (`AbilityDef`, and what each block means); the schema mirrors them,
  so keep the two in step when a kind gains a field. It **must run before
  levels** (the level pipeline cross-refs every `loot.abilityPool` id). The
  snapshot guard (`tests/content/powerup_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/powerups-snapshot.json`; accept an
  intentional rebalance with `node scripts/update-powerup-snapshot.mjs`.
  **THE CAMPAIGN INTRODUCES TWO NEW POWERS PER MAP** and every map's pool keeps
  what came before (`loot.abilityPool` in each `content/levels/<id>.yaml`), so
  the dock's vocabulary grows the whole way down and each venue is announced by
  two powers that could only have come from there.
- **THE PASSIVE TALENT TREES are compiled from YAML too, and a TALENT IS WHAT IT
  CARRIES.** `content/talents.yaml` (a `talents:` map of id → talent, the catalog
  key stamped in as the def's `id`) is the source of truth for all three trees;
  `make levels` runs `generate-talents.mjs` (schema
  `scripts/asset-tools/talent-schema.mjs`, loader `scripts/talent-data/`) to emit
  `src/generated/talents.ts`, which `src/game/defs/talents/index.ts` re-exposes
  as `TALENT_DEFS`. It is a LEAF pipeline — its only engine import is the
  import-free `config/talents.ts` for the shared rank cap — and nothing
  cross-references a talent id, so it has no downstream dependents in the chain.
  The snapshot guard (`tests/content/talent_roundtrip_test.ts`) pins the compiled
  catalog to `tests/content/fixtures/talents-snapshot.json`; accept an
  intentional rebalance with `node scripts/update-talent-snapshot.mjs`.

  **`TalentKind` IS A LABEL, NEVER A DISPATCH KEY** — the same rule `AbilityDef`
  follows. It names the role the picker groups and tints by; what a talent DOES
  is whatever it carries: an `effect:` bag of per-rank slopes summed at the ONE
  read site that owns each rule, a `conjure:` feeding an always-on granted spell
  through the machinery a legendary's `spell` affix already drives, and/or a
  **PROC BLOCK** — a structured effect (`parry`, `volley`, `frostNova`,
  `seismic`, …) whose chances, radii and cooldowns live on the def. Those numbers
  used to sit in `config/talents.ts` under a key the accessor reached for by
  SHIPPED TALENT ID, which is exactly what made the trees unmoddable: a mod could
  author a talent and have no numbers to put in it. **A hook now asks the catalog
  WHICH TRAINED TALENT CARRIES A BLOCK (`procTalent` in `talent-effects.ts`),
  never what rank `frost_nova` is** — so a mod's talent can fire a shipped proc
  with its own tuning. Adding a proc is a block type on `TalentDef` + an entry in
  `TALENT_BLOCKS` + one reader + its `PROC_BLOCKS` entry in the schema.

  **A PROC HAS EXACTLY ONE CARRIER**, enforced at build time (over BASE ∪ MOD in
  the mod compiler): two carriers would make "whose numbers apply" a question
  about catalog order, which is not a decision anybody made — re-carrying a proc
  means REPLACING the talent that has it. And **a talent carrying nothing at all
  is refused**, since it would draw a card, cost a point and buy nothing forever
  with no error to explain it. What stays in `config/talents.ts` is only what is
  true of EVERY talent — the shared rank ceiling, which prices the whole level-up
  flow — and a def may choose a shallower ladder, never a deeper one.

- **Items are compiled from YAML**, the same way. `content/items/<rarity>/<id>.yaml`
  is the source of truth — one self-describing file per hand-authored item
  (stem == id, directory == rarity: `regular`/`trash` for the plain bases,
  `set`/`unique`/`legendary`/`artifact` for the named chase), each carrying its
  sprite refs, a few sentences of `description` lore, and (pool bases) its
  `grades:` identities — plus the two knob files: `content/item_quality.yaml`
  (the BROKEN→PERFECT make-quality axis) and `content/item_rarity.yaml` (the
  tier ladder, unlock gates, roll chances, MF saturation, elite/boss bonuses).
  `make levels` runs `generate-items.mjs` (loader `scripts/item-data/load-yaml.mjs`,
  schema `scripts/asset-tools/item-schema.mjs`) **first in the chain** — it
  imports nothing from the engine, and every later generator reads the
  equipment catalogs — to emit `src/generated/items.ts` (gitignored, regenerated
  on build — never edit or commit it), which `defs/equipment.ts`/`gear.ts`/
  `grades.ts`/`uniques.ts` and the config `QUALITY`/`LOOT` rarity knobs read.
  The engine's built-in `blaster` sidearm stays authored in `equipment.ts`
  (engine machinery, not content). The round-trip guard
  (`tests/content/item_roundtrip_test.ts`) pins the compiled catalogs to
  `tests/content/fixtures/items-snapshot.json`; accept an intentional item
  change with `node scripts/update-item-snapshot.mjs`. See the `weapon-system`
  skill.
- **Sounds and MUSIC are compiled from YAML too — and they emit into
  `pwa/src/generated/`, not `src/generated/`.** A sound is an APP concern: the
  engine emits events and has no idea they make a noise, so parking 273 voices
  and five scores in the engine's tree would hand every consumer of
  `@game/core` data it never reads. `content/sounds/<id>.yaml` is one sound (a
  list of synth VOICES, played by name or by an `on:` event shape) and
  `content/music/<id>.yaml` is one tracker-style score (instruments, patterns
  of note tokens, an order); `make levels` runs `generate-sounds.mjs` and
  `generate-music.mjs` (schemas `scripts/asset-tools/sound-schema.mjs` and
  `music-schema.mjs`, loaders `scripts/sound-data/` and `scripts/music-data/`).
  The sound bank emits SPLIT — `sounds.ts` for the run, `sounds-ui.ts` for the
  interface — because a menu click must not drag every kill and explosion into
  the 170 KB critical path; the music emits **one module per track** plus an
  index of dynamic imports, for the same reason, so a score is fetched when its
  venue starts and never before. The round-trip guard
  (`tests/content/music_roundtrip_test.ts`) pins the compiled scores to
  `tests/content/fixtures/music-snapshot.json` — frozen from the hand-written
  TypeScript scores the moment before the lift, so it is a PROOF that nothing
  changed, not merely a baseline; accept an intentional change with `node
scripts/update-music-snapshot.mjs`. `tests/sound_catalog_test.ts` is the
  sounds' equivalent, replaying the old imperative bank against the catalog.
  **A level's `music:` is cross-checked** against `content/music/` by the level
  schema — an unknown id used to be silent, the player falling back to the
  default theme so the venue quietly played the moon's music.
- **THE TITLE MENU is compiled from YAML too — and it is the one catalog a MOD
  may not replace.** `content/mainmenu.yaml` is the source of truth for the whole
  menu tree; `make levels` runs `generate-menu.mjs` (schema
  `scripts/asset-tools/menu-schema.mjs`, loader `scripts/menu-data/`) to emit
  `pwa/src/generated/menu.ts` — into the APP's tree, like the sound bank, because
  the engine has no idea the game has a title screen. It is a LEAF pipeline: its
  only inputs are the sprite stems and the pixel font's own glyph map, so nothing
  in the chain waits on it and it has no downstream dependents. See **THE TITLE
  MENU IS CONTENT** for the tree's shape, what the compiler refuses, and why the
  loader takes no directory.
- **THE COMPANION ROSTER is compiled from YAML too.**
  `content/companions.yaml` (a `companions:` map of id → companion — who a spared
  elite BECOMES when it joins the party) is the source of truth; `make levels`
  runs `generate-companions.mjs` (schema
  `scripts/asset-tools/companion-schema.mjs`, loader `scripts/companion-data/`)
  to emit `src/generated/companions.ts`, which `src/game/defs/companions.ts`
  re-exposes as COMPANION_DEFS. It runs AFTER the item pipeline (a companion's
  signature `weapon` is cross-checked against the live weapon catalog) but is
  deliberately NOT a prerequisite of the enemy pipeline: `generate-enemies.mjs`
  reads the ids an elite's `spareable:` may name from the content tree through
  the same loader, so neither generator waits on the other. The schema's one
  non-obvious rule is that a `power:` may not grow a kit the def hasn't got — a
  `novaRadiusPerRank` with no `nova:` block ranks up forever and adds nothing,
  silently, which is precisely what a compile-time check is for. The snapshot
  guard (`tests/content/companion_roundtrip_test.ts`) pins the compiled roster to
  `tests/content/fixtures/companions-snapshot.json`, frozen from the hand-written
  TypeScript catalog the moment before the lift so it is a PROOF that nothing
  changed; accept an intentional change with `node
scripts/update-companion-snapshot.mjs` (and remember a change to `joinWords` or
  `killQuotes` owes docs/manuscript.md an update, which needs the user's
  confirmation first).
- **THE STORY is compiled from YAML too, and that is what makes a CONVERSION
  possible.** `content/cutscenes/<id>.yaml` (one scene: a stage, a cast, a
  timeline of beats), `content/thoughts.yaml` (the hero's inner monologues plus
  the `capRotation`) and `content/story-items.yaml` (the plot pieces and their
  `lore`) are the sources of truth; `make levels` runs `generate-story.mjs`
  (schema `scripts/asset-tools/story-schema.mjs`, loader `scripts/story-data/`)
  BEFORE the enemy and level pipelines, which cross-ref the ids it writes. Until
  the lift, a mod could ship a venue and a horde but no scenes, no monologues and
  no lore — a re-skin rather than a different game. Three things are worth
  knowing before touching it:
  - **`variants:` is how one scene is five.** The prelude is the same living room
    on every difficulty except the weapon on the wall, so it is authored ONCE
    with `label:` handles on the parts that differ; the loader patches those
    labels per rung and emits `prelude_<difficulty>`, which is exactly what
    `cutsceneVariant` resolves at run creation. Labels are authoring handles and
    never reach the game. Five near-identical files would have been five files to
    keep in step.
  - **A prop's sprite is `sprite:`, not `kind:`.** `CutsceneProp.kind` is a
    renderer key in the generic player (`src/lib/cutscene.ts`, which knows
    nothing about sprites); in this renderer a prop kind IS a sprite name, and
    one file cannot readably spell `kind` for both a prop's art and a beat's
    discriminant. The loader does that one rename and nothing else.
  - **A level's `prelude` is cross-referenced now.** An unknown scene id used to
    throw out of `cutsceneDef` at the moment the venue opened — invisible to
    every test that does not start that level.
- The **autopilot's positioning knobs** compile the same way. `content/bot.yaml`
  (a global `default:` layer + per-level `levels:` overrides, mirroring
  `ladder.yaml`) is the hand-authored source of truth; `make levels` runs
  `generate-bot-tuning.mjs` to emit `src/generated/botTuning.ts`, which
  `src/game/bot/index.ts` resolves per level via `botTuningFor(state.level.id)`
  (`src/game/bot/tuning.ts` holds the `BotTuning` schema + neutral defaults). See
  the `bot-improvement` skill. The generated file is gitignored/regenerated; the
  YAML is committed.
- The **pixel font glyph set** is hand-defined in
  `scripts/asset-tools/font.mjs` (the `GLYPHS` map — `#` lit, `.`
  transparent, 3×5 variable-width cells); `make assets` packs it into the font
  atlas + metrics that `PixelText`/`pixel-font.ts` render at runtime. Lookups
  uppercase the character, so anything `PixelText` draws must have a glyph key
  there or it falls back to `?`. **Before rendering a new character** (a symbol
  like `×`, an accented letter, punctuation), add its glyph to `GLYPHS` (and to
  the specimen line in `generate-assets.mjs`) and rerun `make assets` — don't
  work around a missing glyph with a substitute. Verify the new glyph in the
  running UI, not just the specimen preview. The same `GLYPHS` map is also
  packed into a real **WOFF2 webfont** (`scripts/asset-tools/webfont.mjs`) that
  the library's static pages set their headings in — one source, two outputs, so
  a new glyph reaches both.
- **THE LIBRARY is generated, and its pages are never edited by hand.** The
  reference site at `/library/` (`pwa/scripts/library/`, see
  `docs/architecture.md`) is nine sections —
  **bestiary** (one page per monster), **allies** (one page per companion —
  who to spare to recruit it, what it brings, and what every rank of its
  signature power comes to), **arsenal** (one per named relic and one
  per base item; a generated grade variant has no page of its own, it is
  described on the ancestor it was generated from), **talents** (one per passive
  talent, plus the three trees and the point economy on the index), **powers**
  (one per powerup, grouped by the venue that introduces it), **mission guide**
  (one per venue), **errands** (one per quest and one per quest giver, grouped
  by the venue they stand on), **achievements** (one page per CATEGORY of badge
  — the one section whose unit is a GROUP rather than an entry, because a badge
  is four facts and a sprite and 244 pages of that is thin content beside the
  arsenal page each relic trophy already points at) and **story** (one chapter
  per mission) —
  cross-linked so a
  monster reaches what it drops, an item reaches
  what pays it out, a power reaches the venues whose pools carry it, a
  conjuration talent reaches the pickup that puts the same thing on the field, an
  errand reaches the breed it sends the hero at and the person who asked, a badge
  reaches the relic, mission or ally it is for (off `AchievementDef.subject`,
  which the badge catalog states so the library never recovers it by pulling an
  id apart), a
  mission reaches all of them, and a chapter reaches the rest. It is compiled from the compiled
  catalogs plus LIVE ENGINE CALLS for every derived number — the same
  `scripts/game-alias-loader.mjs` seam `weapon-budget.mjs` and `drop-rate.mjs`
  use. **No gameplay number is ever typed into the generator**; a fact that
  can't be reached by reading a catalog or calling the engine is a finding, not
  a licence to hardcode. And the question is never "what does the catalog say"
  but "what would the game SHOW": a weapon's authored `damage` is halved for
  every LOOTED weapon before a player sees it, so the arsenal quotes the item
  card by calling the card's own functions against a REFERENCE HERO (a real
  `createGame` at level 1, who has spent nothing, so the wielder term is 1).
  The TALENTS section is the same discipline one step further: a rank's figures
  come back from the accessor that owns the rule with the talent trained
  (`withTalent`), never from the authored `…PerRank` slope, because the slope
  says 80% at rank 5 where the talent's own ceiling holds a real hero at 75%.
  Change a page by changing a generator — and when a catalog gains a field,
  DECLARE it in the matching coverage map (`ENEMY_FIELDS`, `WEAPON_FIELDS`,
  `GEAR_FIELDS`, `UNIQUE_FIELDS`, `LEVEL_FIELDS`, `POWER_FIELDS`,
  `TALENT_FIELDS`, `COMPANION_FIELDS`, `STORY_ITEM_FIELDS`,
  `THOUGHT_FIELDS`, `CUTSCENE_BEAT_KINDS`, `ACHIEVEMENT_FIELDS`), because the
  build fails on an authored field no page renders (the alternative is hundreds of pages silently
  going incomplete). **The STORY section takes its prose from `docs/story.md`
  and every quoted line from the GAME** — the cutscenes, level intros/outros,
  enemy dialogue and last words, pinned thoughts and story-item lore — never
  from `docs/manuscript.md`, which is a transcription of those same lines and
  would be exactly the second copy the library exists not to have; the
  manuscript still governs, through the test. `docs/story.md` is parsed
  structurally (`story-doc.mjs`, `model-story.mjs`), so a section it cannot
  place, a venue it writes about that no longer exists, a venue nobody wrote
  about, or a chapter whose travel scenes disagree with the level's own
  `prelude` chain all FAIL THE BUILD rather than drifting. What the library shares with the game it SHARES rather than
  copies: the window skin (`pwa/src/lib/pixel-panel.css`), the item card
  (`pwa/src/lib/item-card.css`), an affix's wording (`@ui/lib/affix-line.ts`),
  the tier/affix colours (`pwa/src/game/tiers.ts`), the talent trees' personas
  and accents (`pwa/src/game/talent-look.ts`), the ground rule
  (`render/ground-tiles.ts`), and a mission's MAP (the level drawn whole with
  the game's own sprites by `scripts/level-render.mjs --bare --dormant`, shrunk
  to fit). Improve it with the `library-improvement` skill: never judge a page
  from its markup, judge the screenshot.

## Game development skills

The repo ships a skill for each recurring game-development activity, so the
workflow (and its quality bars) stays consistent across sessions. Load the
relevant `SKILL.md` before starting that kind of work:

| Skill                 | Use for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-game`            | Turning a clone of this repo into a new game/sequel — the ordered bootstrap: rename via `game.config.json`, strip content, rebuild on the same engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `engine-system`       | Adding/changing gameplay systems (enemies, weapons, items, rules) — the engine-first workflow: config → types → step → events → tests → presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `level-design`        | Adding a new level/mission — the TWO files a venue is (the mission's `content/levels/<id>.yaml` and the blueprint its map is carved from, `content/maps/<id>.yaml`), the map renderers (`map-layout.mjs` layout blueprint + `map-preview.mjs` analysis view), campaign registration and unlock order, the cumulative loot-pool rule, XP/arrow-cap pacing wiring, and the checker + test battery a new venue must pass.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `map-improvement`     | Improving an EXISTING venue's design and FEEL — the render → evaluate → improve loop. LOOKS at the layout blueprint (`make map-layout`) first, confirms the intended feel with the user (the YAML descriptions may be wrong), then reads the played heatmap and iterates. Its edits land in the venue's BLUEPRINT (areas, object palette, horde, cast) and its mission file, never in a hand-drawn layout — there is none; for the generator itself, see `mapgen-improvement`.                                                                                                                                                                                                                                                                                                                                                   |
| `mapgen-improvement`  | Improving the MAP GENERATOR — the GENERATED MAPS feature that carves every mission fresh from its v2 blueprint per run, so a change lands on six missions × three sizes × every seed at once. The carve → dress → verify architecture and which file answers which question, how to add a new object purpose / area rule / `LevelDef` capability (and the four places each touches), the render → CROP → judge → iterate loop, the invariants that are load-bearing and easy to undo by accident (walls from borders, districts from seeds, densities not counts, tile-snapped ground zones, per-feature rng streams), what actually makes a carve look designed, and the verification traps — chiefly a nav grid built from a different carve than the def it paths through, which makes every assertion pass and mean nothing. |
| `enemy-design`        | Adding or reworking an enemy (minion/elite/boss) — the `EnemyDef` anatomy, picking hp/damage against the scaling model (`LEVELING.refMobHp` anchor), mechanics/phases, manuscript-governed dialogue/lastWords, spareable companions, loot signatures, auto-derived wound sprites, and the content tests that bite when a piece is missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `quest-design`        | Adding or reworking a QUEST — the errands the field's non-combatants ask of the hero — or the person who hands one out, the conversation tree behind it, or a campaign-long chain. The two catalogs and their pipeline (`content/quests/<id>.yaml` + `content/quest-givers.yaml`, compiled by `make levels`), the eight objective kinds and what each is FOR, how a reward is priced (`xpShare` against the hero's own bar, calibrated on the shipped 39), campaign vs run errands and why a chain may not mix them, conversations and neutral mobs, the trader hook, the story-chain obligation every spoken line carries, and the build refusals + content tests that bite when a piece is missing.                                                                                                                            |
| `weapon-system`       | Adding/rebalancing weapons and loot (bases, level requirements, tiers/affixes, drop rules, projectile behaviors) — the def-first workflow with two verification loops: the damage-budget calculator (`scripts/weapon-budget.mjs`), the stat checker (`scripts/weapon-stats.mjs`), and the arsenal sheet (`scripts/weapon-sheet.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `leveling-balance`    | Tuning how fast the hero levels — the XP curve, kills-per-level pacing, the flat mob-priced XP payouts (elite/boss/arrow knobs in `content/leveling.yaml`), the level cap, the onboarding ramp, the diminishing-returns curve on stats, the per-map XP caps — via the kills-per-level model, the calculator (`scripts/leveling-curve.mjs`), and the per-level pacing graph (`scripts/leveling-pace.mjs`), with simulated runs measuring the real dings.                                                                                                                                                                                                                                                                                                                                                                          |
| `simulate-run`        | Measuring ACTUAL balance by running the real engine headlessly (`scripts/simulate-run.mjs`; engine side `src/sim/simulate.ts`): whole levels or whole campaigns easy → JESUS with the autopilot, auto-equip, and loadout carry, the hero immortal by default (deaths booked with cause + coordinates; `--mortal` restarts the level on death, `--max-deaths` aborts a run that keeps dying, and the DEATHS table feeds the map renderer's death overlay) — reporting hero/mob hp, damage per hit dealt and taken, drops, weapon swaps, deaths, and XP withheld by the per-map caps.                                                                                                                                                                                                                                              |
| `pixel-assets`        | Creating or changing sprites, tiles, palettes, animations, or pixel-font glyphs — the generate → look → evaluate → loop cycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `art-improvement`     | Finding and replacing the game's WORST art — the audit funnel (`scripts/art-audit.mjs`): numbered sheets per level or of the item catalog, shortlist 30 → 20 → 10, five manuscript-grounded concepts per finalist plus two refinements, an in-game pose check of each stageable winner (frozen `?scenario=`), per-candidate commits, then a numbered before/after sheet the user votes on before the PR.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sound-effects`       | Adding or tuning synthesized WebAudio SFX — the sound vocabulary, mixing rules, and audition loop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `talent-fx`           | Creating or tuning the passive TALENTS — the always-on melee/ranged/magic trees: a talent's rank numbers and its ALWAYS-ON FX (the magic tree's orbiting flames / storm / seeker orbs / singularity / immolation aura, the melee/ranged proc + defensive cues), per-rank FX upgrades, and catalog balance (rank slopes, proc caps, unlock stat) — via the generate → look → evaluate → iterate loop with `pwa/scripts/talent-preview.mjs` (staged FX frame strips + per-rank sheets) and the `?debug` `window.__talent` hook.                                                                                                                                                                                                                                                                                                    |
| `visual-effects`      | Creating or tuning a transient VISUAL EFFECT — explosions, flashes, hit splashes, auras, screen washes, death/spawn flourishes. The two FX surfaces (world-anchored canvas effects in `render/effects.ts` vs screen-space CSS DOM overlays like `createNukeFx`), the event → effect → draw flow, the `?debug` preview-hook + Playwright screenshot loop, and the craft rules (t-driven timelines, additive light, determinism, layering, reduced-motion) that make an effect read as spectacular.                                                                                                                                                                                                                                                                                                                                |
| `playtest`            | Verifying changes in the running game and tuning game feel with the autoplay bot (`pwa/scripts/playtest.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bot-improvement`     | Improving the AUTOPILOT (`src/game/bot/index.ts`) — how the bot reads a fight and moves, toward HUMAN-capability play (approach but hold at weapon reach, kill from a distance, no dives). The reproduce → read the thought trail → hypothesize → edit `src/game/bot/`/`bot.yaml` → re-measure loop, the `bot.yaml` knob pipeline (`content/bot.yaml` → `src/generated/botTuning.ts` → `botTuningFor`), the `think()`/BOT VIEW discipline, and the determinism rules.                                                                                                                                                                                                                                                                                                                                                            |
| `debug-game`          | Investigating gameplay/render/input/audio bugs — deterministic seed repros, `?debug` + `window.__game`, failing-test-first fixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test-scenario`       | Staging an exact in-game situation to reproduce a bug, probe fps, or eyeball a context — the `?scenario=` URL param / `applyScenario` spec (place the hero at the boss or merchant, set hp/gear, clear the field, spawn mob rings — pre-wounded if asked, lay out ground items, freeze the world into a pose) plus the FPS meter (DEBUG MODE or `?debug`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `store-shots`         | Regenerating the App Store / Play Store screenshot set — after resprites, an art pass, a HUD change, or new powers/talents. Drives the real game to staged ENDGAME moments (nightmare, late maps, legendaries, powers detonating) at Apple's exact rasters, captions them in the game's own pixel font, and holds each frame to a quality bar before it reaches a listing.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `menu-design`         | Changing the TITLE MENU — a screen, a row, its order, wording, icon or help line; hiding a row on some builds; a new settings toggle/slider/tick-box/keybinding row; a page heading or breadcrumb; a new screen's BACK/Escape wiring; menu layout and alignment. The tree is CONTENT (`content/mainmenu.yaml`) and the behaviour is code (`menus-*.ts`) — the map of that seam, the widget vocabulary, the compiler's refusals, and the screenshot verify loop.                                                                                                                                                                                                                                                                                                                                                                  |
| `ui-review`           | A fit-and-finish pass over the game's UI (screens, modals, popups, toasts) — the screenshot-audit loop: capture every surface at the nine reference viewports (`pwa/scripts/ui-shots.mjs`), judge against the quality bar, unify off-skin surfaces, fix clipping/overflow, verify with re-captures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `update-story`        | Writing, rewriting, retoning or removing ANY line the game speaks — a cutscene caption, a level intro/outro, an elite/boss `dialogue` or `lastWords`, a boss bark, a pinned thought, a merchant greeting, a quest offer, a companion's joining words, a story item's lore — as well as reshaping a scripted scene, replacing an elite/boss, or reconciling a drifted tier. Walks the three-tier chain top-down (`docs/story.md` → `docs/manuscript.md` → `content/`) so the tiers never drift.                                                                                                                                                                                                                                                                                                                                   |
| `library-improvement` | Building or improving THE LIBRARY — the generated companion site at `/library/` (bestiary, arsenal, mission guide, achievements, story; see `docs/architecture.md`). The generate → look → judge → improve loop: regenerate, screenshot at the reference viewports, hold every page to the quality bar (does it wear the game's own skin, is every number the engine's own, does it read like Arreat Summit rather than a database dump, do the spoiler panels cover without hiding from crawlers), fix the worst in the GENERATOR, and loop — with before/after sign-off before shipping.                                                                                                                                                                                                                                       |

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill            | When to run                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order.        |
| `update-docs`    | After any change to the public API, configuration keys, or error messages.                                                        |
| `update-readme`  | After any change that alters user-visible behavior, commands, or install instructions.                                            |
| `update-website` | After changes that affect the deployed app's SEO surfaces or source-derived content under `pwa/`.                                 |
| `update-prompts` | After any change to an LLM prompt's source of truth (embedded docs, rendering-context keys, JSON-schema enums, validation rules). |
| `sync-oss-spec`  | When the repo may have drifted from `OSS_SPEC.md` — walks the spec's mandates and fixes violations.                               |
| `commit`         | To commit, push, and open/update a PR with a conventional-commit title.                                                           |

Each skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the baseline commit hash). Run a skill by loading its `SKILL.md` and following the discovery process and update checklist. The skill rewrites `.last-updated` at the end of a successful run, and improves itself in place when it discovers new mapping entries. The `maintenance` skill owns a **Registry** table listing every `update-*` skill — add a row whenever you create a new sync skill.

## Skill lessons — fragments, not SKILL.md edits

When a session learns a gotcha or heuristic while running any skill, it
records it under `.agent/skills/<skill>/.lessons/<unix-timestamp>-<slug>.md`
— one file per lesson, YAML front matter with `title`/`date`, the lesson in
the body; the full convention is
[`.agent/skills/LESSONS.md`](.agent/skills/LESSONS.md). Read a skill's
lessons back with `node scripts/skill-lessons.mjs <skill>` before starting
that kind of work. Never append lessons to a `SKILL.md`: parallel sessions
editing one file cause merge conflicts, while fragments never collide. A
periodic consolidation pass (its own commit) merges near-duplicate lessons,
deletes stale ones, and promotes the load-bearing ones into the skill's main
instruction — that is the only time lesson content moves into `SKILL.md`.
