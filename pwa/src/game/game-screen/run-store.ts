// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The IN-RUN COIN STORE's plumbing: buy a pack from inside a run (the AUTO
// PILOT picker's STORE button) and put the coins where the run can spend them.
//
// Two ledgers have to agree. `buyCoinPackForHero` banks the pack and sends it
// onto the playing hero's PERSISTED purse (so the pack survives quitting or
// dying before the next bank — money-safety rule 1); this hook then tops up
// the LIVE run purse (`state.players[0].coins`, what the AUTO PILOT meter bills)
// by the same amount and re-reads the hero, because the run's end-of-level
// bank overwrites `loadout.coins` with the run's purse — a stale character ref
// would write the pre-purchase wealth back over the credit.

import type { MutableRefObject } from "react";

import { type GameState } from "@game/core";

import { loadCharacters, type Character } from "../characters.ts";
import { scheduleCloudSync } from "../cloud-save.ts";
import {
  buyCoinPackForHero,
  type CoinPack,
  type RunPurchaseResult,
} from "../store.ts";

import { runCommand } from "../run-commands.ts";

/** Buy a pack for the hero flying this run; resolves with what reached them. */
export type RunBuy = (pack: CoinPack) => Promise<RunPurchaseResult>;

export function useRunStore({
  state,
  characterRef,
  bumpUi,
}: {
  /** Null before the run is up: the pause menu's wiring is built every render,
   * so the buy runner has to exist before there is anything to buy for. */
  state: GameState | null;
  characterRef: MutableRefObject<Character>;
  bumpUi: () => void;
}): RunBuy {
  // Not memoized: it closes over the live run state, and the one consumer (the
  // in-run store modal) calls it straight from a tap.
  return async (pack: CoinPack) => {
    if (!state) return { ok: false, reason: "unavailable" as const };
    const heroId = characterRef.current.id;
    const result = await buyCoinPackForHero(pack, heroId);
    if (!result.ok || result.coins <= 0) return result;
    // The persisted purse already took the credit — mirror it into the run so
    // the AUTO PILOT picker can afford a rung right away. The bank at the end
    // of the level writes this same number back, so it counts once.
    runCommand(state, "creditAutopilotPurse", result.coins);
    // Re-read the hero: the credit landed in storage, and a stale ref would
    // write the pre-purchase wealth back over it on the next persist.
    const fresh = loadCharacters().find((hero) => hero.id === heroId);
    if (fresh) characterRef.current = fresh;
    // Paid coins just landed mid-run: get them into the cloud rather than
    // riding on this device until the run ends (a no-op off the native shell).
    scheduleCloudSync();
    bumpUi();
    return result;
  };
}
