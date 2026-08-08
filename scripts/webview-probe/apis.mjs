// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GAME NEEDS A WEBVIEW TO HAVE.
//
// The game has only ever been shipped on Chromium — a browser, and a desktop
// build that carries one. A shell that uses the PLATFORM's webview instead runs
// the identical bundle on WebKit and on WebView2, and the risk that buys is not
// "it will not start": it is that one surface out of forty behaves differently
// and nobody notices until a player does.
//
// So this is the inventory, one entry per web-platform feature the game
// actually reaches for, with the line that says WHAT BREAKS if it is missing.
// It is read by two things and that is the point:
//
//   ./index.html            renders it as a grid, inside whichever webview is
//                           showing it — so a real shell on a real machine can
//                           be pointed at it and photographed.
//   ../webview-sweep.mjs    runs the same list headlessly under every installed
//                           Playwright engine and diffs them.
//
// A PROBE RETURNS A BOOLEAN AND MUST NOT THROW. Everything is wrapped by the
// runner, but a probe that allocates a real AudioContext or opens a real socket
// would make the sweep's results depend on the machine's audio device rather
// than on the engine — so probes ask whether a thing EXISTS and whether the one
// method the game calls is on it, and stop there.
//
// `optional: true` marks a feature the game degrades around on purpose. Those
// are reported and never counted as failures: voice chat picks a different
// codec, haptics simply do not fire. A feature without the flag is one the game
// cannot do without, and a red cell there is a shipping decision.

/** @typedef {{ id: string, group: string, why: string, optional?: boolean, probe: () => boolean }} Api */

/** @type {Api[]} */
export const APIS = [
  // -- The picture ----------------------------------------------------------
  {
    id: "canvas-2d",
    group: "picture",
    why: "the entire game is drawn into a 2D canvas context",
    probe: () => !!document.createElement("canvas").getContext("2d"),
  },
  {
    id: "canvas-image-smoothing",
    group: "picture",
    why: "pixel art scaled with smoothing on is a blurry game",
    probe: () =>
      "imageSmoothingEnabled" in
      /** @type {object} */ (document.createElement("canvas").getContext("2d")),
  },
  {
    id: "canvas-composite-lighter",
    group: "picture",
    why: "every additive effect — muzzle flashes, auras, the conjure glow",
    probe: () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return false;
      ctx.globalCompositeOperation = "lighter";
      return ctx.globalCompositeOperation === "lighter";
    },
  },
  {
    id: "canvas-round-rect",
    group: "picture",
    why: "the HUD's rounded panels fall back to square corners without it",
    optional: true,
    probe: () =>
      typeof (
        /** @type {object} */ (
          document.createElement("canvas").getContext("2d")
        )?.roundRect
      ) === "function",
  },
  {
    id: "image-data",
    group: "picture",
    why: "the sprite atlas is decoded and re-hued through raw pixel buffers",
    probe: () => typeof ImageData === "function",
  },
  {
    id: "create-image-bitmap",
    group: "picture",
    why: "sprite decode without a layout pass; the fallback is an <img> and a wait",
    optional: true,
    probe: () => typeof createImageBitmap === "function",
  },
  {
    id: "request-animation-frame",
    group: "picture",
    why: "the frame loop",
    probe: () => typeof requestAnimationFrame === "function",
  },
  {
    id: "resize-observer",
    group: "picture",
    why: "the canvas resizes with its container and the scale tier is picked from it",
    probe: () => typeof ResizeObserver === "function",
  },
  {
    id: "match-media",
    group: "picture",
    why: "reduced motion, colour scheme, and the orientation the layout keys off",
    probe: () => typeof matchMedia === "function",
  },
  {
    id: "visual-viewport",
    group: "picture",
    why: "the on-screen keyboard and browser chrome insets; degrades to innerHeight",
    optional: true,
    probe: () => "visualViewport" in window,
  },
  {
    id: "fullscreen",
    group: "picture",
    why: "F11 and the fullscreen toggle in settings",
    probe: () =>
      typeof document.documentElement.requestFullscreen === "function",
  },

  // -- The noise ------------------------------------------------------------
  {
    id: "audio-context",
    group: "audio",
    why: "every sound and every note is synthesized; there are no audio files",
    probe: () =>
      typeof (window.AudioContext ?? window.webkitAudioContext) === "function",
  },
  {
    id: "audio-biquad",
    group: "audio",
    why: "the filter sweep under most of the sound design",
    probe: () => hasAudioNode("createBiquadFilter"),
  },
  {
    id: "audio-stereo-panner",
    group: "audio",
    why: "positional sound; the synth already falls back to no panning",
    optional: true,
    probe: () => hasAudioNode("createStereoPanner"),
  },
  {
    id: "audio-compressor",
    group: "audio",
    why: "the master bus limiter — without it a busy fight clips",
    probe: () => hasAudioNode("createDynamicsCompressor"),
  },
  {
    id: "audio-decode",
    group: "audio",
    why: "a mod may ship a recorded .wav/.mp3, and this is what plays it",
    probe: () => hasAudioNode("decodeAudioData"),
  },
  {
    id: "audio-worklet",
    group: "audio",
    why: "voice chat's microphone tap; without it voice picks another provider",
    optional: true,
    probe: () => {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      return (
        typeof Context === "function" && "audioWorklet" in Context.prototype
      );
    },
  },

  // -- The hands ------------------------------------------------------------
  {
    id: "pointer-events",
    group: "input",
    why: "steering IS a held pointer — the game's one control",
    probe: () => typeof PointerEvent === "function",
  },
  {
    id: "pointer-capture",
    group: "input",
    why: "a drag that leaves the canvas must keep steering rather than stopping dead",
    probe: () => typeof Element.prototype.setPointerCapture === "function",
  },
  {
    id: "gamepad",
    group: "input",
    why: "controller support, and the Steam Deck's whole input surface",
    probe: () => typeof navigator.getGamepads === "function",
  },
  {
    id: "keyboard-events",
    group: "input",
    why: "the keyboard bindings, and the shell's own F11 handler",
    probe: () => typeof KeyboardEvent === "function",
  },
  {
    id: "vibrate",
    group: "input",
    why: "haptics on a handheld; a desktop has no motor and never will",
    optional: true,
    probe: () => typeof navigator.vibrate === "function",
  },

  // -- What is remembered ---------------------------------------------------
  {
    id: "local-storage",
    group: "storage",
    why: "THE PLAYER'S WHOLE ROSTER. Nothing else in this list is worse to lose",
    probe: () => {
      const key = "__gis_probe";
      window.localStorage.setItem(key, "1");
      const ok = window.localStorage.getItem(key) === "1";
      window.localStorage.removeItem(key);
      return ok;
    },
  },
  {
    id: "indexed-db",
    group: "storage",
    why: "the offline asset cache the service worker fills",
    probe: () => "indexedDB" in window && window.indexedDB !== null,
  },
  {
    id: "service-worker",
    group: "storage",
    why: "offline play in a BROWSER. A desktop shell serves its own files and does not need one",
    optional: true,
    probe: () => "serviceWorker" in navigator,
  },

  // -- Talking to other people ---------------------------------------------
  {
    id: "message-channel",
    group: "session",
    why: "the snapshot channel: the page is handed one end of a MessagePort pair",
    probe: () => typeof MessageChannel === "function",
  },
  {
    id: "message-port-transfer",
    group: "session",
    why: "that port is TRANSFERRED into the page; a structured clone that cannot carry it is a dead session",
    probe: () => {
      const channel = new MessageChannel();
      // A transfer list the engine refuses throws here rather than degrading.
      window.postMessage({ probe: true, port: channel.port2 }, "*", [
        channel.port2,
      ]);
      return true;
    },
  },
  {
    id: "websocket",
    group: "session",
    why: "the loopback socket a desktop shell's session process listens on",
    probe: () => typeof WebSocket === "function",
  },
  {
    id: "structured-clone",
    group: "session",
    why: "snapshots and run state are cloned rather than re-serialized",
    probe: () => typeof structuredClone === "function",
  },
  {
    id: "get-user-media",
    group: "session",
    why: "voice chat. A build without the voice capability REMOVES this on purpose — a red cell here is expected on one",
    optional: true,
    probe: () => typeof navigator.mediaDevices?.getUserMedia === "function",
  },
  {
    id: "audio-encoder",
    group: "session",
    why: "voice chat's Opus path; the codec seam picks another provider without it",
    optional: true,
    probe: () => typeof window.AudioEncoder === "function",
  },

  // -- The language ---------------------------------------------------------
  {
    id: "array-at",
    group: "language",
    why: "used throughout; an engine without it fails on the first frame",
    probe: () => typeof Array.prototype.at === "function",
  },
  {
    id: "array-to-sorted",
    group: "language",
    why: "the copying array methods the catalogs and the HUD read with",
    probe: () => typeof Array.prototype.toSorted === "function",
  },
  {
    id: "object-has-own",
    group: "language",
    why: "content validation and the mod loader",
    probe: () => typeof Object.hasOwn === "function",
  },
  {
    id: "string-replace-all",
    group: "language",
    why: "text substitution in dialogue and the HUD",
    probe: () => typeof String.prototype.replaceAll === "function",
  },
  {
    id: "regexp-named-groups",
    group: "language",
    why: "the content pipeline's parsers, which also run in the page for a mod",
    probe: () => /(?<x>a)/u.exec("a")?.groups?.x === "a",
  },
];

/** Does an AudioContext carry this method, without allocating a real one?
 *
 * The prototype rather than an instance, deliberately: constructing an
 * AudioContext on a page with no user gesture starts a suspended graph on some
 * engines and warns on others, and the answer to "does this engine have the
 * node" is on the prototype either way. */
function hasAudioNode(method) {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  return (
    typeof Context === "function" &&
    typeof Context.prototype[method] === "function"
  );
}
