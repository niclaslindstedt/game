// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE LISTING'S RULES — everything about the submission that is not the
// marketing copy. Committed; the copy is not.
//
// THE SPLIT IS ABOUT ONE FACT: the game is sold on the App Store and its source
// is public. Those two only pull against each other over the listing's WORDS. A
// product page's description, subtitle, promotional text, keyword set and the
// notes App Review reads are what a store indexes and a competitor reads, and
// publishing them in a public repository puts the listing's own prose on a
// crawlable page somewhere else. Nothing in this file has that problem: a
// category, an age-rating answer, a field limit and a cross-check are all
// better off in the open, where anyone reviewing the game can see them.
//
//   listing.mts        THIS FILE. The types of the copy, the categories, the
//                      age-rating questionnaire, the review contact, the
//                      release policy and which storefronts the generator
//                      writes. Committed.
//   copy.mts           Every word a reader of the listing sees, and the review
//                      notes. GITIGNORED — it is put here by whoever uploads
//                      the listing, from a copy kept outside the checkout.
//   copy.example.mts   The committed skeleton of copy.mts: its shape, with
//                      placeholder text that is deliberately not marketing.
//
// Compiled by `make store-metadata` (scripts/generate-store-metadata.mjs) into
// native/store/store.config.json for `eas metadata:push` and the
// native/fastlane/metadata tree for `fastlane deliver` — gitignored build
// output, never edited. The generator compiles whichever copy module is present
// and says which; `make store-preflight` reports a listing built from the
// skeleton as outstanding work.
//
// TWO MORE KINDS OF FIELD, NEITHER OF WHICH IS HERE:
//
//   COMPOSED    the listing title, the marketing URL, the privacy-policy URL
//               and the copyright line, which the generator takes from
//               game.config.json and the game's pages on apps.agilator.se, so
//               a rename reaches the store listing the way it reaches the
//               manifest and the app's name.
//   OUT OF BAND the App Store review PHONE NUMBER. Apple rings it and this
//               repository is public, so it comes from ASC_REVIEW_PHONE in the
//               gitignored native/.env (or the environment). The value below
//               is a placeholder the generator never uploads.
//
// Every length limit is Apple's, and the generator FAILS on an overrun — App
// Store Connect truncates silently instead of telling you.

/** One App Store locale's product page — the WORDS, authored in `copy.mts`. */
export type AppleInfo = {
  /** ≤ 30. Sits under the name on the product page, and is indexed. */
  subtitle: string;
  /** ≤ 170. The one field that changes without shipping a build. */
  promoText: string;
  /** 10–4000. The first two lines are all the store shows before "more". */
  description: string;
  /** The JOINED, comma-separated string must fit 100 characters. */
  keywords: string[];
  /** ≤ 4000. The product page's "What's New". */
  releaseNotes: string;
};

/** What a `copy.mts` (or the committed `copy.example.mts`) exports. */
export type ListingCopy = {
  /** The product page, one entry per locale; the primary one is required. */
  APPLE_INFO: Record<string, AppleInfo>;
  /** 2–4000. What App Review is told before it opens the app. */
  APPLE_REVIEW_NOTES: string;
};

type AdvisoryLevel = "NONE" | "INFREQUENT_OR_MILD" | "FREQUENT_OR_INTENSE";

export const LISTING = {
  /** Bumped only when Expo changes the store.config schema. */
  configVersion: 0,

  // Which storefronts this generator writes a listing for. A storefront is
  // declared only once it has a store record and a build to put behind it.
  // Steam has neither yet (tauri/store/steam.json carries no app id), and the
  // Mac App Store build is not made, so the App Store is the only one.
  storefronts: { appStore: true, macAppStore: false, steam: false },

  apple: {
    /** The locale the listing is primarily authored in; `copy.mts` must have it. */
    primaryLocale: "en-US",

    // REQUIRED by Apple and it must be an http(s) URL (a mailto: is refused),
    // so it is the game's support page on the company's apps site — never the
    // source repository or the web edition's domain, which the generator
    // refuses in any field.
    supportUrl: "https://apps.agilator.se/adas-trail/support/",

    // Where the app files on the store. The first entry is the primary
    // category; a nested array is [category, subcategory, subcategory].
    categories: [
      ["GAMES", "GAMES_ACTION", "GAMES_ROLE_PLAYING"],
      "ENTERTAINMENT",
    ],

    // The age-rating questionnaire. These answers decide the rating badge, and
    // a wrong one is a rejection — so every answer that is not NONE says why.
    advisory: {
      // Constant pixel combat against ghosts, machines and gunslingers, with
      // stylized blood and gore bursts. Fantasy, but frequent and central.
      violenceCartoonOrFantasy: "FREQUENT_OR_INTENSE",
      // Nothing depicts realistic human violence.
      violenceRealistic: "NONE",
      violenceRealisticProlongedGraphicOrSadistic: "NONE",
      // A haunted moon, ghosts, and a missing-person plot — atmosphere rather
      // than shocks.
      horrorOrFearThemes: "INFREQUENT_OR_MILD",
      // The answer the listing was first filed with. The shipped lines carry
      // no profanity; the satire's humour (the corporate horde, the knockoff
      // western) is the only candidate for "crude", and that is mild and
      // occasional. Lower it to NONE if a read of the manuscript agrees.
      profanityOrCrudeHumor: "INFREQUENT_OR_MILD",
      matureOrSuggestiveThemes: "NONE",
      sexualContentOrNudity: "NONE",
      sexualContentGraphicAndNudity: "NONE",
      alcoholTobaccoOrDrugUseOrReferences: "NONE",
      medicalOrTreatmentInformation: "NONE",
      // In-game coins bought with real money are an in-app purchase, not
      // simulated gambling: nothing is wagered and no outcome is randomized
      // against a stake.
      gamblingSimulated: "NONE",
      gambling: false,
      contests: "NONE",
      // The WebView serves the copy of the site bundled inside the app from a
      // local HTTP server; it is not a browser and cannot be steered elsewhere.
      unrestrictedWebAccess: false,
      kidsAgeBand: null,
    } satisfies Record<string, AdvisoryLevel | boolean | null>,

    // Who App Review contacts. The notes themselves are copy (`copy.mts`).
    review: {
      firstName: "Niclas",
      lastName: "Lindstedt",
      email: "niclas@agilator.se",
      // A PLACEHOLDER ON PURPOSE — see OUT OF BAND above. `reviewPhone()` in
      // scripts/asset-tools/app-store-connect.mjs resolves the real one, and
      // the generator drops the field rather than upload this.
      phone: "+46000000000",
      demoRequired: false,
    },

    // What happens once review approves: the build waits for a person to press
    // release — a first launch should not go live from an approval at 3am.
    release: {
      automaticRelease: false,
      phasedRelease: false,
    },
  },
};
