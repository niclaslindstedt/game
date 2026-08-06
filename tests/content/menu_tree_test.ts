// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TITLE MENU TREE — `content/mainmenu.yaml`, compiled, and the promises the
// menu makes that nothing else can check.
//
// The compiler already refuses a broken tree (a parent that loops, a BACK with
// no row to land on, a glyph the pixel font cannot draw — see
// scripts/asset-tools/menu-schema.mjs). What it CANNOT see is the other half of
// the seam: the builders. A row authored here with no builder there is a row
// that silently never renders; a screen id in the union with nothing behind it
// is a `setScreen` that lands on a blank page. Both are caught here, by
// building every screen for real.

import { describe, expect, it } from "vitest";

import { MENU_SCREENS } from "../../pwa/src/game/title-screen/menu-tree.ts";
import type {
  MenuContext,
  MenuEntry,
  MenuScreen,
} from "../../pwa/src/game/title-screen/menu-model.ts";
import type { Character } from "../../pwa/src/game/characters.ts";
import { buildMenu } from "../../pwa/src/game/title-screen/menus.ts";
import { setDevicePolicyForTest } from "../../pwa/src/app/device-policy.ts";
import { updateSettings } from "../../pwa/src/game/settings.ts";
import { ALL_GORE_ON } from "../gore-settings.ts";

const SCREENS = Object.keys(MENU_SCREENS) as MenuScreen[];

/** Every screen id the app can be on. Hand-kept in `menu-model.ts` so a typo in
 * a `setScreen` call is a type error; listed again here so the two halves are
 * compared rather than trusted. */
const UNION: MenuScreen[] = [
  "main",
  "extras",
  "difficulty",
  "levels",
  "botspeed",
  "scores",
  "settings",
  "gameplay",
  "controls",
  "keybindings",
  "interface",
  "video",
  "gore",
  "audio",
  "data",
  "export",
  "developer",
  "playground",
  "cheats",
  "galleries",
  "visuals",
  "balance",
  "seed",
  "arsenal",
  "effects",
  "vault",
  "achievements",
  "store",
  "storeconfirm",
  "storehero",
  "storesend",
  "mods",
  "modinfo",
  "modorder",
  "multiplayer",
  "host",
  "sessions",
  "address",
];

/** A saved hero, for the screens whose rows depend on the roster having one. */
const HERO: Character = {
  id: "hero",
  name: "ADA",
  hardcore: false,
  createdAt: 0,
  dead: false,
  loadout: null,
  clears: [],
  beaten: [],
  storySeen: [],
  merchantsMet: [],
};

/**
 * A MenuContext with every field a builder might read, wired to nothing.
 *
 * `character` is a stand-in rather than a real hero: the two campaign pickers
 * read a hero's progress, so they are exercised with none (they fall through to
 * their BACK row, which is the path this suite cares about) — every OTHER
 * screen either ignores it or only checks that it is there.
 */
function ctxFor(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    setScreen: () => {},
    setCursor: () => {},
    rowIndexIn: () => 0,
    character: null,
    hasResume: true,
    hasVault: true,
    onResume: () => {},
    onStart: () => {},
    onNewGame: () => {},
    onLoadGame: () => {},
    onHowToPlay: () => {},
    difficulty: "medium",
    setDifficulty: () => {},
    warp: false,
    setWarp: () => {},
    botView: false,
    setBotView: () => {},
    botLevel: null,
    setBotLevel: () => {},
    bumpSettings: () => {},
    captureBind: null,
    setCaptureBind: () => {},
    hasFinePointer: true,
    // Populated (like everything above), so the touch-gated rows are built by
    // the build-everything pass — see the ctxFor lesson in the menu-design
    // skill: a field defaulting to "absent" silently drops its rows from the
    // suite that exists to catch missing builders.
    hasTouch: true,
    canBuzz: true,
    canQuit: true,
    onQuit: () => {},
    setNotice: () => {},
    transferOpen: true,
    roster: [],
    exportPicks: new Set<string>(),
    toggleExportPick: () => {},
    exportPicked: async () => {},
    pickImport: () => {},
    beginExportPicker: () => {},
    runSeed: () => {},
    prompt: () => {},
    netOpen: true,
    net: {
      rows: [],
      refresh: () => {},
      firewall: null,
      allowFirewall: () => {},
      session: {
        port: 27015,
        doors: "both",
        maxPlayers: 8,
        password: "",
        recent: [],
      },
      setSession: () => {},
      hostIntent: () => ({
        name: "TEST",
        password: "",
        maxPlayers: 8,
        port: 27015,
        udp: true,
        steam: true,
      }),
      refusalFor: () => null,
      joinRow: () => {},
      joinAddress: () => {},
    },
    modsOpen: true,
    mods: {
      rows: [],
      isOn: () => false,
      setEnabled: () => {},
      selected: null,
      select: () => {},
      move: () => {},
      overriddenIds: () => 0,
      // Both folders present, so the screen builds the rows that open them —
      // the platform that has neither is covered by `folderRow` returning null.
      folders: { local: "/home/p/.config/adastrail/mods", portable: "/g/mods" },
      reveal: () => {},
      onPlay: () => {},
      onPublish: () => {},
    },
    storeOpen: true,
    storePrices: null,
    storeBusy: false,
    storePackSku: null,
    setStorePackSku: () => {},
    storeHeroId: null,
    setStoreHeroId: () => {},
    storeAmount: 0,
    setStoreAmount: () => {},
    runPurchase: async () => {},
    runSend: () => {},
    cloudOpen: true,
    cloudState: { phase: "idle", available: true, lastSyncAt: null },
    runCloudSync: async () => {},
    ...overrides,
  } as unknown as MenuContext;
}

describe("the title menu tree", () => {
  it("has exactly the screens the app knows how to be on", () => {
    // Both directions: a screen authored with no id is unreachable, and an id
    // with no screen is a `setScreen` onto a page with no shape.
    expect([...SCREENS].sort()).toEqual([...UNION].sort());
  });

  it("hangs every screen off the front door", () => {
    for (const id of SCREENS) {
      const chain: MenuScreen[] = [];
      let at: MenuScreen | undefined = id;
      while (at && at !== "main") {
        expect(chain, `${id} loops through ${at}`).not.toContain(at);
        chain.push(at);
        at = MENU_SCREENS[at].parent;
      }
      expect(at, `${id} never reaches the main menu`).toBe("main");
    }
  });

  it("lands every BACK on a row that is really in the parent", () => {
    for (const id of SCREENS) {
      const def = MENU_SCREENS[id];
      if (!def.home) continue;
      const parent = MENU_SCREENS[def.parent!];
      expect(
        parent.rows.map((row) => row.id),
        `${id} homes onto "${def.home}", which ${def.parent} does not have`,
      ).toContain(def.home);
    }
  });

  it("never opens a screen whose BACK would not come back", () => {
    for (const id of SCREENS) {
      for (const row of MENU_SCREENS[id].rows) {
        if (!row.opens) continue;
        expect(
          MENU_SCREENS[row.opens]?.parent,
          `${id}.${row.id} opens ${row.opens}, which backs out elsewhere`,
        ).toBe(id);
      }
    }
  });

  it("keeps the developer tree closed under its children", () => {
    // A page hanging under a developer screen must be developer too, or it
    // would survive into a store build with the screen that reaches it gone.
    for (const id of SCREENS) {
      const parent = MENU_SCREENS[id].parent;
      if (!parent || !MENU_SCREENS[parent].dev) continue;
      expect(
        MENU_SCREENS[id].dev,
        `${id} is a plain page under ${parent}`,
      ).toBe(true);
    }
  });

  it("builds every screen, and gives every one of them a way out", () => {
    // The half the compiler cannot see: `assembleRows` throws for an authored
    // row no builder claims, so merely building each screen is the check. Only
    // `main` may end without a BACK row — it is the way out.
    for (const id of SCREENS) {
      const rows = buildMenu(id, ctxFor());
      if (id === "main") {
        expect(rows.length).toBeGreaterThan(0);
        continue;
      }
      const last = rows[rows.length - 1] as MenuEntry | undefined;
      expect(last?.label, `${id} has no BACK row`).toBe("BACK");
    }
  });

  it("offers the whole front door on a build that has everything", () => {
    // The one screen worth pinning row by row: it is the game's first
    // impression, and the order is the design (play block, then the shelf, then
    // the settings, then the way out).
    const rows = buildMenu("main", ctxFor({ roster: [HERO] })).map(
      (row) => row.aria,
    );
    expect(rows).toEqual([
      "main-resume",
      "main-new-game",
      "main-load-game",
      "main-how-to-play",
      "main-multiplayer",
      "main-store",
      "main-mods",
      "main-extras",
      "main-settings",
      "main-quit",
    ]);
  });

  it("keeps the DEVELOPER index a short list of doors", () => {
    // The second screen worth pinning row by row. Flat, this page was twelve
    // rows of four unrelated kinds and a developer read the whole column every
    // time; the rows now live one press deeper, filed by what kind of thing
    // they do. The order is the design (a run, what goes into it, the two
    // tuning pages, the shelves that only look).
    const rows = buildMenu("developer", ctxFor());
    expect(rows.map((row) => row.aria)).toEqual([
      "developer-playground",
      "developer-cheats",
      "developer-balance",
      "developer-visuals",
      "developer-galleries",
      "developer-back",
    ]);
    // EVERY row is a door — no switch or slider parked among them. That is what
    // keeps the page inside the landscape phone's screen, and it is why every
    // row may carry its own emblem: on a phone nothing hovers, and the icon is
    // what makes a row read as pressable.
    for (const row of rows) {
      expect(row.icon, `${row.aria} has no icon`).toBeTruthy();
      expect(row.toggle ?? row.slider, `${row.aria} is not a door`).toBe(
        undefined,
      );
    }
  });

  it("files every developer row onto exactly one page", () => {
    // The rows that moved are still all there, and none of them got left on two
    // pages by a half-finished move.
    const pages = ["developer", "playground", "cheats", "galleries"] as const;
    const seen = pages.flatMap((page) =>
      buildMenu(page, ctxFor())
        .map((row) => row.aria)
        .filter((aria) => !aria.endsWith("-back")),
    );
    expect(new Set(seen).size).toBe(seen.length);
    const rowIds = seen.map((aria) => aria.split("-").slice(1).join("-"));
    for (const id of [
      "select-level",
      "bot-view",
      "auto-level-stats",
      "seed",
      "grant-coins",
      "force-store",
      "arsenal",
      "effects",
      "balance",
      "visuals",
      "debug",
    ]) {
      expect(rowIds, `${id} is not on any developer page`).toContain(id);
    }
  });

  it("drops the rows a plain web build has no answer for", () => {
    const rows = buildMenu(
      "main",
      ctxFor({
        hasResume: false,
        onResume: undefined,
        storeOpen: false,
        modsOpen: false,
        netOpen: false,
        canQuit: false,
        roster: [HERO],
      }),
    ).map((row) => row.aria);
    expect(rows).toEqual([
      "main-new-game",
      "main-load-game",
      "main-how-to-play",
      "main-extras",
      "main-settings",
    ]);
  });

  it("hides LOAD GAME until there is a hero to load", () => {
    // ABSENT, not greyed: a dead row owes the player a line explaining its
    // grey, and that line hangs a second row of text off the centred front
    // door. A first launch has nothing to load and NEW GAME says what to do.
    const rows = buildMenu("main", ctxFor({ roster: [] }));
    expect(rows.map((row) => row.aria)).not.toContain("main-load-game");
    expect(rows.every((row) => !row.blurb)).toBe(true);
  });

  it("takes the whole GORE page away when the DEVICE says no", () => {
    // The guardian's switch outranks every row behind it (app/device-policy.ts),
    // so the way in is absent rather than opening a page of controls that
    // visibly do nothing — the same call the row made when it was one switch.
    try {
      setDevicePolicyForTest({ nsfw: false, store: true });
      expect(buildMenu("video", ctxFor()).map((row) => row.aria)).not.toContain(
        "video-gore",
      );
      setDevicePolicyForTest(null);
      expect(buildMenu("video", ctxFor()).map((row) => row.aria)).toContain(
        "video-gore",
      );
    } finally {
      setDevicePolicyForTest(null);
    }
  });

  it("locks the two blood-only GORE rows instead of hiding them", () => {
    // BLOODY HERO and BOOTPRINTS are blood's own art in blood's own colours, so
    // HUMAN GORE off leaves them nothing to do. They stay on the page, greyed: a row
    // that vanishes leaves a player hunting for a setting they remember.
    const ids = ["gore-hero-soak", "gore-bootprints"];
    try {
      updateSettings({ ...ALL_GORE_ON });
      const on = buildMenu("gore", ctxFor());
      for (const id of ids) {
        const row = on.find((entry) => entry.aria === id);
        expect(
          row?.toggle,
          `${id} is not a switch with HUMAN GORE on`,
        ).toBeTruthy();
        expect(row?.locked).toBeFalsy();
      }
      updateSettings({ goreBlood: "off" });
      const off = buildMenu("gore", ctxFor());
      for (const id of ids) {
        const row = off.find((entry) => entry.aria === id);
        expect(row, `${id} vanished with HUMAN GORE off`).toBeTruthy();
        expect(row?.locked, `${id} is not locked with HUMAN GORE off`).toBe(
          true,
        );
        expect(row?.toggle).toBeUndefined();
      }
    } finally {
      updateSettings({ ...ALL_GORE_ON });
    }
  });

  it("never offers CONTROLS when the page behind it would be blank", () => {
    // Every scheme row on CONTROLS is desktop-only and the one row that is not
    // needs a motor, so a touch device with neither reaches a page holding
    // nothing but BACK. Both halves are pinned: a phone that CAN buzz still has
    // VIBRATION to configure and keeps the row.
    const touch = { hasFinePointer: false } as const;
    const bare = buildMenu("settings", ctxFor({ ...touch, canBuzz: false }));
    expect(buildMenu("controls", ctxFor({ ...touch, canBuzz: false }))).toEqual(
      [expect.objectContaining({ label: "BACK" })],
    );
    expect(bare.map((row) => row.aria)).not.toContain("settings-controls");

    const phone = buildMenu("settings", ctxFor({ ...touch, canBuzz: true }));
    expect(phone.map((row) => row.aria)).toContain("settings-controls");
  });

  it("offers SWIPE BARS only where touch exists", () => {
    // The row's feature IS a touch gesture, so a mouse-only desktop would show
    // a dead switch. Gated on hasTouch (not !hasFinePointer): a touch laptop
    // has both pointers and the gesture works there, so it keeps the row.
    const noTouch = buildMenu("gameplay", ctxFor({ hasTouch: false }));
    expect(noTouch.map((row) => row.aria)).not.toContain("gameplay-swipe-bars");
    const touch = buildMenu("gameplay", ctxFor({ hasTouch: true }));
    expect(touch.map((row) => row.aria)).toContain("gameplay-swipe-bars");
  });

  it("resolves a BACK cursor by row id, not by position", () => {
    // The whole point of the tree: hiding a row above the landing shifts the
    // landing with it. EXTRAS carries the two rows a build can lack, so it is
    // where the arithmetic actually bites.
    const full = buildMenu("extras", ctxFor()).map((row) => row.aria);
    const bare = buildMenu("extras", ctxFor({ hasVault: false })).map(
      (row) => row.aria,
    );
    expect(full).toContain("extras-lost-found");
    expect(bare).not.toContain("extras-lost-found");
    expect(bare.indexOf("extras-library")).toBe(
      full.indexOf("extras-library") - 1,
    );
  });
});
