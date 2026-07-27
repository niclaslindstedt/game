---
type: Fixed
title: The sitemap now reports when each page really changed
---

Every URL in `sitemap.xml` carried the build's own timestamp, so a privacy policy nobody had touched claimed a fresh modification date on every deploy — the pattern search engines use to decide the whole `lastmod` field is untrustworthy and ignore it. Each entry now derives its date from the last commit that touched the page's sources, and the SEO check fails the build on a `lastmod` that is malformed or in the future, or on a listed URL the build doesn't emit.
