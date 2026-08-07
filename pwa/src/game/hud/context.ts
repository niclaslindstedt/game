// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HUD IS HANDED — the one object the renderer, the widgets and the
// actions all read the live run through.
//
// It is ONE object rather than a prop list threaded down, because the HUD is
// assembled from content: the set of widgets on screen is not known until the
// layout is read, so a prop list would have to name every widget's needs at
// every level it passed through.
//
// TWO SURFACES, ONE SHAPE. The fight's HUD and the road's dashboard are one
// catalog mounted by two screens, so the context is a union discriminated on
// `surface` — the parts every node needs (the values, the fonts, the press
// dispatcher) are common, and a widget that only makes sense on one screen
// narrows to it and draws nothing on the other. That is a type error caught at
// build time rather than a minimap trying to read a wagon.
//
// The refs are the render loop's handles: the loop holds these exact objects
// and writes to their nodes every frame, so an element carrying a `ref:` is
// asking to BE one of them. That seam is what keeps a 60fps stamina bar and a
// ticking minimap out of React entirely.

import type { MutableRefObject, ReactNode, RefObject } from "react";

import type { GameState } from "@game/core";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { GameAssets } from "../assets.ts";
import type { PickupMessage } from "../PickupFeed.tsx";
import type { Hud } from "../game-screen/hud-model.ts";
import type { VoiceLink } from "../net/voice/index.ts";
import type { HudUiState, HudValues } from "./bindings.ts";
import type { HudSurface } from "./types.ts";

/** The DOM handles the render loop writes to every frame. A surface supplies
 * the ones it has; an element asking for one this screen lacks simply is not
 * wired to anything. */
export type HudRefs = {
  minimapCanvas?: RefObject<HTMLCanvasElement | null>;
  xpHeat?: RefObject<HTMLDivElement | null>;
  staminaFill?: RefObject<HTMLDivElement | null>;
  powerupDock?: RefObject<HTMLDivElement | null>;
};

/**
 * The verbs a press may run, by name.
 *
 * A record rather than a fixed shape, because the vocabulary spans both
 * surfaces: the fight supplies `openBag`, the road supplies `driveSkip`, and an
 * authored button carrying one the mounting screen does not provide is a press
 * that does nothing. That is the right answer — it means a mod may put a verb
 * on a button without the compiler having to know which screen the button will
 * end up on.
 */
export type HudAction = (arg?: HudActionArg) => void;

/** A press's `arg:` — a SCALAR, for the same reason a run command's arguments
 * are: anything richer would be a structure two sides have to agree about. */
export type HudActionArg = string | number | boolean;

export type HudActions = Partial<Record<string, HudAction>> & {
  /** Named on the type because the renderer itself calls it — a press marked
   * `close: true` stands the quick-draw switcher down before its verb runs, and
   * every slot the switcher unrolls across is marked that way. */
  toggleWeaponMenu?: HudAction;
};

/** The bottom furniture's own wiring — the queues a press feeds, and which
 * corner each dock hugs. */
export type HudDocks = {
  consumableSide: "left" | "right";
  powerupSide: "left" | "right";
  pickups: PickupMessage[];
  onUseConsumable: (kind: "medkit" | "stamina" | "repair") => void;
  onSpendPowerup: (index: number) => void;
  onDiscardPowerup: (index: number) => boolean;
};

/** What every node needs, whichever screen it is on. */
type HudCommon = {
  surface: HudSurface;
  assets: GameAssets;
  font: PixelFont;
  /** This instant's bindings, read once per publish (see `hudBindings`). */
  values: HudValues;
  refs: HudRefs;
  actions: HudActions;
};

/** The fight's HUD. */
export type HudFieldContext = HudCommon & {
  surface: "field";
  hud: Hud;
  state: GameState;
  ui: HudUiState;
  docks: HudDocks;
  /** The hero avatar button, built by GameScreen because the arrival scene
   * shares the very same node. */
  heroAvatar: ReactNode;
  /** The AUTO PILOT panel, whose session GameScreen owns. */
  autopilotPanel: ReactNode;
  /** A seat's display name off the session roster — the engine's Player carries
   * none. Null when nothing can answer (offline, a test). */
  seatName?: (seat: number) => string | null;
  /**
   * VOICE CHAT for this session — who is talking and how loud, for the
   * `voiceCards` widget.
   *
   * Beside `seatName` because it is the same kind of thing: a fact about the
   * SESSION that the engine's state cannot answer, owned by GameScreen and read
   * by one widget. Absent for every run without voice — a build with no `voice`
   * capability, a local game, a browser — which is what makes the widget draw
   * nothing rather than needing a gate in the layout.
   */
  voice?: VoiceLink | null;
  /** Latched so BOT VIEW's autopilot won't clear a timer-tap pause before the
   * menu can show (see the sim loop). */
  userPausedRef: MutableRefObject<boolean>;
  bumpUi: () => void;
};

/** The road's dashboard. It carries no run state at all: a drive is its own
 * little simulation, and the dials read the values the screen published. */
export type HudDriveContext = HudCommon & {
  surface: "drive";
};

export type HudContext = HudFieldContext | HudDriveContext;
