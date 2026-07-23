// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Engine access for the map-layout renderer: registers the TS alias loader and
// dynamically imports the live engine catalogs the render reads — the enemy
// roster (roles/rarities/names for the pinned-mob shapes) and the deterministic
// XP model (see leveling.ts) used to PROJECT the hero's level at 25/50/75/100 %
// cleared, so the con ramp can be judged against the hero's rise.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("../game-alias-loader.mjs", import.meta.url);

export const engine = (p) =>
  fileURLToPath(new URL(`../../${p}`, import.meta.url));

export const { ENEMY_DEFS } = await import(
  engine("src/game/defs/enemies/index.ts")
);
export const { mobLevelXp, xpToLevelUp } = await import(
  engine("src/game/leveling.ts")
);

export const roleOf = (id) => ENEMY_DEFS[id]?.role ?? "minion";
export const rarityOf = (id) => ENEMY_DEFS[id]?.rarity;
export const enemyName = (id) =>
  ENEMY_DEFS[id]?.name ?? String(id).toUpperCase();
