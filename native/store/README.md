# Store listing assets

Everything App Store Connect and the Play Console need, generated from sources
committed in this repo. Two commands produce the whole submission package:

```sh
make store-metadata          # listing.yaml  → store.config.json  (text metadata)
make store-shots             # the real game → screenshots/       (captioned PNGs)
make store-achievement-art   # the sprite atlas → achievements/   (badge images)
make store-game-center       # the two manifests → App Store Connect (91 entries)
```

| Path                            | What it is                                                                     | Committed? |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| `listing.yaml`                  | **Source of truth** — subtitle, description, keywords, age rating, review info | yes        |
| `store.config.json`             | Compiled listing for `eas metadata:push`                                       | no (built) |
| `screenshots/<device>/`         | Upload-ready captioned PNGs at Apple's exact rasters                           | no (built) |
| `achievements/<id>.png`         | The 1024×1024 image for each Game Center achievement                           | no (built) |
| `game-center-achievements.json` | The Game Center achievement list, pushed by `make store-game-center`           | yes        |
| `game-center-leaderboards.json` | The Game Center leaderboard list, pushed by `make store-game-center`           | yes        |

The generated three are gitignored for the same reason the sprite atlas is
(§11.2): they are reproducible outputs, and reviewing a 2868×1320 PNG diff in a
pull request helps nobody. Regenerate them whenever you submit.

## The metadata

`listing.yaml` is the only file to edit. Brand-shaped fields are **not** in it —
the listing title, marketing URL, privacy-policy URL and copyright line are
composed from `game.config.json` by the generator, so renaming the game updates
the store listing the same way it updates the manifest.

The generator (`scripts/generate-store-metadata.mjs`) enforces every Apple
limit and **fails rather than truncates**:

| Field          | Limit                                         |
| -------------- | --------------------------------------------- |
| `title`        | 2–30 chars (composed from `game.config.json`) |
| `subtitle`     | ≤ 30                                          |
| `keywords`     | ≤ 100 chars **for the comma-joined string**   |
| `promoText`    | ≤ 170                                         |
| `description`  | 10–4000                                       |
| `releaseNotes` | ≤ 4000                                        |
| `review.notes` | 2–4000                                        |

It also cross-checks the listing against the app: the coin-pack SKUs named in
the review notes must be the ones `pwa/src/game/store.ts` actually ships, so a
reviewer is never sent looking for a product that doesn't exist.

### Uploading

There are two paths, and the generator feeds **both** from the same
`listing.yaml`, so they can never disagree:

| Path                | Uploads                | Notes                              |
| ------------------- | ---------------------- | ---------------------------------- |
| `fastlane deliver`  | text **+ screenshots** | Preferred. Free (MIT). Needs Ruby. |
| `eas metadata:push` | text only              | Beta; cannot upload screenshots.   |

**fastlane (preferred)** — one command does the listing and the screenshots:

```sh
cd native && bundle install     # once
npm run store:stage             # compile listing + stage screenshots
cd native && bundle exec fastlane metadata
```

`npm run store:deliver` from the repo root chains all of it. Submitting for
review stays a deliberate act — `bundle exec fastlane metadata submit:true`.

Authentication is an **App Store Connect API key** (Users and Access →
Integrations), not an Apple ID, because a `.p8` key carries no 2FA session to
expire mid-upload. Set `ASC_KEY_ID`, `ASC_ISSUER_ID`, and either `ASC_KEY_PATH`
or `ASC_KEY_CONTENT` (base64) — plus `APPLE_ID` / `APPLE_TEAM_ID` /
`ASC_TEAM_ID` for the Appfile. Keep the `.p8` out of git; `native/*.p8` and
`native/.env` are gitignored.

**EAS (alternative)** — `cd native && npx eas metadata:push`, pointing at the
config with `metadataPath` in `eas.json`'s submit profile.

To see what App Store Connect currently holds, use the CLI subcommand (a lane
would upload): `bundle exec fastlane deliver download_metadata`.

## The screenshots

`pwa/scripts/store-shots.mjs` drives the real game in headless Chromium.

```sh
npm install --no-save playwright && npx playwright install chromium
cd pwa && npx vite --port 5199 &
make store-shots                       # everything
make store-shots ARGS="--only iphone"  # one device
make store-shots ARGS="--shot boss --layout bleed"
```

Three properties make the output trustworthy:

1. **Exact rasters.** Each device shoots at its true CSS viewport and
   `deviceScaleFactor`, so 956×440 @3× _is_ 2868×1320 — captured at device
   resolution, never upscaled into it. The script asserts the final PNG's
   dimensions and fails if they drift; Apple rejects a set that is one pixel
   off.

2. **Staged, not played.** Every shot is a `?scenario=` spec pinned to a
   `?seed=` (the engine's own display-case system — see the `test-scenario`
   skill), held up by `reveal` + `muteDialogue` + `noVictory` + `freeze`.
   Re-running reproduces the same frames, so changing a caption doesn't mean
   re-hunting for the moment.

3. **The caption is the game's own font**, drawn from the same `GLYPHS` map the
   in-game text uses, at an integer scale. A caption containing a character the
   font lacks fails loudly instead of rendering `?`.

Devices shot: **iPhone 6.9″** (2868×1320) and **iPad 13″** (2752×2064) — the
only two sizes App Store Connect requires, since Apple scales each set down to
every smaller device in its family.

Edit the `SHOTS` array to change what is captured; it is plain data.

## The achievement artwork

Game Center wants an image per achievement localization — 512×512 minimum,
1024×1024 recommended — and `make store-achievement-art` writes one per row of
`game-center-achievements.json` into `achievements/<id>.png`, named so the file
to upload is the row's own _Achievement ID_.

None of it is new art. Every badge already has a picture: the atlas sprite its
def names as `icon`, which the in-game shelf and the unlock toast draw. A portal
badge showing something else would be the feature disagreeing with itself on two
screens, so `scripts/achievement-art.mjs` cuts that same sprite out of the same
atlas, upscales it **nearest-neighbour at an integer factor** (a resample would
turn a two-color pixel edge into a gradient at exactly the size a store shows it
biggest), and centres it on the shelf's own cell color with a tenth of the
canvas kept clear for Game Center's rounded corners. The image is flattened —
neither portal accepts an alpha channel.

The id list is the committed manifest, which the suite already drift-tests
against the catalog, so an added or retired badge flows into the artwork on the
next run with no second list to maintain. Needs `npm run assets` to have built
the atlas; `ARGS="--only game-center"` or `ARGS="--id boss_slayer"` narrows a
run while iterating.

Steam's half of the same generator is described in
[`../../electron/RELEASING.md`](../../electron/RELEASING.md).

## The Game Center entries

`make store-game-center` creates and updates all 91 rows — the 86 achievements
and 5 leaderboards of the two committed manifests — through App Store Connect's
own API, instead of typing them into 91 web forms.

```sh
make store-game-center                      # the work list; writes NOTHING
make store-game-center ARGS="--apply"       # …and then do it
make store-game-center ARGS="--only leaderboards --apply"
```

A **dry run is the default**, because the interesting output is the diff: it is
the same work list a regenerated manifest's diff is, and reading it is how you
find out that a catalog change added four badges and re-pointed eleven.
`--apply` is the second command, deliberately.

It authenticates with the **same App Store Connect API key fastlane uses** —
`ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` (or `ASC_KEY_CONTENT`) from
`.env`, no new secret — and needs the app record to exist, because the numeric
Apple ID in `../eas.json` is what it looks the app up by.

Four properties make re-running it the normal way to apply a catalog change:

1. **It reconciles rather than creates**, matching on `vendorIdentifier` — the
   id the _game_ reports, never a display name and never Apple's own resource
   id. Missing rows are created, drifted ones patched, and a row that already
   agrees is left untouched (so a second run has nothing to say).
2. **It refuses a stale manifest.** Both generators' `--check` runs first: a
   manifest that has drifted from the catalog would write yesterday's catalog
   into the portal and report success.
3. **It checks the two silent failures before the first request.** The count
   under Apple's 100, the points landing on exactly 1,000/1,000 (Apple refuses
   the row that overruns the budget, so an over-budget manifest would
   half-write), and every board's score formatter agreeing with the scale the
   game applies on the way out.
4. **It never deletes.** An achievement somebody has earned cannot be un-earned
   and a board's scores cannot be recovered, so a portal row the manifest no
   longer lists is reported and left alone.

Each achievement's image is uploaded from `achievements/<id>.png` when it is
there; a badge whose artwork has not been generated is reported as outstanding
rather than failing the push, since Game Center takes the image afterwards. Run
`make store-achievement-art` first to include them, or `ARGS="--skip-images"` to
leave them alone.

What it does **not** do is _release_ the rows: attaching them to the version
under review is the deliberate act [`../RELEASING.md`](../RELEASING.md) §5
describes, tied to a build rather than to a catalog change.

## What still has to be done by hand

Neither command can do these — they live in the store consoles:

- The **App Privacy** questionnaire (answer: no data collected; iCloud and
  Game Center are Apple-mediated, and purchases are handled by the App Store).
- Create the five consumable IAP products and their prices.
- Enable **Game Center** on the app record. `make store-game-center` fills it in
  from there, but it cannot switch the feature on.
- Attach the achievements and leaderboards to the version under review.
- The Play Console's **Data safety** form, content rating, and the 1024×500
  feature graphic Play requires and Apple does not.

`make store-preflight` walks all of the above plus the credentials and the app
record, and names whatever is not wired up yet.

See [`../RELEASING.md`](../RELEASING.md) for the full submission run-through.
