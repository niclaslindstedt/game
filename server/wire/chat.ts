// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CHAT, AND THE SLASH COMMANDS THAT RIDE IT — a pure parser and nothing else.
//
// Chat is small, and it shipped with the wire itself rather than waiting for
// the rest of the party features because it is what
// makes a spectator session feel like a game rather than a stream: eight people
// watching a hardcore run in silence are eight people watching a video.
//
// **A SLASH COMMAND IS A CLOSED LIST, exactly as `COMMANDS` is**, and for the
// same reason. What arrives is a line of text a stranger typed; what may come
// out of it is one of six names. A parser that handed the session an arbitrary
// verb would be the command channel's careful allow-list undone by the chat
// box next to it — which is precisely how this class of hole gets opened, one
// convenience at a time.
//
// **THE PARSE IS SEPARATE FROM THE ACT.** This module decides what a line MEANS
// and never what it DOES: it does not know who may kick, whether a session has
// eight seats, or what `/players 4` costs the horde. That lives in the session,
// which is the only thing entitled to an opinion — and it is what lets the
// whole grammar be tested without a running game behind it.

/** The longest line the session will carry. Long enough for a sentence, short
 * enough that a chat box cannot be used as a bulk channel into seven other
 * machines. */
export const MAX_CHAT_CHARS = 160;

/**
 * How many lines the session remembers.
 *
 * A bound rather than a scrollback preference: the log is re-sent whole to a
 * client that joins late, so an unbounded one is an unbounded packet — and the
 * player who joined an hour into a session wants the last few exchanges, not
 * the transcript.
 */
export const MAX_CHAT_LOG = 64;

/**
 * THE COMMANDS A CHAT LINE MAY NAME.
 *
 * `players` scales the horde, `who` prints the roster, `kick` and `invite` are
 * the host's, `help` lists these, and `me` is an emote — which is here rather
 * than treated as ordinary text because "/me" typed by somebody expecting an
 * emote and printed literally is the oldest small disappointment in chat.
 */
export const SLASH_COMMANDS = [
  "players",
  "who",
  "kick",
  "invite",
  "help",
  "me",
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];

/** What a typed line turned out to be. */
export type ParsedChat =
  | { kind: "say"; text: string }
  | { kind: "emote"; text: string }
  | { kind: "command"; name: Exclude<SlashCommand, "me">; arg: string }
  | { kind: "unknown"; name: string }
  | { kind: "empty" };

/**
 * Read one typed line.
 *
 * Never throws and never returns something the session has to re-validate: the
 * text is already trimmed and capped, the command name is already known to be
 * in the list, and an unrecognised slash is its own answer rather than being
 * silently said out loud — a player who mistypes `/palyers 8` must not have it
 * broadcast to seven friends.
 */
export function parseChat(raw: unknown): ParsedChat {
  if (typeof raw !== "string") return { kind: "empty" };
  const text = raw.replace(/\p{Cc}/gu, " ").trim();
  if (!text) return { kind: "empty" };
  if (!text.startsWith("/")) {
    return { kind: "say", text: text.slice(0, MAX_CHAT_CHARS) };
  }
  // A lone "/" is a typo, not a command with an empty name.
  const body = text.slice(1);
  const space = body.indexOf(" ");
  const name = (space < 0 ? body : body.slice(0, space)).toLowerCase();
  const arg = (space < 0 ? "" : body.slice(space + 1)).trim();
  if (!isSlashCommand(name))
    return { kind: "unknown", name: name.slice(0, 24) };
  if (name === "me") {
    // An empty `/me` is nothing to emote, so it falls back to being a typo
    // rather than printing a bare name with no verb after it.
    return arg
      ? { kind: "emote", text: arg.slice(0, MAX_CHAT_CHARS) }
      : { kind: "empty" };
  }
  return { kind: "command", name, arg: arg.slice(0, MAX_CHAT_CHARS) };
}

/** True when `value` names a command this build will run. */
export function isSlashCommand(value: unknown): value is SlashCommand {
  return (
    typeof value === "string" &&
    (SLASH_COMMANDS as readonly string[]).includes(value)
  );
}

/**
 * What `/help` prints, in the order a player meets them.
 *
 * Here beside the parser, not in the session, so the grammar and the
 * documentation of the grammar cannot disagree — the failure this exists to
 * prevent is a command that works and is not listed, which reaches a player as
 * a command that does not exist.
 */
export const SLASH_HELP: Record<Exclude<SlashCommand, "me">, string> = {
  players: "/PLAYERS N - SCALE THE HORDE FOR N PLAYERS",
  who: "/WHO - WHO IS IN THIS SESSION",
  kick: "/KICK NAME - REMOVE SOMEBODY (HOST ONLY)",
  invite: "/INVITE - OPEN THE STEAM INVITE PANEL (HOST ONLY)",
  help: "/HELP - THIS LIST",
};
