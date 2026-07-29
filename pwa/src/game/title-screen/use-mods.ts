// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS screen's plumbing (menus-mods.ts): the compiled list fetched over
// the bridge, and the two handoffs — play one, publish one.
//
// The list is fetched LAZILY, the first time the screen is opened, and not at
// launch. Compiling every installed mod means reading and validating a folder
// of YAML per mod, and a player with a dozen subscriptions must not pay for
// that on a launch where they only wanted to press RESUME. It is then held for
// the session, because the answer does not change while the game is running:
// Steam installs a new subscription's files, but this build reads them at the
// next launch rather than swapping content under a menu the player is looking
// at.

import { useCallback, useEffect, useState } from "react";

import {
  initModsBridge,
  listMods,
  modsBridgeAvailable,
  publishMod,
  type InstalledMod,
} from "../../app/mods-bridge.ts";
import type { MenuScreen, ModsMenuState, TitleNotice } from "./menu-model.ts";

export function useMods({
  screen,
  setNotice,
  onPlayMod,
}: {
  screen: MenuScreen;
  setNotice: (notice: TitleNotice | null) => void;
  /** Hand the chosen mod up to App, which applies it and starts a run under
   * it. The menu never applies a mod itself: applying swaps the engine's
   * catalogs, which is a thing that happens to a RUN, not to a screen. */
  onPlayMod: (mod: InstalledMod) => void;
}): { modsOpen: boolean; mods: ModsMenuState } {
  const modsOpen = modsBridgeAvailable();
  const [mods, setMods] = useState<InstalledMod[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!modsOpen) return;
    initModsBridge();
  }, [modsOpen]);

  useEffect(() => {
    if (!modsOpen || screen !== "mods" || mods !== null) return;
    let cancelled = false;
    void listMods().then((list) => {
      if (!cancelled) setMods(list);
    });
    return () => {
      cancelled = true;
    };
  }, [modsOpen, screen, mods]);

  const onPublish = useCallback(
    (mod: InstalledMod) => {
      // One at a time: Steam's upload is a single transfer per item and a
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

  return { modsOpen, mods: { mods, onPlay: onPlayMod, onPublish } };
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
