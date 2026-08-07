// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A BODY MOVES — the clip table, and the one place the renderer asks it.
//
// The game's own art is TWO FRAMES PER BODY, and every pass that draws a
// character has known that by heart since the first one: `<sprite>_0` and
// `<sprite>_1`, alternating on a clock while standing and on the ground covered
// while walking, with `<sprite>_cast_0/1` for a boss winding up. That
// convention is not a limitation anybody is unhappy with — it is what a
// sixteen-pixel body drawn in a text editor wants to be, and it stays the
// default here, exactly as it was.
//
// It is also unsayable-past. A mod whose artist drew a six-frame walk cycle had
// nowhere to put frames three through six; a mod that drew a mouth moving had
// no MOMENT to hang it on, because nothing in the game ever asked a body to
// talk. So a mod may ship an `animations.yaml` (schema:
// `scripts/asset-tools/animation-schema.mjs`), the compiler checks every frame
// against the art that will actually be loaded, and this module is what the
// renderer reads instead of building a name.
//
// THREE RULES, and each one is load-bearing:
//
//   * **NO CLIP MEANS NO CHANGE.** Every call site keeps its own fallback and
//     reaches it whenever the table says nothing — which, for the shipped game,
//     is always. This module cannot make the game look different on its own;
//     only a mod can, which is the point.
//   * **A WALK IS DRIVEN BY THE GROUND, NOT BY A TIMER.** `drive: "stride"`
//     takes the gait's own phase (`gait.ts`), so a six-frame cycle speeds up,
//     slows and STOPS with the body exactly as the two-frame one does. A walk
//     on a timer moonwalks the moment its owner is slowed or blocked, and that
//     is the single most obvious way for replaced art to look worse than what
//     it replaced.
//   * **EVERY BODY KEEPS ITS OWN PHASE.** The clock states take a `phase`
//     seeded off the body's id, because the two-frame shimmer always did
//     (`timeMs / 300 + enemy.id`). Drop it and a horde of forty flips in
//     lockstep, which reads as one animation playing forty times rather than as
//     forty things standing there.
//
// The table is REPLACED wholesale on every `applyMods` and cleared by
// `restoreBaseDefs`, like the sprites it names — never merged onto whatever the
// last run left behind.

/** The four moments a body can be in. Kept in step with `CLIP_STATES` in
 * `scripts/asset-tools/animation-schema.mjs`, which is what refuses a fifth. */
export type ClipState = "idle" | "walk" | "talk" | "cast";

/** One animation, as the compiler emits it — every default already filled in. */
export type SpriteClip = {
  /** Sprite names, in play order. At least one. */
  frames: readonly string[];
  /** How long ONE frame is held, for the clock-driven states. */
  delayMs: number;
  /** `stride` advances with the ground covered; `clock` with render time. */
  drive: "clock" | "stride";
};

/** subject → state → clip, as `animations.yaml` compiles to. */
export type SpriteClips = Record<
  string,
  Partial<Record<ClipState, SpriteClip>>
>;

/** The mods' clips. Empty for the shipped game, and that is not a placeholder:
 * the shipped art IS the two-frame convention, which needs no table. */
let clips: SpriteClips = {};

/** Install the enabled mods' clips, replacing whatever was there. */
export function setSpriteClips(next: SpriteClips): void {
  clips = next;
}

/** Back to the shipped game: no clips, so every call site takes its fallback. */
export function clearSpriteClips(): void {
  clips = {};
}

/**
 * The clip for one subject in one state, or undefined when nothing declared it.
 *
 * UNDEFINED IS THE NORMAL ANSWER and callers must treat it as such — it is what
 * the shipped game returns for every body in the game. A caller that cannot
 * write its own fallback is a caller that should not be asking.
 */
export function spriteClip(
  subject: string,
  state: ClipState,
): SpriteClip | undefined {
  return clips[subject]?.[state];
}

/** Where a clip is in its cycle: the render clock, the walker's own stride
 * phase (0..1, from `gait.ts`), and a per-body offset so two of a kind do not
 * animate in lockstep. */
export type ClipAt = {
  timeMs: number;
  /** The gait's phase, when the body has one. A floater, a rover or anything
   * else the renderer tracks no stride for leaves it out, and a `walk` clip
   * falls back to its own clock rather than freezing on frame 0. */
  stride?: number;
  /** A stable per-body number — an entity id, a hashed key. Any scale: it is
   * reduced modulo the frame count, so a raw id works as well as a 0..1 phase. */
  phase?: number;
};

/**
 * WHICH FRAME of a clip is showing — a sprite name, ready for `spriteByName`.
 *
 * A one-frame clip is a pose and short-circuits; everything else is one modulo.
 * The stride path deliberately does NOT round-trip through `delayMs`: the phase
 * is already "how far through a stride is this body", so scaling it by the
 * frame count is the whole conversion, and it is what makes six frames cover
 * the same ground two used to.
 */
export function clipFrame(clip: SpriteClip, at: ClipAt): string {
  // The compiler refuses an empty `frames:` list, so the head is always there —
  // said in the type rather than guarded at runtime, since a clip with no
  // frames has no sensible frame to return.
  const frames = clip.frames as readonly [string, ...string[]];
  if (frames.length === 1) return frames[0];
  const offset = at.phase === undefined ? 0 : Math.abs(Math.trunc(at.phase));
  const step =
    clip.drive === "stride" && at.stride !== undefined
      ? Math.floor(at.stride * frames.length)
      : Math.floor(at.timeMs / clip.delayMs);
  return frames[(step + offset) % frames.length] ?? frames[0];
}

/**
 * The frame a subject is showing in a state, or undefined when it has no clip.
 *
 * The shape every call site wants: one lookup, one modulo, and an answer that
 * is `undefined` exactly when the caller should do what it has always done.
 */
export function clipFrameName(
  subject: string,
  state: ClipState,
  at: ClipAt,
): string | undefined {
  const clip = spriteClip(subject, state);
  return clip === undefined ? undefined : clipFrame(clip, at);
}

/**
 * The frame for a body the ENGINE tells us is moving — the merchant on his
 * beat, a companion keeping up, an escort being walked somewhere.
 *
 * Split from the horde's reading of the same question on purpose. Those three
 * carry a `moving` flag the simulation sets, which is the better answer where
 * it exists: it is true on the frame a body starts walking rather than once its
 * smoothed speed has caught up, and it is false for a body being SHOVED, which
 * is covering ground without walking anywhere. The horde has no such flag and
 * reads its gait instead (`walking()`).
 */
export function actorFrame(
  subject: string,
  moving: boolean,
  at: ClipAt,
): string | undefined {
  return clipFrameName(subject, moving ? "walk" : "idle", at);
}
