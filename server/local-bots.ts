// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOCAL BOT SEATS — the session filling its own empty chairs with autopilot
// heroes, so one person can play a party game without four friends online.
//
// **A BOT SEAT IS A CLIENT SEAT.** Each bot here is the SAME client a human
// joiner is — `createNetClient`, by way of `createBotClient` — attached over an
// in-process loopback pair instead of a socket. That is the whole design: every
// rule that governs a client (the private split, the command allow-list, the
// acting-hero seat, the input path) governs a bot unchanged, BY CONSTRUCTION,
// because there is no second door for it to have slipped through. The bots run
// inside the session's own process, each on its own client id, ticked from the
// session's advance cadence (`host.ts`'s pump).
//
// **THE PIPE IS A TINY LOOPBACK.** The bot's `send` decodes the frame and hands
// it straight to `session.receive`, exactly as the loopback rig in
// `tests/engine/net_session_test.ts` does; the session's `send` queues a copy
// into the bot's inbox, drained at the bot's own tick — so a publish that lands
// mid-advance is read a beat later rather than re-entering the client inside
// the session's own loop.
//
// **A BOT'S RUN IS NOBODY'S ROSTER.** Its loadout is null — the authored fresh
// start, the same hero a brand-new character gets — and it BANKS nothing: a bot
// has no device and no roster to bank to, which is true by construction (there
// is no app behind its client to extract a loadout into). And a botted run is a
// PARTY run: seating the second hero stamps `GameState.party` exactly as a
// human joiner would (`seatHero` → `stampParty`), so the run stays off the
// leaderboards — the autopilot carrying half the fight is precisely what the
// party stamp exists to keep out of the rankings.

import { engineVersion, nextFreeSeat } from "@game/core";

import { createBotClient, type BotClient } from "./bot-client.ts";
import type { ClientTransport } from "./client.ts";
import type { Session } from "./session.ts";
import { decodeFrame } from "./wire/codec.ts";

/**
 * Bot client ids live in a range of their own, above every human's: the host's
 * renderer is 1 (`server/main.ts`), the hub numbers strangers from 100
 * (`net/hub.ts`), and the session's own bots start here — so a log line, a
 * kick and a teardown can never mistake one population for another.
 */
export const FIRST_BOT_CLIENT_ID = 1000;

export type LocalBotsOptions = {
  /** Monotonic ms, the same clock the host drives everything else with. */
  now(): number;
  /** Where a line about a bot goes. */
  log?(message: string): void;
};

export type LocalBots = {
  /** Drain each bot's inbox and let it decide one tick. Driven from the host's
   * pump — the one clock — right after the session has advanced. */
  tick(): void;
  /** The clients themselves, for a test or a diagnostic readout. */
  readonly bots: readonly BotClient[];
  close(): void;
};

/**
 * Seat `count` bot clients in a live session.
 *
 * Called once, after the session's own first client is in (a hosted session
 * identifies its HOST by being the first arrival, so a bot seated before the
 * renderer attached would be mistaken for it — `host.ts` owns that ordering).
 * Each bot is admitted through `session.addClient` with `bot: true`, which
 * stamps `Player.bot`, prices the horde like a `/players` step, and marks the
 * seat as one that yields to an arriving person.
 */
export function seatLocalBots(
  session: Session,
  count: number,
  options: LocalBotsOptions,
): LocalBots {
  const bots: BotClient[] = [];
  /** Per-bot tick closures, paired index-for-index with `bots` — each drains
   * its own inbox before the bot decides. */
  const ticks: (() => void)[] = [];
  for (let i = 0; i < count; i++) {
    const id = FIRST_BOT_CLIENT_ID + i;
    // Numbered by the SEAT it is about to take (seat 0 is player 1), so the
    // roster reads BOT 2, BOT 3, … beside the host rather than restarting a
    // count of its own.
    const name = `BOT ${nextFreeSeat(session.state) + 1}`;

    // THE LOOPBACK. Bot → session is synchronous — a decoded frame handed to
    // `session.receive`, the same shape every transport delivers. Session →
    // bot is a pumped queue: frames are COPIED in (a broadcast frame is one
    // buffer shared across clients) and drained at the bot's own tick.
    const inbox: ArrayBuffer[] = [];
    let deliver: ((frame: ArrayBuffer) => void) | null = null;
    const pipe: ClientTransport = {
      send: (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded) {
          session.receive(id, decoded.type, decoded.seq, decoded.payload);
        }
      },
      onFrame: (listener) => {
        deliver = listener;
      },
      close: () => {},
    };

    // The client BEFORE the seat: `session.addClient` sends the welcome
    // synchronously, and the queue only helps if somebody is registered to
    // drain to by then.
    const bot = createBotClient({
      pipe,
      build: engineVersion,
      name,
      now: options.now,
      log: options.log,
      onClosed: (reason, detail) => {
        // A bot that was told to go — its seat yielded to a person, or the
        // session closing — stops being ticked; nothing else to tear down,
        // since the "socket" is this closure.
        options.log?.(
          `net: ${name} closed — ${reason}${detail ? ` (${detail})` : ""}`,
        );
      },
    });
    const drain = (): void => {
      while (inbox.length > 0) {
        const frame = inbox.shift();
        if (frame) deliver?.(frame);
      }
    };
    // NO LOADOUT — the authored fresh start; a bot has no roster to bring a
    // hero from, and nothing will be banked back when the run ends.
    session.addClient(
      id,
      (frame) => {
        inbox.push(frame.slice(0));
      },
      { play: true, loadout: null, bot: true },
      name,
    );
    void bot.start();
    bots.push(bot);
    // Wrapped so one tick drains the inbox first — the bot decides off the
    // freshest snapshot the session has published.
    ticks.push(() => {
      drain();
      bot.tick();
    });
  }

  return {
    tick() {
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (bot && !bot.done) ticks[i]?.();
      }
    },
    get bots() {
      return bots;
    },
    close() {
      for (const bot of bots) bot.close();
    },
  };
}
