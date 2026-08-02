// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
});
