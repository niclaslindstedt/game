// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCREENSHOTS' SHELL half (desktop) — the bridge between the game's screenshot
// key (pwa/src/game/screenshots.ts) and the two things a desktop can do with a
// picture that a browser tab cannot. The protocol is documented on the web side
// (pwa/src/app/screenshot-bridge.ts); keep the two in step.
//
//   FILE   put the PNG in the player's own pictures folder, under a folder
//          named for the game. A "download" is the browser's answer and it is
//          the wrong one in an installed app: it lands in a folder nobody
//          opens, with a name nobody chose.
//   SHARE  the desktop's honest version of a share sheet — the picture goes on
//          the CLIPBOARD (a paste target is always one window away: a chat, a
//          document, a forum post) and the file manager is opened on the file
//          itself. There is no OS-level "send to an app" on Windows or Linux
//          worth routing a game through, and pretending otherwise would be a
//          button that opens nothing.
//
// Steam's own screenshot library is NOT reached from here, and
// ./screenshots-provider.ts is the whole reasoning: the overlay already files
// its own copy off the same key, and the binding exposes no
// `ISteamScreenshots` to add one by hand. The seam is consulted anyway, so the
// day a library provider exists it is one line.
//
// EVERY FAILURE IS AN `ok: false`. A full disk, a read-only pictures folder, a
// player who has moved their home directory — all of them are somebody's
// ordinary Tuesday, and none of them may crash the shell or lose the picture:
// the game's own roll already holds it before this bridge is ever called.

import { clipboard, nativeImage, shell } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { output } from "./output";
import {
  screenshotLibrary,
  type ScreenshotLibrary,
} from "./screenshots-provider";

/** A message from the web side (already parsed; `__gisShots` checked). */
export type ShotsRequest = {
  action?: "init" | "status" | "file" | "share";
  requestId?: number;
  /** The file name the game chose (already slugged and stamped). */
  name?: string;
  /** The picture itself, base64 — the pipe carries text. */
  png?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type ShotsEvent =
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      available: boolean;
      provider?: string;
      folder?: string;
      canShare: boolean;
      steamOverlay?: boolean;
    }
  | { event: "file"; requestId: number; ok: boolean; path?: string }
  | { event: "share"; requestId: number; ok: boolean };

export type ShotsBridge = {
  handle: (request: ShotsRequest) => void;
};

/** What the shell knows about this launch that the picture's fate depends on. */
export type ShotsOptions = {
  /** Where pictures go: `app.getPath("pictures")` joined with the game's own
   * folder name. Passed in rather than read here so this module needs no
   * `app`, which is what lets it be tested without launching Electron. */
  folder: string;
  /** Whether Steam's overlay was injected into this launch — i.e. whether
   * Steam's own screenshot key is filing its own copy alongside ours. The
   * gallery says so; see ./screenshots-provider.ts. */
  steamOverlay: boolean;
};

/**
 * Build the desktop screenshots bridge. `emit` injects one event into the page
 * (main.ts wraps `executeJavaScript`); `handle` takes each parsed shots
 * message off the shell channel.
 */
export function createShotsBridge(
  emit: (event: ShotsEvent) => void,
  options: ShotsOptions,
): ShotsBridge {
  const library: ScreenshotLibrary | null = screenshotLibrary();

  /** The picture, or null when the page sent something that is not one. */
  function decode(request: ShotsRequest): Buffer | null {
    if (typeof request.png !== "string" || request.png.length === 0) {
      return null;
    }
    try {
      const buffer = Buffer.from(request.png, "base64");
      // A PNG and nothing else. The page is our own code, but this is the one
      // place it hands the shell bytes that become a FILE — so the magic
      // number is checked rather than assumed.
      const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      return buffer.length > 8 && buffer.subarray(0, 4).equals(PNG_MAGIC)
        ? buffer
        : null;
    } catch {
      return null;
    }
  }

  /**
   * A file name that cannot escape the screenshots folder. The game builds
   * these itself and they are already tame; this is the belt on the braces,
   * because a name from the page joins a path here.
   */
  function safeName(name: unknown): string {
    const text = typeof name === "string" ? name : "";
    const cleaned = text.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
    return /^[a-zA-Z0-9]/.test(cleaned)
      ? cleaned
      : `screenshot-${Date.now()}.png`;
  }

  /** Write the picture, returning where it landed or null. */
  async function write(request: ShotsRequest): Promise<string | null> {
    const png = decode(request);
    if (!png) return null;
    const path = join(options.folder, safeName(request.name));
    try {
      await mkdir(options.folder, { recursive: true });
      await writeFile(path, png);
    } catch (err) {
      output.warn(`screenshots: could not write ${path} — ${describe(err)}`);
      return null;
    }
    // The platform's own library, if this shell ever grows one. Never fatal:
    // the file above is already the player's copy.
    if (library) {
      const image = nativeImage.createFromBuffer(png);
      const size = image.getSize();
      void library.add(png, size.width, size.height).catch(() => undefined);
    }
    return path;
  }

  return {
    handle(request: ShotsRequest): void {
      const requestId =
        typeof request.requestId === "number" ? request.requestId : 0;
      switch (request.action) {
        case "init":
          // Nothing to set up — the folder is made on the first write. The
          // announcement exists so the protocol matches its two siblings.
          return;

        case "status":
          emit({
            event: "status",
            requestId,
            ok: true,
            available: true,
            provider: "steam",
            folder: options.folder,
            // The clipboard and the file manager are always there on a
            // desktop; there is nothing to probe.
            canShare: true,
            steamOverlay: options.steamOverlay,
          });
          return;

        case "file":
          void write(request).then((path) => {
            emit({
              event: "file",
              requestId,
              ok: path !== null,
              ...(path ? { path } : {}),
            });
          });
          return;

        case "share":
          void write(request).then((path) => {
            if (!path) {
              emit({ event: "share", requestId, ok: false });
              return;
            }
            try {
              // The clipboard first, because it is the half that actually
              // sends the picture somewhere; the file manager is the half that
              // shows the player where their copy lives.
              const image = nativeImage.createFromPath(path);
              if (!image.isEmpty()) clipboard.writeImage(image);
              shell.showItemInFolder(path);
              emit({ event: "share", requestId, ok: true });
            } catch (err) {
              output.warn(`screenshots: share failed — ${describe(err)}`);
              emit({ event: "share", requestId, ok: false });
            }
          });
          return;

        default:
          return;
      }
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
