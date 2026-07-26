// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The engine's RUNTIME TOGGLES — the handful of player settings the app applies
// to the engine, held in a module with no imports at all.
//
// Each of these gates a system, and each is applied at STARTUP: the app reads
// the persisted settings and pushes them into the engine before any run exists
// (see pwa/src/game/settings.ts). Keeping the setters inside the systems they
// gate meant the settings screen had to import those systems to flip a boolean
// — the dialogue toggle dragged in the enemy catalog, the cutscene and thought
// defs and the menace curve; the auto-equip toggle dragged in the whole pickup
// and ranking model — parking a few hundred KB of simulation in the app's
// startup chunk (which the SEO check's critical-path budget polices, §11.3.9).
// The systems re-export their own readers, so nothing else moved.
//
// The one engine toggle NOT here is `setBalanceTuning`, because its home
// (tuning.ts) is already a leaf with nothing behind it. Add a flag here when its
// natural home would drag a system along, not as a matter of course.

// -- Story display preferences (pwa settings `dialogue` / `cutscenes`) --------
//
// Whether the story's spoken scenes play at all. Both default ON — the shipped
// experience. Read at level build (create.ts), so they take effect on the next
// map: `dialogueEnabled` off starts a run already `dialogueMuted`, silencing
// every in-world scene (arrivals, last words, thoughts, lore, companion joins,
// the merchant greeting) exactly like the in-run MUTE button; `cutscenesEnabled`
// off drops the prelude cutscenes so the run opens straight on the hero's intro
// monologue. Pure presentation — they gate no simulation rule — but they live
// engine-side so the app, tests, and headless sims all apply them the one way.
let dialogueEnabled = true;
let cutscenesEnabled = true;

/** Toggle the in-world dialogue scenes (a display preference). Off makes a
 * freshly built level start muted (see `create.ts`). */
export function setDialogueEnabled(enabled: boolean): void {
  dialogueEnabled = enabled;
}

/** Whether in-world dialogue is enabled (read by `create.ts`). */
export function isDialogueEnabled(): boolean {
  return dialogueEnabled;
}

/** Toggle the prelude cutscenes (a display preference). Off skips them at
 * level build (see `create.ts`). */
export function setCutscenesEnabled(enabled: boolean): void {
  cutscenesEnabled = enabled;
}

/** Whether prelude cutscenes are enabled (read by `create.ts`). */
export function areCutscenesEnabled(): boolean {
  return cutscenesEnabled;
}

// -- Auto-equip on pickup (pwa setting `autoEquip`) ---------------------------
//
// Whether a picked-up piece that out-scores the worn one is EQUIPPED ON THE SPOT
// (on) or banked to the bag for the player to equip by hand (off). It gates the
// pickup path in step/items.ts only — the manual AUTO-EQUIP sweep
// (autoEquipBest), the on-break weapon swap (a broken weapon still needs a
// replacement), and the pure ranking predicates are all unaffected, so a player
// who turns auto-equip off keeps every manual escape hatch. The engine default
// is on (the standalone/test baseline when no app configures it); the shipped
// app applies the persisted choice on load. Tests that toggle it must restore
// it.
let autoEquipOnPickup = true;

/** Toggle whether picked-up upgrades are worn on the spot (a player setting).
 * Off banks them to the bag instead; the manual AUTO-EQUIP button and the
 * on-break weapon swap still work. */
export function setAutoEquipEnabled(enabled: boolean): void {
  autoEquipOnPickup = enabled;
}

/** Whether the on-pickup auto-equip is active (see `setAutoEquipEnabled`). The
 * pickup path in step/items.ts reads this to decide equip-on-spot vs bag-it. */
export function isAutoEquipEnabled(): boolean {
  return autoEquipOnPickup;
}

// -- Automatic per-level stat growth (pwa developer flag `autoLevelStats`) ----
//
// Whether the automatic per-level base-stat growth is active. Off, `autoGainAt`
// (leveling.ts) returns 0, which cascades through every derivation there — the
// hero stops banking free stats AND the horde's compensating hp scale drops in
// lockstep, so the balance stays whole. Auto-stat growth is an EXPERIMENTAL,
// opt-in feature: the engine default is OFF, matching the shipped app (which
// only flips it on when the developer enables `autoLevelStats`), so the
// standalone/test/sim baseline calibrates against the same auto-OFF regime the
// player actually runs. Tests toggle it and must restore it.
let autoStatGainsEnabled = false;

/**
 * Toggle the automatic per-level base-stat growth (a developer flag). Off
 * strips both the hero's free gains and the mob hp scaling that compensates
 * them (they derive from the same `autoGainAt`), so the balance stays whole.
 */
export function setAutoStatGainsEnabled(enabled: boolean): void {
  autoStatGainsEnabled = enabled;
}

/** Whether the automatic per-level growth is on — a cache key for reads that
 * fold `baseStatBonus` in (the hero-loadout memo in items/derived.ts). */
export function autoStatGainsOn(): boolean {
  return autoStatGainsEnabled;
}
