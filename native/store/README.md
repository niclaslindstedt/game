# Store listing assets

Everything App Store Connect and the Play Console need, generated from sources
committed in this repo. Two commands produce the whole submission package:

```sh
make store-metadata   # listing.yaml  → store.config.json  (text metadata)
make store-shots      # the real game → screenshots/       (captioned PNGs)
```

| Path                    | What it is                                                                     | Committed? |
| ----------------------- | ------------------------------------------------------------------------------ | ---------- |
| `listing.yaml`          | **Source of truth** — subtitle, description, keywords, age rating, review info | yes        |
| `store.config.json`     | Compiled listing for `eas metadata:push`                                       | no (built) |
| `screenshots/<device>/` | Upload-ready captioned PNGs at Apple's exact rasters                           | no (built) |

The generated two are gitignored for the same reason the sprite atlas is
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

Push it with:

```sh
cd native && npx eas metadata:push
```

> **`eas metadata` is beta, and it uploads TEXT ONLY.** Screenshots are not
> supported by it — upload those by hand in App Store Connect (or wire up
> fastlane `deliver` later). Point EAS at the config with `metadataPath` in
> `eas.json`'s submit profile.

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

## What still has to be done by hand

Neither command can do these — they live in the store consoles:

- Upload the screenshots.
- The **App Privacy** questionnaire (answer: no data collected; iCloud and
  Game Center are Apple-mediated, and purchases are handled by the App Store).
- Create the five consumable IAP products and their prices.
- The Play Console's **Data safety** form, content rating, and the 1024×500
  feature graphic Play requires and Apple does not.

See [`../RELEASING.md`](../RELEASING.md) for the full submission run-through.
