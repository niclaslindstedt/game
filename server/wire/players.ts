// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `/players N` — Diablo 2's player-count scaling, as one pure function.
//
// It lives in the wire rather than in the session because both ends read it:
// the session APPLIES it, and a HOST screen or a chat reply has to be able to
// SAY what it did ("MONSTERS ×2.5, XP ×2.5") without asking the server. Two
// places computing the same multiplier is two places that can disagree about
// what the player was promised.
//
// **THE TRAP IS THE PAIRING, and it is recorded in the engine's own knob.**
// `BalanceTuning.mobHp` scales every monster's hp at spawn; kill XP here is
// LEVEL-based, so a hp-scaled mob is tougher and pays exactly the same XP for
// its level. Scaling `mobHp` alone therefore makes `/players 8` strictly
// punishing — more health to chew through for the same reward — which is the
// opposite of the risk/reward trade D2 intends, where a bigger player count is
// something a strong party CHOOSES for the faster levelling. So the two move
// together, always, and this function is the only thing entitled to say by how
// much.
//
// D2's own rule is hp ×(1 + 0.5(N−1)) with a matching experience bump, and
// that is what ships. The real tuning pass is PR 4's — it has the multi-player
// simulator to measure with, and the menace meter to reconcile, neither of
// which exists yet. What ships here is the command and the honest pairing.

/** The most players `/players` will scale for. Matches the wire's seat cap;
 * a host may scale for a full party while only three have arrived, which is
 * D2's behaviour and is how a small group makes a map worth more. */
export const MAX_PLAYER_SCALE = 8;

/** How much one extra player adds, as a fraction. D2's 50%. */
export const PLAYER_SCALE_STEP = 0.5;

/** The multipliers `/players N` asks the engine for. Deliberately a pair with
 * no third member: every other knob is PR 4's measured pass, and a guessed one
 * shipped now would be a number nobody could later tell apart from a decision. */
export type PlayerScaling = {
  mobHp: number;
  xpGain: number;
};

/**
 * The scaling for a party of `n`. Out-of-range values are clamped rather than
 * refused, because the caller is a chat line somebody typed: `/players 99` is
 * a request for the maximum, not an error worth a paragraph.
 */
export function playerScaling(n: number): PlayerScaling {
  const players = clampPlayers(n);
  const factor = 1 + PLAYER_SCALE_STEP * (players - 1);
  return { mobHp: factor, xpGain: factor };
}

/** The player count a typed argument actually means, or null when it named no
 * number at all. Null and 1 are different answers: one is a typo to report,
 * the other is a legitimate "put it back to solo". */
export function parsePlayerCount(arg: string): number | null {
  const value = Number.parseInt(arg.trim(), 10);
  if (!Number.isFinite(value)) return null;
  return clampPlayers(value);
}

function clampPlayers(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_PLAYER_SCALE, Math.floor(n)));
}
