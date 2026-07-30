// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST catalog: the errands the field's non-combatants ask of the hero,
// and the people who ask them.
//
// This module owns the TYPES and the registry; the CONTENT is authored in
// `content/quest-givers.yaml` + `content/quests/<id>.yaml` and compiled to
// `src/generated/quests.ts` by `scripts/generate-quests.mjs`. Adding an errand
// is a YAML file; no engine change. A MOD ships the same two files and its
// quests arrive through `registerDefs` (pwa/src/game/mods.ts) — which is why
// nothing here reaches for a shipped id.
//
// THE GIVER AND THE QUEST ARE SEPARATE CATALOGS ON PURPOSE. A giver is a
// PERSON standing on a map — a sprite, a name, a spot, a reason for being
// there — and one person hands out a whole CHAIN. Folding the giver into the
// quest would repeat that person once per errand and let the copies disagree;
// folding the chain into the giver would make a quest unaddressable, and a
// chain link (`requires`), a reward and a tracker row all need to name one.
//
// THE REWARD'S XP IS A SHARE OF THE HERO'S OWN BAR, NEVER A NUMBER. A flat
// figure authored against SpaceZ HQ is a rounding error by Eastworld and an
// instant ding on JESUS, so `xpShare: 0.25` means "a quarter of the level you
// are on" and prices itself correctly at every rung of the campaign for free
// (see `questXpReward`). Coins are flat — the purse is a flat economy — and
// the LOOT is rolled through the ordinary drop pipeline, so a quest reward is
// the same kind of thing a monster pays out, minted at the hero's level.

import {
  GENERATED_QUEST_GIVERS,
  GENERATED_QUESTS,
} from "../../generated/quests.ts";

/**
 * WHAT AN ERRAND ASKS FOR. Four shapes, and each one is a different reason to
 * walk somewhere: `kill` sends the hero at the horde, `killNamed` at one
 * specific pinned elite or boss, `collect` at whatever the horde is carrying
 * (or at a spot on the floor), and `escort` makes him responsible for
 * somebody who cannot fight.
 */
export type QuestObjective =
  /**
   * Fell `count` of a BREED (`enemy` keys ENEMY_DEFS). Any kill counts — the
   * hero's own, a companion's, a powerup's — because the errand is "thin them
   * out", not "prove it was you".
   */
  | { kind: "kill"; enemy: string; count: number }
  /**
   * Fell one NAMED mob — a pinned elite or a boss. Its own kill is the whole
   * objective, so the tracker reads a name rather than a tally.
   */
  | { kind: "killNamed"; enemy: string }
  /**
   * Bring back `count` of a quest item (`item` keys the quest's own `items`
   * block — see `QuestItemDef`). The pieces exist only while the quest is
   * live: they drop off the breeds that carry them and lie where the quest
   * placed them, and they are handed over at the turn-in.
   */
  | { kind: "collect"; item: string; count: number }
  /**
   * Walk somebody to `to`. The escort is a body on the field with hp that the
   * horde can reach (see `EscortState`); it follows the hero, and the errand
   * fails if it falls.
   */
  | { kind: "escort"; escort: string; to: { x: number; y: number } };

/** A quest item — a thing that exists only for the errand that wants it. */
export type QuestItemDef = {
  /** Unique within the quest; what a `collect` objective names. */
  id: string;
  /** Display name (the pickup toast, the tracker row). */
  name: string;
  /** Icon sprite, drawn on the ground and in the offer. */
  icon: string;
  /**
   * Breeds that carry it (ENEMY_DEFS ids). A kill of one, while the quest is
   * active and the tally short, rolls `dropChance` for a piece.
   */
  dropFrom?: readonly string[];
  /** 0..1 chance per kill of a carrying breed. Defaults to `QUESTS.dropChance`. */
  dropChance?: number;
  /**
   * Spots the pieces are lying at (world px). Laid out the moment the quest is
   * ACCEPTED — a fetch quest's pieces must not litter a map the hero never
   * took the errand on.
   */
  at?: readonly { x: number; y: number }[];
};

/** Somebody the hero has to keep alive, authored on the quest that escorts them. */
export type QuestEscortDef = {
  /** Unique within the quest; what an `escort` objective names. */
  id: string;
  /** Display name (the tracker row, the floating label). */
  name: string;
  /** Sprite family — `<sprite>_0`/`_1` walk frames, like the merchant's. */
  sprite: string;
  /** Where they are waiting (world px). Omitted = they set off from the giver. */
  at?: { x: number; y: number };
  /** Hit points. Defaults to `QUESTS.escortHp`. */
  hp?: number;
  /** One line spoken when they set off, and one when they arrive. */
  setOff?: string;
  arrived?: string;
};

/** What the errand pays. Every field is optional — an errand may pay in one
 * coin, in a named relic, or in nothing but the next link of its chain. */
export type QuestReward = {
  /**
   * XP as a SHARE OF THE HERO'S CURRENT LEVEL BAR (0.25 = a quarter of a
   * level). Never a flat figure — see the note at the top of this file.
   */
  xpShare?: number;
  /** Coins into the purse. */
  coins?: number;
  /** Named relics handed over whole (UNIQUE_DEFS ids) — always, not rolled. */
  uniques?: readonly string[];
  /** Rolled equipment, minted through the ordinary drop pipeline. */
  loot?: {
    /** How many pieces. */
    count: number;
    /** Tiers of skew on the roll, exactly as the merchant's stall takes. */
    tierBonus?: number;
    /** Restrict the roll to one slot; omitted rolls any. */
    slot?: string;
  };
  /** Powerups docked on turn-in (ABILITY_DEFS ids). */
  abilities?: readonly string[];
};

/**
 * SOMEBODY WHO ASKS FOR HELP. One per spot on one map; the horde is held off
 * them (`QUESTS.repelRadius`) so the hero can always reach the conversation,
 * and nothing can hurt them — they are civilians, like the merchant.
 */
export type QuestGiverDef = {
  id: string;
  /** LEVELS id this person stands on. */
  level: string;
  /** Dialogue-box name. */
  name: string;
  /** Sprite family — `<sprite>_0`/`_1`, like the merchant's. */
  sprite: string;
  /** Where they stand (world px). */
  at: { x: number; y: number };
  /**
   * Who they are, in the same dry register as an item's `description` — read
   * in the offer's header and on the tracker. Story text: it may only
   * ELABORATE what `docs/story.md` establishes, never introduce a plot fact.
   */
  lore: string;
  /** Spoken when the hero first walks up with nothing to hand over. */
  greeting?: readonly string[];
  /** Spoken when every quest of theirs is done. */
  farewell?: readonly string[];
};

/** ONE ERRAND. */
export type QuestDef = {
  id: string;
  /** LEVELS id this errand belongs to — it is offered on that map only. */
  level: string;
  /** QUEST_GIVER_DEFS id of whoever hands it out. */
  giver: string;
  /** Title (the offer's header, the tracker row). */
  name: string;
  /** The ask, in the giver's voice — one string per line, one entry per page. */
  offer: readonly (readonly string[])[];
  /** Nagged when the hero comes back with the work unfinished. */
  incomplete?: readonly string[];
  /** Said over the handover. */
  complete: readonly (readonly string[])[];
  /** What has to happen; every entry must be met. */
  objectives: readonly QuestObjective[];
  /** The pieces a `collect` objective asks for. */
  items?: readonly QuestItemDef[];
  /** The people an `escort` objective walks. */
  escorts?: readonly QuestEscortDef[];
  /** What it pays. */
  reward?: QuestReward;
  /**
   * CHAIN: quest ids that must be TURNED IN before this one is offered. A
   * chain is written backwards — each link names its predecessor — because
   * that is the direction the offer gate reads, and it lets a later link be
   * added without editing the one before it.
   */
  requires?: readonly string[];
  /** Offered only from this difficulty up (DifficultyDef ids). */
  minDifficulty?: string;
  /**
   * Where this errand sits in its giver's PICK LIST (low first). It exists
   * because the fallback is alphabetical, and alphabetical is never the order
   * a person would say things in: PRIYA's list opened on "STOP THE LINE"
   * above "THE NIGHT LOG" purely because `hq_line_stop` sorts before
   * `hq_night_log`. Omitted sorts last, then by id, so a mod that authors none
   * still gets a stable list.
   */
  order?: number;
};

export const QUEST_DEFS: Record<string, QuestDef> = GENERATED_QUESTS;
export const QUEST_GIVER_DEFS: Record<string, QuestGiverDef> =
  GENERATED_QUEST_GIVERS;

// Active registries the accessors read (defaults to the shipped catalogs;
// tests and mods swap in their own via `registerDefs`). See src/index.ts.
let activeQuestDefs: Record<string, QuestDef> = QUEST_DEFS;
let activeQuestGiverDefs: Record<string, QuestGiverDef> = QUEST_GIVER_DEFS;

/** Test/authoring hook: replace the active quest catalog. */
export function setQuestDefs(defs: Record<string, QuestDef>): void {
  activeQuestDefs = defs;
}

/** Test/authoring hook: replace the active quest-giver catalog. */
export function setQuestGiverDefs(defs: Record<string, QuestGiverDef>): void {
  activeQuestGiverDefs = defs;
}

/** Look up an errand; throws on a broken id so bugs surface loudly. */
export function questDef(id: string): QuestDef {
  const def = activeQuestDefs[id];
  if (!def) throw new Error(`unknown quest def "${id}"`);
  return def;
}

/** Look up a giver; throws on a broken id so bugs surface loudly. */
export function questGiverDef(id: string): QuestGiverDef {
  const def = activeQuestGiverDefs[id];
  if (!def) throw new Error(`unknown quest giver def "${id}"`);
  return def;
}

/** Is there such an errand? (The tracker reads a saved run's ids, which may
 * name a quest a since-unsubscribed mod shipped.) */
export function hasQuest(id: string): boolean {
  return activeQuestDefs[id] !== undefined;
}

/** Every errand on a map, in AUTHORED order (`order`, then id — see the field). */
export function questsForLevel(levelId: string): QuestDef[] {
  return Object.values(activeQuestDefs)
    .filter((q) => q.level === levelId)
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) -
          (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
    );
}

/** Every giver on a map, in authored (id) order. */
export function giversForLevel(levelId: string): QuestGiverDef[] {
  return Object.values(activeQuestGiverDefs)
    .filter((g) => g.level === levelId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The quest item `itemId` on quest `questId`, or null if either is unknown. */
export function questItemDef(
  questId: string,
  itemId: string,
): QuestItemDef | null {
  const quest = activeQuestDefs[questId];
  return quest?.items?.find((i) => i.id === itemId) ?? null;
}

/** The escort `escortId` on quest `questId`, or null if either is unknown. */
export function questEscortDef(
  questId: string,
  escortId: string,
): QuestEscortDef | null {
  const quest = activeQuestDefs[questId];
  return quest?.escorts?.find((e) => e.id === escortId) ?? null;
}
