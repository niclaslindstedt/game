// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE THREE DOORS — HOST GAME, the browser, and JOIN BY ADDRESS.
//
// The shape and the wording are `content/mainmenu.yaml`'s, like every other
// screen; what a row DOES is here. Steam builds only — `netOpen` is false in a
// browser and on a phone, and the front-door row is then absent rather than
// dead (a phone has no listening socket and a tab is not a server).
//
// **WHAT THE HOST SCREEN IS, AND WHAT IT DELIBERATELY IS NOT.** It is the
// SESSION's settings — who may come in, how many, on what — and it is not a
// lobby. A hosted game IS a run: pressing START walks into the same difficulty
// and mission pickers every other run uses, the run begins, and the doors open
// with it. The alternative (a lobby that waits for players before anybody is
// playing) would mean a second, idle simulation standing on the map while the
// host reads a list, and it would make the host's own renderer a client of a
// session it did not build — which is phase 3's cutover, not this one's.
//
// The LIVE status — the address the socket actually got, the router, the seats
// taken, the ping of each — is therefore shown IN the run, on the pause screen's
// SESSION panel, because that is where a session exists. This screen shows the
// one thing it can honestly answer beforehand: whether the OS firewall would
// let an inbound packet through, which is a property of the machine rather than
// of any session.
//
// **NOTHING HERE MAY IMPORT `pwa/src/game/net/`** — see the header of
// use-sessions.ts for the budget this would break.

import { REFUSAL_TEXT } from "@game/wire/protocol.ts";

import { formatAddress, parseAddress } from "@game/wire/address.ts";
import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import { armHosting } from "../session-intent.ts";
import {
  DEFAULT_SESSION_PORT,
  MAX_SESSION_PASSWORD,
  MAX_SESSION_PLAYERS,
  type SessionDoors,
} from "../settings.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  sliderRow,
  type MenuContext,
  type MenuEntry,
  type NetMenuState,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

/** The doors, in the order the row cycles them. BOTH leads because it is what a
 * host should almost always want: Steam friends get the frictionless path and
 * everybody else gets an address. */
const DOORS: SessionDoors[] = ["both", "steam", "direct"];

export function buildMultiplayerMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("multiplayer", {
      "host-game": navRow(ctx, "multiplayer", "host-game"),
      "join-game": navRow(ctx, "multiplayer", "join-game"),
      "join-address": navRow(ctx, "multiplayer", "join-address"),
    }),
    backRow(ctx, "multiplayer"),
  ];
}

export function buildHostMenu(
  ctx: MenuContext,
  net: NetMenuState,
): MenuEntry[] {
  const session = net.session;
  const direct = session.doors !== "steam";
  return [
    ...assembleRows("host", {
      doors: {
        ...actionRow(
          "host",
          "doors",
          () => {
            playUiSound(synth, "confirm");
            const at = DOORS.indexOf(session.doors);
            net.setSession({ doors: DOORS[(at + 1) % DOORS.length] });
          },
          { state: session.doors },
        ),
        value: doorLabel(session.doors),
      },
      // A slider rather than a cycled value: eight seats is a range, and the
      // number IS the readout — the same reason the volume rows carry their
      // percentage in the label.
      "max-players": sliderRow("host", "max-players", {
        readout: `${session.maxPlayers}`,
        pos: (session.maxPlayers - 2) / (MAX_SESSION_PLAYERS - 2),
        set: (pos) => net.setSession({ maxPlayers: seatsAt(pos) }),
        nudge: (dir) =>
          net.setSession({
            maxPlayers: clampSeats(session.maxPlayers + Math.sign(dir)),
          }),
      }),
      // A label-cycling row rather than a switch: FREE FOR ALL and ALLOCATED
      // are two modes, not an on and an off, and a switch would imply that one
      // of them is the feature being disabled.
      loot: {
        ...actionRow(
          "host",
          "loot",
          () => {
            playUiSound(synth, "confirm");
            net.setSession({
              loot: session.loot === "allocated" ? "free" : "allocated",
            });
          },
          { state: session.loot },
        ),
        value: session.loot === "allocated" ? "ALLOCATED" : "FREE FOR ALL",
      },
      password: {
        ...actionRow(
          "host",
          "password",
          () => {
            playUiSound(synth, "confirm");
            ctx.prompt({
              title: "SESSION PASSWORD",
              value: session.password,
              placeholder: "NO PASSWORD",
              maxLength: MAX_SESSION_PASSWORD,
              onSubmit: (text) => net.setSession({ password: text.trim() }),
            });
          },
          { state: session.password ? "set" : "none" },
        ),
        value: session.password ? "SET" : "NONE",
      },
      port: {
        ...actionRow(
          "host",
          "port",
          () => {
            if (!direct) {
              playUiSound(synth, "back");
              return;
            }
            playUiSound(synth, "confirm");
            ctx.prompt({
              title: "PORT",
              value: `${session.port}`,
              placeholder: `${DEFAULT_SESSION_PORT}`,
              maxLength: 5,
              digits: true,
              onSubmit: (text) => {
                const port = Number.parseInt(text, 10);
                net.setSession({
                  port:
                    Number.isFinite(port) && port >= 1 && port <= 65535
                      ? port
                      : DEFAULT_SESSION_PORT,
                });
              },
            });
          },
          {
            state: direct ? "direct" : "steam",
            locked: !direct,
            color: direct ? undefined : "#5a6068",
          },
        ),
        value: `${session.port}`,
      },
      firewall: firewallRow(net, direct),
      start: actionRow("host", "start", () => {
        playUiSound(synth, "start");
        // ARMED, then the ordinary flow. The doors open when the RUN starts,
        // because that is when there is a session to open them on — see
        // `takeHostIntent` in run-driver.ts.
        armHosting(net.hostIntent());
        if (!ctx.character) {
          // No hero picked yet: the roster comes first, exactly as NEW GAME
          // does it. The arm survives the detour — it is consumed by the run,
          // not by the screen.
          ctx.onLoadGame();
          return;
        }
        ctx.setScreen("difficulty");
        ctx.setCursor(0);
      }),
    }),
    backRow(ctx, "host"),
  ];
}

/**
 * The FIREWALL row: one check, and one press to fix what it found.
 *
 * Three rules from the plan's §2.3, all visible here. It never elevates at
 * launch or without being asked (the press is the ask, and the row is inert
 * when there is nothing to fix). It reports the VERIFICATION rather than the
 * command's exit code — a green "opened" that is not open sends the player
 * looking in the wrong place. And it always leaves the manual path: a machine
 * locked down by an administrator who is not the player must read as "here is
 * what to ask for" rather than as a dead end, so the exact command is the row's
 * own help line.
 */
function firewallRow(net: NetMenuState, direct: boolean): MenuEntry {
  const state = net.firewall;
  if (!direct) {
    return actionRow("host", "firewall", () => {}, {
      help: "NOT USED WHILE ONLY STEAM FRIENDS CAN JOIN",
      locked: true,
      color: "#5a6068",
    });
  }
  if (!state) {
    return {
      ...actionRow("host", "firewall", () => {}, {
        help: "CHECKING THIS MACHINE...",
        locked: true,
        color: "#5a6068",
      }),
      value: "...",
    };
  }
  if (state.status === "allowed" || state.status === "not-needed") {
    return {
      ...actionRow("host", "firewall", () => {}, {
        help:
          state.status === "allowed"
            ? "THIS MACHINE LETS THE GAME LISTEN"
            : state.detail.toUpperCase(),
        locked: true,
      }),
      value: state.status === "allowed" ? "ALLOWED" : "NOT NEEDED",
    };
  }
  const manual = state.status === "blocked" ? state.manual : state.manual;
  return {
    ...actionRow(
      "host",
      "firewall",
      () => {
        playUiSound(synth, "confirm");
        net.allowFirewall();
      },
      {
        // The exact command, copyable off the screen. It is deliberately the
        // help line rather than a hidden detail: the press may not be available
        // on a locked-down machine, and then this line is the whole answer.
        help: manual
          ? manual.toUpperCase()
          : "PRESS TO ASK THIS MACHINE TO LET THE GAME LISTEN",
        color: "#ffd75e",
      },
    ),
    value: state.status === "blocked" ? "BLOCKED" : "UNKNOWN",
  };
}

/**
 * THE BROWSER — every session this Steam account can see.
 *
 * **A ROW THIS BUILD CANNOT JOIN IS SHOWN, NOT HIDDEN**, and that is the
 * screen's one load-bearing rule. A player whose friend is on a newer build and
 * whose list is simply empty concludes the feature is broken; one who sees the
 * session greyed with the reason goes and updates. So the filtering happens on
 * the LABEL, never on the list.
 */
export function buildSessionsMenu(
  ctx: MenuContext,
  net: NetMenuState,
): MenuEntry[] {
  const rows = net.rows;
  return [
    ...(rows ?? []).map((row) => sessionRow(ctx, net, row)),
    ...assembleRows("sessions", {
      searching: rows === null ? inert("sessions", "searching") : null,
      empty:
        rows !== null && rows.length === 0 ? inert("sessions", "empty") : null,
      refresh: actionRow("sessions", "refresh", () => {
        playUiSound(synth, "confirm");
        net.refresh();
      }),
    }),
    backRow(ctx, "sessions"),
  ];
}

function sessionRow(
  ctx: MenuContext,
  net: NetMenuState,
  row: NonNullable<NetMenuState["rows"]>[number],
): MenuEntry {
  const refusal = net.refusalFor(row);
  const full = row.players >= row.maxPlayers;
  const blocked = refusal !== null || full;
  return {
    label: row.name.toUpperCase(),
    aria: rowAria("sessions", `session-${row.id}`),
    // WHO is hosting, WHERE they are, and HOW FULL — the three things that
    // decide whether this is the row you meant, read off the lobby's own
    // metadata rather than off a connection nobody has made yet.
    subtitle: `${row.host.toUpperCase()} - ${row.level.toUpperCase()} - ${row.difficulty.toUpperCase()} - ${row.players}/${row.maxPlayers}`,
    blurb: blocked
      ? (refusal ?? REFUSAL_TEXT["session-full"])
      : row.needsPassword
        ? "THIS GAME HAS A PASSWORD"
        : undefined,
    color: blocked ? "#5a6068" : undefined,
    locked: blocked,
    action: () => {
      if (blocked) {
        playUiSound(synth, "back");
        return;
      }
      playUiSound(synth, "start");
      if (!row.needsPassword) {
        net.joinRow(row);
        return;
      }
      ctx.prompt({
        title: "PASSWORD",
        value: "",
        placeholder: "PASSWORD",
        maxLength: MAX_SESSION_PASSWORD,
        onSubmit: (text) => net.joinRow(row, text.trim()),
      });
    },
  };
}

/**
 * JOIN BY ADDRESS — the typed door, and the list of doors already walked
 * through.
 *
 * The field is validated BEFORE anything is sent (`parseAddress`, the wire's
 * own parser, so the two ends can never disagree about what an address is): a
 * text box that accepts nonsense and reports "could not connect" ten seconds
 * later is the worst possible answer.
 */
export function buildAddressMenu(
  ctx: MenuContext,
  net: NetMenuState,
): MenuEntry[] {
  const recent = net.session.recent;
  const ask = () => {
    playUiSound(synth, "confirm");
    ctx.prompt({
      title: "JOIN BY ADDRESS",
      value: "",
      placeholder: "HOST:PORT",
      maxLength: 64,
      // Refuse it in the field rather than at the far end: the parser is the
      // wire's, so what this accepts is exactly what a socket will be given.
      validate: (text) => parseAddress(text) !== null,
      onSubmit: (text) => {
        const parsed = parseAddress(text);
        if (parsed) net.joinAddress(formatAddress(parsed.host, parsed.port));
      },
    });
  };
  return [
    ...assembleRows("address", {
      enter: actionRow("address", "enter", ask),
      empty: recent.length === 0 ? inert("address", "empty") : null,
    }),
    ...recent.map((address) => ({
      label: address.toUpperCase(),
      aria: rowAria("address", `recent-${address}`),
      blurb: "PRESS TO JOIN AGAIN",
      action: () => {
        playUiSound(synth, "start");
        net.joinAddress(address);
      },
    })),
    backRow(ctx, "address"),
  ];
}

/** A row that is there to say something, not to be pressed. */
function inert(screen: "sessions" | "address", id: string): MenuEntry {
  return actionRow(screen, id, () => {}, { color: "#5a6068", locked: true });
}

function doorLabel(doors: SessionDoors): string {
  if (doors === "steam") return "STEAM";
  if (doors === "direct") return "ADDRESS";
  return "BOTH";
}

function clampSeats(seats: number): number {
  return Math.max(2, Math.min(MAX_SESSION_PLAYERS, Math.round(seats)));
}

function seatsAt(pos: number): number {
  return clampSeats(2 + pos * (MAX_SESSION_PLAYERS - 2));
}
