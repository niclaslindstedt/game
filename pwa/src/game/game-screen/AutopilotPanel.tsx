// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AUTO PILOT's in-HUD control panel wiring — the speed rung, STOP, LOOT,
// and the draining purse — bound to the session (autopilot-director.ts) so a
// rung change or a STOP updates both the engine meter and the session intent.
// PlayingHud mounts it under the minimap while the engine meter runs.

import { AUTOPILOT, setAutopilotSpeed, type GameState } from "@game/core";

import type { MutableRefObject } from "react";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import type { Character } from "../characters.ts";
import {
  AutopilotHistory,
  AutopilotOverlay,
} from "../overlays/AutopilotOverlay.tsx";
import {
  autopilotRideGains,
  finishAutopilotRide,
  type useAutopilotSession,
} from "./autopilot-director.ts";

export function AutopilotPanel({
  state,
  font,
  coins,
  characterRef,
  autopilot,
  bumpUi,
}: {
  state: GameState;
  font: PixelFont;
  /** The purse from the HUD snapshot (the live drain the meter shows). */
  coins: number;
  /** The live hero — the STOP banks the refunded (bot-allocation-free) build. */
  characterRef: MutableRefObject<Character>;
  /** The AUTO PILOT session housing (see useAutopilotSession). */
  autopilot: ReturnType<typeof useAutopilotSession>;
  bumpUi: () => void;
}) {
  return (
    <AutopilotOverlay
      font={font}
      coins={coins}
      speed={state.autopilot.speed}
      findsCount={autopilot.view.finds.length}
      onToggleHistory={() => autopilot.setHistoryOpen((open) => !open)}
      onCycleSpeed={() => {
        const speeds = AUTOPILOT.speeds as readonly number[];
        const at = speeds.indexOf(state.autopilot.speed);
        const next = speeds[(at + 1) % speeds.length] ?? 1;
        if (setAutopilotSpeed(state, next)) {
          autopilot.setSpeed(next);
          bumpUi();
        }
      }}
      onStop={() => {
        // End the ride and hand the flight's stat/talent picks back as unspent
        // points; the hero is mid-play here, so the refund reopens the chooser
        // in place (see `promptPendingPoints`).
        finishAutopilotRide({
          state,
          characterRef,
          sessionRef: autopilot.sessionRef,
          syncView: autopilot.syncView,
        });
        autopilot.setHistoryOpen(false);
        bumpUi();
      }}
    />
  );
}

/** The AUTO PILOT LOOT history — a full-shell modal (the panel that opens
 * it is the AutopilotPanel up in the minimap column). */
export function AutopilotHistoryModal({
  state,
  font,
  autopilot,
}: {
  state: GameState;
  font: PixelFont;
  autopilot: ReturnType<typeof useAutopilotSession>;
}) {
  // The flight's build progress, diffed live off the pre-ride snapshot (levels
  // climbed, stat points earned, talent points unlocked) — the reward the ride
  // won, shown beside the coins it spent.
  const gains = autopilotRideGains(state, autopilot.sessionRef.current);
  return (
    <AutopilotHistory
      font={font}
      finds={autopilot.view.finds}
      clears={autopilot.view.clears}
      deaths={autopilot.view.deaths}
      levels={gains.levels}
      statPoints={gains.stats}
      talentPoints={gains.talents}
      coinsSpent={autopilot.view.coinsSpent + state.autopilot.coinsSpent}
      onClose={() => autopilot.setHistoryOpen(false)}
    />
  );
}
