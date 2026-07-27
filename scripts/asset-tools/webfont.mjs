// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pixel font as a real WEBFONT, packed from the SAME `GLYPHS` map in
// ./font.mjs that the runtime atlas is packed from — so the library's headings
// and the game's own HUD can never drift apart.
//
// The game draws text by tinting a white glyph atlas on a canvas, which is
// JavaScript; the library pages have none. A webfont is what keeps their
// headings REAL TEXT — selectable, translatable, and indexed — where
// pre-rendered heading images would throw away the very words those pages exist
// to rank for.
//
// Every glyph is a grid of lit pixels, so every outline is a union of axis-
// aligned rectangles: no curves, no hinting, no kerning. That makes the whole
// font a few kilobytes and the builder below a plain byte-layout exercise —
// a TrueType `glyf` font (`buildPixelTtf`) wrapped in WOFF2 (`buildPixelWoff2`,
// brotli over null-transformed tables).
//
// Sizing is deliberately power-of-two: one em is `EM_PIXELS` font-pixels, so
// `font-size: 8n px` renders each font-pixel as exactly n screen pixels and the
// art never lands on a fraction.

import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

import { FONT_HEIGHT, GLYPHS, LETTER_SPACING } from "./font.mjs";

/** Font-pixels per em. The glyphs are 5 tall, leaving room for descenders. */
export const EM_PIXELS = 8;
/** Font units per em (a power of two, so a font-pixel is an exact integer). */
export const UNITS_PER_EM = 512;
/** Font units per font-pixel. */
const UNIT = UNITS_PER_EM / EM_PIXELS;
/** Cap height in font units — the glyph box sits on the baseline. */
export const CAP_HEIGHT = FONT_HEIGHT * UNIT;

const FAMILY = "GamePixel";

// ---- byte helpers -----------------------------------------------------------

/** A growable big-endian byte writer — every font table is built through one. */
class Writer {
  constructor() {
    this.bytes = [];
  }
  u8(v) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v) {
    return this.u8(v >> 8).u8(v);
  }
  i16(v) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v) {
    return this.u16(v >>> 16).u16(v & 0xffff);
  }
  tag(s) {
    for (const c of s) this.u8(c.charCodeAt(0));
    return this;
  }
  raw(buf) {
    for (const b of buf) this.bytes.push(b);
    return this;
  }
  /** Pad to the next 4-byte boundary (sfnt tables are aligned). */
  align4() {
    while (this.bytes.length % 4 !== 0) this.u8(0);
    return this;
  }
  buffer() {
    return Buffer.from(this.bytes);
  }
}

const utf16be = (s) => {
  const w = new Writer();
  for (let i = 0; i < s.length; i++) w.u16(s.charCodeAt(i));
  return w.buffer();
};

// ---- glyph outlines ---------------------------------------------------------

/**
 * The lit pixels of one glyph as merged horizontal RUNS — `{ x, y, w }` in
 * font-pixels, y counted UP from the baseline. Merging adjacent pixels into one
 * rectangle roughly halves the contour count without changing the shape (the
 * outline is filled non-zero, so overlapping same-wound rectangles union).
 */
function glyphRuns(rows) {
  const runs = [];
  rows.forEach((row, r) => {
    const y = FONT_HEIGHT - 1 - r;
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const lit = row[x] === "#";
      if (lit && start < 0) start = x;
      if (!lit && start >= 0) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  });
  return runs;
}

/** One glyph's `glyf` entry (empty buffer for a blank glyph, per the spec). */
function glyfEntry(rows) {
  const runs = glyphRuns(rows);
  if (runs.length === 0) return Buffer.alloc(0);

  // Each run is one closed 4-point contour, wound CLOCKWISE in the y-up design
  // space (bottom-left → top-left → top-right → bottom-right).
  const points = [];
  const endPts = [];
  for (const run of runs) {
    const x0 = run.x * UNIT;
    const x1 = (run.x + run.w) * UNIT;
    const y0 = run.y * UNIT;
    const y1 = (run.y + 1) * UNIT;
    points.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]);
    endPts.push(points.length - 1);
  }

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const w = new Writer();
  w.i16(endPts.length);
  w.i16(Math.min(...xs)).i16(Math.min(...ys));
  w.i16(Math.max(...xs)).i16(Math.max(...ys));
  for (const end of endPts) w.u16(end);
  w.u16(0); // no instructions
  // Flags: on-curve only, no repeat/short encoding — the tables are tiny and
  // brotli erases the difference.
  for (let i = 0; i < points.length; i++) w.u8(0x01);
  let prev = 0;
  for (const [x] of points) {
    w.i16(x - prev);
    prev = x;
  }
  prev = 0;
  for (const [, y] of points) {
    w.i16(y - prev);
    prev = y;
  }
  w.align4();
  return w.buffer();
}

/**
 * The font's glyph roster: index 0 is `.notdef` (drawn as `?`, matching the
 * runtime renderer's own fallback), then one glyph per `GLYPHS` key.
 */
function glyphRoster() {
  const chars = Object.keys(GLYPHS);
  const glyphs = [{ char: null, rows: GLYPHS["?"] }];
  for (const char of chars) glyphs.push({ char, rows: GLYPHS[char] });
  return glyphs;
}

/**
 * Codepoint → glyph index. Lowercase letters map onto their uppercase glyph, so
 * ordinary mixed-case markup renders without a `text-transform` — the copy
 * stays real text and the look stays the game's.
 */
function characterMap(glyphs) {
  const map = new Map();
  glyphs.forEach((g, index) => {
    if (g.char === null) return;
    map.set(g.char.codePointAt(0), index);
    const lower = g.char.toLowerCase();
    if (lower !== g.char) map.set(lower.codePointAt(0), index);
  });
  return map;
}

// ---- sfnt tables ------------------------------------------------------------

function buildCmap(map) {
  // Format 4, one segment per contiguous codepoint run, plus the mandatory
  // 0xffff terminator.
  const codes = [...map.keys()].sort((a, b) => a - b);
  const segments = [];
  for (const code of codes) {
    const last = segments[segments.length - 1];
    if (
      last &&
      code === last.end + 1 &&
      map.get(code) === last.startGlyph + (code - last.start)
    ) {
      last.end = code;
    } else {
      segments.push({ start: code, end: code, startGlyph: map.get(code) });
    }
  }
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0 });

  const segCount = segments.length;
  const sub = new Writer();
  sub
    .u16(4)
    .u16(16 + segCount * 8)
    .u16(0);
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  sub.u16(segCount * 2).u16(searchRange);
  sub.u16(Math.log2(searchRange / 2)).u16(segCount * 2 - searchRange);
  for (const s of segments) sub.u16(s.end);
  sub.u16(0); // reservedPad
  for (const s of segments) sub.u16(s.start);
  for (const s of segments) {
    // idDelta maps a whole run at once, modulo 2^16; the terminator's delta of
    // 1 is what maps the mandatory 0xffff onto glyph 0.
    const delta = s.start === 0xffff ? 1 : s.startGlyph - s.start;
    sub.u16(((delta % 0x10000) + 0x10000) % 0x10000);
  }
  for (let i = 0; i < segCount; i++) sub.u16(0); // idRangeOffset: delta-only
  const subtable = sub.buffer();

  const w = new Writer();
  w.u16(0).u16(1); // version, one encoding record
  w.u16(3).u16(1).u32(12); // Windows / Unicode BMP, offset past this header
  w.raw(subtable);
  return w.buffer();
}

function buildHead(bbox, indexToLocLong) {
  const w = new Writer();
  w.u32(0x00010000).u32(0x00010000).u32(0); // version, revision, checkSumAdjustment
  w.u32(0x5f0f3cf5).u16(0x0003).u16(UNITS_PER_EM);
  // A fixed epoch rather than the build clock, so the same glyphs always
  // produce byte-identical output.
  w.u32(0).u32(0).u32(0).u32(0);
  w.i16(bbox.xMin).i16(bbox.yMin).i16(bbox.xMax).i16(bbox.yMax);
  w.u16(0).u16(EM_PIXELS).i16(2); // macStyle, lowestRecPPEM, fontDirectionHint
  w.i16(indexToLocLong ? 1 : 0).i16(0);
  return w.buffer();
}

function buildHhea(metrics, bbox) {
  const w = new Writer();
  w.u32(0x00010000);
  w.i16(metrics.ascender).i16(metrics.descender).i16(metrics.lineGap);
  w.u16(metrics.advanceMax).i16(bbox.xMin).i16(0).i16(bbox.xMax);
  w.i16(1).i16(0).i16(0);
  w.i16(0).i16(0).i16(0).i16(0);
  w.i16(0).u16(metrics.numGlyphs);
  return w.buffer();
}

function buildHmtx(advances) {
  const w = new Writer();
  for (const advance of advances) w.u16(advance).i16(0);
  return w.buffer();
}

function buildMaxp(numGlyphs, maxPoints, maxContours) {
  const w = new Writer();
  w.u32(0x00010000).u16(numGlyphs);
  w.u16(maxPoints).u16(maxContours).u16(0).u16(0);
  w.u16(1).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  return w.buffer();
}

function buildName(version) {
  const strings = [
    [1, FAMILY],
    [2, "Regular"],
    [3, `${FAMILY};${version}`],
    [4, FAMILY],
    [5, `Version ${version}`],
    [6, FAMILY.replace(/\s+/g, "")],
  ];
  const records = new Writer();
  const storage = new Writer();
  let offset = 0;
  for (const [nameId, value] of strings) {
    const encoded = utf16be(value);
    records.u16(3).u16(1).u16(0x0409).u16(nameId);
    records.u16(encoded.length).u16(offset);
    storage.raw(encoded);
    offset += encoded.length;
  }
  const w = new Writer();
  w.u16(0)
    .u16(strings.length)
    .u16(6 + strings.length * 12);
  w.raw(records.buffer()).raw(storage.buffer());
  return w.buffer();
}

function buildOs2(metrics, codes) {
  const w = new Writer();
  w.u16(4).i16(metrics.advanceAvg);
  w.u16(400).u16(5).u16(0); // weight, width, fsType (installable)
  w.i16(UNIT * 4)
    .i16(UNIT * 4)
    .i16(0)
    .i16(0); // subscript
  w.i16(UNIT * 4)
    .i16(UNIT * 4)
    .i16(0)
    .i16(UNIT * 2); // superscript
  w.i16(UNIT).i16(UNIT * 2); // strikeout size / position
  w.i16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) w.u8(0); // PANOSE: unclassified
  w.u32(1).u32(0).u32(0).u32(0); // Basic Latin
  w.tag("NIL8"); // achVendID
  w.u16(0x0040); // fsSelection: REGULAR
  w.u16(Math.min(...codes)).u16(Math.min(0xffff, Math.max(...codes)));
  w.i16(metrics.ascender).i16(metrics.descender).i16(metrics.lineGap);
  w.u16(metrics.ascender).u16(-metrics.descender);
  w.u32(1).u32(0); // Latin 1 code page
  w.i16(CAP_HEIGHT).i16(CAP_HEIGHT);
  w.u16(0x0020).u16(0x0020).u16(1);
  return w.buffer();
}

function buildPost() {
  const w = new Writer();
  w.u32(0x00030000).u32(0); // version 3.0, italicAngle 0
  w.i16(-UNIT).i16(UNIT); // underline position / thickness
  w.u32(1); // isFixedPitch — every advance is glyph width + one spacing column
  w.u32(0).u32(0).u32(0).u32(0);
  return w.buffer();
}

// ---- sfnt assembly ----------------------------------------------------------

function checksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) {
    sum = (sum + buf.readUInt32BE(i)) >>> 0;
  }
  return sum;
}

/**
 * The font's tables, tag-sorted (the order an sfnt directory requires, and the
 * order the WOFF2 wrapper reuses). Every buffer is already 4-byte aligned.
 */
function buildTables(version) {
  const glyphs = glyphRoster();
  const map = characterMap(glyphs);

  const entries = glyphs.map((g) => glyfEntry(g.rows));
  const advances = glyphs.map(
    (g) => (g.rows[0].length + LETTER_SPACING) * UNIT,
  );

  const glyf = Buffer.concat(entries);
  const locaWriter = new Writer();
  let at = 0;
  for (const entry of entries) {
    locaWriter.u32(at);
    at += entry.length;
  }
  locaWriter.u32(at);
  locaWriter.align4();
  const loca = locaWriter.buffer();

  const runCounts = glyphs.map((g) => glyphRuns(g.rows).length);
  const bbox = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  for (const g of glyphs) {
    for (const run of glyphRuns(g.rows)) {
      bbox.xMax = Math.max(bbox.xMax, (run.x + run.w) * UNIT);
      bbox.yMax = Math.max(bbox.yMax, (run.y + 1) * UNIT);
    }
  }

  const metrics = {
    numGlyphs: glyphs.length,
    ascender: (FONT_HEIGHT + 1) * UNIT,
    descender: -UNIT,
    lineGap: 0,
    advanceMax: Math.max(...advances),
    advanceAvg: Math.round(
      advances.reduce((a, b) => a + b, 0) / advances.length,
    ),
  };

  return [
    { tag: "OS/2", data: pad4(buildOs2(metrics, [...map.keys()])) },
    { tag: "cmap", data: pad4(buildCmap(map)) },
    { tag: "glyf", data: glyf },
    { tag: "head", data: pad4(buildHead(bbox, true)) },
    { tag: "hhea", data: pad4(buildHhea(metrics, bbox)) },
    { tag: "hmtx", data: pad4(buildHmtx(advances)) },
    { tag: "loca", data: loca },
    {
      tag: "maxp",
      data: pad4(
        buildMaxp(
          glyphs.length,
          Math.max(...runCounts) * 4,
          Math.max(...runCounts),
        ),
      ),
    },
    { tag: "name", data: pad4(buildName(version)) },
    { tag: "post", data: pad4(buildPost()) },
  ];
}

function pad4(buf) {
  const extra = (4 - (buf.length % 4)) % 4;
  return extra === 0 ? buf : Buffer.concat([buf, Buffer.alloc(extra)]);
}

/** The complete TrueType font. */
export function buildPixelTtf(version = "1.0") {
  const tables = buildTables(version);
  const numTables = tables.length;
  const searchRange = 16 * 2 ** Math.floor(Math.log2(numTables));

  const header = new Writer();
  header.u32(0x00010000).u16(numTables).u16(searchRange);
  header.u16(Math.log2(searchRange / 16)).u16(numTables * 16 - searchRange);

  let offset = 12 + numTables * 16;
  const directory = new Writer();
  for (const table of tables) {
    directory.tag(table.tag).u32(checksum(table.data));
    directory.u32(offset).u32(table.data.length);
    offset += table.data.length;
  }

  const font = Buffer.concat([
    header.buffer(),
    directory.buffer(),
    ...tables.map((t) => t.data),
  ]);

  // `checkSumAdjustment` closes over the whole file, so it can only be written
  // once the file exists. Its own slot must read zero while the sum is taken —
  // which it does, `buildHead` writes it that way.
  const headEntry = tables.findIndex((t) => t.tag === "head");
  const headOffset =
    12 +
    numTables * 16 +
    tables.slice(0, headEntry).reduce((a, t) => a + t.data.length, 0);
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8);
  return font;
}

// ---- WOFF2 ------------------------------------------------------------------

// The WOFF2 "known table" indices (spec, Table Directory Format). A tag in this
// list costs one byte instead of five.
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

/** UIntBase128 — seven bits per byte, big-endian, continuation bit set. */
function uintBase128(value) {
  const out = [];
  let v = value;
  do {
    out.unshift(v & 0x7f);
    v >>>= 7;
  } while (v > 0);
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

/**
 * The font wrapped as WOFF2. Every table takes the NULL transform — version 3
 * for `glyf`/`loca` (whose transform version 0 means the transformed format),
 * version 0 for everything else — so the payload is simply the raw tables,
 * concatenated unpadded and brotli-compressed.
 */
export function buildPixelWoff2(version = "1.0") {
  const tables = buildTables(version);
  const sfntSize =
    12 +
    tables.length * 16 +
    tables.reduce((a, t) => a + pad4(t.data).length, 0);

  const directory = new Writer();
  for (const table of tables) {
    const known = KNOWN_TAGS.indexOf(table.tag);
    const nullTransform = table.tag === "glyf" || table.tag === "loca" ? 3 : 0;
    directory.u8((nullTransform << 6) | (known >= 0 ? known : 63));
    if (known < 0) directory.tag(table.tag);
    for (const byte of uintBase128(table.data.length)) directory.u8(byte);
    // No `transformLength`: it is present only for a table that IS transformed.
  }

  const payload = brotliCompressSync(Buffer.concat(tables.map((t) => t.data)), {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_FONT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_LGWIN]: 22,
    },
  });

  const dir = directory.buffer();
  const body = pad4(Buffer.concat([dir, payload]));
  const header = new Writer();
  header
    .tag("wOF2")
    .u32(0x00010000)
    .u32(48 + body.length);
  header.u16(tables.length).u16(0);
  header.u32(sfntSize).u32(payload.length);
  header.u16(1).u16(0); // major / minor version of the font
  header.u32(0).u32(0).u32(0); // no extended metadata
  header.u32(0).u32(0); // no private block
  return Buffer.concat([header.buffer(), body]);
}
