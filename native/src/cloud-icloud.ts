// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's Apple provider: iCloud key-value storage for the save blob, and
// Game Center for the player's name. Both come from the local Expo module in
// ../modules/cloud-save — see its Swift file for why the key-value store is the
// right transport for a save this size.
//
// Everything here degrades instead of throwing: with the native module absent
// (Expo Go, or a build without the pod) the provider simply reports itself
// unavailable, and the game keeps saving to the device as it always has.

import CloudSaveModule from "../modules/cloud-save";

import type { CloudPlayer, CloudProvider } from "./cloud-provider";

/** iCloud's key-value store caps ONE value at 1 MB (and 1 MB per account
 * overall). The web side keeps its own smaller guard; this is the hard edge. */
const MAX_BYTES = 1_024 * 1_024;

/** Game Center's answer, resolved once per launch: the sign-in sheet must not
 * reappear on every status poll. */
let identity: Promise<CloudPlayer | null> | null = null;

export function icloudProvider(): CloudProvider {
  return {
    id: "icloud",
    maxBytes: MAX_BYTES,

    isAvailable: async () => {
      try {
        return CloudSaveModule?.isAvailable() === true;
      } catch {
        return false;
      }
    },

    identify: () => {
      if (!CloudSaveModule) return Promise.resolve(null);
      identity ??= CloudSaveModule.signIn().catch(() => null);
      return identity;
    },

    load: async (key) => {
      if (!CloudSaveModule) return undefined;
      try {
        return await CloudSaveModule.getItem(key);
      } catch {
        return undefined; // a failed read, NOT an empty cloud
      }
    },

    save: async (key, data) => {
      if (!CloudSaveModule) return false;
      try {
        return await CloudSaveModule.setItem(key, data);
      } catch {
        return false;
      }
    },

    subscribe: (onChange) => {
      if (!CloudSaveModule) return () => {};
      try {
        const subscription = CloudSaveModule.addListener(
          "onCloudChange",
          onChange,
        );
        return () => subscription.remove();
      } catch {
        return () => {};
      }
    },
  };
}
