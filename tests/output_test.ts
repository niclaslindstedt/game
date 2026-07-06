// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  debug,
  error,
  info,
  recentLogs,
  setDebugEnabled,
  status,
  warn,
} from "../src/output.ts";

describe("output module", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("buffers every level, always", () => {
    const before = recentLogs().length;
    status("ready");
    warn("low health");
    info("wave 2");
    error("boom");
    setDebugEnabled(false);
    debug("tick 42");
    const entries = recentLogs().slice(before);
    expect(entries.map((e) => e.level)).toEqual([
      "info",
      "warn",
      "info",
      "error",
      "debug",
    ]);
  });

  it("only prints debug output when debug mode is on", () => {
    setDebugEnabled(false);
    debug("hidden");
    expect(console.debug).not.toHaveBeenCalled();

    setDebugEnabled(true);
    debug("visible");
    expect(console.debug).toHaveBeenCalledWith("visible");
    setDebugEnabled(false);
  });

  it("stamps entries with an ISO timestamp", () => {
    info("timestamped");
    const last = recentLogs().at(-1);
    expect(last?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
