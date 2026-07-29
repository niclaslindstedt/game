// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind LEADERBOARDS on the desktop — the peer of
// native/src/leaderboards-provider.ts.
//
// **There is no Steam provider today, and that is a finding rather than an
// omission.** It is written down here, at the seam, because this is the file
// someone will open when they ask why the desktop build has no WORLD RANKINGS
// row. Two independent reasons, either of which alone would be enough:
//
//  1. **The binding cannot.** `steamworks.js` (0.4.0, the prebuilt-binary
//     binding the shell is built on) exposes achievements, cloud, stats,
//     overlay, input, workshop, matchmaking and networking — and no leaderboard
//     API at all. ISteamUserStats' leaderboard calls
//     (`FindOrCreateLeaderboard`, `UploadLeaderboardScore`,
//     `DownloadLeaderboardEntries`) are simply not bound. Reaching them means
//     either landing them upstream or building our own N-API addon, which would
//     also cost the prebuilt binaries that make this shell installable without
//     a Rust toolchain.
//
//  2. **Steam has no board to open even if it could.** The whole design of the
//     game's leaderboards is that it ships NO board UI, because "the ranking,
//     the player's rank, their friends and the time scopes are the platform's
//     to draw" (AGENTS.md). That is true of Game Center, which has a full
//     built-in board. It is NOT true of Steam: the overlay's dialogs are
//     Friends, Community, Players, Settings, OfficialGameGroup, Stats and
//     Achievements — there is no leaderboard page, and Steam games draw their
//     own. So a Steam provider would need the game to grow the board UI it
//     deliberately does not have; the API gap is the smaller half of the
//     problem.
//
// Returning null is the seam's own idiom for exactly this (Android returns null
// on the mobile side today), and the web side already handles it: the scores
// bridge reports unavailable and every leaderboard row hides. Nothing is
// half-wired and nothing lies to the player.
//
// **What it would take**, when it is worth doing: a `leaderboards-steam.ts`
// implementing the four members below, plus a board screen in the game. Note
// that Steam scores are **int32** where Game Center's are int64 — so the
// scale-from-format rule in pwa/src/game/platform-leaderboards.ts must be
// re-checked per board before anything is published, or a lifetime-kills value
// that outgrows 2^31 wraps into a negative rank.

/** Which platform service answered — labels the game's status line. */
export type LeaderboardsProviderId = "steam";

/** One score to publish: the game's OWN board key, and the whole number the
 * board stores (already scaled — see pwa/src/game/platform-leaderboards.ts). */
export type ScoreEntry = { key: string; value: number };

export type LeaderboardsProvider = {
  id: LeaderboardsProviderId;
  isAvailable(): Promise<boolean>;
  submit(entries: readonly ScoreEntry[]): Promise<boolean>;
  show(key?: string): Promise<boolean>;
  platformId(key: string): string | null;
};

/**
 * The provider for this shell. Always null today — see the header. The bridge
 * above it (./leaderboards.ts) is wired up regardless, so adding a provider is
 * one new file and one line here, with no protocol or web-side change.
 */
export function leaderboardsProvider(): LeaderboardsProvider | null {
  return null;
}
