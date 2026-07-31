// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOBBY — Steam matchmaking, which IS the server browser.
//
// `matchmaking.getLobbies()` is D2's game list, and the lobby's own metadata is
// what makes that list useful WITHOUT connecting to anything: the session name,
// the host's name, the difficulty, the level, how many are in it, the protocol
// and build both ends must agree on, whether a password is set, the mod list,
// and the direct address if the host is offering one. A browser row that had to
// open a connection to fill itself in would be a browser that DDoSes every host
// on it every time somebody scrolls.
//
// **THE METADATA IS A CLAIM, NOT A FACT, and the handshake is what settles it.**
// A host writes its own row: nothing stops one advertising the wrong build or a
// player count it does not have. That is fine and is why the row's job is to
// let a player CHOOSE rather than to be trusted — every one of those fields is
// checked again for real by `server/net/hub.ts` before a byte reaches the
// session, and a mismatch is refused by name. The browser exists to stop people
// clicking on games they cannot join, not to enforce anything.
//
// **KEYS ARE SHORT AND STABLE.** Steam caps lobby metadata, and the key names
// are part of the wire in every sense that matters: a build that renamed one
// would silently stop seeing the other build's sessions, with no error
// anywhere. They are therefore listed once, here, and never spelled inline.

import { output } from "./output";
import {
  LOBBY_TYPE_FRIENDS_ONLY,
  LOBBY_TYPE_PUBLIC,
  steamClient,
  steamPlayerName,
  type SteamClient,
  type SteamLobby,
} from "./steam";

/** The metadata keys. Short, and never changed once a build has shipped. */
export const LOBBY_KEYS = {
  name: "n",
  host: "h",
  level: "l",
  difficulty: "d",
  players: "p",
  maxPlayers: "m",
  protocol: "v",
  build: "b",
  password: "w",
  mods: "o",
  /** The host's direct address, when it is offering one — which is what lets
   * a player who found a session over Steam join it over UDP instead. */
  address: "a",
} as const;

/** One row in the browser. Every field is what the host CLAIMED. */
export type LobbyRow = {
  id: string;
  name: string;
  host: string;
  level: string;
  difficulty: string;
  players: number;
  maxPlayers: number;
  protocol: number;
  build: string;
  needsPassword: boolean;
  mods: string[];
  address: string | null;
};

/** What a host publishes about its session. */
export type LobbyAdvert = {
  name: string;
  level: string;
  difficulty: string;
  players: number;
  maxPlayers: number;
  protocol: number;
  build: string;
  needsPassword: boolean;
  mods: string[];
  address: string | null;
  /** Public games appear in the browser; friends-only ones only through an
   * invite. Defaults to friends-only, which is the setting a player who did
   * not think about it should end up with. */
  publicListing?: boolean;
};

export type Lobby = {
  readonly id: string;
  /** Rewrite the row — the player count changes as people come and go. */
  update(advert: Partial<LobbyAdvert>): void;
  /** Steam's own invite panel, which is the whole reason the Steam door is the
   * default: a friend accepts and Valve handles the route, the NAT and the
   * address a player would otherwise have to be told. */
  invite(): boolean;
  close(): void;
};

/** Create and publish a lobby, or null when there is no Steam here. */
export async function hostLobby(
  advert: LobbyAdvert,
  client: SteamClient | null = steamClient(),
): Promise<Lobby | null> {
  if (!client) return null;
  try {
    const lobby = await client.matchmaking.createLobby(
      advert.publicListing ? LOBBY_TYPE_PUBLIC : LOBBY_TYPE_FRIENDS_ONLY,
      advert.maxPlayers,
    );
    write(lobby, { ...advert, host: steamPlayerName() ?? "HOST" });
    lobby.setJoinable(true);
    return {
      id: lobby.id.toString(),
      update: (patch) => write(lobby, patch),
      invite: () => {
        try {
          lobby.openInviteDialog();
          return true;
        } catch (err) {
          output.warn(`lobby: no invite panel — ${describe(err)}`);
          return false;
        }
      },
      close: () => {
        try {
          // Joinable false BEFORE leaving: a lobby that is left while still
          // joinable stays in the browser until Steam reaps it, and every
          // player who clicks it gets a session that is not there.
          lobby.setJoinable(false);
          lobby.leave();
        } catch (err) {
          output.warn(`lobby: could not close — ${describe(err)}`);
        }
      },
    };
  } catch (err) {
    output.warn(`lobby: could not create — ${describe(err)}`);
    return null;
  }
}

/**
 * The browser's rows.
 *
 * Rows this build cannot join are NOT filtered out here, deliberately. A player
 * whose friend is on a newer build and whose list is simply empty concludes the
 * feature is broken; one who sees the session greyed with "BUILD 1.4.2" goes and
 * updates. Filtering is the screen's decision to make, with the reason in hand.
 */
export async function browseLobbies(
  client: SteamClient | null = steamClient(),
): Promise<LobbyRow[]> {
  if (!client) return [];
  try {
    const lobbies = await client.matchmaking.getLobbies();
    return lobbies.map((lobby) => read(lobby)).filter((row) => row.name !== "");
  } catch (err) {
    output.warn(`lobby: could not browse — ${describe(err)}`);
    return [];
  }
}

/** Join one by id, and hand back the host's Steam id — which is the peer key
 * the relayed transport addresses. */
export async function joinLobby(
  id: string,
  client: SteamClient | null = steamClient(),
): Promise<{ hostId: string; row: LobbyRow } | null> {
  if (!client) return null;
  try {
    const lobby = await client.matchmaking.joinLobby(BigInt(id));
    return { hostId: lobby.getOwner().steamId64.toString(), row: read(lobby) };
  } catch (err) {
    output.warn(`lobby: could not join ${id} — ${describe(err)}`);
    return null;
  }
}

function write(
  lobby: SteamLobby,
  advert: Partial<LobbyAdvert & { host: string }>,
): void {
  const set = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    try {
      lobby.setData(key, value);
    } catch {
      // A metadata write that fails leaves the previous value, which is a
      // stale row rather than a broken one — and never worth a throw on the
      // path that is publishing a game.
    }
  };
  set(LOBBY_KEYS.name, advert.name);
  set(LOBBY_KEYS.host, advert.host);
  set(LOBBY_KEYS.level, advert.level);
  set(LOBBY_KEYS.difficulty, advert.difficulty);
  set(LOBBY_KEYS.players, advert.players?.toString());
  set(LOBBY_KEYS.maxPlayers, advert.maxPlayers?.toString());
  set(LOBBY_KEYS.protocol, advert.protocol?.toString());
  set(LOBBY_KEYS.build, advert.build);
  set(
    LOBBY_KEYS.password,
    advert.needsPassword === undefined
      ? undefined
      : advert.needsPassword
        ? "1"
        : "0",
  );
  set(LOBBY_KEYS.mods, advert.mods?.join(","));
  // An explicit null means "I am not offering one", and it has to overwrite a
  // previous address rather than be skipped as absent — a host that turns the
  // direct door off must not leave a dead address in its own row.
  if (advert.address !== undefined)
    set(LOBBY_KEYS.address, advert.address ?? "");
}

function read(lobby: SteamLobby): LobbyRow {
  const data = safeData(lobby);
  const at = (key: string) => data[key] ?? "";
  return {
    id: lobby.id.toString(),
    name: at(LOBBY_KEYS.name),
    host: at(LOBBY_KEYS.host),
    level: at(LOBBY_KEYS.level),
    difficulty: at(LOBBY_KEYS.difficulty),
    players: Number.parseInt(at(LOBBY_KEYS.players), 10) || 0,
    maxPlayers: Number.parseInt(at(LOBBY_KEYS.maxPlayers), 10) || 0,
    protocol: Number.parseInt(at(LOBBY_KEYS.protocol), 10) || 0,
    build: at(LOBBY_KEYS.build),
    needsPassword: at(LOBBY_KEYS.password) === "1",
    mods: at(LOBBY_KEYS.mods) ? at(LOBBY_KEYS.mods).split(",") : [],
    address: at(LOBBY_KEYS.address) || null,
  };
}

function safeData(lobby: SteamLobby): Record<string, string> {
  try {
    return lobby.getFullData() ?? {};
  } catch {
    // A lobby that vanished between the list and the read is an ordinary race,
    // and it comes back as a row with no name — which `browseLobbies` drops.
    return {};
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
