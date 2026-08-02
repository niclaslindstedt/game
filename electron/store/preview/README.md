# Steam page preview

Internal visual QA for the Steam listing. It deliberately resembles the public
store hierarchy but is not uploaded to Steam and is visibly marked as a
preview. The reusable source copy lives in `../listing.md`.

Serve the repository root so image paths resolve, then open:

```sh
python3.12 -m http.server 8765
# http://127.0.0.1:8765/electron/store/preview/
```

The screenshot gallery is interactive. Review the page at 1440×1200 or taller,
then scroll through the About and requirements sections. This preview is not an
embedded About-image asset: Valve forbids uploaded description images that
mimic Steam UI.
