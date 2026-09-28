// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEBUG SWITCH, READ BY THE APP. Loading the game with `?debug` in the
// address prints the engine's debug diagnostics to the console as well as to
// its ring buffer. The engine's output module owns the switch but never reads
// the page address itself — the engine runs headless too (the simulator, the
// session server), where there is no page — so the app reads it here, once, at
// startup, and hands the answer over.

import { setDebugEnabled } from "@game/menu";

/** Switch debug output on when `search` (a URL query string) carries `debug`. */
export function applyDebugFlag(search: string): boolean {
  const enabled = new URLSearchParams(search).has("debug");
  setDebugEnabled(enabled);
  return enabled;
}
