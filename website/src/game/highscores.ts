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

import { type Difficulty } from "@game/core";

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
  return [...kept];
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
