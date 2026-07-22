// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Serves the bundled website to the WebView over a local HTTP server, so the
// native app is fully self-contained — the game runs on-device and offline,
// and only ever updates when a new build ships to the store.
//
// Why a local HTTP server (not file://): the game is served from an http
// origin exactly as on the web, so absolute asset paths (`/assets/…`) resolve
// and secure-context storage (IndexedDB / localStorage, where saves live)
// behaves identically to the deployed site. The port is FIXED — the WebView
// origin is `http://<host>:<port>`, and browser storage is keyed to that
// origin, so a stable port is what keeps saved characters across launches.
//
// The website ships as one `assets/webroot.zip` (scripts/bundle-web.mjs). On
// first launch (or after an app update) it is unzipped into the document
// directory with pure-JS fflate — no native unzip module, and one code path on
// both platforms — then lighttpd (bundled in the static-server library) serves
// that folder. A version marker skips the unzip on every later launch.

import { unzipSync } from "fflate";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import StaticServer from "@dr.pogodin/react-native-static-server";
import Constants from "expo-constants";

// A fixed loopback port — see the origin/storage note above. Chosen high and
// arbitrary to avoid clashing with anything the OS hands out.
const PORT = 9006;

// Where the unzipped site lives, and the marker that records which app version
// produced it (so we only re-extract when the bundle actually changes).
const WEBROOT_DIR = `${FileSystem.documentDirectory}webroot`;
const VERSION_MARKER = `${WEBROOT_DIR}/.bundle-version`;

// Bump-free identity for the current bundle: the app version is enough, since a
// new website build always rides a new app build (and thus a new version).
const BUNDLE_VERSION = Constants.expoConfig?.version ?? "dev";

// The static-server `fileDir` is a filesystem path, not a file:// URI.
const stripScheme = (uri: string) => uri.replace(/^file:\/\//, "");

// --- base64 <-> bytes (RN has no Buffer; keep it dependency-free) ------------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0 && i + 2 < clean.length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && i + 3 < clean.length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, p);
}

/** Extract the bundled webroot.zip into the document directory, unless this
 * exact bundle is already unpacked there. */
async function ensureExtracted(): Promise<void> {
  const asset = Asset.fromModule(require("../assets/webroot.zip"));
  // The marker folds in Metro's content hash of the zip, not just the app
  // version: local dev builds rebuild webroot.zip far more often than the
  // version bumps, and a version-only marker kept serving the FIRST extracted
  // site forever — new bundles silently never reached the WebView.
  const stamp = `${BUNDLE_VERSION}:${asset.hash ?? "unhashed"}`;
  const marker = await FileSystem.getInfoAsync(VERSION_MARKER);
  if (marker.exists) {
    const stamped = await FileSystem.readAsStringAsync(VERSION_MARKER);
    if (stamped === stamp) return; // already up to date
  }

  // Stale (or first run): wipe any previous extraction and unzip fresh.
  const dir = await FileSystem.getInfoAsync(WEBROOT_DIR);
  if (dir.exists)
    await FileSystem.deleteAsync(WEBROOT_DIR, { idempotent: true });
  await FileSystem.makeDirectoryAsync(WEBROOT_DIR, { intermediates: true });

  await asset.downloadAsync();
  const zipUri = asset.localUri ?? asset.uri;
  const zipB64 = await FileSystem.readAsStringAsync(zipUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const entries = unzipSync(base64ToBytes(zipB64));

  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue; // dir entries (empty FILES still write)
    const dest = `${WEBROOT_DIR}/${path}`;
    const parent = dest.slice(0, dest.lastIndexOf("/"));
    await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
    await FileSystem.writeAsStringAsync(dest, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  await FileSystem.writeAsStringAsync(VERSION_MARKER, BUNDLE_VERSION);
}

export type LocalServer = {
  /** The origin to point the WebView at, e.g. `http://localhost:9006`. */
  origin: string;
  /** Stop the server (call on unmount). */
  stop: () => Promise<void>;
};

/** Unzip the bundled site (once per version) and start the local HTTP server.
 * Resolves with the origin the WebView should load. */
export async function startLocalServer(): Promise<LocalServer> {
  await ensureExtracted();

  const server = new StaticServer({
    fileDir: stripScheme(WEBROOT_DIR),
    port: PORT,
    // Loopback only — the game is never exposed on the network.
    nonLocal: false,
  });

  const origin = await server.start();
  return {
    origin,
    stop: async () => {
      await server.stop();
    },
  };
}
