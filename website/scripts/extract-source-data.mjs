#!/usr/bin/env node
// Extract project metadata from source so the app never goes stale (§11.2).
// Reads the authoritative manifests at the repository root and emits
// website/src/generated/sourceData.json for the app to import. Fails loudly
// if an expected marker is missing rather than silently emitting stale data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function fail(message) {
  console.error(`extract-source-data: ${message}`);
  process.exit(1);
}

const pkgPath = path.join(repoRoot, "package.json");
if (!fs.existsSync(pkgPath)) fail(`missing ${pkgPath}`);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (!pkg.version) fail("package.json has no version field");
if (!pkg.description) fail("package.json has no description field");

// The engine's version constant must agree with the manifest — the same
// invariant tests/version_test.ts guards, re-checked here so a website build
// cannot ship a mismatched version label.
const versionTs = fs.readFileSync(
  path.join(repoRoot, "src", "version.ts"),
  "utf8",
);
const m = versionTs.match(/engineVersion = "([^"]+)"/);
if (!m) fail("src/version.ts no longer declares engineVersion");
if (m[1] !== pkg.version)
  fail(`src/version.ts (${m[1]}) disagrees with package.json (${pkg.version})`);

const changelog = fs.readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");

const out = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  changelogHead: changelog.split("\n").slice(0, 40).join("\n"),
};

const dest = path.join(here, "..", "src", "generated");
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(
  path.join(dest, "sourceData.json"),
  JSON.stringify(out, null, 2),
);
console.log("wrote src/generated/sourceData.json");
