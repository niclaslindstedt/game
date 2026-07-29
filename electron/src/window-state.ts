// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Remembering the window's size, position and maximized/fullscreen state
// between launches.
//
// A browser tab has no such memory and needs none — the browser owns the
// window. A desktop app that reopens at 1280×720 in the middle of the screen
// every single launch, after the player has sized it to their monitor, reads as
// a web page in a frame rather than as a game they installed. This is the
// cheapest thing that fixes that.
//
// It deliberately does NOT go through the game's own settings
// (pwa/src/game/settings.ts): window geometry is device-shaped state, and the
// game's settings now ride CLOUD SAVE to the player's other machines. A window
// rect from a 4K desktop restored onto a laptop would be actively wrong — the
// same reasoning that already keeps key bindings and the parked run out of the
// synced payload. So it lives here, in the shell, in the OS's per-user app
// directory, and never leaves the machine.
//
// Every read is defensive: the file is user-writable and survives across
// updates, so it must be treated as untrusted input rather than as something we
// wrote. A rect that no longer lands on any attached display is discarded
// rather than restored — otherwise unplugging a second monitor leaves the game
// opening off-screen with no way to get it back.
//
// The module is PURE: the caller passes the attached displays in rather than
// this reaching for Electron's `screen`. That keeps the whole of it testable
// under a plain Node process — which matters, because the validation below is
// the part with the bugs in it, and a module that imported `electron` could
// only ever be exercised inside a real Electron run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { output } from "./output";

/** One display's usable area (Electron's `Display.workArea`), passed in by the
 * caller so this module needs no Electron. */
export type DisplayArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The remembered geometry. All fields optional — a first launch has none. */
export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
};

/** The shipped default: 16:9 and comfortably above the game's own small-screen
 * floor, so a first launch is a sensible landscape window rather than whatever
 * Electron would pick. */
export const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 720,
  maximized: false,
  fullscreen: false,
};

/** The smallest the window may be dragged. The game's reference floor is the
 * iPhone SE's 667×375 landscape viewport (pwa/scripts/ui-shots.mjs), so this is
 * that with room for the window chrome — below it the HUD starts colliding. */
export const MIN_WIDTH = 700;
export const MIN_HEIGHT = 400;

function stateFile(userDataDir: string): string {
  return join(userDataDir, "window-state.json");
}

/**
 * Read the remembered state, falling back to the default on anything at all
 * wrong with it — missing, unparseable, hand-edited, or describing a rect that
 * no longer fits any attached display.
 */
export function loadWindowState(
  userDataDir: string,
  areas: readonly DisplayArea[],
): WindowState {
  const file = stateFile(userDataDir);
  if (!existsSync(file)) return { ...DEFAULT_STATE };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<WindowState>;
    const width = positive(raw.width) ?? DEFAULT_STATE.width;
    const height = positive(raw.height) ?? DEFAULT_STATE.height;
    const state: WindowState = {
      width: Math.max(MIN_WIDTH, width),
      height: Math.max(MIN_HEIGHT, height),
      maximized: raw.maximized === true,
      fullscreen: raw.fullscreen === true,
    };
    // Only keep a position that still lands on a display — see the header.
    if (
      typeof raw.x === "number" &&
      typeof raw.y === "number" &&
      Number.isFinite(raw.x) &&
      Number.isFinite(raw.y) &&
      onSomeDisplay(raw.x, raw.y, state.width, state.height, areas)
    ) {
      state.x = Math.round(raw.x);
      state.y = Math.round(raw.y);
    }
    return state;
  } catch {
    output.warn("window-state: unreadable, falling back to the default size");
    return { ...DEFAULT_STATE };
  }
}

/** Persist the state. Never throws — a game must not fail to close because it
 * could not write a convenience file. */
export function saveWindowState(userDataDir: string, state: WindowState): void {
  try {
    const file = stateFile(userDataDir);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    output.warn(`window-state: could not save — ${describe(err)}`);
  }
}

/**
 * Does this rect overlap the working area of any attached display?
 *
 * Overlap, not containment: a window the player deliberately hung off the edge
 * of their screen should come back where they left it. What this rejects is a
 * rect with NO intersection anywhere — the unplugged-monitor case, where
 * restoring faithfully means opening somewhere the player cannot reach.
 */
function onSomeDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
  areas: readonly DisplayArea[],
): boolean {
  return areas.some(
    (area) =>
      x < area.x + area.width &&
      x + width > area.x &&
      y < area.y + area.height &&
      y + height > area.y,
  );
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
