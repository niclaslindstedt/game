// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the mod toolchain's `.mjs` modules (see mod/README.md).
// They are plain JavaScript — deliberately, because the SHIPPED desktop app
// runs the same files in its main process, where there is no TypeScript — so
// these wildcard shims give the tests enough typing to import them without
// `any`. Keep them in step with mod/tools/build.mjs.

declare module "*/mod/tools/build.mjs" {
  export const BUNDLE_FORMAT: number;

  export type ModSprite = {
    name: string;
    width: number;
    height: number;
    /** Raw RGBA, row-major, base64'd. */
    rgba: string;
  };

  export type ModBundle = {
    formatVersion: number;
    id: string;
    name: string;
    version: string;
    author: string;
    description: string;
    kind: "addon" | "conversion";
    campaign: string[] | null;
    levels: unknown[];
    enemies: Record<string, unknown>;
    weapons: Record<string, unknown>;
    gear: Record<string, unknown>;
    uniques: Record<string, unknown>;
    sprites: ModSprite[];
  };

  /** `bundle` is null whenever `errors` is non-empty — a mod that does not
   * compile is never half-loaded. */
  export function buildMod(
    modDir: string,
    catalog: unknown,
  ): { bundle: ModBundle | null; errors: string[]; warnings: string[] };
}

declare module "*/mod/tools/catalog-read.mjs" {
  export const CATALOG_FORMAT: number;
  /** Throws on an unreadable or wrong-format catalog: without one there is no
   * compile at all, so it is not a finding a mod author could act on. */
  export function readCatalog(file: string): unknown;
}
