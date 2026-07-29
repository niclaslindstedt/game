// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TypeScript face of the local DEVICE SETTINGS native module (ios/
// DeviceSettingsModule.swift): the two content switches the player's iOS Settings
// app owns — see ../../src/device-settings-ios.ts.
//
// Loaded OPTIONALLY, exactly like cloud save's module and the coin store's
// expo-iap: a build without the native module (Expo Go, the web target, Android
// today) gets `null` here and the shell reports the switches unmanaged — which
// means the game plays with everything ON, never censored by an absent module.

import { requireOptionalNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";

/** The switches as the Settings app has them. Both default ON. */
export type DeviceSettingsFlags = {
  /** NSFW CONTENT: gore, and the nuke's burning dead. */
  nsfw: boolean;
  /** COIN STORE: whether the store exists in this install at all. */
  store: boolean;
};

export type DeviceSettingsNativeModule = {
  /** The switches right now. Synchronous — read before the WebView loads. */
  flags(): DeviceSettingsFlags;
  /** The player changed a switch in iOS Settings. */
  addListener(
    event: "onSettingsChange",
    listener: (flags: DeviceSettingsFlags) => void,
  ): EventSubscription;
};

/** The native module, or null in a build that doesn't carry it. */
export const DeviceSettings =
  requireOptionalNativeModule<DeviceSettingsNativeModule>("DeviceSettings");

export default DeviceSettings;
