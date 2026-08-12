// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THIS COPY OF THE APP MAY DO.
//
// Five of the shell's capabilities are decided when the binary is PACKAGED
// rather than when it runs, because they are not the same product everywhere:
// a depot build is sold with them, a plain download is not. The set is stamped
// into the packaged `package.json` by `electron-builder.config.cjs` (which
// reads `GIS_ENABLE_*` from the build environment), so it travels with the
// binary and is not something an installed copy can be edited into.
//
// A build with none of them stamped — a checkout, `npm run start`, anything
// built from sources without the switches — starts with NONE of them, exactly
// as a plain download does. That is deliberate: a tree somebody cloned behaves
// like the thing they would have downloaded, so "it works here" and "it works
// for a player" mean the same thing, and none of this is a path that only ever
// gets exercised on a release runner.
//
// Four of the five can be turned on for a single launch by command line —
// `--multiplayer`, `--mods`, `--voice` and `--licensed` — and `portMap`
// deliberately cannot: a port mapping is a change this program makes to
// somebody's ROUTER, so it is a property of the build and of nothing else.
//
// AND ONE CAPABILITY IS NOT A BUILD PROPERTY AT ALL: the AUTO PILOT. No desktop
// build carries it, depot build included, so there is no switch to stamp and no
// `GIS_ENABLE_*` for it — `--autopilot` is the only way it is ever on, and it
// costs the launch its multiplayer to ask (see `resolveCapabilities`).
//
// Kept free of Electron imports so the argument handling is testable without
// launching the shell runtime — the same reason `dedicated-mode.ts` is.

/** The capabilities a package is stamped with. */
export type BuildCapabilities = {
  multiplayer: boolean;
  mods: boolean;
  portMap: boolean;
  /**
   * VOICE CHAT in a session — the microphone, and other players' voices.
   *
   * Separate from `multiplayer` rather than folded into it, and the split is
   * the same one `licensed` makes: a build can honestly host sessions without
   * carrying voice, and that build should host a perfectly good silent game
   * rather than a broken noisy one. It is its own capability for three
   * reasons, each of which is a fact about the BUILD and not about the machine:
   *
   *  - **It opens a microphone.** Everything else this shell does reads the
   *    player's own disk or talks to Valve; this listens to the room they are
   *    sitting in. A capability is the honest place for that, because it means
   *    a build that was not deliberately given voice cannot ask for the
   *    permission at all — see the media handler in `main.ts`.
   *  - **The host relays every speaker to every listener**, so it is the one
   *    feature whose cost lands on somebody else's uplink.
   *  - **It is moderation surface.** Voice in a game shipped to a store is a
   *    thing the store asks about; a download nobody moderates is entitled to
   *    a different answer from a depot build.
   *
   * So the depot build carries it (`make desktop-steam`) and a plain download
   * does not (`make desktop-dist`), exactly as with the others.
   */
  voice: boolean;
  /**
   * Whether this copy holds the multiplayer licence.
   *
   * SEPARATE from `multiplayer`, and the split is the whole point: one is
   * whether the feature is here at all, the other is whether a session it
   * hosts may admit anybody over a transport Steam is not carrying. A build
   * can honestly have the first without the second — that is what a download
   * someone turned on with `--multiplayer` is — and it then hosts a session
   * nobody may join, which is the correct answer rather than a broken one.
   */
  licensed: boolean;
};

/** What this LAUNCH may do: the stamped set, plus anything the command line
 * turned on, plus the door that came with it. */
export type Capabilities = BuildCapabilities & {
  /**
   * THE AUTO PILOT — the paid ride that flies the hero for the player.
   *
   * A LAUNCH property and never a build one, which is why it sits here beside
   * `direct` rather than in `BuildCapabilities` above: no desktop build ships
   * it, so there is nothing for a packager to stamp and no switch to get wrong.
   * This is a game about playing WITH other people, and a copy that plays
   * itself is a cheat in a session — so the desktop shells simply do not offer
   * it, and `--autopilot` (a DEVELOPER switch) buys it back at the price of
   * this launch's multiplayer. A player who wants the ride wants the phone
   * edition, which is where it belongs and where it stays.
   */
  autopilot: boolean;
  /** True when the command line — rather than the package — is what turned
   * multiplayer or mods on. The launch says so out loud when it is. */
  unlocked: boolean;
  /** The direct door, and the port it was asked to try — what the session's
   * `listen` is pinned to. Only ever set by the command line; a stamped build
   * takes its door from the HOST screen. */
  direct: boolean;
  port?: number;
};

/** Everything on — what a depot build is stamped with. */
export const ALL_CAPABILITIES: BuildCapabilities = {
  multiplayer: true,
  mods: true,
  portMap: true,
  voice: true,
  licensed: true,
};

/** Nothing on. What an unstamped build is, and what a download is. */
export const NO_CAPABILITIES: BuildCapabilities = {
  multiplayer: false,
  mods: false,
  portMap: false,
  voice: false,
  licensed: false,
};

/**
 * The stamp, off the app's own manifest.
 *
 * NO stamp means nothing is on: a build only carries what something
 * deliberately gave it, so the narrow case is the one that happens by default
 * and the wide one has to be asked for. Within a stamp an absent field reads
 * the same way — only an explicit `true` turns anything on.
 */
export function readBuildCapabilities(metadata: unknown): BuildCapabilities {
  const stamped = (metadata as { capabilities?: unknown } | null)
    ?.capabilities as Partial<Record<keyof BuildCapabilities, unknown>> | null;
  if (!stamped || typeof stamped !== "object") return { ...NO_CAPABILITIES };
  return {
    multiplayer: stamped.multiplayer === true,
    mods: stamped.mods === true,
    portMap: stamped.portMap === true,
    voice: stamped.voice === true,
    licensed: stamped.licensed === true,
  };
}

/**
 * Whether this manifest was stamped at all.
 *
 * An unstamped app is a DEVELOPER BUILD by definition: nothing packaged it for
 * a store or for distribution, so it is somebody's own tree — the checkout the
 * shell is run from, or a `dist` made without the switches. It is a separate
 * question from what the build MAY do (an unstamped build may do everything),
 * and it is what the startup notice is keyed on.
 */
export function isStamped(metadata: unknown): boolean {
  const stamped = (metadata as { capabilities?: unknown } | null)?.capabilities;
  return !!stamped && typeof stamped === "object";
}

/** `--flag=value` and `--flag value`, for the one option that takes one. */
function valueOf(argv: readonly string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === `--${name}`) return argv[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}

function has(argv: readonly string[], name: string): boolean {
  return argv.some(
    (arg) => arg === `--${name}` || arg.startsWith(`--${name}=`),
  );
}

/**
 * What this launch may do.
 *
 * `--multiplayer` and `--mods` each stand alone. `--port` is a REFINEMENT
 * rather than a requirement: hosting from the menu has a port on the HOST
 * screen already, so naming one here only pins the direct door to it. The one
 * place it is not optional is `--dedicated`, which has no screen to read a
 * port off — that pairing is checked where the mode is entered.
 *
 * `--voice` is the one switch that DOES depend on another, and it is refused
 * rather than silently ignored when it stands alone: voice travels inside a
 * session (`FRAME.voice`, forwarded by the session server to the other seats),
 * so on a build that cannot host or join one there is nothing for a microphone
 * to talk into. Turning it on there would grant the media permission, put a
 * VOICE CHAT page in the settings, and then never carry a syllable — which
 * reads as a broken feature rather than as an absent one.
 *
 * `--autopilot` is the one switch that TAKES something away, and it takes the
 * biggest thing there is: multiplayer, with its voice and its licence, whether
 * they came from the stamp or from this same command line. A copy that plays
 * itself has no business in somebody else's session, and the honest way to say
 * so is to make the two mutually exclusive at the door rather than to let a
 * session start and then argue about it. The line is pushed on EVERY such
 * launch — not only where something was actually switched off — because what it
 * states is the CONSEQUENCE, and a developer who reads it once is a developer
 * who does not file the missing HOST row as a bug.
 */
export function resolveCapabilities(
  built: BuildCapabilities,
  argv: readonly string[],
): { capabilities: Capabilities; refusals: string[] } {
  const refusals: string[] = [];

  // THE AUTO PILOT COSTS THIS LAUNCH ITS MULTIPLAYER — see the header. Resolved
  // first, because everything below reads the multiplayer it decides.
  const autopilot = has(argv, "autopilot");
  if (autopilot) {
    refusals.push(
      "--autopilot is a developer switch: multiplayer is off for this launch",
    );
  }

  const multiplayer =
    !autopilot && (built.multiplayer || has(argv, "multiplayer"));
  const mods = built.mods || has(argv, "mods");
  // VOICE NEEDS A SESSION TO TRAVEL IN — see the header. The refusal names the
  // pairing rather than the flag, because "--voice does nothing" would leave
  // somebody adding it a second time and louder.
  // …and every refusal below is silent on an autopilot launch: the line above
  // already named the cause, and a second one blaming the flag the developer
  // did not type reads as a bug in the parser.
  const voiceAsked = built.voice || has(argv, "voice");
  const voice = voiceAsked && multiplayer;
  if (voiceAsked && !multiplayer && !autopilot) {
    refusals.push("--voice does nothing without --multiplayer");
  }
  // A DECLARATION rather than an unlock: `--licensed` is the person starting
  // the game saying they hold the multiplayer licence. Nothing here can check
  // that and nothing pretends to — what it does is put the claim on the record
  // and let the session admit peers, which is exactly what the store build
  // does by carrying the same word in its stamp. It is a claim about a session
  // this launch may no longer open at all once the autopilot has it, so it
  // goes down with the rest of multiplayer rather than sitting on the record
  // for a feature that is not there.
  const licensed = !autopilot && (built.licensed || has(argv, "licensed"));

  const portText = valueOf(argv, "port");
  const port = portText === undefined ? undefined : Number(portText);
  const portOk =
    port !== undefined && Number.isInteger(port) && port > 0 && port <= 65_535;

  let direct = false;
  let openPort: number | undefined;
  if (portText !== undefined && !multiplayer) {
    if (!autopilot) refusals.push("--port does nothing without --multiplayer");
  } else if (portText !== undefined && !portOk) {
    refusals.push(`--port ${portText} is not a port number`);
  } else if (portOk) {
    direct = true;
    openPort = port;
  }

  return {
    capabilities: {
      multiplayer,
      mods,
      portMap: built.portMap,
      voice,
      licensed,
      autopilot,
      unlocked:
        (multiplayer && !built.multiplayer) ||
        (mods && !built.mods) ||
        (voice && !built.voice),
      direct,
      port: openPort,
    },
    refusals,
  };
}

/** The list the preload hands the page, so the menus offer only what this
 * launch can honour. Kept to plain names — the page has no business knowing
 * WHY it may host, only whether it may. */
export function capabilityList(capabilities: Capabilities): string[] {
  const list: string[] = [];
  if (capabilities.multiplayer) list.push("multiplayer");
  if (capabilities.mods) list.push("mods");
  // VOICE reaches the page for the same reason the other two do: the settings
  // tree has to be built right the FIRST time it is drawn. A VOICE CHAT page
  // that appears and then vanishes a round trip later is worse than one that
  // was never offered — and this list is on the preload's command line, so the
  // menus know before anything has been asked.
  if (capabilities.voice) list.push("voice");
  // THE AUTO PILOT is in the list for the same reason and reads the same way,
  // with one thing worth knowing about the direction it fails in. Every other
  // name here WIDENS what the page offers, and `shellCapability` answers TRUE
  // where no list is published — so this entry is what a desktop launch uses to
  // opt back IN to a feature the browser and the phone have had all along, and
  // its absence from a published list is what withholds it. That is exactly
  // right: nothing else in the game should learn that a shell can take a
  // feature away, and nothing had to (`pwa/src/app/launch-options.ts`).
  if (capabilities.autopilot) list.push("autopilot");
  return list;
}

/**
 * The argument the window's preload is started with when `unlocked` is true —
 * i.e. when this launch's COMMAND LINE, rather than its packaging, is what
 * turned multiplayer, mods or voice on.
 *
 * It travels beside the capability list and not inside it, because it is not a
 * capability: the list answers "may the game offer this", and an entry that
 * meant "and it was switched on by hand" would be read by `shellCapability`
 * like every other name — which answers TRUE where nothing publishes a list at
 * all, i.e. in every browser. This is a fact only a shell can assert, so its
 * absence must mean no (`pwa/src/app/launch-options.ts`).
 *
 * The preload mirrors the literal because a sandboxed preload may not require
 * local modules; `preload_test.ts` keeps the two copies in step.
 */
export const UNLOCKED_ARG = "--gis-unlocked";

/**
 * The argument the window's preload is started with when `--autopilot` was
 * given — the second fact the game has to state before it shows anybody a menu.
 *
 * It is beside the capability list rather than inside it for the reason
 * `UNLOCKED_ARG` is: the list FAILS OPEN (a browser publishes none and may do
 * everything), and a notice keyed on an absent list would greet every player on
 * the web with a warning about a switch they could not have typed. So the fact
 * is asserted, and its absence means no.
 *
 * Mirrored in the preload for the same reason as `UNLOCKED_ARG`, and kept in
 * step by the same test.
 */
export const AUTOPILOT_ARG = "--gis-autopilot";
