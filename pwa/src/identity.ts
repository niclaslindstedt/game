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
   * SEARCH voice, as opposed to the brand voice above.
   *
   * `title`/`tagline` are what the GAME calls itself — they are drawn on the
   * title screen (`TitleScreen.tsx`) and baked into the OG card art, so they
   * are written to be read by someone already looking at the game. That makes
   * them the wrong strings to be indexed on: nobody searches "survive the
   * search for your lost love", and the brand alone loses the query it shares
   * with a television franchise.
   *
   * These two carry the words a stranger actually types — the genre, the
   * platform, the price — and feed the `<title>`, the meta description, and
   * the social cards ONLY. Keeping them apart is what lets the title screen
   * stay poetry while the search result stays findable; collapsing them back
   * into one field means one of the two jobs gets done badly.
   */
  seo: {
    /**
     * Appended after the title with an em dash to form the `<title>`. Keep the
     * whole result under ~60 characters — Google truncates past that — and
     * lead with what the thing IS, not what happens in it.
     */
    titleSuffix: string;
    /** The search snippet (≤160 chars): what it is first, the hook second. */
    description: string;
  };
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
  /**
   * The prerendered shell's BODY, below the boot console — the part written for
   * somebody who has not decided yet.
   *
   * `heroParagraphs` is the pitch and stays short. These are the sections under
   * it, each a heading and a couple of paragraphs, and they exist because the
   * home page is the site's strongest URL and had 154 words on it: everything a
   * stranger might type — the genre, the controls, the venues, the price — was
   * reachable only through the `<title>` and the meta description. Write them
   * plainly and in the present tense; this is the copy a search snippet is cut
   * from, not the title screen's voice.
   *
   * `list` names a generated list to render inside the section — today only
   * `"venues"`, the campaign in order, read from the level catalog rather than
   * typed in here so a venue that gets renamed, added or cut cannot leave a
   * stale name on the front page. The names are registered in `SHELL_LISTS`
   * (`pwa-plugin.ts`), which FAILS THE BUILD on one it does not know; that is
   * why this is a plain `string` and not a union — the JSON import widens it
   * either way, so the check that catches a typo has to be a runtime one, and
   * having two of them would just mean the union is the one that rots.
   */
  sections: { heading: string; list?: string; paragraphs: string[] }[];
  /**
   * The questions the shell answers, and the `FAQPage` JSON-LD built from them.
   *
   * These are the SHAPE the queries actually arrive in — "is it free", "does it
   * work offline", "do I need an account" — and every answer already existed
   * somewhere on the site (the privacy page, the hero paragraphs, the in-game
   * how-to-play copy) without ever being phrased as the question. Keep an answer
   * to a sentence or two and make it answer the question in its first clause.
   */
  faq: { q: string; a: string }[];
};

export const IDENTITY: GameIdentity = config;

/**
 * `${title} — ${tagline}`: the game's own full name, in brand voice. Used where
 * the reader already has the game in front of them — the PWA manifest's `name`,
 * which is what an install prompt and a home-screen launcher show.
 */
export const FULL_TITLE = `${IDENTITY.title} — ${IDENTITY.tagline}`;

/**
 * `${title} — ${seo.titleSuffix}`: the `<title>` / OG / Twitter title, in search
 * voice. Deliberately NOT `FULL_TITLE` — see `GameIdentity.seo`.
 */
export const SEO_TITLE = `${IDENTITY.title} — ${IDENTITY.seo.titleSuffix}`;

/** The meta / OG / Twitter description, in search voice. See `GameIdentity.seo`. */
export const SEO_DESCRIPTION = IDENTITY.seo.description;

/** A namespaced localStorage key, `<storagePrefix>:<name>`. */
export function storageKey(name: string): string {
  return `${IDENTITY.storagePrefix}:${name}`;
}
