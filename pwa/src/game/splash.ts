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
//
// THIS MODULE IS IN THE ENTRY CHUNK AND HAS NO STATIC IMPORTS AT ALL, which is
// not tidiness — it is two constraints meeting.
//
// **THE BUDGET.** Everything `warmBoot` reaches is exactly what the card exists
// to load in the background, so a static import here would put that thing in
// FRONT of the card instead of behind it. Two of them bit already: `assets.ts`
// (the sprite atlas, ~25 KB gzipped) and `@game/menu` for one `warn` (the
// engine's item and difficulty catalogs, ~25 KB more). Both are reached inside
// `warmBoot` now, and both must stay that way.
//
// **THE ROOT TYPECHECK.** `tests/splash_test.ts` imports this, the root
// `tsconfig.json` covers `tests/` and sets no `jsx`, so a `.tsx` reached from
// here — even transitively, even through a dynamic import — is a `TS6142` that
// only `make lint` reports. That is why the APP SHELL's own fetch is not in
// `warmBoot` but beside it, in the card's effect (`SplashScreen.tsx`, through
// `app-shell.ts`): this half is policy, and policy stays renderer-free.

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
 * - `holding` — inside {@link SPLASH_MIN_MS}. Presses are swallowed and do
 *   nothing.
 * - `skippable` — the minimum is served: the next press (any key, any button,
 *   a click, a tap) clears it.
 * - `done` — it is leaving, either because a press cleared it or because
 *   {@link SPLASH_AUTO_MS} came and went on a warm game.
 */
export type SplashPhase = "holding" | "skippable" | "done";

/**
 * The phase for a card that has been up `elapsedMs` with the game `warm` or
 * not. The two clocks answer to `warm` differently, and the difference is the
 * difference between a player who is waiting and a player who is not:
 *
 * - **THE AUTO-DISMISS WAITS FOR THE LOAD.** A card that lifted itself while
 *   the atlas was still decoding would hand a player who touched nothing
 *   exactly the half-assembled menu it was added to hide, so a slow device
 *   holds it past {@link SPLASH_AUTO_MS} instead. That is the whole reason the
 *   card exists.
 * - **A PRESS DOES NOT.** The player has told us they are done reading, and a
 *   card that answers by ignoring them reads as a hung app — which is worse
 *   than the honest thing, which is to get out of the way and say Loading
 *   until the game catches up (`Boot.tsx`, `TitleScreen`). Only the minimum is
 *   still enforced, and that is not about the load at all: it is the guard
 *   against the press that LAUNCHED the app arriving as the press that
 *   dismisses the card.
 */
export function splashPhase(elapsedMs: number, warm: boolean): SplashPhase {
  if (elapsedMs < SPLASH_MIN_MS) return "holding";
  return warm && elapsedMs >= SPLASH_AUTO_MS ? "done" : "skippable";
}

/**
 * THE CARD BELONGS TO THE FRONT DOOR AND TO NOTHING ELSE. Every param here says
 * this launch is not somebody opening the game, so it gets no card — because a
 * card in front of one is three seconds added to every capture and a first
 * click swallowed. They come in two kinds, and the second kind is the one that
 * will be forgotten again:
 *
 * 1. **SOMETHING IS DRIVING THE APP** — the debug flag every authoring script
 *    opens with, the autopilot the screenshot and playtest harnesses boot into,
 *    the planetarium view `verify-sky.mjs` measures, and `nosplash` for anyone
 *    else who wants the old opening.
 * 2. **THIS IS A DEEP LINK PAST THE TITLE MENU** — the developer workbenches
 *    `App.tsx` routes to before it renders any menu at all: the effects gallery,
 *    the road, the cutscene loop. There is no front door in front of these, so
 *    there is nothing for a card to cover.
 *
 * The second kind was missed when the card became the app's ENTRY (`Boot.tsx`).
 * Until then `App.tsx` returned each workbench before the line that rendered
 * the card, so they were suppressed by construction; the card now sits ABOVE
 * every route and has to be told. `make gallery` paid for that three seconds AT
 * A TIME, once per exhibit, and `scripts/elite-abilities.mjs` once per elite.
 * `tests/splash_test.ts` walks `App.tsx`'s own routing so a workbench added
 * later cannot quietly re-earn it.
 */
const HARNESS_PARAMS = [
  "debug",
  "bot",
  "skytest",
  "nosplash",
  "effects",
  "drive",
  "cutscene",
];

/**
 * WHEN THE CARD IS OUT OF THE WAY — resolved as it clears, and immediately on a
 * launch that never had one.
 *
 * It is what the menu underneath waits on before spending bandwidth on
 * anything the card is not buying. The title THEME is the case it exists for:
 * a score is tens of KB, no browser will play a note of it before the player's
 * first gesture, and the earliest gesture there is is the press that clears the
 * card — so fetching it while the card is up is bandwidth taken from the atlas
 * and the app shell that ARE racing the card, to buy silence a little sooner.
 *
 * A plain module-level promise rather than a hook: the menu that waits on it
 * and the card that settles it are on opposite sides of a lazy chunk boundary
 * (`Boot.tsx` ↔ `TitleScreen.tsx`), and there is exactly one card per launch.
 */
let settleSplash: (() => void) | undefined;
const splashDone = new Promise<void>((resolve) => {
  settleSplash = resolve;
});

/** Awaited by anything that should not compete with the card's own loading. */
export function splashSettled(): Promise<void> {
  return splashDone;
}

/** Said once by `Boot.tsx` — when the card leaves, or at once when the launch
 * is a harness one that never raises it. Idempotent. */
export function markSplashSettled(): void {
  settleSplash?.();
}

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
 * The CONTENT half of what the card is buying, done while it is up:
 *
 * 1. **The sprite atlas and the pixel fonts**, decoded once and shared.
 * 2. **The planet shader and all nine worlds' surface bakes.**
 *
 * The APP SHELL is the third thing the card buys and it is fetched beside this
 * rather than inside it — `SplashScreen.tsx`, through `app-shell.ts`, whose
 * header says why. The card waits on both.
 *
 * THE FETCHES ARE STARTED TOGETHER AND ONLY THE CPU WORK IS ORDERED. They are
 * separate chunks off the same connection, so serializing them would spend
 * round trips where one will do; the atlas decode is still awaited before the
 * sky BAKE, which is the one ordering that matters (the menu wants its sprites
 * first, and both halves are main-thread work).
 *
 * Both are reached through DYNAMIC imports on purpose — the whole point here is
 * to fetch them EARLY rather than eagerly, and see the module header for what a
 * static one costs. A sky failure is warned about and swallowed: a globe that
 * never bakes leaves the backdrop on the flat CSS discs it already falls back
 * to, which is not a reason to hold a player out of the menu.
 *
 * WHAT IS DELIBERATELY NOT WARMED IS MUSIC. The title theme cannot make a sound
 * until the player has touched something (a browser unlocks audio on a gesture,
 * and the earliest gesture there is is the press that clears this card), so
 * fetching a score here would only take bandwidth from the menu that is racing
 * the card. The theme is fetched by `armTitleMusic` once the card has cleared
 * (`splashSettled`), and each score is its own chunk.
 */
export async function warmBoot(): Promise<void> {
  const sky = fetchTitleSky();
  await import("./assets.ts").then((m) => m.loadGameAssets());
  await bakeTitleSky(sky);
}

/**
 * The engine's own output channel (`engine/output.ts`, re-exported by
 * `@game/menu`), reached lazily for the same reason everything else here is:
 * a static import of the menu barrel drags the item and difficulty catalogs
 * into the entry chunk for the sake of one warning that usually never fires.
 * Fire-and-forget, and silent if even that import fails — a warning that
 * cannot be delivered is not worth a second failure path.
 */
function warnLater(message: string): void {
  void import("@game/menu").then((m) => m.warn(message)).catch(() => {});
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

type SkyModules = typeof import("@ui/lib/planet-skins.ts") | null;

/** THE FETCH half: put both chunks on the wire immediately, beside the app
 * shell and the atlas, so the backdrop's own import a moment later is answered
 * from the browser's hands rather than from the network. */
function fetchTitleSky(): Promise<SkyModules> {
  if (!skyAnimates()) return Promise.resolve(null);
  return Promise.all([
    import("@ui/lib/planet-skins.ts"),
    import("@ui/lib/planet-globe.ts"),
  ])
    .then(([skins]) => skins)
    .catch((err: unknown) => {
      warnLater(`title sky fetch failed: ${String(err)}`);
      return null;
    });
}

/** …and THE BAKE half, which is main-thread work and therefore waits for the
 * atlas decode ahead of it rather than competing with it. */
async function bakeTitleSky(fetched: Promise<SkyModules>): Promise<void> {
  const skins = await fetched;
  if (!skins) return;
  try {
    await skins.warmPlanetSkins();
  } catch (err) {
    warnLater(`title sky warm-up failed: ${String(err)}`);
  }
}
