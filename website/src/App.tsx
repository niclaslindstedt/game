// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { CUTSCENE_DEFS, type Difficulty, type GameState } from "@game/core";

import { usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { cacheIdForBase } from "./app/pwa.ts";
import { CharacterScreen } from "./game/CharacterScreen.tsx";
import {
  getActiveCharacter,
  setActiveCharacterId,
  type Character,
} from "./game/characters.ts";
import { CutscenePreview } from "./game/CutscenePreview.tsx";
import { GameScreen } from "./game/GameScreen.tsx";
import {
  clearSavedRun,
  loadSavedRun,
  saveRun,
  type ParkedRun,
} from "./game/saved-run.ts";
import { TitleScreen } from "./game/TitleScreen.tsx";
import { UpdateModal } from "./game/UpdateModal.tsx";

// The app shell: splash main menu ↔ the playable game. The menu screen also
// owns the PWA update lifecycle so a new deploy can never silently reload
// mid-run.
export function App() {
  // The active hero. null = on the character roster (pick or create one). Every
  // run and the title screen's difficulty ladder belong to this character.
  const [character, setCharacter] = useState<Character | null>(() =>
    getActiveCharacter(),
  );

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
    enabled: !import.meta.env.DEV,
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
        // back to the roster, refreshing the hero (a hardcore death has
        // retired them; a victory has advanced them).
        onQuit={() => {
          setParked(null);
          clearSavedRun();
          setRun(null);
          // Re-read the hero: a victory advanced them, a hardcore death retired
          // them. A fallen (or missing) hero can't play on — clear the active
          // selection so the roster shows their fate; a living hero stays on the
          // menu for another run.
          const refreshed = getActiveCharacter();
          if (!refreshed || refreshed.dead) {
            setActiveCharacterId(null);
            setCharacter(null);
          } else {
            setCharacter(refreshed);
          }
        }}
      />
    );
  }

  // No hero selected: the roster (pick, create, or retire). Creating or picking
  // a living hero makes them active and opens the title screen for them.
  if (!character) {
    return (
      <>
        <CharacterScreen
          onPlay={(picked) => {
            setActiveCharacterId(picked.id);
            setCharacter(picked);
          }}
        />
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
          setRun({
            difficulty,
            levelId,
            skipIntro: opts?.skipIntro,
          });
        }}
        onBack={() => {
          // Switch heroes: back to the roster. The parked run stays put — it's
          // this hero's, offered again as CONTINUE if they're re-selected.
          setCharacter(null);
        }}
        onResume={
          // CONTINUE is the active hero's alone: only offer it when the parked
          // run belongs to them and they still live.
          parked && parked.characterId === character.id && !character.dead
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
