// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's single haptics surface — the vibration counterpart to audio.ts.
// One `Haptics` (one Vibration API, or a native driver later) shared by the
// game, plus the vibration vocabulary that mirrors sfx/. Taking a hit buzzes
// back, scaled to the share of the hp bar the blow cost — up to the hero's
// death, which plays the hardest rumble of all. Dialogue is felt too — each
// letter of the typewriter crawl ticks the motor so a line lands under the
// thumb as well as on screen — and pressing a title-menu row taps it. Kills do
// NOT buzz (a busy field would be a constant motor drone). On iOS in a browser
// (no Vibration API) the underlying driver is a noop, so this all costs nothing;
// the native app polyfills the API onto the Taptic Engine.

import { createHaptics, type HapticPattern } from "@ui/lib/haptics.ts";

/** The one haptics surface the whole app shares. */
export const haptics = createHaptics();

/** Player toggle, wired from settings.ts (mirrors setAudioVolumes). */
export function setHapticsEnabled(enabled: boolean): void {
  haptics.setEnabled(enabled);
}

/** Buzz when the hero takes a hit, scaled to the share of his MAX hp the blow
 * cost: a graze is a faint flick, a blow that empties half the bar a heavy
 * jolt, a near-fatal hit the hardest rumble. Paired with the playerHurt SFX and
 * the hurt flash so a bite lands under the thumb too. `frac` is the fraction of
 * max hp lost this tick (0..1, clamped); a noop when nothing was lost or
 * haptics are off/unsupported. The native bridge maps a longer pulse onto a
 * heavier Taptic impact, so the buzz grows in WEIGHT with the wound. */
export function playDamageHaptic(frac: number): void {
  if (!haptics.active) return;
  if (!(frac > 0)) return;
  const f = Math.min(1, frac);
  // A graze (~a sliver of the bar) is a ~14ms flick; a bar-emptying blow a
  // ~94ms jolt — long enough that the bridge picks the Heavy impact style.
  const on = Math.round(14 + f * 80);
  // A heavy hit (half the bar or more) splits into a two-beat rumble so the
  // extra energy reads as a solid THUD-thud rather than one overlong drone —
  // the same trick the boss kill and pack rumble use.
  if (f >= 0.5) {
    haptics.vibrate([on, 35, Math.round(on * 0.6)]);
  } else {
    haptics.vibrate(on);
  }
}

// The hardest buzz the game plays: the hero's death. A long, heavy, rolling
// rumble — every pulse well past the Heavy-impact threshold the native bridge
// keys off — so a run ending lands as unmistakable weight under the thumb, a
// tier above even a near-fatal hit. Fired ON death (see GameScreen's defeat
// event), and since `navigator.vibrate` replaces the active pattern it
// overrides the fatal blow's own damage buzz from the same tick.
const DEATH_PATTERN: HapticPattern = [110, 55, 110, 55, 200];

/** Buzz the hero's death at full strength — paired with the defeat jingle. A
 * noop when haptics are off/unsupported. */
export function playDeathHaptic(): void {
  haptics.vibrate(DEATH_PATTERN);
}

// A LIGHTNING STRIKE earthing itself: a short, sharp double crack — the bolt's
// snap and its rolling echo — so a storm-bolt landing is felt as a jolt under
// the thumb, paired with the crack SFX and the on-screen flash. Kept crisp and
// light (bolts proc often) so it reads as a flick, not a hit.
const LIGHTNING_PATTERN: HapticPattern = [22, 24, 12];

/** Buzz a lightning strike — paired with the storm-crack SFX and the flash. A
 * noop when haptics are off/unsupported. */
export function playLightningHaptic(): void {
  haptics.vibrate(LIGHTNING_PATTERN);
}

// The NUKE going off: the heaviest ground-shake the game plays short of death —
// a long, rolling three-beat rumble, every pulse well past the native bridge's
// Heavy-impact threshold, so the screen-clearer lands like a detonation felt in
// the hands, not just seen. Paired with the sub-bass boom + the camera kick.
const NUKE_PATTERN: HapticPattern = [140, 60, 120, 60, 200];

/** Buzz the screen-nuke detonation at full weight — paired with the boom SFX
 * and the hard camera kick. A noop when haptics are off/unsupported. */
export function playNukeHaptic(): void {
  haptics.vibrate(NUKE_PATTERN);
}

// A light tick under a title-menu row press — the shortest firm tap, so moving
// through the menus is felt under the thumb. Kept below the equip/kill weight
// on purpose: this is UI chrome, not a game hit.
const MENU_PRESS_MS = 10;

/** Buzz a menu row press (paired with the confirm/back UI blip). A noop when
 * haptics are off/unsupported. */
export function playMenuHaptic(): void {
  haptics.vibrate(MENU_PRESS_MS);
}

// A short triumphant roll when an achievement badge pops — pitched a beat above
// a kill so unlocking a feat is felt as a reward, not a hit.
const ACHIEVEMENT_PATTERN: HapticPattern = [30, 45, 55];

/** Buzz an achievement unlock — paired with the toast + jingle. A noop when
 * haptics are off/unsupported. */
export function playAchievementHaptic(): void {
  haptics.vibrate(ACHIEVEMENT_PATTERN);
}

// The LEVEL-UP detonation: a heavy opening jolt for the light explosion (past
// the native bridge's Heavy-impact threshold, like the nuke's), then a bright
// rising three-beat celebratory roll as the fanfare lifts — the ding felt as
// force AND reward, the biggest buzz short of the screen-nuke and death.
const LEVELUP_PATTERN: HapticPattern = [120, 70, 40, 40, 55, 40, 75];

/** Buzz the level-up light explosion — paired with the ding fanfare, the
 * full-screen flash, and the camera kick. A noop when haptics are
 * off/unsupported. */
export function playLevelUpHaptic(): void {
  haptics.vibrate(LEVELUP_PATTERN);
}

// A firm double tap when gear snaps into a slot — two pulses that mirror the
// equip sound's twin sword-clang, so committing a piece is felt as a solid
// "clunk-clunk" under the thumb. A noop when haptics are off/unsupported.
const EQUIP_PATTERN: HapticPattern = [18, 30, 24];

/** Buzz a successful equip/unequip — paired with the "equip" sword-clash SFX
 * so slotting a piece lands on the thumb as well as the ear. */
export function playEquipHaptic(): void {
  haptics.vibrate(EQUIP_PATTERN);
}

// A faint tick under each typewriter letter — the shortest pulse a motor can
// register, so the dialogue crawl reads as a light chatter under the thumb
// rather than one long buzz. Fired on the same cadence as the print blip.
const TYPEWRITER_TICK_MS = 7;

/** Buzz one letter of the dialogue crawl. Paired with the print blip so the
 * line is felt as it types; a noop when haptics are off/unsupported. */
export function playTypewriterHaptic(): void {
  haptics.vibrate(TYPEWRITER_TICK_MS);
}
