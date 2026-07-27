// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The single source of truth for the game's brand identity — title, tagline,
// domain, storage/cache prefixes, and the marketing copy the discovery
// surfaces (title tag, OG/Twitter cards, JSON-LD, the prerendered shell) all
// read from. Nothing brand-shaped should be re-hardcoded elsewhere: renaming
// the game for a sequel is editing `game.config.json` at the repo root and
// regenerating icons/OG art.
//
// The raw data lives in `game.config.json` (repo root) so node build scripts
// (SEO/OG generators) can import the very same values without a TS toolchain.
// This module re-exports it as typed constants for the app + build plugin.

import config from "../../game.config.json";

export type GameIdentity = {
  /** Display title. */
  title: string;
  /** PWA short_name / home-screen label. */
  shortName: string;
  /** One-line tagline (sentence case), appended after the title with an em dash. */
  tagline: string;
  /** Full marketing description (≤160 chars for meta description). */
  description: string;
  /** Shorter description used by the manifest. */
  shortDescription: string;
  /**
   * The game's genres, as the `VideoGame` JSON-LD reports them to search
   * engines. Plain words a person would search for, not internal taxonomy.
   */
  genre: string[];
  /** Absolute origin, no trailing slash (e.g. the deployed site URL). */
  siteUrl: string;
  /**
   * The App Store product page, once there is one — the native build is the
   * fuller game (haptics, Game Center, cross-device saves), so it is what the
   * library's pages send a reader to. EMPTY until the app is published: a
   * surface that reads this renders no store link at all rather than a guess,
   * because a dead link on four hundred pages is worse than no link on any.
   * Filling this in is the whole of turning them on.
   */
  appStoreUrl: string;
  /** Source repository URL. */
  repoUrl: string;
  author: { name: string; url: string };
  /** localStorage key prefix, namespacing all persisted keys. */
  storagePrefix: string;
  /** Precache cache-id prefix (e.g. `foo` → `foo`, `foo-preview`). */
  cacheIdPrefix: string;
  /** Alt text for the OG card image. */
  ogImageAlt: string;
  /** Text baked into the generated OG card art. */
  og: { logo: string; tagline: string; subtitle: string };
  /** Paragraphs of the prerendered (SSR) launch shell. */
  heroParagraphs: string[];
};

export const IDENTITY: GameIdentity = config;

/** `${title} — ${tagline}`: the canonical page title / OG title. */
export const FULL_TITLE = `${IDENTITY.title} — ${IDENTITY.tagline}`;

/** A namespaced localStorage key, `<storagePrefix>:<name>`. */
export function storageKey(name: string): string {
  return `${IDENTITY.storagePrefix}:${name}`;
}
