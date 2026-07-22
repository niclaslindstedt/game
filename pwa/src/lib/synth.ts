// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny WebAudio SFX synthesizer. Generic React/UI game code — lives in
// pwa/src/lib/ so it can be extracted into oss-framework once mature.
// All game sounds are synthesized (tones + filtered noise), so the PWA ships
// zero audio files and stays fully offline-capable.
//
// The voice model is 16-bit-console shaped: every tone can carry an attack
// envelope, a detuned second oscillator (chorus width), delayed vibrato, a
// biquad filter, stereo pan, and a send into one shared echo bus — the
// feedback-delay "hall" that defined SNES-era soundtracks.

export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

export type FilterOptions = {
  type: "lowpass" | "highpass" | "bandpass";
  /** Cutoff/center frequency in Hz. */
  frequency: number;
  /** Resonance; WebAudio default (~1) when omitted. */
  q?: number;
};

export type VibratoOptions = {
  /** LFO rate in Hz (5–7 reads as a singer, 2–3 as a wobble). */
  rateHz: number;
  /** Peak pitch deviation in cents. */
  depthCents: number;
  /** Fade the vibrato in after this long — classic 16-bit lead phrasing. */
  delayMs?: number;
};

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
  /** Absolute AudioContext start time in seconds (see `now()`); overrides
   * `delayMs`. Sequencers use this for drift-free scheduling. */
  at?: number;
  /** Volume ramp-up time; 0 (default) is a hard chip-style onset. */
  attackMs?: number;
  /** Layer a second oscillator detuned by ± this many cents — the cheap
   * chorus that makes one pulse wave sound like a section. */
  detuneCents?: number;
  vibrato?: VibratoOptions;
  /** Stereo position, -1 (left) to 1 (right); 0 = center. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
  filter?: FilterOptions;
};

export type NoiseOptions = {
  durationMs: number;
  volume?: number;
  delayMs?: number;
  /** Absolute AudioContext start time in seconds; overrides `delayMs`. */
  at?: number;
  /** Shape the noise: highpass ≈ hats/sizzle, lowpass ≈ thumps/rumble,
   * bandpass ≈ snares. Unfiltered white noise when omitted. */
  filter?: FilterOptions;
  /** Stereo position, -1 to 1. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
};

export type Synth = {
  /** Create/resume the AudioContext. Call from a user gesture handler. */
  unlock: () => void;
  /** Resume an already-created context that fell out of "running" (a
   * browser/OS suspend or an iOS interruption). Unlike `unlock` it never
   * creates a context, so it is safe to call from a timer or a browser event
   * outside a user gesture — a no-op while still locked. Lets the music
   * scheduler self-heal instead of waiting on the next gesture. */
  resume: () => void;
  tone: (options: ToneOptions) => void;
  noise: (options: NoiseOptions) => void;
  /** The AudioContext clock in seconds, or null while locked/unavailable.
   * Absolute `at` times for tone/noise are measured on this clock. */
  now: () => number | null;
};

// The shared echo: a filtered feedback delay every voice can send into.
// One instance per context keeps overlapping sounds in the same "room".
const ECHO_DELAY_S = 0.22;
const ECHO_FEEDBACK = 0.32;
const ECHO_DAMP_HZ = 2600;

// The master limiter: every voice (and the echo bus) sums into this
// compressor instead of connecting straight to the destination. Combat
// stacks many simultaneous voices — shots, hits, kills, all over the music —
// and their sum regularly exceeds full scale, which the destination renders
// as hard clipping. The threshold sits above any single sound's peak
// (volumes live in 0.03–0.12 ≈ −30…−18 dBFS), so isolated sounds pass
// untouched and only overlapping stacks get squeezed.
const LIMITER_THRESHOLD_DB = -12;
const LIMITER_KNEE_DB = 6;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.002;
const LIMITER_RELEASE_S = 0.18;

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let echoInput: GainNode | null = null;
  let master: AudioNode | null = null;

  // iOS puts the context into a non-standard "interrupted" state on app
  // switch / lock; treat anything that isn't running or closed as resumable.
  const resumeCtx = (c: AudioContext): void => {
    if (c.state !== "running" && c.state !== "closed") {
      c.resume().catch(() => {});
    }
  };

  const ensure = (): AudioContext | null => {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext();
      const c = ctx;
      // iOS PWA: returning from another app leaves the context interrupted
      // and no user gesture is guaranteed — resume on foreground transitions.
      const onVisible = (): void => {
        if (document.visibilityState === "visible") resumeCtx(c);
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", onVisible);
      window.addEventListener("focus", onVisible);
      c.addEventListener("statechange", () => {
        if (document.visibilityState === "visible") resumeCtx(c);
      });
      // iOS revives an interrupted context (app switch, incoming call, screen
      // lock) only from a REAL user gesture — the visibility/focus resumes
      // above are best-effort and routinely no-op on iOS PWA. Re-resume on the
      // player's very next touch ANYWHERE, captured so an overlay that stops
      // propagation can't swallow it, and passive since we never preventDefault.
      // This decouples recovery from the pause menu: when the app-switch landed
      // in a phase that shows no tap-to-resume prompt (a cutscene, a level-up,
      // the merchant, the title), the next tap still heals the audio instead of
      // it staying dead until the player happens to reach the pause screen.
      const onGesture = (): void => resumeCtx(c);
      const gestureOpts = { capture: true, passive: true } as const;
      document.addEventListener("pointerdown", onGesture, gestureOpts);
      document.addEventListener("touchend", onGesture, gestureOpts);
    }
    return ctx;
  };

  const masterBus = (c: AudioContext): AudioNode => {
    if (!master) {
      if (typeof c.createDynamicsCompressor === "function") {
        const limiter = c.createDynamicsCompressor();
        limiter.threshold.value = LIMITER_THRESHOLD_DB;
        limiter.knee.value = LIMITER_KNEE_DB;
        limiter.ratio.value = LIMITER_RATIO;
        limiter.attack.value = LIMITER_ATTACK_S;
        limiter.release.value = LIMITER_RELEASE_S;
        limiter.connect(c.destination);
        master = limiter;
      } else {
        master = c.destination;
      }
    }
    return master;
  };

  const echoBus = (c: AudioContext): GainNode => {
    if (!echoInput) {
      echoInput = c.createGain();
      const delay = c.createDelay(1);
      delay.delayTime.value = ECHO_DELAY_S;
      const damp = c.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = ECHO_DAMP_HZ;
      const feedback = c.createGain();
      feedback.gain.value = ECHO_FEEDBACK;
      echoInput.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(masterBus(c));
    }
    return echoInput;
  };

  /** Envelope → optional pan → master limiter (+ optional echo send);
   * returns the node sources should connect into. */
  const output = (
    c: AudioContext,
    gain: GainNode,
    pan: number,
    echo: number,
  ): void => {
    let tail: AudioNode = gain;
    if (pan !== 0 && typeof c.createStereoPanner === "function") {
      const panner = c.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(masterBus(c));
    if (echo > 0) {
      const send = c.createGain();
      send.gain.value = Math.min(1, echo);
      tail.connect(send);
      send.connect(echoBus(c));
    }
  };

  const applyFilter = (
    c: AudioContext,
    source: AudioNode,
    filter: FilterOptions | undefined,
  ): AudioNode => {
    if (!filter) return source;
    const node = c.createBiquadFilter();
    node.type = filter.type;
    node.frequency.value = filter.frequency;
    if (filter.q !== undefined) node.Q.value = filter.q;
    source.connect(node);
    return node;
  };

  return {
    unlock() {
      const c = ensure();
      if (c) resumeCtx(c);
    },

    resume() {
      // Only nudge a context that already exists — never create one here, so
      // this stays safe to call from a timer/event outside a user gesture
      // (creating a context off-gesture leaves it unresumable on iOS; see
      // now()).
      if (ctx) resumeCtx(ctx);
    },

    now() {
      // Never instantiate the context here. Creating an AudioContext outside
      // a user gesture leaves it in a state some browsers (notably iOS
      // Safari) will not reliably resume, so a later unlock() could fail to
      // reach "running" and the theme's scheduler would stay silent. The
      // context is created only in unlock(), which runs from a real gesture.
      return ctx && ctx.state === "running" ? ctx.currentTime : null;
    },

    tone({
      type = "square",
      from,
      to = from,
      durationMs,
      volume = 0.06,
      delayMs = 0,
      at,
      attackMs = 0,
      detuneCents = 0,
      vibrato,
      pan = 0,
      echo = 0,
      filter,
    }) {
      const c = ensure();
      if (!c) return;
      if (c.state !== "running") {
        resumeCtx(c); // nudge a suspended/interrupted context back; this one
        return; //       sound is dropped, but audio recovers for the next.
      }
      const t0 = at ?? c.currentTime + delayMs / 1000;
      const t1 = t0 + durationMs / 1000;

      // A detuned pair plays two half-loud oscillators around the pitch.
      const detunes = detuneCents > 0 ? [detuneCents, -detuneCents] : [0];
      const peak = detunes.length > 1 ? volume * 0.6 : volume;

      const gain = c.createGain();
      if (attackMs > 0) {
        const attackEnd = t0 + Math.min(attackMs, durationMs * 0.5) / 1000;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
      } else {
        gain.gain.setValueAtTime(peak, t0);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);

      const mix = c.createGain(); // oscillators sum here, pre-filter
      const filtered = applyFilter(c, mix, filter);
      filtered.connect(gain);
      output(c, gain, pan, echo);

      for (const cents of detunes) {
        const osc = c.createOscillator();
        osc.type = type;
        osc.detune.value = cents;
        osc.frequency.setValueAtTime(Math.max(1, from), t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t1);

        if (vibrato) {
          const lfo = c.createOscillator();
          lfo.frequency.value = vibrato.rateHz;
          const depth = c.createGain();
          const rise = t0 + (vibrato.delayMs ?? 0) / 1000;
          depth.gain.setValueAtTime(0, t0);
          depth.gain.linearRampToValueAtTime(
            vibrato.depthCents,
            Math.min(rise + 0.08, t1),
          );
          lfo.connect(depth);
          depth.connect(osc.detune);
          lfo.start(t0);
          lfo.stop(t1);
        }

        osc.connect(mix);
        osc.start(t0);
        osc.stop(t1);
      }
    },

    noise({
      durationMs,
      volume = 0.05,
      delayMs = 0,
      at,
      filter,
      pan = 0,
      echo = 0,
    }) {
      const c = ensure();
      if (!c) return;
      if (c.state !== "running") {
        resumeCtx(c); // nudge a suspended/interrupted context back; this one
        return; //       sound is dropped, but audio recovers for the next.
      }
      const t0 = at ?? c.currentTime + delayMs / 1000;
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
      applyFilter(c, source, filter).connect(gain);
      output(c, gain, pan, echo);
      source.start(t0);
    },
  };
}
