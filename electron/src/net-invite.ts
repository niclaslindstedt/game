// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INVITE THAT ARRIVES BEFORE THE GAME DOES — `+connect_lobby <id>` and
// `--connect <address>`.
//
// **NOTHING UNDER `electron/src/` READ `process.argv` AT ALL** until this file,
// which meant a friend accepting a Steam invite while the game was closed
// landed nowhere: Steam launches the binary with `+connect_lobby <id>` on the
// command line and the game opened its title menu as if nothing had happened.
// The same applies to a shareable direct link, which is the whole reason an
// address is worth copying out of the HOST panel.
//
// **IT ARRIVES BEFORE THE WINDOW EXISTS, SO IT IS PARKED.** Both forms are read
// at startup, when there is no page to hand them to and no bridge to hand them
// over; and on a `second-instance` event, when there IS a page but Steam has
// handed the argument to a process that is about to exit. So the invite is
// stored and delivered on the page's own `did-finish-load` — which fires for
// the first load and for a reload, so a player who reloads mid-connect gets
// taken back rather than dropped.
//
// **AND IT IS CONSUMED, NOT REMEMBERED.** An invite is a one-shot instruction;
// one left parked would re-join the same session every time the page reloaded,
// which is the kind of thing that looks like the game ignoring the player's
// attempts to leave.

/** What a launch argument asks for. Exactly one of the two, mirroring the
 * bridge's `ConnectOptions`. */
export type Invite = { lobbyId?: string; address?: string };

/**
 * Read an invite out of a command line, or null.
 *
 * Both forms travel as `flag value` rather than `flag=value`, because that is
 * how Steam passes `+connect_lobby` and there is no sense in the game's own
 * flag disagreeing with the one it has to accept anyway. A flag with nothing
 * after it is ignored rather than treated as an empty id — a truncated command
 * line must not produce a join attempt against "".
 */
export function readInvite(argv: readonly string[]): Invite | null {
  for (let at = 0; at < argv.length; at++) {
    const flag = argv[at];
    const value = argv[at + 1];
    if (!value || value.startsWith("-") || value.startsWith("+")) continue;
    // Steam's own, passed when a friend accepts an invite while the game is
    // closed. The id is a lobby's, and joining it is what hands back the host
    // the P2P packets are addressed to.
    if (flag === "+connect_lobby") return { lobbyId: value };
    // Ours, for a shareable link: the address a host copied off the session
    // panel, pasted into a chat window and clicked.
    if (flag === "--connect" || flag === "+connect") return { address: value };
  }
  return null;
}
