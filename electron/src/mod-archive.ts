// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD IN A .ZIP — the one archive this app opens, and the rules it opens it
// under.
//
// `workshop.ts` says the Workshop path deliberately has no archive parser: a
// subscription is downloaded and unpacked by Steam, so a stranger's file never
// meets code of ours. That still holds, and this module does not change it.
// What it answers is the OTHER way a mod arrives — somebody sends a friend a
// zip — where the alternative is not "no parser" but "the player unzips it by
// hand into a folder whose name they have to be told". The file is opened
// either way; doing it here means it is opened under rules we wrote.
//
// So this is a deliberately SMALL reader rather than a dependency, and it
// refuses far more than a general-purpose one would:
//
//   * stored and deflated entries only — no other method, no encryption, no
//     zip64 (a mod is YAML and a thumbnail; anything needing zip64 is not one)
//   * no entry may escape the destination: absolute paths, drive letters,
//     backslashes, `..` segments and control characters are all refused by
//     NAME, before anything is written
//   * hard caps on entry count, per-entry size and total size, so a bomb is a
//     refusal rather than a full disk
//   * sizes come from the CENTRAL DIRECTORY, never from the local header,
//     which may legally be zeroed when a data descriptor follows
//
// Every refusal names the entry. A mod that will not extract is reported the
// same way a mod that will not compile is: it appears in the list, with the
// reason on its row.

import { inflateRawSync } from "node:zlib";

/** No mod is anywhere near these. They exist so a hostile file is a refusal. */
const LIMITS = {
  entries: 4_000,
  entryBytes: 16 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  nameLength: 255,
} as const;

const SIG_EOCD = 0x0605_4b50;
const SIG_CENTRAL = 0x0201_4b50;
const SIG_LOCAL = 0x0403_4b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** A size or offset of this in a 32-bit field means "see the zip64 record". */
const ZIP64_SENTINEL = 0xffff_ffff;

export type ArchiveEntry = { name: string; data: Buffer };

/** Thrown for every refusal, so a caller can report one reason per archive. */
export class ArchiveError extends Error {}

/**
 * Every file in a zip, checked.
 *
 * Directory entries are dropped — the paths of the files are what say which
 * directories exist, and a zip that names a directory it stores nothing in has
 * told us nothing we need.
 */
export function readZip(buffer: Buffer): ArchiveEntry[] {
  const eocd = findEocd(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset === ZIP64_SENTINEL || count === 0xffff) {
    throw new ArchiveError("zip64 archives are not supported");
  }
  if (count > LIMITS.entries) {
    throw new ArchiveError(`too many entries (${count})`);
  }
  if (centralOffset >= buffer.length) {
    throw new ArchiveError("the central directory is outside the file");
  }

  const entries: ArchiveEntry[] = [];
  let total = 0;
  let at = centralOffset;

  for (let i = 0; i < count; i++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== SIG_CENTRAL) {
      throw new ArchiveError("the central directory is malformed");
    }
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const uncompressed = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue; // a directory entry stores nothing
    checkName(name);
    if (
      compressed === ZIP64_SENTINEL ||
      uncompressed === ZIP64_SENTINEL ||
      localOffset === ZIP64_SENTINEL
    ) {
      throw new ArchiveError(`"${name}" needs zip64, which is not supported`);
    }
    if (uncompressed > LIMITS.entryBytes) {
      throw new ArchiveError(`"${name}" is too big (${uncompressed} bytes)`);
    }
    total += uncompressed;
    if (total > LIMITS.totalBytes) {
      throw new ArchiveError("the archive unpacks to more than the limit");
    }

    entries.push({
      name,
      data: readEntry(
        buffer,
        localOffset,
        name,
        method,
        compressed,
        uncompressed,
      ),
    });
  }
  return entries;
}

/**
 * Where the mod actually starts inside the archive.
 *
 * Zipping a mod folder the obvious way (right-click → compress) puts everything
 * under one top-level directory, so the manifest is at `my-mod/mod.yaml` rather
 * than at the root. Both shapes are what people will send, so both are read:
 * the prefix is whatever directory holds `mod.yaml`, and an archive with no
 * manifest — or with two of them at different depths — is refused rather than
 * guessed at.
 */
export function modRoot(entries: readonly ArchiveEntry[]): string {
  const manifests = entries
    .map((entry) => entry.name)
    .filter((name) => name === "mod.yaml" || name.endsWith("/mod.yaml"));
  if (manifests.length === 0) {
    throw new ArchiveError("there is no mod.yaml in the archive");
  }
  if (manifests.length > 1) {
    throw new ArchiveError(
      `the archive holds ${manifests.length} mods (one mod.yaml each) — ` +
        "zip one mod at a time",
    );
  }
  const manifest = manifests[0] ?? "";
  return manifest.slice(0, manifest.length - "mod.yaml".length);
}

/** The archive's files, rooted at the mod rather than at the zip. */
export function modEntries(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  const root = modRoot(entries);
  if (!root) return [...entries];
  return entries
    .filter((entry) => entry.name.startsWith(root))
    .map((entry) => ({ ...entry, name: entry.name.slice(root.length) }));
}

/**
 * Refuse a name that could write outside the destination, on any platform.
 *
 * By NAME and before any write, because the check that runs after a path has
 * been joined is the check that has already lost — and because a name is the
 * same on every OS while a resolved path is not.
 */
function checkName(name: string): void {
  const bad = (why: string): never => {
    throw new ArchiveError(`"${name}" ${why}`);
  };
  if (!name) bad("has no name");
  if (name.length > LIMITS.nameLength) bad("has too long a path");
  // A backslash is a legal character in a zip name and a separator on Windows;
  // the spec says forward slash, so anything else is either hostile or broken.
  if (name.includes("\\")) bad("uses a backslash");
  if (name.startsWith("/")) bad("is an absolute path");
  if (/^[a-zA-Z]:/.test(name)) bad("names a drive");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name))
    bad("has a control character in its path");
  if (name.split("/").some((part) => part === ".." || part === "."))
    bad("climbs out of the archive");
}

function readEntry(
  buffer: Buffer,
  localOffset: number,
  name: string,
  method: number,
  compressed: number,
  uncompressed: number,
): Buffer {
  if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
    throw new ArchiveError(`"${name}" uses an unsupported compression method`);
  }
  if (localOffset + 30 > buffer.length) {
    throw new ArchiveError(`"${name}" points outside the file`);
  }
  if (buffer.readUInt32LE(localOffset) !== SIG_LOCAL) {
    throw new ArchiveError(`"${name}" has no local header`);
  }
  // The local header's own sizes are NOT read: they are legally zero when the
  // entry carries a trailing data descriptor. The central directory is the
  // record that is always complete, and it is what every size here comes from.
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressed;
  if (end > buffer.length) {
    throw new ArchiveError(`"${name}" runs past the end of the file`);
  }

  const raw = buffer.subarray(start, end);
  if (method === METHOD_STORE) {
    if (raw.length !== uncompressed) {
      throw new ArchiveError(`"${name}" does not match its declared size`);
    }
    return Buffer.from(raw);
  }

  let inflated: Buffer;
  try {
    // maxOutputLength makes a lying uncompressed size a refusal rather than a
    // memory blowout: a bomb that declares 1 KB and expands to a gigabyte is
    // stopped by zlib itself, at the byte.
    inflated = inflateRawSync(raw, { maxOutputLength: LIMITS.entryBytes });
  } catch (err) {
    throw new ArchiveError(
      `"${name}" could not be decompressed — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (inflated.length !== uncompressed) {
    throw new ArchiveError(`"${name}" does not match its declared size`);
  }
  return inflated;
}

/** The End of Central Directory record, scanned for from the back — it is the
 * only structure in a zip whose position is knowable, and a trailing comment
 * means it is not simply the last 22 bytes. */
function findEocd(buffer: Buffer): number {
  if (buffer.length < 22) throw new ArchiveError("the file is not a zip");
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let at = buffer.length - 22; at >= earliest; at--) {
    if (buffer.readUInt32LE(at) === SIG_EOCD) return at;
  }
  throw new ArchiveError("the file is not a zip");
}
