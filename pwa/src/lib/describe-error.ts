// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One readable line out of an unknown thrown value, for the app's output
// channel. A caught `unknown` is usually an Error (whose stack names the
// frame that actually broke — the whole point of logging it), but it can be
// anything a `throw` was handed, so every shape has to come out as text.
// Generic React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*),
// the pool a later game keeps as-is.

/**
 * Describe a caught value for a log line: an Error yields its stack (which
 * already begins with "Name: message"), falling back to `name: message` when
 * the engine gave it no stack; anything else is stringified, and a value that
 * refuses even that (a null-prototype object, a throwing `toString`) is
 * reported by type rather than throwing a second time inside the handler.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`;
  }
  try {
    return String(err);
  } catch {
    return `<unprintable ${typeof err}>`;
  }
}
