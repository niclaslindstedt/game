// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the build-tooling `.mjs` modules the sprite-YAML test
// exercises (see docs/sprite-yaml-plan.md). They're plain JavaScript with no
// declarations of their own; these wildcard module shims give the test just
// enough typing to import them without `any`.

type Rgba = [number, number, number, number];

declare module "*/asset-tools/sprite-yaml.mjs" {
  export function rgbaToHex(rgba: number[]): string;
  export function hexToRgba(hex: string): Rgba;
  export function paletteToHex(
    palette: Record<string, number[]>,
  ): Record<string, string>;
  export function paletteFromHex(
    hexMap: Record<string, string>,
  ): Record<string, Rgba>;
  export function toYaml(obj: unknown): string;
}

declare module "*/asset-tools/sprite-schema.mjs" {
  export function validatePalette(label: string, palette: unknown): string[];
  export function gridRows(block: string): string[];
  export function validateSprite(sprite: unknown): {
    errors: string[];
    warnings: string[];
  };
}

declare module "*/sprite-data/load-yaml.mjs" {
  export function loadSprites(): {
    CORE_PALETTE: Record<string, Rgba>;
    FAMILIES: Array<{ name: string; palette: Record<string, Rgba> }>;
    SPRITES: Record<string, string[]>;
    SPRITE_PALETTES: Record<string, Record<string, Rgba>>;
    SPRITE_FAMILY: Record<string, string>;
    ANIMATIONS: Record<string, unknown>;
  };
}
