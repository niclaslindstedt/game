// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind the DEVICE CONTENT SWITCHES — the same three-file
// shape cloud save, achievements and leaderboards use, for the same reason: the
// bridge (device-settings.ts) and the whole web side know only this interface, so
// a second platform is ONE new file.
//
// Today: Apple (device-settings-ios.ts) — a Settings.bundle over UserDefaults.
//
// Next: Android. Play has no Settings-app page for a third-party app, so the
// Android provider is NOT a port of this one — it would surface the same two
// switches wherever Android's own parental-control story puts them, and return
// the same two booleans. Nothing above this file changes.
//
// The provider must never throw: a shell without the native module reports
// UNMANAGED, which plays the full game. Failing open is deliberate — see the
// bridge's header.

import { Platform } from "react-native";

import { deviceSettingsProviderIOS } from "./device-settings-ios";

/** The two switches. Both true means "play the game as it ships". */
export type DevicePolicy = {
  /** Gore, and the nuke's burning dead. */
  nsfw: boolean;
  /** Whether the coin store exists in this install at all. */
  store: boolean;
};

/** Everything on: what an unmanaged install plays, and what every failure path
 * answers. */
export const POLICY_ALLOW_ALL: DevicePolicy = { nsfw: true, store: true };

export type DeviceSettingsProvider = {
  /** The switches right now. SYNCHRONOUS: the shell bakes these into the script
   * it injects before the WebView loads, so the game boots already knowing them
   * and nothing gated can paint before a policy arrives. */
  read(): DevicePolicy;
  /** The player changed a switch; returns an unsubscribe. */
  subscribe(onChange: (policy: DevicePolicy) => void): () => void;
};

/**
 * The provider for this platform, or null where there is none. Android returns
 * null today, so an Android build plays unmanaged — exactly what a build without
 * the native module does on iOS.
 */
export function deviceSettingsProvider(): DeviceSettingsProvider | null {
  if (Platform.OS === "ios") return deviceSettingsProviderIOS();
  return null;
}
