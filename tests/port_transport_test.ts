// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it, vi } from "vitest";

import { portTransport } from "../pwa/src/game/net/port-transport.ts";

describe("loopback port transport", () => {
  it("copies outbound frames without a transfer list", () => {
    const postMessage = vi.fn();
    const port = {
      onmessage: null,
      start: vi.fn(),
      postMessage,
      close: vi.fn(),
    } as unknown as MessagePort;
    const transport = portTransport(port);
    const frame = new ArrayBuffer(24);

    transport.send(frame);

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(frame);
    expect(frame.byteLength).toBe(24);
  });
});
