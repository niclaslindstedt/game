// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { CUTSCENE_DEFS, type Difficulty, type GameState } from "@game/core";

import { usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { isNativeApp } from "./app/native.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import {
  createCharacter,
  getActiveCharacter,
  loadCharacters,
  resumeTargetFor,
  setActiveCharacterId,
  type Character,
} from "./game/characters.ts";
import { LoadGame } from "./game/LoadGame.tsx";
import { NewGame } from "./game/NewGame.tsx";
import { CutscenePreview } from "./game/CutscenePreview.tsx";
import {
  clearSavedRun,
  loadSavedRun,
  saveRun,
  type ParkedRun,
} from "./game/saved-run.ts";
import { TitleScreen } from "./game/TitleScreen.tsx";
import { UpdateModal } from "./game/UpdateModal.tsx";

// Lazy for the SEO critical-path budget: the title menu is startup; the
// playable game (and the engine renderer it pulls in) is only reached once a
// run begins, so it loads on demand rather than in the entry chunk.
const GameScreen = lazy(() =>
  import("./game/GameScreen.tsx").then((m) => ({ default: m.GameScreen })),
);

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

  // The pending run: the difficulty and starting level chosen on the menu.
  // null = still on the menu (or roster).
  const [run, setRun] = useState<{
    difficulty: Difficulty;
    levelId: string;
    // Warp-in from the title moon's long-press: skip the prelude and intro
    // monologue and drop straight into the level.
    skipIntro?: boolean;
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
    // The native shell (app/) bundles the game on-device and ships updates
    // through the app store, so the whole PWA update lifecycle stays dormant
    // there — no service-worker registration, no precache, and no "a new
    // version is ready" toast (needRefresh never flips). Players update by
    // downloading a new build. In a browser/PWA it runs as before (idle only
    // in dev). See website/src/app/native.ts.
    enabled: !import.meta.env.DEV && !isNativeApp(),
  });

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
  const sceneId = new URLSearchParams(window.location.search).get("cutscene");
  if (sceneId && sceneId in CUTSCENE_DEFS) {
    return <CutscenePreview id={sceneId} />;
  }

  // A run is playing: hand it to the active hero. (`character` is always set
  // when `run` is — a run can only be started from the title screen, which
  // needs a character.)
  if (run && character) {
    return (
      <Suspense fallback={null}>
        <GameScreen
          character={character}
          difficulty={run.difficulty}
          levelId={run.levelId}
          skipIntro={run.skipIntro}
          resume={run.resume}
          // Exited to the menu from the pause screen: keep the frozen run in
          // memory (still paused) so CONTINUE can resume it, and drop to the
          // menu. The run tracks its own current level, so park the state's
          // level id (which may have advanced past where the run began).
          onExitToMenu={(state) => {
            const nextParked: ParkedRun = {
              characterId: character.id,
              difficulty: run.difficulty,
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
      // ladder entirely: LOAD drops straight into the beginning of their current
      // level at their current difficulty. A hero with nothing in progress — a
      // freshly minted one, or one who has beaten their current difficulty —
      // opens the ladder instead, to pick a starting lane or step up a rung.
      const target = resumeTargetFor(picked);
      if (target) {
        // Starting a fresh run abandons whatever was parked (in memory + storage).
        setParked(null);
        clearSavedRun();
        setStartOnDifficulty(false);
        setRun({ difficulty: target.difficulty, levelId: target.levelId });
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
        onStart={(difficulty, levelId, opts) => {
          // Starting fresh abandons whatever was parked (in memory and storage).
          setParked(null);
          clearSavedRun();
          // Consume the "open on the ladder" intent so returning to the title
          // after this run lands on the main menu, not back on the ladder.
          setStartOnDifficulty(false);
          setRun({
            difficulty,
            levelId,
            skipIntro: opts?.skipIntro,
          });
        }}
        onNewGame={() => {
          // PLAY → NEW GAME: open straight on the create form, then drop into
          // the difficulty ladder for the freshly-minted hero. CANCEL here
          // returns to the title (not the roster) — the form came from PLAY.
          setStartOnDifficulty(false);
          setPickCreating(true);
          setPicking("play");
        }}
        onLoadGame={() => {
          // PLAY → LOAD GAME: open the roster to pick (or retire) a saved hero,
          // then drop into the difficulty ladder for the chosen one. An empty
          // roster has nothing to load, so it opens straight on the create form
          // (whose CANCEL then backs out to the title).
          setStartOnDifficulty(false);
          setPickCreating(loadCharacters().length === 0);
          setPicking("play");
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
          (`v0.1.0 · abc1234`, see website/vite.config.ts). */}
      <UpdateModal
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />
    </>
  );
}
