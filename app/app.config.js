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
const BUNDLE_ID = "se.niclaslindstedt.goneinspace";

const BRAND_BG = "#0b0d10"; // game.config theme_color / color-scheme: dark

module.exports = () => ({
  expo: {
    name: identity.shortName,
    slug: "gone-in-space",
    version,
    orientation: "landscape",
    icon: "./assets/icon.png",
    scheme: "goneinspace",
    userInterfaceStyle: "dark",
    backgroundColor: BRAND_BG,
    // The whole game is one WebView pointed at the deployed site, so it looks
    // and plays exactly like the PWA; the native shell adds haptics + audio.
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      requireFullScreen: true,
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
    ],
    extra: {
      // The URL the WebView loads (game.config.json siteUrl). Override per
      // build with EXPO_PUBLIC_GAME_URL (see src/config.ts).
      gameUrl: identity.siteUrl,
      eas: { projectId: EAS_PROJECT_ID },
    },
  },
});
