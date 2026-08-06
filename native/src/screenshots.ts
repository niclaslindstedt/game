// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCREENSHOTS' NATIVE half — the bridge between the game's screenshot key
// (pwa/src/game/screenshots.ts) and the platform's own share sheet. The
// protocol is documented on the web side (pwa/src/app/screenshot-bridge.ts);
// keep the two in step, and in step with the desktop peer
// (electron/src/screenshots.ts).
//
// **WHY THE PAGE CANNOT JUST CALL `navigator.share`.** On iOS it very nearly
// can — WKWebView has the Web Share API — but on ANDROID a WebView has no Web
// Share API at all, so the one button a phone player most wants would simply
// not be offered on half the phones. And even on iOS the page's picture is a
// Blob in a private origin: handing it to the sheet means the sheet gets an
// unnamed file. So the sheet is raised from HERE, from a real file with a real
// name, on both platforms through one path.
//
// WHERE THE FILE GOES: the app's own cache directory, not the camera roll.
// Saving to the roll needs the photo-library permission, and a game asking for
// that on a screenshot key is a game that gets refused — the SHARE sheet's own
// "Save Image" is the player's way to put it there, chosen by them, with no
// permission prompt from us. The cache directory is also self-cleaning, which
// is what a staging file for a share sheet should be.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

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
    }
  | { event: "file"; requestId: number; ok: boolean; path?: string }
  | { event: "share"; requestId: number; ok: boolean };

export type ShotsBridge = {
  handle: (request: ShotsRequest) => void;
};

/** Where the staged file lives — see the header for why it is the cache. */
const STAGING_DIR = `${FileSystem.cacheDirectory}screenshots`;

/**
 * A file name that cannot escape the staging folder. The game builds these
 * itself and they are already tame; this is the belt on the braces, because a
 * name from the page becomes a path here.
 */
function safeName(name: unknown): string {
  const text = typeof name === "string" ? name : "";
  const cleaned = text.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return /^[a-zA-Z0-9]/.test(cleaned) ? cleaned : "screenshot.png";
}

/** Write the picture into the staging folder; the file URI, or null. */
async function stage(request: ShotsRequest): Promise<string | null> {
  if (typeof request.png !== "string" || request.png.length === 0) return null;
  const uri = `${STAGING_DIR}/${safeName(request.name)}`;
  try {
    await FileSystem.makeDirectoryAsync(STAGING_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, request.png, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
  } catch {
    return null;
  }
}

/**
 * Build the native screenshots bridge. `emit` injects one event into the
 * WebView (App.tsx wraps `injectJavaScript`); `handle` takes each parsed shots
 * message from `onMessage`.
 */
export function createShotsBridge(
  emit: (event: ShotsEvent) => void,
): ShotsBridge {
  return {
    handle(request: ShotsRequest): void {
      const requestId =
        typeof request.requestId === "number" ? request.requestId : 0;
      switch (request.action) {
        case "init":
          return;

        case "status":
          void Sharing.isAvailableAsync()
            .then((canShare) =>
              emit({
                event: "status",
                requestId,
                ok: true,
                // The app can always stage a file; whether the SHEET exists is
                // the platform's answer, and it is asked rather than assumed.
                available: true,
                provider: Platform.OS === "android" ? "android" : "ios",
                // Deliberately NOT a path: the staging folder is an internal
                // detail the player never opens, and printing "SAVED TO
                // /data/user/0/…" in the gallery would be noise dressed up as
                // information. The gallery falls back to its own line.
                canShare,
              }),
            )
            .catch(() =>
              emit({
                event: "status",
                requestId,
                ok: true,
                available: true,
                canShare: false,
              }),
            );
          return;

        case "file":
          // A phone has nowhere useful to file a picture without asking for the
          // photo library, so this is a no-op that answers honestly: the game's
          // own roll is the copy, and SHARE is how a picture leaves it.
          emit({ event: "file", requestId, ok: false });
          return;

        case "share":
          void stage(request).then(async (uri) => {
            if (!uri) {
              emit({ event: "share", requestId, ok: false });
              return;
            }
            try {
              await Sharing.shareAsync(uri, {
                mimeType: "image/png",
                UTI: "public.png",
                dialogTitle: "SCREENSHOT",
              });
              emit({ event: "share", requestId, ok: true });
            } catch {
              // Includes the player simply dismissing the sheet, which is an
              // ordinary outcome rather than a failure to report loudly.
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
