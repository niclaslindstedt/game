// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE on Steam — the `CloudProvider` implementation, the peer of
// native/src/cloud-icloud.ts.
//
// Steam Cloud is a FILE store (ISteamRemoteStorage), where iCloud is a
// key-value store, so the mapping is: our one save key becomes one file name.
// Everything else lines up exactly, which is the whole point of the seam — the
// payload, the merge, and the per-device coin ledger on the web side never
// learn that this platform is different.
//
// Two Steam-specific facts shape this file:
//
//  1. **Cloud can be off two different ways.** Steam lets the PLAYER disable
//     cloud sync per game, and lets the DEVELOPER not enable it for the app at
//     all. Either one means writes go nowhere useful, so `isAvailable` demands
//     both — reporting available when the app has it switched off would leave
//     the game showing a green CLOUD SAVE row that silently loses every write.
//
//  2. **A read failure and an empty cloud must not be confused.** The bridge's
//     contract is `undefined` = the read FAILED, `null` = the cloud holds
//     nothing yet. Steam's `readFile` throws on a missing file rather than
//     returning empty, so the existence check comes first and a throw after
//     that is a genuine failure. Collapsing the two would let the game treat an
//     unreachable cloud as a fresh account and push a near-empty save over a
//     roster it never saw — the one outcome cloud save exists to prevent.
//
// Steam Cloud's per-file ceiling is set per app in the partner site (100 MB by
// default), i.e. it is not a hard API constant the way iCloud's 1 MB per key
// is. `MAX_BYTES` is therefore a self-imposed sanity bound rather than a
// platform one; it is far above any plausible roster and exists so a runaway
// payload is refused here rather than silently eating the app's quota.

import { output } from "./output";
import { steamClient, steamPlayerId, steamPlayerName } from "./steam";
import type { CloudPlayer, CloudProvider } from "./cloud-provider";

/** Our self-imposed payload ceiling — see the note above. */
const MAX_BYTES = 4 * 1024 * 1024;

export function steamCloudProvider(): CloudProvider {
  return {
    id: "steam-cloud",

    async isAvailable(): Promise<boolean> {
      const client = steamClient();
      if (!client) return false;
      try {
        // Both switches, for the reason in the header: the player's per-game
        // toggle AND the app's own cloud setting.
        return client.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp();
      } catch {
        return false;
      }
    },

    async identify(): Promise<CloudPlayer | null> {
      const id = steamPlayerId();
      if (!id) return null;
      return { id, name: steamPlayerName() ?? "" };
    },

    async load(key: string): Promise<string | null | undefined> {
      const client = steamClient();
      if (!client) return undefined;
      try {
        // Existence first — see the header. `readFile` throws on a missing
        // file, which would otherwise be indistinguishable from a real failure.
        if (!client.cloud.fileExists(key)) return null;
        return client.cloud.readFile(key);
      } catch (err) {
        output.warn(`steam cloud: read failed — ${describe(err)}`);
        return undefined;
      }
    },

    async save(key: string, data: string): Promise<boolean> {
      const client = steamClient();
      if (!client) return false;
      try {
        return client.cloud.writeFile(key, data);
      } catch (err) {
        output.warn(`steam cloud: write failed — ${describe(err)}`);
        return false;
      }
    },

    subscribe(): () => void {
      // Steam Cloud has no change push to the running game — it reconciles at
      // launch and exit, so there is nothing to notify us mid-session. Same
      // shape as Play Games' Saved Games: return a no-op unsubscribe and let
      // the game's own pull-at-boot / pull-on-focus carry it (the merge is
      // idempotent, so an extra pull is free).
      return () => {};
    },

    maxBytes: MAX_BYTES,
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
