// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for sync-branch.mjs exports used by its plan tests.
//
// Only the PURE half is declared, which is also the only half worth testing:
// everything below decides what git commands to run, and nothing in it runs
// one. The rest of the module (spawning git, reading the current branch) is
// deliberately unexported.

export type SyncBranchOptions = {
  merge?: boolean;
  dry_run?: boolean;
  continue?: boolean;
  abort?: boolean;
  cleanup?: boolean;
  no_backup?: boolean;
  help?: boolean;
  onto?: string;
  remote?: string;
};

/** Which operation git has half-done, if any. */
export type InProgress = "merge" | "rebase" | null;

/** One planned git invocation: the command, then its arguments. */
export type SyncStep = [string, string[]];

export const PROTECTED: Set<string>;
export const DEFAULT_BASE: string;

export function parseArgs(argv: string[]): SyncBranchOptions;
export function modeOf(
  opts: SyncBranchOptions,
): "sync" | "continue" | "abort" | "cleanup";
export function validateOptions(opts: SyncBranchOptions, branch: string): void;
export function backupName(branch: string): string;
export function plan(
  opts: SyncBranchOptions,
  branch: string,
  inProgress?: InProgress,
): SyncStep[];
export function inProgressFrom(
  gitDir: string,
  exists: (path: string) => boolean,
): InProgress;
