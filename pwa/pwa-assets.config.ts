// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Icon pipeline (§11.4.2): every raster icon is generated from the single
// vector source `public/icon.svg` by `npm run icons` (which runs
// `pwa-assets-generator` with this config, then scripts/generate-og.mjs for
// the 1200×630 Open Graph card). Never edit the emitted PNGs by hand.
import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // Paint the transparent paddings in the app's background so the iOS
    // home-screen tile and the maskable icon bleed full-frame instead of
    // showing white corners.
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: "#0b0d10" },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: "#0b0d10" },
    },
  },
  images: ["public/icon.svg"],
});
