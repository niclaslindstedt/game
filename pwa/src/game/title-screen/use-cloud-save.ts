// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's plumbing behind the SETTINGS → DATA rows (menus-data.ts): the
// live sync state, the human-readable status line, and the SYNC NOW runner.
// The engine itself is ../cloud-save.ts — this only surfaces it.

import { useCallback, useEffect, useState } from "react";

import { synth } from "../audio.ts";
import {
  cloudState,
  scheduleCloudSync,
  subscribeCloud,
  subscribeCloudData,
  syncNow,
  type CloudState,
} from "../cloud-save.ts";
import { cloudBridgeAvailable } from "../../app/cloud-bridge.ts";
import { playUiSound } from "../sfx/index.ts";
import type { TitleNotice } from "./menu-model.ts";

/** How long ago, in the menu's shouty shorthand. */
function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return "JUST NOW";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} H AGO`;
  return `${Math.round(hours / 24)} D AGO`;
}

/** The one-word state shown in the row's value column. */
export function cloudValue(state: CloudState): string {
  if (state.phase === "syncing") return "SYNCING";
  if (state.phase === "error") return "ERROR";
  if (!state.available) return "OFF";
  return "ON";
}

/** The row's help line: what the sync is doing, and for whom. */
export function cloudBlurb(state: CloudState): string {
  if (state.phase === "syncing") return "TALKING TO THE CLOUD";
  if (state.phase === "error") return state.error ?? "THE CLOUD REFUSED";
  if (!state.available) {
    return state.provider === "play-games"
      ? "SIGN INTO GOOGLE PLAY GAMES TO CARRY HEROES AND COINS BETWEEN DEVICES"
      : "SIGN INTO ICLOUD TO CARRY HEROES AND COINS BETWEEN DEVICES";
  }
  const who = state.player?.name
    ? ` AS ${state.player.name.toUpperCase()}`
    : "";
  const when = state.lastSyncAt ? ` - SYNCED ${ago(state.lastSyncAt)}` : "";
  return `HEROES AND COINS FOLLOW YOU${who}${when}`;
}

export function useCloudSave({
  setNotice,
  refreshRoster,
}: {
  setNotice: (notice: TitleNotice | null) => void;
  refreshRoster: () => void;
}) {
  // Only the native shell has a platform cloud to talk to; in a browser/PWA the
  // rows simply don't exist.
  const cloudOpen = cloudBridgeAvailable();
  const [state, setState] = useState<CloudState>(cloudState);

  useEffect(() => subscribeCloud(setState), []);
  // The title screen is where every run ends, so its mount is the natural
  // moment to push what the run banked — no need to thread a sync call through
  // the victory/death/gate paths that write the character. Debounced, so
  // bouncing through the menu doesn't chatter at the cloud.
  useEffect(() => scheduleCloudSync(), []);
  // A merge that changed the roster/bank has to reach the lists on screen —
  // the DISTRIBUTE blurbs and the hero rows read them straight out of storage.
  useEffect(() => subscribeCloudData(refreshRoster), [refreshRoster]);

  const runCloudSync = useCallback(async () => {
    playUiSound(synth, "confirm");
    setNotice({ tone: "info", text: "SYNCING WITH THE CLOUD" });
    const result = await syncNow();
    if (result.ok) {
      playUiSound(synth, "start");
      setNotice({
        tone: "info",
        text: result.pulled
          ? "CLOUD SAVE MERGED - HEROES AND COINS ARE UP TO DATE"
          : "CLOUD SAVE UP TO DATE",
      });
      refreshRoster();
      return;
    }
    playUiSound(synth, "back");
    setNotice({
      tone: "error",
      text:
        result.reason === "unavailable"
          ? "NO CLOUD ACCOUNT ON THIS DEVICE"
          : result.reason === "too-large"
            ? "SAVE TOO BIG FOR THE CLOUD"
            : "COULDN'T REACH THE CLOUD - TRY AGAIN LATER",
    });
  }, [setNotice, refreshRoster]);

  return { cloudOpen, cloudState: state, runCloudSync };
}
