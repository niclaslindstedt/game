// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEVICE CONTENT SWITCHES, Apple's half: the app's own page in iOS Settings,
// drawn by the Settings.bundle (../plugins/with-settings-bundle.js) and read back
// out of UserDefaults by the local native module (../modules/device-settings/).
//
// This file is only the adapter between that module and the platform seam. The
// interesting rule — an absent key means the player never touched the switch, so
// it answers the shipped default rather than false — lives in the Swift module,
// because that is where the read happens.

import DeviceSettings, {
  type DeviceSettingsFlags,
} from "../modules/device-settings";

import {
  POLICY_ALLOW_ALL,
  type DevicePolicy,
  type DeviceSettingsProvider,
} from "./device-settings-provider";

/** Defend the module's answer into a policy. A native module from a newer/older
 * build could hand back anything; a non-boolean falls back to ON rather than
 * censoring the game on a malformed read. */
function toPolicy(flags: Partial<DeviceSettingsFlags> | null): DevicePolicy {
  if (!flags) return POLICY_ALLOW_ALL;
  return {
    nsfw: typeof flags.nsfw === "boolean" ? flags.nsfw : true,
    store: typeof flags.store === "boolean" ? flags.store : true,
  };
}

/** The Apple provider, or null in a build without the native module. */
export function deviceSettingsProviderIOS(): DeviceSettingsProvider | null {
  const module = DeviceSettings;
  if (!module) return null;
  return {
    read: () => {
      try {
        return toPolicy(module.flags());
      } catch {
        return POLICY_ALLOW_ALL;
      }
    },
    subscribe: (onChange) => {
      try {
        const sub = module.addListener("onSettingsChange", (flags) => {
          onChange(toPolicy(flags));
        });
        return () => sub.remove();
      } catch {
        return () => {};
      }
    },
  };
}
