// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Serving the bundled website — the desktop peer of native/src/local-server.ts.
//
// The mobile shell runs a real local HTTP server because a WebView can only be
// pointed at a URL. Electron can do better: a registered private scheme
// (`game://app`, see ./config.ts) handled in-process. No port to pick, no port
// to collide with, no socket listening on the player's machine, and no window
// in which another program could talk to it.
//
// Three properties matter and each is easy to lose:
//
//  1. **One stable origin.** The player's whole roster lives in `localStorage`,
//     which is keyed by origin. `game://app` is a constant, so saves survive
//     every update. A `file://` page (or a server on an ephemeral port) would
//     hand the player a different origin — and an empty roster — at some point.
//
//  2. **Correct Content-Type, from us.** The site is ES modules; a browser
//     refuses a module served as anything but a JavaScript type, and the
//     failure is a blank screen rather than an error. So the type is mapped
//     explicitly from the extension here rather than left to be inferred.
//
//  3. **No path escape.** The URL path is attacker-influenced in principle (any
//     link the page follows), so the resolved file is checked to be INSIDE the
//     webroot before it is read — the standard containment check, done on the
//     resolved real path rather than on the raw string.

import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { output } from "./output";

/**
 * The directory holding the built site.
 *
 * `__dirname` is the compiled `dist/` next to it in both shapes the app takes —
 * a checkout being run with `electron .`, and a packaged app where both sit
 * inside `app.asar` — so one relative hop finds it either way.
 */
export function webrootDir(): string {
  return resolve(__dirname, "..", "webroot");
}

/** Is the site actually bundled? False in a fresh checkout that has not run
 * `npm run bundle` yet — worth a clear message rather than a blank window. */
export function webrootExists(): boolean {
  return existsSync(join(webrootDir(), "index.html"));
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return (
    CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? "application/octet-stream"
  );
}

/**
 * Resolve one request path to a file inside the webroot, or null when it
 * escapes or does not exist.
 *
 * A directory (and the bare root) resolves to its `index.html`. Anything that
 * resolves outside the webroot is refused — see property 3 above.
 */
export function resolveWebrootFile(urlPath: string): string | null {
  const root = webrootDir();
  // Decode first (a %2e%2e must not slip past the containment check), and treat
  // a decode failure as a refusal rather than falling back to the raw string.
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // A NUL truncates a path in some syscalls — refuse outright.
  if (decoded.includes("\0")) return null;

  const candidate = resolve(root, "." + normalize("/" + decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (!existsSync(candidate)) return null;
  if (statSync(candidate).isDirectory()) {
    const index = join(candidate, "index.html");
    return existsSync(index) ? index : null;
  }
  return candidate;
}

/** Build the `protocol.handle` responder for the app scheme. */
export function webrootHandler(): (request: Request) => Response {
  return (request: Request): Response => {
    const { pathname } = new URL(request.url);
    const file = resolveWebrootFile(pathname);
    if (!file) {
      output.warn(`webroot: 404 ${pathname}`);
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    // Streamed rather than read whole: the sprite atlas and the level chunks
    // are the biggest things here, and a game should not hold a copy of each in
    // memory just to hand it to its own renderer.
    const body = Readable.toWeb(
      createReadStream(file),
    ) as unknown as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(file),
        // The bundle is on local disk and is replaced wholesale by an update,
        // so revalidation buys nothing — but a stale cached index.html pointing
        // at hashed chunks from a previous build is a silent black screen, the
        // exact failure the mobile shell disables its HTTP cache to avoid.
        "cache-control": "no-store",
      },
    });
  };
}
