// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desktop shell's main process — the peer of native/App.tsx, and as thin
// as that file is: a window showing the bundled game, plus the routing that
// connects the page's four bridge protocols to the Steam side.
//
// The ORDER of the startup work matters more than any of it individually, and
// three things must happen before Electron is ready:
//
//  1. `restartAppIfNecessary` — relaunch through Steam if the player started
//     the binary directly. Steam's APIs need the client, and the overlay needs
//     to have injected before the window exists.
//  2. `electronEnableSteamOverlay` — it appends `in-process-gpu` and
//     `disable-direct-composition` command-line switches, and Chromium reads
//     those ONLY before ready. Called afterwards it silently does nothing and
//     the overlay never draws.
//  3. `registerSchemesAsPrivileged` — same rule: the scheme's powers (standard,
//     secure, fetch, CORS) are locked in before ready, and a scheme registered
//     late loads the site as an opaque origin with no `localStorage`.
//
// Everything security-shaped is deliberate and none of it is default: the
// renderer is the whole game, so it is sandboxed, context-isolated, given no
// Node, and pinned to our own origin (see `createWindow`).

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  screen,
  shell,
} from "electron";
import { pathToFileURL } from "node:url";

import {
  createAchievementsBridge,
  type AchievementsBridge,
  type AchievementsEvent,
  type AchievementsRequest,
} from "./achievements";
import {
  createCloudBridge,
  type CloudBridge,
  type CloudEvent,
  type CloudRequest,
} from "./cloud-save";
import {
  createNetBridge,
  type NetBridge,
  type NetEvent,
  type NetRequest,
} from "./net";
import {
  createModsBridge,
  type ModsBridge,
  type ModsEvent,
  type ModsRequest,
} from "./mods";
import {
  createScoresBridge,
  type ScoresBridge,
  type ScoresEvent,
  type ScoresRequest,
} from "./leaderboards";
import {
  APP_ORIGIN,
  APP_SCHEME,
  BRAND_BG,
  BUILD_CAPABILITIES,
  DEVELOPER_BUILD,
  isPlaceholderAppId,
  REMOTE_GAME_URL,
  STEAM_APP_ID,
  STEAM_ENABLED,
  STORE_URL,
} from "./config";
import { capabilityList, resolveCapabilities } from "./capabilities";
import { SHELL_CHANNEL } from "./channels";
import { dedicatedArgs, serverArgs } from "./dedicated-mode";
import { readInvite, type Invite } from "./net-invite";
import { output } from "./output";
import { steamClient } from "./steam";
import { webrootExists, webrootHandler } from "./webroot";
import {
  loadWindowState,
  MIN_HEIGHT,
  MIN_WIDTH,
  saveWindowState,
  type WindowState,
} from "./window-state";
import { serverEntryPath } from "./resources";

/** What this launch may do — the package's own stamp, plus whatever the
 * command line asked for on top of it. Resolved once, before anything reads
 * it. */
const { capabilities, refusals } = resolveCapabilities(
  BUILD_CAPABILITIES,
  process.argv,
);
for (const refusal of refusals) output.warn(refusal);

/**
 * THE ACKNOWLEDGEMENT.
 *
 * Multiplayer and mods are licensed with the store edition and not with a
 * plain download of the binary, so turning either of them on by command line
 * is a thing somebody has to do knowingly rather than by pasting a line they
 * found. It is shown on every such launch — a preference that remembered the
 * answer would turn an acknowledgement into a checkbox — and it is a MODAL
 * refusal by default: the cancel path quits the game rather than starting it
 * with the options quietly dropped.
 */
const UNLOCK_NOTICE =
  "Multiplayer and mod support are being enabled by launch options.\n\n" +
  "The Steam edition is the only edition licensed to play multiplayer" +
  (STORE_URL ? `:\n${STORE_URL}\n` : ".") +
  "\nEnabling either of them here is not covered by the terms of service " +
  "for this build. Continuing means you understand that you are running the " +
  "game outside those terms, and that you are doing so on your own " +
  "responsibility.";

/**
 * WHAT A BUILD NOBODY PACKAGED IS.
 *
 * A binary with no packaging stamp on it was made by somebody working on the
 * game, out of their own tree — it is a debugging tool, not a copy of the game
 * to play or to hand to anybody. That is easy to forget once it is an
 * application icon like any other, so it is stated on every launch and carried
 * in the window title for as long as the window is open. The suffix is
 * deliberately not a one-time dialog: what it guards against is a build that
 * has been sitting on somebody's desktop for a month.
 */
const DEVELOPER_NOTICE =
  "This is a developer build of the game, built from sources rather than " +
  "packaged for release.\n\n" +
  "It is for debugging the game as a developer and for no other purpose. It " +
  "is not licensed for play, for sharing, or for distribution in any form.";

/** What the title bar says a developer build is, for as long as it is open. */
const DEVELOPER_TITLE_SUFFIX = " — DEVELOPER BUILD (debugging only)";

/** `--dedicated` turns this executable into the already-shipped Node session
 * server: no Steam handshake, no Chromium readiness, and no window. The server
 * entry deliberately starts its terminal wrapper when it has no parent port.
 */
const dedicated = dedicatedArgs(process.argv);
if (dedicated) {
  // Electron is still an app bundle on macOS even when it creates no window.
  // Mark this process as a background utility before readiness, or merely
  // starting a terminal server puts a distracting icon in the Dock.
  if (process.platform === "darwin") {
    app.setActivationPolicy("prohibited");
    app.dock?.hide();
  }
  // No window here, so both notices are lines on the console the operator is
  // already looking at.
  if (DEVELOPER_BUILD) output.warn(DEVELOPER_NOTICE.replace(/\n+/g, " "));
  if (capabilities.unlocked) output.warn(UNLOCK_NOTICE.replace(/\n+/g, " "));
  // A SERVER IS THE MULTIPLAYER FEATURE, so it answers to the same permission
  // the HOST screen does — this mode is not a way around a build that was not
  // packaged with it. And unlike the HOST screen it has nowhere to read a port
  // from, so here the port is required rather than a refinement: a server on
  // whichever port happened to be free is a server nobody can be told to
  // connect to.
  if (!capabilities.multiplayer || capabilities.port === undefined) {
    output.error(
      "--dedicated needs --multiplayer and --port <n> on this build.",
    );
    process.exitCode = 1;
    app.quit();
  } else {
    const entry = serverEntryPath();
    // Give the imported Node entry the argv shape it receives when run
    // directly, with the shell's own options taken back out (`serverArgs`).
    process.argv = [
      process.execPath,
      entry,
      ...serverArgs(dedicated, capabilities),
    ];
    void import(pathToFileURL(entry).href).catch((err: unknown) => {
      output.error(`dedicated server failed — ${describe(err)}`);
      process.exitCode = 1;
    });
  }
}

/** One parsed message off the shell channel. The `__gis*` flag says which
 * bridge it belongs to; that bridge's own request type describes the rest of
 * the fields (and validates them), so they aren't re-declared here. Mirrors
 * native/App.tsx's `BridgeMessage` — minus haptics, which a desktop has no
 * motor for (pwa/src/app/platform.ts hides the setting to match). */
type BridgeMessage = {
  __gisCloud?: boolean;
  __gisAchievements?: boolean;
  __gisScores?: boolean;
  __gisMods?: boolean;
  __gisNet?: boolean;
  __gisQuit?: boolean;
};

// ---------------------------------------------------------------------------
// Before ready — see the header for why each of these cannot wait.
// ---------------------------------------------------------------------------

if (!dedicated && STEAM_ENABLED) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks = require("steamworks.js") as {
      restartAppIfNecessary(appId: number): boolean;
      electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
    };
    // Only for a REAL app id. Spacewar (480) is shared by every developer
    // testing against it, and asking Steam to relaunch us as it would send a
    // local run somewhere surprising.
    if (
      !isPlaceholderAppId() &&
      steamworks.restartAppIfNecessary(STEAM_APP_ID)
    ) {
      output.info("steam: relaunching through the Steam client…");
      app.quit();
    }
    steamworks.electronEnableSteamOverlay();
  } catch (err) {
    // A machine with no Steam, or a platform the prebuilt binding has no
    // binary for. Neither may stop the game from starting.
    output.warn(`steam: overlay setup skipped — ${describe(err)}`);
  }
}

if (!dedicated)
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true, // a real origin, so localStorage/IndexedDB persist
        secure: true, // counts as a secure context (service workers, crypto)
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true, // range requests, so media can seek
      },
    },
  ]);

// A second copy of the game would fight the first over the same save files and
// the same Steam session. Hand the argument to the running instance instead.
if (!dedicated && !app.requestSingleInstanceLock()) {
  output.info("another copy is already running — focusing it");
  app.quit();
}

// ---------------------------------------------------------------------------
// Bridges — built on first use, exactly as native/App.tsx builds them.
// ---------------------------------------------------------------------------

let cloud: CloudBridge | null = null;
let achievements: AchievementsBridge | null = null;
let scores: ScoresBridge | null = null;
let mods: ModsBridge | null = null;
let net: NetBridge | null = null;

/**
 * Call one of the page's `window.__gis*Event(...)` callbacks.
 *
 * The desktop counterpart of the WebView's `injectJavaScript`, and it goes
 * through `executeJavaScript` for the same reason: with `contextIsolation` on,
 * the preload lives in its own world and cannot see the page's globals, so the
 * page's receiving half is reached from outside. That also means the web side
 * needed no change at all to work on this shell.
 *
 * U+2028/2029 are the two JSON-legal characters that terminate a line inside a
 * JavaScript literal, so they are escaped — a hero's name reaches this string.
 */
function emit(window: BrowserWindow | null, channel: string, event: unknown) {
  if (!window || window.isDestroyed()) return;
  const payload = JSON.stringify(event)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  window.webContents
    .executeJavaScript(
      `try{window.${channel}&&window.${channel}(${payload})}catch(e){};true;`,
    )
    .catch(() => {
      // The page navigated or is tearing down; the web side resolves every
      // outstanding request through its own timeout.
    });
}

function routeMessage(window: BrowserWindow, raw: string): void {
  let data: BridgeMessage;
  try {
    data = JSON.parse(raw) as BridgeMessage;
  } catch {
    return; // not our message — ignore anything that isn't the bridge
  }
  if (data.__gisCloud) {
    cloud ??= createCloudBridge((event: CloudEvent) =>
      emit(window, "__gisCloudEvent", event),
    );
    cloud.handle(data as CloudRequest);
  }
  if (data.__gisAchievements) {
    achievements ??= createAchievementsBridge((event: AchievementsEvent) =>
      emit(window, "__gisAchievementsEvent", event),
    );
    achievements.handle(data as AchievementsRequest);
  }
  if (data.__gisScores) {
    scores ??= createScoresBridge((event: ScoresEvent) =>
      emit(window, "__gisScoresEvent", event),
    );
    scores.handle(data as ScoresRequest);
  }
  // The two gated protocols answer nothing at all where this launch may not
  // honour them. The page already hides both front doors (the capability list
  // reaches it through the preload), so this is the second half of the same
  // fact rather than a message anybody expects to send.
  if (data.__gisMods && capabilities.mods) {
    mods ??= createModsBridge((event: ModsEvent) =>
      emit(window, "__gisModsEvent", event),
    );
    mods.handle(data as ModsRequest);
  }
  if (data.__gisNet && capabilities.multiplayer) {
    // The FIFTH bridge, and the only one that needs the window itself rather
    // than just a way to emit into it: hosting hands the renderer one end of a
    // `MessagePort` pair, and a port is transferred over `webContents`, not
    // injected as JavaScript. See net.ts for why the game traffic deliberately
    // does not travel down this channel at all.
    net ??= createNetBridge(window, capabilities, (event: NetEvent) =>
      emit(window, "__gisNetEvent", event),
    );
    net.handle(data as NetRequest);
  }
  if (data.__gisQuit) {
    // The main menu's QUIT row (pwa/src/app/quit-bridge.ts). No reply and no
    // bridge module: the only successful outcome is the page ceasing to exist.
    // `app.quit()` rather than closing the window, so macOS — where closing the
    // last window leaves the process running by convention — also exits, which
    // is what a player pressing QUIT in a game asked for.
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const userData = app.getPath("userData");
  // window-state.ts is pure by design, so the displays come from here.
  const state = loadWindowState(
    userData,
    screen.getAllDisplays().map((display) => display.workArea),
  );

  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: BRAND_BG,
    // Paint nothing until the page has something to show, so the player never
    // sees a white rectangle appear and then fill in — the desktop equivalent
    // of the mobile shell holding its splash until the WebView's first frame.
    show: false,
    autoHideMenuBar: true,
    title: `Ada's Trail${DEVELOPER_BUILD ? DEVELOPER_TITLE_SUFFIX : ""}`,
    webPreferences: {
      preload: `${__dirname}/preload.js`,
      // What this launch may do, handed to the preload on its own command
      // line so the menus are built right the first time they are drawn.
      additionalArguments: [
        `--gis-caps=${capabilityList(capabilities).join(",")}`,
      ],
      // The renderer is the game — a large web app. It gets no Node, no
      // `require`, and its own isolated world. See preload.ts for why this
      // departs from steamworks.js' own Electron instructions.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // The game drives its own audio from the first pointer press.
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
    },
  });

  if (state.maximized) window.maximize();
  if (state.fullscreen) window.setFullScreen(true);

  window.once("ready-to-show", () => window.show());

  // The page owns the window title by default, and it sets one — so the
  // suffix has to be re-applied to whatever the page just asked for rather
  // than written once at construction, or it survives exactly until the first
  // frame. Only a developer build takes the handler at all.
  if (DEVELOPER_BUILD) {
    window.webContents.on("page-title-updated", (event, title) => {
      event.preventDefault();
      window.setTitle(`${title}${DEVELOPER_TITLE_SUFFIX}`);
    });
  }

  // The parked invite goes over as soon as the page can receive it — on every
  // load, so a reload mid-session does not strand a player who was invited a
  // second ago. `deliverInvite` consumes it, so the second load is a no-op.
  window.webContents.on("did-finish-load", () => deliverInvite(window));

  // Persist geometry on the way out. Read the NORMAL bounds rather than the
  // current ones: a maximized window reports the screen rect, and restoring
  // that as its un-maximized size leaves the player unable to get a small
  // window back.
  window.on("close", () => {
    const bounds = window.getNormalBounds();
    const next: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen(),
    };
    saveWindowState(userData, next);
  });

  // F11 / Alt+Enter toggles fullscreen. A desktop game is expected to, and the
  // page cannot do it itself — the Fullscreen API belongs to a browser chrome
  // this window does not have.
  window.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const altEnter = input.key === "Enter" && input.alt;
    if (input.key === "F11" || altEnter) {
      window.setFullScreen(!window.isFullScreen());
    }
  });

  // Keep the window pinned to our own origin. The site's own pages (the
  // library, privacy, contact) are same-origin and navigate normally; anything
  // else — the repo link, an external credit — opens in the player's browser
  // rather than replacing the game with a web page it cannot leave.
  const isInternal = (url: string): boolean =>
    url.startsWith(`${APP_ORIGIN}/`) ||
    url === APP_ORIGIN ||
    (!!REMOTE_GAME_URL && url.startsWith(REMOTE_GAME_URL));

  window.webContents.on("will-navigate", (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const target = REMOTE_GAME_URL ?? `${APP_ORIGIN}/index.html`;
  output.info(`loading ${target}`);
  void window.loadURL(target);

  return window;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** An invite read off a command line and waiting for a page to hand it to. */
let pendingInvite: Invite | null = null;

/**
 * Hand the page whatever invite is parked, once.
 *
 * Down the NET bridge's own event channel rather than a new one: the page's
 * half already exists and already knows how to reach the JOIN path, and a
 * second channel for one message would be a second thing to keep in step.
 */
function deliverInvite(window: BrowserWindow): void {
  if (!pendingInvite) return;
  const invite = pendingInvite;
  pendingInvite = null;
  emit(window, "__gisNetEvent", { event: "invite", ...invite });
}

app.on("second-instance", (_event, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  // STEAM HANDS THE INVITE TO THE SECOND INSTANCE, which is about to exit —
  // this is the ONLY place a friend's "accept" reaches a game that is already
  // running, and dropping it here is the difference between a join and
  // nothing at all.
  const invite = readInvite(argv);
  if (!invite) return;
  pendingInvite = invite;
  deliverInvite(mainWindow);
});

/**
 * Say what a developer build is, once per launch.
 *
 * A DIALOG only when the thing was packaged, and that split is the whole
 * point: a packaged developer build is a file that can be copied to somebody
 * else's machine and opened there, while an unpackaged one is a checkout being
 * run by the person who checked it out. Making the second case click a box on
 * every `npm run start` would train the developer to dismiss the box the first
 * case needs them to read. Both get the log line and the title bar.
 */
function announceDeveloperBuild(): void {
  if (!DEVELOPER_BUILD) return;
  output.warn(DEVELOPER_NOTICE.replace(/\n+/g, " "));
  if (!app.isPackaged) return;
  dialog.showMessageBoxSync({
    type: "warning",
    title: "Developer build",
    message: "Developer build — debugging only",
    detail: DEVELOPER_NOTICE,
    buttons: ["I understand"],
    defaultId: 0,
    noLink: true,
  });
}

/** Ask, and mean it: the cancel path quits rather than starting the game with
 * the options silently dropped. Returns whether to carry on. */
function acknowledgeUnlock(): boolean {
  if (!capabilities.unlocked) return true;
  output.warn(UNLOCK_NOTICE.replace(/\n+/g, " "));
  // The way to play this properly is offered beside the way to carry on, and
  // it is a button rather than a line of text somebody has to copy out.
  const buttons = STORE_URL
    ? ["Quit", "Get it on Steam", "I understand — continue"]
    : ["Quit", "I understand — continue"];
  const continueAt = buttons.length - 1;
  const choice = dialog.showMessageBoxSync({
    type: "warning",
    title: "Launch options",
    message: "Enabled by launch options",
    detail: UNLOCK_NOTICE,
    buttons,
    defaultId: continueAt,
    cancelId: 0,
    noLink: true,
  });
  if (STORE_URL && choice === 1) {
    void shell.openExternal(STORE_URL);
    return false;
  }
  return choice === continueAt;
}

void app.whenReady().then(() => {
  if (dedicated) return;
  announceDeveloperBuild();
  if (!acknowledgeUnlock()) {
    app.quit();
    return;
  }
  if (!REMOTE_GAME_URL) {
    if (!webrootExists()) {
      output.error(
        "no bundled website found. Run `npm run bundle` in electron/ first " +
          "(it builds the site and copies it to electron/webroot/).",
      );
      app.quit();
      return;
    }
    protocol.handle(APP_SCHEME, webrootHandler());
  }

  // Touch the client once at startup so the connection (or its absence) is
  // logged before the first bridge request rather than in the middle of one.
  steamClient();

  ipcMain.on(SHELL_CHANNEL, (event, message: unknown) => {
    if (typeof message !== "string") return;
    // Route by the window the message came FROM, so an event can never be
    // injected into a different window than the one that asked.
    const from = BrowserWindow.fromWebContents(event.sender);
    if (from) routeMessage(from, message);
  });

  // `+connect_lobby <id>` (a friend accepted an invite while the game was
  // closed) or `--connect <address>` (a shareable link). It arrives before the
  // window exists, so it is parked and delivered on the page's first load.
  if (capabilities.multiplayer) pendingInvite = readInvite(process.argv);

  mainWindow = createWindow();

  app.on("activate", () => {
    // macOS: clicking the dock icon with no window open reopens one.
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (dedicated) return;
  // The platform convention, which players expect from an installed app:
  // macOS keeps the process alive until Cmd+Q, everywhere else closing the
  // window is quitting the game.
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (dedicated) return;
  cloud?.stop();
  cloud = null;
  // A session server outliving the window it was forked for is an orphan
  // holding a whole level in memory, and on a `dir` install nothing else will
  // ever reap it.
  net?.shutdown();
  net = null;
});

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
