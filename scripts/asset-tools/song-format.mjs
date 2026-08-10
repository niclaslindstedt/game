// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SONG FORMAT — a compact text notation for writing a score, and the parser
// that turns it into the tracker YAML the game actually plays.
//
// WHY IT EXISTS. `content/music/*.yaml` is the right SHIPPING format: an
// explicit step grid, every voice's every step visible, nothing computed at
// load. It is a bad AUTHORING format, for three specific reasons, and this
// notation fixes those three and nothing else:
//
//   RHYTHM IS PADDING. `A4 = = = = = = = A#4 = = = = = = =` is sixteen tokens
//   to say "two half notes", and a bar is only correct if you counted to
//   sixteen. Here a note carries its own length — `a4*8 a#4*8` — and a `|`
//   between bars is CHECKED, so a miscount is an error with a bar number on it
//   rather than a rhythm that silently shifts.
//
//   THE CHORDS ARE RETYPED ONCE PER VOICE. In a section with a bass, a pulse
//   and a stab, the same progression is written out three times in three
//   different shapes — which is exactly how a chord comes to be changed in two
//   voices out of three. Here the progression is written ONCE, on the section,
//   and the accompaniment voices are named FIGURES over it: `bass gallop 2`.
//
//   DRUMS ARE WRITTEN AS PITCHES. `D2 . . . . . D2 .` is a kick drum. Here a
//   drum is a one-character-per-step grid — `x..x..x.` — which is what every
//   drum machine ever built used, because you can count it at a glance.
//
// WHAT IT IS NOT. It is not a new source of truth: it COMPILES to the YAML,
// which stays the thing the game reads and the thing that is reviewed. A track
// can be written by hand in YAML forever; this is a faster way in.

/** Semitones above C for each letter. */
const LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** …and back, preferring the sharp spelling the game's format requires. */
const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** How many steps a bar holds. The whole format assumes 4/4 at sixteenths,
 * which is what every score in this game is written in. */
export const STEPS_PER_BAR = 16;

/** A pitch, written the way it is easiest to type — `d5`, `D#5`, `eb5` (FLATS
 * ARE ACCEPTED and folded to sharps, because the game's own token grammar has
 * no flats and remembering that mid-phrase is the sort of thing that costs a
 * rebuild). Returns a midi number, or null. */
export function pitchOf(text) {
  const m = /^([a-gA-G])([#b]?)(-?\d)$/.exec(text);
  if (!m) return null;
  const semi =
    LETTER[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + semi;
}

/** A midi number → the token the game's YAML wants. */
export function tokenOf(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

/** Chord qualities, as semitone sets over the root. Enough to write this game's
 * music and no more — a chord nobody has needed is a chord nobody can typo. */
const QUALITY = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  5: [0, 7, 12],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m6: [0, 3, 7, 9],
  6: [0, 4, 7, 9],
};

/**
 * A chord symbol → its pitch classes. `Dm`, `Bb`, `A7`, `Gsus4`, `C#dim`.
 * `-` is a bar with no harmony (a drum-only or atonal stretch).
 */
export function chordOf(text) {
  if (text === "-" || text === ".") return null;
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(text);
  if (!m) throw new Error(`unreadable chord "${text}"`);
  const quality = QUALITY[m[3]];
  if (!quality) throw new Error(`unknown chord quality "${m[3]}" in "${text}"`);
  const root =
    LETTER[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return { root: ((root % 12) + 12) % 12, quality, text };
}

/**
 * THE FIGURES — the accompaniment shapes this game's music is actually built
 * out of, each one bar long and each derived from the chord under it.
 *
 * They are a fixed library rather than a mini-language on purpose. A notation
 * for "root in octave two on the off-beat sixteenths" is a notation somebody
 * has to learn and can get wrong; `chug 2` is a word. Anything the list cannot
 * say is written out longhand as notes, which is always available.
 *
 * `o` is the octave the figure sits in; `deg(n, o)` is the nth chord tone.
 */
const FIGURES = {
  /** Octave pump — eighths alternating root and its octave. The workhorse. */
  pump: (d, o) =>
    step16((i) => (i % 4 === 0 ? d(0, o) : i % 4 === 2 ? d(0, o + 1) : null)),
  /** The dotted push — a running bass that leans forward. */
  gallop: (d, o) =>
    at16({
      0: d(0, o),
      2: d(0, o),
      3: d(0, o + 1),
      5: d(0, o),
      7: d(0, o + 1),
      8: d(0, o),
      10: d(0, o),
      11: d(0, o + 1),
      13: d(0, o),
      15: d(0, o + 1),
    }),
  /** Syncopated sixteenths on the root — an engine, not a bass. */
  chug: (d, o) =>
    at16(
      Object.fromEntries(
        [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].map((i) => [i, d(0, o)]),
      ),
    ),
  /** Straight eighths on the root. */
  drive: (d, o) => step16((i) => (i % 2 === 0 ? d(0, o) : null)),
  /** Every sixteenth, for a build or a panic. */
  roll: (d, o) => step16(() => d(0, o)),
  /** One note, held the whole bar. */
  hold: (d, o) => [d(0, o), ...Array(15).fill("=")],
  /** Quarters — the plainest thing there is. */
  four: (d, o) => step16((i) => (i % 4 === 0 ? d(0, o) : null)),
  /** A broken chord in eighths, up and back down. */
  arp: (d, o) => {
    const shape = [0, 1, 2, 1];
    return step16((i) => (i % 2 === 0 ? d(shape[(i / 2) % 4], o) : null));
  },
  /** …and in sixteenths, which is a breakdown's whole texture. */
  arp16: (d, o) => {
    const shape = [0, 1, 2, 1];
    return step16((i) => (i % 2 === 0 ? d(shape[(i / 2) % 4], o) : null)).map(
      (t, i) => (i % 2 === 1 ? "." : t),
    );
  },
  /** Chord tones on the off-beat — the rhythm guitar of the pulse world. */
  offbeat: (d, o) => at16({ 2: d(1, o), 6: d(2, o), 10: d(1, o), 14: d(2, o) }),
  /** …and the sparser version, on two and four only. */
  stab: (d, o) => at16({ 4: d(1, o), 12: d(2, o) }),
};

export const FIGURE_NAMES = Object.keys(FIGURES);

/** Build a 16-token bar from a per-step function. */
function step16(fn) {
  return Array.from({ length: STEPS_PER_BAR }, (_, i) => fn(i) ?? ".");
}
/** …or from a sparse map of step → token. */
function at16(map) {
  return Array.from({ length: STEPS_PER_BAR }, (_, i) => map[i] ?? ".");
}

/** The chord-tone accessor a figure is handed: `d(n, octave)` is the nth tone
 * of the chord, voiced in that octave. Wraps past the top of the chord into the
 * octave above, so `arp` on a triad keeps climbing rather than repeating. */
function degreeFn(chord) {
  return (n, octave) => {
    if (!chord) return null;
    const size = chord.quality.length;
    const semi = chord.quality[n % size] + 12 * Math.floor(n / size);
    return tokenOf((octave + 1) * 12 + chord.root + semi);
  };
}

/**
 * A voice's NOTE line → its step tokens.
 *
 * `d5` is one step. `d5*4` is four. `d5---` is four (one, plus a step per
 * dash), which is easier to type for the short values and reads as the note's
 * own length. `.` is a rest and takes the same suffixes. `|` ends a bar and is
 * CHECKED — a bar that is not sixteen steps long is named in the error.
 */
export function parseNotes(text, where, chords) {
  const out = [];
  let bar = 1;
  let barStart = 0;
  for (const raw of text.trim().split(/\s+/)) {
    // A FIGURE CAN TAKE ONE BAR — `roll:4` is the roll figure, in octave 4, for
    // the bar the cursor is standing in. That is what lets a voice come in
    // partway through a section (`. | . | roll:4 | roll:4`) without either a
    // bar-range grammar or the whole figure written out longhand.
    const fig = /^([a-z][a-z0-9]*):(\d)$/.exec(raw);
    if (fig && FIGURE_NAMES.includes(fig[1])) {
      const at = Math.floor(out.length / STEPS_PER_BAR);
      const chord = chords?.[at]?.[0] ?? null;
      if (!chords) throw new Error(`${where}: "${raw}" needs a chords line`);
      out.push(...FIGURES[fig[1]](degreeFn(chord), Number(fig[2])));
      continue;
    }
    if (raw === "|") {
      checkBar(out.length - barStart, bar, where);
      barStart = out.length;
      bar++;
      continue;
    }
    const m = /^([^*-]+)((?:-*)|(?:\*\d+))$/.exec(raw);
    if (!m) throw new Error(`${where}: unreadable "${raw}"`);
    const head = m[1];
    const tail = m[2] ?? "";
    const steps = tail.startsWith("*")
      ? Number(tail.slice(1))
      : 1 + tail.length;
    if (!Number.isInteger(steps) || steps < 1)
      throw new Error(`${where}: bad length in "${raw}"`);
    if (head === ".") {
      for (let i = 0; i < steps; i++) out.push(".");
      continue;
    }
    // A bare `=` is the tail of a note that started in an earlier bar — what the
    // export writes when a tie crosses a bar line, and the one token that has no
    // pitch of its own.
    if (head === "=") {
      for (let i = 0; i < steps; i++) out.push("=");
      continue;
    }
    const midi = pitchOf(head);
    if (midi === null) throw new Error(`${where}: "${head}" is not a note`);
    out.push(tokenOf(midi));
    for (let i = 1; i < steps; i++) out.push("=");
  }
  checkBar(out.length - barStart, bar, where, true);
  return out;
}

function checkBar(len, bar, where, last = false) {
  if (len === 0 && last) return;
  if (len % STEPS_PER_BAR !== 0) {
    throw new Error(
      `${where}: bar ${bar} is ${len} steps, not a whole ${STEPS_PER_BAR}`,
    );
  }
}

/**
 * A DRUM line → its step tokens. One character per step: `x` (or any letter) is
 * a hit, `.` is silence, `-` sustains the hit before it. Spaces and `|` are
 * ignored, so a bar can be grouped however it reads best — `x..x..x. x..x..x.`
 * and `x..x..x.|x..x..x.` are the same line.
 */
export function parseDrums(text, note, where) {
  const chars = text.replace(/[\s|]/g, "");
  if (chars.length % STEPS_PER_BAR !== 0) {
    throw new Error(
      `${where}: ${chars.length} steps is not whole bars of ${STEPS_PER_BAR}`,
    );
  }
  return [...chars].map((c) => {
    if (c === ".") return ".";
    if (c === "-" || c === "=") return "=";
    return note;
  });
}

/** An instrument's flags → the YAML patch. `square vol=.03 gate=.8 hp=6800`. */
function parsePatch(words, where) {
  const WAVES = {
    sine: "sine",
    square: "square",
    saw: "sawtooth",
    sawtooth: "sawtooth",
    tri: "triangle",
    triangle: "triangle",
    noise: "noise",
  };
  const patch = {};
  for (const word of words) {
    if (!word.includes("=")) {
      const wave = WAVES[word.toLowerCase()];
      if (!wave) throw new Error(`${where}: unknown waveform "${word}"`);
      patch.wave = wave;
      continue;
    }
    const [key, value] = word.split("=");
    const num = Number(value);
    switch (key) {
      case "vol":
        patch.volume = num;
        break;
      case "gate":
        patch.gate = num;
        break;
      case "attack":
        patch.attackMs = num;
        break;
      case "detune":
        patch.detuneCents = num;
        break;
      case "pan":
        patch.pan = num;
        break;
      case "echo":
        patch.echo = num;
        break;
      case "slide":
        patch.slide = num;
        break;
      case "vib": {
        // rate/depth/delay — one field because the three are never useful apart.
        const [rateHz, depthCents, delayMs] = value.split("/").map(Number);
        patch.vibrato = {
          rateHz,
          depthCents,
          ...(Number.isFinite(delayMs) ? { delayMs } : {}),
        };
        break;
      }
      case "lp":
      case "hp":
      case "bp":
        patch.filter = {
          type:
            key === "lp" ? "lowpass" : key === "hp" ? "highpass" : "bandpass",
          frequency: num,
        };
        break;
      case "q":
        patch.filter = { ...(patch.filter ?? {}), q: num };
        break;
      default:
        throw new Error(`${where}: unknown instrument setting "${key}"`);
    }
  }
  if (!patch.wave) throw new Error(`${where}: no waveform`);
  return patch;
}

/**
 * Parse a whole `.song` file into the shape `content/music/<id>.yaml` holds.
 *
 * @returns `{ id, name, description, bpm, stepsPerBeat, instruments, patterns,
 *          order, sections }` — `sections` keeps the authored chord plan so the
 *          emitter can write it into the YAML as a comment, which is the one
 *          thing the compiled form otherwise loses.
 */
export function parseSong(source) {
  const doc = {
    stepsPerBeat: 4,
    instruments: {},
    patterns: {},
    order: [],
    sections: {},
  };
  /** voice name → whether it is a drum, and what note its hits play. */
  const drums = new Map();
  let section = null;
  let about = null;
  /** Voice lines gathered for the section being read, compiled when it ends. */
  let pending = {};
  let lastVoice = null;

  const lines = source.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n].replace(/\s+$/, "");
    const where = `line ${n + 1}`;
    if (!raw.trim() || raw.trim().startsWith("#")) continue;

    // An indented line inside `about` is more prose; anything else ends it.
    if (about !== null) {
      if (/^\s/.test(raw)) {
        about.push(raw.trim());
        continue;
      }
      doc.description = about.join(" ");
      about = null;
    }

    const indented = /^\s/.test(raw);
    const words = raw.trim().split(/\s+/);
    const head = words[0];

    if (!indented) {
      flushSection();
      section = null;
      switch (head) {
        case "id":
          doc.id = words[1];
          continue;
        case "title":
        case "name":
          doc.name = words.slice(1).join(" ");
          continue;
        case "tempo":
        case "bpm":
          doc.bpm = Number(words[1]);
          continue;
        case "about":
          about = words.length > 1 ? [words.slice(1).join(" ")] : [];
          continue;
        case "order":
          doc.order = words.slice(1);
          continue;
        case "voice":
        case "drum": {
          const name = words[1];
          const flags = words.slice(2).filter((w) => !w.startsWith("note="));
          doc.instruments[name] = parsePatch(flags, where);
          if (head === "drum") {
            const noteFlag = words.find((w) => w.startsWith("note="));
            const note = noteFlag ? noteFlag.slice(5) : "D2";
            drums.set(
              name,
              doc.instruments[name].wave === "noise"
                ? "x"
                : tokenOf(pitchOf(note)),
            );
          }
          continue;
        }
        case "section": {
          const name = words[1];
          lastVoice = null;
          const from = words[2] === "from" ? words[3] : null;
          if (from && !doc.patterns[from])
            throw new Error(`${where}: no section "${from}" to inherit from`);
          doc.patterns[name] = from
            ? Object.fromEntries(
                Object.entries(doc.patterns[from]).map(([k, v]) => [k, [...v]]),
              )
            : {};
          doc.sections[name] = from ? { ...doc.sections[from] } : {};
          section = name;
          continue;
        }
        default:
          throw new Error(`${where}: unknown directive "${head}"`);
      }
    }

    // ── INSIDE A SECTION ────────────────────────────────────────────────────
    if (!section)
      throw new Error(`${where}: "${head}" is not inside a section`);
    const body = words.slice(1).join(" ");
    if (head === "chords") {
      doc.sections[section].chords = body
        .split("|")
        .map((bar) => bar.trim())
        .filter(Boolean)
        .map((bar) => bar.split(/\s+/).map(chordOf));
      continue;
    }
    // A CONTINUATION. An indented line that does not open with a voice name is
    // more of the line above it, so an eight-bar melody can be written four
    // bars to a line instead of running off the edge of the file. Which is not
    // a nicety: a melody you cannot see all of is a melody you cannot check the
    // shape of, and the shape is the thing being written.
    if (!doc.instruments[head]) {
      if (!lastVoice) throw new Error(`${where}: no voice called "${head}"`);
      pending[lastVoice] = `${pending[lastVoice]} ${raw.trim()}`;
      continue;
    }
    lastVoice = head;
    pending[head] = body;
    continue;
  }
  flushSection();
  if (about !== null) doc.description = about.join(" ");

  validate(doc);
  return doc;

  /** Compile the section whose voice lines have all been gathered. Deferred to
   * the end of the section because a continuation line can add to any of them,
   * and because a figure needs the `chords` line whether it was written above
   * the voice or below it. */
  function flushSection() {
    if (!section) return;
    for (const [voice, body] of Object.entries(pending)) {
      const at = `${section}/${voice}`;
      const chords = doc.sections[section].chords;
      if (drums.has(voice)) {
        doc.patterns[section][voice] = parseDrums(body, drums.get(voice), at);
        continue;
      }
      const words = body.trim().split(/\s+/);
      doc.patterns[section][voice] = FIGURE_NAMES.includes(words[0])
        ? renderFigure(words, chords, at)
        : parseNotes(body, at, chords);
    }
    pending = {};
    lastVoice = null;
  }
}

/** A figure line → the section's worth of steps, one bar per chord. */
function renderFigure(words, chords, where) {
  const [name, octave = "3", ...rest] = words;
  if (!chords)
    throw new Error(`${where}: "${name}" needs a chords line to follow`);
  const fn = FIGURES[name];
  const oct = Number(octave);
  if (!Number.isInteger(oct))
    throw new Error(`${where}: "${octave}" is not an octave`);
  if (rest.length) throw new Error(`${where}: "${rest[0]}" means nothing here`);
  const out = [];
  for (const bar of chords) {
    // Several chords in one bar split it evenly between them.
    const slice = STEPS_PER_BAR / bar.length;
    if (!Number.isInteger(slice))
      throw new Error(`${where}: ${bar.length} chords do not divide a bar`);
    bar.forEach((chord, i) => {
      const full = fn(degreeFn(chord), oct);
      out.push(...full.slice(i * slice, (i + 1) * slice));
    });
  }
  return out;
}

/** The refusals — every one a thing that would otherwise fail later and further
 * away, either in the music schema or on a player's machine. */
function validate(doc) {
  const err = [];
  if (!doc.id) err.push("no `id`");
  if (!doc.name) err.push("no `title`");
  if (!doc.bpm) err.push("no `tempo`");
  if (doc.order.length === 0) err.push("no `order`");
  for (const name of doc.order)
    if (!doc.patterns[name]) err.push(`order names unknown section "${name}"`);
  for (const [name, pattern] of Object.entries(doc.patterns)) {
    if (!doc.order.includes(name))
      err.push(`section "${name}" is never played`);
    const lengths = Object.values(pattern).map((v) => v.length);
    const longest = Math.max(0, ...lengths);
    if (longest === 0) err.push(`section "${name}" is empty`);
    for (const [voice, steps] of Object.entries(pattern)) {
      if (longest % steps.length !== 0) {
        err.push(
          `section "${name}" voice "${voice}": ${steps.length} steps does not ` +
            `divide the section's ${longest}`,
        );
      }
    }
  }
  if (err.length) throw new Error(err.join("\n  "));
}

// ── THE WAY BACK ─────────────────────────────────────────────────────────────

/** The shorthand flag for each patch field, and the order they read best in. */
const FLAGS = [
  ["volume", "vol"],
  ["gate", "gate"],
  ["attackMs", "attack"],
  ["detuneCents", "detune"],
  ["slide", "slide"],
  ["pan", "pan"],
  ["echo", "echo"],
];
const WAVE_WORD = { sawtooth: "saw", triangle: "triangle" };
const FILTER_FLAG = { lowpass: "lp", highpass: "hp", bandpass: "bp" };

/**
 * A cooked track → the `.song` that would produce it.
 *
 * IT DOES NOT GUESS. No attempt is made to recover the chord plan or to spot a
 * figure: a `pump` and eight bars that merely look like one are the same tokens,
 * and a tool that inferred the difference would sooner or later infer it wrong
 * and quietly rewrite somebody's bassline. Everything comes back as longhand
 * notes and drum grids. What that buys is the property worth having — the
 * round trip is LOSSLESS, so `yaml → song → yaml` is byte-stable, which is what
 * makes it safe to open an existing score in the short format, change four
 * notes, and compile it back.
 *
 * @param track  a cooked track (`cookTrack`) plus its `id`, `name`, `description`
 */
export function toSong(track) {
  const L = [];
  L.push(`id     ${track.id}`);
  L.push(`title  ${track.name}`);
  L.push(`tempo  ${track.bpm}`);
  if (track.description) {
    L.push("about");
    for (const line of String(track.description).trim().split("\n"))
      L.push(`  ${line.trim()}`);
  }
  L.push("");

  const drums = new Set();
  for (const [name, patch] of Object.entries(track.instruments)) {
    // A DRUM GRID CARRIES ONE PITCH, so a pitched voice that plays more than
    // one is not a drum however it was built — `rift_drift`'s kick moves
    // between A1 and B1 by section, and writing it as a grid would silently
    // flatten it to whichever note happened to come first. It comes back as an
    // ordinary voice in longhand instead. (Found by the round-trip check, which
    // is the entire reason that check exists.)
    const pitches = distinctPitches(track, name);
    const drum =
      patch.wave === "noise" || ((patch.slide ?? 1) < 0.5 && pitches.size <= 1);
    if (drum) drums.add(name);
    const flags = [WAVE_WORD[patch.wave] ?? patch.wave];
    for (const [key, flag] of FLAGS)
      if (patch[key] !== undefined) flags.push(`${flag}=${num(patch[key])}`);
    if (patch.vibrato) {
      const v = patch.vibrato;
      flags.push(
        `vib=${num(v.rateHz)}/${num(v.depthCents)}${v.delayMs === undefined ? "" : `/${num(v.delayMs)}`}`,
      );
    }
    if (patch.filter) {
      flags.push(
        `${FILTER_FLAG[patch.filter.type]}=${num(patch.filter.frequency)}`,
      );
      if (patch.filter.q !== undefined) flags.push(`q=${num(patch.filter.q)}`);
    }
    // A pitched drum has to carry the note its hits play, or the grid cannot be
    // turned back into pitches.
    if (drum && patch.wave !== "noise") {
      const [only] = pitches;
      if (only) flags.push(`note=${only}`);
    }
    L.push(`${drum ? "drum " : "voice"} ${name.padEnd(8)} ${flags.join(" ")}`);
  }

  for (const [name, pattern] of Object.entries(track.patterns)) {
    L.push("");
    L.push(`section ${name}`);
    const width = Math.max(...Object.keys(pattern).map((v) => v.length));
    for (const [voice, steps] of Object.entries(pattern)) {
      const label = `  ${voice.padEnd(width)}  `;
      const bars = [];
      for (let i = 0; i < steps.length; i += STEPS_PER_BAR)
        bars.push(steps.slice(i, i + STEPS_PER_BAR));
      const lines = drums.has(voice)
        ? [bars.map((b) => b.map(drumChar).join("")).join("|")]
        : wrapBars(bars.map(compressBar), 4);
      L.push(label + lines[0]);
      for (const more of lines.slice(1))
        L.push(" ".repeat(label.length) + more);
    }
  }
  L.push("");
  L.push(`order  ${track.order.join(" ")}`);
  return `${L.join("\n")}\n`;
}

/** Every distinct pitch a voice plays anywhere in the track. */
function distinctPitches(track, voice) {
  const seen = new Set();
  for (const pattern of Object.values(track.patterns)) {
    for (const token of pattern[voice] ?? [])
      if (token !== "." && token !== "=") seen.add(token);
  }
  return seen;
}

const drumChar = (t) => (t === "." ? "." : t === "=" ? "-" : "x");

/** One bar of pitched tokens → the short notation, runs collapsed. */
function compressBar(bar) {
  const out = [];
  let i = 0;
  while (i < bar.length) {
    const token = bar[i];
    let steps = 1;
    while (i + steps < bar.length && bar[i + steps] === "=") steps++;
    // A tie that opened in the bar before arrives here as a bare `=`; it has to
    // stay one, because the short form has no way to spell "the tail of a note
    // that started last bar" — and `parseNotes` reads a leading `=` run the
    // same way the sequencer does.
    const head =
      token === "=" ? "=" : token === "." ? "." : token.toLowerCase();
    if (token === ".") {
      while (i + steps < bar.length && bar[i + steps] === ".") steps++;
    }
    out.push(steps === 1 ? head : `${head}*${steps}`);
    i += steps;
  }
  return out.join(" ");
}

/** Bars → lines, `n` bars to a line, `|` between them. */
function wrapBars(bars, n) {
  const lines = [];
  for (let i = 0; i < bars.length; i += n)
    lines.push(bars.slice(i, i + n).join(" | "));
  return lines;
}

/** A number, written the way it would be typed: `.03`, not `0.03`. */
function num(v) {
  const s = String(v);
  return s.startsWith("0.") ? s.slice(1) : s;
}
