// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MODS screen — every installed Workshop mod, and the way into one.
//
// It hangs off the MAIN menu rather than off SETTINGS, and that is a statement
// about what mods are here: not a preference the player toggles once, but a
// second front door to the game. A total conversion is a different game living
// in the same binary, and burying it three rows deep under SETTINGS » MODS
// would say it was a configuration detail.
//
// Two things the screen has to do that a plain list would not:
//
//  1. **SHOW THE MODS THAT DID NOT COMPILE.** A player who subscribed to
//     something and then finds an empty list has no way at all to learn why. A
//     broken mod appears greyed, with its first error as the blurb, so the
//     answer is on the screen the player is already looking at rather than in a
//     log they will never open.
//  2. **SAY WHICH ONE IS ON.** The applied mod carries a marker, because "am I
//     playing the game or someone's conversion of it" is the single most
//     confusing thing a modded install can be vague about.

// The import-free LEAF, never `mods.ts` — that one imports `@game/core`, and
// this builder is on the app's startup path. See mod-state.ts.
import { activeMod, type ModStamp } from "../mod-state.ts";
import type { InstalledMod } from "../../app/mods-bridge.ts";
import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  backTo,
  type MenuContext,
  type MenuEntry,
  type ModsMenuState,
} from "./menu-model.ts";
import { mainRowIndex } from "./menus-main.ts";

export function buildModsMenu(
  ctx: MenuContext,
  state: ModsMenuState,
): MenuEntry[] {
  const back = backTo(ctx, "main", mainRowIndex(ctx, "mods"));
  const active = activeMod();

  // Compiling a folder of YAML per mod takes a moment on a cold disk, and an
  // empty list would read as "you have no mods" — which is a different and
  // wrong answer.
  if (state.mods === null) {
    return [
      {
        label: "LOADING...",
        aria: "mods-loading",
        color: "#5a6068",
        locked: true,
        action: () => {},
      },
      back,
    ];
  }

  if (state.mods.length === 0) {
    return [
      {
        label: "NO MODS INSTALLED",
        aria: "mods-empty",
        color: "#5a6068",
        locked: true,
        blurb: "SUBSCRIBE ON THE STEAM WORKSHOP - THEY APPEAR HERE",
        action: () => {},
      },
      back,
    ];
  }

  return [
    ...state.mods.flatMap((mod) => {
      const row = modRow(mod, active, state);
      // A LOCAL mod is one the player is authoring, so it — and only it — gets
      // a PUBLISH row of its own beneath it. A subscription is somebody else's
      // to update. A row rather than a second action on the mod's own row,
      // because a menu entry here has exactly one action and inventing a
      // secondary one for this single case would be new machinery every other
      // screen then has to ignore.
      if (mod.source !== "local" || mod.bundle === null) return [row];
      return [row, publishRow(mod, state)];
    }),
    back,
  ];
}

function publishRow(mod: InstalledMod, state: ModsMenuState): MenuEntry {
  return {
    // The font's own `»`, the same glyph the screen headings use for a path,
    // so the row reads as belonging to the mod above it without a new
    // indent capability every other menu would then have to ignore.
    label: "» PUBLISH TO WORKSHOP",
    aria: `mod-publish-${mod.key}`,
    blurb: "UPLOADS THIS FOLDER AS YOU WROTE IT - UPDATES THE SAME ITEM",
    action: () => {
      playUiSound(synth, "confirm");
      state.onPublish(mod);
    },
  };
}

function modRow(
  mod: InstalledMod,
  active: ModStamp | null,
  state: ModsMenuState,
): MenuEntry {
  const broken = mod.bundle === null;
  const on = !broken && active?.id === mod.bundle!.id;

  if (broken) {
    return {
      label: shortName(mod),
      aria: `mod-${mod.key}`,
      color: "#5a6068",
      locked: true,
      // The FIRST error only: the row has one line, and a player who needs all
      // of them is the author, who has the CLI. Naming the count tells them
      // there are more without pretending this is the whole report.
      blurb: modErrorBlurb(mod),
      action: () => {
        playUiSound(synth, "back");
      },
    };
  }

  const bundle = mod.bundle!;
  return {
    label: bundle.name,
    aria: `mod-${mod.key}`,
    // The applied mod is marked in the value column rather than by recolouring
    // the label: amber belongs to the selection alone.
    value: on ? "ON" : undefined,
    subtitle: `V${bundle.version} - ${bundle.author}`,
    blurb: modBlurb(bundle, mod),
    action: () => {
      playUiSound(synth, "confirm");
      state.onPlay(mod);
    },
  };
}

/** A broken mod's one line: what went wrong, and how much else did. */
function modErrorBlurb(mod: InstalledMod): string {
  const first = (mod.errors[0] ?? "IT DID NOT COMPILE").toUpperCase();
  const rest = mod.errors.length - 1;
  return rest > 0 ? `${first} (+${rest} MORE)` : first;
}

/** A working mod's one line: what it does to the game, then what it holds. */
function modBlurb(
  bundle: NonNullable<InstalledMod["bundle"]>,
  mod: InstalledMod,
): string {
  const parts: string[] = [
    bundle.kind === "conversion" ? "REPLACES THE CAMPAIGN" : "ADDS TO THE GAME",
  ];
  if (bundle.levels.length > 0) {
    parts.push(`${bundle.levels.length} LEVEL${plural(bundle.levels.length)}`);
  }
  const monsters = Object.keys(bundle.enemies).length;
  if (monsters > 0) parts.push(`${monsters} MONSTER${plural(monsters)}`);
  if (mod.needsUpdate) parts.push("UPDATE PENDING");
  return parts.join(" - ");
}

const plural = (n: number) => (n === 1 ? "" : "S");

/** A broken mod has no compiled name, so the folder is all there is to call
 * it by — which is also the thing its author needs to hear named. */
function shortName(mod: InstalledMod): string {
  const stem = mod.folder.split(/[/\\]/).filter(Boolean).pop() ?? mod.key;
  return stem.toUpperCase().slice(0, 24);
}
