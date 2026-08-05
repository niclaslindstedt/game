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
//  2. **SAY WHICH ONES ARE ON.** Every row wears ON or OFF, because "am I
//     playing the game or someone's conversion of it" is the single most
//     confusing thing a modded install can be vague about.
//
// A row OPENS the mod rather than flipping it (`buildModInfoMenu` below). The
// list is a list of things to read about first: what a mod actually puts in the
// game is its author's own inventory (`contents:` in its manifest), which is
// far more than a row can hold — and switching on a total conversion is a
// bigger decision than a tap on a list should carry. The switch is the first
// row of the page the tap opens.

import type { InstalledMod } from "../../app/mods-bridge.ts";
import { synth } from "../audio.ts";
// The import-free LEAVES, never `mods.ts` — that one reaches `@game/core`, and
// this builder is on the app's startup path. See mod-state.ts.
import type { ModBundle, ModClash, ModContent } from "../mod-state.ts";
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
    ...(state.rows ?? []).map((row, at) => modRow(ctx, row.mod, at, state)),
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
      // The two folders the list was read from. Pressing one opens it in the
      // desktop's own file manager, which is the whole answer to "where do I
      // put it" — and the screen re-reads itself on every entry, so dropping a
      // mod in and coming back is the loop.
      "folder-mods": folderRow(state, "local"),
      "folder-game": folderRow(state, "portable"),
    }),
    backRow(ctx, "mods"),
  ];
}

/** A row that is there to say something, not to be pressed. */
function inert(screen: "mods" | "modinfo" | "modorder", id: string): MenuEntry {
  return actionRow(screen, id, () => {}, {
    color: "#5a6068",
    locked: true,
  });
}

/**
 * A row that opens one of the game's mods folders.
 *
 * Null when the platform has no such folder (macOS has no install-folder
 * option — see `electron/src/mods.ts`) or before the first list has answered:
 * a row offering to open a folder we cannot name is a row that does nothing.
 */
function folderRow(
  state: ModsMenuState,
  which: "local" | "portable",
): MenuEntry | null {
  const dir =
    which === "local" ? state.folders?.local : state.folders?.portable;
  if (!dir) return null;
  return actionRow(
    "mods",
    which === "local" ? "folder-mods" : "folder-game",
    () => {
      playUiSound(synth, "confirm");
      state.reveal(which);
    },
    // The path goes in the SUBTITLE, the slot the mod rows already use for a
    // concrete detail (version and author), leaving the tree's help line to say
    // what pressing the row does. Both are on screen at once, which is what the
    // row is for: what to do, and which folder to do it in.
    { subtitle: displayPath(dir) },
  );
}

/**
 * A filesystem path the pixel font can actually draw.
 *
 * Three things bite. The font is UPPERCASE-ONLY and falls back to `?` for any
 * glyph it has no cell for, so a Windows path (`C:\Users\…`) would render as a
 * row of question marks: separators are normalised to `/`, and anything else
 * the font lacks — an underscore, a tilde, an accent in somebody's user name —
 * becomes `-` rather than `?`. And a real path is longer than the row, so only
 * the tail is shown, which is the part that identifies the folder anyway.
 */
export function displayPath(dir: string): string {
  const slashed = dir.replace(/\\/g, "/").toUpperCase();
  const parts = slashed.split("/").filter(Boolean);
  const tail = parts.slice(-KEPT_SEGMENTS).join("/");
  // `...` only when segments were genuinely dropped — a short path that says
  // it was shortened is a small lie the player has no way to check.
  const shown =
    parts.length > KEPT_SEGMENTS
      ? `.../${tail}`
      : `${slashed.startsWith("/") ? "/" : ""}${tail}`;
  return shown.replace(/[^A-Z0-9./-]/g, "-");
}

/** How much tail identifies a folder: `…/ADASTRAIL/MODS` and one above it. */
const KEPT_SEGMENTS = 3;

function modRow(
  ctx: MenuContext,
  mod: InstalledMod,
  at: number,
  state: ModsMenuState,
): MenuEntry {
  const place = `${at + 1}.`;
  // A broken mod opens its page too — that is where the rest of its errors
  // are, and a row can only carry the first one.
  const open = () => {
    playUiSound(synth, "confirm");
    state.select(mod);
    ctx.setNotice(null);
    ctx.setScreen("modinfo");
    ctx.setCursor(0);
  };

  if (!mod.bundle) {
    return {
      // A broken mod has no compiled name, so the folder is all there is to
      // call it by — which is also what its author needs to hear named.
      label: `${place} ${folderName(mod)}`,
      aria: rowAria("mods", mod.key),
      color: "#5a6068",
      value: "BROKEN",
      blurb: errorBlurb(mod),
      action: open,
    };
  }

  const bundle = mod.bundle;
  return {
    label: `${place} ${bundle.name}`,
    aria: rowAria("mods", mod.key),
    subtitle: `V${bundle.version} - ${bundle.author}`,
    // ON or OFF, right-aligned like a settings value rather than drawn as a
    // switch: the row no longer flips anything, so a control that invites the
    // arrows to try would be lying about what pressing it does.
    value: state.isOn(bundle.id) ? "ON" : "OFF",
    blurb: modBlurb(mod, state),
    action: open,
  };
}

/** A broken mod's one line: what went wrong, and how much else did. */
function errorBlurb(mod: InstalledMod): string {
  const first = speakable(mod.errors[0] ?? "IT DID NOT COMPILE");
  const rest = mod.errors.length - 1;
  return rest > 0 ? `${first} (+${rest} MORE - OPEN IT)` : first;
}

/**
 * A string the pixel font can actually draw, as far as a swap can get it.
 *
 * Everything on this screen comes from OUTSIDE the game — a compiler message, a
 * stranger's manifest — and the font renders what it has no cell for as `?`.
 * Its quotes are the single most common offender (every compiler error names an
 * id in double quotes), and the font's own apostrophe says the same thing, so
 * that one is worth swapping rather than leaving as a row of question marks.
 * A mod's own authored lines are checked at COMPILE time (see `readContents`),
 * which is the fix that scales; this is the safety net for the text nobody
 * authored.
 */
function speakable(text: string): string {
  return text
    .replace(/[""„"]/g, "'")
    .replace(/[''‚]/g, "'")
    .replace(/…/g, "...")
    .toUpperCase();
}

/**
 * A working mod's one line. What it OVERRIDES comes first when there is
 * anything, because that is the fact a player is on this screen to find: a mod
 * that looks installed and switched on but is not drawing what they expected is
 * the whole reason a load order needs a UI.
 */
function modBlurb(mod: InstalledMod, state: ModsMenuState | null): string {
  const bundle = mod.bundle!;
  const lost = state?.overriddenIds(bundle.id) ?? 0;
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
 * ONE MOD'S PAGE: what it puts in the game, and the switch that decides
 * whether it does.
 *
 * The rows above the fold are the DECISION — the switch, and PUBLISH when the
 * mod is one the player is writing. Below them is the mod's own INVENTORY: one
 * row per file the game loads, carrying its author's line about what that file
 * is (`contents:` in the manifest). That list is the reason this screen exists.
 * Everything the app can work out for itself — two levels, nine sprites — is
 * arithmetic; only the author can say that the second level is a seed vault and
 * that one of the sounds replaces the shotgun's bark.
 *
 * A mod that did NOT compile gets the same page with its problems in place of
 * its inventory. The list row can only carry the first one, and "why will my
 * subscription not load" is a question that deserves the whole answer.
 */
export function buildModInfoMenu(
  ctx: MenuContext,
  state: ModsMenuState,
): MenuEntry[] {
  const mod = state.selected;
  if (!mod) return [backRow(ctx, "modinfo")];
  const bundle = mod.bundle;
  const on = bundle ? state.isOn(bundle.id) : false;
  const contents = bundle?.contents ?? [];

  return [
    ...assembleRows("modinfo", {
      enabled: {
        ...actionRow(
          "modinfo",
          "enabled",
          () => {
            if (!bundle) {
              playUiSound(synth, "back");
              return;
            }
            playUiSound(synth, on ? "back" : "confirm");
            state.setEnabled(bundle.id, !on);
          },
          {
            locked: !bundle,
            color: bundle ? undefined : "#5a6068",
            state: bundle ? undefined : "broken",
            subtitle: bundle
              ? `V${bundle.version} - ${speakable(bundle.author)}`
              : folderName(mod),
            // The author's own pitch, right under the switch it is there to
            // inform. A blurb is a line, not a paragraph, so a Workshop-length
            // description is cut rather than allowed to push the inventory off
            // the screen.
            help: bundle ? describe(bundle, mod) : undefined,
          },
        ),
        toggle: bundle
          ? {
              on,
              set: (next) => {
                playUiSound(synth, next ? "confirm" : "back");
                state.setEnabled(bundle.id, next);
              },
            }
          : undefined,
      },
      // A LOCAL mod is one the player is authoring, so it — and only it — gets
      // a PUBLISH row. A subscription is somebody else's to update.
      publish:
        mod.source === "local" && bundle
          ? actionRow("modinfo", "publish", () => {
              playUiSound(synth, "confirm");
              state.onPublish(mod);
            })
          : null,
      undeclared:
        bundle && contents.length === 0 ? inert("modinfo", "undeclared") : null,
    }),
    ...(bundle
      ? contents.map((entry, at) => contentRow(entry, at))
      : mod.errors.map((problem, at) => problemRow(problem, at))),
    backRow(ctx, "modinfo"),
  ];
}

/** What a mod says about itself, or — when it says nothing — what it ships. */
function describe(bundle: ModBundle, mod: InstalledMod): string {
  const own = speakable(bundle.description.trim());
  if (own)
    return own.length > DESCRIPTION_MAX
      ? `${own.slice(0, DESCRIPTION_MAX - 3).trimEnd()}...`
      : own;
  return modBlurb(mod, null);
}

/** A blurb is one line under a row; past this it wraps far enough to push the
 * inventory below the fold on a phone held in landscape. */
const DESCRIPTION_MAX = 96;

/** One file the mod ships, as its author described it. */
function contentRow(entry: ModContent, at: number): MenuEntry {
  return {
    label: fileName(entry.path),
    aria: rowAria("modinfo", `content-${at}`),
    subtitle: `${entry.change === "replaces" ? "REPLACES" : "ADDS"} ${whatItIs(entry.path)}`,
    blurb: speakable(entry.summary),
    // Reading matter, not a control: the cursor lands on it (that is how a
    // keyboard reads down the list) and pressing it does nothing rather than
    // buzzing, because there is nothing here that could have been done.
    action: () => {},
  };
}

/** One reason a mod did not compile. */
function problemRow(problem: string, at: number): MenuEntry {
  return {
    label: `PROBLEM ${at + 1}`,
    aria: rowAria("modinfo", `problem-${at}`),
    color: "#5a6068",
    blurb: speakable(problem),
    action: () => {},
  };
}

/** The file's own name, drawable: the pixel font has no underscore, so a
 * `greenhouse_creeper.yaml` would otherwise read as `GREENHOUSE?CREEPER`. */
function fileName(filePath: string): string {
  const stem = filePath.split("/").pop() ?? filePath;
  return stem
    .replace(/\.ya?ml$/i, "")
    .replace(/[_-]+/g, " ")
    .toUpperCase();
}

/** What KIND of thing a mod file is, from where it sits — the same layout the
 * compiler loads by (`mod/tools/layout.mjs`), said in a player's words. */
const CONTENT_KINDS: Record<string, string> = {
  "levels/": "A MISSION",
  "maps/": "A MAP",
  "enemies/": "A MONSTER",
  "items/": "AN ITEM",
  "sprites/": "ART",
  "sounds/": "A SOUND",
  "music/": "A TRACK",
  "cutscenes/": "A SCENE",
  "quests/": "AN ERRAND",
  "ladder.yaml": "A RUNG ON THE LADDER",
  "powerups.yaml": "POWERS",
  "talents.yaml": "TALENTS",
  "companions.yaml": "COMPANIONS",
  "sets.yaml": "ITEM SETS",
  "difficulties.yaml": "DIFFICULTY NAMES",
  "thoughts.yaml": "THE HERO'S THOUGHTS",
  "story-items.yaml": "STORY PIECES",
  "quest-givers.yaml": "PEOPLE WITH ERRANDS",
};

function whatItIs(filePath: string): string {
  for (const [where, what] of Object.entries(CONTENT_KINDS)) {
    if (filePath.startsWith(where)) return what;
  }
  return "CONTENT";
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
