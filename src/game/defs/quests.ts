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
// figure authored against GOODCO HQ is a rounding error by Boot Hill and an
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
  | { kind: "escort"; escort: string; to: { x: number; y: number } }
  /**
   * GO AND STAND SOMEWHERE. The objective a search needs and the horde cannot
   * provide: a spot on a named map, credited the first time the hero comes
   * within `radius` of it with the errand running.
   *
   * `name` is required and carries the whole design — it is what the tracker
   * says instead of a coordinate ("FIND THE SITE T MARKER"), so the player is
   * given a PLACE to look for rather than an arrow to follow. `level` names
   * which map the spot is on, because a campaign errand's objectives are
   * scattered across the campaign and a coordinate means nothing without it.
   */
  | {
      kind: "visit";
      level: string;
      at: { x: number; y: number };
      name: string;
      radius?: number;
    }
  /**
   * SOMETHING WAS LEARNED, ADMITTED, OR TALKED INTO — a run flag was set (see
   * conversation.ts). The bridge between a conversation tree and the quest
   * log, and deliberately the ONLY one: rather than a `talk` objective that
   * would have to name a speaker, a node and a branch, the errand watches for
   * a flag and any branch of any conversation may set it. So "get the assessor
   * to admit the tithe was short" and "find the passphrase in a dead man's
   * notes" are the same objective kind wanting different flags.
   *
   * `name` is what the tracker reads, since a flag id is not a sentence.
   */
  | { kind: "flag"; flag: string; name: string }
  /**
   * SELL A PIECE TO THE MERCHANT — over the counter, for coins, at his stall
   * (see quests/merchant.ts). The piece has to be in hand, and it LEAVES: the
   * point of the beat is that the hero gives something up, and what he gets
   * back is that the trader now has it and will talk about what it is worth.
   */
  | { kind: "sell"; item: string }
  /**
   * BE THIS GOOD. The hero's own level, checked as it rises — and the one
   * objective in the catalog that cannot be finished by playing better on this
   * map, only by playing more of the game.
   *
   * It exists for a single errand and should stay rare: a level gate is a wall
   * rather than a task, and a chain that leans on one is a chain padded rather
   * than written. The tracker words it as the climb (`LEVEL 96/99`) instead of
   * as a tick-box, because the honest thing to show somebody twelve hours from
   * the answer is how far along they are.
   */
  | { kind: "reachLevel"; level: number };

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
  /**
   * CLEAN SLATES — respec charges the hero carries and spends when he likes
   * (see `Player.cleanSlates`). The shipped campaign pays exactly one, at the
   * end of the longest errand in the game, and it should stay that rare: the
   * whole weight of a respec comes from a build being a decision, and a game
   * that hands them out has no build decisions in it, only postponed ones.
   */
  cleanSlates?: number;
};

/**
 * WHAT THE TRADER WILL DO WITH AN ERRAND'S PIECES — the quest side of the
 * stall (see quests/merchant.ts).
 *
 * THE POINT IS THE ORDER OF THE THREE STEPS, not any one of them: sell him
 * something, and his stall changes. A chain that merely said "buy this from
 * the merchant" would be a fetch quest with a coin cost; a chain that says
 * "he will not sell you that until he knows you have seen one" makes the trade
 * a conversation about what the hero is carrying.
 */
export type QuestMerchantDeal = {
  /**
   * A piece he BUYS, over the counter, for coins. The piece leaves the hero's
   * tally — the beat is that he gives something up. Setting flags here is what
   * makes the sale matter later: the `sells` row below reads them, and so may
   * an objective or a conversation branch.
   */
  buys?: {
    /** Which of the quest's own `items`. */
    item: string;
    /** What he pays. */
    coins: number;
    /** Run flags the sale sets — the memory the rest of the chain reads. */
    sets?: readonly string[];
  };
  /**
   * Pieces he PUTS ON THE COUNTER once `requires` is satisfied — a quest item
   * bought rather than found, credited to a `collect` objective exactly as a
   * piece prised off a corpse is. Priced flat, because the purse is a flat
   * economy and a chase item whose price scaled would read as a tax on
   * arriving late.
   */
  sells?: readonly {
    /** Which of the quest's own `items`. */
    item: string;
    price: number;
    /** Every one of these run flags must be set before the row appears. */
    requires?: readonly string[];
    /** One line, said when the row is first seen — the trader's own pitch. */
    pitch?: string;
  }[];
};

/**
 * SOMEBODY WHO ASKS FOR HELP. One per spot on one map. Nothing can hurt them —
 * they are civilians, like the merchant — but unlike the merchant they carry no
 * ward: the horde walks right over them, so a conversation is had in whatever
 * fight is going on around it.
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
  /**
   * A CONVERSATION THIS PERSON OWES THE HERO BEFORE THEY OWE HIM AN ERRAND
   * (see defs/conversations.ts). The first tap opens the tree instead of the
   * slate; every tap after `until` is set opens the slate exactly as it always
   * did.
   *
   * IT EXISTS BECAUSE A SLATE IS NOT A MEETING. A giver's pick list opens on a
   * one-line `greeting` and a row per errand, which is right for somebody the
   * hero has walked up to for the third time and wrong for the first time he
   * meets them at all — an errand handed over by a stranger the player has
   * never been introduced to reads as a vending machine, and the reason the
   * person is standing there has nowhere to be said. So the meeting is a
   * CONVERSATION the player steers, and only once it is had does the slate
   * open. The errands are then written as things this person says to somebody
   * they have already spoken to, which is the whole point.
   *
   * `until` is the run flag that RETIRES the tree, and some branch of it has
   * to set it — the build refuses an `until` nothing sets, because a flag
   * nobody sets is a person who can never hand out the errands they exist to
   * hand out. A campaign giver's flags travel with the hero (see
   * quests/campaign.ts), so the meeting is had once per difficulty rather than
   * once per run.
   */
  intro?: {
    /** CONVERSATION_DEFS id — the tree the first tap opens. */
    conversation: string;
    /** The run flag that retires it. Set by a branch of that same tree. */
    until: string;
  };
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
  /**
   * WHAT THE ERRAND IS, DESCRIBED RATHER THAN SPOKEN — the giver's `lore` for
   * the job instead of the person, in the same dry register as an item's
   * `description`. Nothing in the SIMULATION reads it: it is the one field on
   * the def authored for a READER, and the library's errand pages print it
   * under the objectives. Required for the same reason `EnemyDef.lore` is —
   * the alternative is a page whose only prose is the offer dialogue, which
   * sits behind a spoiler cover and is written in a voice that assumes the
   * player is standing there.
   *
   * Story text: it may only ELABORATE what `docs/story.md` and
   * `docs/manuscript.md` already establish, never introduce a plot fact. A
   * mod's errands answer to nobody; see mod/FORMAT.md.
   */
  lore: string;
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
   * A CAMPAIGN ERRAND: it belongs to the HERO rather than to the run.
   *
   * Every ordinary quest is a run's business — the log is thrown away when the
   * level is, and a fresh visit offers everything again, which is right for
   * pacing and flavour on one map. A campaign errand persists on the character
   * (banked per difficulty, restored at `createGame`), and three rules follow
   * from that and only apply to one:
   *
   *   - Its chain may CROSS MAPS. A `requires` naming an errand on another
   *     venue is a build error on a run quest, because the gate is read while
   *     standing on this level and the prerequisite could never have been
   *     turned in — and it is the entire point of a campaign one.
   *   - Its objectives may sit on maps its giver does not stand on: a `visit`
   *     names its own `level`, and a `kill` counts wherever it happens.
   *   - Its FLAGS persist too, so a thing the hero was told two venues ago is
   *     still true.
   *
   * Use it sparingly. A campaign chain is the game asking the player to carry
   * something for hours, and a game where every errand does that is a game
   * with a chore list rather than a story.
   */
  campaign?: boolean;
  /**
   * A CONVERSATION TREE this errand's giver holds INSTEAD of a plain offer
   * page (see defs/conversations.ts). The offer/accept flow is a page with two
   * buttons, which is right for "kill eight of those" and wrong for a person
   * the hero has to talk around — so an errand that needs the player to choose
   * what to SAY names a tree here, and the branch that accepts it is a
   * `sets:` flag the objectives read.
   */
  conversation?: string;
  /**
   * WHAT THE TRADER WILL DO WITH THIS ERRAND'S PIECES (see
   * quests/merchant.ts). The one hook that lets a chain run THROUGH the
   * economy instead of around it: sell him the thing you took off a body, and
   * what he puts on the counter afterwards is the thing the errand actually
   * wanted.
   *
   * It is on the QUEST rather than on the merchant because the stall is
   * rolled fresh per run against the hero it meets, and a permanent row for an
   * errand nobody has taken would be a mystery item in every shop in the game.
   */
  merchant?: QuestMerchantDeal;
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
