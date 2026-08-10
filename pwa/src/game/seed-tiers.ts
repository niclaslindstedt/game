// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEVELOPER seed tiers — the four power bands SEED CHARACTERS can mint at.
//
// Held APART from `seed-characters.ts` on purpose: the menu only needs these
// four labels to draw its rows, while the minting machinery next door drags the
// engine's loot roller and `createGame` in behind it. Keeping the data here lets
// the title screen list the tiers eagerly and import the minter on demand (see
// `title-screen/use-character-transfer.ts`), so a player who never opens the
// hidden developer menu never downloads it.

import type { Difficulty } from "@game/menu";

/** A power tier a seed hero is minted at: a target hero LEVEL plus the
 * difficulty whose loot/level band that level sits in (drives the drop's item
 * level and the "beaten through" progression the seed is stamped with). */
export type SeedTier = {
  id: string;
  /** Short label for the menu row. */
  label: string;
  /** The hero level the seed is built at. */
  level: number;
  /** The difficulty band the level belongs to (loot ilvl + progression). */
  difficulty: Difficulty;
};

/** The four seed tiers: entering NIGHTMARE, entering JESUS, the post-JESUS
 * farm, and the level-99 endgame ceiling. */
export const SEED_TIERS: SeedTier[] = [
  { id: "nightmare", label: "NIGHTMARE", level: 34, difficulty: "nightmare" },
  { id: "jesus", label: "JESUS", level: 56, difficulty: "jesus" },
  { id: "postjesus", label: "POST-JESUS", level: 70, difficulty: "jesus" },
  { id: "endgame", label: "ENDGAME", level: 99, difficulty: "jesus" },
];
