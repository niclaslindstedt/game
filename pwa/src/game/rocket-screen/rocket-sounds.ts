// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE FLIGHT SOUNDS LIKE — the id banks and the pickers, and nothing that
// touches a synth.
//
// A PURE PICK MODULE, exactly as `drive-sounds.ts` is: the drain (`loop.ts`)
// asks "which sound is this event", this file answers with an id from
// `content/sounds/rocket_*.yaml`, and the shared surface plays it
// (`playFlightSound`, sfx/index.ts) — so a mod that re-skins the flight's
// sounds is heard up here exactly as it is heard in a fight.
//
// VARIETY WITHOUT A DRAW: every take is picked by hashing the event's own
// position or seed, never by spending the sky's stream — the drive's loot-toss
// rule, for the drive's reason.

import { blastHash } from "@game/core";

/** A bag landing on the hull — soft, dead, a little embarrassing. */
export const STICK_SOUNDS = [
  "rocket_stick_a",
  "rocket_stick_b",
  "rocket_stick_c",
] as const;

/** Something hard meeting the paintwork. */
export const CLANG_SOUNDS = ["rocket_clang_a", "rocket_clang_b"] as const;

/** The fireworks — one per explosion, varied by the blast's own seed. */
export const BOOM_SOUNDS = [
  "rocket_boom_a",
  "rocket_boom_b",
  "rocket_boom_c",
] as const;

/** The extra floor under a BIG one — layered beneath its boom, never alone. */
export const BOOM_DEEP_SOUND = "rocket_boom_deep";

/** The attitude alarm — the one beep this cockpit has, edge-triggered by the
 * engine (`warning`), so it can never nag. */
export const WARNING_SOUND = "rocket_warning";

/** The shell falling away / orbit made — the trip's one moment of fanfare. */
export const ORBIT_SOUND = "rocket_orbit";

/** The pads meeting regolith, gently enough to keep. */
export const TOUCHDOWN_SOUND = "rocket_touchdown";

/** One breath of the steering poofs. Rate-limited by the caller's funnel — a
 * poof per frame would be a hiss. */
export const POOF_SOUND = "rocket_poof";

/** One grain of the engine bed — re-fired on a CONSTANT cadence while the
 * flight lives (the base burn never stops). */
export const RUMBLE_SOUND = "rocket_rumble";

/** …and the brighter grain LAYERED on the same clock while the boosters are
 * open — the engine opening up, never speeding up. */
export const BOOST_SOUND = "rocket_boost";

/** One grain of the DOWNPOUR — layered on the same clock while the climb is
 * still inside the storm (`stormIntensity`), gone when the ship punches out. */
export const RAIN_SOUND = "rocket_rain";

/** The thunder a strike owes, seconds after its flash — two takes, picked by
 * the strike's own window so a replayed storm claps identically. */
export const THUNDER_SOUNDS = ["rocket_thunder_a", "rocket_thunder_b"] as const;

/** Every id this screen can ask for — the content test walks this list against
 * the shipped catalog, so a renamed yaml cannot go quiet. */
export const FLIGHT_SOUND_IDS: readonly string[] = [
  ...STICK_SOUNDS,
  ...CLANG_SOUNDS,
  ...BOOM_SOUNDS,
  BOOM_DEEP_SOUND,
  WARNING_SOUND,
  ORBIT_SOUND,
  TOUCHDOWN_SOUND,
  POOF_SOUND,
  RUMBLE_SOUND,
  BOOST_SOUND,
  RAIN_SOUND,
  ...THUNDER_SOUNDS,
];

/** Pick a take by position — the same event at the same spot is the same
 * noise, and two spots are two takes. */
export function takeAt(
  bank: readonly string[],
  x: number,
  alt: number,
): string {
  const h = blastHash(
    (Math.round(x) * 73856093) ^ (Math.round(alt) * 19349663),
  );
  return bank[h % bank.length]!;
}

/** …and a take by an explosion's own seed, so the boom always matches its
 * fireball. */
export function boomFor(seed: number): string {
  return BOOM_SOUNDS[blastHash(seed) % BOOM_SOUNDS.length]!;
}
