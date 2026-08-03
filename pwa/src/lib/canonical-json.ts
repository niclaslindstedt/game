// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A STABLE JSON string: object keys sorted, so two structurally equal values
// always produce identical text. Generic (see pwa/src/lib/README.md — this pool
// is what a later game reuses).
//
// `JSON.stringify` preserves INSERTION order, so the same data assembled by two
// different code paths — say, one built in memory and one round-tripped through
// storage — can stringify differently. Anywhere a string comparison stands in
// for "is this the same data?", that difference reads as a change: cloud save
// uses this to decide whether a merge result is actually worth writing back, and
// without it two devices could hand the same save to each other forever.

/** `value` as JSON with every object's keys in sorted order. Undefined members
 * are dropped, exactly as `JSON.stringify` drops them. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
    .join(",")}}`;
}
