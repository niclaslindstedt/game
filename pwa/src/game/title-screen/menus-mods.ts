// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS screen — every installed mod, in LOAD ORDER, and the way into them.
//
// It hangs off the MAIN menu rather than off SETTINGS, and that is a statement
// about what mods are here: not a preference the player toggles once, but a
// second front door to the game. A total conversion is a different game living
// in the same binary, and burying it three rows deep under SETTINGS » MODS
// would say it was a configuration detail.
//
// THE LIST IS ORDERED, AND THE ORDER IS VISIBLE. Two mods that ship the same
// sprite both compile — each was authored alone — so the clash can only be
// resolved at load, by a rule the player can see and change: LATER WINS. The
// rows are therefore numbered, the arrows move a row, and a mod that is
// currently being overridden by a later one says so on its own help line. A
// load order the player cannot see is just an arbitrary winner.
//
// Two more things the screen has to do that a plain list would not:
//
//  1. **SHOW THE MODS THAT DID NOT COMPILE.** A player who subscribed to
//     something and then finds an empty list has no way at all to learn why. A
//     broken mod appears greyed, with its first error as the blurb, so the
//     answer is on the screen the player is already looking at rather than in a
//     log they will never open.
//  2. **SAY WHICH ONES ARE ON.** Every row is a switch, because "am I playing
//     the game or someone's conversion of it" is the single most confusing
//     thing a modded install can be vague about.

import type { InstalledMod } from "../../app/mods-bridge.ts";
import { synth } from "../audio.ts";
// The import-free LEAVES, never `mods.ts` — that one reaches `@game/core`, and
// this builder is on the app's startup path. See mod-state.ts.
import type { ModClash } from "../mod-state.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  type MenuContext,
  type MenuEntry,
  type ModsMenuState,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

export function buildModsMenu(
  ctx: MenuContext,
  state: ModsMenuState,
): MenuEntry[] {
  const loading = state.rows === null;
  const empty = state.rows !== null && state.rows.length === 0;
  const enabled = (state.rows ?? []).filter((row) => row.on && row.mod.bundle);
  return [
    // The installed mods stand above the tree's own rows — and exactly one of
    // the three states is ever on screen, so the LOADING / NO MODS lines fall
    // where the list would have been.
    ...(state.rows ?? []).flatMap((row, at) => {
      const rows = [modRow(row.mod, at, state)];
      // A LOCAL mod is one the player is authoring, so it — and only it — gets
      // a PUBLISH row. A subscription is somebody else's to update.
      if (row.mod.source === "local" && row.mod.bundle) {
        rows.push(publishRow(row.mod, state));
      }
      return rows;
    }),
    ...assembleRows("mods", {
      loading: loading ? inert("mods", "loading") : null,
      empty: empty ? inert("mods", "empty") : null,
      // Reordering is its own screen; see buildModOrderMenu.
      order: navRow(ctx, "mods", "order", {
        locked: (state.rows?.length ?? 0) < 2,
        color: (state.rows?.length ?? 0) > 1 ? undefined : "#5a6068",
        state: (state.rows?.length ?? 0) > 1 ? "many" : "one",
      }),
      play: actionRow(
        "mods",
        "play",
        () => {
          if (enabled.length === 0) {
            playUiSound(synth, "back");
            return;
          }
          playUiSound(synth, "confirm");
          state.onPlay();
        },
        {
          locked: enabled.length === 0,
          color: enabled.length > 0 ? undefined : "#5a6068",
          help:
            enabled.length > 0
              ? `${enabled.length} MOD${plural(enabled.length)} - LOADED TOP TO BOTTOM, THE LAST ONE WINS A CLASH`
              : undefined,
          state: "none",
        },
      ),
    }),
    backRow(ctx, "mods"),
  ];
}

/** A row that is there to say something, not to be pressed. */
function inert(screen: "mods" | "modorder", id: string): MenuEntry {
  return actionRow(screen, id, () => {}, {
    color: "#5a6068",
    locked: true,
  });
}

function publishRow(mod: InstalledMod, state: ModsMenuState): MenuEntry {
  return {
    // The font's own `»`, the same glyph the screen headings use for a path,
    // so the row reads as belonging to the mod above it without a new indent
    // capability every other menu would then have to ignore.
    label: "» PUBLISH TO WORKSHOP",
    aria: rowAria("mods", `publish-${mod.key}`),
    blurb: "UPLOADS THIS FOLDER AS YOU WROTE IT - UPDATES THE SAME ITEM",
    action: () => {
      playUiSound(synth, "confirm");
      state.onPublish(mod);
    },
  };
}

function modRow(
  mod: InstalledMod,
  at: number,
  state: ModsMenuState,
): MenuEntry {
  const place = `${at + 1}.`;

  if (!mod.bundle) {
    return {
      // A broken mod has no compiled name, so the folder is all there is to
      // call it by — which is also what its author needs to hear named.
      label: `${place} ${folderName(mod)}`,
      aria: rowAria("mods", mod.key),
      color: "#5a6068",
      locked: true,
      blurb: errorBlurb(mod),
      action: () => {},
    };
  }

  const bundle = mod.bundle;
  const on = state.isOn(mod.bundle.id);
  return {
    label: `${place} ${bundle.name}`,
    aria: rowAria("mods", mod.key),
    subtitle: `V${bundle.version} - ${bundle.author}`,
    blurb: modBlurb(mod, state),
    // A switch, because a mod is straightforwardly on or off — and the arrows
    // then steer it, which is why REORDERING is its own screen rather than a
    // second meaning for the same two keys.
    toggle: {
      on,
      set: (next) => {
        playUiSound(synth, next ? "confirm" : "back");
        state.setEnabled(bundle.id, next);
      },
    },
    action: () => {
      playUiSound(synth, on ? "back" : "confirm");
      state.setEnabled(bundle.id, !on);
    },
  };
}

/** A broken mod's one line: what went wrong, and how much else did. */
function errorBlurb(mod: InstalledMod): string {
  const first = (mod.errors[0] ?? "IT DID NOT COMPILE").toUpperCase();
  const rest = mod.errors.length - 1;
  return rest > 0 ? `${first} (+${rest} MORE)` : first;
}

/**
 * A working mod's one line. What it OVERRIDES comes first when there is
 * anything, because that is the fact a player is on this screen to find: a mod
 * that looks installed and switched on but is not drawing what they expected is
 * the whole reason a load order needs a UI.
 */
function modBlurb(mod: InstalledMod, state: ModsMenuState): string {
  const bundle = mod.bundle!;
  const lost = state.overriddenIds(bundle.id);
  if (lost > 0) {
    return `${lost} OF ITS ID${lost === 1 ? "" : "S"} ARE OVERRIDDEN BY A LATER MOD - MOVE IT DOWN TO WIN`;
  }

  const parts: string[] = [
    bundle.kind === "conversion" ? "REPLACES THE CAMPAIGN" : "ADDS TO THE GAME",
  ];
  if (bundle.levels.length > 0) {
    parts.push(`${bundle.levels.length} LEVEL${plural(bundle.levels.length)}`);
  }
  const monsters = Object.keys(bundle.enemies).length;
  if (monsters > 0) parts.push(`${monsters} MONSTER${plural(monsters)}`);
  const powers = Object.keys(bundle.powerups ?? {}).length;
  if (powers > 0) parts.push(`${powers} POWER${plural(powers)}`);
  if (bundle.sprites.length > 0) {
    parts.push(
      `${bundle.sprites.length} SPRITE${plural(bundle.sprites.length)}`,
    );
  }
  // Where it came from, but only when it is the answerable question: a mod
  // somebody dropped in as a folder or a zip is the one a player is looking
  // for confirmation of, and it is also how two mods of the same name are told
  // apart. A subscription needs no label — the Workshop is the default.
  if (mod.source === "portable") parts.push("A FILE YOU ADDED");
  if (mod.needsUpdate) parts.push("UPDATE PENDING");
  return parts.join(" - ");
}

/**
 * The LOAD ORDER screen: the same mods, reordered rather than switched.
 *
 * Its own screen because the arrows are already spoken for on the list — they
 * flip a mod's switch there — and one pair of keys cannot mean both "on/off"
 * and "earlier/later" without the player having to remember which screen they
 * are on. Here they mean only one thing.
 */
export function buildModOrderMenu(
  ctx: MenuContext,
  state: ModsMenuState,
): MenuEntry[] {
  const rows = state.rows ?? [];
  return [
    ...rows.map((row, at) => ({
      label: `${at + 1}. ${row.mod.bundle?.name ?? folderName(row.mod)}`,
      aria: rowAria("modorder", row.id),
      color: row.on ? undefined : "#5a6068",
      value: row.on ? undefined : "OFF",
      blurb:
        at === rows.length - 1
          ? "LAST - THIS ONE WINS EVERY CLASH"
          : "USE LEFT AND RIGHT TO MOVE IT - LATER WINS A CLASH",
      reorder: {
        move: (dir: -1 | 1) => state.move(row.id, dir),
      },
      // Confirm moves it later and wraps, so the screen works on a touch
      // device and a mouse, which have no arrow keys to steer with.
      action: () => {
        playUiSound(synth, "move");
        state.move(row.id, at === rows.length - 1 ? -1 : 1);
      },
    })),
    ...assembleRows("modorder", {
      none: rows.length === 0 ? inert("modorder", "none") : null,
    }),
    backRow(ctx, "modorder"),
  ];
}

const plural = (n: number) => (n === 1 ? "" : "S");

function folderName(mod: InstalledMod): string {
  const stem = mod.folder.split(/[/\\]/).filter(Boolean).pop() ?? mod.key;
  return stem.toUpperCase().slice(0, 24);
}

/** The clashes one mod LOST — ids a later mod also defines. */
export function overriddenCount(clashes: ModClash[], modId: string): number {
  return clashes.filter((clash) => {
    const at = clash.claimedBy.indexOf(modId);
    return at >= 0 && at < clash.claimedBy.length - 1;
  }).length;
}
