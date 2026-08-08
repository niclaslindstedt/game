// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title screen's bottom-right stamp: WHICH BUILD THIS IS.
//
// Two states, decided entirely at build time so the released bundle carries
// neither the other one's markup nor its strings:
//
//   PLAIN TEXT   the released site and every store build — `v1.0.0`, plus the
//                short commit wherever the developer tooling ships.
//   A LINK       the `/preview/` and `/branch/` slots, where the footer's hash
//                stops being a thing to read out and becomes a thing to
//                follow: it opens the exact commit the build was cut from.
//
// The second state is why this is a module rather than four lines inside
// TitleScreen.tsx. `/preview/` and `/branch/` are looked at by the person who
// pushed the commit — that is the whole purpose of the two slots — and the
// question they ask of a build ("is this MY change, or did I beat the deploy
// here?") was a hash to copy, a repo to open and a search box to paste it
// into. It is now a tap. Every other reader gets the text they always got.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";

/**
 * The stamp itself. The build's commit rides beside the version everywhere the
 * developer tooling ships — web, PWA, preview/branch slots, local builds,
 * TestFlight. The production store build prints the bare version (the hash
 * isn't embedded there at all).
 *
 * A module constant, not a render-time expression: both halves are build-time
 * literals, so this folds to one string in the bundle.
 */
const VERSION_TEXT = __DEV_TOOLS__
  ? `v${__APP_VERSION__} · ${__BUILD_COMMIT__}`
  : `v${__APP_VERSION__}`;

export function TitleFooter({ font }: { font: PixelFont }) {
  // The same canvas either way — the link wraps the stamp rather than
  // restyling it, so the footer reads identically on every slot and only its
  // hover/focus states give the link away.
  const stamp = (
    <PixelText font={font} text={VERSION_TEXT} scale={2} color="#7a8088" />
  );
  return (
    <footer className="title-footer">
      {__BUILD_COMMIT_URL__ ? (
        <a
          className="title-version-link"
          href={__BUILD_COMMIT_URL__}
          // A NEW TAB, like every other off-site row on this screen: a run
          // parked in this document survives the trip, and the two native
          // shells hand an off-origin navigation to the player's own browser
          // rather than steering the game window onto a page it has no chrome
          // to leave (electron/src/main.ts, native/App.tsx).
          target="_blank"
          rel="noopener noreferrer"
          // The canvas is a picture as far as a screen reader is concerned, so
          // the link has to say what it is and where it goes on its own.
          aria-label={`Version ${__APP_VERSION__}, build ${__BUILD_COMMIT__} — open this commit in the source repository`}
          title={`Open commit ${__BUILD_COMMIT__} in the source repository`}
          onClick={() => {
            playUiSound(synth, "start");
          }}
        >
          {stamp}
        </a>
      ) : (
        stamp
      )}
    </footer>
  );
}
