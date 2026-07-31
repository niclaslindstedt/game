// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dynamic Expo config. Brand identity is NOT re-hardcoded here — it is read
// from the repo's single source of truth (game.config.json), mirroring how the
// website fills its manifest/index.html. A rename there flows into the app's
// name, slug, and store listing on the next build. The marketing version
// tracks the game version in the root package.json so the app and site never
// disagree; store build numbers are auto-incremented by EAS (see eas.json).
//
// `eas init --id <projectId>` normally writes extra.eas.projectId for you; we
// pin it here so the project is linked without an interactive login.

const identity = require("../game.config.json");
const { version } = require("../package.json");

// The Expo project this app builds under (from `eas init --id ...`).
const EAS_PROJECT_ID = "180cff05-a398-48e3-ae63-a9b0bd408321";

// Reverse-DNS app id, derived from the author domain. Kept identical on both
// stores so the app is one product across platforms.
const BUNDLE_ID = "se.niclaslindstedt.adastrail";

const BRAND_BG = "#0b0d10"; // game.config theme_color / color-scheme: dark

// CLOUD SAVE (src/cloud-save.ts) needs two iOS capabilities, and an entitlement
// the App ID doesn't carry FAILS code signing — which would break a quick local
// build on a bare/free Apple ID that has neither enabled. So the entitlements
// can be dropped for such a build with EXPO_PUBLIC_CLOUD_SAVE=off (the shell
// then reports cloud save unavailable and the game stays device-local). Store
// builds must leave it on; see native/README.md for enabling the capabilities.
const CLOUD_SAVE = process.env.EXPO_PUBLIC_CLOUD_SAVE !== "off";

// iCloud key-value storage keys are namespaced by
// <TeamID>.<container id>; the team prefix is filled in at build time.
const CLOUD_ENTITLEMENTS = {
  "com.apple.developer.ubiquity-kvstore-identifier": `$(TeamIdentifierPrefix)${BUNDLE_ID}`,
  // Game Center — the signed-in player behind the save.
  "com.apple.developer.game-center": true,
};

module.exports = () => ({
  expo: {
    name: identity.shortName,
    slug: "adas-trail",
    version,
    // Follow the device: the web game is fully responsive and ships a
    // dedicated portrait HUD (styles.css `@media (orientation: portrait)`), so
    // the shell must let the WebView rotate — locking to landscape kept the
    // game stuck sideways when the phone was held upright. "default" tracks the
    // OS rotation lock / sensor, so portrait and landscape both work.
    orientation: "default",
    icon: "./assets/icon.png",
    scheme: "adastrail",
    userInterfaceStyle: "dark",
    backgroundColor: BRAND_BG,
    // Ship the packed website (assets/webroot.zip) inside the app so the game
    // is fully self-contained; the shell unzips + serves it locally on launch
    // (src/local-server.ts). Generate the zip with `npm run bundle` before a build.
    assetBundlePatterns: ["**/*"],
    // The whole game is one WebView pointed at the deployed site, so it looks
    // and plays exactly like the PWA; the native shell adds haptics + audio.
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      requireFullScreen: true,
      // iCloud key-value storage (the cross-device save) + Game Center.
      ...(CLOUD_SAVE ? { entitlements: CLOUD_ENTITLEMENTS } : {}),
      infoPlist: {
        // Synthesized audio only — no recording — but the WebView's WebAudio
        // must survive the ringer switch (paired with setAudioModeAsync).
        UIBackgroundModes: [],
        // Skip the App Store export-compliance prompt: no non-exempt crypto.
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: BUNDLE_ID,
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: BRAND_BG,
      },
      // expo-audio pulls in RECORD_AUDIO for its recorder; the game only ever
      // PLAYS synthesized sound, so strip it — otherwise Play Store review
      // asks why a game wants the microphone.
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: BRAND_BG,
        },
      ],
      // The game never records — disable the microphone permission the plugin
      // would otherwise request, so App Store review doesn't ask why.
      ["expo-audio", { microphonePermission: false }],
      // The bundled static server (lighttpd, via @dr.pogodin/react-native-static-server)
      // needs Android minSdk 28.
      ["expo-build-properties", { android: { minSdkVersion: 28 } }],
      // In-app purchases (the coin store): wires StoreKit / Play Billing into
      // the build (adds com.android.vending.BILLING on Android).
      "expo-iap",
      // The app's own page in iOS Settings — the MATURE CONTENT and COIN STORE
      // switches (see plugins/with-settings-bundle.js). A local plugin because
      // `ios/` is prebuild output: a committed Settings.bundle would be wiped by
      // the next `expo prebuild --clean`.
      "./plugins/with-settings-bundle",
    ],
    extra: {
      // NO `gameUrl` HERE, deliberately. The shell serves the copy of the site
      // bundled inside the app (assets/webroot.zip) from a local HTTP server —
      // that is what makes the game playable offline and what makes it an app
      // rather than a viewer for a website (App Store guideline 4.2, minimum
      // functionality). `src/config.ts` treats ANY value here as "stream the
      // remote site instead and skip the local server entirely", so setting it
      // to the live site — as this file did — silently turned every build,
      // store builds included, into a thin browser over game.niclaslindstedt.se.
      //
      // To point a debug build at a deployed slot, set EXPO_PUBLIC_GAME_URL at
      // build time; `src/config.ts` reads that env var directly, so it needs no
      // entry here.
      eas: { projectId: EAS_PROJECT_ID },
    },
  },
});
