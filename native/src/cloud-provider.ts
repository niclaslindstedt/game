// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind CLOUD SAVE. The bridge (cloud-save.ts) and the whole
// web side know only this interface, so a second platform is ONE new file that
// implements it — no protocol change, no web change, no merge change.
//
// Today: Apple (cloud-icloud.ts) — iCloud key-value storage + Game Center.
//
// Next: Google Play. The mapping is deliberately one-to-one, so the Android
// provider is a `cloud-play-games.ts` written against the same five members:
//
//   isAvailable  the player is signed into Play Games Services
//   identify     Play Games' signed-in player (id + display name), the peer of
//                Game Center's — the game only ever SHOWS it
//   load/save    Play Games SAVED GAMES snapshots (one snapshot named like our
//                storage key). Snapshots carry their own conflict resolution;
//                resolve with the newest and let the game's merge do the rest —
//                the payload is built so merging twice is harmless
//                (pwa/src/game/cloud-save.ts)
//   subscribe    Play Games has no change push; a provider that can't be told
//                when the cloud changed returns a no-op unsubscribe, and the
//                game still pulls on every foreground and at boot
//   maxBytes     Saved Games' snapshot ceiling (3 MB by default), replacing
//                iCloud's 1 MB per-key limit
//
// The provider must never throw: every method degrades to
// unavailable/null/false so a shell missing the native module still boots.

import { Platform } from "react-native";

import { icloudProvider } from "./cloud-icloud";

/** Which platform cloud answered — labels the game's status line. */
export type CloudProviderId = "icloud" | "play-games";

/** The signed-in platform player, shown by the game as "SIGNED IN AS …". */
export type CloudPlayer = { id: string; name: string };

export type CloudProvider = {
  id: CloudProviderId;
  /** A cloud is reachable and writable for this player right now. */
  isAvailable(): Promise<boolean>;
  /** The platform player, or null when there is none (or they declined). */
  identify(): Promise<CloudPlayer | null>;
  /** The stored blob, or null when nothing has ever been saved. Rejects
   * nothing — a failure is reported as `undefined`. */
  load(key: string): Promise<string | null | undefined>;
  /** Write the blob; false when the provider refused it. */
  save(key: string, data: string): Promise<boolean>;
  /** Called when the cloud changed underneath us; returns an unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** The provider's per-value ceiling in bytes. */
  maxBytes: number;
};

/**
 * The provider for this platform, or null where there is none yet. Android
 * returns null today, so an Android build reports cloud save unavailable and
 * keeps playing device-locally — exactly what a build without the native module
 * does on iOS.
 */
export function cloudProvider(): CloudProvider | null {
  if (Platform.OS === "ios") return icloudProvider();
  return null;
}
