// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLASH NOTE — a word in the game's own pixel font that rises off the
// point the player just touched and fades out. Generic React/UI game code —
// lives in pwa/src/lib/, the pool a later game keeps as-is.
//
// Imperative rather than a component on purpose: it is raised from inside a
// gesture handler that has no render of its own to hang a portal on (a
// long-press timer in the bag's drag machinery), and it outlives whatever
// raised it — the card the player held may be gone by the time the word has
// finished rising. It cleans itself up on the animation's end, with a timer as
// the backstop for a browser that never fires one.

import type { PixelFont } from "./pixel-font.ts";

/** Belt-and-braces removal if `animationend` never arrives (a backgrounded
 * tab, a reduced-motion engine that skips the animation entirely). */
const FLASH_SWEEP_MS = 3000;

export function flashPixelNote(
  font: PixelFont,
  text: string,
  at: { x: number; y: number },
  options: { color?: string; scale?: number } = {},
): void {
  const scale = options.scale ?? 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, font.measure(text) * scale);
  canvas.height = font.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  font.draw(ctx, text, 0, 0, { scale, color: options.color ?? "#7ef0c8" });
  canvas.className = "pixel-flash";
  canvas.setAttribute("role", "status");
  canvas.setAttribute("aria-label", text);
  canvas.style.left = `${Math.round(at.x)}px`;
  canvas.style.top = `${Math.round(at.y)}px`;
  const remove = () => canvas.remove();
  canvas.addEventListener("animationend", remove, { once: true });
  setTimeout(remove, FLASH_SWEEP_MS);
  document.body.appendChild(canvas);
}
