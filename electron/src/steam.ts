// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE OWNER OF THE STEAM CLIENT.
//
// The peer of native/src/game-center.ts, and it exists for the same reason:
// `steamworks.init()` is a single global handshake with the running Steam
// client, and the three features built on it (cloud save, achievements, and —
// once the binding grows them — leaderboards) must SHARE that one handshake
// rather than each performing their own. So every provider asks this module
// for the client and nobody else calls `init`.
//
// It never throws. `init` throws when Steam isn't running, when the app id is
// unknown to it, or when the game was launched outside Steam — all of which are
// ordinary situations for a developer build and none of which may stop the game
// from starting. A failed handshake is memoized as "no client", every provider
// reports itself unavailable, and the game plays on device-locally, exactly as
// it does in a browser.

import { output } from "./output";
import { isPlaceholderAppId, STEAM_APP_ID, STEAM_ENABLED } from "./config";

/** The slice of the steamworks.js client this shell uses. Declared structurally
 * rather than imported as a type so the module stays loadable (and testable) on
 * a machine where the native binding can't be required at all — a Linux CI box,
 * or any platform the prebuilt binaries don't cover. */
export type SteamClient = {
  localplayer: {
    getName(): string;
    getSteamId(): { steamId64: bigint; steamId32: string; accountId: number };
  };
  cloud: {
    isEnabledForAccount(): boolean;
    isEnabledForApp(): boolean;
    readFile(name: string): string;
    writeFile(name: string, content: string): boolean;
    fileExists(name: string): boolean;
  };
  achievement: {
    activate(achievement: string): boolean;
    isActivated(achievement: string): boolean;
  };
  stats: {
    getInt(name: string): number | null;
    setInt(name: string, value: number): boolean;
    store(): boolean;
  };
  overlay: {
    activateDialog(dialog: number): void;
  };
  utils: {
    isSteamRunningOnSteamDeck(): boolean;
  };
  /**
   * The LEGACY `ISteamNetworking` P2P API — and nothing else, which is the
   * fact the whole transport seam is shaped around.
   *
   * `steamworks.js` ^0.4.0 binds no `ISteamNetworkingSockets` and no
   * `ISteamNetworkingMessages`, so there are no sockets, no callbacks and no
   * channels: the queue is POLLED. That is why `server/net/transport.ts` is
   * packet-shaped and pumped rather than stream-shaped — a seam designed
   * around the richer API could not have accommodated this one.
   *
   * Valve has deprecated it, and its reliability guarantees are thinner than
   * SDR's. It still relays and still punches NAT, which is what is needed; if
   * it proves flaky under load the fallback is landing the newer interface
   * upstream or writing an N-API addon, and the latter costs the prebuilt
   * binaries that make this shell installable without a Rust toolchain. The
   * direct UDP path is the insurance policy on exactly that risk.
   */
  networking: {
    sendP2PPacket(steamId64: bigint, sendType: number, data: Buffer): boolean;
    isP2PPacketAvailable(): number;
    readP2PPacket(size: number): {
      data: Buffer;
      steamId: { steamId64: bigint };
    };
    acceptP2PSession(steamId64: bigint): void;
  };
  /** Steam matchmaking (ISteamMatchmaking) — the lobby IS the game list.
   * See `net-lobby.ts`. */
  matchmaking: {
    createLobby(lobbyType: number, maxMembers: number): Promise<SteamLobby>;
    joinLobby(lobbyId: bigint): Promise<SteamLobby>;
    getLobbies(): Promise<SteamLobby[]>;
  };
  /** Steam Workshop (ISteamUGC) — how a player's mods arrive and how an
   * author's mod leaves. See `workshop.ts`. */
  workshop: {
    getSubscribedItems(): bigint[];
    installInfo(
      itemId: bigint,
    ): { folder: string; sizeOnDisk: bigint; timestamp: number } | null;
    state(itemId: bigint): number;
    download(itemId: bigint, highPriority: boolean): boolean;
    createItem(
      appId?: number,
    ): Promise<{ itemId: bigint; needsToAcceptAgreement: boolean }>;
    updateItem(
      itemId: bigint,
      update: {
        title?: string;
        description?: string;
        changeNote?: string;
        previewPath?: string;
        contentPath?: string;
        tags?: string[];
        visibility?: number;
      },
      appId?: number,
    ): Promise<{ itemId: bigint; needsToAcceptAgreement: boolean }>;
  };
};

/** One matchmaking lobby, narrowed to what the server browser needs. Declared
 * structurally for the same reason `SteamClient` is: this module has to stay
 * loadable on a machine the native binding has no binary for. */
export type SteamLobby = {
  id: bigint;
  getOwner(): { steamId64: bigint };
  getMembers(): { steamId64: bigint }[];
  getData(key: string): string | null;
  setData(key: string, value: string): boolean;
  getFullData(): Record<string, string>;
  setJoinable(joinable: boolean): boolean;
  openInviteDialog(): void;
  leave(): void;
};

/** `SendType` from ISteamNetworking. `reliable` is what the transport seam's
 * `"reliable"` mode means on this path; `unreliable` is a plain datagram, which
 * is right for a snapshot that is already coded against an acknowledged
 * baseline. Mirrored as constants so the enum needn't be imported from a module
 * that may not load. */
export const SEND_TYPE_UNRELIABLE = 0;
export const SEND_TYPE_RELIABLE = 2;

/** `ELobbyType.Public` — the value a lobby the server browser can find is
 * created with. `FriendsOnly` is 1; the HOST screen chooses. */
export const LOBBY_TYPE_PUBLIC = 2;
export const LOBBY_TYPE_FRIENDS_ONLY = 1;

/** `EItemState` bits from ISteamUGC, mirrored so the enum needn't be imported
 * from a module that may not load. Only the two the shell acts on. */
export const ITEM_STATE_INSTALLED = 4;
export const ITEM_STATE_NEEDS_UPDATE = 8;

/** `overlay.Dialog.Achievements` — the overlay page the ACHIEVEMENTS row opens.
 * Mirrored as a constant so the enum doesn't have to be imported from a module
 * that may not load (see `SteamClient` above). Keep in step with
 * steamworks.js' `overlay.Dialog`. */
export const OVERLAY_DIALOG_ACHIEVEMENTS = 6;

/** `undefined` = not tried yet; `null` = tried and there is no Steam here. */
let client: SteamClient | null | undefined;

/**
 * The Steam client, or null when there is none (Steam not running, the game
 * launched outside it, `GIS_STEAM=off`, or an unsupported platform).
 *
 * Memoized including the failure: `init` is a handshake, not a poll, and
 * retrying it per request would mean a failed launch re-throwing into every
 * cloud read for the rest of the session.
 */
export function steamClient(): SteamClient | null {
  if (client !== undefined) return client;
  client = connect();
  return client;
}

function connect(): SteamClient | null {
  if (!STEAM_ENABLED) {
    output.info("steam: disabled (GIS_STEAM=off) — running without Steam");
    return null;
  }
  try {
    // Required lazily: the module resolves a prebuilt native binary per
    // platform and THROWS at require time on one it has no build for, which
    // must not take the whole shell down with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks = require("steamworks.js") as {
      init(appId?: number): SteamClient;
    };
    const connected = steamworks.init(STEAM_APP_ID);
    output.info(
      `steam: connected as ${safeName(connected)} (app ${STEAM_APP_ID}` +
        `${isPlaceholderAppId() ? ", SPACEWAR TEST APP" : ""})`,
    );
    return connected;
  } catch (err) {
    output.warn(
      `steam: unavailable — ${describe(err)}. ` +
        "Cloud save and achievements are off; the game plays device-locally.",
    );
    return null;
  }
}

/** The signed-in player's name, or null when Steam can't say. Used to label
 * the game's own SIGNED IN AS line — never to key a save. */
export function steamPlayerName(): string | null {
  const connected = steamClient();
  if (!connected) return null;
  try {
    return connected.localplayer.getName() || null;
  } catch {
    return null;
  }
}

/** The signed-in player's 64-bit Steam id as a string, or null. */
export function steamPlayerId(): string | null {
  const connected = steamClient();
  if (!connected) return null;
  try {
    return connected.localplayer.getSteamId().steamId64.toString();
  } catch {
    return null;
  }
}

function safeName(connected: SteamClient): string {
  try {
    return connected.localplayer.getName() || "unknown player";
  } catch {
    return "unknown player";
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
