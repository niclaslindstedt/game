// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for the Game Center reconcile's exports, so its tests can
// import the plain-JavaScript module without `any`. Keep in step with
// game-center-plan.mjs.

/** One row of native/store/game-center-achievements.json. */
export type AchievementRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  points: number;
  incremental: boolean;
  hidden: boolean;
};

/** One row of native/store/game-center-leaderboards.json. */
export type LeaderboardRow = {
  id: string;
  name: string;
  description: string;
  format: string;
  scale: number;
  sort: string;
  submission: string;
  suffixSingular?: string;
  suffixPlural?: string;
};

/** The committed achievement manifest, whole. */
export type AchievementManifest = {
  limit: number;
  pointBudget: number;
  count: number;
  points: number;
  achievements: AchievementRow[];
};

/** The committed leaderboard manifest, whole. */
export type LeaderboardManifest = {
  limit: number;
  count: number;
  leaderboards: LeaderboardRow[];
};

/** A localization as the portal holds it, flattened. */
export type PortalLocalization = {
  id: string;
  locale: string;
  image?: { id: string; fileName?: string; fileSize?: number } | null;
} & Record<string, unknown>;

/** A row as the portal holds it, flattened — attributes inline. */
export type PortalRow = {
  id: string;
  vendorIdentifier: string;
  referenceName?: string;
  localizations?: PortalLocalization[];
} & Record<string, unknown>;

/** The artwork found on disk for one row. */
export type RowImage = { file: string; fileName: string; bytes: Buffer };

/** What to do about one row's image. */
export type ImagePlan = {
  action: "ok" | "upload" | "replace" | "outstanding";
  file?: string;
  fileName?: string;
  bytes?: Buffer;
  portalId?: string;
};

/** One field the portal disagrees about. */
export type FieldChange = { field: string; from: unknown; to: unknown };

/** One manifest row's plan against the portal. */
export type PlanEntry = {
  id: string;
  name: string;
  row: AchievementRow | LeaderboardRow;
  portalId: string | null;
  action: "create" | "update" | "unchanged";
  attributes: Record<string, unknown>;
  attributeChanges: FieldChange[];
  localization: {
    action: "create" | "update";
    id: string | null;
    fields: Record<string, unknown>;
    changes: FieldChange[];
  };
  image: ImagePlan | null;
};

/** A portal row the manifest no longer lists. Reported, never deleted. */
export type PlanExtra = { id: string; portalId: string; name?: string };

export type Plan = { entries: PlanEntry[]; extras: PlanExtra[] };

export const DEFAULT_LOCALE: string;

export const ASC_FORMATTERS: Record<
  string,
  { formatter: string; scale: number }
>;

export function manifestProblems(
  achievements: AchievementManifest,
  leaderboards: LeaderboardManifest,
): string[];

export function achievementAttributes(
  row: AchievementRow,
): Record<string, unknown>;

export function achievementLocalization(
  row: AchievementRow,
  locale: string,
): Record<string, unknown>;

export function leaderboardAttributes(
  row: LeaderboardRow,
): Record<string, unknown>;

export function leaderboardLocalization(
  row: LeaderboardRow,
  locale: string,
): Record<string, unknown>;

export function planAchievements(input: {
  rows: AchievementRow[];
  portalRows: PortalRow[];
  locale?: string;
  imageFor?: (row: AchievementRow) => RowImage | null;
}): Plan;

export function planLeaderboards(input: {
  rows: LeaderboardRow[];
  portalRows: PortalRow[];
  locale?: string;
}): Plan;

export function planCounts(plan: Plan): {
  create: number;
  update: number;
  unchanged: number;
  images: number;
  outstandingImages: number;
  extras: number;
};
