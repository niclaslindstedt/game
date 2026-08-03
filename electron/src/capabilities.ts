// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THIS COPY OF THE APP MAY DO.
//
// Three of the shell's capabilities are decided when the binary is PACKAGED
// rather than when it runs, because they are not the same product everywhere:
// a depot build is sold with them, a plain download is not. The set is stamped
// into the packaged `package.json` by `electron-builder.config.cjs` (which
// reads `GIS_ENABLE_*` from the build environment), so it travels with the
// binary and is not something an installed copy can be edited into.
//
// A build with none of them stamped — a checkout, `npm run start`, anything
// built from sources without the switches — gets ALL of them. The repo is the
// whole game; nothing here is a crippled tree.
//
// Two of the three can additionally be turned on for a single launch by
// command line, and the third deliberately cannot: a port mapping is a change
// this program makes to somebody's ROUTER, so it is a property of the build
// and of nothing else.
//
// Kept free of Electron imports so the argument handling is testable without
// launching the shell runtime — the same reason `dedicated-mode.ts` is.

/** The three capabilities a package is stamped with. */
export type BuildCapabilities = {
  multiplayer: boolean;
  mods: boolean;
  portMap: boolean;
};

/** What this LAUNCH may do: the stamped set, plus anything the command line
 * turned on, plus the door that came with it. */
export type Capabilities = BuildCapabilities & {
  /** True when the command line — rather than the package — is what turned
   * multiplayer or mods on. The launch says so out loud when it is. */
  unlocked: boolean;
  /** The direct door, and the port it was asked to try. Only ever set by the
   * command line; a stamped build takes its door from the HOST screen. */
  udp: boolean;
  port?: number;
};

/** Everything on. What a build from sources is, and what the resolver falls
 * back to when a package carries no stamp at all. */
export const ALL_CAPABILITIES: BuildCapabilities = {
  multiplayer: true,
  mods: true,
  portMap: true,
};

/**
 * The stamp, off the app's own manifest.
 *
 * An ABSENT field means "not stamped" and reads as on; only an explicit
 * `false` turns something off. That ordering matters: it is what keeps every
 * unpackaged path — the tests, `electron .`, a developer's own build — working
 * with no environment at all.
 */
export function readBuildCapabilities(metadata: unknown): BuildCapabilities {
  const stamped = (metadata as { capabilities?: unknown } | null)
    ?.capabilities as Partial<Record<keyof BuildCapabilities, unknown>> | null;
  if (!stamped || typeof stamped !== "object") return { ...ALL_CAPABILITIES };
  return {
    multiplayer: stamped.multiplayer !== false,
    mods: stamped.mods !== false,
    portMap: stamped.portMap !== false,
  };
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
 * **THE THREE MULTIPLAYER OPTIONS ARE ONE OPTION.** A build that was not
 * stamped with multiplayer takes `--multiplayer --udp --port <n>` TOGETHER or
 * not at all, and the reason is that the parts are meaningless apart: with no
 * Steam client behind it the direct socket is the only door there is, and a
 * door needs a number. A partial set is therefore refused rather than
 * half-honoured — `refusals` says which part was missing, so a launch that
 * looked accepted and did nothing is not a thing that can happen.
 */
export function resolveCapabilities(
  built: BuildCapabilities,
  argv: readonly string[],
): { capabilities: Capabilities; refusals: string[] } {
  const refusals: string[] = [];

  const wantsNet = has(argv, "multiplayer");
  const wantsUdp = has(argv, "udp");
  const portText = valueOf(argv, "port");
  const port = portText === undefined ? undefined : Number(portText);
  const portOk =
    port !== undefined && Number.isInteger(port) && port > 0 && port <= 65_535;

  let multiplayer = built.multiplayer;
  let udp = false;
  let openPort: number | undefined;

  if (wantsNet && !built.multiplayer) {
    if (!wantsUdp) refusals.push("--multiplayer needs --udp");
    if (portText === undefined) refusals.push("--multiplayer needs --port");
    else if (!portOk) refusals.push(`--port ${portText} is not a port number`);
    if (wantsUdp && portOk) {
      multiplayer = true;
      udp = true;
      openPort = port;
    }
  } else if (built.multiplayer && wantsUdp && portOk) {
    // A stamped build may still be pointed at a door from the command line.
    udp = true;
    openPort = port;
  } else if (!wantsNet && (wantsUdp || portText !== undefined)) {
    refusals.push("--udp and --port do nothing without --multiplayer");
  }

  const wantsMods = has(argv, "mods");
  const mods = built.mods || wantsMods;

  return {
    capabilities: {
      multiplayer,
      mods,
      portMap: built.portMap,
      unlocked: (multiplayer && !built.multiplayer) || (mods && !built.mods),
      udp,
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
  return list;
}
