// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEDICATED SERVER — the same session, run from a terminal instead of from
// a game (docs/multiplayer.md).
//
// **IT IS THE SAME CODE, AND `host.ts` IS WHERE THAT IS TRUE.** The
// utility-process server and the standalone one must be the same thing: one
// session implementation, one admission desk, one transport stack and — the
// part that must not be copied — ONE fixed-timestep loop. All of that is
// `host.ts`. This file is only the terminal wrapper: a config file, a console,
// log output through the engine's own `output.ts`, graceful shutdown, and no
// Steam.
//
// **NO STEAM IS A CONSEQUENCE RATHER THAN A FEATURE.** `steamworks.init()` is a
// single global handshake the desktop shell's main process owns, so the relay
// transport is something the SHELL adds to a host. A dedicated server simply
// never adds one and is left with the direct UDP path — which is the transport
// that already existed, already carries the whole protocol, and is the only one
// that works on a LAN with the internet off.
//
// **WHAT IT DELIBERATELY DOES NOT DO.** It does not join, does not render, does
// not read a roster off disk and does not bank anything: a session's players
// bring their own heroes and take them home, exactly as they do when a friend
// hosts. A dedicated server holds a RUN, not an account, and every rule about
// what that costs — the party stamp, the loadout check, the packet budget — is
// the session's and applies here unchanged because it is the same session.
//
// **THE LICENCE QUESTION IS SETTLED, AND THIS FILE ENFORCES ITS SHARE.**
// Multiplayer is played through Steam and nowhere else (docs/multiplayer.md —
// Licence), so a standalone server on an open UDP port is exactly the play the
// licence does not cover. The config escape below exists for the repo's own
// suites and the headless soak — and in the shipped binary it is DEAD, folded
// shut by the build-time literal in `licence.ts`.

import { readFileSync } from "node:fs";

import { engineVersion, error, header, info, status, warn } from "@game/core";

import { createHost, type Host } from "./host.ts";
import { UNLICENSED_TRANSPORT_UNLOCKED } from "./licence.ts";
import { MAX_CLIENTS } from "./wire/frames.ts";
import {
  PROTOCOL_VERSION,
  type RosterEntry,
  type SessionParams,
} from "./wire/protocol.ts";

/**
 * What a `server.config.json` may say.
 *
 * Deliberately small, and every field optional: the shortest useful config is
 * an empty file, and the shortest useful command is no arguments at all. What
 * is NOT here is as deliberate — no balance knobs, no difficulty multipliers,
 * no drop rates. A dedicated server runs the game; it does not retune it, and a
 * host that could would be a host whose clears mean something different from
 * everybody else's.
 */
export type DedicatedConfig = {
  /**
   * Admit players over a raw UDP socket rather than through Steam.
   *
   * **DEFAULT FALSE, AND WITHOUT IT THIS SERVER ADMITS NOBODY.** Multiplayer
   * is licensed through Steam and nowhere else, and a standalone server on an
   * open port is exactly the play that is not — so the door is shut unless
   * something deliberately opens it. It is here for the repo's own suites and
   * the headless soak fleet, which talk to a loopback socket.
   *
   * **IN THE SHIPPED BINARY THIS FIELD DOES NOTHING.** The ship target folds
   * `UNLICENSED_TRANSPORT_UNLOCKED` (`server/licence.ts`) to `false`, so the
   * escape only works when the server runs from sources. That is the lock: a
   * config file is a thing a determined player can edit, and a packaged build
   * that honoured it would be enforcing the licence with a statement.
   */
  allowUnlicensedTransport?: boolean;
  /**
   * THE OPERATOR'S LICENCE CLAIM (`--licensed`), and what makes this server
   * able to admit anybody at all.
   *
   * Without it the server starts, binds, prints its address and refuses every
   * join — which is the honest behaviour for a copy that holds no multiplayer
   * licence, and is why it is not an error at startup: a server that has not
   * been claimed for is a server nobody joins, not a server that failed.
   *
   * It is a DECLARATION, not a check. Nothing here can verify a licence and
   * nothing pretends to; what this does is make the claim explicit, deliberate
   * and attributable rather than implied by the mere act of starting a
   * process. The store build carries the same word in its packaging, so its
   * server is licensed without anybody typing it.
   *
   * Distinct from `allowUnlicensedTransport` above, which is the repo's own
   * escape for suites and soak runs and stays dead in a packaged binary.
   */
  licensed?: boolean;
  /** The mission to run. Defaults to the campaign's first. */
  level?: string;
  /** `easy` … `jesus`. */
  difficulty?: string;
  /** The run's seed. Omitted means one is rolled, and it is PRINTED — a seed
   * nobody can read back is a bug nobody can reproduce. */
  seed?: number;
  /** UDP port to TRY. What was actually bound is what gets printed; the two
   * are not the same thing (see `net/udp.ts`). */
  port?: number;
  /** Seats, and there is no host among them here — see `maxClients` below. */
  maxPlayers?: number;
  /** Seats to FILL WITH AUTOPILOT HEROES (`--bots N`, 1–8). Counts below 8
   * join after the first human, so that player claims seat 0; 8 starts an
   * entirely autonomous run immediately. A session fact rather
   * than a run parameter — it is passed to the host, never onto the
   * `SessionParams` (`paramsFrom` describes the RUN, and seat-filling says
   * nothing about the world every client must build). Each bot joins as an
   * ordinary client and yields its seat when a person wants it. */
  bots?: number;
  /** A password, or "" for an open game. */
  password?: string;
  /** Mod ids in load order. A joiner whose list differs is refused by name. */
  mods?: string[];
  /**
   * Never ask the router to forward the bound port (`--no-portmap`).
   *
   * A mapping request is a change this process makes to somebody else's
   * hardware, so a deployment that does not want one — a hosted box with its
   * ports already forwarded, a LAN, a build whose packaging does not permit it
   * — must be able to say so. Absent means the mapping is attempted, which is
   * what an operator on a home connection wants.
   */
  noPortMap?: boolean;
  /** Seconds between status lines on the console. 0 turns them off. */
  statusEverySec?: number;
  /** Print a detailed status line every second. */
  verbose?: boolean;
};

/** How often the console prints a line about the running session, by default.
 * Half a minute: often enough to see a server is alive, rare enough that a log
 * file left running overnight is still readable. */
const DEFAULT_STATUS_SEC = 30;

/**
 * Read the config file, or an empty config if there is none.
 *
 * A MISSING file is not an error — the defaults are a playable server — but a
 * malformed one is, and loudly: silently falling back to defaults for a file
 * somebody wrote on purpose is how a server ends up running a mission nobody
 * asked for with nobody able to say why.
 */
export function loadConfig(path: string | undefined): DedicatedConfig {
  if (!path) return {};
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as DedicatedConfig;
}

/**
 * Turn a config into the parameters a session is built from.
 *
 * Everything a RUN is — see `engine/game/session-setup.ts` — and nothing a
 * CHARACTER is: no loadout, no cleared levels, no campaign chain, no purse. A
 * dedicated server's run belongs to nobody, so it starts from the authored
 * fresh state and each arriving player brings their own hero to it.
 */
export function paramsFrom(
  config: DedicatedConfig,
  seed: number,
): SessionParams {
  return {
    seed,
    levelId: config.level ?? "moon",
    difficulty: config.difficulty ?? "medium",
    loadout: null,
    respec: false,
    clearedLevels: [],
    merchantDiscovered: false,
  };
}

/** `--flag value` and `--flag=value` off the command line, and a bare first
 * argument read as the config path. Small on purpose: a server with a rich CLI
 * is a server whose config lives in two places. */
export function parseArgs(argv: readonly string[]): {
  config?: string;
  overrides: DedicatedConfig;
} {
  const overrides: DedicatedConfig = {};
  let config: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      config ??= arg;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
    if (name === "verbose") {
      overrides.verbose = true;
      continue;
    }
    if (name === "no-portmap") {
      overrides.noPortMap = true;
      continue;
    }
    if (name === "licensed") {
      overrides.licensed = true;
      continue;
    }
    const value = eq < 0 ? (argv[++i] ?? "") : arg.slice(eq + 1);
    if (name === "config") config = value;
    else if (name === "level") overrides.level = value;
    else if (name === "difficulty") overrides.difficulty = value;
    else if (name === "password") overrides.password = value;
    else if (name === "port") overrides.port = Number(value);
    else if (name === "seed") overrides.seed = Number(value);
    else if (name === "players") overrides.maxPlayers = Number(value);
    else if (name === "bots") {
      const bots = Number(value);
      if (!Number.isInteger(bots) || bots < 1 || bots > MAX_CLIENTS) {
        throw new Error(`--bots must be an integer from 1 to ${MAX_CLIENTS}`);
      }
      overrides.bots = bots;
    }
  }
  return { config, overrides };
}

/** The roster as one console line — who is in, and what their round trip is. */
function rosterLine(roster: readonly RosterEntry[]): string {
  if (roster.length === 0) return "nobody connected";
  return roster
    .map((entry) => `${entry.name}${entry.ping >= 0 ? ` ${entry.ping}ms` : ""}`)
    .join(", ");
}

/**
 * Run a server until something stops it.
 *
 * Returns the `Host` so a caller (a test, a supervisor) can drive or close it;
 * the CLI below simply waits for a signal.
 */
export async function startDedicated(
  config: DedicatedConfig,
): Promise<Host | null> {
  if (
    config.bots !== undefined &&
    (!Number.isInteger(config.bots) ||
      config.bots < 1 ||
      config.bots > MAX_CLIENTS)
  ) {
    throw new Error(`bots must be an integer from 1 to ${MAX_CLIENTS}`);
  }
  // A ROLLED SEED IS PRINTED. A run nobody can reproduce is a bug report
  // nobody can act on, and this is the one process where there is no title
  // screen to read it off.
  const seed = Number.isFinite(config.seed)
    ? Number(config.seed)
    : (Math.random() * 0xffffffff) >>> 0;
  const params = paramsFrom(config, seed);
  const maxClients = Math.max(
    1,
    Math.min(config.maxPlayers ?? MAX_CLIENTS, MAX_CLIENTS),
  );

  header(
    `SESSION SERVER — build ${engineVersion}, protocol ${PROTOCOL_VERSION}`,
  );
  info(`mission ${params.levelId} on ${params.difficulty}, seed ${seed}`);
  if (config.mods?.length) info(`mods: ${config.mods.join(", ")}`);
  if (config.password) info("password required");

  const host = createHost({
    // WHO THIS SERVER MAY LET IN, and there are two independent ways to say so.
    //
    // `--licensed` is the operator declaring they hold the multiplayer licence
    // — the shipped route, carried automatically by a store build's packaging
    // and typed by hand otherwise. Without it every join is refused by name
    // and the console says so.
    //
    // The config-file escape beside it is the repo's own, for suites and soak
    // runs, and the build-time literal keeps it dead in a packaged binary —
    // see `DedicatedConfig.allowUnlicensedTransport` and `licence.ts`.
    allowUnlicensedTransport:
      config.licensed === true ||
      (config.allowUnlicensedTransport === true &&
        UNLICENSED_TRANSPORT_UNLOCKED),
    params,
    // NOBODY OWNS THIS ONE. Seat 0 stands empty until somebody joins, the
    // first arrival is dressed in the hero they brought rather than in the
    // run's default, an empty server costs no CPU, and the run is a PARTY run
    // for the party stamp's purposes because the operator controls the
    // simulation. All
    // three fall out of this flag — see `SessionOptions.ownerless`.
    ownerless: true,
    mods: config.mods,
    password: config.password,
    maxClients,
    // `--bots N`: autopilot heroes filling seats until people take them —
    // the same creation path a hosted game uses (`HostOptions.bots`).
    bots: config.bots,
    // Every session log line reaches the console rather than a control
    // channel. This is the one deployment where somebody is actually reading
    // them, which is why a refused join and a corrected loadout are worth
    // printing at all.
    log: (line) => status(line),
    now,
  });

  const bound = await host.openUdp(config.port);
  if (!bound) {
    error("could not bind a UDP port — is another server already running?");
    await host.close("no socket");
    return null;
  }
  // THE BOUND PORT, NEVER THE REQUESTED ONE. The socket walks 27015→27030 on a
  // collision, and a server that printed the port it asked for while listening
  // on another is the exact reason "direct connect doesn't work" is
  // unanswerable.
  info(`listening on UDP ${bound.address}:${bound.port}`);
  // Asked for AFTER the address is printed: a router discovery takes up to two
  // seconds against an unresponsive gateway, and the address is the one thing
  // an operator is waiting for.
  if (!config.noPortMap) await host.mapPort();
  const mapping = host.mapping;
  if (mapping.status === "mapped") {
    info(
      `router mapped via ${mapping.method} — ` +
        `${mapping.externalAddress ?? "?"}:${mapping.externalPort}`,
    );
  } else if (mapping.status !== "idle") {
    // Said plainly rather than hidden, because it is half of what makes a
    // server unreachable and the operator is the only one who can fix it.
    warn(
      "no router mapping — forward the port by hand if players cannot reach you",
    );
  }
  // THE HONEST LIMIT, printed every time: reachability from the outside cannot
  // be self-tested without an outside. The first joiner is the only proof.
  info("reachability from outside can only be confirmed by the first joiner");

  host.start();
  return host;
}

/** Monotonic ms. `performance.now()` where it exists, so a system clock change
 * cannot make a tick take a negative amount of time. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * The CLI: start, report, and die politely.
 *
 * **GRACEFUL SHUTDOWN IS NOT POLITENESS.** `host.close` tells every connected
 * player why the session ended — otherwise eight people sit looking at a frozen
 * field until a timeout — and it RELEASES the router mapping, which is a port
 * left open on somebody's network for the rest of its lease if this process
 * merely dies. Both are awaited, because this is the last thing that happens
 * and nothing else will get round to them.
 */
export async function main(argv: readonly string[]): Promise<void> {
  const { config: path, overrides } = parseArgs(argv);
  let config: DedicatedConfig;
  try {
    config = { ...loadConfig(path), ...overrides };
  } catch (err) {
    error(String(err));
    process.exitCode = 1;
    return;
  }
  let host: Host | null;
  try {
    host = await startDedicated(config);
  } catch (err) {
    error(String(err));
    process.exitCode = 1;
    return;
  }
  if (!host) {
    process.exitCode = 1;
    return;
  }
  const open = host;

  const every = config.verbose
    ? 1
    : (config.statusEverySec ?? DEFAULT_STATUS_SEC);
  const ticker =
    every > 0
      ? setInterval(() => {
          status(
            `tick ${open.session.tick} — phase ${open.session.state.phase} — ` +
              `${open.session.clientCount} clients (${open.session.botClients} bots) — ` +
              `${open.session.state.enemies.length} foes — ` +
              rosterLine(open.session.roster()),
          );
        }, every * 1000)
      : null;

  let closing = false;
  const finishShutdown = (signal: string) => {
    if (ticker) clearInterval(ticker);
    info(`${signal} — closing the session`);
    void open.close("shutdown").then(() => process.exit(0));
  };

  const shutdownNow = (signal: string) => {
    if (closing) {
      process.exit(1);
      return;
    }
    closing = true;
    finishShutdown(signal);
  };

  const announceShutdown = (text: string) => {
    const message = `SERVER SHUTDOWN IN ${text}`;
    warn(message);
    open.session.announce(message);
  };

  const gracefulShutdown = () => {
    // The first Ctrl-C gives the party one minute to finish a thought and say
    // goodbye. A second means the operator really does need the process gone.
    if (closing) {
      process.exit(1);
      return;
    }
    closing = true;
    announceShutdown("1 MINUTE");
    setTimeout(() => announceShutdown("15 SECONDS"), 45_000);
    for (let seconds = 10; seconds >= 1; seconds--) {
      setTimeout(
        () => announceShutdown(`${seconds} SECOND${seconds === 1 ? "" : "S"}`),
        (60 - seconds) * 1000,
      );
    }
    setTimeout(() => finishShutdown("countdown complete"), 60_000);
  };
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", () => shutdownNow("SIGTERM"));
}
