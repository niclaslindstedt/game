#!/usr/bin/env node
// Print the lines of CHANGELOG.md that belong to a single version's
// section. Used by the Release workflow to feed the GitHub Release
// body without dragging the whole history along.
//
// Usage: node scripts/release/extract-section.mjs <version> [options]
//
//   --max-chars=<n>   cap the body at n characters (default: GitHub's
//                     own 125,000-character release-body limit)
//   --repo-url=<url>  base repo URL for the "read the rest" link
//                     (default: repoUrl from game.config.json)
//
// Slices everything from `## [<version>]` up to (but not including)
// the next `## [` heading. Leading and trailing whitespace inside the
// slice are stripped so the output drops cleanly into `gh release
// create --notes-file`.
//
// THE CAP IS NOT COSMETIC. A GitHub Release body over 125,000
// characters is rejected with `HTTP 422: body is too long`, and
// because the release is created AFTER the commit and tag are pushed,
// that failure leaves a tagged version with no release and no Pages
// deploy (the deploy job `needs:` this one). v1.0.0 collated ~700
// fragments into a 270 KB section and did exactly that. So an
// over-long section is truncated at a line boundary and pointed at
// the full section in CHANGELOG.md on the tag itself, which is the
// permanent home of the notes anyway.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GITHUB_BODY_LIMIT = 125_000;

/**
 * Slice one version's section out of a CHANGELOG.md body.
 * Returns null when the version has no section.
 */
export function extractSection(md, version) {
  const out = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith(`## [${version}]`)) {
      inSection = true;
      continue; // drop the heading itself — the release page already shows it
    }
    if (inSection && /^## \[/.test(line)) break;
    if (inSection) out.push(line);
  }
  if (out.length === 0) return null;
  return out.join("\n").trim();
}

/**
 * Hold a release body under `limit` characters, cutting at a line
 * boundary and appending a pointer to the full section.
 */
export function capBody(body, { version, repoUrl, limit = GITHUB_BODY_LIMIT }) {
  if (body.length <= limit) return body;

  const url = `${repoUrl.replace(/\/+$/, "")}/blob/v${version}/CHANGELOG.md`;
  const notice = [
    "",
    "---",
    "",
    `These notes were too long for a GitHub Release body (over ${limit.toLocaleString("en-US")} characters), so they are truncated here.`,
    "",
    `**[Read the full changelog for v${version}](${url})**`,
    "",
  ].join("\n");

  // −1 for the newline that joins the kept notes to the notice.
  let kept = body.slice(0, Math.max(0, limit - notice.length - 1));
  // Cut back to a line boundary so the body never ends mid-sentence…
  const lastBreak = kept.lastIndexOf("\n");
  if (lastBreak > 0) kept = kept.slice(0, lastBreak);
  // …and drop any trailing heading or blank line the cut left dangling,
  // which would otherwise read as an empty section.
  kept = kept.replace(/(\n\s*(#{1,6} .*)?)+$/, "");

  return kept + "\n" + notice;
}

/** Read the default repo URL from the one source of game identity. */
function defaultRepoUrl() {
  const url = new URL("../../game.config.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).repoUrl;
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const version = args[0];
  if (!version) {
    console.error(
      "usage: extract-section.mjs <version> [--max-chars=N] [--repo-url=URL]",
    );
    process.exit(2);
  }
  const flag = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const limit = Number(flag("max-chars") ?? GITHUB_BODY_LIMIT);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error(
      `--max-chars must be a positive number, got '${flag("max-chars")}'`,
    );
    process.exit(2);
  }
  const repoUrl = flag("repo-url") ?? defaultRepoUrl();

  const section = extractSection(readFileSync("CHANGELOG.md", "utf8"), version);
  if (section === null) {
    console.error(`No section found in CHANGELOG.md for version ${version}`);
    process.exit(1);
  }
  const body = capBody(section, { version, repoUrl, limit });
  if (body.length < section.length) {
    console.error(
      `note: v${version} notes truncated from ${section.length} to ${body.length} characters (limit ${limit})`,
    );
  }
  // A truncated body already ends with the notice's own newline; adding
  // a second would push it one character past the limit it was cut to.
  process.stdout.write(body.endsWith("\n") ? body : body + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
