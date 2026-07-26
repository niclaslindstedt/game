// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book (same storage policy as settings.ts /
// progress.ts). High scores are a HARDCORE-only affair and span a whole
// CAMPAIGN, not a single level: a hardcore hero's foes felled, combat-clock
// survival time, and highest menace (RAMPAGE) stage are summed across every
// map of a difficulty's campaign and banked as one entry when that campaign is
// beaten (SURVIVED) or the hero falls partway through it (FELL). The menu's
// HIGH SCORES board ranks those campaigns per difficulty four ways — most mobs
// killed, longest survived, highest kills-per-minute, and highest menace
// reached — and a row opens to reveal that campaign's full breakdown.
//
// Softcore heroes never score: death costs them nothing, so a survival-time or
// kill leaderboard would be meaningless for them. The app only ever calls
// `recordCampaign` for hardcore characters (see GameScreen).

import { type Difficulty } from "@game/menu";

import { storageKey } from "../identity.ts";

// A distinct key from the pre-campaign per-run book: that store held a wholly
// different shape (per-run entries for every difficulty, softcore included), so
// it is left behind rather than migrated — the two can't be reconciled.
const STORAGE_KEY = storageKey("campaign-scores");

/** How many campaigns to keep per difficulty, per ranking — enough to fill the
 * board without letting the store grow without bound. */
const KEEP_PER_METRIC = 10;

/** How a banked campaign ended. */
export type CampaignOutcome = "survived" | "fell";

/**
 * One banked hardcore campaign: the totals summed across the maps the hero
 * cleared on one difficulty, plus how the campaign ended. A `survived` campaign
 * beat the difficulty's last level; a `fell` one ended in a hardcore death
 * partway through (its totals include the fatal, uncleared run).
 */
export type CampaignScore = {
  /** The hero's name, for the board row. */
  name: string;
  /** Total foes felled across the campaign. */
  kills: number;
  /** Combat-clock survival time (ms) summed across the campaign. */
  combatMs: number;
  /** Highest menace (RAMPAGE) stage reached anywhere in the campaign. */
  peakMenace: number;
  /** Levels CLEARED in the campaign (the fatal run's level isn't counted). */
  levels: number;
  /** How the campaign ended. */
  outcome: CampaignOutcome;
  /** The level the hero fell on — present only for a `fell` campaign. */
  levelId?: string;
  /** Epoch ms when the campaign was banked (for the detail view's date line). */
  at: number;
};

/** A board row: a campaign with its kills-per-minute precomputed. */
export type CampaignRow = CampaignScore & { kpm: number };

/** The four ways the board ranks campaigns. */
export type ScoreMetric = "kills" | "time" | "kpm" | "menace";

/** Banked campaigns keyed by difficulty id; a missing key = no run yet. */
type CampaignScores = Record<string, CampaignScore[]>;

/** Kills per minute for a campaign — 0 for a zero-length one (avoids /0). */
function killsPerMinute(score: CampaignScore): number {
  if (score.combatMs <= 0) return 0;
  return score.kills / (score.combatMs / 60_000);
}

/** Keep only the campaigns worth ranking: the top KEEP_PER_METRIC by each
 * metric, unioned — so a slaughter (most kills), a long survival, a frantic
 * sprint (high KPM), and a deep evolution (peak menace) each keep their best
 * even though none tops another's list. */
function trim(list: CampaignScore[]): CampaignScore[] {
  const byKills = [...list].sort((a, b) => b.kills - a.kills);
  const byTime = [...list].sort((a, b) => b.combatMs - a.combatMs);
  const byKpm = [...list].sort((a, b) => killsPerMinute(b) - killsPerMinute(a));
  const byMenace = [...list].sort((a, b) => b.peakMenace - a.peakMenace);
  const kept = new Set<CampaignScore>([
    ...byKills.slice(0, KEEP_PER_METRIC),
    ...byTime.slice(0, KEEP_PER_METRIC),
    ...byKpm.slice(0, KEEP_PER_METRIC),
    ...byMenace.slice(0, KEEP_PER_METRIC),
  ]);
  // Newest first, ties broken on the campaign's own identity: the ORDER has to
  // be a function of the SET, not of how it was assembled. Cloud save compares
  // boards as text, so two devices holding the same campaigns in a different
  // order would each read the other's board as new and write it back forever.
  // (The board itself re-sorts per metric — see `topCampaigns`.)
  return [...kept].sort(
    (a, b) =>
      b.at - a.at || (campaignScoreKey(a) < campaignScoreKey(b) ? -1 : 1),
  );
}

/** A finite, non-negative number, or the fallback when absent/bad. */
function cleanNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function isCampaignScore(value: unknown): value is CampaignScore {
  if (!value || typeof value !== "object") return false;
  const { name, kills, combatMs, peakMenace, levels, outcome, at } =
    value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof kills === "number" &&
    Number.isFinite(kills) &&
    kills >= 0 &&
    typeof combatMs === "number" &&
    Number.isFinite(combatMs) &&
    combatMs >= 0 &&
    typeof peakMenace === "number" &&
    Number.isFinite(peakMenace) &&
    peakMenace >= 0 &&
    typeof levels === "number" &&
    Number.isFinite(levels) &&
    levels >= 0 &&
    (outcome === "survived" || outcome === "fell") &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

/** Reduce a banked campaign to just its trusted fields. */
function sanitize(score: CampaignScore): CampaignScore {
  const clean: CampaignScore = {
    name: score.name,
    kills: cleanNum(score.kills),
    combatMs: cleanNum(score.combatMs),
    peakMenace: cleanNum(score.peakMenace),
    levels: cleanNum(score.levels),
    outcome: score.outcome,
    at: cleanNum(score.at),
  };
  if (typeof score.levelId === "string") clean.levelId = score.levelId;
  return clean;
}

function load(): CampaignScores {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: CampaignScores = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(value)) continue;
      const entries = value.filter(isCampaignScore).map(sanitize);
      if (entries.length) out[id] = trim(entries);
    }
    return out;
  } catch {
    return {}; // private mode / corrupt JSON — start fresh
  }
}

const scores: CampaignScores = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Storage unavailable (private mode) — scores stay in-memory this session.
  }
}

/**
 * Whether any hardcore campaign has ever been banked, on any difficulty. The
 * menu gates its HIGH SCORES row on this: the board is hardcore-only, so a
 * player who has only ever run softcore heroes (or not played at all) has
 * nothing to rank, and the row stays hidden until a hardcore hero has played a
 * campaign to its end (SURVIVED or FELL).
 */
export function hasCampaignScores(): boolean {
  return Object.values(scores).some((list) => list.length > 0);
}

/** The most foes felled in any banked campaign on this difficulty, or 0. */
export function bestKills(difficulty: Difficulty): number {
  return (scores[difficulty] ?? []).reduce(
    (best, score) => Math.max(best, score.kills),
    0,
  );
}

/**
 * Bank a finished hardcore campaign. Returns true when its kill total beats the
 * previous best for that difficulty (a new record) — the end-of-run splash
 * flags it. A campaign with no cleared level and no kills is ignored.
 */
export function recordCampaign(
  difficulty: Difficulty,
  score: CampaignScore,
): boolean {
  const kills = cleanNum(score.kills);
  const levels = cleanNum(score.levels);
  if (kills <= 0 && levels <= 0) return false;
  const record = kills > bestKills(difficulty);
  const list = scores[difficulty] ?? [];
  scores[difficulty] = trim([...list, sanitize(score)]);
  persist();
  return record;
}

// ---- Cloud save seam (cloud-save.ts) ------------------------------------------

/** The banked campaigns, for CLOUD SAVE to carry. */
export function campaignScoresSnapshot(): Record<string, CampaignScore[]> {
  const out: Record<string, CampaignScore[]> = {};
  for (const [difficulty, list] of Object.entries(scores)) {
    out[difficulty] = list.map(sanitize);
  }
  return out;
}

/** Trim a merged board back to the ranked keep list (cloud-save.ts). */
export function trimCampaignScores(list: CampaignScore[]): CampaignScore[] {
  return trim(list);
}

/** One banked campaign's identity — a campaign is a value, not a record with
 * an id, so two devices holding the same one dedupe on its whole content. */
export function campaignScoreKey(score: CampaignScore): string {
  return [
    score.name,
    score.at,
    score.kills,
    score.combatMs,
    score.peakMenace,
    score.levels,
    score.outcome,
    score.levelId ?? "",
  ].join("|");
}

/**
 * Fold another device's board into this one: the union of both, trimmed back to
 * the same per-metric keep list a local bank uses. A board is append-only —
 * campaigns are finished history, never edited — so a union is the whole merge
 * and nothing a device banked while offline can be lost. Returns true when the
 * local board actually gained something (the caller then persists a push).
 */
export function mergeCampaignScores(remote: unknown): boolean {
  if (!remote || typeof remote !== "object") return false;
  let changed = false;
  for (const [difficulty, value] of Object.entries(
    remote as Record<string, unknown>,
  )) {
    if (!Array.isArray(value)) continue;
    const incoming = value.filter(isCampaignScore).map(sanitize);
    if (incoming.length === 0) continue;
    const mine = scores[difficulty] ?? [];
    const seen = new Set(mine.map(campaignScoreKey));
    const fresh = incoming.filter(
      (score) => !seen.has(campaignScoreKey(score)),
    );
    if (fresh.length === 0) continue;
    scores[difficulty] = trim([...mine, ...fresh]);
    changed = true;
  }
  if (changed) persist();
  return changed;
}

/** Order two rows for a ranking metric, best first. */
function compareRows(
  metric: ScoreMetric,
  a: CampaignRow,
  b: CampaignRow,
): number {
  switch (metric) {
    case "kills":
      return b.kills - a.kills;
    case "time":
      return b.combatMs - a.combatMs;
    case "kpm":
      return b.kpm - a.kpm;
    case "menace":
      return b.peakMenace - a.peakMenace;
  }
}

/**
 * The board for a difficulty, ranked by `metric` (most mobs killed, longest
 * survival, highest kills-per-minute, or highest menace reached), best first
 * and capped at `limit` rows.
 */
export function topCampaigns(
  difficulty: Difficulty,
  metric: ScoreMetric,
  limit = 5,
): CampaignRow[] {
  const rows: CampaignRow[] = (scores[difficulty] ?? []).map((score) => ({
    ...score,
    kpm: killsPerMinute(score),
  }));
  rows.sort((a, b) => compareRows(metric, a, b));
  return rows.slice(0, limit);
}
