// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny WebAudio SFX synthesizer. Generic React/UI game code — lives in
// website/src/lib/ so it can be extracted into oss-framework once mature.
// All game sounds are synthesized (tones + filtered noise), so the PWA ships
// zero audio files and stays fully offline-capable.

export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

export type ToneOptions = {
  type?: WaveType;
  /** Start frequency in Hz. */
  from: number;
  /** End frequency (exponential glide); defaults to `from`. */
  to?: number;
  durationMs: number;
  volume?: number;
  /** Schedule the sound this far in the future (for little melodies). */
  delayMs?: number;
};

export type NoiseOptions = {
  durationMs: number;
  volume?: number;
  delayMs?: number;
};

export type Synth = {
  /** Create/resume the AudioContext. Call from a user gesture handler. */
  unlock: () => void;
  tone: (options: ToneOptions) => void;
  noise: (options: NoiseOptions) => void;
};

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;

  const ensure = (): AudioContext | null => {
    if (typeof AudioContext === "undefined") return null;
    ctx ??= new AudioContext();
    return ctx;
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },

    tone({
      type = "square",
      from,
      to = from,
      durationMs,
      volume = 0.06,
      delayMs = 0,
    }) {
      const c = ensure();
      if (!c || c.state !== "running") return;
      const t0 = c.currentTime + delayMs / 1000;
      const t1 = t0 + durationMs / 1000;

      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, from), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t1);

      const gain = c.createGain();
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t1);
    },

    noise({ durationMs, volume = 0.05, delayMs = 0 }) {
      const c = ensure();
      if (!c || c.state !== "running") return;
      const t0 = c.currentTime + delayMs / 1000;
      const length = Math.max(
        1,
        Math.floor((c.sampleRate * durationMs) / 1000),
      );

      const buffer = c.createBuffer(1, length, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        // White noise with a linear fade-out baked into the buffer.
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(volume, t0);
      source.connect(gain).connect(c.destination);
      source.start(t0);
    },
  };
}
