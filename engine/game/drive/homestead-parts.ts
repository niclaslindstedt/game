// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW BIG THE HERO'S OWN PLACE IS — the one table the homestead generator draws
// to and the homestead layout anchors against, and NOTHING else.
//
// ITS OWN FILE, AND THE REASON IS MECHANICAL RATHER THAN TIDY. This is
// `campus-parts.ts`'s rule, for the same reason: the generator that RULES these
// pictures (`scripts/asset-tools/homestead.mjs`) is a plain `node` script run
// with no loader, so every module it reaches has to resolve without the
// `@game/*` aliases. `homestead.ts` beside this one is a `SiteLayout`, and that
// type reaches the crowd's own geometry, and that pulls in `@game/lib`, and the
// build stops before it has drawn a pixel.
//
// So the table is a LEAF: no imports, no engine, nothing but numbers.

/**
 * HOW BIG EVERY PIECE OF THE HOMESTEAD IS (px) — the one table the generator
 * draws to (`scripts/asset-tools/homestead.mjs`) and the layout anchors against.
 *
 * The same rule `CAMPUS_ART_SIZE` exists for: a piece a pixel wider than its
 * entry does not look slightly wrong, it lands somewhere it was not placed. The
 * generator imports THIS, so the picture is the size the plan believes it is by
 * construction rather than by agreement.
 *
 * AND THE SCALE IS THE ROAD'S, NOT THE CUTSCENE'S. The launch scene stages this
 * same lot at 224 px wide (`content/cutscenes/launch.yaml`) and the road is
 * ~422 world px across, so the cutscene's own 48x19 house is a doll's house out
 * here. The gauge to build to is the TOWN's: a single-storey house on this road
 * is about sixty px wide and thirty tall (`townHeight`), so the hero's bungalow
 * is a wide one of those and his ship stands about as tall as a three-storey
 * block — nothing like GOODCO's 168 px stack, which is the joke.
 */
export const HOME_ART_SIZE: Readonly<
  Record<string, readonly [number, number]>
> = {
  /** One bay of the low timber fence along the front of the plot. Tiled. */
  home_fence: [24, 10],
  /**
   * …AND THE GAP IN IT HIS DRIVE COMES OUT OF: two piers with lamps on them and
   * the box the post goes in.
   *
   * It is TALLER THAN THE FENCE by more than half again, and that is the whole
   * job of the piece. This is the finish line as a picture — the thing the
   * player crosses at a hundred and twenty and has to read as an entrance in the
   * frame it is on screen for — and a pair of posts the same height as the
   * palings either side of them is a gap in a fence, not a gate.
   */
  home_gate: [40, 26],
  /**
   * THE HOUSE — `garage_house` at twice the size and twice the detail: the
   * peaked-roof dwelling on the left, the open garage bay joined to its right,
   * one amber window. Twice, near enough, because that is how a cutscene sprite
   * becomes a world sprite (48x19 on a 224-px stage against 96x40 on a 422-px
   * road is the same building at the same apparent size).
   */
  home_house: [96, 40],
  /** A tree on the lawn — `garage_tree`, the same round crown lit down its left
   * side, at the road's own gauge. Two of them, and they are the thing every
   * later fire takes away (`content/cutscenes/launch.yaml`). */
  home_tree: [26, 40],
  /** THE SHIP — `ship_0`, standing where it stands in the launch scene: hard
   * beside the garage door, portholes down the hull, swept fins on the pad. */
  home_ship: [44, 80],
};
