// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TAKING A PICTURE OF THE GAME — what the SCREENSHOT bind (ENTER on the web,
// F12 in a store shell) actually does, and the one place the roll, the shells
// and the gallery meet.
//
// WHAT IS IN THE PICTURE is the whole screen as the player is seeing it: the
// world canvas AND the interface over it — the vitals, the minimap, the docks,
// whatever splash or overlay is up. A screenshot of the bare canvas would be a
// picture of the game with the game taken out of it, and the HUD is not chrome
// here, it is half of what a player wants to show somebody ("look at this
// build"). So the capture is a raster of the whole screen subtree (@ui/lib's
// dom-raster, which is already the machinery the item card is copied with) and
// not `canvas.toDataURL`.
//
// TWO THINGS DELIBERATELY DO NOT SURVIVE IT, both because they are CSS
// compositing rather than content: the colour grade and the vignette (a
// `filter` and two gradient layers from DEVELOPER → VISUALS), and the panel grain.
// The picture is the game's pixels at their own resolution, integer-scaled up —
// which is what a pixel-art screenshot should be anyway, and what makes it
// legible in a chat window sized for photographs.
//
// WHERE IT GOES, in this order and always all of them that apply:
//
//   1. THE ROLL — @ui/lib/shot-store.ts, an IndexedDB roll capped at
//      MAX_SHOTS. This is the copy the in-game gallery browses, and the only
//      one every build has.
//   2. THE SHELL — a store build files its own copy where that platform keeps
//      pictures (../app/screenshot-bridge.ts). Best-effort and never awaited by
//      the flash: a slow disk may not hold up the celebration.
//   3. STEAM — nothing to do, and that is the finding rather than an omission.
//      Steam's overlay hooks the same key at the swap chain and files its own
//      copy in the player's Steam screenshot library, which is the library
//      Steam players expect a screenshot to reach; the game neither drives nor
//      swallows that. `electron/src/screenshots-provider.ts` carries the whole
//      reasoning and what calling ISteamScreenshots directly would cost.

import { canvasToPng, rasterizeElement } from "@ui/lib/dom-raster.ts";
import {
  configureShotStore,
  putShot,
  type ShotMeta,
} from "@ui/lib/shot-store.ts";

// `@game/menu` rather than `@game/core`, and deliberately: the GALLERY reads
// this module for the roll's cap and the file name, and the gallery is reached
// from the TITLE MENU — so an import of the whole engine here would put the
// simulation one hop off the startup path (AGENTS.md, the 170 KB budget).
import { warn } from "@game/menu";

import { IDENTITY, storageKey } from "../identity.ts";
import {
  fileShot,
  initShotsBridge,
  shotsBridgeAvailable,
} from "../app/screenshot-bridge.ts";

/** How many pictures the roll keeps. Sized so a long session's worth of
 * "look at this" survives without the roll becoming an unmanaged disk cost:
 * fifty pictures of a 844x390 field at 2x is on the order of 30 MB, which is
 * the same magnitude as the game's own precache and nothing a player has to be
 * told about. Oldest fall off first. */
export const MAX_SHOTS = 50;

/**
 * How far the picture is blown up over the CSS pixels on screen, and the cap on
 * the result. Pixel art wants an INTEGER blow-up (nearest-neighbour, no
 * resampling), and it wants enough of one that a chat client's own downscale
 * still leaves the pixels square: a 844x390 phone field lands at 1688x780.
 *
 * The cap bounds the BLOW-UP, never the picture. A screen already wider than
 * `MAX_WIDTH` takes scale 1 — the pixels exactly as they are — because the only
 * way below that is a resample, which is the one thing a pixel-art screenshot
 * must not have done to it. What the cap actually prevents is a wide window
 * being doubled into a picture nothing wants to send anywhere.
 */
const TARGET_WIDTH = 1920;
const MAX_WIDTH = 2560;

/** Every element carrying this attribute is left OUT of the picture — the
 * flash miniature, which is chrome ABOUT a screenshot and must never end up
 * inside the next one. */
export const SHOT_HIDDEN_ATTR = "data-shot-hidden";

/** What a fresh capture hands back: the roll entry plus the pixels, so the
 * flash can show the miniature without going back to the store. */
export type Capture = { meta: ShotMeta; blob: Blob; url: string };

let armed = false;

/**
 * Name the roll and announce the page to the shell.
 *
 * Called from every entry point that touches the roll — a capture, and the
 * gallery opening — rather than from the app's boot, because a player who
 * never presses the key should pay for none of it. Idempotent, and it must run
 * before the store is read: an unnamed store is a DIFFERENT database, so a
 * gallery that skipped this would open on an empty roll.
 */
export function armScreenshots(): void {
  if (armed) return;
  armed = true;
  configureShotStore({ dbName: storageKey("shots"), limit: MAX_SHOTS });
  initShotsBridge();
}

/** The picture's file name, on disk and in a share sheet: the game, where the
 * shot was taken, and when — sortable, lowercase, no spaces. */
export function shotFileName(label: string, takenAt: number): string {
  const stamp = new Date(takenAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  return `${slug(IDENTITY.shortName)}-${slug(label) || "shot"}-${stamp}.png`;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      // Apostrophes are DROPPED rather than separated on — the game's own name
      // carries one, and "ada-s-trail" is not what anybody would call the file.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  );
}

/**
 * Take the picture.
 *
 * Resolves the capture, or null when the browser declined to encode one (a
 * torn-down page, a canvas the compositor had already released). Never throws:
 * a screenshot that cannot be taken is a keypress that did nothing, never a
 * run that ended.
 */
export async function captureScreen(
  root: HTMLElement,
  label: string,
): Promise<Capture | null> {
  armScreenshots();
  try {
    const rect = root.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const canvas = rasterizeElement(root, {
      scale: captureScale(rect.width),
      skip: (el) => el.hasAttribute(SHOT_HIDDEN_ATTR),
    });
    const blob = await canvasToPng(canvas);
    const takenAt = Date.now();
    const meta = putShot({
      takenAt,
      width: canvas.width,
      height: canvas.height,
      label,
      blob,
    });
    const capture = { meta, blob, url: URL.createObjectURL(blob) };
    // The shell's own copy — a desktop player's pictures folder, a phone's
    // app storage. Deliberately not awaited: the flash is already up.
    if (shotsBridgeAvailable()) {
      void fileShot(shotFileName(label, takenAt), blob);
    }
    return capture;
  } catch (err) {
    warn(`screenshot capture failed: ${String(err)}`);
    return null;
  }
}

/** The integer blow-up for a screen this wide — see TARGET_WIDTH. */
export function captureScale(cssWidth: number): number {
  if (cssWidth < 1) return 1;
  const wanted = Math.max(1, Math.round(TARGET_WIDTH / cssWidth));
  const capped = Math.max(1, Math.floor(MAX_WIDTH / cssWidth));
  return Math.max(1, Math.min(wanted, capped));
}
