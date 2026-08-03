// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE BINARY'S SECOND MODE. Kept free of Electron imports so argument
// recognition can be tested without launching the shell runtime.

import type { Capabilities } from "./capabilities";

/** Arguments following `--dedicated`, with that mode switch removed. */
export function dedicatedArgs(argv: readonly string[]): string[] | null {
  const at = argv.indexOf("--dedicated");
  return at < 0 ? null : argv.slice(at + 1);
}

/**
 * What the session server is actually handed.
 *
 * Three things happen on the way, and each of them is a bug before it is a
 * rule:
 *
 *  1. **The shell's own options are stripped.** `--multiplayer` means nothing
 *     to the server, and its parser reads an unknown `--flag` as one that
 *     takes a VALUE — so leaving one in would swallow the token after it and
 *     turn `--port 27849` into a config-file path.
 *  2. **The port is passed on explicitly.** It may have been given BEFORE
 *     `--dedicated` rather than after, and the server can only see what it is
 *     handed. Appended last, where the parser's last-one-wins puts it.
 *  3. **A build that may not touch the router says so**, in a way the operator
 *     cannot take back out — that flag is theirs to add, never to remove.
 */
export function serverArgs(
  after: readonly string[],
  capabilities: Capabilities,
): string[] {
  const SHELL_OWN = ["--multiplayer", "--mods", "--no-portmap"];
  const args = after.filter(
    (arg) => !SHELL_OWN.some((own) => arg === own || arg.startsWith(`${own}=`)),
  );
  if (capabilities.port !== undefined) {
    args.push("--port", `${capabilities.port}`);
  }
  if (!capabilities.portMap) args.push("--no-portmap");
  return args;
}
