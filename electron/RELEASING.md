# Releasing to Steam

Step-by-step for shipping the desktop app in this directory to Windows, macOS
and Linux. The binary is packaged by
[electron-builder](https://www.electron.build) and uploaded by
[steamcmd](https://partner.steamgames.com/doc/sdk/uploading), driven by
`npm run steam:upload`.

The app **embeds the whole game** (`webroot/`) and serves it from a private
`game://app` scheme, so it plays offline and is an app rather than a viewer for
a website — see [`README.md`](README.md).

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
  cloud builder here: electron-builder must run on macOS to produce and sign a
  `.app`, and notarization needs Apple's toolchain.

Log steamcmd in once, interactively, so it can answer Steam Guard and cache the
session:

```sh
steamcmd +login <your-steam-username>     # answer the Steam Guard prompt, then `quit`
export STEAM_USER=<your-steam-username>   # what `npm run steam:upload` uses
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
npm run steam:upload -- --platform windows --dry-run   # from electron/
```

The **upload**: that a packaged build exists, that Valve's redistributable
landed beside the executable, and that the embedded website was built for the
store rather than with the developer menu still in it. It needs `electron/`'s
dependency tree and a finished build, so it answers "can I upload this" rather
than "what is left". Each of the things it checks otherwise fails **silently** —
see [What fails quietly](#what-fails-quietly).

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

   > Steam caps a **new** app at **100 achievements** until it reaches the
   > Profile Features threshold, which is why the shipped list is a curated 86
   > rather than all 226. Once the cap lifts, flip `STEAM_FULL_CATALOG` in
   > `pwa/src/game/platform-achievements.ts`, regenerate, and create the new
   > rows. That switch goes false → true and **never back**: an achievement id
   > is permanent once any player has unlocked it.

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

`buildVersion` is read from the root `package.json` by
`electron-builder.config.cjs`, so there is nothing to bump by hand — the
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

Put each capsule in `electron/store/capsules/` as `<name>.png` — `header`,
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
npm install --no-save playwright && npx playwright install chromium
cd pwa && npx vite --port 5199 &
node pwa/scripts/store-shots.mjs --only steam    # → electron/store/screenshots/
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
real wordmark — the game's own pixel font — composited in afterwards. That also
keeps the store lettering identical to the game's.

## 4. Build

```sh
npm run release:win      # → release/win-unpacked/
npm run release:mac      # → release/mac/   (x64; Rosetta on Apple Silicon)
npm run release:linux    # → release/linux-unpacked/
```

**Use `release:*`, not `dist:*`.** They differ in exactly one way and it is
invisible: `release:*` bundles the website with `VITE_DEV_TOOLS=off`, which
strips the hidden seven-tap sun reveal, the whole DEVELOPER menu behind it, the
arsenal and effects galleries, and the commit hash in the title footer.
`dist:*` keeps them — right for a local build, wrong for the store. The upload
script checks for the developer chunks and refuses, so this is caught rather
than shipped, but building the right thing first saves a round trip.

Each platform builds on its own OS. Windows and Linux can cross-build in
practice; **macOS cannot** — the `.app` must be produced and signed on a Mac.

### Signing

- **Windows** — unsigned is fine for a Steam-launched app; the client is the
  trust boundary. Sign only if the binary is also distributed outside Steam.
- **Linux** — nothing to sign.
- **macOS** — **never unsigned, and for a store build signed and notarized.**
  An unsigned arm64 app does not merely warn, it does not run: Apple Silicon
  refuses to execute unsigned arm64 code and macOS reports that as _"the app is
  damaged"_. The packaging config therefore signs **ad hoc** when it is handed
  no certificate, which is enough to make the app run and not enough to stop
  Gatekeeper asking about it — and Gatekeeper blocks an un-notarized app even
  when Steam is the one launching it. The hardened runtime is already on and the
  entitlements are in `build/entitlements.mac.plist`; what you supply is the
  identity:

  ```sh
  export CSC_LINK=/path/to/developer-id.p12
  export CSC_KEY_PASSWORD=…
  export APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…
  npm run release:mac
  ```

#### Where those five values come from

All of it hangs off **one $99/year Apple Developer Program membership**
([developer.apple.com/programs](https://developer.apple.com/programs/)) — the
same membership the iOS app in [`native/`](../native/README.md) already needs, so
if that ships, this costs nothing extra. Nothing here is obtainable without it:
Apple issues no Developer ID certificate to a free account.

| Variable                      | Where you get it                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CSC_LINK`                    | A **Developer ID Application** certificate — _not_ the Mac App Store one. Xcode → Settings → Accounts → Manage Certificates → **+** → Developer ID Application. Then Keychain Access → My Certificates → right-click it → **Export…** → `.p12`. `CSC_LINK` is the path to that file (a base64 string of it also works, which is what a CI secret wants). |
| `CSC_KEY_PASSWORD`            | The password you typed into that export dialog. Nothing generates it — you choose it.                                                                                                                                                                                                                                                                    |
| `APPLE_ID`                    | The email address of the Apple ID that owns the membership.                                                                                                                                                                                                                                                                                              |
| `APPLE_APP_SPECIFIC_PASSWORD` | **Not** your Apple ID password. [account.apple.com](https://account.apple.com) → Sign-In and Security → App-Specific Passwords → **+**. Shown once; a `xxxx-xxxx-xxxx-xxxx` string.                                                                                                                                                                      |
| `APPLE_TEAM_ID`               | The 10-character team id, e.g. `A1B2C3D4E5`. [developer.apple.com/account](https://developer.apple.com/account) → Membership details.                                                                                                                                                                                                                    |

`GIS_MAC_IDENTITY` is the sixth and is only needed when the keychain holds more
than one usable certificate: it is the identity's name, as `security
find-identity -v` prints it, minus the `Developer ID Application:` prefix.
Leave it unset and electron-builder finds the certificate itself.

**For the GitHub release workflow**, the same values go in as repository
secrets (Settings → Secrets and variables → Actions), named `MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` and `MAC_SIGN_IDENTITY`. `MAC_CSC_LINK` must be the `.p12`
**base64-encoded** (`base64 -i developer-id.p12 | pbcopy`), since a secret is a
string and not a file. Every one of them is optional: with none set the
workflow still produces a running native arm64 download, ad-hoc signed.

## 5. Upload

```sh
npm run steam:upload -- --platform windows --dry-run   # check everything first
npm run steam:upload -- --platform windows             # …then upload
npm run steam:upload -- --platform macos
npm run steam:upload -- --platform linux
```

The build lands in the partner site but **does not go live**. That is
deliberate: uploading and releasing are different decisions, and a script that
did both means one mistyped command ships to every player. Set it live yourself
in **App Admin → Builds**, or pass `--branch beta` to push straight to a branch
you have already created.

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

Four things in this pipeline break without any error at all, which is why
`steam:upload` checks each of them:

- **A missing `steam_api64.dll` / `libsteam_api.dylib` / `libsteam_api.so`.**
  `steam.ts` degrades to "no client" rather than crashing — by design, so a
  developer without Steam can still run the game — so the app ships, launches,
  plays perfectly, and simply has no cloud saves or achievements for anyone.
- **A build made with `dist:*`.** Identical to look at until a player taps the
  sun seven times and finds the developer menu.
- **App id 480.** Valve's shared Spacewar test app. Everything works; the data
  goes into a sandbox every developer on Steam shares.
- **An achievement id that isn't in the partner site.** The report is dropped
  on the floor, silently, forever.

## What you do NOT have to build

Worth knowing, because these are the usual "did I forget something" items:

- **An installer or updater.** Steam owns both. The build target is a plain
  directory for exactly this reason.
- **A leaderboard board.** There is none on Steam — `steamworks.js` binds no
  leaderboard API and Steam's overlay has no leaderboard page, so the game hides
  every leaderboard row there. See
  [`src/leaderboards-provider.ts`](src/leaderboards-provider.ts).
- **Any purchase flow.** The coin store does not exist on Steam; the game is
  bought once. `pwa/src/app/store-bridge.ts` hides the STORE row.
- **A privacy policy for data collection.** There is no backend and no account.
  Steam Cloud and achievements are Valve's own services acting for the user.
- **Steam Deck support, as such.** The Linux depot means the Deck runs the real
  binary rather than the Windows one under Proton, and the game is fully
  playable on a controller. **Deck _Verified_** is a separate submission with
  its own checklist — the likely gap there is controller glyphs on any on-screen
  prompt that names an input.
