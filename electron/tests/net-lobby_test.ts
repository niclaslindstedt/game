// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOBBY — the metadata round trip, and that it degrades rather than throws.
//
// Every machine this runs on in development and CI has no Steam client, and so
// does every copy of the game a player launches outside Steam. That is the
// ORDINARY case for this module, not an error case.
//
// The half that IS worth pinning with a fake client is the metadata: the keys
// are part of the wire in every sense that matters, because a build that
// renamed one would silently stop seeing the other build's sessions with no
// error anywhere. So the round trip is asserted through the real keys.

import { describe, expect, it } from "vitest";

import {
  browseLobbies,
  hostLobby,
  joinLobby,
  LOBBY_KEYS,
  type LobbyAdvert,
} from "../src/net-lobby";
import type { SteamClient, SteamLobby } from "../src/steam";

const ADVERT: LobbyAdvert = {
  name: "A GOOD RUN",
  level: "moon",
  difficulty: "nightmare",
  players: 3,
  maxPlayers: 8,
  protocol: 2,
  build: "1.2.3",
  needsPassword: true,
  mods: ["greenhouse", "extra"],
  address: "203.0.113.7:27016",
};

/** A lobby that remembers what was written to it. */
function fakeLobby(id = 1n): SteamLobby & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    id,
    data,
    getOwner: () => ({ steamId64: 76561197960287930n }),
    getMembers: () => [],
    getData: (key) => data[key] ?? null,
    setData: (key, value) => {
      data[key] = value;
      return true;
    },
    getFullData: () => data,
    setJoinable: () => true,
    openInviteDialog: () => {},
    leave: () => {},
  };
}

function fakeClient(lobby: SteamLobby): SteamClient {
  return {
    matchmaking: {
      createLobby: () => Promise.resolve(lobby),
      joinLobby: () => Promise.resolve(lobby),
      getLobbies: () => Promise.resolve([lobby]),
    },
  } as unknown as SteamClient;
}

describe("without a Steam client", () => {
  it("hosts nothing, browses nothing and joins nothing — without throwing", async () => {
    // Null rather than a no-op lobby, because the caller has a different
    // decision to make either way: a host with no Steam has no invite panel
    // and its HOST screen must offer the address instead.
    expect(await hostLobby(ADVERT, null)).toBeNull();
    expect(await browseLobbies(null)).toEqual([]);
    expect(await joinLobby("1", null)).toBeNull();
  });
});

describe("the lobby's metadata", () => {
  it("round-trips every field a browser row needs", async () => {
    const lobby = fakeLobby();
    const client = fakeClient(lobby);
    await hostLobby(ADVERT, client);
    const rows = await browseLobbies(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: ADVERT.name,
      level: ADVERT.level,
      difficulty: ADVERT.difficulty,
      players: 3,
      maxPlayers: 8,
      protocol: 2,
      build: "1.2.3",
      needsPassword: true,
      mods: ["greenhouse", "extra"],
      address: "203.0.113.7:27016",
    });
  });

  it("writes through the short, stable keys", async () => {
    // The keys are never spelled inline anywhere, because renaming one is a
    // silent split between two builds rather than an error.
    const lobby = fakeLobby();
    await hostLobby(ADVERT, fakeClient(lobby));
    expect(lobby.data[LOBBY_KEYS.name]).toBe(ADVERT.name);
    expect(lobby.data[LOBBY_KEYS.address]).toBe(ADVERT.address);
  });

  it("clears the address when a host stops offering one", async () => {
    // An explicit null has to OVERWRITE rather than be skipped as absent: a
    // host that turns the direct door off must not leave a dead address in its
    // own row for people to try.
    const lobby = fakeLobby();
    const hosted = await hostLobby(ADVERT, fakeClient(lobby));
    hosted?.update({ address: null });
    expect(lobby.data[LOBBY_KEYS.address]).toBe("");
    expect((await browseLobbies(fakeClient(lobby)))[0]?.address).toBeNull();
  });

  it("keeps the player count live without rewriting the rest", async () => {
    const lobby = fakeLobby();
    const hosted = await hostLobby(ADVERT, fakeClient(lobby));
    hosted?.update({ players: 7 });
    const row = (await browseLobbies(fakeClient(lobby)))[0];
    expect(row?.players).toBe(7);
    expect(row?.name).toBe(ADVERT.name);
  });

  it("drops a row that vanished between the list and the read", async () => {
    // An ordinary race, not an error: the lobby comes back with no name and is
    // simply not shown.
    const gone = fakeLobby();
    gone.getFullData = () => {
      throw new Error("no such lobby");
    };
    expect(await browseLobbies(fakeClient(gone))).toEqual([]);
  });

  it("hands back the host's Steam id, which is the peer key", async () => {
    const lobby = fakeLobby();
    await hostLobby(ADVERT, fakeClient(lobby));
    const joined = await joinLobby("1", fakeClient(lobby));
    expect(joined?.hostId).toBe("76561197960287930");
    expect(joined?.row.name).toBe(ADVERT.name);
  });
});
