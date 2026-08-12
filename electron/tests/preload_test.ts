// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AUTOPILOT_ARG, UNLOCKED_ARG } from "../src/capabilities";
import { NET_PORT_CHANNEL, SHELL_CHANNEL } from "../src/channels";

const PRELOAD_SOURCE = readFileSync(
  resolve(process.cwd(), "src/preload.ts"),
  "utf8",
);

describe("the sandboxed preload", () => {
  it("is self-contained apart from Electron's supported preload module", () => {
    const moduleSpecifiers = [
      ...PRELOAD_SOURCE.matchAll(/from\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);

    expect(moduleSpecifiers).toEqual(["electron"]);
  });

  it("uses the same IPC channels as the main process", () => {
    expect(PRELOAD_SOURCE).toContain(
      `const SHELL_CHANNEL = "${SHELL_CHANNEL}"`,
    );
    expect(PRELOAD_SOURCE).toContain(
      `const NET_PORT_CHANNEL = "${NET_PORT_CHANNEL}"`,
    );
  });

  it("reads the same unlock argument the window is created with", () => {
    // The main process writes it into `additionalArguments`; this is the only
    // reader. A drift here is silent in both directions — the flag is simply
    // never found — and what it silences is the licence acknowledgement the
    // game shows before the menu (pwa/src/game/LaunchNotice.tsx).
    expect(PRELOAD_SOURCE).toContain(`const UNLOCKED_ARG = "${UNLOCKED_ARG}"`);
  });

  it("reads the same auto pilot argument the window is created with", () => {
    // Same shape, same silence: a drift here means the page is never told the
    // ride was switched on by hand, so the notice that explains where this
    // launch's multiplayer went never appears.
    expect(PRELOAD_SOURCE).toContain(
      `const AUTOPILOT_ARG = "${AUTOPILOT_ARG}"`,
    );
  });
});
