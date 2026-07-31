// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE RUN'S SCREENS MAY ASK OF A SESSION — the chat log, the roster, and
// the one thing they may do to it (say something).
//
// It exists because a `RunDriver` is deliberately three methods about ADVANCING
// a run, and chat is not that: it arrives whenever somebody types, it belongs
// to the session rather than to the tick, and a spectator refused every other
// verb may still use it. So the driver hands out this, and the overlays read it
// instead of reaching for the client — which they could not do anyway, since
// the client is built asynchronously inside the port callback.
//
// **THE LOG IS APPENDED, NEVER REPLACED.** The server sends the whole backlog
// once, on arrival, and single lines after that. A consumer that treated every
// frame as the full log would show a joiner the backlog and then, one line
// later, nothing but the newest thing anybody said.
//
// **THE ROSTER IS THE OPPOSITE — it IS the whole list every time.** A roster is
// a STATE rather than a stream, and merging one would leave a player who quit
// on the party frame for ever.

import type { ChatLine, RosterEntry } from "@game/wire/protocol.ts";

/** How many lines the run keeps. A chat overlay is a corner of a game screen,
 * not a client: what is worth scrolling back through is the last minute of it,
 * and an unbounded list is a leak with a nice name. */
export const CHAT_SCROLLBACK = 60;

export type SessionLink = {
  /** Say something, or run a slash command. The parse and every decision about
   * what it may DO are the server's — see `server/wire/chat.ts` for why the
   * client is not entitled to an opinion about `/kick`. */
  say(text: string): void;
  /** The log so far, oldest first. */
  readonly lines: readonly ChatLine[];
  /** Who is in the session. Empty until the first roster lands. */
  readonly roster: readonly RosterEntry[];
  /** Be told when either changes — one callback, because both redraw the same
   * overlay and two would be two re-renders for one frame's news. */
  subscribe(listener: () => void): () => void;
  /** True for a client that only watches. The chat overlay says so, because a
   * player wondering why their steering does nothing deserves an answer that is
   * not "the game is broken". */
  readonly spectating: boolean;
};

/** The link, plus the two setters only the driver may call. */
export function createSessionLink(
  say: (text: string) => void,
  spectating: boolean,
): {
  link: SessionLink;
  receive(lines: ChatLine[]): void;
  seat(entries: RosterEntry[]): void;
} {
  let lines: ChatLine[] = [];
  let roster: RosterEntry[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    link: {
      say,
      get lines() {
        return lines;
      },
      get roster() {
        return roster;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      spectating,
    },
    receive(next) {
      lines = [...lines, ...next].slice(-CHAT_SCROLLBACK);
      changed();
    },
    seat(entries) {
      roster = entries;
      changed();
    },
  };
}
