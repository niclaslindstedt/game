// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DELTA — what changed since the snapshot the receiver last acknowledged.
//
// One function makes a patch and one applies it, and they are each other's
// inverse over any pair of states the engine can produce
// (`tests/engine/wire_delta_test.ts` holds them to that as a property).
//
// THE DIFFER IS GENERIC, AND THAT IS THE LOAD-BEARING DECISION. The obvious
// alternative — a hand-written packer per engine type — is a SECOND definition
// of every one of the ~120 shapes under `src/game/types/`, and its failure mode
// is silence: a def grows a field, the packer does not, and the field simply
// stops replicating with every test still green. A differ that walks whatever
// it is given cannot drift, and what it costs is that it must be told the few
// things it cannot work out for itself — which is `split.ts`, one small table.
//
// Five strategies, chosen by LOOKING at the value and NAMED IN THE PATCH so
// the decoder never has to guess:
//
//   "v"  value      resend whole. The default, and the only one for a scalar.
//   "n"  nested     a plain object, coded key by key (recursively). This is
//                   what keeps `player` affordable: he changes every tick, but
//                   what changes is `pos` and `hp`, not his 30-cell bag.
//   "e"  entities   an array of `{ id: number }` objects — newcomers whole,
//                   departures by id, and bodies the receiver already holds as
//                   PARTIALS (id + the fields that moved), because a horde's
//                   positions change every tick and its def-sized selves never
//                   do.
//   "a"  indexed    a plain array of the same length, coded per index — the
//                   party and the spawner list, whose string ids fail the
//                   entity shape.
//   "b"  bytes      a `Uint8Array`, coded as the indices that flipped.
//
// **The strategies are chosen by shape, not from a list**, for the same reason
// the differ is generic: a new id-bearing array in the engine gets the good
// encoding on the day it is added, with nobody remembering to say so.

import { isByteArray, isSkipped, versionGuard } from "./split.ts";

/** A patch for one value. Absent from a record = unchanged. */
export type FieldPatch =
  | { k: "v"; v: unknown }
  | { k: "n"; set?: Record<string, FieldPatch>; del?: string[] }
  | {
      k: "e";
      /** Whole entities: newcomers, and anything the receiver may not hold. */
      upd?: unknown[];
      /** PARTIAL entities — `{ id, set, del }` field patches for entities the
       * receiver's baseline already holds, so an enemy whose `pos` moved does
       * not drag its whole def-sized body across the wire with it. An id the
       * receiver does not hold is skipped: a partial cannot materialize a
       * body, and the sender only codes partials against the acknowledged
       * baseline, so the case is a stranger's forgery rather than a loss. */
      pat?: unknown[];
      del?: number[];
    }
  | { k: "a"; set?: Record<string, FieldPatch> }
  | { k: "b"; n: number; ix?: number[]; vs?: number[] };

/** A whole patch: the top-level fields that changed, by name. */
export type StatePatch = Record<string, FieldPatch>;

/** A plain record of the run's replicated fields — what `diffState` compares
 * and `patchState` writes into. */
export type WireState = Record<string, unknown>;

/**
 * Everything in `next` that differs from `prev`.
 *
 * `prev` is always the receiver's LAST ACKNOWLEDGED state, never the sender's
 * latest. That is the whole reason a lost packet costs one frame of smoothness
 * rather than a desync: the next delta is still coded against something the
 * receiver demonstrably has.
 */
export function diffState(prev: WireState, next: WireState): StatePatch {
  const patch: StatePatch = {};
  for (const field of Object.keys(next)) {
    if (isSkipped(field)) continue;
    // A VERSIONED field (obstacles) is guarded by a counter the engine already
    // maintains: compare one integer instead of three thousand rectangles,
    // twenty times a second.
    const guard = versionGuard(field);
    if (guard !== undefined && prev[guard] === next[guard]) continue;
    const entry = isByteArray(field)
      ? diffBytes(prev[field], next[field])
      : diffValue(prev[field], next[field]);
    if (entry) patch[field] = entry;
  }
  // A field the sender no longer has at all. Rare — `carvedLevel` is optional,
  // and so are several of the engine's own timers — but a receiver that kept a
  // stale one would read geometry that no longer applies.
  for (const field of Object.keys(prev)) {
    if (isSkipped(field) || field in next) continue;
    patch[field] = { k: "v", v: undefined };
  }
  return patch;
}

/**
 * Apply `patch` to `state`, IN PLACE.
 *
 * In place rather than returning a new object, because the renderer holds one
 * `GameState` reference for the life of a run: `render.ts`, the HUD model and
 * every overlay were written against a mutating engine and must stay that way.
 * The client driver is what makes a remote run look local, and handing the app
 * a new object each snapshot would have been the one change that reached all
 * of it.
 */
export function patchState(state: WireState, patch: StatePatch): void {
  if (!isPlainObject(patch)) return;
  for (const [field, entry] of Object.entries(patch)) {
    applyPatch(state, field, entry);
  }
}

/**
 * THE APPLIER IS TOTAL OVER ARBITRARY JSON, AND THAT IS A SECURITY PROPERTY
 * RATHER THAN DEFENSIVENESS.
 *
 * Everything below `patchState` used to assume its input came from `diffState`,
 * which is true of every patch the game produces and false of every patch a
 * JOINER receives: a client applies whatever the host sends it, and it has no
 * more reason to trust that host than the host has to trust the client. The
 * fuzz suite found three ways one packet took a joiner's renderer down — a null
 * entry read for its `k`, a `del` that was not iterable, an `upd` holding
 * something with no `id` — and one way it took the machine down, which is a
 * byte field claiming a length of a billion.
 *
 * So each helper below reads its own fields through a guard, and a member that
 * is not the shape the strategy wants is IGNORED rather than applied. Ignoring
 * is the right answer and not merely the safe one: a delta is coded against an
 * acknowledged baseline, so a dropped field is exactly a dropped packet, which
 * the next publish corrects.
 */

/**
 * The most bytes one byte-array field may claim.
 *
 * `explored` is the only tenant and tops out near 28 KB on the biggest map;
 * this is two orders of magnitude above that, so no honest patch comes near it
 * and `new Uint8Array(n)` can never be asked for a gigabyte by a stranger.
 */
const MAX_BYTE_FIELD = 4 << 20;

/** An array, or an empty one — so a `for…of` over a patch member can never
 * throw on something that is not iterable. */
function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// ---------------------------------------------------------------------------
// The recursive core
// ---------------------------------------------------------------------------

/** The patch taking `before` to `after`, or null when they already agree. */
function diffValue(before: unknown, after: unknown): FieldPatch | null {
  if (before === after) return null;
  if (isEntityArray(after) && isEntityArray(before)) {
    return diffEntities(before, after);
  }
  if (
    Array.isArray(after) &&
    Array.isArray(before) &&
    before.length === after.length
  ) {
    // A PLAIN ARRAY OF THE SAME LENGTH diffs per index — this is the party and
    // the spawner list, both of which used to travel WHOLE whenever one member
    // moved a timer (a measured ~10 KB per publish of re-sent spawn queues).
    // A length change falls through to the whole-value patch below: seating a
    // hero or draining a list is rare, and a positional diff across an insert
    // would pay per-index patches for every shifted slot anyway.
    return diffIndexed(before, after);
  }
  if (isPlainObject(after) && isPlainObject(before)) {
    return diffNested(before, after);
  }
  return sameValue(before, after) ? null : { k: "v", v: after };
}

/** Per-index over two same-length arrays. */
function diffIndexed(before: unknown[], after: unknown[]): FieldPatch | null {
  const set: Record<string, FieldPatch> = {};
  let changed = false;
  for (let i = 0; i < after.length; i++) {
    const sub = diffValue(before[i], after[i]);
    if (sub) {
      set[String(i)] = sub;
      changed = true;
    }
  }
  if (!changed) return null;
  return { k: "a", set };
}

/** Write one patched member into its holder — a record key or an array index
 * both reach here, which is what lets nesting recurse without caring which. */
function applyPatch(
  holder: Record<string, unknown>,
  key: string,
  entry: FieldPatch,
): void {
  // A patch arrives from the other end of a socket, so the discriminant is a
  // claim rather than a fact — and reading `.k` off a null was the first thing
  // the fuzzer knocked over.
  if (!isPlainObject(entry)) return;
  const current = holder[key];
  if (entry.k === "v") {
    if (entry.v === undefined) delete holder[key];
    else holder[key] = entry.v;
    return;
  }
  if (entry.k === "e") {
    holder[key] = patchEntities(current, entry);
    return;
  }
  if (entry.k === "a") {
    // Per-index array patch. A receiver holding something that is not an
    // array starts from an empty one — the same total-over-garbage posture as
    // the nested branch below, and the fuzzer is what holds it there.
    const target: unknown[] = Array.isArray(current) ? current : [];
    const set = isPlainObject(entry.set) ? entry.set : {};
    for (const [index, sub] of Object.entries(set)) {
      applyPatch(
        target as unknown as Record<string, unknown>,
        index,
        sub as FieldPatch,
      );
    }
    holder[key] = target;
    return;
  }
  if (entry.k === "b") {
    holder[key] = patchBytes(current, entry);
    return;
  }
  // Nested. A receiver holding something that is not an object for this key
  // (a fresh join, or a field that changed shape) starts from an empty one
  // rather than throwing — the patch always carries every key it needs.
  const target = isPlainObject(current)
    ? (current as Record<string, unknown>)
    : {};
  for (const dead of asList<string>(entry.del)) {
    if (typeof dead === "string") delete target[dead];
  }
  const set = isPlainObject(entry.set) ? entry.set : {};
  for (const [member, sub] of Object.entries(set)) {
    applyPatch(target, member, sub as FieldPatch);
  }
  holder[key] = target;
}

/** Key-by-key over two plain objects. */
function diffNested(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldPatch | null {
  const set: Record<string, FieldPatch> = {};
  const del: string[] = [];
  for (const key of Object.keys(after)) {
    const sub = diffValue(before[key], after[key]);
    if (sub) set[key] = sub;
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) del.push(key);
  }
  const changed = Object.keys(set).length > 0;
  if (!changed && del.length === 0) return null;
  const patch: FieldPatch = { k: "n" };
  if (changed) patch.set = set;
  if (del.length) patch.del = del;
  return patch;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

type Entity = { id: number } & Record<string, unknown>;

/**
 * An array of `{ id: number }` objects — the shape the entity strategy wants.
 *
 * An EMPTY array qualifies, deliberately: a list that empties out and refills
 * must not switch strategies mid-run, or a receiver holding entities would be
 * handed a whole-value replacement it has no baseline to reconcile against.
 */
function isEntityArray(value: unknown): value is Entity[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { id?: unknown }).id !== "number"
    ) {
      return false;
    }
  }
  return true;
}

/** The entries that changed and the ids that left, or null if nothing did.
 *
 * A NEWCOMER travels whole; a body the receiver already holds travels as a
 * PARTIAL — its id and the fields that moved. The difference is most of a
 * horde's wire cost: an enemy's `pos` changes every tick, and re-sending the
 * whole body with it re-sent `home`, `speed`, `defId` and the rest of its
 * never-changing def-sized self twenty times a second per mob (measured at
 * two thirds of the enemies field's bytes). */
function diffEntities(prev: Entity[], next: Entity[]): FieldPatch | null {
  const before = new Map<number, Entity>();
  for (const item of prev) before.set(item.id, item);
  const upd: unknown[] = [];
  const pat: unknown[] = [];
  const seen = new Set<number>();
  for (const item of next) {
    seen.add(item.id);
    const was = before.get(item.id);
    if (was === undefined) {
      upd.push(item);
      continue;
    }
    const fields = diffNested(was, item);
    if (!fields || fields.k !== "n") continue;
    const partial: Record<string, unknown> = { id: item.id };
    if (fields.set) partial.set = fields.set;
    if (fields.del) partial.del = fields.del;
    pat.push(partial);
  }
  const del: number[] = [];
  for (const item of prev) if (!seen.has(item.id)) del.push(item.id);
  if (upd.length === 0 && pat.length === 0 && del.length === 0) return null;
  const patch: FieldPatch = { k: "e" };
  if (upd.length) patch.upd = upd;
  if (pat.length) patch.pat = pat;
  if (del.length) patch.del = del;
  return patch;
}

/** Rebuild the array from the receiver's copy plus the patch. */
function patchEntities(current: unknown, entry: FieldPatch): unknown {
  if (entry.k !== "e") return current;
  const list = isEntityArray(current) ? current : [];
  const byId = new Map<number, Entity>();
  for (const item of list) byId.set(item.id, item);
  for (const id of asList<number>(entry.del)) {
    if (typeof id === "number") byId.delete(id);
  }
  for (const item of asList<unknown>(entry.upd)) {
    // Anything without a numeric id is dropped rather than seated under an
    // `undefined` key: the sort below reads `a.id - b.id`, and one such
    // entry turns the whole list's order into NaN.
    if (!isPlainObject(item) || typeof item.id !== "number") continue;
    byId.set(item.id, item as Entity);
  }
  for (const item of asList<unknown>(entry.pat)) {
    // A PARTIAL merges onto the body the receiver holds. An unknown id is
    // skipped — see the FieldPatch doc: a partial cannot materialize a body,
    // and an honest sender codes only against the acknowledged baseline.
    if (!isPlainObject(item) || typeof item.id !== "number") continue;
    const target = byId.get(item.id);
    if (!target) continue;
    for (const dead of asList<string>(item.del as unknown)) {
      if (typeof dead === "string" && dead !== "id") delete target[dead];
    }
    const set = isPlainObject(item.set) ? item.set : {};
    for (const [member, sub] of Object.entries(set)) {
      if (member === "id") continue; // a partial may not re-key its body
      applyPatch(target, member, sub as FieldPatch);
    }
  }
  // A Map iterates in first-seen order — the receiver's old order with
  // newcomers appended, which is NOT the sender's. Sorting by id restores an
  // order both ends agree on, and the engine mints ids monotonically from
  // `nextId`, so id order IS arrival order for every list that crosses.
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------
// Byte arrays
// ---------------------------------------------------------------------------

/** The indices that flipped, or null if none did. A LENGTH change resends the
 * whole array — that is a new level, not a walked step. */
function diffBytes(prev: unknown, next: unknown): FieldPatch | null {
  const after = asBytes(next);
  if (!after) return null;
  const before = asBytes(prev);
  if (!before || before.length !== after.length) {
    return { k: "b", n: after.length, ix: range(after.length), vs: [...after] };
  }
  const ix: number[] = [];
  const vs: number[] = [];
  for (let i = 0; i < after.length; i++) {
    if (before[i] !== after[i]) {
      ix.push(i);
      vs.push(after[i]!);
    }
  }
  if (ix.length === 0) return null;
  return { k: "b", n: after.length, ix, vs };
}

function patchBytes(current: unknown, entry: FieldPatch): unknown {
  if (entry.k !== "b") return current;
  // The claimed LENGTH is the one number in a patch that costs memory on its
  // own — `new Uint8Array(n)` allocates before anything is written into it.
  const n = Math.floor(entry.n ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > MAX_BYTE_FIELD) return current;
  const held = asBytes(current);
  const out = held && held.length === n ? held : new Uint8Array(n);
  const ix = asList<number>(entry.ix);
  const vs = asList<number>(entry.vs);
  for (let i = 0; i < ix.length; i++) {
    const at = ix[i];
    // Out of range writes are dropped by the typed array anyway; a
    // non-integer index would silently become an ordinary property on it.
    if (typeof at !== "number" || !Number.isInteger(at)) continue;
    out[at] = vs[i] ?? 0;
  }
  return out;
}

/**
 * The bytes behind a value, whatever survived the trip here.
 *
 * A `Uint8Array` that has been through `JSON.stringify` arrives as an object
 * keyed by index — which is exactly why `explored` is on the byte-array list —
 * while a state assembled locally still holds the real thing and one thawed
 * from `saved-run.ts` holds the object form. Accepting all three is what lets
 * one differ run on either side of the wire.
 */
function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (isPlainObject(value)) {
    const record = value as Record<string, number>;
    const keys = Object.keys(record);
    if (keys.length === 0) return null;
    const out = new Uint8Array(keys.length);
    for (const key of keys) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= keys.length) {
        return null;
      }
      out[index] = record[key] ?? 0;
    }
    return out;
  }
  return null;
}

function range(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** A plain object — not null, not an array, not a typed array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

/** Structural equality, cheap path first. Primitives — every timer, meter and
 * counter on the run, which is most of the state's top level — never reach the
 * serializer. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  return stable(a) === stable(b);
}

/**
 * A stable string for a value: object keys sorted, so two structurally equal
 * values always produce identical text.
 *
 * The same rule `@ui/lib/canonical-json.ts` implements for cloud save — and
 * deliberately NOT an import of it: this module runs inside the server's own
 * process, from a compiled tree that carries the engine and nothing under
 * `pwa/`, and reaching across that boundary for thirty lines would drag the
 * app's whole lib pool into the server's ship target.
 */
function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (ArrayBuffer.isView(value)) {
    return `[${Array.from(value as unknown as ArrayLike<number>).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, member]) => `${JSON.stringify(key)}:${stable(member)}`)
    .join(",")}}`;
}
