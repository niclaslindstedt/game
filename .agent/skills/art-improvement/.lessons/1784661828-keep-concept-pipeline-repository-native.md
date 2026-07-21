---
title: Keep image-to-YAML conversion repository-native without committing concept binaries
date: 2026-07-21
---

For a generated-concept redraw, create the exact acceptance prompt with
`sprite-author.mjs prompt`, keep the selected raster in an ignored preview or
scratch location, and feed it through `sprite-author.mjs analyze`. The refined
YAML grid is the committed, reviewable source of truth; do not commit the large
generated reference or provenance files by default. If an image generator
returns chroma-key art but `analyze` requires alpha, treat chroma ingestion as a
missing repository-tool feature to add rather than normalizing an ad-hoc
converter as the workflow.
