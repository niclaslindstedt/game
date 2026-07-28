// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's Apple provider: iCloud key-value storage for the save blob (the
// local Expo module in ../modules/cloud-save — see its Swift file for why the
// key-value store is the right transport for a save this size), and Game Center
// for the player's NAME.
//
// The name is asked of the game-center module (../modules/game-center), which
// is the one owner of Game Center authentication in the app — the same sign-in
// that mirrors the player's badges (./achievements-gamecenter.ts). Signing in
// twice from two modules would have them fight over one global handler.
//
// Everything here degrades instead of throwing: with the native module absent
// (Expo Go, or a build without the pod) the provider simply reports itself
// unavailable, and the game keeps saving to the device as it always has.

import CloudSaveModule from "../modules/cloud-save";

import type { CloudProvider } from "./cloud-provider";
import { gameCenterSignIn } from "./game-center";

/** iCloud's key-value store caps ONE value at 1 MB (and 1 MB per account
 * overall). The web side keeps its own smaller guard; this is the hard edge. */
const MAX_BYTES = 1_024 * 1_024;

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

    // Memoized inside ./game-center.ts, so the sign-in sheet appears at most
    // once per launch no matter how often the status row polls.
    identify: () => gameCenterSignIn(),

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
