// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/// <reference types="vite/client" />

// The build-time `define` constants live in ./build-globals.d.ts. The ROOT
// tsconfig includes BOTH files, because tests/ imports app modules — and once a
// test reaches anything under `game/render/` it reaches `assets.ts`, whose
// `atlas.png`/`font.png` imports are declared by the `vite/client` reference
// above and by nothing else.
