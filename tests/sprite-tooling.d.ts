// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for the build-tooling `.mjs` modules the sprite tests
// exercise (see docs/sprite-yaml-plan.md). They're plain JavaScript with no
// declarations of their own; these wildcard module shims give the tests just
// enough typing to import them without `any`.

type Rgba = [number, number, number, number];
type Rgb = [number, number, number];
type Lab = [number, number, number];
type Surface = { width: number; height: number; data: Uint8Array };

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

declare module "*/asset-tools/oklab.mjs" {
  export function rgbToOklab(rgb: Rgb): Lab;
  export function oklabToRgb(lab: Lab): Rgb;
  export function oklabDistance(a: Lab, b: Lab): number;
  export function labSortKey(lab: Lab): [number, number];
}

declare module "*/asset-tools/image.mjs" {
  export function loadImage(path: string): Promise<Surface>;
  export function resampleToCells(
    surface: Surface,
    tw: number,
    th: number,
    alphaThreshold?: number,
  ): Array<Array<Rgb | null>>;
}

declare module "*/asset-tools/quantize.mjs" {
  export function quantizeGrid(
    cells: Array<Array<Rgb | null>>,
    maxColors?: number,
  ): { palette: Record<string, string>; grid: string };
}

declare module "*/asset-tools/prompt.mjs" {
  export const STYLE_PREAMBLE: string;
  export function paletteComments(yamlText: string): Record<string, string>;
  export function buildImagePrompt(args: {
    description?: string;
    familyStyle?: string;
    size?: [number, number];
    palette?: Record<string, string>;
    paletteNames?: Record<string, string>;
  }): string;
  export function provenanceRecord(args: {
    prompt?: string | null;
    model?: string | null;
    seed?: string | number | null;
  }): {
    model: string | null;
    seed: string | number | null;
    prompt: string | null;
  };
}

declare module "*/asset-tools/compare.mjs" {
  export function resizeNearest(
    surface: Surface,
    w: number,
    h: number,
  ): Surface;
  export function compareSurfaces(
    sprite: Surface,
    reference: Surface,
  ): { ssim: number; meanDeltaE: number; coverage: number };
}

declare module "*/asset-tools/surface.mjs" {
  export function createSurface(width: number, height: number): Surface;
  export function setPixel(
    surface: Surface,
    x: number,
    y: number,
    rgba: number[],
  ): void;
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
