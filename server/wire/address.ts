// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A PLAYER MAY TYPE INTO "JOIN BY ADDRESS", parsed once.
//
// In the wire rather than in the shell because BOTH ends need it and neither
// may guess: the JOIN screen validates the field before it sends anything (a
// text box that accepts nonsense and reports "could not connect" ten seconds
// later is the worst possible answer), and the server parses the same forms out
// of a config file and a `--connect` launch argument. Two parsers would drift
// on the day somebody types an IPv6 address, which is exactly the day nobody is
// testing.
//
// **THE DEFAULT PORT IS 27015 AND THE BOUND PORT IS NOT.** This module only
// resolves what was TYPED; what a host actually got is a separate fact that
// travels separately, and conflating them is the exact bug that makes "direct
// connect doesn't work" unanswerable — a host reads 27015 off a settings page,
// a joiner types 27015, and the socket is on 27016 because 27015 was busy.
// See `server/net/udp.ts`, which is the one thing entitled to say where a
// socket ended up.

/**
 * The conventional port, and the reason it is this one: 27015 sits in Steam's
 * own game-port range, so a player who has already forwarded ports for another
 * game very likely has it open.
 */
export const DEFAULT_PORT = 27015;

/** The last port the walk will try before giving up. Sixteen candidates is
 * more than any one machine has copies of this game running. */
export const MAX_PORT = 27030;

export type ParsedAddress = {
  /** The host as typed, brackets stripped: an IPv4 literal, an IPv6 literal,
   * or a name to resolve. Resolution is the socket's job, not this one's. */
  host: string;
  port: number;
  /** True when the port came from the text rather than from the default. The
   * JOIN screen shows the resolved address back to the player, and "I typed a
   * port and it used another" must never be something they discover later. */
  explicitPort: boolean;
};

/**
 * Read one typed address, or null when it is not one.
 *
 * The four forms a player actually types, and nothing clever beyond them:
 *
 *   `1.2.3.4`            IPv4, default port
 *   `1.2.3.4:27016`      IPv4 with a port
 *   `[::1]:27016`        IPv6 must be bracketed when a port follows, because
 *                        an unbracketed `::1:27016` is a valid IPv6 address
 *                        and there is no way to tell which was meant
 *   `host.example.com`   a name, with or without a port
 *
 * A bare unbracketed IPv6 literal is accepted with the default port, since
 * there is no colon ambiguity when nothing follows.
 */
export function parseAddress(raw: unknown): ParsedAddress | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    if (close < 0) return null;
    const host = text.slice(1, close);
    if (!host) return null;
    const rest = text.slice(close + 1);
    if (!rest) return { host, port: DEFAULT_PORT, explicitPort: false };
    if (!rest.startsWith(":")) return null;
    const port = readPort(rest.slice(1));
    return port === null ? null : { host, port, explicitPort: true };
  }

  const colons = text.split(":").length - 1;
  if (colons > 1) {
    // More than one colon and no brackets: the only thing this can be is a
    // bare IPv6 literal. Anything else is a typo, and guessing at one is how a
    // parser starts accepting addresses nobody meant.
    return isProbablyIpv6(text)
      ? { host: text, port: DEFAULT_PORT, explicitPort: false }
      : null;
  }
  if (colons === 1) {
    const at = text.lastIndexOf(":");
    const host = text.slice(0, at);
    const port = readPort(text.slice(at + 1));
    if (!host || port === null) return null;
    return { host, port, explicitPort: true };
  }
  if (!isPlausibleHost(text)) return null;
  return { host: text, port: DEFAULT_PORT, explicitPort: false };
}

/** The canonical text for an address — what a COPY button puts on the
 * clipboard, and what the two ends must agree a session is called. */
export function formatAddress(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

function readPort(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number.parseInt(text, 10);
  // Port 0 means "any free port" to a socket, which is a legitimate thing to
  // BIND and never a legitimate thing to CONNECT to.
  return port >= 1 && port <= 65535 ? port : null;
}

/** An IPv6 literal, loosely: hex groups, colons, and at most one `::`. The
 * socket does the real validation; this only has to be sure enough that the
 * colons were an address rather than a mistyped port. */
function isProbablyIpv6(text: string): boolean {
  if (!/^[0-9a-fA-F:]+(\.[0-9]{1,3}){0,3}$/.test(text)) return false;
  return text.split("::").length <= 2;
}

/** A hostname or IPv4 literal, loosely. Loose on purpose: the socket does the
 * real resolution, and this is here to reject the empty string and the obvious
 * paste of a whole URL, not to re-implement RFC 1123. */
function isPlausibleHost(text: string): boolean {
  return /^[0-9a-zA-Z._-]+$/.test(text);
}
