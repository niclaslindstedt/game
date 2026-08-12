// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parking the in-progress run in storage, so it survives a page reload — most
// importantly the one an app update forces. A run exited to the menu used to
// live only in React memory: applying a PWA update reloads the page, memory is
// wiped, and the CONTINUE button vanished with it (the exact bug this fixes).
//
// IT IS ALSO WRITTEN WHILE THE RUN IS STILL BEING PLAYED — every few seconds of
// progress, and on every backgrounding — so a phone that kills the app from the
// app switcher (which fires no unload event a page could listen for) leaves a
// run to come back to rather than nothing at all. See
// game-screen/autosave.ts for the cadence; this module is only the freezer.
//
// The whole engine GameState is plain JSON apart from its `rng` closure, so we
// serialize the state as-is and snapshot the rng's internal position beside it,
// rebuilding the generator on load so a resumed run picks up the exact same
// stream (proven in tests/engine/persistence_test.ts).

import { localHero } from "./local-seat.ts";
import {
  adoptEquipment,
  hasLevel,
  isLiveItemSlot,
  mapCols,
  mapRows,
  warn,
  UNARMED_DEF_ID,
} from "@game/menu";
import type { Difficulty, Equipment, GameState } from "@game/menu";

import { createRngFromState, rngState } from "@game/lib/rng.ts";

import { storageKey } from "../identity.ts";

const KEY = storageKey("current-run");

/**
 * THE SECOND SLOT — the field a rift portal was stepped out of.
 *
 * `current-run` is "the run you are in the middle of", parked when the app is
 * backgrounded or exited to the menu, and there can only ever be one of those.
 * The TOWN PORTAL needs another: stepping home through a tear leaves a field
 * standing on the other side, and the hub run that follows immediately claims
 * `current-run` for itself. Parked in the same freezer on its own key, so going
 * home to sell and coming back survives an app update exactly as CONTINUE does
 * — and so a crash between the two costs the field rather than the hero.
 *
 * SOLO ONLY, and the reason is the session's: a session holds one level and
 * every crossing moves the whole party, so in company there is no field of
 * yours to freeze — your friends are standing on it. See issue #952.
 */
const RIFT_KEY = storageKey("rift-parked-run");

/** The stand-in `explored` a thawed state carries for the one statement
 * between spreading the blob and `reviveExplored` replacing it. */
const EMPTY_FOG = new Uint8Array(0);

// Bump this whenever the serialized GameState shape changes in a way an older
// snapshot can't be read into. A mismatched (or unparseable) blob is dropped
// rather than resumed, so a stale run from a previous build never crashes the
// thaw — the CONTINUE button simply doesn't appear, as it wouldn't have before.
// v2: companions/choice/companionFocus joined the state (a v1 run would thaw
// without the party fields and crash the companion pass).
// v3: levelUpFxMs (the ding-celebration countdown) joined the state.
// v4: characterId joined the park — a parked run belongs to the character that
// was playing it, so CONTINUE only offers to resume the ACTIVE character's run.
// v5: outroPage + quakeMs (the post-victory epilogue and its quake) joined the
// state, plus the `outro` GamePhase.
// v6: menaceFloor/evoProof (the evolution ratchet) and campAnchor/campMs/
// trickleMs (the camping-starvation spawner) joined the state.
// v7: gates (travel gates torn open by a used key — the bunker door) joined
// the state; an older snapshot would thaw without the field and crash
// stepGates.
// v8: packs (placed clusters that sleep until the player nears them) joined
// the state; an older snapshot would thaw without the field and crash
// stepPacks.
// v9: combatGraceMs (the farm-proof survival clock's grace tail) joined the
// state, and stats grew combatMs/peakMenace; an older snapshot would resume
// with those undefined and tick the clock to NaN.
// v10: companions grew their own level/XP (`xp`/`xpToNext` — decoupled from the
// hero, see companion-stats.ts); a v9 companion would thaw without an XP bar and
// never level, so its power scaling would be wrong.
// v11: the mana/spell system — the hero grew mana/maxMana/manaRegenMs/hpRegenMs/
// shield fields, a SPIRIT stat, spellSlots/spellCooldowns, and a manaPotions
// stack; stats grew manaSpent/spellsCast and the state a pendingSpellUnlocks
// queue. A v10 snapshot would thaw without a mana pool (casting → NaN) and
// without spirit in its stat record.
// v12: the cast QUEUE + GLOBAL cooldown — the hero grew spellQueue/
// globalCooldownMs (a press now enqueues, drained one cast per global cooldown).
// A v11 snapshot would thaw without a queue and crash stepSpellQueue.
// v13: sand storms — the state grew sandstorms/sandstormTimerMs and the hero a
// knockoutMs. A v12 snapshot would thaw without a storm list (stepSandstorms
// reads .length on undefined) and without the knockout timer.
// v14: employee stampedes — the state grew stampedes/stampedeTimerMs. A v13
// snapshot would thaw without a herd list (stepStampedes reads .length on
// undefined).
// v15: the stampede approach-dust telegraph — the state grew stampedeWarn (the
// lane the next herd will charge down, lit ahead of the spawn). A v14 snapshot
// would thaw with it undefined and stepStampedes would age `undefined.ageMs`.
// v16: AUTO PILOT — the state grew the `autopilot` meter block. A v15 snapshot
// would thaw without it and stepAutopilot would read `undefined.active`.
// v17: the working floor — enemies grew the dormant work/patrol/alarm
// bookkeeping (workRng/workTarget/patrol/alarms…) and spawners the
// alarmedUntilMs window. All optional, but a v16 snapshot would thaw a
// pinned patroller without its route and freeze it mid-floor.
// v18: stats grew `jumps` (the takeoff counter the balance sim reports). A
// v17 snapshot would thaw with it undefined and count NaN takeoffs.
// v19: passive TALENTS — the player grew `talents` (id→rank) and the state a
// `pendingTalentPoints` picker queue. A v18 snapshot would thaw a hero with an
// undefined talent map (the effect reads would fault) and no picker queue.
// v20: cast spells and MANA are gone — the player shed its mana pool, spell
// bar/queue/cooldowns, buff/shield timers, and mana potions, and the state its
// `pendingSpellUnlocks` queue. A v19 snapshot would thaw a hero the new engine
// no longer reads those fields on (and would still carry the retired spell UI).
// v21: the SPIRIT stat and the health regen it drove are gone — the player shed
// `hpRegenMs` and the `spirit` key of its stat records. A v20 snapshot would
// thaw a hero whose banked SPIRIT points the chooser can no longer show or
// refund (the loadout path refunds them; a parked mid-run state can't).
// v22: the FINITE STALL — every merchant stock entry carries a `qty` (spent
// down by purchases, nothing restocks) in place of the weapon-only `sold` flag,
// and the stall grew a consumable shelf. A v21 snapshot would thaw a counter
// whose every entry reads `qty: undefined`, which `buyStock` refuses outright —
// a shop that silently sells nothing.
// v23: THE PARTY — the run carries `players`, a list of heroes, in place of the
// single `player`. A v22 snapshot would thaw a run with no party at all, and
// every pass in the pipeline reads seat 0 on its first line; there is nothing
// left to resume.
// v24: AMMUNITION and GOLD — every hero grew the `ammo` pouch (required; read
// by `ammoCount` on the HUD build of the very first frame, so a v23 hero
// without one froze the resume on a still image with no UI at all), and stats
// grew `goldCollected`/`coinsSold` (a v23 snapshot would tick them to NaN on
// the first pile of gold).
// v25: THE VEHICLES — the state grew `vehicles` (the garage's car and ship)
// and `wheelDebris` (wheels torn off, bouncing or at rest). Both are arrays
// `stepVehicles` iterates on every tick, so a v24 snapshot would crash the
// resume's very first step.
// v26: PER-PLAYER SCREENS — `state.phase` lost its eleven UI
// members to `Player.screen`, and `pendingTalentPoints`/`companionFocus`
// moved from the run onto the hero. A v25 blob was parked from the pause
// screen, so essentially every one carries `phase: "paused"` — a value the
// union no longer holds — and its talent queue sits where nothing reads it.
//
// v27: THE TOWN PORTAL — the run grew `keepsakes`, the rift tool's own record
// of where a seam has been torn home from.
// v28: THE CACHE — the garage chest (engine/game/cache.ts). `Player.cache` is a
// required list the engine indexes unguarded (`stashItem`), and the run grew
// `cachePos`/`cacheSlots`, which decide whether the chest is standing at all
// and how much of it the hero has earned. A v27 blob carries none of the three,
// so a thaw would hand the stash verbs an `undefined` grid and draw a chest
// nobody can open.
//
// (27 AND 28 WERE THE SAME NUMBER FOR A MOMENT: the town portal and the chest
// were in flight together and each bumped 26 → 27 on its own branch. The merge
// took the union of the two SHAPES and would have kept one number for three
// different states, which is precisely the skew the guard exists to refuse —
// hence the split. When two branches both bump, the second one to land re-bumps
// rather than agreeing.)
//
// v29: THE SCENE TAGS AND THE CHAIN'S LANDING — `cutsceneTags`, the run's own
// memory handed to every
// prelude scene it raises (`CutsceneProp.needs` / `until`, engine/lib/
// cutscene.ts). It decides which dressing a scene is played with — whether the
// launch stands beside a whole house or the burnt one — and the chain reads it
// again for every scene after the first, so a v28 blob would thaw into an
// `undefined` list and take the swap with it. `cutsceneThen` joined it in the
// same shape: it says which END of the run a running chain belongs to (a
// prelude lands on the hero's monologue, a level's `farewell` on the epilogue
// and the splash), and a blob thawed without it would send a skipped send-off
// to the level-name title card.
//
// The shape-drift guard in tests/saved_run_test.ts fails when GameState, a
// hero, or the stats record grows a field this version doesn't know — bump
// here (and update the guard's lists) in the SAME commit as the shape change,
// or the next release resumes old snapshots into a state the engine can't read.
export const SAVE_VERSION = 29;

/** A run parked between sessions: enough to drop the player straight back in. */
export type ParkedRun = {
  /** The character whose run this is — CONTINUE is theirs alone. */
  characterId: string;
  difficulty: Difficulty;
  levelId: string;
  state: GameState;
};

type Serialized = {
  v: number;
  characterId: string;
  difficulty: Difficulty;
  levelId: string;
  // The rng closures can't be serialized; each stream's position is snapshotted
  // here and the generators rebuilt on load, so a resumed run replays the exact
  // same loot AND damage-variance sequence a live one would.
  rngState: number;
  fxRngState: number;
  goldRngState: number;
  // The fog grid as a base64 BITFIELD (see packExplored). Absent on a blob
  // written before the packing landed — those carry the grid inside `state`
  // instead, which `reviveExplored` still reads.
  fog?: string;
  // The GameState verbatim minus its rng streams (restored on load) and minus
  // the fog grid (carried packed, above). `events` is transient per-step
  // chatter, blanked so a resume doesn't replay stale sfx.
  state: Omit<GameState, "rng" | "fxRng" | "goldRng" | "explored"> & {
    explored?: Uint8Array;
  };
};

/**
 * The fog grid as a base64 bitfield — one BIT per tile, not one JSON number.
 *
 * `JSON.stringify` spells a `Uint8Array` out as `{"0":0,"1":1,…}`, which on a
 * 119×99 map is ~104 KB of the ~320 KB blob: a quarter of every write, for a
 * grid that only ever holds 0 or 1. Packed it is ~1.5 KB. That was tolerable
 * while a run was parked once per session and is not now that the autosave
 * writes every few seconds of play on a phone.
 */
function packExplored(explored: Uint8Array): string {
  const bytes = new Uint8Array((explored.length + 7) >> 3);
  for (let i = 0; i < explored.length; i++) {
    if (explored[i] === 1) {
      const byte = i >> 3;
      bytes[byte] = (bytes[byte] ?? 0) | (1 << (i & 7));
    }
  }
  // `String.fromCharCode(...bytes)` in one call blows the argument limit on a
  // big map, so the string is built in chunks.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Unpack {@link packExplored} back into a `size`-long grid. Sized from the
 * LEVEL rather than from the string, so a truncated or foreign blob still
 * yields a full, correctly-indexed grid (the tail simply reads dark). */
function unpackExplored(packed: string, size: number): Uint8Array {
  const binary = atob(packed);
  const grid = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    // Past the end `charCodeAt` is NaN, and `NaN & n` is 0 — a dark tile.
    if (binary.charCodeAt(i >> 3) & (1 << (i & 7))) grid[i] = 1;
  }
  return grid;
}

/** Freeze the parked run to storage. Best-effort — a storage failure is logged, not thrown. */
export function saveRun(run: ParkedRun): void {
  writeRun(KEY, run);
}

/** THE TOWN PORTAL'S FAR SIDE: park the field this hero just stepped out of,
 * so the seam at home can put them back on it exactly as they left it. */
export function saveRiftRun(run: ParkedRun): void {
  writeRun(RIFT_KEY, run);
}

/** Thaw the field parked on the other side of a rift portal, or null when
 * there is none / it is unreadable / an older build wrote it. Same freezer and
 * the same refusals as `loadSavedRun`; WHOSE it is is the caller's check. */
export function loadRiftRun(): ParkedRun | null {
  return readRun(RIFT_KEY);
}

/** Drop the parked field — on return, on abandonment, or when a second trip
 * home replaces it. */
export function clearRiftRun(): void {
  removeRun(RIFT_KEY);
}

function writeRun(key: string, run: ParkedRun): void {
  try {
    const { rng, fxRng, goldRng, explored, ...rest } = run.state;
    const payload: Serialized = {
      v: SAVE_VERSION,
      characterId: run.characterId,
      difficulty: run.difficulty,
      levelId: run.levelId,
      rngState: rngState(rng),
      fxRngState: rngState(fxRng),
      goldRngState: rngState(goldRng),
      fog: packExplored(explored),
      // `events` is transient per-step chatter; blank it so a resume doesn't
      // replay stale sfx (it's overwritten again on the first step anyway).
      state: { ...rest, events: [] },
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    warn(`could not save the current run: ${String(err)}`);
  }
}

/** THE EMPTY HAND — what a thawed loadout falls back to when its equipped
 * weapon is a legacy piece whose base the catalog has since dropped. The hand
 * is typed never-empty, so the resume needs SOMETHING there; handing the player
 * his own hands is the honest answer, and he can equip whatever the bag still
 * carries. */
function fallbackWeapon(): Equipment {
  return {
    id: 0,
    defId: UNARMED_DEF_ID,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/**
 * Re-home every kept item in a thawed run onto its frozen def snapshot, so a
 * base we rebalanced or deleted since the run was parked can neither nerf the
 * player's gear nor crash the resume. The equipped weapon can never adopt to
 * nothing (it falls back to the sidearm); a bag cell or ground drop that can't
 * be resolved (a legacy piece whose base is gone) is simply cleared/removed.
 */
function adoptRunEquipment(state: GameState): void {
  const equip = localHero(state).equipment;
  equip.weapon = adoptEquipment(equip.weapon) ?? fallbackWeapon();
  // A pre-revamp run may carry a kind this build has no home for (the old
  // `suit` slot) — adopt what still exists, leave the rest behind. Note the
  // guard asks about the item KIND, not about a key on `equip`: a `ring` is
  // live even though the record keys are `ring1`/`ring2`, and a `trinket` is
  // live while never being worn at all.
  const adoptWorn = (piece: Equipment | null | undefined): Equipment | null =>
    piece && isLiveItemSlot(piece.slot) ? adoptEquipment(piece) : null;
  equip.head = adoptWorn(equip.head);
  equip.chest = adoptWorn(equip.chest);
  equip.legs = adoptWorn(equip.legs);
  equip.feet = adoptWorn(equip.feet);
  equip.amulet = adoptWorn(equip.amulet);
  equip.ring1 = adoptWorn(equip.ring1);
  equip.ring2 = adoptWorn(equip.ring2);
  // The second arm — `offhand` now, `bag` in a run parked before it grew to
  // hold a shield.
  equip.offhand = adoptWorn(
    equip.offhand ?? (equip as { bag?: Equipment | null }).bag ?? null,
  );
  delete (equip as { bag?: Equipment | null }).bag;
  // A parked run from before the revamp may have a WORN charm; it is a carried
  // trinket now, so it moves into the bag (dropped only if the bag is full,
  // like any other over-capacity carry).
  const legacyCharm = adoptWorn(
    (equip as { charm?: Equipment | null }).charm ?? null,
  );
  delete (equip as { charm?: Equipment | null }).charm;
  localHero(state).inventory = localHero(state).inventory.map((cell) =>
    cell && isLiveItemSlot(cell.slot) ? adoptEquipment(cell) : null,
  );
  if (legacyCharm) {
    const free = localHero(state).inventory.indexOf(null);
    if (free !== -1) localHero(state).inventory[free] = legacyCharm;
  }
  state.items = state.items.filter((item) => {
    if (item.kind !== "equipment") return true;
    const adopted = adoptEquipment(item.equipment);
    if (!adopted) return false;
    item.equipment = adopted;
    return true;
  });
  // The party's kit adopts the same way — a companion can never resume
  // weaponless, and an unresolvable armor piece is simply left behind.
  for (const companion of state.companions) {
    companion.equipment.weapon =
      adoptEquipment(companion.equipment.weapon) ?? fallbackWeapon();
    companion.equipment.head = companion.equipment.head
      ? adoptEquipment(companion.equipment.head)
      : null;
    companion.equipment.chest = companion.equipment.chest
      ? adoptEquipment(companion.equipment.chest)
      : null;
  }
}

/**
 * Rebuild `state.explored` as a real `Uint8Array`. `JSON.stringify` turns the
 * fog grid's typed array into a plain object (`{"0":0,"1":1,…}`), and
 * `JSON.parse` leaves it that way — so a thawed run's `explored` has no
 * `.length` and none of the typed-array semantics the fog renderers lean on.
 * Both the main-view fog field (render.ts) and the minimap (Minimap.tsx) size
 * their invalidation off `explored.length`, which is `undefined` on the plain
 * object → the reveal count reads 0 forever → the cached fog never rebuilds and
 * the map freezes at the resumed frontier (the "fog won't clear after resume"
 * bug). Reviving to the level-sized typed array on load restores every consumer
 * at once. Sized from the level (not the object's key count) so a partial or
 * corrupt blob still yields a full, correctly-indexed grid.
 *
 * A blob written since the packing landed carries the grid as a base64
 * bitfield beside the state instead, and takes the first branch; the plain
 * object below is what a blob parked by an older build of this same save
 * version still looks like.
 */
function reviveExplored(state: GameState, packed?: string): void {
  const size = mapCols(state.level) * mapRows(state.level);
  if (packed !== undefined) {
    state.explored = unpackExplored(packed, size);
    return;
  }
  if (state.explored instanceof Uint8Array) return;
  const grid = new Uint8Array(size);
  const raw = state.explored as unknown;
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && idx >= 0 && idx < size) {
        grid[idx] = value ? 1 : 0;
      }
    }
  }
  state.explored = grid;
}

/**
 * UN-BOOK A DEPARTURE THE ROAD WAS TAKEN OFF — the one thaw that would
 * otherwise be a dead end, and on an iOS home-screen PWA it is the ordinary way
 * out of a minigame.
 *
 * A run parked while the DRIVE was up is parked at a very particular instant.
 * The car has left the property, the dim has run its course and `carDeparted`
 * has already fired (`stepDeparture`, engine/game/vehicles.ts) — the app caught
 * that event, raised the road over the still-mounted run and froze it there
 * (`beginDrive`, GameScreen.tsx). The ROAD lives only in React memory, so a
 * kill from the app switcher takes it and leaves the frozen run behind: the
 * autosave's backgrounding flush is the last code the page runs, and what it
 * writes is a garage the car has already driven out of, with `booked` latched so
 * nothing can ever book the trip a second time.
 *
 * Thawed as-is that is a full-black curtain (the app paints the dim off
 * `departure.ms`, which is past its end) over a hub nobody can reach, with no
 * HUD, no pause menu and no way out — CONTINUE leading there every launch. So
 * the latch is dropped on the way in: `ms` is deliberately LEFT where it was,
 * which is what makes the resumed run open already black rather than flashing
 * the garage it left, and the first simulated tick pushes `carDeparted` again.
 * The app answers it exactly as it did a minute ago and the leg opens on its
 * title card — the same road, from the top (`DriveIntro`).
 *
 * Every other way the crossing can be booked leaves nothing here to heal: with
 * the road declined (`driveParamsFor` → null) the trip travels on the spot and
 * the destination's own fresh state is what gets parked, and a departure caught
 * mid-dim is parked UNBOOKED and simply finishes its clock. So this fires on
 * exactly the states the drive stranded — including the ones already sitting in
 * a player's storage, which is why the fix is a repair on the thaw rather than a
 * `SAVE_VERSION` bump that would bin every healthy parked run beside them.
 */
function rebookDeparture(state: GameState): void {
  if (state.departure?.booked === true) state.departure.booked = false;
}

/** Drop any parked run — called when one is resumed, abandoned, or replaced. */
export function clearSavedRun(): void {
  removeRun(KEY);
}

function removeRun(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // A storage that won't delete is a storage that won't persist either;
    // nothing to recover, so stay silent.
  }
}

/**
 * Thaw the parked run from storage, or null if there's none / it's unreadable
 * / it was written by an incompatible build. Any such blob is cleared so it
 * can't wedge future loads.
 */
export function loadSavedRun(): ParkedRun | null {
  return readRun(KEY);
}

function readRun(key: string): ParkedRun | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Serialized;
    // Reject anything from an older/newer save format, or parked on a level a
    // later build has since retired — either way it can't be resumed cleanly.
    if (
      !payload ||
      payload.v !== SAVE_VERSION ||
      typeof payload.levelId !== "string" ||
      !hasLevel(payload.levelId)
    ) {
      removeRun(key);
      return null;
    }
    const state: GameState = {
      ...payload.state,
      // Stood up by `reviveExplored` below — from the packed bitfield when the
      // blob carries one, from the plain object left in `state` when it
      // doesn't. Placeholder here only so the shape is complete before then.
      explored: payload.state.explored ?? EMPTY_FOG,
      events: [],
      rng: createRngFromState(payload.rngState),
      // Restore the flavor stream too (older saves predate it — fall back to a
      // seed derived from the loot position so they resume without a crash).
      fxRng: createRngFromState(
        payload.fxRngState ?? (payload.rngState ^ 0x9e3779b9) >>> 0,
      ),
      // …and the GOLD stream, on the same terms: a save written before gold
      // shipped has no position for it, so it resumes from a seed derived off
      // the loot stream's rather than crashing the run it was parked from.
      goldRng: createRngFromState(
        payload.goldRngState ?? (payload.rngState ^ 0x1f83d9ab) >>> 0,
      ),
      // The trader's BUY-BACK shelf is purely additive — a run parked before it
      // shipped simply has nothing on it — so it is defaulted here rather than
      // paid for with a SAVE_VERSION bump that would bin every parked run for a
      // list that starts empty anyway.
      // …and the trader's HALT timer and his pulse are additive on exactly the
      // same terms: a run parked before the street dealer shipped has a trader
      // who never walked anywhere, so zero and alive are what he always was.
      // `haltMs` in particular must not thaw undefined — it is arithmetic every
      // tick, and NaN there is a trader who can never be hailed again.
      merchant: {
        ...payload.state.merchant,
        buyback: payload.state.merchant?.buyback ?? [],
        haltMs: payload.state.merchant?.haltMs ?? 0,
        dead: payload.state.merchant?.dead ?? false,
      },
      // PLAYER CORPSES are purely additive on the same reasoning as the
      // buy-back shelf above: a run parked before they shipped simply has none
      // — and a SOLO run can never have one at all — so an empty default beats
      // a SAVE_VERSION bump that bins every parked run for a list that starts
      // empty anyway.
      corpses: payload.state.corpses ?? [],
      // THE STAFF LOT (`GameState.arrivals`, engine/game/arrivals.ts) is additive
      // on the same reasoning, with one wrinkle worth stating: a run parked
      // before it shipped thaws with NO PLAN, and no plan means the beat simply
      // never runs — which is right. That run's entrance is already open (it
      // was an approach door when the blob was written) or the run is on a
      // level that never had one, so a resumed hero is never locked out by a
      // door no arrival is coming to badge. `arrivalTimerMs` must not thaw
      // undefined: it is counted down every tick, and NaN there is a car park
      // whose next car never comes.
      arrivals: payload.state.arrivals ?? [],
      arrivalTimerMs: payload.state.arrivalTimerMs ?? 0,
      arrivalPlan: payload.state.arrivalPlan ?? null,
      // THE RACK (`CarVehicle.steer`) is defaulted on the same reasoning, and
      // it is the case where it MATTERS: `steerCar` integrates that number
      // every tick somebody is at the wheel, so a car parked before the front
      // wheels steered would thaw with `undefined` there and take its heading —
      // then its position — to NaN the moment the key was turned. One zero
      // beats a SAVE_VERSION bump that bins every parked run over it.
      vehicles: (payload.state.vehicles ?? []).map((vehicle) =>
        vehicle.kind === "car"
          ? { ...vehicle, steer: vehicle.steer ?? 0 }
          : vehicle,
      ),
      // THE HERO'S OWN FRAG COUNT (`Player.kills`, the party scoreboard's
      // column) is defaulted on exactly the rack's reasoning: `killEnemy`
      // increments it on every kill, so a run parked before the board shipped
      // would thaw with `undefined` there and take the count to NaN on the
      // first thing the hero felled — a readout that reads NaN for the rest of
      // the run. One zero beats a SAVE_VERSION bump that bins every parked run
      // over a number that starts at zero anyway.
      players: payload.state.players.map((hero) => ({
        ...hero,
        kills: hero.kills ?? 0,
      })) as GameState["players"],
    };
    // Rebuild the fog grid as a real Uint8Array — JSON round-trips it to a
    // plain object, which freezes the fog renderers (see reviveExplored).
    reviveExplored(state, payload.fog);
    // Hand a stranded drive-out back its trip, so a run parked while the ROAD
    // was up resumes onto the road instead of behind a black curtain nothing
    // can lift (see rebookDeparture).
    rebookDeparture(state);
    // Freeze every kept item to its dropped-with stats before the run resumes,
    // so a catalog edge that landed while the run was parked can't reach it.
    adoptRunEquipment(state);
    return {
      characterId: payload.characterId,
      difficulty: payload.difficulty,
      levelId: payload.levelId,
      state,
    };
  } catch (err) {
    warn(`ignoring an unreadable saved run: ${String(err)}`);
    removeRun(key);
    return null;
  }
}
