// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Minimal ZIP support for character exports: single-disk archives, UTF-8 names,
// stored or raw-deflate entries, and no ZIP64/encryption/data descriptors.

export type ZipEntry = { name: string; data: Uint8Array };

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const STORE = 0;
const DEFLATE = 8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function set16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function set32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(value.getFullYear(), 1980);
  return {
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      (value.getSeconds() >> 1),
    date:
      ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  };
}

export async function createZip(
  entries: readonly ZipEntry[],
  modifiedAt = new Date(),
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(modifiedAt);
  const local: Uint8Array[] = [];
  const packed: Array<{
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }> = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    set32(view, 0, LOCAL);
    set16(view, 4, 20);
    set16(view, 8, STORE);
    set16(view, 10, stamp.time);
    set16(view, 12, stamp.date);
    const crc = crc32(entry.data);
    set32(view, 14, crc);
    set32(view, 18, entry.data.length);
    set32(view, 22, entry.data.length);
    set16(view, 26, name.length);
    header.set(name, 30);
    local.push(header, entry.data);
    packed.push({ name, data: entry.data, crc, offset });
    offset += header.length + entry.data.length;
  }

  const central: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of packed) {
    const record = new Uint8Array(46 + entry.name.length);
    const view = new DataView(record.buffer);
    set32(view, 0, CENTRAL);
    set16(view, 4, 20);
    set16(view, 6, 20);
    set16(view, 10, STORE);
    set16(view, 12, stamp.time);
    set16(view, 14, stamp.date);
    set32(view, 16, entry.crc);
    set32(view, 20, entry.data.length);
    set32(view, 24, entry.data.length);
    set16(view, 28, entry.name.length);
    set32(view, 42, entry.offset);
    record.set(entry.name, 46);
    central.push(record);
    centralSize += record.length;
  }

  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  set32(view, 0, END);
  set16(view, 8, packed.length);
  set16(view, 10, packed.length);
  set32(view, 12, centralSize);
  set32(view, 16, offset);
  return concat([...local, ...central, end]);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([Uint8Array.from(bytes).buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 65_557);
    at -= 1
  ) {
    if (view.getUint32(at, true) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP archive");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(pointer, true) !== CENTRAL)
      throw new Error("Corrupt ZIP archive");
    const method = view.getUint16(pointer + 10, true);
    if (method !== STORE && method !== DEFLATE)
      throw new Error("Unsupported ZIP compression");
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(
      bytes.subarray(pointer + 46, pointer + 46 + nameLength),
    );
    const dataOffset =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    entries.push({
      name,
      data: method === DEFLATE ? await inflate(compressed) : compressed.slice(),
    });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
