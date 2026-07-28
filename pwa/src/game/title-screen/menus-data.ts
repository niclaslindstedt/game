// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SETTINGS → DATA: getting heroes off this device. Two ways, and each build
// gets exactly one of them. CLOUD SAVE (native app only) is the automatic one —
// the player's own devices keep one roster and one coin bank between them, with
// no files to shuffle, and never leave that player's account. EXPORT/IMPORT
// (web only) is the manual one, and it is also how a hero moves to somebody
// ELSE's device — which is why the store app doesn't have it: the platform
// achievements the app will mint off a hero have to be a claim about the player
// who played it, not about a file they were handed. The plumbing lives in
// use-cloud-save.ts / use-character-transfer.ts — these builders only lay out
// the rows.

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";
import { cloudBlurb, cloudValue } from "./use-cloud-save.ts";

/** Where EXPORT CHARACTER sits in the DATA menu — the row the picker's BACK
 * homes on. It is the FIRST row: the CLOUD SAVE row that would sit above it
 * belongs to the native app, and that build has no EXPORT row (so no picker to
 * come back from) in the first place. */
const EXPORT_ROW = 0;

export function buildDataMenu(ctx: MenuContext): MenuEntry[] {
  // Character transfer: EXPORT opens a picker over the WHOLE roster (tick
  // one or many, not just the current game); IMPORT loads any exported hero
  // back via a file picker. Both are web-only (see `transferOpen`), so the
  // store app's DATA screen is CLOUD SAVE alone.
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
    ...(ctx.transferOpen
      ? [
          {
            label: "EXPORT CHARACTER",
            aria: "data-export-character",
            icon: "icon_menu_export",
            blurb: "SAVE ONE OR MORE HEROES TO FILES",
            action: () => {
              playUiSound(synth, "confirm");
              // Fresh roster snapshot, no picks, no notice.
              ctx.beginExportPicker();
              ctx.setScreen("export");
              ctx.setCursor(0);
            },
          } satisfies MenuEntry,
          {
            label: "IMPORT CHARACTER",
            aria: "data-import-character",
            icon: "icon_menu_import",
            blurb: "LOAD A HERO EXPORTED FROM ANOTHER DEVICE",
            action: ctx.pickImport,
          } satisfies MenuEntry,
        ]
      : []),
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
      backTo(ctx, "data", EXPORT_ROW),
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
    backTo(ctx, "data", EXPORT_ROW),
  ];
}
