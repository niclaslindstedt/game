// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Public entry point for the game engine core. Gameplay systems (simulation
// loop, steering, weapons, items, spawning) land here as they are built; the
// browser app under `website/` consumes this module via the `@game/core`
// alias. See docs/architecture.md for the intended module layout.

export { engineVersion } from "./version.ts";
export {
  status,
  warn,
  info,
  header,
  error,
  debug,
  setDebugEnabled,
  recentLogs,
} from "./output.ts";
