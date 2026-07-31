// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT — the engine bot flies the hero while the player watches (or
// walks away), paid for in COINS drained per SIMULATED second. The engine owns
// the meter: the drain ticks inside `step()` (deterministic, headless-testable)
// and shuts the ride down the moment the purse empties. The APP owns the
// steering (it feeds `botAct` output into `step` exactly like the developer
// BOT VIEW) and the travel between runs (restart on death, advance on victory,
// the bunker crossing) — the engine never changes levels; see
// `autopilotNextLevel` for the one routing rule it does own.
//
// Faster wall-clock progress costs MORE per game-second on purpose: at speed
// s the purse pays `coinsPerSecond × s` per game-second, and the app also
// fast-forwards s× more game-seconds per real second — so 8× progress costs
// 64× coins per real second. Convenience is the product, and the premium is
// the balance lever that keeps 16× from being strictly correct.

import { AUTOPILOT } from "./config/index.ts";
import { captureBuildSnapshot } from "./items/stat-points.ts";
import type { Difficulty, GameState } from "./types/index.ts";

/** Snap a requested speed to the closest offered rung (config `speeds`). */
export function normalizeAutopilotSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return AUTOPILOT.speeds[0];
  let best: number = AUTOPILOT.speeds[0];
  for (const s of AUTOPILOT.speeds) {
    if (Math.abs(s - speed) < Math.abs(best - speed)) best = s;
  }
  return best;
}

/** Coins the autopilot burns per SIMULATED second at `speed`. */
export function autopilotDrainPerSecond(speed: number): number {
  return AUTOPILOT.coinsPerSecond * normalizeAutopilotSpeed(speed);
}

/**
 * Engage the autopilot at `speed` (snapped to the offered rungs). Refused
 * when the purse can't cover a single second at that speed — the meter must
 * be able to run at all — or when the run is already over. Idempotent on the
 * speed: engaging while active just retunes it.
 */
export function startAutopilot(state: GameState, speed = 1): boolean {
  if (state.phase === "victory" || state.phase === "defeat") return false;
  const snapped = normalizeAutopilotSpeed(speed);
  if (state.players[0].coins < autopilotDrainPerSecond(snapped)) return false;
  state.autopilot.active = true;
  state.autopilot.speed = snapped;
  state.autopilot.drainCarry = 0;
  // THE FLIGHT'S BASELINE, stamped once and never overwritten. A ride crosses
  // levels and every level is a fresh `GameState`, so a run the flight arrives
  // INTO is handed the original baseline through `SessionParams.autopilotBuild`
  // — re-stamping here would quietly re-baseline the refund on the build the
  // BOT had already grown, and the player would get back only the last level's
  // points. `refundAutopilotBuild` clears it when the ride is settled.
  state.autopilot.build ??= captureBuildSnapshot(state, state.players[0]);
  return true;
}

/** Disengage (the STOP button). The purse keeps whatever wasn't drained. */
export function stopAutopilot(state: GameState): boolean {
  if (!state.autopilot.active) return false;
  state.autopilot.active = false;
  state.autopilot.drainCarry = 0;
  return true;
}

/** Retune the running meter to another offered speed rung. */
export function setAutopilotSpeed(state: GameState, speed: number): boolean {
  if (!state.autopilot.active) return false;
  state.autopilot.speed = normalizeAutopilotSpeed(speed);
  return true;
}

/**
 * Top up the run's purse — the meter's fuel. The app calls this when coins
 * arrive from outside the run (the AUTO PILOT picker's in-run COIN STORE),
 * so a purse too thin to engage can be refilled without leaving the level.
 * Returns the whole coins actually credited (0 for a non-positive amount).
 */
export function creditAutopilotPurse(state: GameState, coins: number): number {
  const credit = Math.floor(coins);
  if (!(credit > 0)) return 0;
  state.players[0].coins += credit;
  return credit;
}

/**
 * The per-tick meter (called from `step()` while `playing` — paused phases,
 * dialogues and the shop don't bill). Accrues fractional coins on game time,
 * deducts whole coins from the purse, and disengages with an
 * `autopilotStopped` event the moment the purse runs dry — the app reacts by
 * dropping back to manual play.
 */
export function stepAutopilot(state: GameState, dtMs: number): void {
  const ap = state.autopilot;
  if (!ap.active) return;
  ap.drainCarry += (AUTOPILOT.coinsPerSecond * ap.speed * dtMs) / 1000;
  const owed = Math.floor(ap.drainCarry);
  if (owed <= 0) return;
  ap.drainCarry -= owed;
  const paid = Math.min(owed, state.players[0].coins);
  state.players[0].coins -= paid;
  ap.coinsSpent += paid;
  if (state.players[0].coins <= 0) {
    state.players[0].coins = 0;
    ap.active = false;
    ap.drainCarry = 0;
    state.events.push({ type: "autopilotStopped", reason: "coins" });
  }
}

/**
 * The route the autopilot flies between runs, judged against the character's
 * campaign progress (the app supplies it — unlock state lives app-side).
 */
export type AutopilotRoute = {
  /** The campaign's level order for the running difficulty. */
  order: readonly string[];
  /** True once the running difficulty is fully beaten (including a clear
   * banked THIS session) — the campaign is done, so the autopilot farms. */
  beaten: boolean;
  /** The endgame FARM level ground once the campaign is done (the level that
   * hosts the secret-level gate — rift runs). */
  farmLevel: string;
  /** The level the SESSION is pinned to: the ride was engaged on an
   * already-cleared level — a deliberate replay/farm — so every clear
   * restarts it instead of advancing the campaign. Null when the ride was
   * engaged on fresh ground (campaign mode). */
  pinned?: string | null;
  /**
   * The harder rung this hero could step up to now — the app resolves it from
   * the unlock graph (`nextDifficultyFor`), which is progress state the engine
   * doesn't hold. Null/absent when there is none (the ladder is topped out, or
   * nothing new opened). See {@link autopilotStepUp}.
   */
  stepUp?: Difficulty | null;
};

/**
 * Does the ride STEP UP a difficulty after clearing `current`? Beating a
 * campaign used to drop the autopilot into farming the same rung's rift
 * forever; a ride left running overnight would grind easy mobs it long
 * outclassed. Beating the game is exactly the moment a player would raise the
 * difficulty, so the ride does it too — and the hero it hands back has climbed
 * the ladder rather than idled at the bottom of it.
 *
 * It steps up only from a finished campaign on FRESH ground: a session PINNED
 * to a level was a deliberate farm order (that stays put, at that rung), and a
 * secret level returns through its own door first — the crossing is the run,
 * and a rung change mid-detour would strand it. Returns the rung to move to,
 * or null to route by {@link autopilotNextLevel} as before.
 */
export function autopilotStepUp(
  route: AutopilotRoute,
  exitTo?: string | null,
): Difficulty | null {
  if (exitTo || route.pinned) return null;
  if (!route.beaten) return null;
  return route.stepUp ?? null;
}

/**
 * Where the autopilot flies after clearing `current`. A secret level always
 * returns through its own door (`exitTo` — the bunker ends back at the rift,
 * cow-level style: it can't be farmed back-to-back, a fresh key must drop).
 * A session PINNED to a replayed level farms that level forever; otherwise a
 * beaten difficulty farms `farmLevel`, and an unbeaten one advances the
 * campaign, clearing its last level rolling into the farm.
 */
export function autopilotNextLevel(
  current: string,
  route: AutopilotRoute,
  exitTo?: string | null,
): string {
  if (exitTo) return exitTo;
  if (route.pinned) return route.pinned;
  if (route.beaten) return route.farmLevel;
  const at = route.order.indexOf(current);
  const next = at >= 0 ? route.order[at + 1] : undefined;
  return next ?? route.farmLevel;
}
