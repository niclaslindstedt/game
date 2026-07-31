// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROUTER — asking it, in its own words, to forward the port.
//
// **THIS IS THE HALF THAT IS GENUINELY AUTOMATIC.** Of the three independent
// things that can block an inbound connection — the socket, the router, the OS
// firewall — this is the one that needs no permission from anybody: a mapping
// request is an ordinary packet on the LAN and most consumer routers simply
// accept it. Conflating it with the firewall is why "open your ports" is
// folklore rather than instruction, so the two live in different files and
// report on different rows.
//
// **TWO PROTOCOLS, TRIED IN THE ORDER THAT COSTS LEAST.** NAT-PMP (and its
// PCP-era successor, which speaks the same first two opcodes) is one small
// datagram to the gateway and answers in milliseconds; UPnP-IGD needs an SSDP
// multicast, an HTTP fetch of a device description and a SOAP post, and takes
// the better part of a second. So NAT-PMP is asked first and UPnP is the
// fallback — which is also the coverage order, since Apple's routers do the
// former and almost every other consumer router does the latter.
//
// **THE MAPPING'S OWN REPLY IS WHERE THE EXTERNAL ADDRESS COMES FROM, and that
// is a deliberate refusal to use a STUN server or a "what's my IP" lookup.**
// The game's identity claim is that it talks to nobody — `game.config.json`'s
// FAQ says "no sign-up, no login and no server of ours" — and a host screen
// that quietly phoned a third party to fill in one row would make that false
// for a line of text. The router already knows the answer and is on the LAN.
//
// **A LEASE, NOT A MAPPING.** Every request asks for a bounded lifetime and is
// renewed while the session runs. A permanent mapping left behind by a crashed
// game is a port open on the player's router for ever, and "released on
// shutdown" only covers the shutdowns that happen. The lease is what makes the
// leak self-heal.

import { createSocket } from "node:dgram";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";

import { localAddress } from "./udp.ts";

/** How long a mapping is asked for. Renewed at a third of it while the session
 * runs, so two renewals may be lost before anything breaks. */
export const MAPPING_LEASE_SEC = 1_200;

/** How long any one exchange with the router may take. Routers that do not
 * speak a protocol usually do not answer at all, so this is the cost of
 * discovering that — kept short because it is paid on the way to hosting. */
const NAT_PMP_TIMEOUT_MS = 700;
const SSDP_TIMEOUT_MS = 1_500;
const HTTP_TIMEOUT_MS = 2_000;

/** What the HOST screen's ROUTER row reads. */
export type MappingState =
  | { status: "idle" }
  | { status: "mapping" }
  | {
      status: "mapped";
      method: "nat-pmp" | "upnp";
      externalAddress: string | null;
      externalPort: number;
    }
  | { status: "failed"; detail: string };

export type PortMapper = {
  readonly state: MappingState;
  /** Ask for `port` to be forwarded to this machine. Never throws: a router
   * that refuses is a status row, not an exception. */
  map(port: number): Promise<MappingState>;
  /** Give the mapping back. Called on shutdown; the lease covers the crashes. */
  release(): Promise<void>;
  /** Renew if it is time. Driven from the session's clock, like everything
   * else here — see `transport.ts`'s `tick` for why nothing owns a timer. */
  renew(nowMs: number): void;
};

export function createPortMapper(): PortMapper {
  let state: MappingState = { status: "idle" };
  let mapped: { port: number; method: "nat-pmp" | "upnp" } | null = null;
  let renewAt = Infinity;

  async function attempt(port: number): Promise<MappingState> {
    const gateway = await defaultGateway();
    if (gateway) {
      const pmp = await natPmpMap(gateway, port);
      if (pmp) {
        mapped = { port, method: "nat-pmp" };
        return {
          status: "mapped",
          method: "nat-pmp",
          externalAddress: pmp.externalAddress,
          externalPort: pmp.externalPort,
        };
      }
    }
    const igd = await upnpMap(port);
    if (igd) {
      mapped = { port, method: "upnp" };
      return {
        status: "mapped",
        method: "upnp",
        externalAddress: igd.externalAddress,
        externalPort: port,
      };
    }
    return {
      status: "failed",
      // Named rather than generic, because the three causes have three
      // different remedies and the row is the only place a player will be told
      // which one they have.
      detail:
        "the router refused an automatic mapping (UPnP off, or a second NAT above it)",
    };
  }

  async function request(port: number, renewal = false): Promise<MappingState> {
    // A RENEWAL DOES NOT BLANK THE ROW. The mapping is still live while it is
    // being extended, so showing MAPPING again would flicker the ROUTER row
    // back to "working on it" every few minutes for a player who is mid-fight
    // and would read as the connection wobbling.
    if (!renewal) state = { status: "mapping" };
    state = await attempt(port);
    // Renewed at a THIRD of the lease, so two renewals may be lost before
    // anything the player can see changes.
    renewAt =
      state.status === "mapped"
        ? Date.now() + (MAPPING_LEASE_SEC * 1000) / 3
        : Infinity;
    return state;
  }

  return {
    get state() {
      return state;
    },

    map: request,

    async release() {
      const held = mapped;
      mapped = null;
      renewAt = Infinity;
      state = { status: "idle" };
      if (!held) return;
      if (held.method === "nat-pmp") {
        const gateway = await defaultGateway();
        // Lifetime 0 IS the release in NAT-PMP; there is no separate opcode.
        if (gateway) await natPmpMap(gateway, held.port, 0);
        return;
      }
      await upnpDelete(held.port);
    },

    renew(nowMs) {
      if (!mapped || nowMs < renewAt) return;
      // Pushed forward BEFORE the request, not after it: a renewal that takes
      // two seconds must not be started again on every tick in between.
      renewAt = nowMs + (MAPPING_LEASE_SEC * 1000) / 3;
      void request(mapped.port, true);
    },
  };
}

// ---------------------------------------------------------------------------
// NAT-PMP — RFC 6886, two opcodes and one datagram each
// ---------------------------------------------------------------------------

const NAT_PMP_PORT = 5351;

async function natPmpMap(
  gateway: string,
  port: number,
  lifetime = MAPPING_LEASE_SEC,
): Promise<{ externalAddress: string | null; externalPort: number } | null> {
  // Opcode 1 is UDP; 2 would be TCP. The request asks for the same external
  // port as the internal one — a router that gives a different one says so in
  // its reply, and that reply is what the HOST screen must print.
  const request = Buffer.alloc(12);
  request.writeUInt8(0, 0); // version
  request.writeUInt8(1, 1); // map UDP
  request.writeUInt16BE(0, 2); // reserved
  request.writeUInt16BE(port, 4);
  request.writeUInt16BE(port, 6);
  request.writeUInt32BE(lifetime, 8);
  const reply = await natPmpExchange(gateway, request, 16);
  if (!reply || reply.readUInt8(1) !== 129 || reply.readUInt16BE(2) !== 0) {
    return null;
  }
  const externalPort = reply.readUInt16BE(10);
  return {
    externalAddress: await natPmpExternalAddress(gateway),
    externalPort,
  };
}

async function natPmpExternalAddress(gateway: string): Promise<string | null> {
  const request = Buffer.from([0, 0]);
  const reply = await natPmpExchange(gateway, request, 12);
  if (!reply || reply.readUInt8(1) !== 128 || reply.readUInt16BE(2) !== 0) {
    return null;
  }
  return `${reply.readUInt8(8)}.${reply.readUInt8(9)}.${reply.readUInt8(10)}.${reply.readUInt8(11)}`;
}

function natPmpExchange(
  gateway: string,
  request: Buffer,
  minReply: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (reply: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed by the error that brought us here.
      }
      resolve(reply);
    };
    const timer = setTimeout(() => finish(null), NAT_PMP_TIMEOUT_MS);
    socket.on("message", (data) => {
      finish(data.byteLength >= minReply ? data : null);
    });
    socket.on("error", () => finish(null));
    socket.send(request, NAT_PMP_PORT, gateway, (err) => {
      if (err) finish(null);
    });
  });
}

// ---------------------------------------------------------------------------
// UPnP-IGD — SSDP to find it, SOAP to ask it
// ---------------------------------------------------------------------------

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;

/** The two service types a consumer IGD offers, newest first. */
const WAN_SERVICES = [
  "urn:schemas-upnp-org:service:WANIPConnection:2",
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];

/** The control URL and service type of a gateway we found. Memoized for the
 * life of the process: discovery is the slow half, and a router does not move
 * between a map and its renewal. */
let discovered: { controlUrl: string; serviceType: string } | null = null;

async function upnpMap(
  port: number,
): Promise<{ externalAddress: string | null } | null> {
  const igd = await discoverIgd();
  if (!igd) return null;
  const internal = localAddress();
  const ok = await soap(
    igd,
    "AddPortMapping",
    `<NewRemoteHost></NewRemoteHost>` +
      `<NewExternalPort>${port}</NewExternalPort>` +
      `<NewProtocol>UDP</NewProtocol>` +
      `<NewInternalPort>${port}</NewInternalPort>` +
      `<NewInternalClient>${internal}</NewInternalClient>` +
      `<NewEnabled>1</NewEnabled>` +
      `<NewPortMappingDescription>GONE IN SPACE</NewPortMappingDescription>` +
      `<NewLeaseDuration>${MAPPING_LEASE_SEC}</NewLeaseDuration>`,
  );
  if (!ok) return null;
  const address = await soap(igd, "GetExternalIPAddress", "");
  return {
    externalAddress: address
      ? (/<NewExternalIPAddress>([^<]*)</.exec(address)?.[1] ?? null)
      : null,
  };
}

async function upnpDelete(port: number): Promise<void> {
  const igd = discovered;
  if (!igd) return;
  await soap(
    igd,
    "DeletePortMapping",
    `<NewRemoteHost></NewRemoteHost>` +
      `<NewExternalPort>${port}</NewExternalPort>` +
      `<NewProtocol>UDP</NewProtocol>`,
  );
}

/** M-SEARCH for an internet gateway, then fetch its description and find the
 * control URL of whichever WAN service it offers. */
async function discoverIgd(): Promise<typeof discovered> {
  if (discovered) return discovered;
  const location = await searchSsdp();
  if (!location) return null;
  const description = await fetchText(location);
  if (!description) return null;
  for (const serviceType of WAN_SERVICES) {
    // The description is one XML document per router vendor and none of them
    // agree on whitespace, so the service block is found by its type and the
    // control URL read out of it — a full XML parse would be a dependency in
    // the ship target for one field.
    const at = description.indexOf(serviceType);
    if (at < 0) continue;
    const control = /<controlURL>([^<]*)</.exec(description.slice(at))?.[1];
    if (!control) continue;
    discovered = {
      controlUrl: new URL(control, location).toString(),
      serviceType,
    };
    return discovered;
  }
  return null;
}

function searchSsdp(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    const finish = (location: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already gone.
      }
      resolve(location);
    };
    const timer = setTimeout(() => finish(null), SSDP_TIMEOUT_MS);
    socket.on("error", () => finish(null));
    socket.on("message", (data) => {
      const text = data.toString("utf8");
      const location = /LOCATION:\s*(\S+)/i.exec(text)?.[1];
      if (location) finish(location);
    });
    const search =
      "M-SEARCH * HTTP/1.1\r\n" +
      `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      "MX: 1\r\n" +
      "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n";
    socket.send(search, SSDP_PORT, SSDP_ADDRESS, (err) => {
      if (err) finish(null);
    });
  });
}

/** One SOAP call. Returns the body on success, null on anything else — a
 * router that answers 500 with a UPnP error code inside is an ordinary
 * outcome, not an exception. */
async function soap(
  igd: { controlUrl: string; serviceType: string },
  action: string,
  args: string,
): Promise<string | null> {
  const body =
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    `<u:${action} xmlns:u="${igd.serviceType}">${args}</u:${action}>` +
    "</s:Body></s:Envelope>";
  try {
    const response = await fetch(igd.controlUrl, {
      method: "POST",
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        SOAPAction: `"${igd.serviceType}#${action}"`,
      },
      body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Finding the gateway, which Node will not tell us
// ---------------------------------------------------------------------------

/**
 * The default gateway's address, for NAT-PMP.
 *
 * Node exposes interfaces but not routes, so this reads the one place a route
 * table is a plain file (`/proc/net/route`, Linux and the Steam Deck) and
 * otherwise falls back to the first host on the local subnet.
 *
 * **THE FALLBACK IS A GUESS AND IS ALLOWED TO BE**, which is worth stating
 * because it looks like the kind of shortcut that should be a `TODO`. A wrong
 * guess costs one datagram that nothing answers and a 700 ms timeout on the
 * way to the UPnP path that does not need a gateway at all. Shelling out to
 * `netstat`/`route`/`ip` to be sure would buy a slightly faster failure at the
 * cost of spawning processes from a game's hosting path on three platforms.
 */
export async function defaultGateway(): Promise<string | null> {
  const fromProc = await linuxGateway();
  if (fromProc) return fromProc;
  const local = localAddress();
  if (local === "0.0.0.0") return null;
  const parts = local.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

async function linuxGateway(): Promise<string | null> {
  try {
    const table = await readFile("/proc/net/route", "utf8");
    for (const line of table.split("\n").slice(1)) {
      const [, destination, gateway] = line.split(/\s+/);
      // Destination 00000000 is the default route. The gateway is little-endian
      // hex, which is why it is read back four bytes at a time from the end.
      if (destination !== "00000000" || !gateway || gateway.length !== 8) {
        continue;
      }
      const value = Number.parseInt(gateway, 16);
      if (!Number.isFinite(value)) continue;
      return [0, 8, 16, 24].map((shift) => (value >>> shift) & 0xff).join(".");
    }
  } catch {
    // Not Linux, or a sandbox with no /proc. The fallback covers it.
  }
  return null;
}

/** True when this machine has a private address, i.e. is behind a NAT at all.
 * A host with a public address needs no mapping and should not be told a
 * router refused it one. */
export function behindNat(): boolean {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      if (isPrivate(entry.address)) return true;
    }
  }
  return false;
}

function isPrivate(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Carrier-grade NAT. Worth naming separately from the RFC 1918 ranges,
  // because a player on one CANNOT be mapped by any of this — there is a
  // second NAT above them that they do not administer — and the HOST screen
  // owes them that answer rather than a generic refusal.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
