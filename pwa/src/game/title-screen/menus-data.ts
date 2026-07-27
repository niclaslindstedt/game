// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SETTINGS → DATA: getting heroes off this device. Two ways, and they answer
// different needs. CLOUD SAVE (native app only) is the automatic one — the
// player's own devices keep one roster and one coin bank between them, with no
// files to shuffle. EXPORT/IMPORT is the manual one that works everywhere,
// including the website, and is also how a hero moves to somebody ELSE's
// device. The plumbing lives in use-cloud-save.ts / use-character-transfer.ts —
// these builders only lay out the rows.

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";
import { cloudBlurb, cloudValue } from "./use-cloud-save.ts";

/** Where EXPORT CHARACTER sits in the DATA menu — the CLOUD SAVE row above it
 * exists only in the native app, so the index isn't a constant. */
function exportRowIndex(ctx: MenuContext): number {
  return ctx.cloudOpen ? 1 : 0;
}

export function buildDataMenu(ctx: MenuContext): MenuEntry[] {
  // Character transfer: EXPORT opens a picker over the WHOLE roster (tick
  // one or many, not just the current game); IMPORT loads any exported hero
  // back via a file picker.
  return [
    // Only in a build with a platform cloud behind it (the native app) — a
    // browser has none, and a row that could never turn on is just noise.
    ...(ctx.cloudOpen
      ? [
          {
            label: "CLOUD SAVE",
            aria: "data-cloud-save",
            icon: "icon_menu_export",
            value: cloudValue(ctx.cloudState),
            blurb: cloudBlurb(ctx.cloudState),
            action: () => void ctx.runCloudSync(),
          } satisfies MenuEntry,
        ]
      : []),
    {
      label: "EXPORT CHARACTER",
      aria: "data-export-character",
      icon: "icon_menu_export",
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
      icon: "icon_menu_import",
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
      backTo(ctx, "data", exportRowIndex(ctx)),
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
      icon: "icon_menu_export",
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
    // Land back on the EXPORT CHARACTER row in DATA.
    backTo(ctx, "data", exportRowIndex(ctx)),
  ];
}
