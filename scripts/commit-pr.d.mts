// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for commit-pr.mjs exports used by its argument tests.

export type CommitPrOptions = {
  branch?: string;
  title?: string;
  body_file?: string;
  stage: string[];
  all?: boolean;
  dry_run?: boolean;
  help?: boolean;
};

export function parseArgs(argv: string[]): CommitPrOptions;
export function validateOptions(opts: CommitPrOptions): void;
