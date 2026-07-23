// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AUTO PILOT session (src/game/autopilot.ts): the screen-lifetime ride
// state that survives the run remounts the ride itself causes (restart on
// death, advance on victory, the bunker crossing), plus the flight director
// that reacts to run events — booking special finds for the LOOT history,
// rolling the per-run coin meter into the session, ending the ride on a dry
// purse, and routing the next lap after a clear or a death.

import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  autopilotNextLevel,
  equipmentIcon,
  levelDef,
  LEVEL_ORDER,
  muteDialogue,
  startAutopilot,
  stopAutopilot,
  type Bot,
  type Difficulty,
  type GameEvent,
  type GameState,
} from "@game/core";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import type { AutopilotFind } from "../overlays/AutopilotOverlay.tsx";
import type { Character } from "../characters.ts";
import { TIER_RANK } from "../PickupModal.tsx";
import { TIER_COLORS } from "../tiers.ts";
import type { Hud } from "./hud-model.ts";
import type { RunCheckpoint } from "./run-progress.ts";

// AUTO PILOT (src/game/autopilot.ts): the endgame FARM level the ride grinds
// once the campaign difficulty is beaten — the level that hosts the bunker
// gate, so rift runs can find the severed hand and detour through the vault.
const AUTOPILOT_FARM_LEVEL = "the_rift";
// Cap on the session's special-find history — past it the oldest entries
// drop off the LOOT list (an 18-day ride must not grow an unbounded array).
const AUTOPILOT_FINDS_MAX = 60;

/** The screen-lifetime ride session. `engaged` is the session's INTENT —
 * each fresh run re-arms the engine meter from it; the engine's live switch
 * is `state.autopilot.active` (it disengages itself on a dry purse). The
 * finds list is the LOOT history the overlay shows; totals accumulate the
 * per-run engine counters as each run ends. */
export type AutopilotSession = {
  engaged: boolean;
  speed: number;
  /** The level the session is PINNED to farm: set at engage time when the
   * ride starts on an already-cleared level (a deliberate replay) — every
   * clear then restarts it instead of advancing the campaign. Null when
   * engaged on fresh ground (campaign mode). */
  pinned: string | null;
  findSeq: number;
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  coinsSpent: number;
};

/** The render-side snapshot of the session (a ref can't be read in render). */
export type AutopilotView = {
  speed: number;
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  coinsSpent: number;
};

/**
 * The session's React housing: the ref is mutated only from the loop, the
 * event handlers, and the imperative methods below (a component may not
 * mutate a hook's return, so the UI's session writes live here); render
 * reads the `view` snapshot, refreshed by `syncView` after every session
 * mutation. Everything but the changing `view`/`historyOpen` is stable, so
 * the run effect can list what it uses as dependencies without re-running.
 */
export function useAutopilotSession() {
  const sessionRef = useRef<AutopilotSession>({
    engaged: false,
    speed: 1,
    pinned: null,
    findSeq: 0,
    finds: [],
    clears: 0,
    deaths: 0,
    coinsSpent: 0,
  });
  const [view, setView] = useState<AutopilotView>({
    speed: 1,
    finds: [],
    clears: 0,
    deaths: 0,
    coinsSpent: 0,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const syncView = useCallback(() => {
    const session = sessionRef.current;
    setView({
      speed: session.speed,
      finds: [...session.finds],
      clears: session.clears,
      deaths: session.deaths,
      coinsSpent: session.coinsSpent,
    });
  }, []);
  const api = useMemo(
    () => ({
      /** Retune the session's speed rung (the engine meter changed first). */
      setSpeed: (next: number) => {
        sessionRef.current.speed = next;
        syncView();
      },
      /** Engage the ride, optionally pinned to farm the current level. */
      engage: (pinned: string | null) => {
        sessionRef.current.engaged = true;
        sessionRef.current.pinned = pinned;
        syncView();
      },
      /** Drop the session's intent (the STOP buttons / a hardcore death). */
      disengage: () => {
        sessionRef.current.engaged = false;
      },
    }),
    [syncView],
  );
  return { sessionRef, view, syncView, historyOpen, setHistoryOpen, ...api };
}

export type AutopilotDirector = {
  /** True when the fresh run was refused at the door (dry purse) — the first
   * sim tick consumes it to freeze the run with an explanation. */
  consumeBrokeAtDoor: () => boolean;
  /** React to a run event (finds, meters, the flight director). */
  onEvent: (event: GameEvent, state: GameState) => void;
};

/**
 * Re-arm the engine meter on a fresh run and build the event director.
 * A session spanning runs re-engages the meter on the fresh state (the
 * previous run ended in a restart/advance with the ride still engaged). If
 * the banked purse can no longer fund the rung, the ride ends at the door —
 * flagged so the first sim tick pauses the run instead of leaving an
 * unattended hero standing in the open. A parked or checkpointed state that
 * comes back carrying a stale engine meter with no session behind it gets
 * the meter switched off.
 */
export function createAutopilotDirector(deps: {
  sessionRef: MutableRefObject<AutopilotSession>;
  syncView: () => void;
  state: GameState;
  demo: boolean;
  /** The developer BOT VIEW / `?bot=` bot — the director stands down while
   * one drives (the paid ride and the debug bot are mutually exclusive). */
  bot: Bot | null;
  assets: GameAssets;
  characterRef: MutableRefObject<Character>;
  checkpointRef: MutableRefObject<RunCheckpoint | null>;
  difficulty: Difficulty;
  pushPickup: (text: string, color?: string) => void;
  pause: (userInitiated?: boolean) => void;
  bumpUi: () => void;
  setHud: Dispatch<SetStateAction<Hud | null>>;
  setLevelId: (id: string) => void;
  setRunId: Dispatch<SetStateAction<number>>;
}): AutopilotDirector {
  const {
    sessionRef,
    syncView,
    state,
    demo,
    bot,
    assets,
    characterRef,
    checkpointRef,
    difficulty,
    pushPickup,
    pause,
    bumpUi,
    setHud,
    setLevelId,
    setRunId,
  } = deps;

  const pilot = sessionRef.current;
  let brokeAtDoor = false;
  if (!demo && pilot.engaged) {
    if (startAutopilot(state, pilot.speed)) {
      muteDialogue(state);
    } else {
      pilot.engaged = false;
      brokeAtDoor = true;
    }
  } else if (state.autopilot.active) {
    stopAutopilot(state);
  }

  const consumeBrokeAtDoor = () => {
    if (!brokeAtDoor) return false;
    brokeAtDoor = false;
    return true;
  };

  const onEvent = (event: GameEvent, state: GameState) => {
    // AUTO PILOT upgrade feed: bank the session's SPECIAL finds — upgrades,
    // auto-equipped pieces, and set-or-better drops — for the overlay's LOOT
    // history (capped, oldest drop off).
    if (
      event.type === "itemCollected" &&
      event.name &&
      event.kind === "equipment" &&
      !bot &&
      state.autopilot.active &&
      (event.upgrade === true ||
        event.equipped === true ||
        TIER_RANK[event.tier ?? "regular"] >= TIER_RANK.set)
    ) {
      const pilot = sessionRef.current;
      pilot.finds.push({
        id: ++pilot.findSeq,
        name: event.name,
        color: TIER_COLORS[event.tier ?? "regular"],
        icon: event.defId
          ? spriteDataUrl(assets.sprites, equipmentIcon(event.defId))
          : undefined,
        equipped: event.equipped === true,
        upgrade: event.upgrade === true,
        levelName: levelDef(state.level.id).name,
      });
      if (pilot.finds.length > AUTOPILOT_FINDS_MAX) {
        pilot.finds.shift();
      }
      syncView();
    }
    // AUTO PILOT ran the purse dry mid-flight: the engine disengaged
    // itself (see stepAutopilot) — end the session and freeze the run
    // where it stands so the unattended hero isn't slaughtered.
    if (event.type === "autopilotStopped" && !bot) {
      sessionRef.current.engaged = false;
      sessionRef.current.coinsSpent += state.autopilot.coinsSpent;
      state.autopilot.coinsSpent = 0;
      pushPickup("AUTO PILOT · OUT OF COINS", "#ffcf6b");
      pause(true);
      syncView();
      bumpUi();
    }
    // AUTO PILOT crossed a travel gate (the bunker): the crossing already
    // banked and travelled (run-progress.ts) — just roll this run's meter
    // into the session total before the state is dropped.
    if (event.type === "gateEntered" && state.autopilot.active && !bot) {
      sessionRef.current.coinsSpent += state.autopilot.coinsSpent;
      state.autopilot.coinsSpent = 0;
      syncView();
    }
    // AUTO PILOT flight director: the ride never sits on a splash. A
    // clear advances the route (campaign order → rift runs once the
    // difficulty is beaten → a secret level back through its own door);
    // a softcore death restarts the level (the bunker restarts from the
    // rift — its key is spent, cow-level style). A hardcore death ends
    // the session with the hero: the retire splash stays up.
    if (
      (event.type === "victory" || event.type === "defeat") &&
      state.autopilot.active &&
      !bot
    ) {
      const pilot = sessionRef.current;
      pilot.coinsSpent += state.autopilot.coinsSpent;
      state.autopilot.coinsSpent = 0;
      const exitTo = levelDef(state.level.id).exitTo ?? null;
      if (event.type === "victory") {
        pilot.clears += 1;
        const next = autopilotNextLevel(
          state.level.id,
          {
            order: LEVEL_ORDER,
            beaten: characterRef.current.beaten.includes(difficulty),
            farmLevel: AUTOPILOT_FARM_LEVEL,
            pinned: pilot.pinned,
          },
          exitTo,
        );
        // The next lap must dress from the JUST-BANKED victory loadout:
        // drop the combat-start RETRY checkpoint (as the softcore death
        // path does) or a pinned farm would rewind to this run's entry
        // build and purse on every restart, accumulating nothing.
        checkpointRef.current = null;
        setHud(null);
        if (next === state.level.id) setRunId((id) => id + 1);
        else setLevelId(next);
      } else if (characterRef.current.hardcore) {
        stopAutopilot(state);
        pilot.engaged = false;
        bumpUi();
      } else {
        pilot.deaths += 1;
        setHud(null);
        if (exitTo) setLevelId(exitTo);
        else setRunId((id) => id + 1);
      }
      syncView();
    }
  };

  return { consumeBrokeAtDoor, onEvent };
}
