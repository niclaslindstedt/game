// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE NET CLIENT MAY AND MAY NOT BE REACHED FROM — two rules pulling in
// opposite directions, which is why they live in one file.
//
// **THE RUN LOOP MUST REACH IT.** The same failure shipped twice: a LAYER
// lands and the CUTOVER that would make it reachable does not. Both times
// the corrective was more prose, and prose was nought for two. So this began as
// a TRIPWIRE — an assertion that the loop did NOT reach the client, green while
// the machinery was orphaned and failing the moment somebody wired it up — and
// it did exactly that when the driver seam landed. Inverted now, it is the
// permanent statement that the session server, the wire, both transports, the
// handshake, the spectators and the chat are on a path a player walks, and that
// they cannot quietly become an orphan again.
//
// **THE STARTUP PATH MUST NOT.** The other direction, and it is the 200 KB
// critical-path budget at the source level: `pwa/src/game/net/` imports
// `@game/core`, so a static edge to it from the app's first download drags the
// whole simulation along. `pwa/scripts/check-seo.mjs` measures the built bytes;
// this says WHICH IMPORT would have caused it, which is the half a size number
// cannot tell you — and it is the rule the HOST/JOIN title-menu screens will be
// tempted to break.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** The page's real entry — what `pwa/index.html` loads. */
const STARTUP = path.join(repoRoot, "pwa", "src", "main.tsx");
/** The run loop's entry: one mount, one run. */
const RUN_LOOP = path.join(repoRoot, "pwa", "src", "game", "GameScreen.tsx");
/**
 * The run driver the cutover has to reach for any of this to be playable.
 *
 * It lives in `server/` rather than under `pwa/`, and the walk below is exactly
 * why that is safe to do: it is the ONE thing that turns snapshots back into a
 * run, a headless BOT CLIENT needs it too (`server/bot-client.ts`),
 * and a second copy written beside it would prove the wrong thing
 * playable. Reached as `@game/client`.
 */
const NET_CLIENT = path.join(repoRoot, "server", "client.ts");

/**
 * Every file reachable from `entry`.
 *
 * Regex over the source rather than a real parser, exactly as
 * `server_deps_test.ts` and `mod_toolchain_deps_test.ts` do and for the same
 * reason: these are our own files in one house style, and the alternative is a
 * parser dependency inside a test whose whole job is checking dependencies.
 *
 * `dynamic` is what separates the two rules below. A `lazy(() => import(…))` is
 * a SEPARATE CHUNK — it is precisely how the app keeps the game out of its
 * first download — so a walk that followed one would report the startup path as
 * reaching the entire game and prove nothing at all.
 */
function reachableFrom(entry: string, opts: { dynamic: boolean }): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    const resolved = resolveModule(file);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    let source: string;
    try {
      source = readFileSync(resolved, "utf8");
    } catch {
      return;
    }
    // **THE COMMENTS HAVE TO GO FIRST, and that is not a nicety.** This repo's
    // prose QUOTES import statements — `render/soak-ladder.ts`'s header
    // explains the budget by writing out the exact
    // `import { type GameState } from "@game/core"` that once broke it — so a
    // scan of the raw source reports the startup path as reaching the whole
    // engine through a file whose entire purpose is not to. Requiring that a
    // specifier contain no whitespace is not enough on its own; it is the
    // second line of defence, against sentences like `away from "a dead end"`.
    const code = withoutComments(source);
    const pattern = opts.dynamic
      ? /(?:from|import\s*\()\s*"([^"\s]+)"/g
      : /\bfrom\s*"([^"\s]+)"/g;
    for (const match of code.matchAll(pattern)) {
      const spec = match[1]!;
      if (spec.startsWith(".")) {
        walk(path.join(path.dirname(resolved), spec));
      } else if (spec.startsWith("@game/") || spec.startsWith("@ui/")) {
        walk(aliasPath(spec));
      }
    }
  };
  walk(entry);
  return seen;
}

/**
 * The source with its comments removed.
 *
 * One pass with both shapes in a single alternation, so a line-comment marker
 * inside a block comment is never read as a line comment and a block opener
 * inside a line comment is never read as a block — which is exactly what a
 * naive two-pass gets wrong.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
}

/** The alias maps the app's build reads. Keep in step with
 * `pwa/vite.config.ts` and the four `tsconfig`s. */
function aliasPath(spec: string): string {
  if (spec === "@game/core") return path.join(repoRoot, "engine", "index.ts");
  if (spec === "@game/menu") return path.join(repoRoot, "engine", "menu.ts");
  if (spec === "@game/client")
    return path.join(repoRoot, "server", "client.ts");
  if (spec.startsWith("@game/lib/")) {
    return path.join(
      repoRoot,
      "engine",
      "lib",
      spec.slice("@game/lib/".length),
    );
  }
  if (spec.startsWith("@game/wire/")) {
    return path.join(
      repoRoot,
      "server",
      "wire",
      spec.slice("@game/wire/".length),
    );
  }
  if (spec.startsWith("@ui/lib/")) {
    return path.join(
      repoRoot,
      "pwa",
      "src",
      "lib",
      spec.slice("@ui/lib/".length),
    );
  }
  return spec;
}

/** A specifier's real file. The repo's own imports carry their extension, so
 * this is mostly identity — it exists for a directory import, which would
 * otherwise silently drop a whole subtree from the walk. */
function resolveModule(file: string): string | null {
  for (const candidate of [
    file,
    `${file}.ts`,
    `${file}.tsx`,
    path.join(file, "index.ts"),
    path.join(file, "index.tsx"),
  ]) {
    if (!/\.(ts|tsx)$/.test(candidate)) continue;
    try {
      readFileSync(candidate, "utf8");
      return path.resolve(candidate);
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

describe("the app's startup path", () => {
  const startup = reachableFrom(STARTUP, { dynamic: false });

  it("is walked at all", () => {
    // The guard on the guard: a walk that resolved nothing would declare every
    // rule below satisfied while checking none of them.
    expect(startup.size).toBeGreaterThan(20);
    expect([...startup].some((f) => f.endsWith("/pwa/src/App.tsx"))).toBe(true);
  });

  it("never statically reaches the net client", () => {
    // THE 200 KB CRITICAL-PATH BUDGET, stated as the import that would break it
    // rather than as the number that would report it. `pwa/src/game/net/`
    // imports `@game/core`; a static edge from the startup path to it puts the
    // whole simulation — the catalogs, the step pipeline, the loot roller, the
    // carve — into every player's first download. The HAND and JOIN screens
    // are title-menu screens and are exactly where this will be tempting:
    // they may reach `@game/menu` and the import-free `@game/wire/*` leaves,
    // never this.
    expect(startup.has(NET_CLIENT)).toBe(false);
  });

  it("never statically reaches the whole engine", () => {
    // The same rule one step up, and the one that actually bites: `@game/core`
    // is the simulation entire. The startup path reaches levels through
    // `defs/levels/summary.ts` and the engine's flags through `@game/menu`.
    expect(startup.has(path.join(repoRoot, "engine", "index.ts"))).toBe(false);
  });
});

describe("the cutover", () => {
  const run = reachableFrom(RUN_LOOP, { dynamic: true });

  it("is walked at all", () => {
    expect(run.size).toBeGreaterThan(50);
    expect(run.has(path.join(repoRoot, "engine", "index.ts"))).toBe(true);
  });

  it("is looking for a file that exists", () => {
    // THE GUARD ON THE GUARD, and for this file it is the whole difference
    // between a tripwire and a decoration. Every assertion here is about
    // whether one path is IN a set of paths, so a renamed or moved net client
    // makes all of them true for ever — the startup rule would pass because
    // nothing can reach a file that is not there, and the tripwire would pass
    // for the same reason, on the very day it was supposed to fire.
    expect(resolveModule(NET_CLIENT)).not.toBeNull();
    // …and that the walker can actually find it when something does import it,
    // which the path existing does not prove on its own.
    const fromClient = reachableFrom(NET_CLIENT, { dynamic: true });
    expect(fromClient.has(NET_CLIENT)).toBe(true);
  });

  it("HAS HAPPENED — the run loop reaches the session client", () => {
    // This was written the other way round, as a tripwire: `pwa/src/game/net/`
    // was DEAD CODE — the session server, the wire, both transports, the
    // handshake, the spectators and the chat all shipped and none of it on a
    // path a player walked — and the assertion recorded that where the build
    // could see it rather than only in a plan nobody has to read. It failed the
    // day the driver seam landed, which is what it was for, and was inverted
    // then.
    //
    // It stays as the permanent statement of the same fact from the other side:
    // the run loop's driver reaches the client, so the machinery is reachable
    // and cannot quietly become an orphan again.
    expect(run.has(NET_CLIENT)).toBe(true);
  });
});
