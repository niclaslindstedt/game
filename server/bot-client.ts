// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOT CLIENT — a headless process that JOINS a session over the real
// transport, receives real snapshots, and plays its hero off the replicated
// state alone (multiplayer plan §7.2.5).
//
// **WHY IT EXISTS, AHEAD OF THE SOAK IT MAKES POSSIBLE.** `wire/split.ts`
// declares what travels. Nothing anywhere proves that **what travels is ENOUGH
// TO PLAY FROM**. Every existing test asserts that a field which changed
// arrived; none asserts that the set of fields a client HAS is sufficient to
// make a decision with. That gap fails silently and in exactly the direction the
// generic differ was built to avoid: a read moves behind a field the split
// withholds, every test stays green, and a joiner's screen is subtly wrong in a
// way only a human playing it would notice. A bot playing off a client's view
// cannot paper over it — it stops fighting, walks into a wall, or fails to swap
// a weapon, and it does so in CI.
//
// Beside that it makes four things measurable that are currently opinions:
// §5.6's soak and adversity pass, unattended; §5.4's reconnect; §3.3's
// prediction error once there is prediction; and the command channel under real
// arguments, since the bot buys, repairs, allocates, swaps and picks talents
// with values nobody typed into a test.
//
// **IT IS THE SAME CLIENT THE PAGE USES**, `./client.ts`, and that is the whole
// point of having moved that module out of `pwa/`. A second client written
// beside it would be the drift this instrument exists to catch: what the bot
// proves playable has to be what the renderer actually reads.
//
// **AND IT IS THE SAME BOT.** `botIntent` (`src/game/bot/intent.ts`) answers a
// whole tick — the steer plus the verbs — from one snapshot, touching nothing.
// That is what makes this file small: it owns a socket, a clock and a seat, and
// no game knowledge at all.
//
// **THREE HONEST LIMITS**, because the temptation is to claim it proves more
// than it does.
//
//  1. **IT IS NOT A DETERMINISM TEST.** It does not simulate — it applies
//     snapshots. It cannot detect two simulations diverging, and that stays
//     `tests/engine/net_determinism_test.ts`'s job.
//  2. **IT IS NOT THE INSTRUMENT FOR §7.2's NUMBERS.** It acts on a snapshot up
//     to three ticks stale with no prediction under it, so its dps, its deaths
//     and its clear time are partly a measurement of the NETWORK. phase 4's
//     §4.3 tuning is read off the SIMULATOR's in-session party and nowhere else.
//  3. **IT TESTS ONE TRANSPORT AT A TIME** — whichever it was pointed at.

import {
  botAllocate,
  botIntent,
  botPickTalent,
  createBot,
  heroInPlay,
  type Bot,
  type BotCommand,
  type BotProfile,
  type BotStrategy,
  type GameState,
  type Player,
} from "@game/core";

import { createJoinLink, type JoinLink } from "./net/connect.ts";
import type { PeerKey, Transport } from "./net/transport.ts";
import {
  createNetClient,
  type ClientTransport,
  type NetClient,
} from "./client.ts";
import {
  PROTOCOL_VERSION,
  type ByePayload,
  type RefusalReason,
} from "./wire/protocol.ts";

/**
 * How long the same verb is held back for, in SERVER ticks — a little over
 * three publish intervals at `SNAPSHOT_EVERY_TICKS`, so a repeat is only sent
 * once several snapshots have failed to show any effect. Measured in the
 * server's own clock rather than this process's, because the thing being waited
 * on is a snapshot, and a client whose own loop is running fast or slow should
 * wait exactly as long either way.
 */
const RESEND_QUIET_TICKS = 12;

export type BotClientOptions = {
  /** The pipe, for a SOCKET join. A UDP socket for the direct path, the relay
   * for Steam — this module never asks which. Omitted when `pipe` is given. */
  transport?: Transport;
  /** The session, as the transport names one. Omitted when `pipe` is given. */
  host?: PeerKey;
  /**
   * A raw in-process `ClientTransport` INSTEAD of a socket — the session's own
   * local bot seats (`server/local-bots.ts`) hand one end of a loopback pair
   * here. There is no handshake to run and nothing to knock on: the caller has
   * already admitted this client itself (`session.addClient`), so the whole
   * join-link half is skipped and `start()` resolves immediately. Everything
   * above the pipe — the same client, the same autopilot, the same verbs — is
   * identical either way, which is the point: every rule that governs a client
   * governs a local bot by construction.
   */
  pipe?: ClientTransport;
  /** This build's engine version, compared with the session's at the
   * handshake. */
  build: string;
  /** What this bot is called in the roster and in chat. */
  name: string;
  password?: string;
  mods?: string[];
  /** How it fights, and which weapon lane it grows into. */
  strategy?: BotStrategy;
  profile?: BotProfile;
  now(): number;
  /** Seated, with a run to read. */
  onReady?(state: GameState, seat: number | null): void;
  onClosed?(
    reason: RefusalReason | ByePayload["reason"],
    detail?: string,
  ): void;
  log?(line: string): void;
};

/** What a soak reads back. Every figure is this process's own count — nothing
 * here is asked of the server, which is the point: a bot that thinks it is
 * playing while the session disagrees is exactly the bug worth catching. */
export type BotClientStats = {
  /** Ticks in which a steer was actually sent (seated, alive, run live). */
  played: number;
  /** Verbs sent — the command channel under real arguments. */
  commands: number;
  /** The last server tick a snapshot carried, so a stalled session shows up as
   * a number that stops moving rather than as silence. */
  tick: number;
  /** Bytes this client has RECEIVED. §5.6 asks a soak to watch for snapshot
   * growth, and this divided by the elapsed time is that number — measured at
   * the only place it can be, which is the end that pays for it. */
  bytes: number;
};

export type BotClient = {
  /** Open the socket and start knocking. */
  start(): Promise<void>;
  /**
   * Pump the link, then — once seated — decide and send one tick.
   *
   * Called from the process's own clock, exactly as the host path is: there is
   * no timer below this line anywhere in `server/net/`, so a soak drives its
   * whole fleet from one interval and a test drives it by hand.
   */
  tick(): void;
  readonly seated: boolean;
  /** The socket is gone — refused, kicked, timed out or closed by hand. A
   * `seat` outlives it (the welcome's number is still the welcome's number), so
   * a fleet counting players has to ask this too. */
  readonly done: boolean;
  readonly seat: number | null;
  readonly state: GameState | null;
  readonly stats: BotClientStats;
  close(): void;
};

export function createBotClient(options: BotClientOptions): BotClient {
  const bot: Bot = createBot(
    options.strategy ?? "balanced",
    options.profile ?? "meta",
  );
  const stats: BotClientStats = { played: 0, commands: 0, tick: 0, bytes: 0 };
  let closed = false;

  /**
   * The end, told ONCE.
   *
   * Both halves of this bridge notice an ending: the link sees the `bye` on the
   * socket, and the client sees the same frame forwarded up to it. Reporting
   * from each gave a soak log two lines per departure — which reads as a fleet
   * losing twice as many clients as it had, and is exactly the kind of doubled
   * figure an unattended run has no way to argue with.
   */
  function report(
    reason: RefusalReason | ByePayload["reason"],
    detail?: string,
  ): void {
    if (closed) return;
    closed = true;
    options.onClosed?.(reason, detail);
  }

  // THE BRIDGE, and it is four lines because both halves were already written
  // to a seam. `createJoinLink` speaks `Uint8Array` to a socket; `createNetClient`
  // speaks `ArrayBuffer` to "a pipe, whatever it is". Neither knows the other
  // exists, which is why joining cost one small module rather than a second
  // client — and why a bot client costs this file rather than a second wire.
  //
  // AND THE LINK HALF IS OPTIONAL: a LOCAL bot (the session's own seat-filler)
  // arrives with a raw `ClientTransport` already admitted at the other end, so
  // there is no socket, no handshake and no link to pump — the bridge below is
  // simply not built, and the raw pipe is wrapped only to keep the byte count
  // honest.
  let deliver: ((frame: ArrayBuffer) => void) | null = null;
  let link: JoinLink | null = null;
  let pipe: ClientTransport;
  if (options.pipe) {
    const raw = options.pipe;
    pipe = {
      send: (frame) => raw.send(frame),
      onFrame: (listener) =>
        raw.onFrame((frame) => {
          stats.bytes += frame.byteLength;
          listener(frame);
        }),
      close: () => raw.close(),
    };
  } else {
    const { transport, host } = options;
    if (!transport || !host) {
      throw new Error("a bot client needs a transport and a host, or a pipe");
    }
    const joined: JoinLink = createJoinLink({
      transport,
      host,
      handshake: {
        protocol: PROTOCOL_VERSION,
        build: options.build,
        mods: options.mods ?? [],
      },
      name: options.name,
      password: options.password,
      now: options.now,
      // A COPY, because the client's end takes ownership and the transport is
      // still holding its own scratch buffer — the same rule `server/main.ts`
      // follows handing frames to a renderer.
      deliver: (frame) => {
        stats.bytes += frame.byteLength;
        deliver?.(frame.slice().buffer);
      },
      onAdmitted: () => options.log?.(`${options.name} admitted`),
      onClosed: report,
      log: options.log,
    });
    link = joined;
    pipe = {
      send: (frame) => joined.send(new Uint8Array(frame)),
      onFrame: (listener) => {
        deliver = listener;
      },
      close: () => joined.close(),
    };
  }

  const client: NetClient = createNetClient({
    transport: pipe,
    build: options.build,
    mods: options.mods,
    onReady: (state) => options.onReady?.(state, client.seat),
    onClosed: report,
    // No `onSeat`: `local-seat.ts` is the PAGE's answer to which hero a screen
    // is about, and this process has no screen. The seat is read off the client
    // instead, which is the same number from the same welcome.
  });

  /**
   * Send one verb — unless it is the same verb we sent a moment ago.
   *
   * **A REPEATED RELIABLE VERB IS HOW THIS PROCESS KILLS ITSELF**, and the soak
   * found it by killing every client in the fleet inside a minute. A screen
   * holds the run until somebody clears it, so the naive loop sends
   * `advanceDialogue` (or `allocateStat`, or `dismissIntro`) on EVERY tick it
   * still sees that screen — sixty a second, all reliable, against a window of
   * sixty-four unacknowledged messages. The layer below then does exactly what
   * it says on the tin and declares the peer dead: `too many unacknowledged
   * messages`. Eight clients, all gone, and the last snapshot each one applied
   * sits frozen on the readout looking for all the world like a wedged server.
   *
   * The rule is the one a human obeys without thinking: having asked, WAIT to
   * see whether it worked. A client cannot see that in less than a publish
   * interval, so a repeat inside {@link RESEND_QUIET_TICKS} server ticks is
   * information-free by construction — the snapshot that would justify it has
   * not arrived. A DIFFERENT verb always goes immediately; nothing here slows
   * the bot down, it only stops it shouting.
   */
  function send(command: BotCommand): void {
    const key = `${command.name}:${command.args.join(",")}`;
    if (key === lastKey && client.tick - lastTick < RESEND_QUIET_TICKS) return;
    lastKey = key;
    lastTick = client.tick;
    client.sendCommand(command.name, command.args);
    stats.commands++;
  }
  let lastKey = "";
  let lastTick = -RESEND_QUIET_TICKS;

  return {
    // A local bot has nothing to open or knock on — it was admitted before it
    // was built — so its start is already done.
    start: () => link?.start() ?? Promise.resolve(),
    tick() {
      if (closed) return;
      // The link's own clock first: the probe's retry, the reliability layer's
      // retransmits and the socket. Before admission that is ALL there is to
      // do — and a local bot, which has no link, skips straight to playing.
      link?.tick();
      stats.tick = client.tick;
      const state = client.state;
      const seat = client.seat;
      if (!state || seat === null) return;
      const hero = state.players[seat];
      // A SPECTATOR AND A DEPARTED SEAT BOTH SIT STILL. `heroInPlay` rather
      // than `hp > 0`, which misses a departed seat — the read that once made a
      // party whose fourth player quit undefeatable.
      if (!hero) return;
      // A SCENE IS CLEARED BEFORE ANYTHING ELSE, because none of it is a fight:
      // the run is frozen behind the phase and a steer sent into it is a steer
      // the server drops.
      const scene = sceneCommand(bot, state, hero);
      if (scene) {
        send(scene);
        return;
      }
      if (!heroInPlay(hero)) return;
      // AND THE REST IS THE ORDINARY AUTOPILOT, unchanged and unaware: the
      // steer plus at most one verb per half, decided from this snapshot.
      const intent = botIntent(bot, state, hero);
      client.sendInput(intent.input);
      for (const command of intent.commands) send(command);
      stats.played++;
    },
    get seated() {
      return client.seat !== null;
    },
    get done() {
      return closed;
    },
    get seat() {
      return client.seat;
    },
    get state() {
      return client.state;
    },
    get stats() {
      return stats;
    },
    close() {
      if (closed) return;
      closed = true;
      client.dispose();
    },
  };
}

/**
 * THE ONE THING A HEADLESS JOINER NEEDS THAT `botIntent` DOES NOT COVER: getting
 * out of a screen.
 *
 * The app's own driver (`pwa/src/game/game-screen/bot-driver.ts`) does far more
 * here — it paces a demo, takes errands, runs the merchant counter and works the
 * gate-key ritual — and none of that belongs in a process with no screen. What
 * is left is the narrow set that would otherwise park a bot for ever: a phase
 * that freezes the run, and the two pauses a level-up puts in front of it.
 *
 * **EVERY ONE OF THESE IS A GROUP VERB** (plan §3.2 keeps a scene global and
 * lets anyone advance it), so a bot in a session with humans can skip a
 * cutscene out from under them. That is correct for the SOAK this exists for and
 * would be rude in a party; a bot filling a player's party is steered in the
 * session instead (§7.3), which is the other half of why these two hosts are
 * separate.
 */
function sceneCommand(
  bot: Bot,
  state: GameState,
  hero: Player,
): BotCommand | null {
  // The BUILD first: banked points are drained through the same two verbs a
  // player presses (plan §3.2 — a ding banks rather than pausing, so the bot
  // simply spends on sight; the last spend closes any chooser the run
  // greeted it with).
  if (hero.pendingStatPoints > 0) {
    return { name: "allocateStat", args: [botAllocate(bot, state, hero)] };
  }
  if (hero.pendingTalentPoints.length > 0) {
    const id = botPickTalent(bot, state, hero);
    if (id) return { name: "spendTalentPoint", args: [id] };
  }
  // The SCREENS are the bot's own now (per-player, plan §3.2): whatever of
  // its screens is up with nothing left to spend gets closed, and a respec
  // greeting a level-token jump is confirmed once its pool is placed.
  if (hero.screen === "respec") return { name: "confirmRespec", args: [] };
  if (hero.screen === "levelup") return { name: "closeLevelup", args: [] };
  if (hero.screen === "paused") return { name: "resumeGame", args: [] };
  switch (state.phase) {
    // **THE TITLE CARD IS THE ONE THAT BIT.** A dedicated server's run is built
    // and then waits on the level card for somebody to tap it — that is what
    // `title` IS — and a headless joiner that never sends this sits in a
    // perfectly healthy session, steering a hero on a run that has not started,
    // for as long as you leave it. It looks exactly like playing from the
    // outside: the session ticks, snapshots arrive, the bot decides and sends
    // sixty times a second. It took the soak's own readout (phase, level,
    // kills) to see it, which is the argument for that readout existing.
    //
    // `dismissIntro` covers `intro` as well as `title` — the engine names it
    // the "start now" shortcut for exactly this caller — so the monologue is
    // skipped and the card dropped in one verb rather than two ticks.
    case "title":
    case "intro":
      return { name: "dismissIntro", args: [] };
    case "outro":
      return { name: "skipOutro", args: [] };
    case "cutscene":
      return { name: "skipCutscene", args: [] };
    case "dialogue":
      return { name: "advanceDialogue", args: [] };
    case "dying":
      return { name: "skipDeathScene", args: [] };
    // **STAY ON THE FIELD.** The victory screen is where a soak otherwise
    // stops: the party clears the level in a few minutes and then parks in
    // front of a menu for the remaining eleven hours, which is not a leak watch
    // — it is a screensaver. Staying keeps the same map alive and the horde
    // coming, which is exactly what an unattended run should do and is what a
    // player farming a cleared field does anyway. Refused unless there is a
    // boss corpse to tap, so this is a no-op on a level that ended some other
    // way.
    case "victory":
      return { name: "stayOnField", args: [] };
    // A kneeling unique is always SPARED, exactly as the app's bot does it: a
    // soak that never recruited anybody would never exercise the companion
    // systems, and the party beats a lone bot anyway.
    case "choice":
      return { name: "resolveChoice", args: [true] };
    default:
      return null;
  }
}
