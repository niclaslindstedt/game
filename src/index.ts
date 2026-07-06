// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Public entry point for the game engine core. The engine is framework-free:
// the browser app under `website/` consumes this module via the `@game/core`
// alias, drives `step()` from its render loop, and reads the returned state
// to draw. See docs/architecture.md for the module layout.

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

export { createGame } from "./game/create.ts";
export { step } from "./game/step.ts";
export { ENEMY, LEVEL, MEDKIT, PLAYER, WEAPON } from "./game/config.ts";
export type {
  Enemy,
  GameEvent,
  GameInput,
  GamePhase,
  GameState,
  GameStats,
  Item,
  Player,
  Projectile,
} from "./game/types.ts";
export type { Vec2 } from "./lib/vec.ts";
