// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGRAVER — a `ChiptuneTrack` (content/music/*.yaml, cooked) drawn as a
// SCORE: real staves, real clefs, real noteheads, beams, ties, rests and bar
// lines, one staff per voice, stacked into systems and braced at the left.
//
// WHY NOTATION AND NOT A PIANO ROLL. A piano roll shows you WHEN things happen;
// a stave shows you WHAT is happening. Contour, interval, register, the shape of
// a rhythm, whether two voices are moving together or against each other — those
// are the questions you ask of music, and five lines and a clef were invented to
// answer exactly them. A grid of coloured blocks answers none of them without
// counting rows.
//
// THE UNIT IS THE STAFF SPACE (`S`), as in real engraving: every measurement
// below is a multiple of the gap between two staff lines, which is why the whole
// thing scales by changing one number.
//
// IT NOTATES THE RHYTHM, NOT THE ENVELOPE, and that is a real decision. A
// tracker row says when a voice is RETRIGGERED and when it is released; a
// notated duration says how long the beat belongs to that note. `x . x .` on a
// hi-hat is two eighths to any reader alive, not two sixteenths with sixteenth
// rests wedged between them, and a lead written the second way is a hedge of
// flags nobody can read a phrase out of. So a note here runs to the next onset
// in its own voice, and a rest is only drawn where the voice genuinely has
// nothing left to say before the bar line.
//
// WHAT IT DELIBERATELY DOES NOT DO: key signatures (chip music modulates by
// lurching, and a signature would fight the accidentals rather than save them),
// voices sharing a staff (every voice here is monophonic by construction), and
// tuplets (the step grid cannot express one). Anything the grid cannot say, this
// does not pretend to.

import { spectrumOf, spectrumPng } from "./spectrum.mjs";

/** Letter → its index in the diatonic scale, which is what a staff measures.
 * A staff position is a DIATONIC step, never a semitone: that is the whole
 * reason C# and C sit on the same line with a sharp in front of one. */
const LETTERS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
/** …and their semitone offsets, for the median-pitch clef choice below. */
const SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Staff space, in px. Every other measurement is a multiple of this. */
const S = 8;
/** A staff is four spaces tall, top line to bottom line. */
const STAFF_H = 4 * S;
const LINE_W = 1.1;
const STEM_W = 1.6;
const HEAD_RX = 0.62 * S;
const HEAD_RY = 0.5 * S;
const STEM_LEN = 3.4 * S;
const BEAM_H = 0.5 * S;
const BEAM_GAP = 0.32 * S;

/** Where the bottom line of each clef sits, as a diatonic index (octave*7 +
 * letter). Treble's bottom line is E4, bass's is G2 — the two facts every other
 * vertical position on this page is derived from. */
const CLEF_BOTTOM = { treble: 4 * 7 + LETTERS.E, bass: 2 * 7 + LETTERS.G };

/** A pitched note token → everything a staff needs to place it. */
export function parseNote(token) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(token);
  if (!m) return null;
  const letter = m[1];
  const octave = Number(m[3]);
  return {
    letter,
    sharp: m[2] === "#",
    octave,
    diatonic: octave * 7 + LETTERS[letter],
    midi: (octave + 1) * 12 + SEMIS[letter] + (m[2] === "#" ? 1 : 0),
  };
}

/**
 * A voice's token stream → the notes in it.
 *
 * `.` is a rest, `=` sustains whatever is ringing, and anything else starts
 * something: a note name on a pitched voice, a hit (conventionally `x`) on a
 * noise one. A note runs until the next token that is neither a tie nor a
 * continuation of it, which is exactly the sequencer's own reading.
 */
export function voiceNotes(tokens) {
  const notes = [];
  let live = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "=") {
      if (live) live.steps++;
      continue;
    }
    live = null;
    if (token === ".") continue;
    live = { at: i, steps: 1, token };
    notes.push(live);
  }
  return notes;
}

/** Note values, longest first, in steps — the greedy alphabet a duration is
 * spelled with. Derived from the grid rather than hard-coded, so a track at
 * three steps to the beat still gets whatever of these divide it. */
function durationTable(stepsPerBeat) {
  const whole = stepsPerBeat * 4;
  const kinds = [
    ["whole", whole],
    ["half", whole / 2],
    ["quarter", whole / 4],
    ["eighth", whole / 8],
    ["16th", whole / 16],
  ];
  const table = [];
  for (const [kind, steps] of kinds) {
    if (!Number.isInteger(steps) || steps < 1) continue;
    const dotted = steps * 1.5;
    if (Number.isInteger(dotted)) table.push({ kind, dots: 1, steps: dotted });
    table.push({ kind, dots: 0, steps });
  }
  return table.sort((a, b) => b.steps - a.steps);
}

/** How many beams/flags a value carries. */
const TAILS = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2 };

/**
 * A span of `steps` starting at `at` → the notated values it is spelled with,
 * tied together. Greedy from the longest value that fits, which is what an
 * engraver does by hand and is exact for every power-of-two grid.
 */
function spell(at, steps, table) {
  const out = [];
  let left = steps;
  let cursor = at;
  while (left > 0) {
    const pick = table.find((d) => d.steps <= left) ?? table[table.length - 1];
    out.push({ at: cursor, ...pick });
    cursor += pick.steps;
    left -= pick.steps;
  }
  return out;
}

/** Which clef a voice wants: whichever puts its median pitch nearest the middle
 * line. A bass line forced into a treble clef is four ledger lines of nothing. */
function clefFor(notes) {
  const pitched = notes.map((n) => parseNote(n.token)).filter(Boolean);
  if (pitched.length === 0) return "treble";
  const sorted = pitched.map((p) => p.diatonic).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dTreble = Math.abs(median - (CLEF_BOTTOM.treble + 4));
  const dBass = Math.abs(median - (CLEF_BOTTOM.bass + 4));
  return dBass < dTreble ? "bass" : "treble";
}

/**
 * Where an unpitched voice's hits sit — the MIDDLE LINE, always.
 *
 * A drum kit shares one staff and spreads its pieces up and down it, kick under
 * and cymbals over; here every voice already has a staff of its own, so the
 * ladder would be spelling out information the label to the left has already
 * given. Centred, each drum line reads as the rhythm it is and nothing else.
 */
const PERCUSSION_SLOT = 4;

/** Is this voice a DRUM? Noise is the obvious half; the other is a pitched
 * voice with a hard downward `slide` on it, which is how a kick is built out of
 * a triangle here — and a kick belongs on a drum staff whatever waveform is
 * making it. */
function isDrum(instrument) {
  return instrument.wave === "noise" || (instrument.slide ?? 1) < 0.5;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── GLYPHS ───────────────────────────────────────────────────────────────────
// Drawn as paths rather than typeset, because the one font guaranteed to be on
// the machine rendering this has no musical symbols in it at all — and a score
// whose clefs are missing-glyph boxes is not a score.

/** The treble clef: the spiral crosses the G line, which is the whole point of
 * it, so it is drawn ANCHORED to that line rather than to the staff box. */
function trebleClef(x, gLineY) {
  const u = S / 4; // the glyph is drawn in quarter-spaces and scaled by them
  const p = (dx, dy) =>
    `${(x + dx * u).toFixed(2)},${(gLineY + dy * u).toFixed(2)}`;
  return `<path d="M ${p(4.2, 6)} C ${p(1.2, 3)} ${p(0.6, -1.5)} ${p(3.6, -4)}
    C ${p(6.2, -6.2)} ${p(8.2, -9.5)} ${p(6.4, -13)}
    C ${p(5.2, -15.3)} ${p(3.2, -14.2)} ${p(3.1, -11.6)}
    C ${p(3.0, -8.4)} ${p(4.6, -4.6)} ${p(5.6, -0.4)}
    C ${p(6.6, 3.8)} ${p(7.2, 8.6)} ${p(4.4, 10.6)}
    C ${p(2.4, 12.0)} ${p(0.2, 10.6)} ${p(0.6, 8.6)}
    C ${p(0.9, 7.1)} ${p(2.8, 6.8)} ${p(3.2, 8.2)}"
    fill="none" stroke="#111" stroke-width="${1.5}" stroke-linecap="round"/>
    <circle cx="${(x + 4.2 * u).toFixed(2)}" cy="${gLineY.toFixed(2)}" r="${(0.9 * u).toFixed(2)}" fill="#111"/>`;
}

/** The bass clef: the comma's head sits ON the F line and the two dots straddle
 * it — again anchored to the line it names. */
function bassClef(x, fLineY) {
  const u = S / 4;
  const p = (dx, dy) =>
    `${(x + dx * u).toFixed(2)},${(fLineY + dy * u).toFixed(2)}`;
  return `<path d="M ${p(1.2, -1.6)} C ${p(1.2, -4.2)} ${p(6.4, -4.6)} ${p(6.4, -1.0)}
    C ${p(6.4, 3.2)} ${p(2.6, 6.0)} ${p(0.4, 7.2)}"
    fill="none" stroke="#111" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="${(x + 1.6 * u).toFixed(2)}" cy="${(fLineY - 1.2 * u).toFixed(2)}" r="${(1.0 * u).toFixed(2)}" fill="#111"/>
    <circle cx="${(x + 8.0 * u).toFixed(2)}" cy="${(fLineY - 1.0 * u).toFixed(2)}" r="${(0.7 * u).toFixed(2)}" fill="#111"/>
    <circle cx="${(x + 8.0 * u).toFixed(2)}" cy="${(fLineY + 1.0 * u).toFixed(2)}" r="${(0.7 * u).toFixed(2)}" fill="#111"/>`;
}

/** The unpitched clef — two thick strokes, which is what a drum staff wears. */
function percussionClef(x, top) {
  return `<rect x="${x}" y="${top + S * 0.6}" width="${S * 0.42}" height="${STAFF_H - S * 1.2}" fill="#111"/>
    <rect x="${x + S * 0.78}" y="${top + S * 0.6}" width="${S * 0.42}" height="${STAFF_H - S * 1.2}" fill="#111"/>`;
}

/** A sharp: two slanted thick beams crossed by two thin uprights. */
function sharpGlyph(x, y) {
  const a = S * 0.34;
  return `<g class="acc" data-acc="sharp" stroke="#111" fill="none">
    <line x1="${x}" y1="${y - a * 0.4}" x2="${x + a * 2.2}" y2="${y - a * 1.1}" stroke-width="${a * 0.9}"/>
    <line x1="${x}" y1="${y + a * 1.3}" x2="${x + a * 2.2}" y2="${y + a * 0.6}" stroke-width="${a * 0.9}"/>
    <line x1="${x + a * 0.7}" y1="${y - a * 2.1}" x2="${x + a * 0.7}" y2="${y + a * 2.3}" stroke-width="${a * 0.42}"/>
    <line x1="${x + a * 1.6}" y1="${y - a * 2.4}" x2="${x + a * 1.6}" y2="${y + a * 2.0}" stroke-width="${a * 0.42}"/>
  </g>`;
}

/** A natural, for a letter this bar has already sharpened. */
function naturalGlyph(x, y) {
  const a = S * 0.34;
  return `<g class="acc" data-acc="natural" stroke="#111" fill="none">
    <line x1="${x}" y1="${y - a * 2.2}" x2="${x}" y2="${y + a * 1.2}" stroke-width="${a * 0.42}"/>
    <line x1="${x + a * 1.3}" y1="${y - a * 1.2}" x2="${x + a * 1.3}" y2="${y + a * 2.2}" stroke-width="${a * 0.42}"/>
    <line x1="${x}" y1="${y - a * 0.5}" x2="${x + a * 1.3}" y2="${y - a * 1.0}" stroke-width="${a * 0.8}"/>
    <line x1="${x}" y1="${y + a * 1.0}" x2="${x + a * 1.3}" y2="${y + a * 0.5}" stroke-width="${a * 0.8}"/>
  </g>`;
}

/** The rests, one per value. The quarter rest is the awkward one and is drawn
 * as the zigzag it actually is rather than as a box. */
function restGlyph(kind, x, top) {
  const mid = top + STAFF_H / 2;
  const tag = `<g class="rest" data-kind="${kind}"></g>`;
  switch (kind) {
    case "whole":
      return (
        tag +
        `<rect x="${x - S * 0.55}" y="${top + S - S * 0.42}" width="${S * 1.1}" height="${S * 0.42}" fill="#111"/>`
      );
    case "half":
      return (
        tag +
        `<rect x="${x - S * 0.55}" y="${top + 2 * S}" width="${S * 1.1}" height="${S * 0.42}" fill="#111"/>`
      );
    case "quarter":
      return (
        tag +
        `<path d="M ${x - S * 0.3} ${mid - S * 1.5}
        L ${x + S * 0.32} ${mid - S * 0.55} L ${x - S * 0.28} ${mid + S * 0.1}
        L ${x + S * 0.34} ${mid + S * 1.1}
        C ${x - S * 0.1} ${mid + S * 0.55} ${x - S * 0.42} ${mid + S * 1.05} ${x + S * 0.05} ${mid + S * 1.5}
        C ${x - S * 0.7} ${mid + S * 1.15} ${x - S * 0.5} ${mid + S * 0.3} ${x + S * 0.02} ${mid + S * 0.42}
        L ${x - S * 0.46} ${mid - S * 0.5} Z" fill="#111"/>`
      );
    default: {
      // Eighth and sixteenth: a slanted stroke with one blob per tail.
      const tails = kind === "16th" ? 2 : 1;
      let out =
        tag +
        `<line x1="${x + S * 0.42}" y1="${mid - S * (tails === 2 ? 1.3 : 0.9)}" x2="${x - S * 0.18}" y2="${mid + S * 1.1}" stroke="#111" stroke-width="${S * 0.16}"/>`;
      for (let i = 0; i < tails; i++) {
        const cy = mid - S * (tails === 2 ? 1.15 : 0.75) + i * S * 0.85;
        out += `<circle cx="${x + S * 0.34}" cy="${cy}" r="${S * 0.24}" fill="#111"/>`;
        out += `<path d="M ${x + S * 0.34} ${cy} Q ${x + S * 0.05} ${cy - S * 0.5} ${x - S * 0.38} ${cy - S * 0.22}" fill="none" stroke="#111" stroke-width="${S * 0.13}"/>`;
      }
      return out;
    }
  }
}

/** A flag on an unbeamed eighth or sixteenth. */
function flagGlyph(x, y, tails, up) {
  const d = up ? 1 : -1;
  let out = `<g class="flag" data-tails="${tails}"></g>`;
  for (let i = 0; i < tails; i++) {
    const y0 = y + d * i * S * 0.82;
    out += `<path d="M ${x} ${y0} C ${x + S * 0.9} ${y0 + d * S * 0.5} ${x + S * 1.0} ${y0 + d * S * 1.3} ${x + S * 0.45} ${y0 + d * S * 2.0}
      C ${x + S * 0.95} ${y0 + d * S * 1.15} ${x + S * 0.6} ${y0 + d * S * 0.6} ${x} ${y0 + d * S * 0.55} Z" fill="#111"/>`;
  }
  return out;
}

/**
 * Engrave a cooked `ChiptuneTrack`.
 *
 * @param track      `{ bpm, stepsPerBeat, instruments, patterns, order }`
 * @param opts       `{ title, subtitle, barsPerSystem, only, ink }`
 *                   `only` is a list of pattern names to draw (default: every
 *                   pattern the order uses, once each, in order of first use).
 * @returns `{ svg, width, height }`
 */
export async function engraveTrack(track, opts = {}) {
  const { title = "", subtitle = "", barsPerSystem = 4, names = true } = opts;
  const stepsPerBar = track.stepsPerBeat * 4;
  const table = durationTable(track.stepsPerBeat);

  // WHICH SECTIONS, and in which order. The arrangement repeats patterns — the
  // road's plays seven of them across seventy-six bars — so the sheet engraves
  // each ONCE, as its own titled section, and prints the running order as a
  // strip at the top. That is how a tracker shows a song and, as it happens,
  // how a score with repeats shows one too.
  const used = [];
  for (const name of track.order) if (!used.includes(name)) used.push(name);
  const sections = (opts.only ?? used).filter((n) => track.patterns[n]);

  const out = [];
  let y = 0;
  /** Systems are numbered so a measurement can compare columns WITHIN one —
   * the first system of a section is wider by its time signature, so pooling
   * them says the grid is broken when it is not. */
  let sysIndex = 0;

  // ── THE HEAD ──────────────────────────────────────────────────────────────
  if (title) {
    y += 42;
    out.push(
      `<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="Georgia,'DejaVu Serif',serif" font-size="30" fill="#111">${esc(title)}</text>`,
    );
  }
  if (subtitle) {
    y += 22;
    out.push(
      `<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="Georgia,'DejaVu Serif',serif" font-size="14" font-style="italic" fill="#444">${esc(subtitle)}</text>`,
    );
  }
  y += 26;
  // The tempo mark, with a drawn quarter note because there is no note glyph in
  // any font we can count on.
  out.push(quarterNoteMark(MARGIN_X, y - 6));
  out.push(
    `<text x="${MARGIN_X + 20}" y="${y}" font-family="Georgia,'DejaVu Serif',serif" font-size="15" fill="#111">= ${track.bpm}</text>`,
  );
  y += 24;

  // ── THE RUNNING ORDER, AND THE SHAPE OF THE WHOLE LOOP ────────────────────
  // The boxes are sized by how many BARS each section holds rather than by the
  // length of its name, so the row is a map of the loop's time — and the
  // spectrogram underneath shares its x axis exactly, which is what makes the
  // pair readable as one picture: this is the section, and this is what it
  // sounds like.
  const whole = flatVoices(track);
  const stepS = 60 / track.bpm / track.stepsPerBeat;
  let refPeak = 0;
  let loudRef = 0;
  if (whole.totalSteps > 0) {
    const loop = spectrumOf(whole.voices, {
      steps: whole.totalSteps,
      perStep: 1,
      stepS,
    });
    refPeak = loop.ref;
    loudRef = loop.loudPeak;
    if (opts.only === undefined && track.order.length > 1) {
      const x0 = MARGIN_X + 56;
      const w = PAGE_W - MARGIN_X - x0;
      out.push(
        `<text x="${MARGIN_X}" y="${y}" font-family="Georgia,'DejaVu Serif',serif" font-size="12" fill="#666">ORDER</text>`,
      );
      let at = 0;
      for (const name of track.order) {
        const bars = Math.ceil(patternSteps(track, name) / stepsPerBar);
        const bx = x0 + (at / whole.totalBars) * w;
        const bw = (bars / whole.totalBars) * w;
        out.push(
          `<rect x="${bx}" y="${y - 13}" width="${bw}" height="18" fill="none" stroke="#999"/>` +
            `<text x="${bx + bw / 2}" y="${y}" text-anchor="middle" font-family="Georgia,'DejaVu Serif',serif" font-size="10" fill="#333">${esc(name)}</text>`,
        );
        at += bars;
      }
      y += 6;
      y = await drawSpectrum(out, loop, {
        y,
        h: 76,
        refPeak,
        label: "the whole loop",
        segments: [
          { x: x0 + BAR_PAD, w: w - 2 * BAR_PAD, c0: 0, c1: loop.columns },
        ],
      });
      y += 20;
    }
  }

  // ── THE SECTIONS ──────────────────────────────────────────────────────────
  for (const name of sections) {
    const pattern = track.patterns[name];
    const voices = Object.keys(track.instruments).filter(
      (v) => pattern[v] && pattern[v].some((t) => t !== "."),
    );
    if (voices.length === 0) continue;
    const patternSteps = Math.max(
      ...Object.values(pattern).map((t) => t.length),
    );
    const bars = Math.ceil(patternSteps / stepsPerBar);

    y += 30;
    out.push(
      `<text x="${MARGIN_X}" y="${y}" font-family="Georgia,'DejaVu Serif',serif" font-size="17" font-weight="bold" fill="#111">${esc(name.toUpperCase())}</text>` +
        `<text x="${MARGIN_X + 22 + name.length * 12}" y="${y}" font-family="Georgia,'DejaVu Serif',serif" font-size="12" fill="#777">${bars} bars · ×${track.order.filter((o) => o === name).length}</text>`,
    );
    y += 12;

    // Each voice's notes, cycled out to the pattern's full length exactly as
    // the sequencer cycles them (a one-bar drum line under an eight-bar lead).
    const lanes = voices.map((v) => {
      const line = pattern[v];
      const tokens = Array.from(
        { length: patternSteps },
        (_, k) => line[k % line.length],
      );
      const notes = voiceNotes(tokens);
      const inst = track.instruments[v];
      const drum = isDrum(inst);
      // THE NOTATED LENGTH — to the next onset, but never PAST THE BAR LINE
      // unless the note is genuinely still sounding there.
      //
      // Both halves earn their keep. Running to the next onset is what makes
      // `x . x .` two eighths instead of a hedge of rests. Stopping at the bar
      // line is what stops a staccato stab on the last off-beat of a bar from
      // being drawn as a note tied over into the next one — which is a picture
      // of a sustain that the gate on that instrument explicitly is not doing.
      // A voice that IS holding (a siren with sixteen ties on it) crosses the
      // line and gets the tie it has earned.
      notes.forEach((n, k) => {
        const next = notes[k + 1];
        const gap = (next ? next.at : patternSteps) - n.at;
        const toBarLine =
          (Math.floor(n.at / stepsPerBar) + 1) * stepsPerBar - n.at;
        n.held = Math.max(
          1,
          Math.min(gap, n.steps > toBarLine ? n.steps : toBarLine),
        );
      });
      return {
        name: v,
        drum,
        clef: drum ? "percussion" : clefFor(notes),
        slot: PERCUSSION_SLOT,
        notes,
        // What the ANALYSER measures, beside what the staff draws — the
        // sounding length and the pitch, before the sheet rounds either.
        instrument: inst,
        spec: specNotes(tokens),
      };
    });

    for (let bar0 = 0; bar0 < bars; bar0 += barsPerSystem) {
      const nBars = Math.min(barsPerSystem, bars - bar0);
      y = await drawSystem(out, {
        y,
        lanes,
        bar0,
        nBars,
        stepsPerBar,
        stepsPerBeat: track.stepsPerBeat,
        patternSteps,
        table,
        first: bar0 === 0,
        last: bar0 + nBars >= bars,
        sys: sysIndex++,
        stepS,
        refPeak,
        loudRef,
        names,
      });
      y += 26;
    }
  }

  const height = Math.ceil(y + MARGIN_X);
  return {
    width: PAGE_W,
    height,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${height}" viewBox="0 0 ${PAGE_W} ${height}">` +
      `<rect width="${PAGE_W}" height="${height}" fill="#fbfaf6"/>` +
      out.join("\n") +
      `</svg>`,
  };
}

const PAGE_W = 1180;
const MARGIN_X = 28;
/** The gap a bar keeps at each end, so nothing is pressed against a bar line. */
const BAR_PAD = 9;
/** Reserved down the right-hand edge for the analyser's frequency labels — the
 * one thing on the page that hangs OUTSIDE the music's own width. */
const RIGHT_GUTTER = 26;
/** The left column: the instrument names, printed once per system as a
 * conductor's score does. */
const NAME_W = 96;
const CLEF_W = 34;

/** A little quarter note, for the tempo mark. */
function quarterNoteMark(x, y) {
  return `<g><ellipse cx="${x + 4}" cy="${y}" rx="4.6" ry="3.6" transform="rotate(-20 ${x + 4} ${y})" fill="#111"/><line x1="${x + 8.4}" y1="${y}" x2="${x + 8.4}" y2="${y - 17}" stroke="#111" stroke-width="1.4"/></g>`;
}

/**
 * One SYSTEM — every voice's staff for one span of bars, braced together at the
 * left so the eye reads DOWN a moment as well as ALONG a line. Returns the y it
 * finished at.
 */
async function drawSystem(out, ctx) {
  const {
    lanes,
    bar0,
    nBars,
    stepsPerBar,
    stepsPerBeat,
    patternSteps,
    table,
    first,
    last,
    stepS,
    refPeak,
    names,
  } = ctx;
  const x0 = MARGIN_X + NAME_W;
  const staffX = x0 + CLEF_W + (first ? 24 : 0);
  const barW = (PAGE_W - MARGIN_X - RIGHT_GUTTER - staffX) / nBars;
  // A bar is not filled edge to edge: a note pressed against the bar line reads
  // as belonging to the bar after it, and the last note of a bar needs somewhere
  // to put its stem and its flag. Every bar keeps a margin at each end and the
  // steps are spread across what is left.
  const slotW = (barW - 2 * BAR_PAD) / stepsPerBar;

  // Vertical: give every staff exactly the headroom its own notes need, so a
  // hi-hat line does not reserve the same air as a lead that reaches D6.
  const tops = [];
  // …and the NAME ROW clears whatever that staff's own notes reach down to. A
  // fixed offset put the letters straight through the noteheads of any voice
  // that spends its time under the staff, which on this page is most of them.
  const nameDy = [];
  let y = ctx.y;
  for (const lane of lanes) {
    const extent = laneExtent(lane, bar0, nBars, stepsPerBar);
    y += Math.max(22, extent.above);
    tops.push(y);
    const dy = Math.max(15, extent.below + 11);
    nameDy.push(dy);
    y += STAFF_H + dy + 8;
  }
  const top0 = tops[0];
  const bottomStaff = tops[tops.length - 1] + STAFF_H;

  // The bracket down the left edge, and the line that closes it.
  out.push(
    `<path d="M ${x0 - 12} ${top0} C ${x0 - 22} ${top0 + 6} ${x0 - 22} ${bottomStaff - 6} ${x0 - 12} ${bottomStaff}" fill="none" stroke="#111" stroke-width="2.4"/>`,
    `<line x1="${x0}" y1="${top0}" x2="${x0}" y2="${bottomStaff}" stroke="#111" stroke-width="1.6"/>`,
  );

  lanes.forEach((lane, i) => {
    const top = tops[i];
    // Five lines.
    for (let k = 0; k < 5; k++) {
      const ly = top + k * S;
      out.push(
        `<line class="staffline" data-lane="${esc(lane.name)}" data-line="${k}" x1="${x0}" y1="${ly}" x2="${staffX + nBars * barW}" y2="${ly}" stroke="#111" stroke-width="${LINE_W}"/>`,
      );
    }
    // The name, and the clef.
    out.push(
      `<text x="${x0 - 26}" y="${top + STAFF_H / 2 + 4}" text-anchor="end" font-family="Georgia,'DejaVu Serif',serif" font-size="12" fill="#222">${esc(lane.name)}</text>`,
    );
    if (lane.clef === "treble") out.push(trebleClef(x0 + 8, top + 3 * S));
    else if (lane.clef === "bass") out.push(bassClef(x0 + 8, top + S));
    else out.push(percussionClef(x0 + 12, top));
    if (first) {
      out.push(
        `<text x="${x0 + CLEF_W + 2}" y="${top + 2 * S + 1}" font-family="Georgia,'DejaVu Serif',serif" font-size="${S * 2.5}" font-weight="bold" fill="#111">4</text>`,
        `<text x="${x0 + CLEF_W + 2}" y="${top + 4 * S + 1}" font-family="Georgia,'DejaVu Serif',serif" font-size="${S * 2.5}" font-weight="bold" fill="#111">4</text>`,
      );
    }
    drawLane(out, lane, {
      top,
      staffX,
      slotW,
      barW,
      bar0,
      nBars,
      stepsPerBar,
      stepsPerBeat,
      patternSteps,
      table,
      names,
      nameDy: nameDy[i],
      sys: ctx.sys,
    });
  });

  // Bar lines through the whole system, and the double bar at the end.
  for (let b = 1; b <= nBars; b++) {
    const bx = staffX + b * barW;
    const end = b === nBars;
    if (end && last) {
      out.push(
        `<line x1="${bx - 5}" y1="${top0}" x2="${bx - 5}" y2="${bottomStaff}" stroke="#111" stroke-width="1.4"/>`,
        `<rect x="${bx - 3.5}" y="${top0}" width="3.5" height="${bottomStaff - top0}" fill="#111"/>`,
      );
    } else {
      out.push(
        `<line x1="${bx}" y1="${top0}" x2="${bx}" y2="${bottomStaff}" stroke="#111" stroke-width="1.4"/>`,
      );
    }
  }
  // The bar numbers, over the top staff.
  for (let b = 0; b < nBars; b++) {
    out.push(
      `<text x="${staffX + b * barW + 3}" y="${top0 - 8}" font-family="Georgia,'DejaVu Serif',serif" font-size="10" fill="#999">${bar0 + b + 1}</text>`,
    );
  }

  // ── AND WHAT IT SOUNDS LIKE ───────────────────────────────────────────────
  // The same bars, measured rather than written: frequency up, energy as ink,
  // the loudness curve over the top. It shares the staves' x axis exactly, so a
  // bar of music and its spectrum are read as one column.
  const perStep = 2;
  const spec = spectrumOf(
    lanes.map((lane) => ({ instrument: lane.instrument, notes: lane.spec })),
    {
      fromStep: bar0 * stepsPerBar,
      steps: nBars * stepsPerBar,
      perStep,
      stepS,
    },
  );
  // ONE IMAGE PER BAR, INSET LIKE THE NOTES ARE. The staves keep a margin at
  // each end of every bar (`BAR_PAD`) so nothing is pressed against a bar line,
  // which means a strip stretched evenly across the system drifts out of step
  // with the notes above it — by nearly a beat by the end of a four-bar system.
  // Cutting the strip on the bar lines and insetting each piece the same way
  // puts every column back under the note that made it.
  const segments = [];
  for (let b = 0; b < nBars; b++) {
    segments.push({
      x: staffX + b * barW + BAR_PAD,
      w: barW - 2 * BAR_PAD,
      c0: b * stepsPerBar * perStep,
      c1: (b + 1) * stepsPerBar * perStep,
    });
  }
  spec.loudRef = ctx.loudRef;
  return await drawSpectrum(out, spec, {
    y: bottomStaff + 20,
    h: 86,
    refPeak,
    label: "spectrum",
    segments,
  });
}

/**
 * THE ANALYSER ROW — a spectrogram with its loudness curve on top.
 *
 * Three things are labelled and each is there for a question a staff cannot
 * answer: the DECADE LINES (100 Hz / 1 k / 10 k) so a band can be named rather
 * than pointed at; the CURVE, which is the only place on the page that says how
 * LOUD anything is; and the shared scale — every strip in one sheet is drawn
 * against the loudest moment in the whole track, so two sections can be
 * compared instead of each being normalised to itself.
 */
async function drawSpectrum(out, spec, opts) {
  const { y, h, refPeak, label, segments } = opts;
  const x = segments[0].x;
  const last = segments[segments.length - 1];
  const w = last.x + last.w - x;
  for (const seg of segments) {
    const href = await spectrumPng(spec, refPeak, seg.c0, seg.c1);
    out.push(
      `<image x="${seg.x}" y="${y}" width="${seg.w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated" href="${href}"/>`,
    );
  }
  // A hairline where each bar ends, so the strip is read in bars like the
  // staves are rather than as one undivided smear.
  for (const seg of segments.slice(1)) {
    out.push(
      `<line x1="${seg.x - BAR_PAD}" y1="${y}" x2="${seg.x - BAR_PAD}" y2="${y + h}" stroke="#111" stroke-width="0.7" opacity="0.5"/>`,
    );
  }
  out.push(
    `<rect x="${x - BAR_PAD}" y="${y}" width="${w + 2 * BAR_PAD}" height="${h}" fill="none" stroke="#111" stroke-width="0.8"/>`,
    `<text x="${x - BAR_PAD - 10}" y="${y + h / 2 + 4}" text-anchor="end" font-family="Georgia,'DejaVu Serif',serif" font-size="11" fill="#666">${esc(label)}</text>`,
  );
  // The decade lines. Drawn faint and dashed so they read as a grid over the
  // picture rather than as part of it.
  for (const [hz, name] of [
    [100, "100"],
    [1000, "1k"],
    [10000, "10k"],
  ]) {
    const t = Math.log(hz / 30) / Math.log(16000 / 30);
    if (t <= 0 || t >= 1) continue;
    const ly = y + h - t * h;
    out.push(
      `<line x1="${x - BAR_PAD}" y1="${ly}" x2="${x + w + BAR_PAD}" y2="${ly}" stroke="#fbfaf6" stroke-width="0.6" stroke-dasharray="3 4" opacity="0.55"/>`,
      `<text x="${x + w + BAR_PAD + 4}" y="${ly + 3.5}" font-family="Georgia,'DejaVu Serif',serif" font-size="9" fill="#888">${name}</text>`,
    );
  }
  // The loudness curve — the answer to "is this section bigger than that one",
  // which is the whole reason the strips share a scale.
  const peak = Math.max(1e-9, spec.loudRef ?? spec.loudPeak);
  const pts = [];
  for (const seg of segments) {
    const n = seg.c1 - seg.c0;
    for (let i = 0; i < n; i++) {
      const db = 20 * Math.log10(Math.max(1e-9, spec.loud[seg.c0 + i]) / peak);
      const t = Math.max(0, Math.min(1, (db + 30) / 30));
      pts.push(
        `${(seg.x + ((i + 0.5) / n) * seg.w).toFixed(1)},${(y + h - t * (h - 4) - 2).toFixed(1)}`,
      );
    }
  }
  // CASED, because it has to read over both ends of the ink ramp: a pale line
  // vanishes on the cream of a quiet bar and a dark one vanishes in the middle
  // of a loud one. A cream halo under a dark line is legible on either.
  out.push(
    `<polyline points="${pts.join(" ")}" fill="none" stroke="#fbfaf6" stroke-width="3.2" opacity="0.85" stroke-linejoin="round"/>`,
    `<polyline points="${pts.join(" ")}" fill="none" stroke="#14100a" stroke-width="1.3" stroke-linejoin="round"/>`,
  );
  return y + h;
}

/** Every voice of the WHOLE arrangement, flattened through the order — what the
 * loop-wide strip measures. The same walk `flattenTrack` does in the player,
 * kept here because this module must not import the app's TypeScript. */
function flatVoices(track) {
  const stepsPerBar = track.stepsPerBeat * 4;
  const names = Object.keys(track.instruments);
  const streams = new Map(names.map((n) => [n, []]));
  let totalBars = 0;
  for (const name of track.order) {
    const pattern = track.patterns[name];
    if (!pattern) continue;
    const len = patternSteps(track, name);
    totalBars += Math.ceil(len / stepsPerBar);
    for (const voice of names) {
      const line = pattern[voice];
      const stream = streams.get(voice);
      for (let i = 0; i < len; i++)
        stream.push(line ? line[i % line.length] : ".");
    }
  }
  const totalSteps = names.length ? streams.get(names[0]).length : 0;
  return {
    totalSteps,
    totalBars,
    voices: names.map((name) => ({
      instrument: track.instruments[name],
      notes: specNotes(streams.get(name)),
    })),
  };
}

/** How many steps a pattern runs for — its longest voice. */
function patternSteps(track, name) {
  const pattern = track.patterns[name];
  return Math.max(0, ...Object.values(pattern).map((t) => t.length));
}

/** A voice's notes as the ANALYSER wants them: the sounding length (the tied
 * run, before the gate) and the pitch as a midi number, or none at all for a
 * noise voice. Deliberately NOT the notated `held` — the sheet rounds a rhythm
 * to something a reader can play, and the spectrum must measure what the synth
 * is actually given. */
function specNotes(tokens) {
  return voiceNotes(tokens).map((n) => {
    const p = parseNote(n.token);
    return { at: n.at, steps: n.steps, ...(p ? { midi: p.midi } : {}) };
  });
}

/** How far a lane's notes reach above and below its own staff, in px. */
function laneExtent(lane, bar0, nBars, stepsPerBar) {
  const from = bar0 * stepsPerBar;
  const to = from + nBars * stepsPerBar;
  let above = 0;
  let below = 0;
  for (const note of lane.notes) {
    if (note.at < from || note.at >= to) continue;
    const half = lane.drum ? lane.slot : staffHalf(lane, note);
    if (half === null) continue;
    above = Math.max(above, (half - 8) * (S / 2));
    below = Math.max(below, -half * (S / 2));
  }
  // Stems and beams need their own air on top of the noteheads.
  return { above: above + STEM_LEN * 0.7, below: below + STEM_LEN * 0.7 };
}

/** A note's position on its staff, in HALF-SPACES above the bottom line. */
function staffHalf(lane, note) {
  const p = parseNote(note.token);
  if (!p) return null;
  return p.diatonic - CLEF_BOTTOM[lane.clef];
}

/** One voice's music inside one system. */
function drawLane(out, lane, ctx) {
  const {
    top,
    staffX,
    slotW,
    barW,
    bar0,
    nBars,
    stepsPerBar,
    stepsPerBeat,
    table,
  } = ctx;
  const from = bar0 * stepsPerBar;
  const to = from + nBars * stepsPerBar;
  const yOf = (half) => top + STAFF_H - half * (S / 2);
  const xOf = (step) => {
    const bar = Math.floor((step - from) / stepsPerBar);
    const within = step - from - bar * stepsPerBar;
    return staffX + bar * barW + BAR_PAD + within * slotW + slotW * 0.42;
  };

  // THE LANE AS AN UNBROKEN TIMELINE — every step accounted for, as a bar of
  // music has to be. A note holds its slot (`held`, above), and whatever is left
  // over is a rest: almost always the tail of a bar the voice dropped out of
  // partway through, which is the one silence a reader genuinely needs marked.
  const spans = [];
  let filledTo = 0;
  for (const note of lane.notes) {
    if (note.at > filledTo)
      spans.push({ rest: true, at: filledTo, steps: note.at - filledTo });
    spans.push({
      rest: false,
      at: note.at,
      steps: note.held,
      token: note.token,
    });
    filledTo = note.at + note.held;
  }
  if (filledTo < ctx.patternSteps)
    spans.push({
      rest: true,
      at: filledTo,
      steps: ctx.patternSteps - filledTo,
    });

  // Accidentals last to the end of THEIR BAR, which is the rule every reader
  // has in their hands — so the same letter is only marked once per bar.
  const barState = new Map();
  let bar = -1;
  /** Every stemmed head drawn, for the beam pass below. */
  const heads = [];
  /** …and the names under them, held back so they are drawn OVER the ledger
   * lines and stems that reach down into their row. */
  const lyrics = [];
  const filled = new Set(["quarter", "eighth", "16th"]);

  for (const span of spans) {
    // A span that runs past a bar line is TIED across it rather than drawn
    // through it — the one rule that separates notation from a piano roll.
    let cursor = span.at;
    let left = span.steps;
    let firstPiece = true;
    let prevPiece = null;
    while (left > 0) {
      const barEnd = (Math.floor(cursor / stepsPerBar) + 1) * stepsPerBar;
      const chunk = Math.min(left, barEnd - cursor);
      const pieces = spell(cursor, chunk, table);
      for (const piece of pieces) {
        cursorInto(piece);
      }
      cursor += chunk;
      left -= chunk;
    }

    function cursorInto(piece) {
      if (piece.at < from || piece.at >= to) {
        firstPiece = false;
        return;
      }
      const b = Math.floor(piece.at / stepsPerBar);
      if (b !== bar) {
        bar = b;
        barState.clear();
      }
      const x = xOf(piece.at);
      if (span.rest) {
        // A rest that fills a whole bar is CENTRED in it, which is the one
        // placement rule rests have and the thing that makes an empty bar read
        // as deliberate rather than as a stray mark by the bar line.
        const wholeBar =
          piece.steps === stepsPerBar && piece.at % stepsPerBar === 0;
        out.push(
          restGlyph(
            piece.kind,
            wholeBar ? x + barW / 2 - slotW * 0.42 : x + slotW * 0.4,
            top,
          ),
        );
        firstPiece = false;
        return;
      }
      const half = lane.drum ? lane.slot : staffHalf(lane, span);
      if (half === null) return;
      const yy = yOf(half);
      const up = half < 4;
      const tails = TAILS[piece.kind];
      // The accidental, if this bar has not already said it.
      if (!lane.drum) {
        const p = parseNote(span.token);
        const key = `${p.letter}${p.octave}`;
        const want = p.sharp ? "#" : "";
        const said = barState.get(key);
        if (firstPiece && said !== want && (want === "#" || said === "#")) {
          out.push(
            want === "#"
              ? sharpGlyph(x - S * 1.7, yy)
              : naturalGlyph(x - S * 1.6, yy),
          );
        }
        barState.set(key, want);
      }
      // Ledger lines, above and below — never on a drum staff, which has no
      // pitch for them to mean anything about.
      if (!lane.drum) {
        for (let h = 10; h <= half; h += 2) out.push(ledger(x, yOf(h)));
        for (let h = -2; h >= half; h -= 2) out.push(ledger(x, yOf(h)));
      }
      // The head.
      if (lane.drum) {
        const r = HEAD_RX * 0.8;
        out.push(
          `<g class="head" data-sys="${ctx.sys}" data-lane="${esc(lane.name)}" data-clef="${lane.clef}" data-note="${span.token}" data-kind="${piece.kind}" data-at="${piece.at}" data-cx="${x}" data-cy="${yy}" stroke="#111" stroke-width="1.8" stroke-linecap="round"><line x1="${x - r}" y1="${yy - r}" x2="${x + r}" y2="${yy + r}"/><line x1="${x - r}" y1="${yy + r}" x2="${x + r}" y2="${yy - r}"/></g>`,
        );
      } else {
        const solid = filled.has(piece.kind);
        out.push(
          `<ellipse class="head" data-sys="${ctx.sys}" data-lane="${esc(lane.name)}" data-clef="${lane.clef}" data-note="${span.token}" data-kind="${piece.kind}" data-at="${piece.at}" data-cx="${x}" data-cy="${yy}" cx="${x}" cy="${yy}" rx="${HEAD_RX}" ry="${HEAD_RY}" transform="rotate(-22 ${x} ${yy})" fill="${solid ? "#111" : "none"}" stroke="#111" stroke-width="${solid ? 0 : 1.6}"/>`,
        );
        // THE NAME, UNDER THE STAFF — set like a lyric, which is where a
        // score has always put a word that belongs to a note.
        //
        // NOT INSIDE THE HEAD, which is where the beginner's books put it and
        // where it was first tried here: a letter in the middle of a filled
        // notehead turns it into an open one, and the filled/open pair is the
        // whole of how a page says quarter versus half. The crib cost the
        // rhythm, which is a bad trade on a page whose rhythms are the point.
        //
        // It carries the OCTAVE too, because there is room down here and
        // because "D5 against D3" is the observation the chart is for. Dropped
        // where the notes are too close to take one: a sixteenth ostinato with
        // a name under every head is a grey smear.
        if (ctx.names && piece.steps * slotW >= 15) {
          const p = parseNote(span.token);
          lyrics.push(
            `<text x="${x}" y="${top + STAFF_H + ctx.nameDy}" text-anchor="middle" font-family="Helvetica,'DejaVu Sans',sans-serif" font-size="7.4" fill="#8a7a5e">${p.letter}${p.sharp ? "\u266f" : ""}${p.octave}</text>`,
          );
        }
      }
      if (piece.dots > 0)
        out.push(
          `<circle cx="${x + HEAD_RX + 4}" cy="${yy - (half % 2 === 0 ? S / 2 : 0)}" r="1.7" fill="#111"/>`,
        );
      // THE STEM IS NOT DRAWN HERE. Every stemmed note is recorded and the
      // stems go on in ONE pass below, after the beam groups are known.
      //
      // Drawing it here as well was a real bug and a visible one: a beam takes
      // ONE direction for the whole group, so any note whose own preference
      // disagreed ended up with two stems — the group's, and a leftover stub
      // hanging off the other side of its head. An octave-pumping bass, where
      // the low note wants its stem up and the high note wants it down, grew a
      // leg on every second note.
      if (piece.kind !== "whole") {
        heads.push({
          at: piece.at,
          x,
          y: yy,
          up,
          tails,
          kind: piece.kind,
        });
      }
      // …and the tie back to the piece this one is a continuation of.
      if (!firstPiece && prevPiece)
        out.push(tie(prevPiece.x, prevPiece.y, x, yy, up));
      prevPiece = { x, y: yy };
      firstPiece = false;
    }
  }

  // ── STEMS AND BEAMS ───────────────────────────────────────────────────────
  // Consecutive tailed notes inside one BEAT are beamed, which is the thing
  // that makes a rhythm readable at a glance instead of countable. Everything
  // else gets a stem of its own, with a flag if it has tails.
  const midLine = top + STAFF_H / 2;
  /** Where a stem attaches to its head — the right side going up, the left
   * going down, which is what stops a stem from bisecting the notehead. */
  const stemX = (h, up) => (up ? h.x + HEAD_RX - 0.6 : h.x - HEAD_RX + 0.6);
  const stem = (h, up, to) =>
    out.push(
      `<line class="stem" data-up="${up ? 1 : 0}" x1="${stemX(h, up)}" y1="${h.y}" x2="${stemX(h, up)}" y2="${to}" stroke="#111" stroke-width="${STEM_W}"/>`,
    );

  let group = [];
  const flush = () => {
    if (group.length === 1) {
      const g = group[0];
      const to = g.up ? g.y - STEM_LEN : g.y + STEM_LEN;
      stem(g, g.up, to);
      // A flag hangs off the stem's TIP and curls back toward the head: down
      // from an up-stem, up from a down-stem.
      if (g.tails > 0) out.push(flagGlyph(stemX(g, g.up), to, g.tails, g.up));
    } else if (group.length > 1) {
      // THE GROUP'S DIRECTION IS THE FARTHEST NOTE'S, which is the engraver's
      // rule and not a vote: whichever note lies furthest from the middle line
      // decides, because that is the one whose stem would otherwise have to run
      // clean across the staff.
      const above = Math.max(...group.map((g) => midLine - g.y));
      const below = Math.max(...group.map((g) => g.y - midLine));
      // …and it points AWAY from that note: a group that reaches low stems UP,
      // one that reaches high stems DOWN. Which is the same rule the single
      // notes follow (`up = half < 4`) — having the two disagree is what put
      // the beam under an octave-pumping bass instead of over it.
      const up = below >= above;
      const tipY = up
        ? Math.min(...group.map((g) => g.y)) - STEM_LEN
        : Math.max(...group.map((g) => g.y)) + STEM_LEN;
      for (const g of group) stem(g, up, tipY);
      const x1 = stemX(group[0], up);
      const x2 = stemX(group[group.length - 1], up);
      const beams = Math.max(...group.map((g) => g.tails));
      for (let b = 0; b < beams; b++) {
        const by = up
          ? tipY + b * (BEAM_H + BEAM_GAP)
          : tipY - b * (BEAM_H + BEAM_GAP) - BEAM_H;
        if (b === 0) {
          out.push(
            `<rect class="beam" x="${x1 - STEM_W / 2}" y="${by}" width="${x2 - x1 + STEM_W}" height="${BEAM_H}" fill="#111"/>`,
          );
          continue;
        }
        // A secondary beam only spans the notes that actually carry it, and a
        // lone one gets the stub every engraver draws.
        let run = [];
        const emit = () => {
          if (run.length === 0) return;
          const a = stemX(run[0], up);
          const z = stemX(run[run.length - 1], up);
          const w = run.length === 1 ? S * 0.9 : z - a + STEM_W;
          out.push(
            `<rect class="beam" x="${a - STEM_W / 2}" y="${by}" width="${w}" height="${BEAM_H}" fill="#111"/>`,
          );
          run = [];
        };
        for (const g of group) {
          if (g.tails > b) run.push(g);
          else emit();
        }
        emit();
      }
    }
    group = [];
  };
  for (const h of heads) {
    // A note with no tail can never be beamed, so it is always its own group.
    if (h.tails === 0) {
      flush();
      group = [h];
      flush();
      continue;
    }
    if (group.length > 0) {
      const last = group[group.length - 1];
      const contiguous = last.at + stepsForKind(last, stepsPerBeat) === h.at;
      const sameBeat =
        Math.floor(last.at / stepsPerBeat) === Math.floor(h.at / stepsPerBeat);
      if (!sameBeat || !contiguous) flush();
    }
    group.push(h);
  }
  flush();

  // The names last, so they sit over any stem or ledger reaching into their row.
  out.push(...lyrics);
}

/** How many steps a drawn piece occupies — the beam grouper's "are these two
 * next to each other" test. */
function stepsForKind(piece, stepsPerBeat) {
  const whole = stepsPerBeat * 4;
  const base = {
    whole,
    half: whole / 2,
    quarter: whole / 4,
    eighth: whole / 8,
    "16th": whole / 16,
  };
  return base[piece.kind];
}

const ledger = (x, y) =>
  `<line class="ledger" x1="${x - S * 0.95}" y1="${y}" x2="${x + S * 0.95}" y2="${y}" stroke="#111" stroke-width="${LINE_W}"/>`;

const tie = (x1, y1, x2, y2, up) => {
  const d = up ? -1 : 1;
  const my = (y1 + y2) / 2 + d * S * 1.1;
  return `<path class="tie" d="M ${x1 + HEAD_RX * 0.4} ${y1 + d * S * 0.55} Q ${(x1 + x2) / 2} ${my} ${x2 - HEAD_RX * 0.4} ${y2 + d * S * 0.55}" fill="none" stroke="#111" stroke-width="1.3"/>`;
};
