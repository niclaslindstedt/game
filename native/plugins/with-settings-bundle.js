// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE iOS SETTINGS BUNDLE — the two content switches that live OUTSIDE the game.
//
// A Settings.bundle draws rows on the app's own page in iOS Settings, and iOS
// writes the player's answers into the app's UserDefaults. That placement IS the
// feature: these are parental controls, so they must sit somewhere the game
// cannot offer to turn back on. A row inside the game's own SETTINGS screen would
// be a lock whose key is taped to the door.
//
// Expo owns `ios/` — `expo prebuild` regenerates it — so the bundle cannot be
// committed as a checked-in Xcode resource. This plugin writes it during prebuild
// and adds it to the target's resource build phase, which is what makes it survive
// a clean `expo prebuild --clean` and reach the store binary.
//
// Keep the `Key` values below in step with `NSFW_KEY`/`STORE_KEY` in
// modules/device-settings/ios/DeviceSettingsModule.swift — this file WRITES the
// preferences and that one READS them; a rename on one side alone silently pins
// the game to the shipped defaults forever (an unknown key reads as absent, which
// answers ON, so nothing would visibly break and every switch would stop working).

const fs = require("node:fs");
const path = require("node:path");

const {
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
} = require("expo/config-plugins");

/** The bundle's directory name — Apple looks for exactly this name. */
const BUNDLE_NAME = "Settings.bundle";

/**
 * The Settings page, hand-written as a plist.
 *
 * Both switches ship `DefaultValue` true, and BOTH HALVES OF THAT DEFAULT MATTER:
 * this one paints the switch as on before the player has touched it, and the
 * native module's own fallback answers ON for the key iOS has therefore not
 * written yet. They must agree — see the module's file header.
 */
const ROOT_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PreferenceSpecifiers</key>
	<array>
		<dict>
			<key>Type</key>
			<string>PSGroupSpecifier</string>
			<key>Title</key>
			<string>Content</string>
			<key>FooterText</key>
			<string>Turn off to play without blood or gore. The screen-clearing bomb then knocks enemies down like any other hit, instead of burning them to skeletons.</string>
		</dict>
		<dict>
			<key>Type</key>
			<string>PSToggleSwitchSpecifier</string>
			<key>Title</key>
			<string>Mature Content</string>
			<key>Key</key>
			<string>nsfw_content</string>
			<key>DefaultValue</key>
			<true/>
		</dict>
		<dict>
			<key>Type</key>
			<string>PSGroupSpecifier</string>
			<key>Title</key>
			<string>Purchases</string>
			<key>FooterText</key>
			<string>Turn off to remove the coin store from the game entirely. Coins already earned or bought stay yours to spend.</string>
		</dict>
		<dict>
			<key>Type</key>
			<string>PSToggleSwitchSpecifier</string>
			<key>Title</key>
			<string>Coin Store</string>
			<key>Key</key>
			<string>coin_store</string>
			<key>DefaultValue</key>
			<true/>
		</dict>
	</array>
</dict>
</plist>
`;

/** Write Settings.bundle/Root.plist into the prebuilt `ios/` tree. */
function withSettingsBundleFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const bundleDir = path.join(
        cfg.modRequest.platformProjectRoot,
        BUNDLE_NAME,
      );
      await fs.promises.mkdir(bundleDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(bundleDir, "Root.plist"),
        ROOT_PLIST,
        "utf8",
      );
      return cfg;
    },
  ]);
}

/**
 * Add the bundle to the app target's resources.
 *
 * Writing the files is not enough — a resource Xcode doesn't know about is never
 * copied into the .app, and the Settings page simply doesn't appear. Guarded
 * against a second add because prebuild may run over an existing project, and a
 * duplicate resource entry fails the build with a "multiple commands produce"
 * error rather than being ignored.
 */
function withSettingsBundleTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (JSON.stringify(project.hash.project.objects).includes(BUNDLE_NAME)) {
      return cfg;
    }
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: BUNDLE_NAME,
      groupName: cfg.modRequest.projectName,
      project,
      isBuildFile: true,
    });
    return cfg;
  });
}

/** The plugin: write the bundle, then link it into the target. */
module.exports = function withSettingsBundle(config) {
  return withSettingsBundleTarget(withSettingsBundleFiles(config));
};
