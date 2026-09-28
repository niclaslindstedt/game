// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE COPY'S SHAPE — a committed skeleton, not a listing.
//
// The real words live in `copy.mts` beside this, which is GITIGNORED: the
// description, subtitle, promo text, keywords and review notes are what the
// store indexes and what a competitor reads, so publishing them would put the
// listing's own prose on a crawlable page somewhere else. `listing.mts`
// explains the split.
//
// THIS FILE IS DELIBERATELY NOT WRITING. Every string below is a placeholder
// naming what belongs there, short enough that nobody could mistake it for
// marketing and long enough to satisfy the field limits, so a fresh clone
// typechecks and `make store-metadata` runs end to end. Do not improve the
// prose here — that would recreate, one adjective at a time, exactly what the
// split exists to avoid.
//
//   cp native/store/copy.example.mts native/store/copy.mts
//   # …then write the real words, and keep them somewhere outside this checkout.

import type { AppleInfo } from "./listing.mts";

const EN_US: AppleInfo = {
  // ≤ 30. Indexed for search as well as read, so it earns its keywords.
  subtitle: "SUBTITLE — the hook, 30",

  // ≤ 170. The one field that changes without shipping a build.
  promoText:
    "PROMO TEXT — what is newsy this month, and nothing load-bearing. Up to 170 characters.",

  // 10–4000. The first two lines are all the store shows before "more".
  description: `DESCRIPTION — the hook in the first two lines, then what the
player actually does, then what makes this one unusual. Up to 4000 characters,
read on a phone.`,

  // The JOINED string is what must fit 100 characters, not each term.
  keywords: ["keyword", "budget", "spent", "joined"],

  // ≤ 4000. The product page's "What's New".
  releaseNotes:
    "RELEASE NOTES — what changed, for the version this ships beside.",
};

/** The App Store product page, one entry per locale. */
export const APPLE_INFO: Record<string, AppleInfo> = { "en-US": EN_US };

/**
 * What App Review is told before it opens the app.
 *
 * A WebView-shaped app is judged under guideline 4.2 (minimum functionality),
 * and these notes are the argument that this one is not a browser pointed at a
 * website. The generator checks them against the build: they must name the
 * first and last coin pack `pwa/src/game/store.ts` sells.
 */
export const APPLE_REVIEW_NOTES = `REVIEW NOTES — how to start playing and how
to play in two sentences; that the whole game ships inside the binary and runs
in airplane mode (guideline 4.2); what the native layer adds; what is sold (the
coin packs coins_1m through coins_10b), why there is no Restore button, and
where cloud save lives; what leaves the device; and the privacy page:
https://apps.agilator.se/adas-trail/privacy/`;
