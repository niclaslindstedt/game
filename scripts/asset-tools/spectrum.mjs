// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OTHER HALF OF A SCORE — what it will SOUND like, as opposed to what it
// says. A stave carries pitch and rhythm and is silent about everything else:
// how loud a voice is, what its waveform puts above the note it is playing,
// whether the filter on it leaves anything at the top, and — the question a
// staff can never answer — whether two voices are sitting in the same part of
// the spectrum and eating each other.
//
// So this computes a SPECTROGRAM: time across, frequency up, energy as ink.
//
// IT IS A MODEL, NOT A MEASUREMENT, and the difference matters enough to say
// twice. Nothing here renders audio. It reads the same numbers the sequencer
// hands the synth — `volume`, `gate`, `wave`, `filter`, `slide`, `attackMs`,
// and the note tokens themselves (`chiptune.ts` → `scheduleStep`) — and adds up
// where the energy lands. That makes it exact about the things it models and
// blind to the things it does not: the master limiter, the echo bus, stereo
// pan, and whatever the browser's own biquads do at the edges. Read it for
// BALANCE between voices, never as a level meter.
//
// The three facts it is built on, all of them the synth's own:
//
//   THE ENVELOPE. `tone()` ramps to the peak over `attackMs` and then decays
//   EXPONENTIALLY to a thousandth of it across the rest of the note, and the
//   note's length is `steps × gate` — so a `gate: 0.25` stab is a spike and a
//   `gate: 0.95` siren is a plateau, and they contribute wildly different
//   amounts of energy for the same written note.
//
//   THE WAVEFORM IS A HARMONIC SERIES. A sine is the note; a triangle is odd
//   harmonics falling as 1/k²; a square is odd harmonics falling as 1/k; a
//   sawtooth is every harmonic falling as 1/k. That is why a sawtooth bass at
//   D2 puts real energy where the lead is singing and a triangle at the same
//   pitch does not — the single most useful thing on this chart.
//
//   NOISE HAS NO PITCH, so its power spreads evenly per Hz across the band and
//   the filter is the only thing shaping it. A highpass-6800 hat is a smear at
//   the very top; a lowpass-260 wind bed is a slab at the very bottom.

import sharp from "sharp";

/** The band worth drawing: below this is felt rather than heard, above it is
 * out of a phone speaker's reach and nearly out of an adult's. */
const F_MIN = 30;
const F_MAX = 16000;
/** Rows in the chart. 96 over nine octaves is about eight bins to the octave —
 * fine enough to separate two voices a fourth apart, coarse enough to stay a
 * picture rather than a comb. */
const BINS = 96;
/** The floor of the ink ramp. 60 dB below the loudest moment in the track is
 * the usual spectrogram window and is roughly where a thing stops mattering in
 * a mix that also has gunfire over it. */
const FLOOR_DB = -48;

/** midi → Hz, the same equal temperament `noteFrequency` uses. */
const hzOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Which harmonics a waveform actually contains, and how strong each is
 * relative to its fundamental. The classic Fourier series of each shape. */
function harmonics(wave, f0, fMax) {
  const out = [];
  const max = Math.min(64, Math.floor(fMax / Math.max(1, f0)));
  for (let k = 1; k <= max; k++) {
    const odd = k % 2 === 1;
    let a = 0;
    if (wave === "sine") a = k === 1 ? 1 : 0;
    else if (wave === "triangle") a = odd ? 1 / (k * k) : 0;
    else if (wave === "square") a = odd ? 1 / k : 0;
    else if (wave === "sawtooth") a = 1 / k;
    if (a > 0.002) out.push([k * f0, a]);
  }
  return out;
}

/**
 * A filter's magnitude at `f` — a two-pole response, which is what WebAudio's
 * biquads are and is the difference between "the hat is quiet up there" and
 * "the hat is the only thing up there".
 */
function filterMag(filter, f) {
  if (!filter) return 1;
  const r = f / Math.max(1, filter.frequency);
  const q = filter.q ?? 1;
  if (filter.type === "lowpass") return 1 / Math.sqrt(1 + Math.pow(r, 4));
  if (filter.type === "highpass")
    return (r * r) / Math.sqrt(1 + Math.pow(r, 4));
  // bandpass: unity at centre, falling either side by the resonance.
  const d = r - 1 / r;
  return 1 / Math.sqrt(1 + q * q * d * d);
}

/** The synth's own envelope, as a fraction of the peak, `u` of the way through
 * a note (0…1). Matches `tone()`: an exponential climb over the attack, then an
 * exponential fall to a ten-thousandth. */
function envelopeAt(u, attackFrac) {
  if (u < 0 || u > 1) return 0;
  const L = Math.log(1e-4);
  if (attackFrac > 0 && u < attackFrac)
    return Math.exp(L * (1 - u / attackFrac));
  const rest = 1 - attackFrac;
  return rest <= 0 ? 1 : Math.exp((L * (u - attackFrac)) / rest);
}

/** Which row a frequency lands in — LOG spaced, because hearing is. */
function binOf(f) {
  if (f <= F_MIN || f >= F_MAX) return -1;
  const t = Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);
  return Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)));
}

/** …and back, for the axis labels. */
export function binFrequency(bin) {
  return F_MIN * Math.pow(F_MAX / F_MIN, bin / BINS);
}

/** The Hz each bin spans, for spreading noise power correctly. */
function binWidth(bin) {
  return binFrequency(bin + 1) - binFrequency(bin);
}

/**
 * Compute the spectrogram of a set of voices over a span of steps.
 *
 * @param voices  `[{ instrument, tokens, notes }]` — `notes` is the voice's
 *                onsets (`voiceNotes`), so the caller's own reading of the
 *                token stream is the one measured.
 * @param opts    `{ fromStep, steps, perStep }` — `perStep` columns per step.
 * @returns `{ columns, bins, power, loud, peak }`, `power` a Float32Array of
 *          `columns × bins` AMPLITUDES (already square-rooted) and `loud` the
 *          per-column total, both normalised against `peak`.
 */
export function spectrumOf(voices, opts) {
  const { fromStep = 0, steps, perStep = 2 } = opts;
  const columns = Math.max(1, Math.round(steps * perStep));
  const power = new Float64Array(columns * BINS);
  const loud = new Float64Array(columns);

  for (const voice of voices) {
    const inst = voice.instrument;
    const gate = inst.gate ?? 0.9;
    const vol = inst.volume ?? 0.06;
    const noise = inst.wave === "noise";
    for (const note of voice.notes) {
      // The sounding length is the sequencer's: the tied run, times the gate.
      const lenSteps = note.steps * gate;
      if (lenSteps <= 0) continue;
      const f0 = note.midi === undefined ? 0 : hzOf(note.midi);
      if (!noise && !(f0 > 0)) continue;
      const attackFrac = Math.min(
        0.5,
        (inst.attackMs ?? 0) / 1000 / Math.max(1e-6, lenSteps * opts.stepS),
      );
      const c0 = Math.max(0, Math.round((note.at - fromStep) * perStep));
      const c1 = Math.min(
        columns,
        Math.ceil((note.at + lenSteps - fromStep) * perStep),
      );
      for (let c = c0; c < c1; c++) {
        const u = ((c + 0.5) / perStep + fromStep - note.at) / lenSteps;
        const env = envelopeAt(u, attackFrac);
        if (env < 1e-4) continue;
        const amp = vol * env;
        if (noise) {
          // Power per Hz is flat, so each log bin takes its own width's share.
          const total = F_MAX - F_MIN;
          for (let b = 0; b < BINS; b++) {
            const f = binFrequency(b + 0.5);
            const m = filterMag(inst.filter, f) * amp;
            power[c * BINS + b] += (m * m * binWidth(b)) / total;
          }
          continue;
        }
        // A `slide` glides the pitch across the note, which moves every
        // harmonic with it — a kick's whole spectrum falls through the note.
        const f = f0 * Math.pow(inst.slide ?? 1, Math.min(1, Math.max(0, u)));
        for (const [fk, ak] of harmonics(inst.wave, f, F_MAX)) {
          const b = binOf(fk);
          if (b < 0) continue;
          const m = amp * ak * filterMag(inst.filter, fk);
          // SPREAD OVER THE NEIGHBOURS. A partial is not a single frequency to
          // any analyser — the window smears it — and more to the point a
          // one-pixel dot is unreadable. The 0.6/0.2 kernel is what turns this
          // from a dot matrix into something with bands in it.
          power[c * BINS + b] += m * m * 0.6;
          if (b > 0) power[c * BINS + b - 1] += m * m * 0.2;
          if (b < BINS - 1) power[c * BINS + b + 1] += m * m * 0.2;
        }
      }
    }
  }

  // Amplitudes out, and the per-column total that is the loudness curve.
  let peak = 0;
  const amp = new Float32Array(columns * BINS);
  for (let c = 0; c < columns; c++) {
    let sum = 0;
    for (let b = 0; b < BINS; b++) {
      const p = power[c * BINS + b];
      sum += p;
      const a = Math.sqrt(p);
      amp[c * BINS + b] = a;
      if (a > peak) peak = a;
    }
    loud[c] = Math.sqrt(sum);
  }
  let loudPeak = 0;
  for (const v of loud) if (v > loudPeak) loudPeak = v;
  return {
    columns,
    bins: BINS,
    amp,
    loud,
    peak,
    loudPeak,
    // THE REFERENCE THE INK IS DRAWN AGAINST. Not `peak`: one bass fundamental
    // sits tens of decibels over everything else, and normalising to it leaves
    // the whole of the rest of the mix under the floor and the chart blank. The
    // 99.7th percentile of the bins that are doing anything at all is the level
    // a listener would call "loud" here.
    ref: percentile(amp, 0.997),
  };
}

/** The nth percentile of the non-negligible values in a grid. */
function percentile(values, q) {
  const live = [];
  for (const v of values) if (v > 1e-7) live.push(v);
  if (live.length === 0) return 1e-9;
  live.sort((a, b) => a - b);
  return live[Math.min(live.length - 1, Math.floor(live.length * q))];
}

/** The ink ramp: the page's own cream, through sand and a burnt orange, to
 * nearly black. Warm on purpose — it has to sit on a printed score without
 * looking like a screenshot of a different program. */
const RAMP = [
  [251, 250, 246],
  [232, 219, 189],
  [206, 160, 92],
  [150, 78, 38],
  [58, 34, 20],
  [20, 16, 10],
];

function rampAt(t) {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/**
 * The spectrogram as a PNG data URI, one pixel per (column, bin) and scaled up
 * by the SVG — nearest-neighbour, so a bin stays a readable band rather than
 * being blurred into its neighbours.
 *
 * `refPeak` lets several strips share one scale: the whole point of drawing the
 * loop's arc and then each section is that the sections are comparable, and
 * they are not if each one normalises to itself.
 */
export async function spectrumPng(spec, refPeak, from = 0, to = spec.columns) {
  const peak = Math.max(1e-9, refPeak ?? spec.ref);
  const { bins, amp } = spec;
  const columns = Math.max(1, to - from);
  const rgba = Buffer.alloc(columns * bins * 4);
  for (let b = 0; b < bins; b++) {
    // Row 0 of the image is the TOP, and the top is the high frequencies.
    const row = bins - 1 - b;
    for (let c = 0; c < columns; c++) {
      const a = amp[(from + c) * bins + b];
      const db = 20 * Math.log10(Math.max(1e-9, a) / peak);
      const t = Math.max(0, (db - FLOOR_DB) / -FLOOR_DB);
      const [r, g, bl] = rampAt(t);
      const i = (row * columns + c) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = bl;
      rgba[i + 3] = 255;
    }
  }
  const png = await sharp(rgba, {
    raw: { width: columns, height: bins, channels: 4 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
