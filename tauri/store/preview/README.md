# Steam page preview

Internal visual QA for the Steam listing. Its desktop proportions, dense
navigation, media rail, action strip, purchase box, two-column content flow,
feature cards, mature-content section, and operating-system tabs are calibrated
against current real Steam product pages. It is not uploaded to Steam and is
visibly marked as a preview. The Steamworks settings it shows (features, tags,
requirements) live in `../listing.md`.

## The words

The page's words — the brief description, About This Game and the
mature-content description — are not in this repository, as the App Store
listing's are not (`native/store/copy.mts`): they are the page's own prose, and
a public copy would put it on a crawlable page somewhere else. The committed
`index.html` is a template whose word slots (`data-words`) hold placeholders;
`words.js` reads the real words from **`tauri/store/steam.md`, which is
gitignored**, and `app.js` puts them in the slots.

To review the page with its words, put the private copy of them there first.
The file is markdown: each slot is filled from the paragraphs under its `## `
heading — `Brief description`, `About This Game`, `Mature content
description` — and anything else in it (a preamble, other sections) is not
shown. `**bold**` is kept, and the page never interprets the words as HTML.
Without the file, or without one of those sections, the mock shows the
placeholder, and the strip at the top of the page says which it is showing.

`tests/steam_page_words_test.ts` holds this: the file stays ignored, the
committed slots hold only placeholders, and no tracked file carries a passage
of the words.

## Viewing and capturing it

Serve the repository root so image and word paths resolve, then open:

```sh
python3.12 -m http.server 8765
# http://127.0.0.1:8765/tauri/store/preview/
```

Capture the entire page—not only the first viewport—with:

```sh
make store-page-shot
# tauri/store/preview/output/steam-page-2000.png

make store-page-shot ARGS="--width 1440 --out /tmp/steam-page.png"
```

The screenshotter opens the checked-in page directly, hands it the words from
`tauri/store/steam.md` (or `--words <file>`) since a page opened from disk
cannot fetch them, waits for every image and font, fails on browser or
asset-load errors, prints which words it rendered, and always passes
`fullPage: true` to Playwright. `--height` changes the working viewport height but never clips
the output to that viewport.

The screenshot gallery, arrows, and operating-system tabs are interactive.
Review the page at both 2000×1200 (the reference desktop density) and 1440×1200,
then scroll through the About, sidebar, mature-content, and requirements
sections. Dynamic Steam modules are represented only when the repository can
ground them: the preview does not invent broadcasts, user reviews, curator
quotes, discounts, awards, languages, events, or Steam Deck verification.

This preview is not an embedded About-image asset: Valve forbids uploaded
description images that mimic Steam UI.
