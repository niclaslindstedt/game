// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// A ZIP WRITER, small enough to read in one sitting.
//
// It exists for the same reason `electron/src/mod-archive.ts` is a reader we
// wrote rather than a dependency, and it is deliberately its mirror image: that
// module opens a stranger's zip under rules we chose, and this one writes an
// archive that obeys exactly those rules — stored or deflated entries, no
// zip64, no encryption, forward-slash relative names, nothing that escapes the
// destination. A package this produces is one the shipped game can open, and
// that is not a coincidence: it is the whole point of the pair.
//
// Two deliberate choices worth keeping:
//
//   * **Deterministic.** Every entry carries the same fixed timestamp, so
//     packaging the same folder twice yields byte-identical archives. A version
//     the author can diff (or checksum) is worth more than a mod that knows
//     what time it was built.
//   * **Stored when deflating does not pay.** Pixel-grid YAML compresses about
//     tenfold and a PNG thumbnail not at all; an entry that would grow is
//     stored instead.

import { deflateRawSync } from "node:zlib";

/** 1980-01-01 00:00:00 — the earliest a DOS timestamp can express, and the
 * conventional stand-in for "this archive is reproducible". */
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** The version that understands deflate — nothing here needs more. */
const VERSION_NEEDED = 20;
/** Bit 11: the name is UTF-8. */
const FLAG_UTF8 = 0x0800;

const SIG_LOCAL = 0x0403_4b50;
const SIG_CENTRAL = 0x0201_4b50;
const SIG_EOCD = 0x0605_4b50;

/**
 * One zip, in memory.
 *
 * @param entries `[{ name, data }]` — `name` relative with `/` separators,
 *   `data` a Buffer. Order is kept, so the caller decides it.
 * @returns the archive as a Buffer.
 */
export function writeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    if (entry.name.includes("\\") || entry.name.startsWith("/")) {
      throw new Error(`zip: "${entry.name}" is not a relative POSIX path`);
    }
    const raw = entry.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? METHOD_STORE : METHOD_DEFLATE;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(SIG_CENTRAL, 0);
    // "made by" — 3 (Unix) << 8 | the version above, so the mode bits below
    // are read as such rather than as DOS attributes.
    head.writeUInt16LE((3 << 8) | VERSION_NEEDED, 4);
    head.writeUInt16LE(VERSION_NEEDED, 6);
    head.writeUInt16LE(FLAG_UTF8, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(DOS_TIME, 12);
    head.writeUInt16LE(DOS_DATE, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt16LE(0, 30); // extra
    head.writeUInt16LE(0, 32); // comment
    head.writeUInt16LE(0, 34); // disk
    head.writeUInt16LE(0, 36); // internal attributes
    // 0644, in the high half, where a Unix unzip looks for the mode. Shifted
    // unsigned: `<< 16` alone lands past 2^31 and comes back a negative.
    head.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // the disk the directory starts on
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // no archive comment

  return Buffer.concat([...chunks, directory, eocd]);
}

/** The CRC-32 table, built once on first use. */
let table = null;
function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

/** CRC-32 of a Buffer, as an unsigned 32-bit number. */
export function crc32(buffer) {
  const t = crcTable();
  let crc = 0xffff_ffff;
  for (const byte of buffer) crc = t[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}
