# Steam page preview

Internal visual QA for the Steam listing. Its desktop proportions, dense
navigation, media rail, action strip, purchase box, two-column content flow,
feature cards, mature-content section, and operating-system tabs are calibrated
against current real Steam product pages. It is not uploaded to Steam and is
visibly marked as a preview. The reusable source copy lives in `../listing.md`.

Serve the repository root so image paths resolve, then open:

```sh
python3.12 -m http.server 8765
# http://127.0.0.1:8765/electron/store/preview/
```

Capture the entire page—not only the first viewport—with:

```sh
make store-page-shot
# electron/store/preview/output/steam-page-2000.png

make store-page-shot ARGS="--width 1440 --out /tmp/steam-page.png"
```

The screenshotter opens the checked-in page directly, waits for every image and
font, fails on browser or asset-load errors, and always passes `fullPage: true`
to Playwright. `--height` changes the working viewport height but never clips
the output to that viewport.

The screenshot gallery, arrows, and operating-system tabs are interactive.
Review the page at both 2000×1200 (the reference desktop density) and 1440×1200,
then scroll through the About, sidebar, mature-content, and requirements
sections. Dynamic Steam modules are represented only when the repository can
ground them: the preview does not invent broadcasts, user reviews, curator
quotes, discounts, awards, languages, events, or Steam Deck verification.

This preview is not an embedded About-image asset: Valve forbids uploaded
description images that mimic Steam UI.
