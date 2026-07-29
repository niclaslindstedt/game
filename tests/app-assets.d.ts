// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient shims for the BUILT asset modules the app imports, so a test in this
// project can follow an import chain into `pwa/src` (see the note in
// pwa/src/vite-env.d.ts — tests/ importing app modules is expected).
//
// The app resolves these through Vite, whose `vite/client` types declare them;
// the ROOT project deliberately runs with `"types": []` so the framework-free
// engine can never pick up ambient browser/bundler globals. These wildcard
// declarations give the tests the one thing they actually need — that a `.png`
// import is a URL string — without pulling `vite/client` over `src/`.
//
// Only the generated atlases reach a test today (game-screen/event-fx.ts →
// assets.ts), and they are build output, so there is nothing more precise to
// say about them than "a string".

declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*.webp" {
  const url: string;
  export default url;
}

declare module "*.svg" {
  const url: string;
  export default url;
}
