// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the Steam upload's pure half, so its tests can import
// the plain-JavaScript module without `any`. Keep in step with steam-vdf.mjs.

/** Valve's shared Spacewar test app — a placeholder, never a store build. */
export const SPACEWAR_APP_ID: number;

/** A value escaped for a double-quoted VDF string. */
export function escapeVdf(value: unknown): string;

/** The platforms a depot can be built for. */
export const PLATFORMS: readonly string[];

/** The app/depot id problems for one platform — empty when there are none. */
export function validateIds(
  config: { appId?: unknown; depots?: Record<string, unknown> } | undefined,
  platform: string,
): string[];

/** The chunk-name prefixes only a developer build of the site carries. */
export const DEV_TOOL_CHUNKS: readonly string[];

/** Whether a built site's asset filenames betray a developer build. */
export function looksLikeDeveloperBuild(assetFilenames: string[]): boolean;

/** The steamcmd app-build script for one depot. */
export function buildAppVdf(options: {
  appId: number;
  depotId: number;
  contentRoot: string;
  outputDir: string;
  description: string;
  branch?: string;
  preview?: boolean;
}): string;
