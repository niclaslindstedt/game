// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Character IMPORT / EXPORT — carry a hero to another device as a small signed
// zip. EXPORT bundles the character's save (`character.json`) with a
// `manifest.json` that carries an HMAC-SHA256 signature over those exact bytes,
// then hands it to the browser as a download. IMPORT reads such a zip back,
// re-checks the signature, and only then adds the hero to the roster.
//
// The signature is an anti-cheat speed bump, not a wall: the signing key ships
// inside the deployed bundle, so a determined developer can extract it and
// re-sign a hand-edited save. The point is only to make casual tampering (open
// the json, bump every stat, re-import) fail instead of silently succeeding.
// Rotate the key away from the baked-in default by setting the
// `VITE_CHARACTER_SIGNING_KEY` build env (the `CHARACTER_SIGNING_KEY` deploy
// secret, wired in `.github/workflows/pages.yml`).

import { engineVersion } from "@game/core";
import { createZip, readZip } from "@niclaslindstedt/oss-framework/zip";
import { downloadBlob, MIME_ZIP } from "@niclaslindstedt/oss-framework/files";

import { IDENTITY } from "../identity.ts";

import {
  normalizeCharacter,
  serializeCharacter,
  type Character,
} from "./characters.ts";

/** Archive format id + version, stamped into the manifest so a future format
 * change is detected rather than mis-parsed. */
const FORMAT = "gone-in-space/character";
const FORMAT_VERSION = 1;

/** The app/engine version — recorded for provenance, not gating (an import
 * from an older build still adopts through `migrateLoadout`). Matches
 * package.json (rewritten at release time). */
const APP_VERSION = engineVersion;

// The deployed HMAC key. A build secret overrides the committed default (see
// this file's header) — either way it is shipped to the client, so treat it as
// obfuscation, not a secret. `import.meta.env` is read through a cast so this
// module also typechecks under the engine's (Vite-agnostic) tsconfig.
const DEFAULT_SIGNING_KEY = "oqLuHyv7CKt5tb2XPdtStnxIkpWVU0+Ylbx407sZSfI=";
const buildEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env;
const SIGNING_KEY = buildEnv?.VITE_CHARACTER_SIGNING_KEY || DEFAULT_SIGNING_KEY;

/** The `manifest.json` shipped beside `character.json`. */
type Manifest = {
  format: string;
  version: number;
  /** Display title of the game that wrote it — a friendly mismatch check. */
  game: string;
  /** App version at export time (provenance only). */
  appVersion: string;
  /** Export timestamp (ms). */
  exportedAt: number;
  /** Character name, duplicated for a human glancing at the manifest. */
  name: string;
  /** Signature algorithm — fixed today, recorded for forward tolerance. */
  algorithm: "HMAC-SHA256";
  /** Base64 HMAC-SHA256 over the exact `character.json` bytes. */
  signature: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Copy into a guaranteed `ArrayBuffer`-backed view — the Web Crypto types
 * reject the `ArrayBufferLike` a plain `Uint8Array` (e.g. a zip entry) carries. */
function bufferSource(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(bytes: Uint8Array): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    bufferSource(bytes),
  );
  return toBase64(new Uint8Array(mac));
}

async function verify(bytes: Uint8Array, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      fromBase64(signature),
      bufferSource(bytes),
    );
  } catch {
    // A malformed (non-base64) signature can't verify — treat as a failure.
    return false;
  }
}

/** A filesystem-friendly name for the download, from the hero's name. */
function archiveName(character: Character): string {
  const slug =
    character.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "hero";
  return `${IDENTITY.storagePrefix}-${slug}.zip`;
}

/**
 * Build the signed zip bytes for a character. Pure (no DOM) so it is unit
 * testable; `exportCharacterToFile` wraps it in a download. `now` stamps the
 * manifest + zip mtime.
 */
export async function packCharacter(
  character: Character,
  now: number,
): Promise<Uint8Array> {
  const charBytes = enc.encode(serializeCharacter(character));
  const manifest: Manifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    game: IDENTITY.title,
    appVersion: APP_VERSION,
    exportedAt: now,
    name: character.name,
    algorithm: "HMAC-SHA256",
    signature: await sign(charBytes),
  };
  return createZip(
    [
      {
        name: "manifest.json",
        data: enc.encode(JSON.stringify(manifest, null, 2)),
      },
      { name: "character.json", data: charBytes },
    ],
    new Date(now),
  );
}

/**
 * Read a signed zip back into a verified, normalized character. Pure (no DOM,
 * no roster write) — the caller persists it via `importCharacter`. Throws an
 * `Error` with a player-facing message on any failure so the UI can surface it.
 */
export async function unpackCharacter(bytes: Uint8Array): Promise<Character> {
  let entries;
  try {
    entries = await readZip(bytes);
  } catch {
    throw new Error("That file isn't a valid character archive.");
  }
  const manifestEntry = entries.find((e) => e.name === "manifest.json");
  const charEntry = entries.find((e) => e.name === "character.json");
  if (!manifestEntry || !charEntry) {
    throw new Error("The archive is missing its character data.");
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(dec.decode(manifestEntry.data)) as Manifest;
  } catch {
    throw new Error("The archive manifest is unreadable.");
  }
  if (manifest.format !== FORMAT) {
    throw new Error(`This archive isn't a ${IDENTITY.title} character.`);
  }
  const ok = await verify(charEntry.data, manifest.signature ?? "");
  if (!ok) {
    throw new Error(
      "This character couldn't be verified. It may have been edited, or it came from a different build.",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(dec.decode(charEntry.data));
  } catch {
    throw new Error("The character data is corrupt.");
  }
  return normalizeCharacter(data);
}

/** Export a character as a signed zip download. */
export async function exportCharacterToFile(
  character: Character,
): Promise<void> {
  const bytes = await packCharacter(character, Date.now());
  downloadBlob(
    archiveName(character),
    new Blob([bufferSource(bytes)], { type: MIME_ZIP }),
  );
}

/**
 * Read a picked file into a verified character (not yet added to the roster —
 * hand the result to `importCharacter`). Throws a player-facing `Error` on a
 * bad/edited file.
 */
export async function importCharacterFromFile(file: File): Promise<Character> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return unpackCharacter(bytes);
}
