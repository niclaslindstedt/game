# Releasing to the App Store and Google Play

Step-by-step for shipping the Expo app in this directory. The binary is built
by [EAS Build](https://docs.expo.dev/build/introduction/) and uploaded by
[EAS Submit](https://docs.expo.dev/submit/introduction/); the store listing is
generated from [`store/listing.yaml`](store/listing.yaml) (see
[`store/README.md`](store/README.md)).

The app **embeds the whole game** (`assets/webroot.zip`) and serves it from a
local HTTP server, so it plays offline and is an app rather than a viewer for a
website — see [`README.md`](README.md). Run `npm run native:bundle` from the
repo root before any build so that bundle exists.

Store identities are wired in [`app.config.js`](app.config.js):

- iOS `ios.bundleIdentifier` — `se.niclaslindstedt.goneinspace`
- Android `android.package` — `se.niclaslindstedt.goneinspace`

> **Licence note.** The repo is `PolyForm-Noncommercial-1.0.0`, which forbids
> _others_ commercial use; as the sole copyright holder you are not bound by
> the licence you grant, so selling coin packs is yours to do. Nothing to
> change — just don't be surprised when the licence and the IAP look like they
> disagree.

---

## 0. One-time prerequisites

- **Expo account** — free. `npm i -g eas-cli && eas login`.
- **Apple Developer Program** — $99/year. Identity verification can take days;
  start it first.
- **Google Play Developer account** — $25 once, also identity-verified.
- A Mac is **not** required: EAS builds iOS in the cloud and manages signing.

The project is already linked to its EAS project (`extra.eas.projectId` in
`app.config.js`), so `eas build` resolves it without `eas init`.

### Know what is still missing, at any point

Everything below that isn't code lives somewhere a repo can't hold — the app
record, the credentials, the portal entries — and each one fails late and
unhelpfully. One read-only command walks the whole list and names what is not
wired up yet:

```sh
cp native/.env.example native/.env   # once — the credential template
make store-preflight
```

Run it after every step in this file; it is the checklist.

### The one that blocks everything else

**Paid Applications Agreement.** In App Store Connect → Business, accept the
Paid Apps agreement and complete **banking and tax** details. Until that is
_active_, in-app purchases cannot be created, reviewed, or sold — and it is a
multi-day round trip if the tax forms bounce. Do it on day one, before writing
a single screenshot.

### iOS capabilities the build needs

The app's entitlements (`app.config.js`) require these on the App ID in the
Apple Developer portal, or code signing fails:

- **iCloud** with **key-value storage** — the cross-device save.
- **Game Center** — names the player behind that save.

For a quick local build on an account that has neither, set
`EXPO_PUBLIC_CLOUD_SAVE=off` to drop both entitlements. **Store builds must
leave it on.**

## 1. Create the app records

1. **App Store Connect** → new app. Name, primary language, bundle ID, SKU.
   Note the numeric **Apple ID** it assigns, and fill `appleId`, `ascAppId`,
   `appleTeamId` into `eas.json` → `submit.production.ios`.
2. **In-app purchases** → create five **consumable** products with exactly the
   SKUs `pwa/src/game/store.ts` ships:

   | SKU          | Coins       | Intended price |
   | ------------ | ----------- | -------------- |
   | `coins_1m`   | 1 million   | $1             |
   | `coins_10m`  | 10 million  | $2             |
   | `coins_100m` | 100 million | $10            |
   | `coins_1b`   | 1 billion   | $20            |
   | `coins_10b`  | 10 billion  | $100           |

   Each needs a display name, description, price, and a review screenshot.
   **Submit them with the first binary** — IAPs reviewed separately from a
   first release get stuck waiting for one.

3. **Game Center** → enable it on the app, then create every row of the two
   committed manifests. Neither is optional detail: the game reports against
   these ids, and an id the portal has never heard of is dropped silently — no
   error anywhere, the badge or score just never appears.

   | Manifest                              | Create under               | Rows |
   | ------------------------------------- | -------------------------- | ---- |
   | `store/game-center-achievements.json` | Game Center → Achievements | 86   |
   | `store/game-center-leaderboards.json` | Game Center → Leaderboards | 5    |

   The `id` column is the portal's _Achievement ID_ / _Leaderboard ID_, and for
   achievements the `points` column is verbatim — Game Center allows 100
   achievements and 1,000 points total, and the manifest spends exactly that.
   For leaderboards the **`format` column must match**: the game scales a rate
   or a duration on its way out (a score is one Int64), so a portal format that
   disagrees makes every score on that board wrong by a factor of a hundred.

   Regenerate after any catalog change — the diff is the work list:

   ```sh
   node scripts/game-center-achievements.mjs
   node scripts/game-center-leaderboards.mjs
   ```

4. **Credentials.** Fill `native/.env` from `native/.env.example`: the Apple
   Account email and the two team ids fastlane acts as, plus an **App Store
   Connect API key** (Users and Access → Integrations → App Manager role). The
   `.p8` downloads once and is gitignored — a key, not config. Preflight
   verifies every one of them, including that the team ids fastlane and EAS
   act as agree.

## 2. Version

`expo.version` tracks the root `package.json` version automatically. Build
numbers auto-increment (`appVersionSource: "remote"` + `autoIncrement` in
`eas.json`), so there is nothing to bump by hand.

## 3. Listing metadata and screenshots

One field in [`store/listing.yaml`](store/listing.yaml) ships as a placeholder
and cannot: `review.phone` is `+46000000000`, and App Store review calls the
number. Put a reachable one there — preflight fails until you do.

```sh
npm install --no-save playwright && npx playwright install chromium
cd pwa && npx vite --port 5199 &
make store-shots                          # captures the screenshot set
npm run store:stage                       # compiles the listing + stages them
```

Then upload both with **fastlane deliver** (free, MIT — the only cost in this
pipeline is the Apple Developer Program):

```sh
cd native
bundle install                            # once
bundle exec fastlane metadata             # listing + screenshots
bundle exec fastlane metadata submit:true # …and submit for review
```

fastlane is used for this one job because `eas metadata:push` cannot upload
screenshots. The binary is still built and submitted by EAS below — the
`metadata` lane sets `skip_binary_upload`, so the two never contend.

Authentication uses an **App Store Connect API key** (`.p8`, from Users and
Access → Integrations) rather than an Apple ID, so no 2FA session can expire
mid-upload. Export `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`, `APPLE_ID`,
`APPLE_TEAM_ID`, `ASC_TEAM_ID` — in `native/.env` (gitignored) or the shell.
Never commit the `.p8`.

## 4. Build

```sh
npm run build:production          # bundle the site for production, then build both platforms
```

Two things make the `production` profile different from every other build, and
**both need the profile, so don't hand-roll the two steps**:

- `EXPO_PUBLIC_STORE_PAYMENTS=required` (set by the profile in `eas.json`)
  switches the coin store from free grants to real StoreKit / Play Billing.
  Every other profile — including `testflight` — grants packs free, so you can
  exercise the whole purchase flow without spending money.
- `VITE_DEV_TOOLS=off` (passed by `scripts/bundle-web.mjs` when it bundles the
  site for the `production` profile) strips the **developer tooling** out of the
  embedded website: the hidden seven-tap sun reveal, the whole DEVELOPER menu
  tree behind it, and the commit hash beside the version in the title footer.
  `testflight` and every other profile keep them.

Because the website is bundled **before** `eas build` runs, the profile has to
be given to the bundle step too. Driving EAS by hand means doing that yourself:

```sh
npm run bundle -- --profile production                 # embed the game first
eas build --platform ios     --profile production
eas build --platform android --profile production
```

A plain `npm run bundle` builds with the developer tooling on — fine for
`preview`/`testflight`, wrong for the store.

## 5. Submit

```sh
eas submit --platform ios --profile production --latest
```

Then in App Store Connect, by hand:

- Attach the build to the version, and attach the five IAPs to it.
- **App Privacy** questionnaire → _no data collected_. The game has no backend;
  iCloud and Game Center are Apple's own services acting for the user, and
  purchases are processed by the App Store. Privacy policy URL:
  `https://game.niclaslindstedt.se/privacy/`.
- **Age rating** — the answers are already in `store/listing.yaml`'s `advisory`
  block and pushed by `eas metadata:push`; confirm the resulting badge.
- **Export compliance** is pre-answered (`ITSAppUsesNonExemptEncryption: false`).
- **Game Center** — confirm the achievements and leaderboards from step 1.3 are
  attached to the version. They are reviewed with the build, and a board that
  ships un-attached ranks nobody.

## 6. Once it is live

Put the listing's URL in `game.config.json` → `appStoreUrl` and ship a website
build. It is empty until the app is public, and while it is empty the library's
only call to action — the one thing on those pages that points a reader at the
app instead of at the free web build — stays hidden.

For Google Play, additionally: a service-account JSON for EAS Submit, the
**Data safety** form, the IARC content-rating questionnaire, and a 1024×500
feature graphic (Play requires one; Apple does not).

---

## What you do NOT have to build

Worth knowing, because these are the usual "did I forget something" items:

- **Restore purchases** — not required. Every coin pack is a _consumable_, and
  guideline 3.1.1 mandates a restore path only for non-consumables and
  subscriptions. Balances survive anyway: the coin bank rides the iCloud save,
  and `native/src/store-purchases.ts` holds a transaction unfinished until the
  game confirms the coins are banked, so an interrupted purchase is redelivered
  on the next launch rather than lost.
- **Refunds** — handled entirely by Apple and Google. There is no server to
  claw a consumable back from, and neither store requires one.
- **Account deletion** — required only for apps with accounts. There are none.
- **Terms of use / EULA** — Apple's standard licence applies by default.
- **Sign in with Apple** — required only alongside third-party login. There is
  none.

## The one real review risk

A WebView-shaped app is judged under **guideline 4.2 (minimum functionality)**.
The mitigation is already in the build and stated in the review notes: the game
ships _inside_ the binary and runs with no network, and the native layer adds
haptics, an audio session that survives the ringer switch, StoreKit purchases,
Game Center, and iCloud sync — none of which a browser can do.

Keep it that way. Setting `extra.gameUrl` in `app.config.js` (or building with
`EXPO_PUBLIC_GAME_URL`) switches the shell to **streaming the live website**
and skips the local server entirely, which is precisely the shape 4.2 rejects.
That field is deliberately absent; leave it absent for store builds.
