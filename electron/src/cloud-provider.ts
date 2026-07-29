// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind CLOUD SAVE on the desktop — the same five members
// native/src/cloud-provider.ts declares, so the bridge above it
// (./cloud-save.ts) is the same dumb string-mover on both shells.
//
// Today: Steam (./cloud-steam.ts). A second desktop storefront (GOG Galaxy,
// Epic) would be one new file here and nothing else, exactly as Play Games is
// on the mobile side.
//
// The interface is duplicated rather than imported across the two trees on
// purpose: `native/` and `electron/` have separate dependency trees and
// separate toolchains (neither is an npm workspace member), and the mobile
// declaration imports `react-native`. Sharing it would mean a third package to
// keep both in step with — more coupling than the ~30 lines it would save. The
// PROTOCOL is what must not drift, and that is pinned by the web side, which
// both shells answer.

import { steamCloudProvider } from "./cloud-steam";
import { steamClient } from "./steam";

/** Which platform cloud answered — labels the game's status line. */
export type CloudProviderId = "steam-cloud";

/** The signed-in platform player, shown by the game as "SIGNED IN AS …". */
export type CloudPlayer = { id: string; name: string };

export type CloudProvider = {
  id: CloudProviderId;
  /** A cloud is reachable and writable for this player right now. */
  isAvailable(): Promise<boolean>;
  /** The platform player, or null when there is none (or they declined). */
  identify(): Promise<CloudPlayer | null>;
  /** The stored blob, `null` when nothing has ever been saved, `undefined`
   * when the READ FAILED. The difference is load-bearing — see the note in
   * ./cloud-steam.ts. */
  load(key: string): Promise<string | null | undefined>;
  /** Write the blob; false when the provider refused it. */
  save(key: string, data: string): Promise<boolean>;
  /** Called when the cloud changed underneath us; returns an unsubscribe. */
  subscribe(onChange: () => void): () => void;
  /** The provider's per-value ceiling in bytes. */
  maxBytes: number;
};

/**
 * The provider for this shell, or null where there is none. Null is a normal
 * state, not an error: a build run outside Steam (or with `GIS_STEAM=off`)
 * reports cloud save unavailable and keeps playing device-locally.
 */
export function cloudProvider(): CloudProvider | null {
  return steamClient() ? steamCloudProvider() : null;
}
