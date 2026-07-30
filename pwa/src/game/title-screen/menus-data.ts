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
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";
import { cloudBlurb, cloudValue } from "./use-cloud-save.ts";

export function buildDataMenu(ctx: MenuContext): MenuEntry[] {
  // Character transfer: EXPORT opens a picker over the WHOLE roster (tick one
  // or many, not just the current game); IMPORT loads any exported hero back
  // via a file picker. Both are web-only (see `transferOpen`), so the store
  // app's DATA screen is CLOUD SAVE alone.
  return [
    ...assembleRows("data", {
      // Only in a build with a platform cloud behind it (the native app) — a
      // browser has none, and a row that could never turn on is just noise. Its
      // help is the live sync state, so it is worded here rather than in the
      // tree.
      "cloud-save": ctx.cloudOpen
        ? actionRow("data", "cloud-save", () => void ctx.runCloudSync(), {
            value: cloudValue(ctx.cloudState),
            help: cloudBlurb(ctx.cloudState),
          })
        : null,
      export: ctx.transferOpen
        ? navRow(ctx, "data", "export", {
            before: () => ctx.beginExportPicker(),
          })
        : null,
      import: ctx.transferOpen
        ? actionRow("data", "import", ctx.pickImport)
        : null,
    }),
    backRow(ctx, "data"),
  ];
}

export function buildExportMenu(ctx: MenuContext): MenuEntry[] {
  // The EXPORT CHARACTER picker: a ticked list of the WHOLE roster (not the
  // active hero), then one download per ticked hero. A fallen hardcore hero
  // still exports — a backup is a backup.
  const empty = ctx.roster.length === 0;
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
      aria: rowAria("export", `hero-${hero.id}`),
      // Per-hero data, not help — stays a second line in the row (the checkbox
      // centres against both lines), rather than the bottom help line where a
      // settings blurb goes.
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
    ...assembleRows("export", {
      // The empty roster's one row, in place of the heroes that would be here.
      none: empty
        ? actionRow("export", "none", () => playUiSound(synth, "back"), {
            locked: true,
          })
        : null,
      confirm: empty
        ? null
        : {
            ...actionRow(
              "export",
              "confirm",
              () => {
                if (!canExport) {
                  playUiSound(synth, "back");
                  return;
                }
                void ctx.exportPicked();
              },
              {
                // Greyed and inert until at least one hero is ticked (mirrors a
                // locked level row): choosing it just buzzes.
                color: canExport ? "#7ef0c8" : "#5a6068",
                locked: !canExport,
                state: canExport ? "ready" : "empty",
              },
            ),
            label: canExport ? `EXPORT (${count})` : "EXPORT",
          },
    }),
    backRow(ctx, "export"),
  ];
}
