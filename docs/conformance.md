# Conformance

Where Ada's Trail knowingly falls short of a rule it is built by — one row per
rule, with the verdict, the evidence, what closing the gap costs, and the date
it was last checked. A row with no date is an opinion.

**Verdicts:** ⊘ a deliberate deviation, decided by the owner · ◐ partly met ·
✗ not met yet.

Close a row by fixing the gap and deleting the row, in the same commit. Open one
when a change has to leave a gap behind. Everything not listed here is believed
met, as of the dates below.

| Rule  | Verdict | Evidence                                                                                                                                                                                                                              | What closing it costs                                                                                                                                   | Checked    |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| G3.10 | ⊘       | 42 source files are over the 1000-line cap. Each carries `guidelines:allow-large-file: split when next touched; known deviation by owner decision`, and `tests/file_size_test.ts` holds every other file to the cap.                  | Splitting each by concern the next time a change touches it, and dropping its marker. No file is split for its own sake.                                | 2026-09-28 |
| G3.13 | ◐       | The Steam capsules were drawn with an image model from prompts kept in `tauri/store/capsules/PROMPTS.md`, not as versioned files under `prompts/`; the approved art was iterated past those prompts and the final ones were not kept. | An owner call on whether store key art counts as a prompt the game versions; if it does, the next capsule revision records its prompt under `prompts/`. | 2026-09-28 |
| G15.5 | ◐       | `provenance.json` records every asset family, but the capsules' image model is not named anywhere, and which sprite grids were traced from a model's draft (the `sprite-author.mjs` path) was never recorded.                         | Naming the model at the next capsule revision, and recording a traced sprite in its entry when one is next made.                                        | 2026-09-28 |
| G8.6  | ✗       | `native/assets/{icon,splash-icon,favicon}.png` were rasterised from `pwa/public/icon.svg` by hand; `make icons` regenerates the web and desktop icons but not these.                                                                  | Teaching the icon command to write the phone app's three rasters, then checking it leaves a clean tree clean.                                           | 2026-09-28 |
| G21.3 | ✗       | The Steam store page's words are drafted in the committed `tauri/store/listing.md`; the App Store listing's words are already out of the repository (`native/store/copy.mts`, gitignored).                                            | Moving the Steam words out beside the App Store's, once Steam has a store record and the generator writes its page.                                     | 2026-09-28 |
| G21.7 | ◐       | The App Store copy (kept outside the repository) says "no account" in its promotional text, description and review notes. Whether a listing may say so is an open owner decision; the words are left as they were until it is made.   | Nothing until the decision; then either nothing, or rewording those three places.                                                                       | 2026-09-28 |
