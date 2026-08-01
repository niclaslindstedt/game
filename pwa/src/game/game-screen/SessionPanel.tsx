// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HOST SCREEN'S STATUS PANEL — §2.2 of the plan, live, on the pause screen.
//
// **WHY IT IS HERE RATHER THAN ON THE TITLE MENU'S HOST SCREEN.** A session
// exists only while a run does: hosting is not a lobby you sit in, it is a game
// you started with the doors open (see `menus-net.ts`). So the rows that can
// only be answered by a running session — the port the socket ACTUALLY got, the
// address a friend should type, whether the router took a mapping, who is in
// the seats and what their ping is — are shown where that session is, which is
// in the run. The HOST screen keeps the half it can answer beforehand.
//
// **EACH ROW REPORTS ON ONE OF THE THINGS THAT CAN BLOCK AN INBOUND
// CONNECTION, AND SAYS WHICH.** Conflating them is why "open your ports" is
// folklore rather than instruction: the SOCKET, the ROUTER and the FIREWALL are
// three independent facts with three different remedies, and a player who is
// told only "not connectable" cannot act on any of them.
//
// **AND THE HONEST LIMIT IS PRINTED, NOT IMPLIED.** Reachability from the
// outside cannot be self-tested without an outside. Every row here is something
// this machine can check about itself; the only proof that the internet can
// reach you is the first joiner, and the panel says so rather than letting
// three green ticks imply a promise nothing has verified.

import { useEffect, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { sessionStatus, type SessionStatus } from "../../app/net-bridge.ts";
import type { SessionLink } from "../net/session-link.ts";

/** How often the rows are re-read. A status poll is a JSON round trip to
 * another process, and the pause screen is not a monitoring dashboard —
 * a second is far faster than any of these facts actually change. */
const POLL_MS = 1_000;

export function SessionPanel({
  font,
  link,
  onTrade,
  mySeat,
}: {
  font: PixelFont;
  /** The roster comes off the session's own frames rather than out of the
   * status poll: it changes when somebody joins, which is exactly when the
   * server sends one. */
  link: SessionLink;
  /** Open a trade with this SEAT (§5.1). Absent when this client cannot trade
   * — a spectator, or a session with nobody else seated. The press leaves the
   * pause screen behind it, so it lives with the pause overlay's wiring. */
  onTrade?: (seat: number) => void;
  /** This client's own seat — its roster row gets no TRADE button (a table
   * with yourself is refused by the engine anyway). */
  mySeat?: number | null;
}) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let live = true;
    let timer = 0;
    const poll = () => {
      void sessionStatus().then((next) => {
        if (!live) return;
        setStatus(next);
        timer = window.setTimeout(poll, POLL_MS);
      });
    };
    poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  const bound = status?.bound ?? null;
  const mapping = status?.mapping;
  const external =
    mapping?.status === "mapped" && mapping.externalAddress
      ? `${mapping.externalAddress}:${mapping.externalPort}`
      : null;

  return (
    <div className="session-panel" aria-label="session-status">
      <Row
        font={font}
        label="SESSION"
        value={`${status?.clients ?? 1} PLAYING`}
      />
      {/* THE PORT THE SOCKET GOT, never the one that was asked for. A host
          reading 27015 off a settings page while the socket sits on 27016 is
          the exact bug that makes "direct connect doesn't work"
          unanswerable. */}
      <Row
        font={font}
        label="LAN"
        value={bound ? `${bound.address}:${bound.port}` : "NOT LISTENING"}
        copy={bound ? `${bound.address}:${bound.port}` : undefined}
        copied={copied}
        onCopied={setCopied}
      />
      <Row
        font={font}
        label="INTERNET"
        // The external address comes from the ROUTER'S OWN REPLY to the mapping
        // request — never from a STUN or "what's my IP" service, because the
        // game's identity claim is that it talks to nobody.
        value={external ?? "UNKNOWN"}
        copy={external ?? undefined}
        copied={copied}
        onCopied={setCopied}
      />
      <Row font={font} label="ROUTER" value={mappingText(mapping)} />
      <PixelText
        font={font}
        text="ONLY A JOINER CAN PROVE THE INTERNET REACHES YOU"
        scale={2}
        color="#5a6068"
        align="center"
        maxWidth={24}
      />
      {link.roster.map((seat) => (
        <Row
          key={seat.slot}
          font={font}
          label={seat.name.toUpperCase()}
          value={`${seat.playing ? "PLAYING" : "WATCHING"}${
            seat.ping >= 0 ? ` - ${seat.ping} MS` : ""
          }${seat.rate > 0 ? ` - ${(seat.rate / 1024).toFixed(1)} KB/S` : ""}`}
          action={
            onTrade && seat.seat !== null && seat.seat !== mySeat
              ? { label: "TRADE", run: () => onTrade(seat.seat!) }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function Row({
  font,
  label,
  value,
  copy,
  copied,
  onCopied,
  action,
}: {
  font: PixelFont;
  label: string;
  value: string;
  copy?: string;
  copied?: string;
  onCopied?: (value: string) => void;
  /** A row's one verb — the roster rows wear TRADE here, in the copy button's
   * own slot and skin. */
  action?: { label: string; run: () => void };
}) {
  return (
    <div className="session-row">
      <PixelText font={font} text={label} scale={2} color="#9aa3ad" />
      <PixelText
        font={font}
        text={value.toUpperCase()}
        scale={2}
        color="#e6e9ef"
      />
      {copy && (
        <button
          type="button"
          className="session-copy"
          aria-label={`copy-${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(copy);
            onCopied?.(copy);
          }}
        >
          <PixelText
            font={font}
            text={copied === copy ? "COPIED" : "COPY"}
            scale={2}
            color="#7ef0c8"
          />
        </button>
      )}
      {action && (
        <button
          type="button"
          className="session-copy"
          aria-label={`${action.label.toLowerCase()}-${label.toLowerCase()}`}
          onClick={action.run}
        >
          <PixelText
            font={font}
            text={action.label}
            scale={2}
            color="#ffd75e"
          />
        </button>
      )}
    </div>
  );
}

/** The ROUTER row, worded from the mapping's own state. A refusal (UPnP off,
 * CGNAT, a double NAT) names the manual forward rather than saying "failed":
 * the player can do something about a port forward and nothing about a word. */
function mappingText(mapping: SessionStatus["mapping"] | undefined): string {
  if (!mapping || mapping.status === "idle") return "NOT ASKED";
  if (mapping.status === "mapping") return "ASKING...";
  if (mapping.status === "mapped") {
    return mapping.method === "nat-pmp" ? "MAPPED (NAT-PMP)" : "MAPPED (UPNP)";
  }
  return `FORWARD THE PORT YOURSELF - ${mapping.detail.toUpperCase()}`;
}
