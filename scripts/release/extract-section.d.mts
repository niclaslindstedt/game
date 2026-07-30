// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for extract-section.mjs exports used by its tests.

/** GitHub rejects a release body longer than this with an HTTP 422. */
export const GITHUB_BODY_LIMIT: number;

/** One version's CHANGELOG section, heading dropped; null when absent. */
export function extractSection(md: string, version: string): string | null;

/** Hold a release body under `limit`, linking out to the full section. */
export function capBody(
  body: string,
  opts: { version: string; repoUrl: string; limit?: number },
): string;
