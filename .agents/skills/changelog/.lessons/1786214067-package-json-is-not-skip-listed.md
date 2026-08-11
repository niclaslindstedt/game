---
title: A dependency-audit PR needs the `no-changelog` label the moment it touches a package.json — only package-lock.json is skip-listed
date: 2026-08-08
scope: package.json, native/package.json, electron/package.json, pwa/package.json, scripts/release/check-changeset.mjs
concepts: [no-changelog, skip-list, dependencies, false-red, changeset]
---

`package-lock.json` is on `check-changeset.mjs`'s skip-list; `package.json` is
not. So a lockfile-only `npm audit fix` sails through with no fragment and no
label, but the moment the same security pass adds an `overrides` block — which
is how a transitive advisory with "no fix available" actually gets fixed — the
changeset job demands one. The answer is the label, never an invented fragment:
a dev/build-tooling dependency bump is nothing a player can notice.
