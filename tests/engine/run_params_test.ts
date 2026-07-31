// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO SHAPES A RUN IS DESCRIBED BY, held to being the same shape.
//
// `RunParams` (`src/game/session-setup.ts`) is what the engine builds a run
// from. `SessionParams` (`server/wire/protocol.ts`) is what crosses the wire.
// They are deliberately written twice — the wire leaf imports NOTHING, because
// the page reads it from screens on the app's startup path where the 170 KB
// critical-path budget forbids reaching `@game/core` — and a `SessionParams` is
// meant to be assignable to a `RunParams` with no conversion at all.
//
// **THE FAILURE THIS CATCHES IS THE ONE THAT ALREADY HAPPENED.** A run was not
// `createGame(params)`: the app performed six mutations before the first tick
// that no session parameter could express, so a session built from those
// parameters held a different world from the one the app built — and because
// both sides converge on the SERVER's world regardless, the symptom was never
// going to be a crash. It was going to be a first delta full of "corrections"
// to a run that was right to begin with. The next field somebody adds to one
// shape and not the other fails exactly the same way, silently, which is why
// this is a build error rather than a review note.
//
// It is a source-text comparison because both are TYPES and types are gone by
// the time a test runs. The same trade `server_deps_test.ts` makes: our own
// files, one house style, and the alternative is a parser dependency inside a
// test whose whole job is comparing two declarations.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * What `SessionParams` carries that `RunParams` deliberately does not.
 *
 * The map SIZE is a process-global engine FLAG rather than an argument —
 * `setGeneratedMapSize` — so it is applied by the CALLER before it builds, on
 * both ends, and there is nothing for the builder to do with it. Everything
 * else must appear in both.
 */
const WIRE_ONLY = ["generatedMapSize"];

const runParams = fieldsOf(
  path.join(repoRoot, "src", "game", "session-setup.ts"),
  "RunParams",
);
const sessionParams = fieldsOf(
  path.join(repoRoot, "server", "wire", "protocol.ts"),
  "SessionParams",
);

describe("a run's parameters and the wire's", () => {
  it("are both found, with something in them", () => {
    // The guard on the guard: an extractor that matched nothing would report
    // two empty sets as being in perfect agreement.
    expect(runParams.length).toBeGreaterThan(8);
    expect(sessionParams.length).toBeGreaterThan(8);
    expect(runParams).toContain("seed");
    expect(sessionParams).toContain("seed");
  });

  it("name the same fields", () => {
    const missingFromWire = runParams.filter(
      (field) => !sessionParams.includes(field),
    );
    const missingFromEngine = sessionParams.filter(
      (field) => !runParams.includes(field) && !WIRE_ONLY.includes(field),
    );
    // Named rather than counted, because the useful half of this failure is
    // WHICH field went missing — that is the line somebody forgot to write.
    expect({ missingFromWire, missingFromEngine }).toEqual({
      missingFromWire: [],
      missingFromEngine: [],
    });
  });

  it("keeps the engine FLAG on the wire side alone", () => {
    // Stated positively as well, so that deleting a row from `WIRE_ONLY` to
    // make a failure go away is itself a failure. It is on the wire because a
    // client must carve the same map; it is absent from the builder because it
    // is set before it, not by it.
    for (const flag of WIRE_ONLY) {
      expect(sessionParams).toContain(flag);
      expect(runParams).not.toContain(flag);
    }
  });
});

/**
 * The top-level property names of one `export type X = { … }` declaration.
 *
 * Comments are stripped first: this repo's prose quotes code, and a doc comment
 * describing `coins?: number` would otherwise read as a field. Depth is tracked
 * so a nested object type contributes nothing but its own name.
 */
function fieldsOf(file: string, typeName: string): string[] {
  const source = readFileSync(file, "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    " ",
  );
  const start = source.indexOf(`export type ${typeName} = {`);
  if (start < 0) throw new Error(`no ${typeName} in ${file}`);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(source.indexOf("{", start) + 1, end);
  const fields: string[] = [];
  let level = 0;
  for (const line of body.split("\n")) {
    if (level === 0) {
      const match = /^\s*([A-Za-z_$][\w$]*)\??\s*:/.exec(line);
      if (match) fields.push(match[1]!);
    }
    for (const char of line) {
      if (char === "{") level++;
      else if (char === "}") level--;
    }
  }
  return fields;
}
