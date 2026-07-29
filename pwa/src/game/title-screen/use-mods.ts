// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS screen's plumbing (menus-mods.ts): the compiled list fetched over
// the bridge, the persisted LOAD ORDER, and the two handoffs — play the enabled
// stack, publish one.
//
// The list is fetched LAZILY, the first time the screen is opened, and not at
// launch. Compiling every installed mod means reading and validating a folder
// of YAML per mod, and a player with a dozen subscriptions must not pay for
// that on a launch where they only wanted to press RESUME. It is then held for
// the session, because the answer does not change while the game is running:
// Steam installs a new subscription's files, but this build reads them at the
// next launch rather than swapping content under a menu the player is reading.
//
// The ORDER, unlike the list, is persisted (`modOrder` in settings) and written
// through on every change. A load order the player spent time on must survive a
// relaunch, and it has to survive unsubscribing too — see `resolveOrder`.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  initModsBridge,
  listMods,
  modsBridgeAvailable,
  publishMod,
  type InstalledMod,
} from "../../app/mods-bridge.ts";
import { moveMod, resolveOrder, setModEnabled } from "../mod-order.ts";
import { modClashes } from "../mod-state.ts";
import { getSettings, updateSettings } from "../settings.ts";
import { overriddenCount } from "./menus-mods.ts";
import type { MenuScreen, ModsMenuState, TitleNotice } from "./menu-model.ts";

export function useMods({
  screen,
  setNotice,
  onPlayMods,
}: {
  screen: MenuScreen;
  setNotice: (notice: TitleNotice | null) => void;
  /** Hand the enabled stack, IN LOAD ORDER, up to be applied and played. The
   * menu never applies mods itself: applying swaps the engine's catalogs,
   * which is a thing that happens to a RUN, not to a screen. */
  onPlayMods: (mods: InstalledMod[]) => void;
}): { modsOpen: boolean; mods: ModsMenuState } {
  const modsOpen = modsBridgeAvailable();
  const [installed, setInstalled] = useState<InstalledMod[] | null>(null);
  const [order, setOrder] = useState(() => getSettings().modOrder);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!modsOpen) return;
    initModsBridge();
  }, [modsOpen]);

  useEffect(() => {
    if (!modsOpen || screen !== "mods" || installed !== null) return;
    let cancelled = false;
    void listMods().then((list) => {
      if (!cancelled) setInstalled(list);
    });
    return () => {
      cancelled = true;
    };
  }, [modsOpen, screen, installed]);

  // A mod is identified by its COMPILED id, never its folder: a folder is a
  // Workshop item number or whatever the player named a directory, and neither
  // survives a resubscribe. One that did not compile has no id to rank, so it
  // is keyed by folder and simply never enabled.
  const rows = useMemo(() => {
    if (installed === null) return null;
    const pairs: [string, InstalledMod][] = installed.map((mod) => [
      mod.bundle?.id ?? mod.key,
      mod,
    ]);
    return resolveOrder(order, pairs).rows;
  }, [installed, order]);

  /** Persist and adopt one edit to the order. */
  const commit = useCallback((next: ReturnType<typeof setModEnabled>) => {
    setOrder(next);
    updateSettings({ modOrder: next });
  }, []);

  const setEnabled = useCallback(
    (id: string, on: boolean) => {
      // Resolve first: a mod the player has never ranked has no row to edit
      // yet, and the resolve is what appends it.
      const pairs: [string, InstalledMod][] = (installed ?? []).map((mod) => [
        mod.bundle?.id ?? mod.key,
        mod,
      ]);
      commit(setModEnabled(resolveOrder(order, pairs).order, id, on));
    },
    [commit, installed, order],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const pairs: [string, InstalledMod][] = (installed ?? []).map((mod) => [
        mod.bundle?.id ?? mod.key,
        mod,
      ]);
      const resolved = resolveOrder(order, pairs).order;
      const present = new Set(pairs.map(([modId]) => modId));
      commit(moveMod(resolved, id, dir, (modId) => present.has(modId)));
    },
    [commit, installed, order],
  );

  const onPublish = useCallback(
    (mod: InstalledMod) => {
      // One at a time: Steam's upload is a single transfer per item, and a
      // second publish while one is in flight is a race with no useful answer.
      if (publishing) return;
      setPublishing(true);
      setNotice({ tone: "info", text: "UPLOADING TO THE WORKSHOP..." });
      void publishMod(mod.folder, `v${mod.bundle?.version ?? ""}`).then(
        (result) => {
          setPublishing(false);
          setNotice(publishNotice(result));
        },
      );
    },
    [publishing, setNotice],
  );

  const onPlay = useCallback(() => {
    const enabled = (rows ?? [])
      .filter((row) => row.on && row.mod.bundle)
      .map((row) => row.mod);
    if (enabled.length > 0) onPlayMods(enabled);
  }, [onPlayMods, rows]);

  const mods: ModsMenuState = {
    rows,
    isOn: (id) => rows?.some((row) => row.id === id && row.on) ?? false,
    setEnabled,
    move,
    overriddenIds: (id) => overriddenCount(modClashes(), id),
    onPlay,
    onPublish,
  };
  return { modsOpen, mods };
}

/**
 * What to tell the player. The agreement case is its own line because it is
 * the one outcome that LOOKS like success and is not: the item uploaded, Steam
 * accepted it, and nobody can see it until its author accepts the Workshop
 * terms in a browser. Reporting that as "PUBLISHED" would leave them refreshing
 * a page that stays empty.
 */
function publishNotice(
  result: Awaited<ReturnType<typeof publishMod>>,
): TitleNotice {
  if (result.ok) {
    return result.needsToAcceptAgreement
      ? {
          tone: "info",
          text: "UPLOADED - NOW ACCEPT THE WORKSHOP AGREEMENT ON STEAM TO MAKE IT VISIBLE",
        }
      : { tone: "info", text: "PUBLISHED TO THE WORKSHOP" };
  }
  const reason =
    result.reason === "no-steam"
      ? "STEAM IS NOT RUNNING"
      : result.reason === "not-a-mod"
        ? "THAT FOLDER HAS NO MOD.YAML"
        : (result.detail ?? "UPLOAD FAILED").toUpperCase();
  return { tone: "error", text: `COULD NOT PUBLISH - ${reason}` };
}
