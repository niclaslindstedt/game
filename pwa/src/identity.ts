// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The single source of truth for the game's brand identity — title, tagline,
// domain, storage/cache prefixes, and the copy the page surfaces (title tag,
// meta description, OG/Twitter cards, the prerendered shell) all read from. Nothing brand-shaped should be re-hardcoded elsewhere: renaming
// the game for a sequel is editing `game.config.json` at the repo root and
// regenerating icons/OG art.
//
// The raw data lives in `game.config.json` (repo root) so node build scripts
// (the OG and library generators) can import the very same values without a TS toolchain.
// This module re-exports it as typed constants for the app + build plugin.

import config from "../../game.config.json" with { type: "json" };

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
   * A STRANGER'S voice, as opposed to the brand voice above.
   *
   * `title`/`tagline` are what the GAME calls itself — they are drawn on the
   * title screen (`TitleScreen.tsx`) and baked into the OG card art, so they
   * are written to be read by someone already looking at the game. A shared
   * link lands in front of someone who is not, and "survive the search for
   * your lost love" tells them nothing about what they would be opening.
   *
   * These two say what the thing IS — the genre, the platform, the price —
   * and feed the meta description and the share cards ONLY. Keeping them
   * apart is what lets the title screen stay poetry while a pasted link still
   * explains itself. (The site is not meant to be found through search: every
   * page carries `noindex`, by owner decision.)
   */
  share: {
    /**
     * Appended after the title with an em dash to form the OG / Twitter card
     * title (`SOCIAL_TITLE`). Keep the whole result under ~60 characters —
     * an unfurl truncates past that — and lead with what the thing IS, not
     * what happens in it. The `<title>` is the brand alone: see `SOCIAL_TITLE`.
     */
    titleSuffix: string;
    /** The share-card blurb (≤160 chars): what it is first, the hook second. */
    description: string;
  };
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
  /**
   * The Steam store page, once there is one. Its own field rather than a
   * second use of `appStoreUrl`: the two listings are different products to
   * pitch (Steam has Cloud saves and achievements, no haptics and no Game
   * Center) and a reader on a desktop wants the desktop one. Same rule as
   * above — EMPTY until the app is published, and nothing renders a guess.
   */
  steamUrl: string;
  /** Source repository URL. */
  repoUrl: string;
  author: { name: string; url: string };
  /**
   * The house the game ships under — the name on the studio card the app opens
   * with (`game/SplashScreen.tsx`), drawn in the menu's own pixel font.
   *
   * Its own field rather than a second use of `author.name`: the author is the
   * PERSON, credited in the JSON-LD and on the library's pages, and a studio
   * card that says a person's name reads as a mistake. Drawn upper-cased, so
   * write it however it is written everywhere else.
   */
  publisher: string;
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
   * home page had 154 words on it: everything a stranger wants to know — the
   * genre, the controls, the venues, the price — was nowhere on it. Write them
   * plainly and in the present tense; this is the copy a newcomer reads, not
   * the title screen's voice.
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
   * The questions the shell answers.
   *
   * These are the SHAPE the questions actually arrive in — "is it free", "does it
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
 * `${title} — ${share.titleSuffix}`: the OG / Twitter card title, in a
 * stranger's voice. Deliberately NOT `FULL_TITLE` — see `GameIdentity.share`.
 *
 * The `<title>` is deliberately NOT this: a browser tab is ~20 characters wide,
 * so a suffix there is never read — it is truncated to an ellipsis while eating
 * the room the brand needs. A card unfurl has a full line and no such squeeze,
 * which is where the stranger's voice still earns its place.
 */
export const SOCIAL_TITLE = `${IDENTITY.title} — ${IDENTITY.share.titleSuffix}`;

/** The meta / OG / Twitter description, in a stranger's voice. See `GameIdentity.share`. */
export const SHARE_DESCRIPTION = IDENTITY.share.description;

/** A namespaced localStorage key, `<storagePrefix>:<name>`. */
export function storageKey(name: string): string {
  return `${IDENTITY.storagePrefix}:${name}`;
}
