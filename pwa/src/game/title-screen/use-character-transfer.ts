// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The roster + character-transfer plumbing behind SETTINGS → DATA and
// DEVELOPER → SEED CHARACTERS: the roster snapshot (refreshed via a tick so
// an import/seed/purchase shows up), the EXPORT picker's tick-set, the
// export/import runners, and the seed minting. Results surface through the
// setNotice line TitleScreen renders under the menu.

import { useCallback, useMemo, useState } from "react";

import { synth } from "../audio.ts";
import {
  exportCharacterToFile,
  importCharacterFromFile,
} from "../character-transfer.ts";
import { importCharacter, loadCharacters } from "../characters.ts";
import { SEED_TIERS, seedTierCharacters } from "../seed-characters.ts";
import { playUiSound } from "../sfx/index.ts";
import type { TitleNotice } from "./menu-model.ts";

export function useCharacterTransfer(
  setNotice: (notice: TitleNotice | null) => void,
) {
  // The whole roster, loaded for the EXPORT CHARACTER picker (SETTINGS → DATA
  // → EXPORT CHARACTER). Refreshed each time the screen opens (via exportTick)
  // so a hero imported this session shows up. Independent of the ACTIVE
  // character — the picker exports whichever heroes are ticked, not the
  // current game.
  const [exportTick, setExportTick] = useState(0);
  // exportTick is the deliberate refresh trigger (a fresh roster snapshot each
  // time the picker opens); eslint can't see the dependency through
  // loadCharacters(), so it wrongly flags it — keep it and silence the warning.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roster = useMemo(() => loadCharacters(), [exportTick]);
  /** Re-snapshot the roster (and every blurb that reads purses/banks). */
  const refreshRoster = useCallback(() => setExportTick((t) => t + 1), []);

  // The ids ticked in the EXPORT CHARACTER picker — one or many. A Set so
  // toggling a row is O(1) and the export button reads its size.
  const [exportPicks, setExportPicks] = useState<Set<string>>(() => new Set());
  const toggleExportPick = useCallback((id: string, on: boolean) => {
    playUiSound(synth, "confirm");
    setExportPicks((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Opening the picker: a fresh roster snapshot, nothing ticked, no stale
  // result line (the DATA screen's EXPORT row calls this before navigating).
  const beginExportPicker = useCallback(() => {
    setExportTick((t) => t + 1);
    setExportPicks(new Set());
    setNotice(null);
  }, [setNotice]);

  // Export every ticked hero as its own signed zip. A no-op with nothing ticked
  // (the row buzzes instead). Downloads run sequentially so the browser doesn't
  // drop overlapping saves; a single failure is surfaced without hiding the
  // ones that did land.
  const exportPicked = useCallback(async () => {
    const chosen = roster.filter((c) => exportPicks.has(c.id));
    if (chosen.length === 0) {
      playUiSound(synth, "back");
      setNotice({ tone: "error", text: "SELECT A HERO TO EXPORT" });
      return;
    }
    playUiSound(synth, "confirm");
    let failed = 0;
    for (const hero of chosen) {
      try {
        await exportCharacterToFile(hero);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      setNotice({
        tone: "info",
        text:
          chosen.length === 1
            ? `EXPORTED ${chosen[0]!.name}`
            : `EXPORTED ${chosen.length} HEROES`,
      });
    } else {
      setNotice({ tone: "error", text: `EXPORT FAILED (${failed})` });
    }
  }, [roster, exportPicks, setNotice]);

  const runImport = useCallback(
    async (file: File) => {
      try {
        const imported = await importCharacterFromFile(file);
        const stored = importCharacter(imported);
        playUiSound(synth, "start");
        setNotice({ tone: "info", text: `IMPORTED ${stored.name}` });
      } catch (err) {
        playUiSound(synth, "back");
        setNotice({
          tone: "error",
          text: err instanceof Error ? err.message : "IMPORT FAILED",
        });
      }
    },
    [setNotice],
  );

  // Open the OS file picker. A transient input avoids a render-time ref (and
  // the click is a genuine user gesture, so the dialog opens).
  const pickImport = useCallback(() => {
    playUiSound(synth, "confirm");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void runImport(file);
    });
    input.click();
  }, [runImport]);

  // DEVELOPER → SEED CHARACTERS: mint the melee/ranged/magic specimens for a
  // tier (or the whole 3×4 matrix with no tier) straight into the roster, then
  // refresh the roster snapshot and report the count under the menu.
  const runSeed = useCallback(
    (tier: (typeof SEED_TIERS)[number] | null) => {
      playUiSound(synth, "confirm");
      const count = seedTierCharacters(tier);
      setExportTick((t) => t + 1);
      setNotice({ tone: "info", text: `SEEDED ${count} HEROES` });
    },
    [setNotice],
  );

  return {
    roster,
    refreshRoster,
    exportPicks,
    toggleExportPick,
    beginExportPicker,
    exportPicked,
    pickImport,
    runSeed,
  };
}
