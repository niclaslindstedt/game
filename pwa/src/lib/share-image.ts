// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SENDING A PICTURE SOMEWHERE ELSE — the browser half of the SHARE button, and
// the three ways a picture can leave the game. Generic React/UI game code.
//
// There is no single "share" on the web, so this module answers the question
// the UI actually has — *what can this device do with a PNG?* — and gives each
// answer its own verb. A caller offers the ones that come back true, in this
// order, because that is the order of how directly each one gets the picture to
// a person:
//
//   SHARE   `navigator.share({ files })` — the platform's own sheet. On a phone
//           this is the whole point: Messages, Mail, the chat app the player
//           actually uses, the camera roll. Desktop Safari and Windows Chrome
//           raise a real sheet too, which is why this is never gated on "is
//           this a touch device" — it is gated on `canShare`, and the browser
//           is the one that knows.
//   COPY    the clipboard, as an `image/png` item. Where there is no sheet
//           there is nearly always a paste target — a chat window, a document,
//           an issue tracker — and it is one keypress away.
//   SAVE    a download. The floor: every browser can put a file on the disk.
//
// EVERY PROBE IS A REAL PROBE. `navigator.share` exists in browsers that will
// refuse a file payload, and `navigator.clipboard.write` exists in browsers
// with no PNG writer, so both are asked about the exact thing being sent rather
// than about their own existence. A button offered on a false positive is a
// button that does nothing when pressed, which is worse than one that is not
// there.
//
// SHARING NEEDS THE GESTURE. Both `share` and `write` require transient user
// activation, so they must be called from the press itself — never after an
// `await` that outlives it. That is why nothing here decodes, re-encodes, or
// fetches: a caller hands over a Blob it already holds.

import { downloadBlob } from "./files.ts";

/** The MIME type everything here moves. */
export const MIME_PNG = "image/png";

/** Wrap a PNG blob as a named File — what `navigator.share` wants, and what
 * decides the name the receiving app shows. */
export function pngFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: MIME_PNG });
}

/** Whether the platform's share sheet will take THIS file. */
export function canShareImage(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  // `Navigator["canShare"]` is optional in the DOM lib and absent from older
  // ones, so the pair is narrowed here rather than named as a global type —
  // which also keeps the module loadable in a non-DOM test environment.
  const nav = navigator as Navigator & {
    share?: (data: { files?: File[] }) => Promise<void>;
    canShare?: (data: { files?: File[] }) => boolean;
  };
  if (typeof nav.share !== "function") return false;
  // `canShare` is the only honest answer about files, and a browser with
  // `share` but no `canShare` predates file sharing entirely.
  if (typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Whether a PNG can go on the clipboard. */
export function canCopyImage(): boolean {
  if (typeof navigator === "undefined" || typeof ClipboardItem === "undefined")
    return false;
  const write = (navigator.clipboard as Clipboard | undefined)?.write;
  if (typeof write !== "function") return false;
  // Firefox ships `ClipboardItem` with a text-only writer; `supports` is how it
  // says so. Browsers without the probe support PNG (it is the one type the
  // spec makes mandatory).
  const supports = (
    ClipboardItem as unknown as { supports?: (type: string) => boolean }
  ).supports;
  if (typeof supports !== "function") return true;
  try {
    return supports(MIME_PNG);
  } catch {
    return true;
  }
}

/**
 * Raise the platform's share sheet. Resolves true when the picture went
 * somewhere, false when it did not — INCLUDING when the player dismissed the
 * sheet, which arrives as an `AbortError` and is a perfectly ordinary outcome
 * rather than a failure to report.
 */
export async function shareImage(
  file: File,
  data: { title?: string; text?: string } = {},
): Promise<boolean> {
  try {
    await navigator.share({ ...data, files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** Put the PNG on the clipboard. */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [MIME_PNG]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Save the PNG to the player's downloads. The one path that always works. */
export function saveImage(blob: Blob, name: string): boolean {
  try {
    downloadBlob(name, blob);
    return true;
  } catch {
    return false;
  }
}
