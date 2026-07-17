// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Default Expo Metro config, plus one addition: teach the bundler that `.zip`
// is a bundled asset. The whole website is packed into a single
// `assets/webroot.zip` (scripts/bundle-web.mjs) that src/localServer.ts
// `require()`s, unzips on first launch, and serves locally — so Metro must ship
// the zip in the app bundle rather than trying to parse it as source.

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("zip")) {
  config.resolver.assetExts.push("zip");
}

module.exports = config;
