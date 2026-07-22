// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SETTINGS → DATA: character transfer between devices. DATA offers EXPORT
// (opens a tick-list over the whole roster) and IMPORT (an OS file picker);
// the EXPORT screen is the picker itself. The transfer plumbing lives in
// use-character-transfer.ts — these builders only lay out the rows.

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/index.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";

export function buildDataMenu(ctx: MenuContext): MenuEntry[] {
  // Character transfer: EXPORT opens a picker over the WHOLE roster (tick
  // one or many, not just the current game); IMPORT loads any exported hero
  // back via a file picker.
  return [
    {
      label: "EXPORT CHARACTER",
      aria: "data-export-character",
      blurb: "SAVE ONE OR MORE HEROES TO FILES",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.beginExportPicker(); // fresh roster snapshot, no picks, no notice
        ctx.setScreen("export");
        ctx.setCursor(0);
      },
    },
    {
      label: "IMPORT CHARACTER",
      aria: "data-import-character",
      blurb: "LOAD A HERO EXPORTED FROM ANOTHER DEVICE",
      action: ctx.pickImport,
    },
    // Land back on the DATA row in SETTINGS (after CONTROLS / DISPLAY /
    // SOUND).
    backTo(ctx, "settings", 3),
  ];
}

export function buildExportMenu(ctx: MenuContext): MenuEntry[] {
  // The EXPORT CHARACTER picker: a ticked list of the WHOLE roster (not the
  // active hero), then one download per ticked hero. A fallen hardcore hero
  // still exports — a backup is a backup.
  if (ctx.roster.length === 0) {
    return [
      {
        label: "NO HEROES YET",
        aria: "export-empty",
        blurb: "CREATE A HERO FROM PLAY - NEW GAME FIRST",
        locked: true,
        action: () => playUiSound(synth, "back"),
      },
      backTo(ctx, "data", 0),
    ];
  }
  const heroRows: MenuEntry[] = ctx.roster.map((hero) => {
    const level = hero.loadout?.level ?? 1;
    const on = ctx.exportPicks.has(hero.id);
    const status = hero.dead
      ? "FALLEN"
      : hero.hardcore
        ? "HARDCORE"
        : "SOFTCORE";
    return {
      label: hero.name,
      aria: `export-hero-${hero.id}`,
      // Per-hero data, not help — stays a second line in the row (the
      // checkbox centres against both lines), rather than the bottom help
      // line where a settings blurb goes.
      subtitle: `LV ${level} - ${status}`,
      check: {
        checked: on,
        set: (next: boolean) => ctx.toggleExportPick(hero.id, next),
      },
      action: () => ctx.toggleExportPick(hero.id, !on),
    };
  });
  const count = ctx.roster.filter((c) => ctx.exportPicks.has(c.id)).length;
  const canExport = count > 0;
  return [
    ...heroRows,
    {
      label: canExport ? `EXPORT (${count})` : "EXPORT",
      aria: "export-confirm",
      // Greyed and inert until at least one hero is ticked (mirrors a
      // locked level row): choosing it just buzzes.
      color: canExport ? "#7ef0c8" : "#5a6068",
      locked: !canExport,
      blurb: canExport
        ? "DOWNLOAD THE TICKED HEROES AS SIGNED FILES"
        : "TICK A HERO ABOVE TO EXPORT",
      action: () => {
        if (!canExport) {
          playUiSound(synth, "back");
          return;
        }
        void ctx.exportPicked();
      },
    },
    // Land back on the EXPORT CHARACTER row in DATA (the first row).
    backTo(ctx, "data", 0),
  ];
}
