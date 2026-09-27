// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for shell-bundle-guard.mjs, for its tests.

export const FORBIDDEN: string;
export function offendingFiles(files: Record<string, Uint8Array>): string[];
export function offendingFilesIn(dir: string): string[];
export function refuseIfNamed(offending: string[], what: string): void;
