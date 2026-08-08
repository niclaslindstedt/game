// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP RENDERS WITH PREACT, AND STILL SPELLS IT `react`.
//
// `preact/compat` implements the React API the app was written against, so the
// ~400 `from "react"` import sites did not move when the renderer did. What
// makes that work is one alias — `react` → `preact/compat` — and the whole of
// the arrangement is that the alias is repeated, identically, in every map that
// resolves a module: two tsconfigs (what the typechecker believes), the app's
// vite config (what ships) and the vitest config (what the suite runs).
//
// A MAP THAT DRIFTS DOES NOT FAIL LOUDLY, which is why this is a test.
//   • Missing from a tsconfig → `tsc` resolves `react` to nothing and reports
//     hundreds of phantom errors, or (worse, with skipLibCheck) types every
//     hook as `any` and silently stops checking the UI.
//   • Missing from pwa/vite.config.ts → the BUILD fails outright on an
//     unresolved import. That is the benign one.
//   • Missing from vitest.config.ts → a suite that reaches a UI-lib module
//     dies on an import of a package that is not installed, and the failure
//     names the module rather than the alias.
//
// A THIRD KIND OF DRIFT IS A PROP REACT IMPLEMENTED AND PREACT DOES NOT.
// `autoFocus` is the one that bites: React focused the element itself, Preact
// writes the `autofocus` ATTRIBUTE, and the browser drops an autofocus
// candidate whenever anything else already holds focus — so a field opened by a
// CLICK never takes the keyboard, silently. `useAutoFocus` (@ui/lib) is the
// replacement, and the prop is asserted absent below.
//
// The second half is the one that quietly undoes the whole exercise: nothing
// stops a dependency — or a careless `npm install` — from putting react back
// in the tree. Two renderers would then both be reachable, the compat alias
// would go on pointing at Preact, and the only symptom would be ~50 KB of
// react-dom sitting in the critical path that `check-seo.mjs` measures. So the
// dependency tree is asserted to be free of it.

import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");
const json = <T>(p: string): T => JSON.parse(read(p)) as T;

/** Specifier → the `preact/compat` entry point that must answer it. */
const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  ["react", "preact/compat"],
  ["react-dom", "preact/compat"],
  // `createRoot` lives HERE and is deliberately not re-exported from the
  // compat barrel, so this one cannot be folded into the entry above.
  ["react-dom/client", "preact/compat/client"],
];

/**
 * A resolver map's target, reduced to the part every map spells the same way.
 *
 * The two kinds of map say it differently and both are correct: a vite alias
 * names the bare specifier (`preact/compat`), while a tsconfig `paths` entry
 * has to name a FILE the typechecker can open
 * (`./node_modules/preact/compat/client.d.ts`). Dropping a `.d.ts` suffix and
 * comparing the tail is what makes the two comparable without pretending they
 * should be identical strings.
 */
function tail(target: string): string {
  return target.replace(/\.d\.ts$/, "");
}

type TsConfig = { compilerOptions?: { paths?: Record<string, string[]> } };

/** The `paths` of a tsconfig, as specifier → single target. */
function tsconfigAliases(file: string): Map<string, string> {
  const paths = json<TsConfig>(file).compilerOptions?.paths ?? {};
  const out = new Map<string, string>();
  for (const [spec, targets] of Object.entries(paths)) {
    const first = targets[0];
    if (first !== undefined) out.set(spec, first);
  }
  return out;
}

/**
 * The `resolve.alias` entries of a vite/vitest config.
 *
 * Read out of the SOURCE rather than by importing the config: both configs
 * evaluate `execSync("git rev-parse")` and read sibling package.json files at
 * module scope, and a test that imports them is a test that fails in a
 * tarball. Only the literal `{ find: "x", replacement: "y" }` entries are of
 * interest here, and those the regex reads exactly.
 */
function viteAliases(file: string): Map<string, string> {
  const source = read(file);
  const out = new Map<string, string>();
  for (const m of source.matchAll(
    /\{\s*find:\s*"([^"]+)",\s*replacement:\s*"([^"]+)"\s*\}/g,
  )) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

const MAPS: ReadonlyArray<readonly [string, Map<string, string>]> = [
  ["tsconfig.json", tsconfigAliases("tsconfig.json")],
  ["pwa/tsconfig.json", tsconfigAliases("pwa/tsconfig.json")],
  ["vitest.config.ts", viteAliases("vitest.config.ts")],
  ["pwa/vite.config.ts", viteAliases("pwa/vite.config.ts")],
];

describe("the react → preact/compat alias", () => {
  for (const [name, aliases] of MAPS) {
    for (const [spec, compat] of EXPECTED) {
      it(`${name} maps ${spec} to ${compat}`, () => {
        const target = aliases.get(spec);
        expect(
          target,
          `${name} has no alias for "${spec}" — the four resolver maps must ` +
            `stay in lockstep (see AGENTS.md)`,
        ).toBeTypeOf("string");
        // endsWith rather than equality: a tsconfig names a file under
        // node_modules, a vite alias names the bare specifier.
        expect(
          tail(target!).endsWith(compat),
          `${name} resolves "${spec}" to "${target}", which is not ` +
            `"${compat}"`,
        ).toBe(true);
      });
    }
  }
});

describe("react itself", () => {
  it("is absent from the resolved dependency tree", () => {
    const lock = json<{ packages?: Record<string, unknown> }>(
      "package-lock.json",
    );
    const installed = Object.keys(lock.packages ?? {}).filter((k) =>
      /(?:^|\/)node_modules\/react(?:-dom)?$/.test(k),
    );
    expect(
      installed,
      "react is back in the tree — two renderers would ship, and the only " +
        "symptom is ~50 KB of react-dom in the critical path",
    ).toEqual([]);
  });

  it("is not declared by the app, which depends on preact instead", () => {
    const pkg = json<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>("pwa/package.json");
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(declared)).not.toContain("react");
    expect(Object.keys(declared)).not.toContain("react-dom");
    expect(pkg.dependencies?.preact).toBeTypeOf("string");
  });
});

/** Source with comments removed, so prose ABOUT a prop is not read as a use of
 * one — every mention of `autoFocus` in the app is now an explanation of why it
 * is not used. Strings are left alone: a `//` inside one only ever truncates
 * the rest of its line, which cannot manufacture a match. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** Every component file in the app, relative to the repo root. */
function componentFiles(): string[] {
  return readdirSync(at("pwa/src"), { recursive: true, encoding: "utf8" })
    .filter((p) => p.endsWith(".tsx"))
    .map((p) => `pwa/src/${p.split("\\").join("/")}`);
}

describe("the autoFocus prop", () => {
  it("is used nowhere — @ui/lib/auto-focus.ts is how a field takes focus", () => {
    const offenders = componentFiles().filter((file) =>
      /\bautoFocus\b/.test(code(file)),
    );
    expect(
      offenders,
      "`autoFocus` is a React prop Preact does not implement: it writes the " +
        "attribute, and the browser IGNORES it whenever something else " +
        "already holds focus — which a clicked menu row always does. The " +
        "field then takes no keystroke at all. Use `useAutoFocus` instead.",
    ).toEqual([]);
  });
});
