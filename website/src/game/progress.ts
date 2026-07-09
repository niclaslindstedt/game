// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Story progress persisted on-device (same policy as settings.ts): which
// levels the player has cleared, per difficulty, which drives the campaign —
// the victory splash's NEXT LEVEL button and the title menu's level-select
// unlock state — plus the hero's banked LOADOUT per cleared level, so the
// level, stats and items he finished with carry into the next level. The
// `?level=` dev override ignores the unlock gate (and falls back to a
// derived loadout when nothing is banked). (Cutscenes always play now —
// there is no "already watched" record to skip them.)

import {
  addToInventory,
  adoptEquipment,
  baseDefId,
  deriveArrivalLoadout,
  DIFFICULTY_ORDER,
  difficultyDef,
  equipmentLevelReq,
  LEVEL_ORDER,
  type Difficulty,
  type Equipment,
  type GameState,
  type Loadout,
} from "@game/core";

import { createFlagStore } from "@ui/lib/flag-store.ts";

import { storageKey } from "../identity.ts";
import { getSettings } from "./settings.ts";

// Level completion is tracked per difficulty: clearing THE MOON on EASY does
// not unlock the next level on NIGHTMARE. Each flag is `${difficulty}:${id}`.
const completedLevels = createFlagStore(storageKey("completed-levels"));

const levelKey = (levelId: string, difficulty: Difficulty): string =>
  `${difficulty}:${levelId}`;

/** Record a level as cleared at this difficulty (called on victory) — and
 * mint the clear's LEVEL TOKEN (see the token section below). */
export function markLevelCompleted(
  levelId: string,
  difficulty: Difficulty,
): void {
  completedLevels.add(levelKey(levelId, difficulty));
  tokens.add(levelKey(levelId, difficulty));
}

/** Has this level been cleared at this difficulty on this device? */
export function hasCompletedLevel(
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return completedLevels.has(levelKey(levelId, difficulty));
}

/**
 * Is this level reachable at this difficulty? The first level in LEVEL_ORDER
 * is always open; every later one unlocks when the level before it has been
 * cleared at the same difficulty — or when a LEVEL TOKEN was spent to jump
 * in ahead of the campaign (see spendTokenFor). An id not in LEVEL_ORDER (a
 * dev `?level=`) counts as open so the override never gets gated out.
 */
export function isLevelUnlocked(
  levelId: string,
  difficulty: Difficulty,
): boolean {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return true;
  if (tokenUnlocks.has(levelKey(levelId, difficulty))) return true;
  return hasCompletedLevel(LEVEL_ORDER[index - 1] as string, difficulty);
}

/** The next level along LEVEL_ORDER, or null if this is the last (or unknown)
 * — the campaign's "advance" step, shared by the splash and the menu. */
export function nextLevelId(levelId: string): string | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index < 0 || index + 1 >= LEVEL_ORDER.length) return null;
  return LEVEL_ORDER[index + 1] as string;
}

/**
 * Has the whole campaign been cleared at this difficulty? True once the last
 * level in LEVEL_ORDER has been beaten there. This is what unlocks free level
 * selection — until then the player is walked straight through the story.
 */
export function hasBeatenDifficulty(difficulty: Difficulty): boolean {
  const last = LEVEL_ORDER[LEVEL_ORDER.length - 1];
  return last !== undefined && hasCompletedLevel(last, difficulty);
}

/**
 * The story level to drop the player into next at this difficulty: the first
 * one along LEVEL_ORDER they have not yet cleared (falling back to the opener
 * once everything is done). Drives "continue the story" when the level select
 * is still locked.
 */
export function firstUnclearedLevel(difficulty: Difficulty): string {
  const opener = LEVEL_ORDER[0] as string;
  return LEVEL_ORDER.find((id) => !hasCompletedLevel(id, difficulty)) ?? opener;
}

// ---- Level tokens -------------------------------------------------------------
// Clearing a level at a difficulty mints a LEVEL TOKEN for that level (one
// per level × difficulty; a spent token is re-minted only by re-clearing).
// Spending a token unlocks the SAME level at a HIGHER difficulty ahead of
// the campaign there — the fast lane to the harder rungs' richer loot,
// while playing the difficulties in order stays the full-reward path. The
// unlock persists (dying doesn't revoke it); the token itself is one-shot.

// Unspent tokens, keyed by the level and the difficulty they were EARNED at.
const tokens = createFlagStore(storageKey("level-tokens"));
// Levels opened by a spent token, keyed by the level and the TARGET
// difficulty it was unlocked at.
const tokenUnlocks = createFlagStore(storageKey("token-unlocks"));

/** Ladder position, for "is this rung higher than that one" checks. */
const rung = (difficulty: Difficulty): number =>
  difficultyDef(difficulty).index;

/**
 * The difficulty an unspent token for `levelId` could be paid from, targeting
 * `target` — the LOWEST earning rung first, so the cheapest clear is spent
 * before a harder-won one. Null when no lower-rung token exists.
 */
export function tokenSourceFor(
  levelId: string,
  target: Difficulty,
): Difficulty | null {
  return (
    DIFFICULTY_ORDER.find(
      (earned) =>
        rung(earned) < rung(target) && tokens.has(levelKey(levelId, earned)),
    ) ?? null
  );
}

/** Can a token open `levelId` at `target` right now? Only meaningful while
 * the level is still locked there — an unlocked level needs no token. */
export function hasTokenFor(levelId: string, target: Difficulty): boolean {
  return (
    !isLevelUnlocked(levelId, target) &&
    tokenSourceFor(levelId, target) !== null
  );
}

/** Does any locked level at `difficulty` have a token ready to spend? Drives
 * the title menu: an unbeaten rung with spendable tokens opens the level
 * select instead of dropping straight into the campaign. */
export function hasSpendableTokens(difficulty: Difficulty): boolean {
  return LEVEL_ORDER.some((id) => hasTokenFor(id, difficulty));
}

/**
 * Spend a token on `levelId` at `target`: the earning rung's token is
 * consumed (it can't be used again) and the level unlocks there permanently.
 * False when no token was available — nothing is consumed.
 */
export function spendTokenFor(levelId: string, target: Difficulty): boolean {
  const source = tokenSourceFor(levelId, target);
  if (source === null || isLevelUnlocked(levelId, target)) return false;
  tokens.remove(levelKey(levelId, source));
  tokenUnlocks.add(levelKey(levelId, target));
  return true;
}

// ---- Loadout carry-over -------------------------------------------------------
// Victory banks a snapshot of the hero (level, stats, items — the engine's
// `extractLoadout`), keyed by the CLEARED level and difficulty; starting the
// following level hands it back to `createGame`, so progress genuinely
// carries through the campaign. Plain JSON in localStorage, same policy as
// the high scores.

const loadoutKey = (levelId: string, difficulty: Difficulty): string =>
  storageKey(`loadout:${difficulty}:${levelId}`);

/** Bank the hero's end-of-level snapshot for the level just cleared. */
export function saveLoadout(
  levelId: string,
  difficulty: Difficulty,
  loadout: Loadout,
): void {
  try {
    window.localStorage.setItem(
      loadoutKey(levelId, difficulty),
      JSON.stringify(loadout),
    );
  } catch {
    // Storage full or unavailable: the run still plays, it just won't carry.
  }
}

// ---- Keepsakes (unique/legendary permanence) -----------------------------
// Unique and legendary finds are once-per-game treasures, so they can outlive
// the run economy: BEAT a difficulty with them in your possession and they
// are stashed forever (`bankKeepsakesOnVictory`), poured back into the bag of
// every later run (`restoreKeepsakes`). HARDCORE mode (settings) puts them
// back on the table: DYING burns the stash, strips every banked loadout of
// its unique/legendary pieces, and revokes the LEVEL TOKENS and their
// unlocks (`noteHardcoreDeath`) — back to easy to earn it all again.
// Softcore death loses nothing.

const KEEPSAKES_KEY = storageKey("keepsakes");

function isKeepsake(piece: Equipment): boolean {
  return piece.tier === "unique" || piece.tier === "legendary";
}

/** Identity for dedupe: two rolls of the same base can coexist, but the SAME
 * find (same base, level, and rolled bonuses) is stashed once. */
function keepsakeSignature(piece: Equipment): string {
  return JSON.stringify({
    // The ORIGINAL base id, not the (possibly re-homed) frozen id, so a stashed
    // keepsake and a fresh drop of the same find dedupe as one.
    defId: baseDefId(piece),
    tier: piece.tier,
    ilvl: piece.ilvl,
    affixes: piece.affixes,
  });
}

/** The stashed unique/legendary pieces, oldest first. Each is adopted into the
 * live catalog so a base we later rebalanced or retired can't nerf or break a
 * treasure a test player earned. */
export function loadKeepsakes(): Equipment[] {
  try {
    const raw = window.localStorage.getItem(KEEPSAKES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as Equipment[])
      .map((piece) => adoptEquipment(piece))
      .filter((piece): piece is Equipment => piece !== null);
  } catch {
    return [];
  }
}

function saveKeepsakes(pieces: Equipment[]): void {
  try {
    window.localStorage.setItem(KEEPSAKES_KEY, JSON.stringify(pieces));
  } catch {
    // Storage unavailable — the hoard just doesn't persist this session.
  }
}

/**
 * The forever-bank, called on every level victory: once the cleared level is
 * the difficulty's LAST — the difficulty is beaten — every unique/legendary
 * the hero holds at that moment joins the permanent stash. Mid-campaign
 * victories don't bank (the pieces still carry level-to-level in the banked
 * loadout; hardcore death can still take them).
 */
export function bankKeepsakesOnVictory(
  levelId: string,
  loadout: Loadout,
): void {
  if (levelId !== LEVEL_ORDER[LEVEL_ORDER.length - 1]) return;
  bankKeepsakes(loadout);
}

/** Copy every unique/legendary piece the loadout carries into the stash. */
function bankKeepsakes(loadout: Loadout): void {
  const carried = [
    loadout.equipment.weapon,
    loadout.equipment.suit,
    loadout.equipment.charm,
    ...loadout.inventory,
  ].filter((p): p is Equipment => p !== null && isKeepsake(p));
  if (carried.length === 0) return;
  const stash = loadKeepsakes();
  const seen = new Set(stash.map(keepsakeSignature));
  for (const piece of carried) {
    const sig = keepsakeSignature(piece);
    if (seen.has(sig)) continue;
    seen.add(sig);
    stash.push(piece);
  }
  saveKeepsakes(stash);
}

/**
 * Pour the keepsake stash back into a freshly created run: every stashed
 * unique/legendary the hero isn't already carrying lands in the bag (the bag
 * grows a cell when full — treasures are never dropped at the door). Applies
 * in hardcore too: the stash exists until a death burns it.
 */
export function restoreKeepsakes(state: GameState): void {
  const stash = loadKeepsakes();
  if (stash.length === 0) return;
  const { weapon, suit, charm, bag } = state.player.equipment;
  const carried = new Set(
    [weapon, suit, charm, bag, ...state.player.inventory]
      .filter((p): p is Equipment => p !== null)
      .map(keepsakeSignature),
  );
  for (const piece of stash) {
    if (carried.has(keepsakeSignature(piece))) continue;
    const minted: Equipment = { ...piece, id: state.nextId++ };
    if (!addToInventory(state, minted)) {
      state.player.inventory.push(minted);
    }
  }
}

/** Strip unique/legendary pieces out of every banked loadout — the hardcore
 * burn, so a lower rung's carry-over can't resurrect the hoard. */
function stripBankedKeepsakes(): void {
  for (const difficulty of DIFFICULTY_ORDER) {
    for (const levelId of LEVEL_ORDER) {
      const banked = loadLoadout(levelId, difficulty);
      if (!banked) continue;
      const keep = (p: Equipment | null): Equipment | null =>
        p && isKeepsake(p) ? null : p;
      const weapon = keep(banked.equipment.weapon) ?? {
        id: 0,
        defId: "blaster",
        slot: "weapon" as const,
        tier: "regular" as const,
        ilvl: 1,
        affixes: [],
      };
      saveLoadout(levelId, difficulty, {
        ...banked,
        equipment: {
          weapon,
          suit: keep(banked.equipment.suit),
          charm: keep(banked.equipment.charm),
          bag: keep(banked.equipment.bag ?? null),
        },
        inventory: banked.inventory.map(keep),
      });
    }
  }
}

/**
 * The hardcore reckoning, called when the hero DIES. Off hardcore it is a
 * no-op — softcore death loses nothing. On hardcore, death takes everything
 * that made the shortcut possible: the keepsake stash burns, every banked
 * loadout is stripped of its unique/legendary pieces, and the LEVEL TOKENS —
 * unspent ones and the unlocks already bought with them — are revoked. The
 * respec jump is gone with them: the ladder is climbed again from the rungs
 * still cleared.
 */
export function noteHardcoreDeath(): void {
  if (getSettings().hardcore !== "on") return;
  saveKeepsakes([]);
  stripBankedKeepsakes();
  tokens.clear();
  tokenUnlocks.clear();
}

/**
 * Bring a loadout banked by an older build up to the current item system —
 * the Diablo loot rework retired the epic tier, added the item level, and
 * replaced the base weapon roster wholesale, and a stale snapshot must not
 * crash `createGame`. Each piece is ADOPTED into the live catalog, so a base
 * we later rebalanced or deleted keeps the item exactly as it dropped rather
 * than nerfing or discarding it; only a legacy piece (banked before item
 * snapshots) whose base is also gone is unresolvable and dropped (the weapon
 * slot then falls back to the engine's unbreakable sidearm). An epic tier
 * reads as rare; a missing `ilvl` is backfilled from the base's requirement.
 */
function migrateLoadout(loadout: Loadout): Loadout {
  const fix = (piece: Equipment | null): Equipment | null => {
    if (!piece) return null;
    const tier =
      (piece.tier as string) === "epic" ? ("rare" as const) : piece.tier;
    const adopted = adoptEquipment({ ...piece, tier });
    if (!adopted) return null;
    return {
      ...adopted,
      ilvl: adopted.ilvl ?? equipmentLevelReq(adopted.defId),
    };
  };
  const weapon = fix(loadout.equipment.weapon) ?? {
    id: 0,
    defId: "blaster",
    slot: "weapon" as const,
    tier: "regular" as const,
    ilvl: 1,
    affixes: [],
  };
  return {
    ...loadout,
    equipment: {
      weapon,
      suit: fix(loadout.equipment.suit),
      charm: fix(loadout.equipment.charm),
      bag: fix(loadout.equipment.bag ?? null),
    },
    inventory: loadout.inventory.map(fix),
  };
}

/** The snapshot banked when `levelId` was cleared at `difficulty`, if any. */
export function loadLoadout(
  levelId: string,
  difficulty: Difficulty,
): Loadout | null {
  try {
    const raw = window.localStorage.getItem(loadoutKey(levelId, difficulty));
    return raw ? migrateLoadout(JSON.parse(raw) as Loadout) : null;
  } catch {
    return null;
  }
}

/**
 * The loadout to start `levelId` with at `difficulty`: the snapshot banked
 * by clearing the previous story level — the real campaign carry-over — or,
 * when nothing is banked (dev `?level=` jumps, wiped storage), the engine's
 * derived stand-in. A TOKEN jump lands between the two: the target rung has
 * nothing banked yet, so the hero carries the previous level's snapshot from
 * the highest LOWER rung that has one — he arrives as the character who
 * earned the token, and the horde scales relative to his level regardless.
 * Null on the opener and on ids outside LEVEL_ORDER: those start fresh as
 * authored.
 */
export function startingLoadout(
  levelId: string,
  difficulty: Difficulty,
): Loadout | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return null;
  const previous = LEVEL_ORDER[index - 1] as string;
  const banked = loadLoadout(previous, difficulty);
  if (banked) return banked;
  for (const lower of [...DIFFICULTY_ORDER].reverse()) {
    if (rung(lower) >= rung(difficulty)) continue;
    const carried = loadLoadout(previous, lower);
    if (carried) return carried;
  }
  return deriveArrivalLoadout(levelId, difficulty);
}
