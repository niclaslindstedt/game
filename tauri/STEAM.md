# Releasing to Steam — the store side

Everything about shipping the desktop app to Steam that is about the STORE
rather than the build: the partner account, the app records, the store page
and its art, and the release itself. Building the depot and uploading it are in
[`RELEASING.md`](RELEASING.md); this file is the half that is one app on one
store, whatever builds the binary.

The app **embeds the whole game** and serves it from a private scheme, so it
plays offline and is an app rather than a viewer for a website — see
[`README.md`](README.md).

> **Licence note.** The repo uses PolyForm Noncommercial 1.0.0 plus the Ada's
> Trail Feature Terms, which reserve player use of mods and multiplayer for an
> acquired Steam licence. As the sole copyright holder you are not bound by the
> licence you grant, so selling the game is yours to do. The public docs and
> store copy must keep that scope clear.

---

## 0. One-time prerequisites

- **Steam Direct** — **$100 per app**, recoupable once the app earns $1,000.
  Includes identity verification and tax forms; start it first.
- **Steamworks SDK** — free, from
  [partner.steamgames.com/downloads](https://partner.steamgames.com/downloads/list).
  `steamcmd` lives in `tools/ContentBuilder/builder*/`. Put it on your `PATH`.
- **A Mac** — required for the macOS build, unlike the mobile app. There is no
  cloud builder here: the bundler must run on macOS to produce and sign a
  `.app`, and notarization needs Apple's toolchain.

Log steamcmd in once, interactively, so it can answer Steam Guard and cache the
session:

```sh
steamcmd +login <your-steam-username>     # answer the Steam Guard prompt, then `quit`
export STEAM_USER=<your-steam-username>   # what `npm run steam:upload` uses
export STEAM_WEB_API_KEY=<publisher key>  # what the achievement verify (§1.4) uses
```

Do this before anything scripted. A first non-interactive run always fails on
Steam Guard, and it fails several minutes into a build.

### The one that blocks everything else

**The 30-day store-page wait.** Valve requires an app's store page to be public
for **30 days** before it may release. Nothing about the code shortens it, and
it runs in parallel with everything else in this file — so put the store page up
as early as you are willing to, and treat the rest as work to finish inside that
window.

Alongside it: **bank and tax details** in the partner site. Until those are
complete the app cannot be sold at all, and a bounced tax form is a multi-day
round trip.

### Know what is still missing, at any point

Two read-only commands split the checklist between them, and both are worth
re-running after every step below.

```sh
make store-preflight                                   # from the repo root
```

The **store page**: the app and depot ids, whether they are Valve's shared test
app, the achievement manifest against the game's own catalog, the capsule art at
Valve's exact dimensions, the five required screenshots, and the listing link.
It runs from a cold checkout — nothing has to be installed or built — and its
`STEAM` section is the Steam half (the sections above it are the App Store's).

```sh
npm run steam:upload -- --platform windows --dry-run   # from tauri/
```

The **upload**: that a packaged build exists, that Valve's redistributable
landed beside the executable, and that the embedded website was built for the
store rather than with the developer menu still in it. It needs a finished
depot build, so it answers "can I upload this" rather than "what is left". Each
of the things it checks otherwise fails **silently** — see
[What fails quietly](RELEASING.md#what-fails-quietly).

## 1. Create the app records

1. **Steamworks** → create the app. Note the **App ID** (the number in the
   partner-site URL).
2. **App Admin → Depots** → create one depot per platform. A depot is just a
   bucket of files with an OS attached; three of them keeps each download to the
   platform that needs it.
3. Put all four numbers in [`store/steam.json`](store/steam.json):

   ```json
   {
     "appId": 1234560,
     "depots": { "windows": 1234561, "macos": 1234562, "linux": 1234563 }
   }
   ```

   Committed rather than gitignored — they are not secrets, and every machine
   that builds a release needs the same values. CI can override them with
   `GIS_STEAM_APP_ID` / `GIS_STEAM_DEPOT_WINDOWS` and friends.

4. **App Admin → Achievements** → create the rows generated into
   [`store/steam-achievements.json`](store/steam-achievements.json). The `id`
   column is the achievement's **API Name** and the game reports it verbatim, so
   it must match exactly. Regenerate the file with
   `node scripts/steam-achievements.mjs` from the repo root; the test suite
   fails when it drifts from the catalog.

   **Do not transcribe it from the JSON.** Valve documents no API for creating
   an achievement _definition_ — the Web API unlocks and queries stats at
   runtime, the schema is authored here, by hand, one web form per row — so the
   entry stays manual and 87 rows read out of a text editor while a browser
   waits is exactly where a typo comes from. Two commands split the job at the
   line Valve draws:

   ```sh
   make store-steam-achievements                      # the worksheet
   make store-steam-achievements ARGS="--verify"      # …then check what you typed
   ```

   The **worksheet** prints one block per achievement with the fields in the
   order this form asks for them and both icon paths filled in, so it is read
   top to bottom without re-deriving anything per row.
   `ARGS="--format tsv --out /tmp/rows.tsv"` writes the same thing as a
   spreadsheet instead.

   The **verification pass** is the half that actually retires the risk. It
   reads the app's achievement schema back
   (`ISteamUserStats/GetSchemaForGame`) and names every id the partner site is
   missing — and, when a missing id is a near-miss on one the site DOES have,
   says so, because a typo and an unentered row look identical and are
   completely different work. It exits non-zero on a missing id, reports
   drifted display text without failing (add `--strict` to fail on that too),
   and names any row still drawing Valve's placeholder instead of our icons.
   It needs a **publisher Web API key**:

   ```sh
   export STEAM_WEB_API_KEY=…   # Steamworks → Users & Permissions →
                                # Manage Groups → your group → Create Web API Key
   ```

   A personal Web API key authenticates fine and still cannot read an app that
   has not been released, which arrives as a bodyless 403.

   > Steam caps a **new** app at **100 achievements** until it reaches the
   > Profile Features threshold, which is why the shipped list is a curated 87
   > rather than all 249. Once the cap lifts, flip `STEAM_FULL_CATALOG` in
   > `pwa/src/game/platform-achievements.ts`, regenerate, and create the new
   > rows. That switch goes false → true and **never back**: an achievement id
   > is permanent once any player has unlocked it. Both commands below take
   > that second, larger run as it comes — the worksheet grows and the verify
   > reports the remaining ids as missing until they are in.

   Every row also takes **two 64×64 icons** — achieved and locked, which the
   overlay draws side by side. Both are generated, not drawn:

   ```sh
   make store-achievement-art          # both portals
   make store-achievement-art ARGS="--only steam"
   ```

   That writes `store/achievements/<id>-achieved.png` and `<id>-locked.png` for
   every row, cut from the badge's own atlas sprite — the picture the in-game
   shelf shows — upscaled nearest-neighbour at an integer factor. The locked
   one is the same art under the shelf's own unearned treatment
   (`grayscale(1) brightness(0.55)`), so the pair reads as one badge in two
   states rather than as two pictures. Needs `npm run assets` to have built the
   atlas; the output is gitignored and regenerated on demand, like the
   screenshots.

5. **App Admin → Cloud** → enable Steam Cloud and give it a byte/file quota.
   `isAvailable()` demands both this app setting and the player's own per-game
   toggle, so a forgotten app setting means cloud save quietly reports
   unavailable for everybody.

6. **Application → Installation → General** → set the launch options: one per
   OS, executable `Ada's Trail.exe` / `Ada's Trail.app` / `adas-trail`.
   A depot with no launch option installs and cannot be played.

## 2. Version

The version is read from the root `package.json` by
`scripts/package.mjs`, so there is nothing to bump by hand — the
desktop app tracks the game's version like every other surface. Steam itself
has no version field; builds are identified by their build ID and description,
and the description is stamped with the version automatically.

## 3. Store page assets

Valve's own dimensions, all required unless noted
([capsules](https://partner.steamgames.com/doc/store/assets/standard),
[library](https://partner.steamgames.com/doc/store/assets/libraryassets)):

| Asset            | Size        | Where it shows                    |
| ---------------- | ----------- | --------------------------------- |
| Header capsule   | 920 × 430   | Top of the store page             |
| Small capsule    | 462 × 174   | Search results, top sellers       |
| Main capsule     | 1232 × 706  | Store front-page carousel         |
| Vertical capsule | 748 × 896   | Seasonal sale pages               |
| Page background  | 1438 × 810  | Optional — generated from a shot  |
| Library capsule  | 600 × 900   | The player's library grid         |
| Library header   | 920 × 430   | Recent games                      |
| Library hero     | 3840 × 1240 | Library detail page — **no text** |
| Library logo     | 1280 × 720  | Over the hero — transparent PNG   |

Put each capsule in `tauri/store/capsules/` as `<name>.png` — `header`,
`small`, `main`, `vertical`, `library`, `library-header`, `library-hero`,
`library-logo`. Committed, because they are hand-drawn source art rather than
build output; `make store-preflight` names the ones that are missing and fails
on one that is the wrong size.

Plus **at least 5 screenshots at 1920×1080**, four of them marked suitable for
all ages, and a **trailer** (not strictly required, but a store page without one
converts badly and Valve's own guidance assumes it).

The screenshots have a generator — the same one that shoots Apple's rasters,
with a Steam raster beside them:

```sh
npx playwright install chromium   # playwright itself comes with `npm install`
cd pwa && npx vite --port 5199 &
node pwa/scripts/store-shots.mjs --only steam    # → tauri/store/screenshots/steam-1080/
```

It shoots at a real 1920×1080 rather than upscaling a phone frame, with a mouse
pointer instead of a touch one (the menu cursor is pointer-type-dependent) and
full-bleed rather than inset under a caption band. Note the recipes' framing was
tuned on the phone viewport, and the game's 3× zoom tier hands a desktop a wider
slice of the map — so sweep the delays again on this raster
(`store-shot-sweep.mjs --device steam-1080`) before a frame goes on a store
page, rather than shipping the phone's chosen moment at a different aspect.

**The capsules are the one thing here with no generator.** They are marketing
art with the logo laid out per aspect ratio, and the repo has no tooling that
would produce something honest at 748×896. Draw them — or generate them from
[`store/capsules/PROMPTS.md`](store/capsules/PROMPTS.md), which carries a
prompt per raster written off `docs/art-style.md`, the brand palette and the
hero's own sprite description, plus the compositions each aspect ratio wants.

Whichever route: **the lettering is never generated.** An image model cannot
spell reliably, so every capsule is made with the logo area left empty and the
real wordmark — the game's own pixel font — composited in afterwards, by
`scripts/composite-steam-wordmarks.mjs` (six capsules, in place) and
`scripts/generate-steam-library-logo.mjs` (`library-logo`, which is nothing but
wordmark). That also keeps the store lettering identical to the game's.

## 4. Build and 5. Upload

Both are the desktop shell's, and live in [`RELEASING.md`](RELEASING.md): §1
builds the depot (through the Makefile, so the capability stamp is set), §2
checks it, §3 uploads it with `npm run steam:upload`.

## 6. Release

With the store page live for its 30 days and a build set live on `default`:

- **Store page** → set the price, the release date, and hit **Prepare for
  release**. Valve reviews the build itself (typically a few working days) — a
  functional check that it launches and does what the page says, not a content
  review of the mobile-store kind.
- **Age rating** — Steam has no mandatory global rating. Fill in the content
  survey; it drives regional gates (and an IARC rating if you want one).
- Once it is live, put the store URL in `game.config.json` → `steamUrl` and ship
  a website build, the same as for the App Store listing (which has its own
  field — the library pitches each storefront on what it adds, and Steam's
  additions are not the phone's).

---

## What fails quietly

The build-side ones — a missing redistributable, a developer build, an
unstamped package, an ad-hoc signature — are collected in
[`RELEASING.md`](RELEASING.md#what-fails-quietly). Two are store-side and live
here:

- **App id 480.** Valve's shared Spacewar test app. Everything works; the data
  goes into a sandbox every developer on Steam shares.
- **An achievement id that isn't in the partner site.** The report is dropped
  on the floor, silently, forever. The upload cannot see this one — it is a
  fact about the partner site, not about the build — so it has its own check:
  `make store-steam-achievements ARGS="--verify"` (§1.4).

## What you do NOT have to build

Worth knowing, because these are the usual "did I forget something" items:

- **An installer or updater.** Steam owns both. The build target is a plain
  directory for exactly this reason.
- **A leaderboard board.** There is none on Steam — Steam's overlay has no
  leaderboard page, so the game hides every leaderboard row there. See
  [`shell/src/leaderboards_provider.rs`](shell/src/leaderboards_provider.rs).
- **Any purchase flow.** The coin store does not exist on Steam; the game is
  bought once. `pwa/src/app/store-bridge.ts` hides the STORE row.
- **A privacy policy for data collection.** There is no backend and no account.
  Steam Cloud and achievements are Valve's own services acting for the user.
- **Steam Deck support, as such.** The Linux depot means the Deck runs the real
  binary rather than the Windows one under Proton, and the game is fully
  playable on a controller. **Deck _Verified_** is a separate submission with
  its own checklist — the likely gap there is controller glyphs on any on-screen
  prompt that names an input.
