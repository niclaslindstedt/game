// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE BINARY'S SECOND MODE. Kept free of Electron imports so argument
// recognition can be tested without launching the shell runtime.

/** Arguments following `--dedicated`, with that mode switch removed. */
export function dedicatedArgs(argv: readonly string[]): string[] | null {
  const at = argv.indexOf("--dedicated");
  return at < 0 ? null : argv.slice(at + 1);
}
