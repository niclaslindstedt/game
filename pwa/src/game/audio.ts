// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's single audio surface: one underlying synth (one AudioContext)
// shared by SFX and music, wrapped into two volume-scaled views so the
// settings screen can mix them independently. Unlocking on any user gesture
// unlocks everything.

import { clamp01 } from "@game/lib/vec.ts";
import { createSynth, type Synth } from "@ui/lib/synth.ts";

const raw = createSynth();

let sfxVolume = 1;
let musicVolume = 1;

/** Set the 0–1 master volumes (called by settings.ts). */
export function setAudioVolumes(v: { music: number; sfx: number }): void {
  musicVolume = clamp01(v.music);
  sfxVolume = clamp01(v.sfx);
}

/** A synth view whose every sound is scaled by a live master volume.
 * (Defaults mirror synth.ts's tone/noise volume defaults.) */
function scaledView(volume: () => number): Synth {
  return {
    unlock: () => raw.unlock(),
    autostart: () => raw.autostart(),
    resume: () => raw.resume(),
    now: () => raw.now(),
    tone(options) {
      const scaled = (options.volume ?? 0.06) * volume();
      if (scaled < 0.001) return; // muted — skip the node entirely
      raw.tone({ ...options, volume: scaled });
    },
    noise(options) {
      const scaled = (options.volume ?? 0.05) * volume();
      if (scaled < 0.001) return;
      raw.noise({ ...options, volume: scaled });
    },
    // A recording defaults to 1 rather than to a voice's ~0.05: the file was
    // mastered by whoever made it, so full scale is "as authored" — but it
    // still passes through the master volume, or a mod's sounds would ignore
    // the SFX slider and the mute switch alike.
    // Muted returns null rather than a dead handle: there IS no source, so a
    // loop's owner must be told it started nothing. (A handle that silently
    // stopped nothing would leave the caller believing the loop is running,
    // and the next unmute would never start it.)
    sample(options) {
      const scaled = (options.volume ?? 1) * volume();
      if (scaled < 0.001) return null;
      return raw.sample({ ...options, volume: scaled });
    },
    // Decoding is volume-free, so both views share the one context's decoder.
    decode: (bytes) => raw.decode(bytes),
  };
}

/** All sound effects route through this view. */
export const synth: Synth = scaledView(() => sfxVolume);

/** The music sequencer routes through this one. */
export const musicSynth: Synth = scaledView(() => musicVolume);
