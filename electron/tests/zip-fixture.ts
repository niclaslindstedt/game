// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A minimal ZIP WRITER, for the tests only.
//
// The reader under test refuses hostile archives, so the tests have to be able
// to BUILD one — which a general-purpose library will not do. This writes the
// format by hand, badly on purpose when asked to: an entry can name anything,
// declare any size, and claim any compression method.
//
// Not a `_test.ts`, so vitest does not collect it (see vitest.config.mts).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

export type Entry = {
  name: string;
  body: Buffer;
  /** Write the bytes uncompressed (method 0) rather than deflated. */
  store?: boolean;
  /** Override the method actually recorded — for testing a refusal. */
  method?: number;
};

/** A real archive of exactly these entries. A name ending in `/` writes a
 * directory entry, which is what a compressor emits and the reader drops. */
export function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const stored = entry.store ?? false;
    const data = stored ? entry.body : deflateRawSync(entry.body);
    const method = entry.method ?? (stored ? 0 : 8);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x0201_4b50, 0);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(method, 10);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(entry.body.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + data.length;
  }

  const dir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x0605_4b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, eocd]);
}

/** Zip a real directory tree, the way a player's compressor would: everything
 * under one top-level folder named after the directory. */
export function zipDir(dir: string, prefix = path.basename(dir)): Buffer {
  const entries: Entry[] = [];
  const walk = (at: string, under: string): void => {
    for (const item of readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, item.name);
      const name = `${under}/${item.name}`;
      if (item.isDirectory()) {
        walk(full, name);
      } else if (item.isFile() && statSync(full).size < 4 * 1024 * 1024) {
        entries.push({ name, body: readFileSync(full) });
      }
    }
  };
  walk(dir, prefix);
  return zip(entries);
}
