// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THIS COPY OF THE APP MAY DO.
//
// Four of the shell's capabilities are decided when the binary is PACKAGED
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
// Three of the four can be turned on for a single launch by command line —
// `--multiplayer`, `--mods` and `--voice` — and the fourth deliberately cannot:
// a port mapping is a change this program makes to somebody's ROUTER, so it is
// a property of the build and of nothing else.
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
   * does not (`make desktop-dist`), exactly as with the other three.
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
 */
export function resolveCapabilities(
  built: BuildCapabilities,
  argv: readonly string[],
): { capabilities: Capabilities; refusals: string[] } {
  const refusals: string[] = [];

  const multiplayer = built.multiplayer || has(argv, "multiplayer");
  const mods = built.mods || has(argv, "mods");
  // VOICE NEEDS A SESSION TO TRAVEL IN — see the header. The refusal names the
  // pairing rather than the flag, because "--voice does nothing" would leave
  // somebody adding it a second time and louder.
  const voiceAsked = built.voice || has(argv, "voice");
  const voice = voiceAsked && multiplayer;
  if (voiceAsked && !multiplayer) {
    refusals.push("--voice does nothing without --multiplayer");
  }
  // A DECLARATION rather than an unlock: `--licensed` is the person starting
  // the game saying they hold the multiplayer licence. Nothing here can check
  // that and nothing pretends to — what it does is put the claim on the record
  // and let the session admit peers, which is exactly what the store build
  // does by carrying the same word in its stamp.
  const licensed = built.licensed || has(argv, "licensed");

  const portText = valueOf(argv, "port");
  const port = portText === undefined ? undefined : Number(portText);
  const portOk =
    port !== undefined && Number.isInteger(port) && port > 0 && port <= 65_535;

  let direct = false;
  let openPort: number | undefined;
  if (portText !== undefined && !multiplayer) {
    refusals.push("--port does nothing without --multiplayer");
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
  return list;
}
