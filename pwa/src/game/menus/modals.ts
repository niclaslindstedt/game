// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODAL STACK — what is standing over the run right now, and the two doors
// a window comes up through.
//
//   A PRESS.  `press: { action: openModal, arg: my_warning }` on any button the
//             game draws — a HUD element, a menu row, a row inside a modal
//             already up. `closeModal` lowers the top one.
//   A MOMENT. A modal's own `when:` — a flag, a list of flags, or a Lua
//             judgement — raised on the EDGE: the publish where the answer
//             turns yes, and not again until it has turned no. That is the
//             whole of "a mod draws a modal from a script": ship a `.lua` that
//             says when, and a `.yaml` that says what.
//
// WHY EDGE-TRIGGERED AND NOT LEVEL-TRIGGERED. A modal is a thing the player
// DISMISSES, so a window raised while its condition holds would come straight
// back the instant it was closed — the player would be trapped behind their own
// mod. Raising on the edge means "when this becomes true, say so once", which is
// what an author means every time.
//
// A MODAL IS APP-SIDE CHROME, NOT A SCREEN. It does not park the hero and does
// not freeze the world: the run's own screens are the engine's business
// (`PlayerScreen`, and `partyBlocked` is what halts a party), and a window
// content raised must never be able to stop a session. A modal that WANTS the
// hero parked puts an engine verb on one of its rows.
//
// The store is module-level rather than React state for the reason the HUD's
// layout is: a press can arrive from anywhere — a HUD button, a menu row, a Lua
// judgement resolving — and none of those places has a component to call
// `setState` on.

import { useSyncExternalStore } from "react";

import type { HudActionArg } from "../hud/types.ts";
import { resolveCondition, type HudResolveContext } from "../hud/resolve.ts";
import type { MenuDef } from "./types.ts";

/** One window standing over the run. */
export type OpenModal = {
  id: string;
  /** Whatever the press carried — a scalar, as an action's argument always is.
   * Published as `menu.modalArg`, so one authored window can say two things. */
  arg?: HudActionArg;
  /** Bumped per raise, so React re-mounts a modal that was closed and raised
   * again rather than reusing the old one's state. */
  key: number;
};

let stack: OpenModal[] = [];
let raised = 0;
/** Which triggers were holding at the last publish — the "edge" in
 * edge-triggered — and which `once:` windows have had their turn. */
let armed = new Set<string>();
let spent = new Set<string>();

const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stack, oldest first — the order they are drawn in. */
export function modalStack(): readonly OpenModal[] {
  return stack;
}

/** …as a hook read. */
export function useModalStack(): readonly OpenModal[] {
  // Two arguments, not three: the third is `getServerSnapshot`, which is only
  // ever called when a server-rendered tree is HYDRATED. This app never
  // hydrates — the prerendered boot shell is static HTML that `createRoot()`
  // renders straight over (main.tsx) — so it was dead weight even under React,
  // and `preact/compat` does not take it.
  return useSyncExternalStore(subscribe, modalStack);
}

/**
 * Raise one.
 *
 * A window already on the stack is NOT raised twice — a second copy of a
 * confirm is two confirms to dismiss, and a press that arrives twice (a
 * double-tap, a key repeat) is the common way to get one.
 */
export function openModal(id: string, arg?: HudActionArg): void {
  if (stack.some((open) => open.id === id)) return;
  stack = [...stack, { id, arg, key: (raised += 1) }];
  publish();
}

/** Lower the top one, or the named one wherever it sits. */
export function closeModal(id?: string): void {
  if (stack.length === 0) return;
  stack =
    id === undefined
      ? stack.slice(0, -1)
      : stack.filter((open) => open.id !== id);
  publish();
}

/** Everything down — a run ending, a level changing under the player. */
export function closeAllModals(): void {
  if (stack.length === 0) return;
  stack = [];
  publish();
}

/**
 * Forget everything: the stack, which triggers were holding, and which
 * `once:` windows have been spent.
 *
 * Called when a run ends, because `once:` means once per RUN — a warning worth
 * saying on the first level is worth saying again on the next hero.
 */
export function resetModals(): void {
  armed = new Set();
  spent = new Set();
  stack = [];
  publish();
}

/**
 * Raise whatever this instant's values have just made true.
 *
 * Called once per resolve — which is once per HUD publish, not per frame — so a
 * `when:` judgement costs what every other judgement costs. A modal with no
 * `when:` is never considered here: it waits for a press.
 */
export function syncModalTriggers(
  modals: readonly MenuDef[],
  ctx: HudResolveContext,
): void {
  const holding = new Set<string>();
  let opened = false;
  for (const modal of modals) {
    if (modal.when === undefined) continue;
    // FAILS CLOSED, unlike a `visible:`. A trigger nobody can answer — a
    // binding this build does not have, a judgement that will not compile — is
    // a modal that would otherwise stand in the player's face for the rest of
    // the run.
    if (!resolveCondition(modal.when, ctx, false)) continue;
    holding.add(modal.id);
    if (armed.has(modal.id)) continue;
    if (modal.once === true) {
      if (spent.has(modal.id)) continue;
      spent.add(modal.id);
    }
    if (stack.some((open) => open.id === modal.id)) continue;
    stack = [...stack, { id: modal.id, key: (raised += 1) }];
    opened = true;
  }
  armed = holding;
  if (opened) publish();
}
