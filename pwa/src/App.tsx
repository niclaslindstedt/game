// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { warn, type Difficulty, type GameState } from "@game/menu";

import { ErrorBoundary } from "@ui/lib/ErrorBoundary.tsx";
import { startGamepadKeyBridge } from "@ui/lib/gamepad-keys.ts";
import { usePwaUpdate } from "@ui/lib/pwa-update.ts";

import { initDevicePolicy } from "./app/device-policy.ts";
import { isNativeApp } from "./app/native.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import {
  createCharacter,
  demoCharacter,
  getActiveCharacter,
  loadCharacters,
  resumeTargetFor,
  setActiveCharacterId,
  spectatorCharacter,
  type Character,
} from "./game/characters.ts";
import { initCloudSave } from "./game/cloud-save.ts";
import type { JoinIntent } from "./game/session-intent.ts";
import { DEMO_DIFFICULTY, DEMO_LEVEL_ID } from "./game/demo.ts";
import { LoadGame } from "./game/LoadGame.tsx";
import type { MinigameId } from "./game/minigames.ts";
import { NewGame } from "./game/NewGame.tsx";
import {
  clearSavedRun,
  loadSavedRun,
  saveRun,
  type ParkedRun,
} from "./game/saved-run.ts";
import { splashWanted } from "./game/splash.ts";
import { SplashScreen } from "./game/SplashScreen.tsx";
import { initCoinStore } from "./game/store.ts";
import { TitleScreen } from "./game/TitleScreen.tsx";
import { UpdateModal } from "./game/UpdateModal.tsx";

// Lazy for the SEO critical-path budget: the title menu is startup; the
// playable game (and the engine renderer it pulls in) is only reached once a
// run begins, so it loads on demand rather than in the entry chunk.
const GameScreen = lazy(() =>
  import("./game/GameScreen.tsx").then((m) => ({ default: m.GameScreen })),
);
// The developer EFFECTS GALLERY, lazy for the same reason (it pulls the whole
// renderer + engine step in behind it). The /* @__PURE__ */ lets a build
// without the developer tooling (`__DEV_TOOLS__` false — the store upload) drop
// the chunk: the `?effects` branch below folds away, and Rollup would otherwise
// keep the unreachable gallery alive through this un-annotated `lazy(...)` call.
const EffectsGallery = /* @__PURE__ */ lazy(() =>
  import("./game/effects-gallery/EffectsGallery.tsx").then((m) => ({
    default: m.EffectsGallery,
  })),
);
// THE ROAD (`?drive`), lazy for the same reason and then some: the drive pulls
// the engine's whole simulation, the renderer and the sprite atlas in behind it,
// and it is a developer deep link nobody who is playing ever types.
const DriveWorkbench = /* @__PURE__ */ lazy(() =>
  import("./game/drive-screen/DriveWorkbench.tsx").then((m) => ({
    default: m.DriveWorkbench,
  })),
);
// A MINIGAME OFF THE ARCADE SHELF, lazy for the same reason as the game screen
// above it: it mounts the real minigame, which drags the engine's simulation,
// the renderer and the sprite atlas in behind it. Not developer tooling — it
// ships — so it takes no `__DEV_TOOLS__` guard and no purity annotation.
const MinigameScreen = lazy(() =>
  import("./game/MinigameScreen.tsx").then((m) => ({
    default: m.MinigameScreen,
  })),
);
// The cutscene workbench (`?cutscene=<id>`), lazy for the same reason: it is a
// developer deep link reached by URL, and a static import parked the whole
// cutscene catalog (and the overlay that plays it) in the entry chunk for every
// player who never types the param. `CUTSCENE_DEFS` is loaded with it, so the
// id is validated inside the chunk rather than by the shell.
const CutscenePreview = lazy(() =>
  import("./game/CutscenePreview.tsx").then((m) => ({
    default: m.CutscenePreview,
  })),
);

// Shown when the lazy game chunk (or the game itself) dies during render —
// a failed dynamic import (stale page vs a fresh deploy, flaky network, a
// stale native webroot) used to unmount the whole tree into a silent black
// screen. Plain DOM and system font on purpose: the game's assets may be
// exactly what failed to load.
function RunLoadError() {
  return (
    <div className="run-load-error">
      <p>The game failed to load.</p>
      <button type="button" onClick={() => window.location.reload()}>
        RELOAD
      </button>
    </div>
  );
}

// The app shell: splash main menu ↔ the playable game. The menu screen also
// owns the PWA update lifecycle so a new deploy can never silently reload
// mid-run.
export function App() {
  // The active hero, or null when none is chosen yet. The app opens on the
  // title menu either way; the difficulty ladder and every run belong to this
  // character once one is picked.
  const [character, setCharacter] = useState<Character | null>(() =>
    getActiveCharacter(),
  );

  // Whether the character roster is open on top of the title, and why: "play"
  // means PLAY → NEW GAME / LOAD GAME sent us here to pick or mint a hero and
  // should resume its run (or open the difficulty ladder) once one is chosen;
  // "manage" means a fallen hero's death dropped us onto the roster and it
  // returns to the title. null = the title menu itself is showing.
  const [picking, setPicking] = useState<null | "play" | "manage">(null);
  // Whether the roster opens straight on the create form (PLAY → NEW GAME)
  // rather than the hero list (PLAY → LOAD GAME). An empty roster shows the
  // form regardless — there is nothing to load.
  const [pickCreating, setPickCreating] = useState(false);
  // Set when a hero is picked via PLAY and has no campaign under way, so the
  // title mounts straight on the difficulty ladder instead of the main menu (a
  // hero mid-campaign resumes their run directly and never sets this). Reset on
  // every other route back to the title so a later visit opens on the menu.
  const [startOnDifficulty, setStartOnDifficulty] = useState(false);

  // HOW TO PLAY: the self-playing showcase. When true the app hands a run to the
  // engine autopilot (a demo BOT VIEW — see demo.ts / GameScreen `demo`) on top
  // of everything else, learnable by watching. It rides its own throwaway hero
  // (demoCharacter — never persisted), so it touches neither the active
  // character nor any parked run; exiting just drops it. Memoised so App
  // re-renders during the demo don't mint a new shell hero underneath it.
  const [demo, setDemo] = useState(false);
  const demoHero = useMemo(() => (demo ? demoCharacter() : null), [demo]);

  // JOINING somebody else's session (Steam builds only): the run on screen is
  // the HOST's, and this player is a first-class member of it — the
  // ACTIVE hero travels with them, is seated by the session, and banks every
  // clear, thought and find back to this roster through the same paths a
  // local run uses. With no hero on the roster the throwaway spectator shell
  // still covers watching (its persist is a no-op by construction) — and
  // GameScreen falls back to the same shell when the session could not seat
  // anybody, so a WATCHER can never bank a host's bag. Captured at join time
  // (not live) so an App re-render mid-session does not swap the hero — or,
  // through the prop identity, reconnect.
  const [join, setJoin] = useState<JoinIntent | null>(null);
  const joinHero = useMemo(
    () =>
      join ? (getActiveCharacter() ?? spectatorCharacter(join.name)) : null,
    [join],
  );

  // A MINIGAME PLAYED ON ITS OWN, off the main menu's arcade shelf: the cabinet
  // and the rung the shelf offered it at, or null on the menu. It is not a run
  // and touches nothing a run touches — no hero, no parked state, no roster
  // bookkeeping — so it sits beside `run` rather than inside it, and leaving one
  // drops back onto the shelf it was started from.
  //
  // THE RUNG ARRIVES WITH THE PRESS rather than being read again here: which
  // rungs a player may grind on is the shelf's own question (it is the set of
  // campaigns they have beaten — see `minigames.ts`), and asking it twice is how
  // the two answers eventually differ.
  const [minigame, setMinigame] = useState<{
    id: MinigameId;
    difficulty: Difficulty;
  } | null>(null);
  // …and whether the title should mount on that shelf when it next shows,
  // which is what makes a second go one press rather than three.
  const [startOnMinigames, setStartOnMinigames] = useState(false);
  // IT IS A ONE-SHOT LANDING, and it is spent by the next thing the player does
  // from the title — every handoff below clears it, exactly as they clear the
  // "open on the ladder" intent beside it. Otherwise a run that ends an hour
  // later would drop them onto the arcade shelf instead of the front door.

  // The pending run: the difficulty and starting level chosen on the menu.
  // null = still on the menu (or roster).
  const [run, setRun] = useState<{
    difficulty: Difficulty;
    levelId: string;
    // Warp-in from PLAYGROUND's SELECT LEVEL: skip the prelude and
    // intro monologue and drop straight into the level.
    skipIntro?: boolean;
    // DEVELOPER → PLAYGROUND → BOT VIEW: hand the run to the engine autopilot with a realistic
    // arrival hero (see GameScreen `botView`).
    botView?: boolean;
    // Resuming a run parked in memory: GameScreen adopts this live engine
    // state instead of starting a fresh one (see `parked` below).
    resume?: GameState;
  } | null>(null);

  // A run parked between the menu and the game: the player exited to the menu
  // from the pause screen, and the frozen engine state is kept here so CONTINUE
  // can drop them straight back in (e.g. after nudging the volume in SETTINGS).
  // Held apart from `run` — which is null while the menu shows — and cleared
  // the moment the run is resumed or a fresh one is started. It is also
  // mirrored to storage (see saved-run.ts), so it survives a page reload — the
  // one an app update forces included — and CONTINUE is restored on load rather
  // than lost with the wiped memory.
  const [parked, setParked] = useState<ParkedRun | null>(() => loadSavedRun());

  // THE STUDIO CARD (game/SplashScreen.tsx): up from the app's very first
  // render, with the title menu mounting and warming UNDERNEATH it — the
  // sprite atlas, the planet shader, the backdrop's surface bakes. It is the
  // only screen in the app that covers another live one, which is the point:
  // the arrival hitch the menu used to open with is spent behind it.
  //
  // Decided ONCE, from the URL, and never re-asked: a harness driving the app
  // gets no card at all (see `splashWanted`), and the flag only ever falls to
  // false — a card is an opening, not a screen the app can return to.
  const [splash, setSplash] = useState(() =>
    splashWanted(window.location.search),
  );

  // Register the deploy slot's service worker (§11.4.3) and track its update
  // lifecycle. The framework hook performs the actual
  // `navigator.serviceWorker.register(...)` via workbox-window, registering
  // `${base}sw.js` on every page load. In dev (`enabled: false`) it stays
  // idle and registers nothing. The cache id is derived from the deploy-slot
  // base so each of `/game/`, `/game/preview/`, and `/game/branch/` owns a
  // distinct precache on the shared origin (see ./app/pwa.ts).
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    // The native shell (native/) bundles the game on-device and ships updates
    // through the app store, so the whole PWA update lifecycle stays dormant
    // there — no service-worker registration, no precache, and no "a new
    // version is ready" toast (needRefresh never flips). Players update by
    // downloading a new build. In a browser/PWA it runs as before (idle only
    // in dev). See pwa/src/app/native.ts.
    enabled: !import.meta.env.DEV && !isNativeApp(),
  });

  // Boot the COIN STORE bridge in the native shell: installs the purchase
  // credit hook and lets the native side replay any paid-but-uncredited
  // transaction from a previous launch (see game/store.ts). Elsewhere the
  // store doesn't exist, so there is nothing to boot.
  useEffect(() => {
    if (isNativeApp()) initCoinStore();
  }, []);

  // Wire the DEVICE CONTENT POLICY's push channel (app/device-policy.ts) — the
  // MATURE CONTENT and COIN STORE switches on the app's own page in iOS
  // Settings. Only LATER changes come through here: the shell stamps the boot
  // policy onto `window` before this page's first module evaluates, precisely so
  // nothing gated has to wait on an effect. Unconditional because the module
  // decides for itself whether anything is managing it, and a browser is simply
  // never called back.
  useEffect(() => {
    initDevicePolicy();
  }, []);

  // CONTROLLER NAVIGATION: translate a gamepad into the arrow/Enter/Escape
  // keyboard every menu in the game already listens for (lib/gamepad-keys.ts).
  // Mounted once, above every screen, so a surface added later is navigable
  // without having to remember to opt in — and unconditionally, because a
  // player with no pad simply never produces an event. The RUN suspends it
  // while the field owns the stick.
  useEffect(() => startGamepadKeyBridge(), []);

  // Boot CLOUD SAVE in the native shell: pull the player's roster and coin
  // bank from the platform cloud (iCloud today), merge them into this device,
  // and keep syncing as the app is backgrounded and another device writes (see
  // game/cloud-save.ts). Real money is at stake in the coin bank, so this runs
  // at startup rather than waiting for the player to find a menu. A browser has
  // no platform cloud, so it stays device-local as before. cloud-save.ts is
  // already on the title screen's module graph, so importing it statically here
  // avoids advertising an ineffective split to the bundler.
  useEffect(() => {
    if (!isNativeApp()) return;
    return initCloudSave();
  }, []);

  // Boot the GAME CENTER mirror in the native shell: sign the player in and
  // push whatever badges this device has earned but never delivered (see
  // game/achievement-sync.ts). One way only — the game's own ledger is the
  // truth and the platform is a copy of it — so there is nothing to wait for
  // before the menu paints, and it loads on demand like cloud save rather than
  // riding in the entry chunk every browser player downloads.
  useEffect(() => {
    if (!isNativeApp()) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([
      import("./game/achievement-sync.ts"),
      import("./game/achievements.ts"),
    ]).then(([{ initAchievementSync }, { getAchievements }]) => {
      if (cancelled) return;
      stop = initAchievementSync(getAchievements);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // …and publish the player's LEADERBOARD standings once at launch
  // (game/leaderboards.ts). Runs are what normally push a score, so this exists
  // for the launch where there is history but no submission yet — a player who
  // has just signed into Game Center, or installed on a second device — and it
  // backfills their whole slate in one call. The platform keeps the best value
  // it has ever been sent, so a launch that has nothing new to say costs one
  // no-op round trip. Lazy for the same reason as the mirror above.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void import("./game/leaderboards.ts").then(({ publishLeaderboards }) => {
      if (cancelled) return;
      void publishLeaderboards();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The framework surfaces the update prompt from the service worker's
  // `waiting` event, which only fires for a worker that becomes waiting while
  // this page is open. A worker already parked in `waiting` when we load
  // (installed on a previous visit or in another tab) is missed, so the toast
  // never appears. checkForUpdate() reads `registration.waiting` directly and
  // flips needRefresh — poll it as the async registration settles after load,
  // and again whenever the tab regains focus.
  // `pwa.checkForUpdate` is a fresh closure each render; hold it in a ref so
  // the wiring below runs once instead of re-subscribing on every render.
  const checkForUpdateRef = useRef(pwa.checkForUpdate);
  useEffect(() => {
    checkForUpdateRef.current = pwa.checkForUpdate;
  });
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!cancelled) void checkForUpdateRef.current();
    };
    // Registration resolves asynchronously; retry a few times on load so an
    // already-waiting worker is caught once `registration` is available.
    const timers = [0, 1500, 4000].map((ms) => window.setTimeout(check, ms));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // The cutscene workbench (`?cutscene=<id>`): loop one scene from the
  // catalog with no run around it — the authoring iteration loop.
  const params = new URLSearchParams(window.location.search);
  // An id the catalog doesn't carry drops the param and lands on the title —
  // the check lives inside the lazy chunk (with the catalog) rather than here.
  const sceneId = params.get("cutscene");
  if (sceneId) {
    return (
      <Suspense fallback={null}>
        <CutscenePreview id={sceneId} />
      </Suspense>
    );
  }

  // The EFFECTS GALLERY workbench (`?effects`, or `?effects=<exhibit id>` to open
  // straight on one): every visual effect staged fullscreen without walking the
  // hidden developer menu to reach it — the FX iteration loop's deep link, and
  // what the contact-sheet script drives (see docs/configuration.md). BACK drops
  // the param and lands on the title. Developer tooling, so a production store
  // build folds the branch away and drops the gallery's chunk with it.
  if (__DEV_TOOLS__ && params.has("effects")) {
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`effects gallery failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <EffectsGallery
            initialId={params.get("effects") ?? undefined}
            initialSpeed={Number(params.get("speed")) || undefined}
            // `?caster=<enemy id>` restages the ELITE exhibits in that mob's
            // own authored colours — the comparison the elite tier's whole
            // claim rests on (scripts/elite-abilities.mjs drives it).
            caster={params.get("caster") ?? undefined}
            onClose={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("effects");
              window.location.replace(url.toString());
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // THE DRIVE WORKBENCH (`?drive`, `?drive=home`, `&difficulty=`, `&seed=`,
  // `&gore=off`): the minigame on its own, without the five-minute walk to the
  // garage it otherwise sits behind — the road's own iteration loop, and what a
  // screenshot of it is taken through. Developer tooling, folded out of a store
  // build with the gallery.
  if (__DEV_TOOLS__ && params.has("drive")) {
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`drive workbench failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <DriveWorkbench
            params={params}
            onClose={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("drive");
              window.location.replace(url.toString());
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // HOW TO PLAY is playing: the self-running demo showcase. It stands apart
  // from a real run — its own throwaway hero, no parked-run bookkeeping — so it
  // is checked before (and independent of) the active character. Exiting (a
  // click-anywhere confirm, or an end-of-run MENU) just clears the flag and
  // returns to the title.
  if (demo && demoHero) {
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`game screen failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <GameScreen
            character={demoHero}
            difficulty={DEMO_DIFFICULTY}
            levelId={DEMO_LEVEL_ID}
            skipIntro
            botView
            demo
            onExitToMenu={() => setDemo(false)}
            onQuit={() => setDemo(false)}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // A MINIGAME IS BEING PLAYED ON ITS OWN, off the arcade shelf. Like the demo
  // above it, it stands apart from a run — no hero of its own to mint, no
  // parked-run bookkeeping, nothing banked but the cabinet's high-score board —
  // so it is checked before the active character's run and leaves by simply
  // clearing the flag, landing back on the shelf it was started from.
  if (minigame) {
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`minigame failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <MinigameScreen
            id={minigame.id}
            difficulty={minigame.difficulty}
            heroName={character?.name}
            onExit={() => setMinigame(null)}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // A session is being joined. Before the active hero's own run because it is
  // not one: the run on screen is the host's, the parked-run bookkeeping does
  // not apply, and leaving it drops the connection. What DOES apply is the
  // roster: the hero banked mid-session, so leaving re-reads them —
  // and a hardcore hero who died in there is dead here too.
  if (join && joinHero) {
    const endJoin = () => {
      setJoin(null);
      const refreshed = getActiveCharacter();
      if (!refreshed || refreshed.dead) {
        setActiveCharacterId(null);
        setCharacter(null);
        setStartOnDifficulty(false);
        setPickCreating(false);
        setPicking("manage");
      } else {
        setCharacter(refreshed);
      }
    };
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`session failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <GameScreen
            character={joinHero}
            // The level and difficulty a joined run plays are the HOST's, and
            // they arrive with the welcome — these two are the shape the props
            // require; GameScreen swaps its own difficulty state to the
            // session's the moment the welcome names it.
            difficulty="easy"
            levelId={DEMO_LEVEL_ID}
            join={join}
            onExitToMenu={endJoin}
            onQuit={endJoin}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // A run is playing: hand it to the active hero. (`character` is always set
  // when `run` is — a run can only be started from the title screen, which
  // needs a character.)
  if (run && character) {
    return (
      <ErrorBoundary
        fallback={<RunLoadError />}
        onError={(e) => warn(`game screen failed: ${String(e)}`)}
      >
        <Suspense fallback={null}>
          <GameScreen
            character={character}
            difficulty={run.difficulty}
            levelId={run.levelId}
            skipIntro={run.skipIntro}
            botView={run.botView}
            resume={run.resume}
            // Exited to the menu from the pause screen: keep the frozen run in
            // memory (still paused) so CONTINUE can resume it, and drop to the
            // menu. The run tracks its own current level AND rung, so park the
            // state's — both may have advanced past where the run began (a paid
            // AUTO PILOT ride steps up a difficulty when it beats a campaign).
            onExitToMenu={(state) => {
              const nextParked: ParkedRun = {
                characterId: character.id,
                difficulty: state.difficulty,
                levelId: state.level.id,
                state,
              };
              setParked(nextParked);
              // Persist it too, so an app update (which reloads and wipes memory)
              // leaves CONTINUE intact instead of dropping the run on the floor.
              saveRun(nextParked);
              // Re-read the hero: the run may have banked a victory (new level,
              // beaten difficulty) onto them since the menu was last shown.
              setCharacter(getActiveCharacter());
              setRun(null);
            }}
            // Ended for good (victory/defeat splash MENU): abandon the run and go
            // back to the menu, refreshing the hero (a hardcore death has retired
            // them; a softcore death banked the run; a victory advanced them).
            onQuit={() => {
              setParked(null);
              clearSavedRun();
              setRun(null);
              // Re-read the hero: a victory advanced them, a softcore death kept
              // their run, a hardcore death retired them. A fallen (or missing)
              // hero can't play on — clear the active selection and drop onto the
              // roster so the player sees their fate and picks another; a living
              // hero stays on the title menu for another run.
              const refreshed = getActiveCharacter();
              if (!refreshed || refreshed.dead) {
                setActiveCharacterId(null);
                setCharacter(null);
                setStartOnDifficulty(false);
                setPickCreating(false);
                setPicking("manage");
              } else {
                setCharacter(refreshed);
              }
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // The character roster, opened on top of the title (PLAY with no hero, or
  // CHARACTERS). Picking or creating a living hero makes them active; when PLAY
  // sent us here ("play") the hero either resumes their run or the title mounts
  // on the difficulty ladder, otherwise it returns to the main menu. BACK
  // returns to the title.
  if (picking) {
    const commitPlay = (picked: Character) => {
      setActiveCharacterId(picked.id);
      setCharacter(picked);
      setPicking(null);
      setPickCreating(false);
      if (picking !== "play") {
        // Reached the roster to manage a fallen hero, not to play — back to the
        // title menu, no ladder.
        setStartOnDifficulty(false);
        return;
      }
      // PLAY flow. A hero with a campaign already under way skips the difficulty
      // ladder entirely: LOAD lands them AT HOME — the garage — on their current
      // difficulty, and the doors carry them back out: the car, the rocket and
      // the rift seam list the campaign under the same unlock rules as ever, so
      // their frontier level is exactly one door-tap away. Landing on the
      // frontier's own start instead (what this did before the hub existed)
      // skipped the whole town loop: no counter, no stash run, no kit-out
      // between sessions. A hero with nothing in progress — a freshly minted
      // one, or one who has beaten their current difficulty — opens the ladder
      // instead, to pick a starting lane or step up a rung.
      const target = resumeTargetFor(picked);
      if (target) {
        // Starting a fresh run abandons whatever was parked (in memory + storage).
        setParked(null);
        clearSavedRun();
        setStartOnDifficulty(false);
        setRun({ difficulty: target.difficulty, levelId: "garage" });
        return;
      }
      setStartOnDifficulty(true);
    };
    const leave = () => {
      setStartOnDifficulty(false);
      setPicking(null);
      setPickCreating(false);
    };
    return (
      <>
        {pickCreating ? (
          <NewGame
            onCreate={(name, hardcore) =>
              commitPlay(createCharacter(name, hardcore))
            }
            // The create form is only ever reached straight from the title
            // (PLAY → NEW GAME) or when the roster is empty, so CANCEL always
            // backs out to the title.
            onCancel={leave}
          />
        ) : (
          <LoadGame onPlay={commitPlay} onBack={leave} />
        )}
        <UpdateModal
          needRefresh={pwa.needRefresh}
          incomingVersion={pwa.incomingVersion}
          runInProgress={parked !== null}
          onReload={() => pwa.reload()}
          onDismiss={() => pwa.dismiss()}
        />
      </>
    );
  }

  return (
    <>
      <TitleScreen
        character={character}
        // The LOST & FOUND's buy-back spends the purse and drops the piece into
        // the banked bag — adopt the updated hero so the next run starts from it.
        onCharacterChange={setCharacter}
        onStart={(difficulty, levelId, opts) => {
          // Starting fresh abandons whatever was parked (in memory and storage).
          setParked(null);
          clearSavedRun();
          // Consume the "open on the ladder" (and "open on the shelf") intents
          // so returning to the title after this run lands on the main menu.
          setStartOnDifficulty(false);
          setStartOnMinigames(false);
          setRun({
            difficulty,
            levelId,
            skipIntro: opts?.skipIntro,
            botView: opts?.botView,
          });
        }}
        onNewGame={() => {
          // PLAY → NEW GAME: open straight on the create form, then drop into
          // the difficulty ladder for the freshly-minted hero. CANCEL here
          // returns to the title (not the roster) — the form came from PLAY.
          setStartOnDifficulty(false);
          setStartOnMinigames(false);
          setPickCreating(true);
          setPicking("play");
        }}
        onLoadGame={() => {
          // PLAY → LOAD GAME: open the roster to pick (or retire) a saved hero,
          // then drop into the difficulty ladder for the chosen one. An empty
          // roster has nothing to load, so it opens straight on the create form
          // (whose CANCEL then backs out to the title).
          setStartOnDifficulty(false);
          setStartOnMinigames(false);
          setPickCreating(loadCharacters().length === 0);
          setPicking("play");
        }}
        onHowToPlay={() => {
          setStartOnMinigames(false);
          setDemo(true);
        }}
        // MINIGAMES → a cabinet. It touches no run and no hero, so nothing is
        // parked or cleared on the way in; the shelf is remembered so the title
        // comes back up on it when the lap is over.
        onMinigame={(id, difficulty) => {
          setStartOnMinigames(true);
          setMinigame({ id, difficulty });
        }}
        startOnMinigames={startOnMinigames}
        // JOIN GAME / JOIN BY ADDRESS: watch somebody else's session. It never
        // touches the parked run — a player who ducks out of their own game to
        // watch a friend's comes back to their own exactly where it was.
        onJoin={(intent) => {
          setStartOnMinigames(false);
          setJoin(intent);
        }}
        startOnDifficulty={startOnDifficulty}
        onResume={
          // CONTINUE is the active hero's alone: only offer it when a hero is
          // active, the parked run belongs to them, and they still live.
          parked &&
          character &&
          parked.characterId === character.id &&
          !character.dead
            ? () => {
                setStartOnMinigames(false);
                setRun({
                  difficulty: parked.difficulty,
                  levelId: parked.levelId,
                  resume: parked.state,
                });
                // Consume the parked run: resuming re-arms it live, and keeping
                // the now-stale storage snapshot would only restore old
                // progress on a later reload. Re-parked (and re-saved) if the
                // player exits to the menu again.
                setParked(null);
                clearSavedRun();
              }
            : undefined
        }
      />

      {/* The "a new version is ready" prompt (§11.4.4), fed from the service
          worker reaching `waiting`. A sprite-based panel (pixel font, upgrade
          sprite, chunky buttons) in place of the framework's plain toast so
          it fits the game. Applying reloads onto the new build; dismissing
          leaves it parked. `incomingVersion` is already the full label
          (`v0.1.0 · abc1234`, see pwa/vite.config.ts). With a run parked
          mid-level, UPDATE asks first — the reload only keeps the run when
          the new build still reads the old save format. */}
      <UpdateModal
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        runInProgress={parked !== null}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />

      {/* LAST in the tree, so the menu above it has already mounted (and
          installed its listeners, the title theme's arrival unlock included)
          by the time the card's own effects run. */}
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
    </>
  );
}
