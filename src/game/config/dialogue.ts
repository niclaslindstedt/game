// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// In-world dialogue: speak/sight/strike trigger radii and the cap-farm
// thought cadence.

/**
 * In-world dialogue (elite ambushes, boss confrontations, story-item lore).
 * Speakers hold their scene until the player has tapped through every page;
 * the world freezes in the `dialogue` phase meanwhile.
 */
export const DIALOGUE = {
  /**
   * An awake speaker opens its scene once within this distance of the
   * player (world px) — inside the phone-landscape half-view (≈211×97), so
   * the speaker is visibly on screen when the world stops.
   */
  speakRadius: 96,
  /**
   * A level's `firstSightThoughts` fire once a pinned mob is within this
   * distance of the player (world px). Same rationale as `speakRadius`:
   * inside the phone half-view, so the mob the hero is reacting to is
   * actually on screen when his thought stops the world.
   */
  sightRadius: 96,
  /**
   * A level's `openingStrike` arms the hero once its scripted vanguard closes
   * to within this distance of the player (world px). This generic fallback is
   * the phone-half-view (as `speakRadius`); a level should override it per-strike
   * via `OpeningStrike.radius` down to a CONTACT gap so the swing lands when the
   * rusher is actually on top of the hero — see spacez_hq, which does exactly
   * that. A contact trigger only avoids a kiting stall when the vanguard's
   * `rushSpeed` outruns PLAYER.speed, so pair the two.
   */
  strikeRadius: 96,
  /**
   * The cooldown (ms, counts down each step) between the hero's recurring
   * "these enemies are getting pathetic — I should hurry and find Ada" thought
   * (see `maybeCapThought` in story.ts). Unlike the pinned one-shot beats this
   * one REPEATS: it fires whenever the hero is farming a map he has already
   * capped (level ≥ the map's `xpLevelCap`), then holds for this long so the
   * grind mutters it every so often rather than on every kill. Sized so a long
   * cap-farm hears it tens of times across the campaign, never back-to-back.
   */
  capThoughtCooldownMs: 60_000,
  /**
   * The menace STAGE above which the "these enemies are pathetic" cap-farm
   * mutter falls silent (see `maybeCapThought` in story.ts). Once the horde has
   * evolved past this stage it is demonstrably NOT pathetic anymore — mobs
   * carry stacked evolution hp and the set pieces power-match the hero — so the
   * self-satisfied grind line would read as flatly wrong. The hero can still be
   * over the map's `xpLevelCap` and hear it at or below this stage; it's the
   * high-menace rampage where the horde has answered his power that mutes it.
   */
  capThoughtMenaceStageCeiling: 10,
} as const;
