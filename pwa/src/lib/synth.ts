// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tiny WebAudio SFX synthesizer. Generic React/UI game code — lives in
// pwa/src/lib/, the pool a later game keeps as-is.
// All game sounds are synthesized (tones + filtered noise), so the PWA ships
// zero audio files and stays fully offline-capable. A MOD is the one exception,
// and the only reason `sample`/`decode` exist below: somebody else's sound
// design is the waveform, so a mod may ship a real .wav/.mp3 (see
// pwa/src/game/sfx/samples.ts). Nothing the game itself ships calls them.
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

/**
 * A RECORDING, played through the same chain a synthesized voice takes.
 *
 * The game itself authors none of these — every shipped sound is parameters
 * (see the module header). It exists for the one case parameters cannot cover:
 * a MOD that ships real audio files, where the sound designer's work IS the
 * waveform. The buffer arrives already decoded (`decode`), so nothing here
 * parses a container format.
 */
export type SampleOptions = {
  /** The decoded audio, from `decode()`. */
  buffer: AudioBuffer;
  /** Trim, 0–1. 1 (the default) plays the file at the level it was mastered
   * at — a recording is mixed by its author, unlike a voice whose volume is
   * this codebase's to choose. */
  volume?: number;
  /** Schedule the sound this far in the future. */
  delayMs?: number;
  /** Absolute AudioContext start time in seconds; overrides `delayMs`. */
  at?: number;
  /** Stereo position, -1 to 1. */
  pan?: number;
  /** 0–1 send level into the shared echo bus. */
  echo?: number;
  /** Playback rate; 1 (the default) is the recording's own pitch. */
  rate?: number;
};

export type Synth = {
  /** Create/resume the AudioContext. Call from a user gesture handler. */
  unlock: () => void;
  /** Start audio with NO user gesture behind it — but ONLY where the browser
   * says that is allowed (`navigator.getAutoplayPolicy`: the desktop shell
   * runs with `no-user-gesture-required`, and a browser grants it to an origin
   * the player already engages with). Anywhere that cannot answer the question
   * it is a deliberate no-op rather than a guess: a context built outside a
   * gesture lands in a state iOS Safari won't resume (see `now()`), so the
   * caller keeps waiting for a real one. Safe to call from a mount effect. */
  autostart: () => void;
  /** Resume an already-created context that fell out of "running" (a
   * browser/OS suspend or an iOS interruption). Unlike `unlock` it never
   * creates a context, so it is safe to call from a timer or a browser event
   * outside a user gesture — a no-op while still locked. Lets the music
   * scheduler self-heal instead of waiting on the next gesture. Also a no-op
   * while the page is BACKGROUNDED: the suspend that silenced it there is
   * deliberate, not a fault to heal. */
  resume: () => void;
  tone: (options: ToneOptions) => void;
  noise: (options: NoiseOptions) => void;
  /** Play an already-decoded recording through the same pan/limiter/echo
   * chain a voice takes. Nothing in the shipped game calls this — see
   * `SampleOptions`. */
  sample: (options: SampleOptions) => void;
  /** Decode an encoded audio file (WAV, MP3) into a buffer `sample` can play.
   *
   * Null rather than a throw for every failure there is: no context yet (the
   * player has not touched anything, so ask again later), a context that is
   * not running, or bytes the browser cannot make sense of. A caller that
   * gets null retries or gives up; nothing here is ever a crashed frame. */
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer | null>;
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

// How long a "running" context's clock may sit still after a foreground or
// gesture event before it is declared a zombie (see probeZombie below). A
// genuinely running context advances currentTime every render quantum
// (~3 ms), so a third of a second of stillness is unambiguous.
const ZOMBIE_PROBE_MS = 350;

/** Is the page in the background right now? Treated as visible wherever there
 * is no document (a test, a headless host) so nothing is silenced by accident. */
const pageHidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let echoInput: GainNode | null = null;
  let master: AudioNode | null = null;
  let listenersArmed = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let healAttempted = false;
  let rebuildOnGesture = false;

  // iOS puts the context into a non-standard "interrupted" state on app
  // switch / lock; treat anything that isn't running or closed as resumable.
  //
  // Never while the page is BACKGROUNDED, though: every revival path funnels
  // through here (the scheduler's self-heal tick, a dropped voice, a stray
  // focus event), and a resume that lands on a hidden page is the app playing
  // out loud from behind another one.
  const resumeCtx = (c: AudioContext): void => {
    if (pageHidden()) return;
    if (c.state !== "running" && c.state !== "closed") {
      c.resume().catch(() => {});
    }
  };

  // BACKGROUNDING THE APP MUST SILENCE IT — and only an explicit suspend does.
  //
  // iOS stops our sound on an app switch only when the app switched TO claims
  // the audio session (Safari, YouTube): that interrupts the context and the
  // music stops looking like it stopped for a reason. Switch to an app that
  // makes no sound — another home-screen PWA — and nothing interrupts
  // anything, so the context stays "running" and the game plays on from the
  // background. It plays SLOWLY, which is the tell: a hidden page's timers are
  // throttled to about 1 Hz, so the chiptune scheduler's 90 ms tick fires once
  // a second and books LOOKAHEAD_S (0.28 s) of notes each time — the theme
  // grinds along at roughly a quarter speed, out of an app the player isn't
  // even looking at.
  //
  // Suspending is also what hands the audio route back to the OS, so the phone
  // stops treating a backgrounded game as something that is playing.
  const suspendCtx = (): void => {
    const c = ctx;
    if (!c || c.state !== "running" || typeof c.suspend !== "function") return;
    // A probe scheduled while visible would land on the suspended context and
    // read its (legitimately) frozen clock as a zombie.
    if (probeTimer !== null) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    healAttempted = false;
    c.suspend().catch(() => {});
  };

  // Discard the current context and its per-context buses so ensure() builds
  // a fresh one. Only ever called for a confirmed-dead context.
  const teardown = (): void => {
    const old = ctx;
    ctx = null;
    master = null;
    echoInput = null;
    if (probeTimer !== null) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    healAttempted = false;
    if (old && old.state !== "closed" && typeof old.close === "function") {
      old.close().catch(() => {});
    }
  };

  // iOS WebKit sometimes hands back a ZOMBIE context after an app switch:
  // state reports "running" but the clock — and the output route — are dead.
  // resume() is a no-op on a "running" context, so no state-driven recovery
  // can catch it; watch the clock instead. If a "running" context's
  // currentTime hasn't moved ZOMBIE_PROBE_MS after a foreground/gesture
  // event, first force a suspend→resume cycle (which makes iOS re-activate
  // the audio session — usually enough, and needs no gesture); if the clock
  // is STILL frozen after that, flag the context for replacement on the
  // player's next touch. This is the failure the state-based recovery shipped
  // earlier could never reach — the one where switching apps a second time
  // "sometimes" brought the sound back by forcing a real interruption cycle.
  const probeZombie = (): void => {
    const c = ctx;
    if (!c || probeTimer !== null || c.state !== "running") return;
    if (pageHidden()) return; // a backgrounded context is meant to be frozen
    const t0 = c.currentTime;
    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (ctx !== c || c.state !== "running") return;
      if (c.currentTime !== t0) {
        healAttempted = false; // clock moves — genuinely alive
        return;
      }
      if (!healAttempted && typeof c.suspend === "function") {
        healAttempted = true;
        c.suspend()
          // The page can go away mid-cycle; finishing the heal then would
          // hand a backgrounded app its sound back.
          .then(() => (pageHidden() ? undefined : c.resume()))
          .catch(() => {})
          .then(() => probeZombie()); // verify the heal actually took
      } else {
        rebuildOnGesture = true;
      }
    }, ZOMBIE_PROBE_MS);
  };

  // Wired once, against the live `ctx` binding rather than a specific
  // context, so they keep working across a zombie-context rebuild.
  const armListeners = (): void => {
    if (listenersArmed) return;
    listenersArmed = true;
    // iOS PWA: returning from another app leaves the context interrupted
    // and no user gesture is guaranteed — resume on foreground transitions,
    // then verify the clock really moves (state alone lies; see probeZombie).
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") return;
      if (ctx) resumeCtx(ctx);
      probeZombie();
    };
    // The same event carries both directions — going away silences us (see
    // suspendCtx), coming back revives us.
    document.addEventListener("visibilitychange", () => {
      if (pageHidden()) suspendCtx();
      else onVisible();
    });
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("focus", onVisible);
    // A page being frozen, bfcached or navigated away doesn't always announce
    // itself through visibilitychange; `pagehide` is the backstop.
    window.addEventListener("pagehide", suspendCtx);
    // iOS revives an interrupted context (app switch, incoming call, screen
    // lock) only from a REAL user gesture — the visibility/focus resumes
    // above are best-effort and routinely no-op on iOS PWA. Re-resume on the
    // player's very next touch ANYWHERE, captured so an overlay that stops
    // propagation can't swallow it, and passive since we never preventDefault.
    // This decouples recovery from the pause menu: when the app-switch landed
    // in a phase that shows no tap-to-resume prompt (a cutscene, a level-up,
    // the merchant, the title), the next tap still heals the audio instead of
    // it staying dead until the player happens to reach the pause screen.
    const onGesture = (): void => {
      if (rebuildOnGesture) {
        // The old context is a confirmed zombie no resume could revive:
        // replace it here, inside the gesture — the only place iOS reliably
        // lets a fresh context start playing.
        rebuildOnGesture = false;
        teardown();
        const fresh = ensure();
        if (fresh) resumeCtx(fresh);
        return;
      }
      if (ctx) resumeCtx(ctx);
      probeZombie();
    };
    const gestureOpts = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", onGesture, gestureOpts);
    document.addEventListener("touchend", onGesture, gestureOpts);
  };

  // May a context start before the player has touched anything? Chromium is
  // the only engine that answers, and it is the one that matters here: the
  // desktop shell launches with `no-user-gesture-required`, and a browser
  // grants the policy to an origin with enough media engagement. Anything that
  // cannot answer — Safari, iOS, an old build — is treated as "no", because a
  // context built outside a gesture there is one no later gesture can revive.
  const autoplayAllowed = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as Navigator & {
      getAutoplayPolicy?: (type: string) => string;
    };
    if (typeof nav.getAutoplayPolicy !== "function") return false;
    try {
      return nav.getAutoplayPolicy("audiocontext") === "allowed";
    } catch {
      return false;
    }
  };

  const ensure = (): AudioContext | null => {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      // A sound fired by a backgrounded page must not be what builds the one
      // context: born outside a gesture it lands in a state iOS won't resume
      // (see now()), and it would be born to play into another app anyway.
      if (pageHidden()) return null;
      ctx = new AudioContext();
      armListeners();
      const c = ctx;
      c.addEventListener("statechange", () => {
        if (ctx !== c) return; // a replaced context no longer speaks for us
        if (document.visibilityState === "visible") {
          resumeCtx(c);
          probeZombie();
        }
      });
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

    autostart() {
      // An existing context needs no permission — nudging it is what `resume`
      // already does, and it is the "came back from a run" case.
      if (ctx) {
        resumeCtx(ctx);
        return;
      }
      if (!autoplayAllowed()) return;
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

    sample({
      buffer,
      volume = 1,
      delayMs = 0,
      at,
      pan = 0,
      echo = 0,
      rate = 1,
    }) {
      const c = ensure();
      if (!c) return;
      if (c.state !== "running") {
        resumeCtx(c); // nudge a suspended/interrupted context back; this one
        return; //       sound is dropped, but audio recovers for the next.
      }
      const t0 = at ?? c.currentTime + delayMs / 1000;
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.05, rate);
      const gain = c.createGain();
      // No envelope: a recording carries its own attack and release, and
      // ramping one on top is the difference between playing somebody's sound
      // and playing our idea of it. The limiter still catches the sum.
      gain.gain.setValueAtTime(Math.max(0.0001, volume), t0);
      source.connect(gain);
      output(c, gain, pan, echo);
      source.start(t0);
    },

    async decode(bytes) {
      const c = ensure();
      // A locked or non-running context cannot decode; the caller is expected
      // to ask again once audio is live rather than to treat this as a fault.
      if (!c || c.state !== "running") return null;
      try {
        // `decodeAudioData` DETACHES the ArrayBuffer it is handed, so a retry
        // (or a second sound sharing one file's bytes) would be decoding an
        // empty buffer. Slice a copy and let the original stay usable.
        return await c.decodeAudioData(bytes.slice(0));
      } catch {
        return null;
      }
    },
  };
}
