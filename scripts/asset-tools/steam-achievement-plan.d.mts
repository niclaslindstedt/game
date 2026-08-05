// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the Steam worksheet/reconcile's exports, so its tests
// can import the plain-JavaScript module without `any`. Keep in step with
// steam-achievement-plan.mjs.

/** One row of electron/store/steam-achievements.json. */
export type SteamAchievementRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  hidden: boolean;
};

/** The committed Steam manifest, whole. */
export type SteamAchievementManifest = {
  limit: number;
  fullCatalog: boolean;
  count: number;
  achievements: SteamAchievementRow[];
};

/** One column of the partner-site form. */
export type WorksheetColumn = {
  key: string;
  label: string;
  schemaField: string;
};

/** One achievement, laid out as the form asks for it. */
export type WorksheetRow = {
  id: string;
  displayName: string;
  description: string;
  hidden: boolean;
  icon: string;
  iconGray: string;
  artMissing: string[];
  category: string;
};

/** One achievement as `GetSchemaForGame` reports it, normalized. */
export type SchemaAchievement = {
  id: string;
  displayName: string;
  description: string;
  hidden: boolean;
  icon: string;
  iconGray: string;
};

/** The app's schema as the partner site holds it. */
export type GameSchema = {
  gameName: string;
  gameVersion: string;
  achievements: SchemaAchievement[];
  stats: { id: string; displayName: string }[];
};

/** The portal id a missing one is probably a mistyping of. */
export type Suggestion = {
  id: string;
  distance: number;
  certain: boolean;
};

/** One row's verdict against the partner site. */
export type ComparisonEntry = {
  id: string;
  name: string;
  state: "ok" | "missing" | "differs";
  differences: { field: string; from: unknown; to: unknown }[];
  suggestion: Suggestion | null;
  icons: { achieved: boolean; locked: boolean } | null;
};

export type Comparison = {
  entries: ComparisonEntry[];
  extras: { id: string; name: string }[];
};

export type ComparisonCounts = {
  ok: number;
  missing: number;
  differs: number;
  typos: number;
  iconless: number;
  extras: number;
};

export const WORKSHEET_COLUMNS: WorksheetColumn[];
export const DEFAULT_ART_DIR: string;
export const ART_VARIANTS: Record<string, string>;

export function worksheetRows(
  manifest: SteamAchievementManifest,
  options?: { artDir?: string; hasArt?: (file: string) => boolean },
): WorksheetRow[];

export function renderWorksheet(
  rows: WorksheetRow[],
  options?: { format?: "form" | "tsv" | "csv"; columns?: WorksheetColumn[] },
): string;

export function manifestProblems(manifest: SteamAchievementManifest): string[];

export function editDistance(a: string, b: string): number;

export function nearestMiss(
  id: string,
  candidates: string[],
): Suggestion | null;

export function compareSchema(input: {
  rows: WorksheetRow[];
  schema: GameSchema;
}): Comparison;

export function compareCounts(comparison: Comparison): ComparisonCounts;
