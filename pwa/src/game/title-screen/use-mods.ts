// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS screen's plumbing (menus-mods.ts): the compiled list fetched over
// the bridge, the persisted LOAD ORDER, and the two handoffs — play the enabled
// stack, publish one.
//
// The list is fetched LAZILY — never at launch. Compiling every installed mod
// means reading and validating a folder of YAML per mod, and a player with a
// dozen subscriptions must not pay for that on a launch where they only wanted
// to press RESUME.
//
// It is then re-read EVERY TIME the screen is opened, because the answer can
// now change while the game is running: the player can drop a folder or a
// `.zip` into a mods folder the screen itself offers to open, and "go back and
// come in again" is the loop that has to pick it up. The previous list is kept
// on screen while the new one is compiled, so returning to a screen you have
// already seen never flashes LOADING at you.
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
  revealModsFolder,
  type InstalledMod,
  type ModsFolders,
} from "../../app/mods-bridge.ts";
import {
  brandFor,
  moveMod,
  resolveOrder,
  sameBrand,
  setModEnabled,
} from "../mod-order.ts";
import { modClashes } from "../mod-state.ts";
import { getSettings, updateSettings, type ModBrandMemo } from "../settings.ts";
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
}): {
  modsOpen: boolean;
  mods: ModsMenuState;
  /** What the title screen should call the game right now (see `brand` below).
   * Null for the shipped game. */
  brand: ModBrandMemo | null;
} {
  const modsOpen = modsBridgeAvailable();
  const [installed, setInstalled] = useState<InstalledMod[] | null>(null);
  const [folders, setFolders] = useState<ModsFolders | null>(null);
  const [order, setOrder] = useState(() => getSettings().modOrder);
  const [publishing, setPublishing] = useState(false);
  // WHICH MOD THE INFO PAGE IS SHOWING. Kept by KEY rather than as the mod
  // itself, so the page reads the freshly compiled list on every rebuild
  // instead of a copy that stopped changing the moment it was opened.
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (!modsOpen) return;
    initModsBridge();
  }, [modsOpen]);

  useEffect(() => {
    if (!modsOpen || screen !== "mods") return;
    let cancelled = false;
    void listMods().then((list) => {
      if (cancelled) return;
      setInstalled(list.mods);
      if (list.folders) setFolders(list.folders);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately NOT keyed on `installed`: entering the screen is the
    // trigger, so a mod added since the last visit is found.
  }, [modsOpen, screen]);

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

  // THE NAME ON THE FRONT PAGE. A conversion brings its own (`ModBundle.brand`)
  // and the title screen wears it, so a total conversion stops opening under
  // somebody else's name.
  //
  // Two sources, and which one answers is the whole subtlety: once the list is
  // compiled it is the truth, and until then the REMEMBERED brand stands. The
  // list is compiled lazily — the first time MODS is opened — so at launch
  // there is nothing to ask, and a conversion that opened under its own name
  // yesterday and under this game's today would read as a bug (see
  // `ModBrandMemo`). The moment the real answer arrives it also CORRECTS the
  // memory, which is what forgets a mod the player has since switched off or
  // unsubscribed from.
  const brand = useMemo(
    () =>
      rows === null
        ? getSettings().modBrand
        : brandFor(rows.map((row) => ({ on: row.on, bundle: row.mod.bundle }))),
    [rows],
  );
  useEffect(() => {
    if (rows === null) return;
    if (!sameBrand(brand, getSettings().modBrand))
      updateSettings({ modBrand: brand });
  }, [brand, rows]);

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
    folders,
    reveal: revealModsFolder,
    selected: (installed ?? []).find((mod) => mod.key === openKey) ?? null,
    select: (mod) => setOpenKey(mod?.key ?? null),
    isOn: (id) => rows?.some((row) => row.id === id && row.on) ?? false,
    setEnabled,
    move,
    overriddenIds: (id) => overriddenCount(modClashes(), id),
    onPlay,
    onPublish,
  };
  return { modsOpen, mods, brand };
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
