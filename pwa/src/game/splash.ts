// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD — the policy behind `SplashScreen.tsx`: how long the card is
// held, what "the game is ready" means, and when the app is being driven by
// something that must not see a card at all.
//
// The card is not decoration. The app used to open straight onto the title
// menu and then visibly hitch as it arrived: the sprite atlas decoding, the
// planet shader's chunk coming down the wire, and nine worlds' surface
// textures baking one frame at a time under the orbiting backdrop. All of that
// is now spent BEHIND the card — the menu mounts under it and is finished by
// the time it lifts.
//
// Kept apart from the component so the timing rules are testable without a
// renderer (see `tests/splash_test.ts`).

import { warn } from "@game/menu";

import { loadGameAssets } from "./assets.ts";

/**
 * How long the card is held before ANY press can clear it. Short enough not to
 * stand between a player and the menu, long enough that the name is read
 * rather than glimpsed — and it doubles as the guard against the press that
 * launched the app (a double-click on a desktop icon, a tap that opened the
 * PWA) arriving as the press that dismisses the card.
 */
export const SPLASH_MIN_MS = 1000;

/** …and when the card clears itself, for a player who touches nothing. */
export const SPLASH_AUTO_MS = 3000;

/**
 * Where the card is in its life:
 *
 * - `holding` — still loading, or inside {@link SPLASH_MIN_MS}. Presses are
 *   swallowed and do nothing.
 * - `skippable` — the game is warm and the minimum is served: the next press
 *   (any key, any button, a click, a tap) clears it.
 * - `done` — it is leaving, either because a press cleared it or because
 *   {@link SPLASH_AUTO_MS} came and went.
 */
export type SplashPhase = "holding" | "skippable" | "done";

/**
 * The phase for a card that has been up `elapsedMs` with the game `warm` or
 * not. THE LOAD WINS OVER BOTH CLOCKS: a slow device holds the card past
 * {@link SPLASH_AUTO_MS} rather than dropping the player onto a menu that is
 * still assembling itself, which is the whole reason the card exists.
 */
export function splashPhase(elapsedMs: number, warm: boolean): SplashPhase {
  if (!warm || elapsedMs < SPLASH_MIN_MS) return "holding";
  return elapsedMs >= SPLASH_AUTO_MS ? "done" : "skippable";
}

/**
 * The URL params that mean SOMETHING IS DRIVING THIS APP rather than somebody
 * playing it — the debug flag every authoring script opens with, the autopilot
 * the screenshot and playtest harnesses boot into, and the planetarium view
 * `verify-sky.mjs` measures. A card in front of those is three seconds added to
 * every capture and a first click swallowed, so they never get one.
 *
 * `nosplash` is the explicit form for anyone else who wants the old opening.
 */
const HARNESS_PARAMS = ["debug", "bot", "skytest", "nosplash"];

/**
 * Should this launch show the studio card? `?splash` forces it back on, which
 * is how the card itself is screenshotted from a harness that would otherwise
 * suppress it.
 */
export function splashWanted(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.has("splash")) return true;
  return !HARNESS_PARAMS.some((param) => params.has(param));
}

/**
 * Everything the title menu would otherwise pay for on its way in, done while
 * the card is up: the sprite atlas and the pixel fonts, then the planet shader
 * and all nine worlds' surface bakes.
 *
 * The sky is warmed through a DYNAMIC import on purpose — the shader and its
 * geography are ~11 KB that the 170 KB critical-path budget does not have room
 * for, and the whole point here is to fetch them EARLY rather than eagerly.
 * A failure is warned about and swallowed: a globe that never bakes leaves the
 * backdrop on the flat CSS discs it already falls back to, which is not a
 * reason to hold a player out of the menu.
 */
export async function warmBoot(): Promise<void> {
  await loadGameAssets();
  await warmTitleSky();
}

/** Whether the title backdrop will ever build a globe at all — it does not
 * under reduced motion (see `startTitleSky`), so there is nothing to bake. */
function skyAnimates(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

async function warmTitleSky(): Promise<void> {
  if (!skyAnimates()) return;
  try {
    // Both halves, so the chunk the backdrop asks for a moment later is
    // already in the browser's hands rather than on the wire.
    const [skins] = await Promise.all([
      import("@ui/lib/planet-skins.ts"),
      import("@ui/lib/planet-globe.ts"),
    ]);
    await skins.warmPlanetSkins();
  } catch (err) {
    warn(`title sky warm-up failed: ${String(err)}`);
  }
}
