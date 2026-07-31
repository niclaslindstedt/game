// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHAT ROOM — the log, and what a slash command actually DOES.
//
// Beside the session rather than inside it, for the reason every other split in
// this feature is made: the session is the authoritative simulation, and a file
// that both advances a 60 Hz world and words a help message is a file nobody
// wants to review. `wire/chat.ts` decides what a typed line MEANS; this decides
// what happens next; the session only routes.
//
// **A REPLY GOES TO ONE PERSON OR TO EVERYBODY, AND THE DIFFERENCE IS THE
// FEATURE.** `/who` and `/help` answer the person who asked — broadcasting them
// would make one player's curiosity everybody's interruption, which is exactly
// how a chat box in a game gets muted. `/players` broadcasts, because it
// changed the world the other seven are standing in and they are entitled to
// know who did it. That split is why `say` returns two lists instead of one.
//
// **THE HOST'S COMMANDS ARE THE HOST'S.** `/players`, `/kick` and `/invite`
// change the session; a spectator asking for them is told no, by name, rather
// than ignored — a command that silently does nothing is indistinguishable from
// one that is broken.

import {
  MAX_CHAT_LOG,
  parseChat,
  SLASH_HELP,
  type ParsedChat,
} from "./wire/chat.ts";
import { parsePlayerCount } from "./wire/players.ts";
import type { ChatLine, RosterEntry } from "./wire/protocol.ts";

/** Who said it. */
export type Speaker = {
  slot: number;
  name: string;
  /** True for the client that steers the hero — the host. The commands that
   * change the session are theirs. */
  isHost: boolean;
};

/** What a line turned into: what everybody hears, and what only the speaker
 * does. Either may be empty. */
export type ChatReply = {
  broadcast: ChatLine[];
  toSpeaker: ChatLine[];
};

/** What the room may ask of the session around it. */
export type ChatRoomHost = {
  /** Everyone seated, for `/who` and for the roster frame. */
  roster(): RosterEntry[];
  /** Scale the horde for a party of `n`. Returns the multiplier applied, so
   * the announcement quotes what happened rather than what was asked for. */
  setPlayers(n: number): number;
  /** Remove somebody by display name. Returns the name removed, or null when
   * nobody there is called that. */
  kick(name: string): string | null;
  /** Ask the shell for the platform's invite panel. False when this build has
   * none — a browser, a direct-IP session, a Steam client that is not running. */
  invite(): boolean;
};

export type ChatRoom = {
  /** Everything said so far, oldest first and bounded. */
  readonly log: readonly ChatLine[];
  /** One line, from one speaker. */
  say(speaker: Speaker, text: unknown): ChatReply;
  /** The session's own voice — an arrival, a departure, a refusal. */
  announce(text: string): ChatLine;
};

export function createChatRoom(host: ChatRoomHost): ChatRoom {
  const log: ChatLine[] = [];

  function remember(line: ChatLine): ChatLine {
    log.push(line);
    // Bounded because the log is re-sent WHOLE to a client that joins late: an
    // unbounded log is an unbounded packet, and the player who arrived an hour
    // in wants the last few exchanges rather than the transcript.
    while (log.length > MAX_CHAT_LOG) log.shift();
    return line;
  }

  function system(text: string): ChatLine {
    return { slot: -1, name: "", text, kind: "system" };
  }

  /** A refusal or an answer heard by one person alone. Deliberately NOT
   * remembered: a log that filled up with one player's `/help` would push the
   * conversation out of everybody else's scrollback. */
  const aside = (text: string): ChatReply => ({
    broadcast: [],
    toSpeaker: [system(text)],
  });

  function command(
    speaker: Speaker,
    parsed: ParsedChat & { kind: "command" },
  ): ChatReply {
    if (parsed.name === "help") {
      return {
        broadcast: [],
        toSpeaker: Object.values(SLASH_HELP).map(system),
      };
    }
    if (parsed.name === "who") {
      return {
        broadcast: [],
        toSpeaker: host
          .roster()
          .map((entry) =>
            system(
              `${entry.name} - ${entry.playing ? "PLAYING" : "WATCHING"}` +
                (entry.ping >= 0 ? ` - ${entry.ping} MS` : ""),
            ),
          ),
      };
    }
    if (!speaker.isHost)
      return aside(`ONLY THE HOST MAY USE /${parsed.name.toUpperCase()}`);
    if (parsed.name === "players") {
      const count = parsePlayerCount(parsed.arg);
      if (count === null) return aside("SAY HOW MANY - /PLAYERS 4");
      const factor = host.setPlayers(count);
      return {
        broadcast: [
          remember(
            system(
              `${speaker.name} SET /PLAYERS ${count} - MONSTER HEALTH AND XP ×${round(factor)}`,
            ),
          ),
        ],
        toSpeaker: [],
      };
    }
    if (parsed.name === "kick") {
      if (!parsed.arg) return aside("SAY WHO - /KICK NAME");
      const kicked = host.kick(parsed.arg);
      if (!kicked)
        return aside(`NOBODY HERE IS CALLED ${parsed.arg.toUpperCase()}`);
      return {
        broadcast: [remember(system(`${kicked} WAS REMOVED BY THE HOST`))],
        toSpeaker: [],
      };
    }
    return host.invite()
      ? aside("THE INVITE PANEL IS OPEN")
      : aside("THIS SESSION HAS NO INVITE PANEL - SHARE THE ADDRESS INSTEAD");
  }

  return {
    get log() {
      return log;
    },

    say(speaker, text) {
      const parsed = parseChat(text);
      if (parsed.kind === "empty") return { broadcast: [], toSpeaker: [] };
      if (parsed.kind === "unknown") {
        // Never said out loud: a player who mistypes `/palyers 8` must not
        // have it broadcast to seven friends.
        return aside(
          `NO SUCH COMMAND - /${parsed.name.toUpperCase()} - TRY /HELP`,
        );
      }
      if (parsed.kind === "command") return command(speaker, parsed);
      return {
        broadcast: [
          remember({
            slot: speaker.slot,
            name: speaker.name,
            text: parsed.text,
            kind: parsed.kind,
          }),
        ],
        toSpeaker: [],
      };
    },

    announce(text) {
      return remember(system(text));
    },
  };
}

/** One decimal, and no trailing `.0` — `×2.5` and `×3`, never `×2.50`. */
function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}
