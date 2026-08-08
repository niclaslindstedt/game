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

- iOS `ios.bundleIdentifier` — `se.niclaslindstedt.adastrail`
- Android `android.package` — `se.niclaslindstedt.adastrail`

> **Licence note.** The repo uses PolyForm Noncommercial 1.0.0 plus the Ada's
> Trail Feature Terms, which reserve player use of mods and multiplayer for an
> acquired Steam licence. As the sole copyright holder you are not bound by the
> licence you grant, so selling coin packs is yours to do. Mobile exposes
> neither reserved feature.

---

## 0. One-time prerequisites

- **Expo account** — free. `npm i -g eas-cli && eas login`.
- **Apple Developer Program** — $99/year. Identity verification can take days;
  start it first.
- **Google Play Developer account** — $25 once, also identity-verified.
- A Mac is **not** required: EAS builds iOS in the cloud and manages signing.

The project is already linked to its EAS project (`extra.eas.projectId` in
`app.config.js`), so `eas build` resolves it without `eas init`.

### Enrolling as a COMPANY is the long pole, and it gates both stores at once

An organization enrollment is not a signup — it is Apple verifying the legal
entity, and it verifies it against **Dun & Bradstreet**, not against what you
type. The legal name, the headquarters address and the phone on the D&B record
must match what is entered, so a company whose D&B record is stale or wrong
waits for **D&B to correct it** before enrollment can even be attempted. In
Sweden that correction is fed from the Bolagsverket/SCB registers into D&B, and
the round trip runs to **weeks**. Apple then needs up to two business days to
pick the corrected record up.

Three things follow, and each is worth knowing before the wait rather than
after it:

- **Google Play's organization account needs the same D-U-N-S number**, so the
  one wait clears both storefronts. Have Play's paperwork ready to submit the
  same day.
- **Do not route around it with a personal account.** A personal Play account
  created after 13 Nov 2023 must run **12 testers for 14 consecutive days** of
  closed testing before it may ship to production; a D-U-N-S-verified
  organization account is exempt. Waiting is faster than the workaround, and
  the Apple side would need a re-enrollment later anyway.
- **The paid-apps paperwork is a second, independent wait** — see below. It
  cannot start until the membership exists, so treat the day enrollment clears
  as the day that clock starts, not the day you are done.

Nothing in this file's steps 1–5 can be started before the membership exists.
Everything else can, and that is most of the work:

```sh
make store-preflight ARGS="--now"   # only what waits on no store account
```

That view is the checklist for the wait. It stays honest as things land: an
item leaves the list when it is done, and the full run says how many are still
parked behind each account.

### Know what is still missing, at any point

Everything below that isn't code lives somewhere a repo can't hold — the app
record, the credentials, the portal entries — and each one fails late and
unhelpfully. One read-only command walks the whole list and names what is not
wired up yet:

```sh
cp native/.env.example native/.env   # once — the credential template
make store-preflight
```

Run it after every step in this file; it is the checklist. Its last section is
Steam's — one command answers "are we ready to ship" for both storefronts; see
[`electron/RELEASING.md`](../electron/RELEASING.md) for that half.

Each finding that waits on a store account says so (`needs the Apple
membership`, `needs the Steamworks app`), and the summary counts them
separately — so a long list during an enrollment reads as what it is rather
than as a project that cannot ship. `ARGS="--now"` hides them.

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

3. **Game Center** → enable it on the app, then push every row of the two
   committed manifests. Neither is optional detail: the game reports against
   these ids, and an id the portal has never heard of is dropped silently — no
   error anywhere, the badge or score just never appears.

   | Manifest                              | Goes under                 | Rows |
   | ------------------------------------- | -------------------------- | ---- |
   | `store/game-center-achievements.json` | Game Center → Achievements | 86   |
   | `store/game-center-leaderboards.json` | Game Center → Leaderboards | 5    |

   That is 91 forms by hand, so **don't**. Both manifests are generated from the
   live catalogs and drift-tested, which makes the data already exact — one
   command pushes it through App Store Connect's own API:

   ```sh
   make store-achievement-art              # the badge images, cut from the atlas
   make store-game-center                  # the work list; writes NOTHING
   make store-game-center ARGS="--apply"   # …and then do it
   ```

   A dry run is the default and prints the diff against what the portal already
   holds. It is idempotent — it matches on the id the game reports, creates what
   is missing, patches what drifted, and never deletes — so **re-running it is
   how a catalog change is applied**, after regenerating the manifests:

   ```sh
   node scripts/game-center-achievements.mjs
   node scripts/game-center-leaderboards.mjs
   make store-game-center                  # the diff IS the work list
   ```

   It refuses to push before three things are true, each of which fails silently
   if a human gets it wrong: the achievement count is under Apple's 100, the
   points land on exactly 1,000/1,000 (Apple refuses the row that overruns the
   budget, so an over-budget manifest half-writes), and every leaderboard's
   score **format matches the scale** the game applies on the way out — a score
   is one Int64, so a portal format that disagrees makes every score on that
   board wrong by a factor of a hundred.

   Each achievement also needs an **image** (512×512 minimum, 1024×1024
   recommended), which the push uploads for you. Don't draw them: every badge
   already has a picture — the atlas sprite the game's own shelf shows for it —
   and `make store-achievement-art` writes one 1024×1024 PNG per row into
   `store/achievements/<id>.png`. A badge whose image has not been generated is
   reported as outstanding rather than blocking the push. See
   [`store/README.md`](store/README.md) → The Game Center entries.

4. **Credentials.** Fill `native/.env` from `native/.env.example`: the Apple
   Account email and the two team ids fastlane acts as, plus an **App Store
   Connect API key** (Users and Access → Integrations → App Manager role). The
   `.p8` downloads once and is gitignored — a key, not config. Preflight
   verifies every one of them, including that the team ids fastlane and EAS
   act as agree. The same key is what step 3's push and `fastlane metadata`
   authenticate with, so there is one credential for the whole pipeline.

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
  embedded website: the hidden sixteen-tap sun reveal, the whole DEVELOPER menu
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
  ships un-attached ranks nobody. `make store-game-center` CONFIGURES them but
  deliberately does not release them: that is tied to a build, not to a catalog
  change, so it stays a decision made here.

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
