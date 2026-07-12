// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rebindable desktop control scheme (SETTINGS → CONTROLS → KEY BINDINGS).
// Every keyboard/mouse control that steers or drives an action is one
// `BindableAction` mapped to a physical binding CODE — `KeyboardEvent.code`
// (layout-independent, so WASD stays WASD on AZERTY), or a synthetic
// `Mouse<button>` / `WheelUp` / `WheelDown` for a pointer bind. The Quake-1
// style menu (label left, key far right) lets a player rebind each one: press
// the row, then press the key or mouse button to bind. This module is the pure
// catalog + code/label helpers — no DOM, no storage — so it stays testable and
// both the menu (rebinding) and the game loop (dispatch) read the same map.

/** Every control a player can rebind. Split into the four steering directions
 * plus the WALK modifier (held), and the discrete one-shot actions. */
export type BindableAction =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "walk"
  | "jump"
  | "useAbility"
  | "weaponMenu"
  | "inventory"
  | "map"
  | "pause"
  | "medkit"
  | "stamina";

/** The live control scheme: one physical binding code per action. An empty
 * string means the action is unbound (a rebind cleared it off a key that got
 * reused elsewhere) — runtime lookups skip empty codes. */
export type KeyBindings = Record<BindableAction, string>;

/** The shipped scheme: WASD steering with the action keys the game grew up on
 * (E powerup, Q weapon menu, I bag, M map, Y achievements, P pause, C/X the
 * consumable dock). Shift walks, Space jumps. Bound by `KeyboardEvent.code` so
 * the physical WASD cluster holds under any keyboard layout. */
export const DEFAULT_KEYBINDINGS: KeyBindings = {
  moveUp: "KeyW",
  moveDown: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  walk: "ShiftLeft",
  jump: "Space",
  useAbility: "KeyE",
  weaponMenu: "KeyQ",
  inventory: "KeyI",
  map: "KeyM",
  pause: "KeyP",
  medkit: "KeyC",
  stamina: "KeyX",
};

/** The menu's row order (Quake-style: steering first, then the actions) with
 * the label shown at the left and the one-line blurb under a selected row. */
export const KEYBIND_ROWS: {
  action: BindableAction;
  label: string;
  blurb: string;
}[] = [
  { action: "moveUp", label: "FORWARD", blurb: "STEER THE HERO UP THE FIELD" },
  { action: "moveDown", label: "BACK", blurb: "STEER THE HERO DOWN THE FIELD" },
  { action: "moveLeft", label: "LEFT", blurb: "STEER THE HERO LEFT" },
  { action: "moveRight", label: "RIGHT", blurb: "STEER THE HERO RIGHT" },
  { action: "walk", label: "WALK", blurb: "HOLD TO WALK INSTEAD OF RUN" },
  { action: "jump", label: "JUMP", blurb: "HOP OVER A GAP OR A SHOT" },
  {
    action: "useAbility",
    label: "USE POWERUP",
    blurb: "SPEND THE OLDEST POWERUP IN THE DOCK",
  },
  {
    action: "weaponMenu",
    label: "WEAPON MENU",
    blurb: "OPEN THE WEAPON SWITCHER (THEN 1-4 TO EQUIP)",
  },
  { action: "inventory", label: "INVENTORY", blurb: "TOGGLE THE BAG" },
  { action: "map", label: "MAP", blurb: "TOGGLE THE LEVEL MAP" },
  { action: "pause", label: "PAUSE", blurb: "PAUSE THE RUN AND ITS MUSIC" },
  {
    action: "medkit",
    label: "USE MEDKIT",
    blurb: "HEAL WITH A MEDKIT FROM THE CONSUMABLE DOCK",
  },
  {
    action: "stamina",
    label: "USE STAMINA",
    blurb: "DRINK A STAMINA POTION FROM THE CONSUMABLE DOCK",
  },
];

/** The steering directions, as unit vectors — the held keys whose sum is the
 * walk heading (see GameScreen). Kept apart from the discrete actions because
 * they read live (held) rather than firing once. */
const MOVE_VECTORS: Record<
  "moveUp" | "moveDown" | "moveLeft" | "moveRight",
  { x: number; y: number }
> = {
  moveUp: { x: 0, y: -1 },
  moveDown: { x: 0, y: 1 },
  moveLeft: { x: -1, y: 0 },
  moveRight: { x: 1, y: 0 },
};

/** The one-shot actions, in the priority order a lookup should resolve them
 * (any duplicate binding — which a rebind should have prevented — takes the
 * first match). Excludes the steering directions and the WALK modifier. */
const DISCRETE_ACTIONS: BindableAction[] = [
  "jump",
  "useAbility",
  "weaponMenu",
  "inventory",
  "map",
  "pause",
  "medkit",
  "stamina",
];

/** The steering vector a held binding code contributes, or null if the code
 * isn't bound to a direction. */
export function moveVectorForCode(
  code: string,
  binds: KeyBindings,
): { x: number; y: number } | null {
  for (const action of [
    "moveUp",
    "moveDown",
    "moveLeft",
    "moveRight",
  ] as const) {
    if (binds[action] === code) return MOVE_VECTORS[action];
  }
  return null;
}

/** The discrete action a binding code fires, or null if the code isn't bound to
 * one (it may still be a steering/walk bind — those are handled separately). */
export function actionForCode(
  code: string,
  binds: KeyBindings,
): BindableAction | null {
  if (!code) return null;
  for (const action of DISCRETE_ACTIONS) {
    if (binds[action] === code) return action;
  }
  return null;
}

/** The synthetic binding code for a mouse button (`MouseEvent.button`): left is
 * 0, middle 1, right 2, and the side buttons 3/4. */
export function mouseButtonCode(button: number): string {
  return `Mouse${button}`;
}

/** The synthetic binding code for a wheel notch. */
export function wheelCode(deltaY: number): string {
  return deltaY < 0 ? "WheelUp" : "WheelDown";
}

// Physical codes whose friendly name isn't just the code minus a "Key"/"Digit"
// prefix. Everything here stays inside the pixel font's glyph set (letters,
// digits, space, dash) so PixelText can draw it.
const CODE_LABELS: Record<string, string> = {
  Space: "SPACE",
  Enter: "ENTER",
  Tab: "TAB",
  Backspace: "BACKSPACE",
  Escape: "ESC",
  ShiftLeft: "L SHIFT",
  ShiftRight: "R SHIFT",
  ControlLeft: "L CTRL",
  ControlRight: "R CTRL",
  AltLeft: "L ALT",
  AltRight: "R ALT",
  MetaLeft: "L META",
  MetaRight: "R META",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  Minus: "MINUS",
  Equal: "EQUALS",
  Comma: "COMMA",
  Period: "PERIOD",
  Slash: "SLASH",
  Semicolon: "SEMICOLON",
  Quote: "QUOTE",
  Backquote: "TILDE",
  BracketLeft: "L BRACKET",
  BracketRight: "R BRACKET",
  Backslash: "BACKSLASH",
  CapsLock: "CAPS",
};

// Quake-style mouse numbering: MOUSE 1 is the left button, MOUSE 2 the right,
// MOUSE 3 the middle (`MouseEvent.button` orders them 0/2/1).
const MOUSE_LABELS: Record<string, string> = {
  Mouse0: "MOUSE 1",
  Mouse1: "MOUSE 3",
  Mouse2: "MOUSE 2",
  Mouse3: "MOUSE 4",
  Mouse4: "MOUSE 5",
  WheelUp: "WHEEL UP",
  WheelDown: "WHEEL DOWN",
};

/** A binding code's on-screen name (all uppercase, glyph-safe). An unbound
 * ("") action shows a dash placeholder. */
export function bindingLabel(code: string): string {
  if (!code) return "---";
  const known = MOUSE_LABELS[code] ?? CODE_LABELS[code];
  if (known) return known;
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6).toUpperCase()}`;
  return code.toUpperCase();
}

/** The physical code for a single printable character (legacy migration from
 * the old single-char consumable binds): a letter → `Key<X>`, a digit →
 * `Digit<N>`, anything else → "" (unbound, falls back to a default). */
export function codeForChar(ch: unknown): string {
  if (typeof ch !== "string" || ch.length !== 1) return "";
  const upper = ch.toUpperCase();
  if (upper >= "A" && upper <= "Z") return `Key${upper}`;
  if (upper >= "0" && upper <= "9") return `Digit${upper}`;
  return "";
}

/** Sanitize a stored bindings object: every action falls back to its default
 * unless a non-empty string is stored for it (an unbound "" is preserved). */
export function sanitizeBindings(stored: unknown): KeyBindings {
  const binds = { ...DEFAULT_KEYBINDINGS };
  if (typeof stored !== "object" || stored === null) return binds;
  for (const action of Object.keys(binds) as BindableAction[]) {
    const value = (stored as Record<string, unknown>)[action];
    if (typeof value === "string") binds[action] = value;
  }
  return binds;
}

/** Bind `action` to `code`, clearing any OTHER action that already held that
 * code so one key never drives two controls (Quake's rebind-steals-the-key).
 * Returns a fresh bindings object. */
export function withBinding(
  binds: KeyBindings,
  action: BindableAction,
  code: string,
): KeyBindings {
  const next = { ...binds };
  for (const other of Object.keys(next) as BindableAction[]) {
    if (other !== action && next[other] === code) next[other] = "";
  }
  next[action] = code;
  return next;
}
