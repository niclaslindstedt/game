#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SOAK — a fleet of BOT CLIENTS pointed at a session
// (`server/bot-client.ts`, docs/multiplayer.md).
//
// The soak's brief is "an 8-player session left running for hours, watched for
// leaks, drift and snapshot growth", with latency and loss injected at the
// transport seam and the game held playable at 150 ms / 2% loss. As written
// that needed eight machines and eight bored humans — requirements that could
// not be run. This is the instrument.
//
// Each bot is a real client: it joins over a real socket, receives real
// snapshots, and plays its hero with the same `botIntent` the simulator and the
// app drive (`server/bot-client.ts`). Nothing here simulates — that is the
// server's job, and a bot that could simulate would be proving the wrong thing.
//
//   node scripts/bot-client.mjs --address 127.0.0.1:27015
//   node scripts/bot-client.mjs --address 1.2.3.4:27015 --bots 8 --minutes 120
//   node scripts/bot-client.mjs --address 127.0.0.1:27015 --bots 8 \
//     --latency 75 --loss 0.02          # the soak's adversity figures
//
// Stand the session up first, in another terminal:
//
//   node server/main.ts --level moon --difficulty easy --port 27015 \
//     --allow-unlicensed-transport
//
// **WHAT THE READOUT MEANS.** `played` is ticks in which a bot actually decided
// and sent — a fleet whose played counts stop climbing has stopped playing,
// whatever the process list says. `tick` is the last SERVER tick a snapshot
// carried, so a stalled session shows as a number that stops moving rather than
// as silence. `rss` is this process's own memory, which is the leak watch: eight
// clients holding eight `GameState`s should settle, and a figure that climbs for
// an hour is the thing the soak exists to find.
//
// **ONE ADDRESS, ONE ALLOWANCE.** The host's connectionless limiter is keyed on
// the address rather than the address and port, so a fleet out of one machine
// shares a bucket of five refilled once a second. That is the right rule, and
// the joiner waits it out (`RATE_LIMIT_BACKOFF_MS` in `server/net/connect.ts`)
// rather than giving up — so eight bots take a few seconds to all get in, and
// the log says so as it happens.

import { register } from "node:module";

// The engine and the client both use the repo's import aliases at runtime.
register("./game-alias-loader.mjs", import.meta.url);

const { createBotClient } = await import("../server/bot-client.ts");
const { createUdpTransport } = await import("../server/net/udp.ts");
const { parseAddress } = await import("../server/wire/address.ts");
const { engineVersion } = await import("@game/core");
const { TICK_MS } = await import("../server/wire/frames.ts");

const USAGE = `
  node scripts/bot-client.mjs --address HOST:PORT [options]

    --address HOST:PORT   the session to join (required)
    --bots N              how many clients to run          (default 1)
    --name PREFIX         roster name prefix               (default AUTO)
    --password PASS       the session's password, if any
    --minutes N           stop after N minutes             (default: forever)
    --every N             status line every N seconds      (default 10)
    --strategy NAME       bot positioning strategy         (default balanced)
    --profile NAME        bot weapon-lane profile          (default meta)
    --latency MS          one-way delay added per datagram (default 0)
    --jitter MS           extra delay, drawn per datagram  (default 0)
    --loss FRACTION       datagrams dropped, 0..1          (default 0)
`;

function parseArgs(argv) {
  const out = {
    bots: 1,
    name: "AUTO",
    every: 10,
    strategy: "balanced",
    profile: "meta",
    latency: 0,
    jitter: 0,
    loss: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i] ?? "";
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = (eq < 0 ? raw.slice(2) : raw.slice(2, eq)).replace(
      /-([a-z])/g,
      (_, c) => c.toUpperCase(),
    );
    const value = eq < 0 ? argv[++i] : raw.slice(eq + 1);
    if (value === undefined) continue;
    const numeric = [
      "bots",
      "minutes",
      "every",
      "latency",
      "jitter",
      "loss",
    ].includes(key);
    out[key] = numeric ? Number(value) : value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.address || !parseAddress(args.address)) {
  process.stdout.write(USAGE);
  process.exit(args.address ? 1 : 0);
}

const target = parseAddress(args.address);
const peer = `${target.host}:${target.port}`;
const impair =
  args.latency || args.jitter || args.loss
    ? { latencyMs: args.latency, jitterMs: args.jitter, loss: args.loss }
    : undefined;

process.stdout.write(
  `== BOT SOAK — build ${engineVersion} ==\n` +
    `${args.bots} client(s) → ${peer}` +
    (impair
      ? `, ${args.latency} ms latency / ${args.jitter} ms jitter / ${(args.loss * 100).toFixed(1)}% loss`
      : "") +
    "\n",
);

const fleet = [];
for (let i = 0; i < args.bots; i++) {
  const name = `${args.name}-${i + 1}`;
  const bot = createBotClient({
    // Port 0: the OS picks. Binding a fixed one would take the port a session
    // on this very machine wants to host on.
    transport: createUdpTransport({ port: 0, maxPort: 0, impair }),
    host: peer,
    build: engineVersion,
    name,
    password: args.password,
    strategy: args.strategy,
    profile: args.profile,
    now: () => performance.now(),
    onReady: (_state, seat) =>
      process.stdout.write(`  ${name} seated at ${seat}\n`),
    onClosed: (reason, detail) =>
      process.stdout.write(
        `  ${name} left — ${reason}${detail ? ` (${detail})` : ""}\n`,
      ),
  });
  fleet.push({ name, bot });
  await bot.start();
}

// ONE CLOCK FOR THE WHOLE FLEET, at the simulation's own rate. There is no timer
// below `server/net/` by design — the session ticks, the transport is ticked —
// so a soak of eight clients costs one interval rather than eight.
const clock = setInterval(() => {
  for (const { bot } of fleet) bot.tick();
}, TICK_MS);

let lastPlayed = 0;
let lastBytes = 0;
let lastAt = performance.now();
const status = setInterval(
  () => {
    const played = fleet.reduce((sum, { bot }) => sum + bot.stats.played, 0);
    const commands = fleet.reduce(
      (sum, { bot }) => sum + bot.stats.commands,
      0,
    );
    const bytes = fleet.reduce((sum, { bot }) => sum + bot.stats.bytes, 0);
    // LIVE, not merely once-seated: a closed client keeps the seat number the
    // welcome gave it, so counting that reported eight players in a session that
    // had three — the single most misleading figure a soak can print.
    const seated = fleet.filter(({ bot }) => bot.seated && !bot.done).length;
    const tick = Math.max(0, ...fleet.map(({ bot }) => bot.stats.tick));
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const at = performance.now();
    const kbps = ((bytes - lastBytes) / 1024 / ((at - lastAt) / 1000)).toFixed(
      1,
    );
    process.stdout.write(
      `seated ${seated}/${fleet.length}  tick ${tick}  ` +
        `played ${played} (+${played - lastPlayed})  verbs ${commands}  ` +
        `in ${kbps} KB/s  rss ${rss}M  ${playing()}\n`,
    );
    // THE STALL WATCH. A fleet that is connected but no longer playing is the
    // failure this whole instrument exists to notice, and it looks exactly like
    // success from a process list.
    if (seated > 0 && played === lastPlayed) {
      process.stdout.write("  ** nothing played this interval **\n");
    }
    lastPlayed = played;
    lastBytes = bytes;
    lastAt = at;
  },
  Math.max(1, args.every) * 1000,
);

/**
 * WHETHER THE GAME IS BEING PLAYED, off the replicated state.
 *
 * `played` only says a steer was SENT — a fleet parked in a corner sending idle
 * input scores exactly as well as one clearing the level, and that is the
 * illusion an unattended run is most likely to fall for. This is the readout
 * that can tell them apart: the party's levels and health come from the
 * snapshots, and the phase says whether the run is on the field at all.
 */
function playing() {
  const live = fleet.filter(({ bot }) => bot.state && bot.seat !== null);
  if (live.length === 0) return "no run";
  const heroes = live
    .map(({ bot }) => bot.state.players[bot.seat])
    .filter(Boolean);
  if (heroes.length === 0) return "no heroes";
  const level = Math.max(...heroes.map((hero) => hero.level ?? 0));
  const hurt = heroes.filter((hero) => hero.hp < hero.maxHp).length;
  const down = heroes.filter((hero) => hero.hp <= 0).length;
  const kills = live[0].bot.state.stats?.kills ?? 0;
  const state = live[0].bot.state;
  const phase = state.phase;
  // WHY A SCREEN IS UP, not just that one is. A global `levelup` lifts only
  // when the points are placed, so the two numbers that say whether anybody
  // present still CAN place them are the difference between "somebody is
  // choosing" and "this run is over and nobody has noticed".
  const owed = state.players
    .filter((hero) => hero && hero.hp > 0 && !hero.departed)
    .reduce((sum, hero) => sum + (hero.pendingStatPoints ?? 0), 0);
  const queue = state.pendingTalentPoints?.length ?? 0;
  const held = phase === "playing" ? "" : ` [owed ${owed} talents ${queue}]`;
  return `${phase} L${level} kills ${kills} hurt ${hurt} down ${down}${held}`;
}

function stop(why) {
  clearInterval(clock);
  clearInterval(status);
  for (const { bot } of fleet) bot.close();
  process.stdout.write(`\n${why}\n`);
  const played = fleet.reduce((sum, { bot }) => sum + bot.stats.played, 0);
  const commands = fleet.reduce((sum, { bot }) => sum + bot.stats.commands, 0);
  process.stdout.write(`played ${played} ticks, sent ${commands} verbs\n`);
  process.exit(0);
}

process.on("SIGINT", () => stop("interrupted"));
if (args.minutes) {
  setTimeout(() => stop(`${args.minutes} minute(s) up`), args.minutes * 60_000);
}
