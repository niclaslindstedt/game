// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOTS IN A LOCAL (HOSTED) GAME — the session filling its own empty seats with
// autopilot heroes (`server/local-bots.ts`).
//
// The claim under test is structural: A BOT SEAT IS A CLIENT SEAT. Each bot is
// the same `createNetClient` a human joiner is, over an in-process loopback
// pair, admitted through the same `session.addClient` — so what these tests
// drive is the REAL creation path (`HostOptions.bots` → `seatLocalBots`), the
// real client, and the real session, not a fixture that agrees with itself.
//
// Four rules ride on the flag and each gets its own proof here:
//  - a bot's hero MOVES (the autopilot actually plays over the pipe),
//  - a bot takes NO XP and inflates no party bonus (`splitXp`),
//  - a bot seat PRICES the horde like a `/players` step, composing with the
//    chat override,
//  - a bot YIELDS its seat to an arriving person, and a stranger cannot wear
//    the flag (the hub builds its seat request by hand).

import { afterEach, describe, expect, it } from "vitest";

import {
  getBalanceTuning,
  isPartyRun,
  partyXpBonus,
  resetBalanceTuning,
  seatHero,
  splitXp,
  type GameState,
  type Player,
} from "@game/core";
import { encodeFrame } from "@game/wire/codec.ts";
import { FRAME, TICK_MS } from "@game/wire/frames.ts";
import { challengeEpoch, challengeFor } from "@game/wire/handshake.ts";
import { playerScaling } from "@game/wire/players.ts";
import { type Handshake, type SessionParams } from "@game/wire/protocol.ts";

import { createHost, type Host } from "../../server/host.ts";
import { createPeerHub, type HubSession } from "../../server/net/hub.ts";
import type {
  Packet,
  Transport,
  TransportEvents,
} from "../../server/net/transport.ts";
import { startGame, stopWaves } from "./helpers.ts";

const PARAMS: SessionParams = {
  seed: 20260801,
  levelId: "test_level",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
  generatedMapSize: "random",
};

/** The host's own renderer, as `server/main.ts` numbers it. */
const HOST_CLIENT = 1;

const running: Host[] = [];

afterEach(async () => {
  for (const host of running) await host.close("test over");
  running.length = 0;
  // The player-count pricing writes the PROCESS-GLOBAL balance tuning; a test
  // that seated bots must not leave the next suite fighting a doubled horde.
  resetBalanceTuning();
});

/**
 * A hosted session with `bots` bot seats, driven by hand.
 *
 * The host's own client attaches FIRST — exactly as `server/main.ts` orders it
 * — because a hosted session identifies its host by being the first arrival;
 * the bots come in on the first pump after that (`ensureBots`).
 */
function hostWithBots(
  bots: number,
  options: { maxClients?: number } = {},
): { host: Host; pump(ticks: number): void } {
  let clock = 0;
  const host = createHost({
    allowUnlicensedTransport: true,
    params: PARAMS,
    maxClients: options.maxClients,
    bots,
    now: () => clock,
  });
  running.push(host);
  host.session.addClient(HOST_CLIENT, () => {}, true, "HOST");
  return {
    host,
    pump(ticks: number) {
      for (let i = 0; i < ticks; i++) {
        clock += TICK_MS;
        host.pump();
      }
    },
  };
}

describe("a session started with bots", () => {
  it("waits for the first human in an ownerless session", () => {
    let clock = 0;
    const host = createHost({
      allowUnlicensedTransport: true,
      params: PARAMS,
      ownerless: true,
      bots: 2,
      now: () => clock,
    });
    running.push(host);

    clock += TICK_MS;
    host.pump();
    expect(host.session.clientCount).toBe(0);
    expect(host.session.botClients).toBe(0);

    host.session.addClient(HOST_CLIENT, () => {}, true, "ZOE");
    clock += TICK_MS;
    host.pump();
    expect(host.session.roster().map((entry) => entry.name)).toEqual([
      "ZOE",
      "BOT 2",
      "BOT 3",
    ]);
  });

  it("starts an eight-bot ownerless session immediately", () => {
    let clock = 0;
    const host = createHost({
      allowUnlicensedTransport: true,
      params: PARAMS,
      ownerless: true,
      bots: 8,
      now: () => clock,
    });
    running.push(host);
    clock += TICK_MS;
    host.pump();
    expect(host.session.clientCount).toBe(8);
    expect(host.session.botClients).toBe(8);
    expect(host.session.roster()[0]?.name).toBe("BOT 1");
  });

  it("seats bot heroes that hold Player.bot and actually play", () => {
    const { host, pump } = hostWithBots(2);
    pump(1);
    // Seated beside the host, flagged, and named by seat on the roster.
    const state = host.session.state;
    expect(state.players).toHaveLength(3);
    expect(state.players[1]?.bot).toBe(true);
    expect(state.players[2]?.bot).toBe(true);
    expect(state.players[0]?.bot).toBeUndefined();
    expect(host.session.roster().map((entry) => entry.name)).toEqual([
      "HOST",
      "BOT 2",
      "BOT 3",
    ]);
    expect(host.session.botClients).toBe(2);

    // THE BOTS PLAY. Their scene verbs walk the run onto the field (the same
    // group verbs any client sends), and the autopilot then steers — so the
    // bot heroes MOVE, which is the whole proof that snapshots reach them and
    // their input reaches the simulation over the loopback pipe.
    const before = state.players.map((hero) => ({ ...hero.pos }));
    pump(900);
    expect(state.phase).toBe("playing");
    const moved = (seat: number): number => {
      const hero = state.players[seat];
      const start = before[seat];
      if (!hero || !start) return 0;
      return Math.hypot(hero.pos.x - start.x, hero.pos.y - start.y);
    };
    expect(moved(1)).toBeGreaterThan(2);
    expect(moved(2)).toBeGreaterThan(2);
  }, 30_000);

  it("stamps the run as a PARTY run, off the leaderboards", () => {
    const { host, pump } = hostWithBots(1);
    pump(1);
    // Seating the second hero stamped the run exactly as a human joiner would
    // (`seatHero` → `stampParty`): an autopilot carrying half the fight is
    // precisely what the stamp exists to keep out of the rankings.
    expect(isPartyRun(host.session.state)).toBe(true);
    expect(host.session.state.party?.seats).toBe(2);
  });

  it("prices the horde like /players, and composes with the chat override", () => {
    const { host, pump } = hostWithBots(2);
    pump(1);
    // Two bot seats beside the host: the fight is priced for three — BOTH
    // knobs, hp and xpGain together, or a bot seat would be strictly punishing.
    expect(getBalanceTuning().mobHp).toBe(playerScaling(3).mobHp);
    expect(getBalanceTuning().xpGain).toBe(playerScaling(3).xpGain);

    // `/players 4` over two bots is a fight priced for six: the chat knob is
    // the host's bargain, the bot seats are bodies actually standing in it,
    // and the one repricing function reads both.
    host.session.receive(HOST_CLIENT, FRAME.chat, 0, { text: "/players 4" });
    expect(getBalanceTuning().mobHp).toBe(playerScaling(6).mobHp);
    expect(getBalanceTuning().xpGain).toBe(playerScaling(6).xpGain);
  });

  it("yields the newest bot's seat to an arriving person", () => {
    const { host, pump } = hostWithBots(2, { maxClients: 3 });
    pump(1);
    const state = host.session.state;
    expect(state.players).toHaveLength(3);
    expect(getBalanceTuning().mobHp).toBe(playerScaling(3).mobHp);

    // Every chair is taken — but two of them by the host's own autopilots, so
    // a person is not turned away: the NEWEST bot departs through the ordinary
    // removal path and the person is seated into its chair.
    host.session.addClient(200, () => {}, { play: true, loadout: null }, "ZOE");
    expect(state.players).toHaveLength(3);
    const seated = state.players[2];
    expect(seated?.bot).toBeUndefined();
    expect(seated?.departed).toBeFalsy();
    expect(host.session.botClients).toBe(1);
    // The older bot keeps its seat; the roster now reads host, bot, person.
    expect(state.players[1]?.bot).toBe(true);
    expect(state.players[1]?.departed).toBeFalsy();
    expect(host.session.roster().map((entry) => entry.name)).toEqual([
      "HOST",
      "BOT 2",
      "ZOE",
    ]);
    // And the departure re-priced the horde: one bot left standing.
    expect(getBalanceTuning().mobHp).toBe(playerScaling(2).mobHp);

    // The next pump delivers the bye to the displaced bot's client, which
    // stops itself — no orphaned autopilot keeps steering a seat it lost.
    pump(1);
    expect(host.session.clientCount).toBe(3);
  });
});

describe("a bot takes no XP", () => {
  /** A run with humans and bots seated, waves stopped, field cleared. */
  function party(
    humans: number,
    bots: number,
  ): {
    state: GameState;
    heroes: Player[];
  } {
    const state = startGame(7);
    stopWaves(state);
    state.enemies = [];
    for (let i = 1; i < humans; i++) seatHero(state, null);
    for (let i = 0; i < bots; i++) seatHero(state, null, { bot: true });
    return { state, heroes: [...state.players] };
  }

  function huddle(state: GameState, at = { x: 400, y: 400 }): void {
    for (const hero of state.players) hero.pos = { ...at };
  }

  it("pays no cut to a bot, and counts none toward the party bonus", () => {
    const { state, heroes } = party(2, 1);
    const [a, b, bot] = heroes as [Player, Player, Player];
    huddle(state);
    a.level = 20;
    b.level = 60;
    // A high-level bot in the weighting would besides taxing the kill also
    // skew every human's share — its level must count for nothing.
    bot.level = 99;
    const cuts = splitXp(state, 800, a.pos);
    // The pot is a TWO-hero pot: the bot is not a head for the bonus.
    const pot = 800 * partyXpBonus(2);
    expect(cuts).toHaveLength(2);
    expect(cuts.some((cut) => cut.hero.bot)).toBe(false);
    expect(cuts[0]?.amount).toBe(Math.round((pot * 20) / 80));
    expect(cuts[1]?.amount).toBe(Math.round((pot * 60) / 80));
  });

  it("keeps the solo short-circuit for one person beside a bot", () => {
    const { state, heroes } = party(1, 1);
    const [a] = heroes as [Player];
    huddle(state);
    // Exactly the whole amount, through the exactly-one-near branch — the solo
    // number cannot move because a machine is standing nearby.
    const cuts = splitXp(state, 500, a.pos);
    expect(cuts).toEqual([{ hero: a, amount: 500 }]);
  });

  it("falls back to the nearest PERSON, never a bot standing closer", () => {
    const { state, heroes } = party(1, 1);
    const [a, bot] = heroes as [Player, Player];
    a.pos = { x: 100, y: 100 };
    bot.pos = { x: 3900, y: 3900 };
    const cuts = splitXp(state, 300, { x: 3800, y: 3800 });
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.hero).toBe(a);
    expect(cuts[0]?.amount).toBe(300);
  });

  it("lets the amount evaporate when every hero in play is a bot", () => {
    const { state, heroes } = party(1, 1);
    const [a, bot] = heroes as [Player, Player];
    huddle(state);
    a.hp = 0;
    expect(splitXp(state, 400, bot.pos)).toEqual([]);
  });
});

describe("the hub never forwards a bot claim", () => {
  const HOST_HANDSHAKE: Handshake = { protocol: 2, build: "1.2.3", mods: [] };
  const SECRET = 0xbadf00d;
  const PEER = "203.0.113.7:27015";

  it("seats a joiner whose join frame claims bot:true as an ordinary player", () => {
    // The hub builds its seat request BY HAND from the fields it chooses to
    // read (`onJoin`), so a stranger's `bot: true` — a free pass out of the XP
    // split and a lever on the horde pricing — lands on the floor.
    const seats: unknown[] = [];
    const session: HubSession = {
      addClient: (_id, _send, seat) => seats.push(seat),
      removeClient: () => {},
      receive: () => {},
      clientCount: 0,
    };
    let events: TransportEvents | null = null;
    const transport: Transport = {
      id: "udp",
      bound: { address: "0.0.0.0", port: 27015 },
      listen: (handlers) => {
        events = handlers;
        return Promise.resolve(transport.bound);
      },
      send: () => {},
      ping: () => -1,
      drop: () => {},
      tick: () => {},
      close: () => {},
    };
    const clock = 1_000;
    const hub = createPeerHub({
      allowUnlicensedTransport: true,
      session,
      handshake: HOST_HANDSHAKE,
      secret: SECRET,
      now: () => clock,
    });
    void hub.add(transport);
    const join: Packet = {
      from: PEER,
      data: new Uint8Array(
        encodeFrame(
          { type: FRAME.join, seq: 0, ack: 0, tick: 0 },
          {
            cookie: challengeFor(SECRET, PEER, challengeEpoch(clock)),
            handshake: HOST_HANDSHAKE,
            proof: 0,
            name: "SNEAK",
            bot: true,
          },
        ),
      ),
    };
    (events as TransportEvents | null)?.onPacket(join);
    expect(seats).toHaveLength(1);
    const seat = seats[0] as { play: boolean; bot?: boolean };
    expect(seat.play).toBe(true);
    expect(seat.bot).toBeUndefined();
  });
});
