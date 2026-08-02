// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOT CLIENT (`server/bot-client.ts`) — a headless process that joins a
// real session over a real socket and plays its hero off the replicated state
// alone.
//
// **THIS IS THE ONE TEST THAT ASKS WHETHER WHAT TRAVELS IS ENOUGH TO PLAY
// FROM.** `wire/split.ts` declares what crosses; every other suite in this
// directory asserts that a field which CHANGED arrived. None of them asks
// whether the set of fields a client HAS is sufficient to make a decision with —
// and that gap fails silently and in exactly the direction the generic differ
// was built to avoid: a read moves behind a field the split withholds, every
// test stays green, and a joiner's screen is subtly wrong in a way only a human
// playing it would notice.
//
// A bot cannot paper over it. Handed a view it cannot read, `botAct` returns an
// idle steer and the housekeeping asks for nothing — so the assertions here are
// deliberately about the bot ACTING, not about it acting well.
//
// **IT IS NOT A DETERMINISM TEST** (the client applies snapshots, it does not
// simulate — that stays `net_determinism_test.ts`) and **IT IS NOT THE SOAK**
// (the soak wants eight clients for hours; this wants a few seconds of loopback).
// What it is, is the thing that made both of those possible to write.

import { afterEach, describe, expect, it } from "vitest";

import { startDedicated } from "../../server/dedicated.ts";
import { createBotClient, type BotClient } from "../../server/bot-client.ts";
import { createUdpTransport, type Impairment } from "../../server/net/udp.ts";
import { engineVersion, heroInPlay } from "@game/core";
import type { Host } from "../../server/host.ts";

/** A port range this suite owns, away from the shipped 27015–27030 and from
 * `net_dedicated_test`'s, so a developer with the game open (or a parallel
 * file) does not fail their own run. */
const PORT = 28_913;

const running: { close(reason?: string): unknown }[] = [];

afterEach(async () => {
  for (const thing of running) await thing.close("test over");
  running.length = 0;
});

/** Stand a dedicated server up on `port`, with a run a bot can actually play. */
async function serve(port: number): Promise<Host> {
  const host = await startDedicated({
    // The Steam-only licence gate's escape — a loopback socket with no Steam near it, which is
    // exactly what a headless suite is for.
    allowUnlicensedTransport: true,
    level: "moon",
    difficulty: "easy",
    seed: 4242,
    port,
    statusEverySec: 0,
  });
  expect(host).not.toBeNull();
  running.push(host as Host);
  return host as Host;
}

function joinBot(
  port: number,
  name: string,
  impair?: Impairment,
): { bot: BotClient; closed: string[] } {
  const closed: string[] = [];
  const bot = createBotClient({
    transport: createUdpTransport({
      port: 0,
      maxPort: 0,
      host: "127.0.0.1",
      impair,
    }),
    host: `127.0.0.1:${port}`,
    build: engineVersion,
    name,
    // A REAL clock, not a synthetic one, and that matters here in a way it does
    // not in the rest of this suite. The host runs on `performance.now()`; the
    // probe's retry budget (twelve tries, half a second apart) and the hub's
    // token refill (one per second) are both measured in seconds. A fake clock
    // that advanced sixteen milliseconds per READ raced through the joiner's
    // whole six-second budget inside two real ones, so a bot waiting on a
    // refill gave up before the token it was waiting for existed.
    now: () => performance.now(),
    onClosed: (reason, detail) =>
      closed.push(`${reason}${detail ? `:${detail}` : ""}`),
  });
  running.push({ close: () => bot.close() });
  return { bot, closed };
}

/** Drive both ends by hand for `ticks` iterations, yielding to the event loop
 * so real datagrams over loopback actually get delivered. */
async function pump(
  host: Host,
  bots: BotClient[],
  ticks: number,
  until?: () => boolean,
): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    for (const bot of bots) bot.tick();
    host.pump();
    if (until?.()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/**
 * Pump until `phaseOf()` reads `playing`, then answer whatever it reads.
 *
 * **READING THE PHASE STRAIGHT OFF A PUMP IS A RACE, NOT A MEASUREMENT.** The
 * pumps above exit on a BOT statistic (`played > 30`), which says nothing
 * about what is on stage — and something is on stage constantly, because the
 * horde walks up and speaks. A bot clears a scene the way a player does, with
 * a verb on its NEXT tick (`advanceDialogue`), so the tick that satisfies the
 * pump's condition can perfectly well be the tick an arrival scene opened on:
 * the run is running exactly as intended and the phase reads `dialogue`.
 *
 * That is a coin flip weighted by how far the session's clock got per
 * iteration, which is why it came up green on a laptop for weeks and red on a
 * CI runner playing two shards at once. So: give the party the ticks to finish
 * whatever it is reading, and only then look. The assertion at the call site
 * stays EXACT — a run genuinely stuck in a scene burns every iteration here
 * and still fails, which is the bug these assertions were written to catch.
 *
 * The READER is the caller's, because the two callers are asking different
 * questions: one wants the phase as it REACHED A CLIENT (the split carried it),
 * the other wants the session's own.
 */
async function settledPhase(
  host: Host,
  bots: BotClient[],
  phaseOf: () => string | undefined,
): Promise<string | undefined> {
  await pump(host, bots, 200, () => phaseOf() === "playing");
  return phaseOf();
}

describe("a bot client against a real dedicated server", () => {
  it("joins, takes a seat, and plays from the snapshots alone", async () => {
    const host = await serve(PORT);
    const { bot, closed } = joinBot(PORT, "AUTO-1");
    await bot.start();

    await pump(host, [bot], 400, () => bot.stats.played > 60);

    expect(closed).toEqual([]);
    // ADMITTED, by the session rather than by this process's opinion of itself.
    expect(host.session.clientCount).toBe(1);
    expect(bot.seated).toBe(true);
    expect(bot.seat).toBe(0);

    // THE CLIENT BUILT THE WORLD FOR ITSELF and the deltas corrected it: the
    // static tier costs zero bytes precisely because both ends ran the same
    // `createRunFromParams` over the same parameters.
    const state = bot.state;
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(1);

    // **THE ASSERTION THIS FILE EXISTS FOR.** The bot decided and sent, off a
    // view it never simulated. A split that withheld something `botAct` reads
    // would leave this at zero with every other net test still green.
    expect(bot.stats.played).toBeGreaterThan(60);
    // **AND THE RUN IS ACTUALLY RUNNING**, which is a separate claim and the one
    // that caught a real bug. A session builds its run parked on the level
    // card — that is what `title` IS — and a client that never sends the verb
    // to drop through it steers a hero on a run that has not begun. Every
    // figure above is happily satisfied by that: the session ticks, snapshots
    // arrive, the bot decides and sends sixty times a second. Only the PHASE
    // tells them apart.
    expect(await settledPhase(host, [bot], () => bot.state?.phase)).toBe(
      "playing",
    );
    // And the server's clock is moving under it — a bot happily steering a run
    // that has stopped is the other half of the same illusion.
    expect(bot.stats.tick).toBeGreaterThan(0);
    // At least level with the snapshot the bot last applied — a client is never
    // AHEAD of the session, and asserting it is strictly behind would be
    // asserting the loopback is slow.
    expect(host.session.tick).toBeGreaterThanOrEqual(bot.stats.tick);
  }, 30_000);

  it("steers a hero the session agrees is alive and on the field", async () => {
    const host = await serve(PORT + 1);
    const { bot } = joinBot(PORT + 1, "AUTO-2");
    await bot.start();
    await pump(host, [bot], 400, () => bot.stats.played > 60);

    // The hero the bot steers is the SESSION's, seen from two sides: the seat
    // the server admitted it into, and the body standing on the server's own
    // field. `heroInPlay` rather than `hp > 0` — a departed seat is not a
    // player the world should react to.
    const seat = bot.seat as number;
    const mine = host.session.state.players[seat];
    expect(mine).toBeDefined();
    expect(heroInPlay(mine!)).toBe(true);
    // The replica names the same hero. Position is not compared: the client is
    // up to a publish interval behind by design, and asserting otherwise would
    // be asserting there is no network.
    expect(bot.state!.players[seat]?.maxHp).toBe(mine!.maxHp);
  }, 30_000);

  it("keeps playing at 150 ms and 2% loss", async () => {
    // The soak's adversity figures, injected at the transport seam BELOW the
    // reliability layer — so a lost reliable payload is genuinely retransmitted
    // and a lost snapshot is genuinely gone. The claim under test is the
    // design's own: a dropped snapshot costs a frame and can never desync.
    //
    // A FIXED random source, so a flake here is a bug rather than a bad day.
    let seed = 1;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const host = await serve(PORT + 2);
    const { bot, closed } = joinBot(PORT + 2, "AUTO-3", {
      latencyMs: 75, // one way, so 150 ms round trip
      loss: 0.02,
      random,
    });
    await bot.start();
    await pump(host, [bot], 900, () => bot.stats.played > 40);

    expect(closed).toEqual([]);
    expect(bot.seated).toBe(true);
    expect(bot.stats.played).toBeGreaterThan(40);
  }, 45_000);

  it("seats a party of four, each steering its own hero", async () => {
    // The shape the soak scales up: N processes' worth of client, all
    // pumped from one clock. Four rather than eight because this is a unit
    // suite on somebody's laptop, and the property being checked — every bot
    // gets a DISTINCT seat and plays it — does not need the cap to show.
    //
    // **THEY ALL KNOCK AT ONCE, AND THAT IS THE POINT.** The hub's
    // connectionless limiter is keyed on the ADDRESS, not the address and port
    // — a flood trivially varies its source port — so a FLEET ON ONE MACHINE
    // draws from a single bucket of five, refilled once a second. Four bots
    // arriving together want eight tokens, so some of them are refused, and
    // this is the case that used to end with three of them reporting "the
    // session stopped answering" fifteen seconds later: the join travelled
    // reliable, the reliability layer under the hub had already acknowledged
    // the datagram, and the limiter dropped the payload where nothing would
    // ever retry it.
    //
    // Now the host says TOO MANY ATTEMPTS and the joiner treats that as a WAIT
    // rather than a refusal (`RATE_LIMIT_BACKOFF_MS`). So this test is the
    // guard on both halves at once — and on the ordinary case they were really
    // about, which is two people in one house joining the same friend.
    const host = await serve(PORT + 3);
    const party = [1, 2, 3, 4].map((n) => joinBot(PORT + 3, `AUTO-${n}`));
    const bots = party.map(({ bot }) => bot);
    for (const bot of bots) await bot.start();

    await pump(host, bots, 4000, () =>
      bots.every((bot) => bot.stats.played > 30),
    );

    expect(party.flatMap(({ closed }) => closed)).toEqual([]);
    expect(host.session.clientCount).toBe(4);
    // The run is on the field, not on the title card — see the first test.
    expect(await settledPhase(host, bots, () => host.session.state.phase)).toBe(
      "playing",
    );
    // FOUR DISTINCT SEATS. A fleet that all steered seat 0 would satisfy every
    // other assertion in this file.
    const seats = bots.map((bot) => bot.seat);
    expect(new Set(seats).size).toBe(4);
    for (const bot of bots) expect(bot.stats.played).toBeGreaterThan(30);
    // And the session is a four-hero party from its own side.
    expect(host.session.state.players).toHaveLength(4);
  }, 45_000);
});

describe("a bot client does not shout", () => {
  it("sends far fewer verbs than it sends steers", async () => {
    // **THE SOAK KILLED ITS WHOLE FLEET WITH THIS.** A screen holds the run
    // until somebody clears it, so the naive loop re-sends the clearing verb on
    // EVERY tick it still sees that screen — sixty a second, all RELIABLE,
    // against a reliability window of sixty-four unacknowledged messages. The
    // layer below then does exactly what it promises and declares the peer
    // dead: `too many unacknowledged messages`. Eight clients gone inside a
    // minute, each one's last snapshot frozen on the readout looking for all
    // the world like a wedged server.
    //
    // The ratio is the cheap, non-flaky way to state the rule: a bot steers
    // every tick and asks for something only occasionally. A regression to
    // one-verb-per-tick would put these two numbers side by side.
    const host = await serve(PORT + 4);
    const { bot, closed } = joinBot(PORT + 4, "AUTO-Q");
    await bot.start();
    await pump(host, [bot], 600, () => bot.stats.played > 120);

    expect(closed).toEqual([]);
    expect(bot.stats.played).toBeGreaterThan(120);
    expect(bot.stats.commands).toBeLessThan(bot.stats.played / 10);
    // And well inside the window the reliability layer will tolerate, which is
    // the number that actually bit.
    expect(bot.stats.commands).toBeLessThan(64);
  }, 30_000);
});
