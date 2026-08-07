// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO DECISIONS A CAPTURE MAKES BEFORE IT DRAWS ANYTHING
// (`pwa/src/game/screenshots.ts`): how far to blow the picture up, and what to
// call it. The drawing itself needs a browser; these two do not, and both are
// places a wrong answer is silent — a picture at 1x looks fine on the machine
// that took it and lands in a chat window as a postage stamp, and a name with a
// slash or a colon in it is a file half the platforms refuse to write.

import { describe, expect, it } from "vitest";

import { captureScale, shotFileName } from "../pwa/src/game/screenshots.ts";
import {
  bindingLabel,
  defaultKeybindings,
  DEFAULT_KEYBINDINGS,
} from "../pwa/src/game/keybindings.ts";
import { IDENTITY } from "../pwa/src/identity.ts";

describe("how far the picture is blown up", () => {
  it("takes a landscape phone to roughly 1920 across", () => {
    // The reference device: ~844 CSS px wide held horizontally.
    expect(captureScale(844)).toBe(2);
    expect(844 * captureScale(844)).toBeGreaterThan(1600);
  });

  it("blows a small viewport up further, and a big one less", () => {
    expect(captureScale(390)).toBe(5);
    expect(captureScale(1280)).toBe(2);
    expect(captureScale(1920)).toBe(1);
  });

  it("never BLOWS a picture up past the cap", () => {
    // The cap bounds the blow-up, not the picture: a screen already wider than
    // the cap takes scale 1, because the only way below that is a resample and
    // a resampled pixel-art screenshot is the one outcome to avoid.
    for (const width of [320, 390, 844, 1280, 1440, 1920, 2560, 3840]) {
      const scaled = width * captureScale(width);
      expect(scaled === width || scaled <= 2560).toBe(true);
    }
  });

  it("never goes below 1, whatever it is handed", () => {
    expect(captureScale(0)).toBe(1);
    expect(captureScale(-10)).toBe(1);
    expect(captureScale(6000)).toBe(1);
  });
});

describe("what the picture is called", () => {
  const AT = Date.UTC(2026, 7, 6, 9, 41, 12);

  it("names the game, the venue and the moment", () => {
    // The brand comes off game.config.json rather than being written down
    // here — a sequel renames the game, and that must not fail this suite.
    const brand = IDENTITY.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const name = shotFileName("The Moon", AT);
    expect(name.replace(/-/g, "")).toBe(`${brand}themoon20260806094112.png`);
    expect(name).toContain("-the-moon-");
    expect(name).toContain("2026-08-06-09-41-12");
  });

  it("carries nothing a filesystem argues about", () => {
    const name = shotFileName("HQ: Level 3 / basement", AT);
    expect(name).toMatch(/^[a-z0-9.-]+\.png$/);
  });

  it("still names a picture taken somewhere with no printable name", () => {
    expect(shotFileName("???", AT)).toContain("-shot-2026-08-06-09-41-12.png");
  });

  it("sorts chronologically as plain text", () => {
    const early = shotFileName("moon", Date.UTC(2026, 0, 2, 3, 4, 5));
    const late = shotFileName("moon", Date.UTC(2026, 10, 2, 3, 4, 5));
    expect([late, early].sort()).toEqual([early, late]);
  });
});

describe("the screenshot bind", () => {
  it("ships on F12 in a shell — Steam's own screenshot key", () => {
    // The whole Steam integration rests on this default: the overlay hooks F12
    // and files its own copy, and the game never grabs the key away from it
    // (electron/src/screenshots-provider.ts).
    expect(DEFAULT_KEYBINDINGS.screenshot).toBe("F12");
    expect(defaultKeybindings("steam").screenshot).toBe("F12");
  });

  it("moves to ENTER in a browser, which cannot have F12 at all", () => {
    // F12 is the developer-tools key and no page may swallow it, so on the web
    // the default has to be a key the game can actually receive.
    expect(defaultKeybindings(null).screenshot).toBe("Enter");
  });

  it("leaves every other key where it was", () => {
    const web = defaultKeybindings(null);
    for (const [action, code] of Object.entries(DEFAULT_KEYBINDINGS)) {
      if (action === "screenshot") continue;
      expect(web[action as keyof typeof web]).toBe(code);
    }
  });

  it("prints a name the pixel font can draw", () => {
    expect(bindingLabel(DEFAULT_KEYBINDINGS.screenshot)).toBe("F12");
    expect(bindingLabel(defaultKeybindings(null).screenshot)).toBe("ENTER");
  });
});
