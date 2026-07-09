// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parking the in-progress run in storage, so it survives a page reload — most
// importantly the one an app update forces. A run exited to the menu used to
// live only in React memory: applying a PWA update reloads the page, memory is
// wiped, and the CONTINUE button vanished with it (the exact bug this fixes).
//
// The whole engine GameState is plain JSON apart from its `rng` closure, so we
// serialize the state as-is and snapshot the rng's internal position beside it,
// rebuilding the generator on load so a resumed run picks up the exact same
// stream (proven in tests/engine/persistence_test.ts).

import { adoptEquipment, LEVELS, warn } from "@game/core";
import type { Difficulty, Equipment, GameState } from "@game/core";

import { createRngFromState, rngState } from "@game/lib/rng.ts";

import { storageKey } from "../identity.ts";

const KEY = storageKey("current-run");

// Bump this whenever the serialized GameState shape changes in a way an older
// snapshot can't be read into. A mismatched (or unparseable) blob is dropped
// rather than resumed, so a stale run from a previous build never crashes the
// thaw — the CONTINUE button simply doesn't appear, as it wouldn't have before.
// v2: companions/choice/companionFocus joined the state (a v1 run would thaw
// without the party fields and crash the companion pass).
// v3: levelUpFxMs (the ding-celebration countdown) joined the state.
const SAVE_VERSION = 3;

/** A run parked between sessions: enough to drop the player straight back in. */
export type ParkedRun = {
  difficulty: Difficulty;
  levelId: string;
  state: GameState;
};

type Serialized = {
  v: number;
  difficulty: Difficulty;
  levelId: string;
  // The rng closures can't be serialized; each stream's position is snapshotted
  // here and the generators rebuilt on load, so a resumed run replays the exact
  // same loot AND damage-variance sequence a live one would.
  rngState: number;
  fxRngState: number;
  // The GameState verbatim minus its rng streams (restored on load). `events`
  // is transient per-step chatter, blanked so a resume doesn't replay stale sfx.
  state: Omit<GameState, "rng" | "fxRng">;
};

/** Freeze the parked run to storage. Best-effort — a storage failure is logged, not thrown. */
export function saveRun(run: ParkedRun): void {
  try {
    const { rng, fxRng, ...rest } = run.state;
    const payload: Serialized = {
      v: SAVE_VERSION,
      difficulty: run.difficulty,
      levelId: run.levelId,
      rngState: rngState(rng),
      fxRngState: rngState(fxRng),
      // `events` is transient per-step chatter; blank it so a resume doesn't
      // replay stale sfx (it's overwritten again on the first step anyway).
      state: { ...rest, events: [] },
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (err) {
    warn(`could not save the current run: ${String(err)}`);
  }
}

/** The engine's unbreakable sidearm — the floor a thawed loadout falls back to
 * when its equipped weapon is a legacy piece whose base the catalog has since
 * dropped (a run can never resume weaponless). */
function fallbackWeapon(): Equipment {
  return {
    id: 0,
    defId: "blaster",
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/**
 * Re-home every kept item in a thawed run onto its frozen def snapshot, so a
 * base we rebalanced or deleted since the run was parked can neither nerf the
 * player's gear nor crash the resume. The equipped weapon can never adopt to
 * nothing (it falls back to the sidearm); a bag cell or ground drop that can't
 * be resolved (a legacy piece whose base is gone) is simply cleared/removed.
 */
function adoptRunEquipment(state: GameState): void {
  const equip = state.player.equipment;
  equip.weapon = adoptEquipment(equip.weapon) ?? fallbackWeapon();
  // A pre-revamp run may carry a `suit`-slot piece the four-slot body can't
  // wear anymore — adopt what fits, leave the rest behind.
  const adoptWorn = (piece: Equipment | null | undefined): Equipment | null =>
    piece && piece.slot in equip ? adoptEquipment(piece) : null;
  equip.head = adoptWorn(equip.head);
  equip.chest = adoptWorn(equip.chest);
  equip.legs = adoptWorn(equip.legs);
  equip.feet = adoptWorn(equip.feet);
  equip.charm = adoptWorn(equip.charm);
  equip.bag = adoptWorn(equip.bag);
  state.player.inventory = state.player.inventory.map((cell) =>
    cell && cell.slot in equip ? adoptEquipment(cell) : null,
  );
  state.items = state.items.filter((item) => {
    if (item.kind !== "equipment") return true;
    const adopted = adoptEquipment(item.equipment);
    if (!adopted) return false;
    item.equipment = adopted;
    return true;
  });
  // The party's kit adopts the same way — a companion can never resume
  // weaponless, and an unresolvable armor piece is simply left behind.
  for (const companion of state.companions) {
    companion.equipment.weapon =
      adoptEquipment(companion.equipment.weapon) ?? fallbackWeapon();
    companion.equipment.head = companion.equipment.head
      ? adoptEquipment(companion.equipment.head)
      : null;
    companion.equipment.chest = companion.equipment.chest
      ? adoptEquipment(companion.equipment.chest)
      : null;
  }
}

/** Drop any parked run — called when one is resumed, abandoned, or replaced. */
export function clearSavedRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // A storage that won't delete is a storage that won't persist either;
    // nothing to recover, so stay silent.
  }
}

/**
 * Thaw the parked run from storage, or null if there's none / it's unreadable
 * / it was written by an incompatible build. Any such blob is cleared so it
 * can't wedge future loads.
 */
export function loadSavedRun(): ParkedRun | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Serialized;
    // Reject anything from an older/newer save format, or parked on a level a
    // later build has since retired — either way it can't be resumed cleanly.
    if (
      !payload ||
      payload.v !== SAVE_VERSION ||
      typeof payload.levelId !== "string" ||
      !(payload.levelId in LEVELS)
    ) {
      clearSavedRun();
      return null;
    }
    const state: GameState = {
      ...payload.state,
      events: [],
      rng: createRngFromState(payload.rngState),
      // Restore the flavor stream too (older saves predate it — fall back to a
      // seed derived from the loot position so they resume without a crash).
      fxRng: createRngFromState(
        payload.fxRngState ?? (payload.rngState ^ 0x9e3779b9) >>> 0,
      ),
    };
    // Freeze every kept item to its dropped-with stats before the run resumes,
    // so a catalog edge that landed while the run was parked can't reach it.
    adoptRunEquipment(state);
    return {
      difficulty: payload.difficulty,
      levelId: payload.levelId,
      state,
    };
  } catch (err) {
    warn(`ignoring an unreadable saved run: ${String(err)}`);
    clearSavedRun();
    return null;
  }
}
