#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compile the hand-authored App Store listing (native/store/listing.yaml) into
// native/store/store.config.json — the file `eas metadata:push` uploads to App
// Store Connect. Same shape as every other catalog in this repo: committed
// YAML is the source of truth, the JSON is a gitignored build output, and the
// generator is where the rules live.
//
// It does three jobs the YAML alone can't:
//
//  1. COMPOSES the brand-shaped fields from game.config.json — the listing
//     title, the marketing URL, the privacy-policy URL, and the copyright
//     line — so a rename flows into the store listing the way it flows into
//     the manifest and the app name, instead of being re-typed here.
//
//  2. VALIDATES every Apple length limit and FAILS the build on an overrun.
//     App Store Connect silently truncates an over-long subtitle or promo
//     text; the keyword field is the nastiest, because the 100-char budget is
//     spent on the COMMA-JOINED string, not per keyword. Finding that out
//     from a truncated live listing is the bad path.
//
//  3. Checks the listing against the app it describes — the bundle id and the
//     IAP product ids named in the review notes must be the ones the code
//     actually ships, or review reads instructions that don't match the build.
//
// Usage:
//   make store-metadata          # write native/store/store.config.json
//   node scripts/generate-store-metadata.mjs --check   # validate only

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const LISTING = here("../native/store/listing.yaml");
const OUT = here("../native/store/store.config.json");

const identity = JSON.parse(readFileSync(here("../game.config.json"), "utf8"));
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8"));

const errors = [];
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------
// Apple's limits. Every one of these is enforced by App Store Connect at
// upload time; enforcing them here turns a failed submission into a failed
// build, which is a much cheaper place to find out.
// ---------------------------------------------------------------------------
const LIMITS = {
  title: { min: 2, max: 30 },
  subtitle: { max: 30 },
  description: { min: 10, max: 4000 },
  promoText: { max: 170 },
  releaseNotes: { max: 4000 },
  marketingUrl: { max: 255 },
  supportUrl: { max: 255 },
  privacyPolicyUrl: { max: 255 },
  // The JOINED, comma-separated keyword string — not each keyword.
  keywordsJoined: { max: 100 },
  reviewNotes: { min: 2, max: 4000 },
};

function checkLength(field, value, limit) {
  if (typeof value !== "string") return;
  const n = value.length;
  if (limit.max !== undefined && n > limit.max) {
    fail(`${field}: ${n} chars — Apple's limit is ${limit.max}`);
  }
  if (limit.min !== undefined && n < limit.min) {
    fail(`${field}: ${n} chars — Apple requires at least ${limit.min}`);
  }
}

// ---------------------------------------------------------------------------
// Load the authored listing.
// ---------------------------------------------------------------------------
const listing = parse(readFileSync(LISTING, "utf8"));
if (!listing || typeof listing !== "object") {
  console.error("generate-store-metadata: listing.yaml is not a YAML mapping");
  process.exit(1);
}
if (!listing.apple?.info?.["en-US"]) {
  console.error(
    "generate-store-metadata: listing.yaml has no apple.info['en-US']",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Compose. Brand-shaped values come from game.config.json — never from the
// listing — so there is exactly one place a rename has to happen.
// ---------------------------------------------------------------------------
const year = new Date().getFullYear();

const info = {};
for (const [locale, authored] of Object.entries(listing.apple.info)) {
  const keywords = authored.keywords ?? [];
  info[locale] = {
    // Composed, not authored.
    title: identity.title,
    // NO marketingUrl on purpose: it is Apple's only optional URL field, and
    // filling it with the site would point every store visitor at the free web
    // build. See the note in listing.yaml.
    // The page pwa-plugin.ts emits from pwa/src/PrivacyPage.tsx. Apple treats
    // this field as required; the URL must actually resolve at review time.
    privacyPolicyUrl: `${identity.siteUrl}/privacy/`,
    // Authored.
    ...authored,
    keywords,
  };

  const i = info[locale];
  const at = (field) => `apple.info.${locale}.${field}`;
  checkLength(at("title"), i.title, LIMITS.title);
  checkLength(at("subtitle"), i.subtitle, LIMITS.subtitle);
  checkLength(at("description"), i.description, LIMITS.description);
  checkLength(at("promoText"), i.promoText, LIMITS.promoText);
  checkLength(at("releaseNotes"), i.releaseNotes, LIMITS.releaseNotes);
  checkLength(at("supportUrl"), i.supportUrl, LIMITS.supportUrl);
  checkLength(
    at("privacyPolicyUrl"),
    i.privacyPolicyUrl,
    LIMITS.privacyPolicyUrl,
  );

  if (!Array.isArray(keywords) || keywords.length === 0) {
    fail(`${at("keywords")}: at least one keyword is required`);
  } else {
    const joined = keywords.join(",");
    checkLength(
      `${at("keywords")} (joined "${joined}")`,
      joined,
      LIMITS.keywordsJoined,
    );
    const dupes = keywords.filter((k, n) => keywords.indexOf(k) !== n);
    if (dupes.length) {
      fail(`${at("keywords")}: duplicated — ${[...new Set(dupes)].join(", ")}`);
    }
    // A keyword already in the title or subtitle is indexed anyway; spending
    // part of a 100-char budget on it a second time is pure waste.
    const spent = `${i.title} ${i.subtitle ?? ""}`.toLowerCase();
    const wasted = keywords.filter((k) => spent.includes(k.toLowerCase()));
    if (wasted.length) {
      console.warn(
        `generate-store-metadata: warning — ${at("keywords")} repeats a word ` +
          `already in the title/subtitle (indexed regardless): ${wasted.join(", ")}`,
      );
    }
  }
}

const review = listing.apple.review ?? {};
checkLength("apple.review.notes", review.notes, LIMITS.reviewNotes);
for (const required of ["firstName", "lastName", "email"]) {
  if (!review[required]) fail(`apple.review.${required} is required by Apple`);
}
if (review.phone && !review.phone.startsWith("+")) {
  fail("apple.review.phone must carry a country-code prefix (e.g. +46…)");
}

// ---------------------------------------------------------------------------
// Cross-check the listing against the app it describes. A review note that
// names a product id the build doesn't sell sends a reviewer looking for
// something that isn't there.
// ---------------------------------------------------------------------------
const appConfig = readFileSync(here("../native/app.config.js"), "utf8");
const bundleId = appConfig.match(/const BUNDLE_ID = "([^"]+)"/)?.[1];
if (!bundleId) {
  fail("could not read BUNDLE_ID from native/app.config.js");
}

const storeTs = readFileSync(here("../pwa/src/game/store.ts"), "utf8");
const skus = [...storeTs.matchAll(/sku:\s*"([^"]+)"/g)].map((m) => m[1]);
if (skus.length === 0) {
  fail("could not read any coin-pack sku from pwa/src/game/store.ts");
}
const notes = review.notes ?? "";
// The notes name the range as "coins_1m through coins_10b" — assert both ends
// still exist rather than demanding every id appear verbatim.
for (const edge of [skus[0], skus[skus.length - 1]]) {
  if (!notes.includes(edge)) {
    fail(
      `apple.review.notes doesn't mention the coin pack "${edge}" — the ` +
        `catalog in pwa/src/game/store.ts ships ${skus.length} packs ` +
        `(${skus.join(", ")}), and review reads these notes to find them`,
    );
  }
}

// ---------------------------------------------------------------------------
// Emit.
// ---------------------------------------------------------------------------
if (errors.length) {
  console.error("generate-store-metadata: the listing is not shippable\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}

const config = {
  configVersion: listing.configVersion ?? 0,
  // Keep the listing's version pinned to the game's, so "what's new" always
  // belongs to the build it ships beside.
  version: pkg.version,
  copyright: `${year} ${identity.author.name}`,
  apple: {
    info,
    ...(listing.apple.categories
      ? { categories: listing.apple.categories }
      : {}),
    ...(listing.apple.advisory ? { advisory: listing.apple.advisory } : {}),
    ...(listing.apple.review ? { review: listing.apple.review } : {}),
    ...(listing.apple.release ? { release: listing.apple.release } : {}),
  },
};

const json = `${JSON.stringify(config, null, 2)}\n`;

if (process.argv.includes("--check")) {
  console.log(
    `generate-store-metadata: listing is valid ` +
      `(${Object.keys(info).length} locale(s), bundle ${bundleId}, ` +
      `${skus.length} coin packs)`,
  );
} else {
  writeFileSync(OUT, json);
  const en = info["en-US"];
  console.log(
    `generate-store-metadata: wrote native/store/store.config.json\n` +
      `  title      ${en.title} (${en.title.length}/30)\n` +
      `  subtitle   ${en.subtitle} (${en.subtitle.length}/30)\n` +
      `  keywords   ${en.keywords.join(",")} (${en.keywords.join(",").length}/100)\n` +
      `  promo      ${en.promoText.length}/170 chars\n` +
      `  descr      ${en.description.length}/4000 chars\n` +
      `  privacy    ${en.privacyPolicyUrl}`,
  );
}
