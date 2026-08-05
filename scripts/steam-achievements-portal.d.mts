// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for steam-achievements-portal.mjs's tested exports.

export type SteamWorksheetOptions = {
  verify: boolean;
  strict: boolean;
  format: "form" | "tsv" | "csv";
  help?: boolean;
  out?: string;
  app?: string;
  art?: string;
  language?: string;
};

export function parseArgs(argv: string[]): SteamWorksheetOptions;
