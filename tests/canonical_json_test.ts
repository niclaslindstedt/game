// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stable JSON stringifier (pwa/src/lib/canonical-json.ts). Cloud save leans
// on it to answer "is this the same data?" with a string comparison — if key
// order leaked through, two devices would each read the other's identical save
// as a change and write it back at each other forever.

import { describe, expect, it } from "vitest";

import { canonicalJson } from "../pwa/src/lib/canonical-json.ts";

describe("canonicalJson", () => {
  it("ignores key order, at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } })).toBe(
      canonicalJson({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }),
    );
  });

  it("keeps ARRAY order, which is data", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("drops undefined members, like JSON.stringify does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it("round-trips through JSON.parse to the same value", () => {
    const value = { z: [1, "two", null, true], a: { nested: { deep: 1 } } };
    expect(JSON.parse(canonicalJson(value))).toEqual(value);
  });

  it("handles the primitives and the empties", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});
