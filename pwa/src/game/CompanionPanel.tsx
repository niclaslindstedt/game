// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The companion equip screen (Diablo-2 mercenary style): shown while the
// local hero's `companion` screen is up after tapping a party portrait.
//
// The screen answers TWO questions and is laid out around them. WEARING is a
// row per slot — the frame, the slot's name, and the NAME of the piece in it —
// because a grid of three unlabelled icons never said what the companion had
// on. YOUR BAG is the hero's own carry with the pieces a companion can wear
// lit and counted, so "what can I put on it" is answered before a single tap.
//
// A companion dresses in three slots — weapon, helmet, chest; never legs or
// feet. Tapping a lit bag piece equips it (whatever it replaces drops into
// that cell); tapping a worn HELMET or CHEST takes it back. The weapon is the
// exception the engine enforces: a companion always fights with something, so
// its weapon can only ever be swapped, never emptied.
//
// The panel mutates the (paused) engine state through the companion API and
// calls `onChange` so React re-reads it.

import { localHero } from "./local-seat.ts";
import {
  COMPANION_SLOTS,
  companionById,
  companionDef,
  companionPowerRank,
  companionWeaponDamage,
  itemLevelReq,
  equipmentName,
  meetsLevelReq,
  weaponDef,
  type CompanionSlot,
  type Equipment,
  type GameState,
} from "@game/core";

import { clamp01 } from "@game/lib/vec.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { bustSrc } from "./SpritePortrait.tsx";
import { synth } from "./audio.ts";
import { ItemIcon } from "./ItemCard.tsx";
import { slotGlyph } from "./item-glyph.ts";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

import { runCommandOk } from "./run-commands.ts";

const SLOT_LABELS: Record<CompanionSlot, string> = {
  weapon: "WEAPON",
  head: "HELMET",
  chest: "CHEST",
};

/** How wide a worn piece's name may run before it wraps, in rem — the WEARING
 * column's inner width less its frame and gaps. Keep in step with
 * `.companion-worn` in styles.css. */
const WORN_NAME_REM = 9.5;

/** Dim grey for a label, and the dimmer grey an EMPTY line reads in. */
const LABEL = "#9aa3ad";
const FAINT = "#5a626c";

/**
 * WHICH companion slot this bag piece would land in, or null for a piece no
 * companion can wear. Derived from the engine's own `COMPANION_SLOTS` rather
 * than from a second list of slot names here, so the screen can never offer a
 * piece `equipCompanionFromInventory` will refuse.
 */
function companionSlotOf(item: Equipment): CompanionSlot | null {
  return COMPANION_SLOTS.find((slot) => slot === item.slot) ?? null;
}

/** An empty frame says what it wants: the slot's own glyph, ghosted — the
 * paper doll's idiom (see `.doll-ghost`), so an unfilled companion slot reads
 * as an outline of the piece that belongs there. */
function SlotGhost({
  sprites,
  slot,
}: {
  sprites: Sprites;
  slot: CompanionSlot;
}) {
  const src = spriteDataUrl(sprites, slotGlyph(slot));
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="pixel-img companion-slot-ghost"
      draggable={false}
    />
  );
}

export function CompanionPanel({
  state,
  font,
  sprites,
  onChange,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
  onClose: () => void;
}) {
  // The hero may already be back on the field for a frame while React's hud
  // snapshot still says `companion` (the render loop throttles it) — a stale
  // focus renders nothing and the next hud tick unmounts the panel. Never
  // mutate state from render.
  const hero = localHero(state);
  const focus = hero.companionFocus;
  const companion =
    focus !== undefined ? companionById(state, focus) : undefined;
  if (!companion) return null;
  const def = companionDef(companion.defId);
  const portrait = bustSrc(sprites, def.sprite);
  const downed = companion.downed === true;
  // The XP bar toward the next level, clamped for a clean fill.
  const xpFrac =
    companion.xpToNext > 0 ? clamp01(companion.xp / companion.xpToNext) : 0;
  const powerRank = def.power ? companionPowerRank(def, companion.level) : 0;

  // How much of the carry this companion could actually take. Counted here so
  // the bag's heading can SAY it — the one line that answers "what can I put
  // on it" without the player tapping every cell to find out.
  const fits = hero.inventory.filter(
    (item) =>
      item !== null &&
      companionSlotOf(item) !== null &&
      meetsLevelReq(state, hero, item),
  ).length;

  return (
    <div className="game-overlay companion-overlay">
      <div className="inventory-panel companion-panel">
        {/* The companion's card: face, name, health, and its signature trick. */}
        <div className="companion-head">
          <span className="companion-face">
            {portrait ? (
              <img src={portrait} alt="" className="pixel-img" />
            ) : null}
          </span>
          <div className="companion-title">
            <PixelText font={font} text={def.name} scale={3} color="#ffd75e" />
            {/* Level + the XP bar toward the next one — a companion trains by
                fighting and levels on its own (see companion-stats.ts). */}
            <PixelText
              font={font}
              text={`LEVEL ${companion.level}`}
              scale={2}
              color="#7ef0c8"
            />
            <span className="companion-xp-bar" aria-label="companion-xp">
              <span
                className="companion-xp-fill"
                style={{ width: `${Math.round(xpFrac * 100)}%` }}
              />
            </span>
            <PixelText
              font={font}
              text={
                downed
                  ? "DOWN - USE SMELLING SALTS"
                  : `HP ${Math.ceil(companion.hp)}/${companion.maxHp}`
              }
              scale={2}
              color={downed ? "#d83a3a" : LABEL}
            />
            {/* The signature POWER and its current rank — the trick that grows
                as the companion levels (more pellets, chain arcs, a wider
                nova, deeper luck). Falls back to the plain aura/nova/damage
                line for a companion with no scaling power. */}
            {def.power ? (
              <PixelText
                font={font}
                text={`${def.power.name} - RANK ${powerRank}`}
                scale={2}
                color="#ffcf6b"
              />
            ) : def.aura?.magicFind ? (
              <PixelText
                font={font}
                text={`AURA: +${Math.round(def.aura.magicFind * 100)}% MAGIC FIND`}
                scale={2}
                color="#7ef0c8"
              />
            ) : def.nova ? (
              <PixelText
                font={font}
                text="FROST NOVA - CHILLS THE HORDE"
                scale={2}
                color="#78c8f5"
              />
            ) : (
              <PixelText
                font={font}
                text={`DMG ${Math.round(companionWeaponDamage(companion))} - ${weaponDef(companion.equipment.weapon.defId).name}`}
                scale={2}
                color={LABEL}
              />
            )}
          </div>
        </div>

        {/* WEARING beside YOUR BAG — the landscape fold; one column stacked in
            portrait (see `.companion-body`). */}
        <div className="companion-body">
          {/* WHAT IS EQUIPPED. A row per slot rather than a strip of icons: the
              frame, the slot's name, and the piece's own name in its tier
              colour — or EMPTY over a ghosted slot glyph saying what belongs
              there. */}
          <section className="companion-worn">
            {/* The separator rides the HEADING, not the hint: at the 2x
                tablet tiers this row is twice as wide and always wraps, and a
                leading "·" on the second line reads as a bullet rather than as
                a continuation. */}
            <div className="companion-section-head">
              <PixelText font={font} text="WEARING ·" scale={2} color={LABEL} />
              <PixelText
                font={font}
                text="TAP TO TAKE OFF"
                scale={2}
                color={FAINT}
              />
            </div>
            {COMPANION_SLOTS.map((slot) => {
              const item = companion.equipment[slot];
              // A companion always fights with something, so the engine
              // refuses to empty the weapon slot (unequipCompanionToInventory)
              // — that row is a readout, not a button, and says why.
              const swapOnly = slot === "weapon";
              const takeOff = () => {
                if (swapOnly || !item) return;
                if (
                  runCommandOk(
                    state,
                    "unequipCompanionToInventory",
                    companion.id,
                    slot,
                  )
                ) {
                  playUiSound(synth, "confirm");
                  onChange();
                }
              };
              return (
                <button
                  key={slot}
                  type="button"
                  className={`companion-worn-row${swapOnly ? " swap-only" : ""}${
                    item ? "" : " empty"
                  }`}
                  aria-label={`companion-slot-${slot}`}
                  disabled={swapOnly || !item}
                  onClick={takeOff}
                >
                  <span
                    className={`inv-cell companion-slot${
                      item ? tierGlowClass(item.tier) : ""
                    }`}
                    style={{
                      borderColor: item ? TIER_COLORS[item.tier] : undefined,
                    }}
                  >
                    {item ? (
                      <ItemIcon sprites={sprites} item={item} />
                    ) : (
                      <SlotGhost sprites={sprites} slot={slot} />
                    )}
                  </span>
                  <span className="companion-worn-text">
                    <span className="companion-worn-label">
                      <PixelText
                        font={font}
                        text={SLOT_LABELS[slot]}
                        scale={2}
                        color={LABEL}
                      />
                      {swapOnly ? (
                        <PixelText
                          font={font}
                          text="SWAP ONLY"
                          scale={1}
                          color={FAINT}
                        />
                      ) : null}
                    </span>
                    <PixelText
                      font={font}
                      text={item ? equipmentName(item) : "EMPTY"}
                      scale={2}
                      color={item ? TIER_COLORS[item.tier] : FAINT}
                      maxWidth={WORN_NAME_REM}
                    />
                  </span>
                </button>
              );
            })}
          </section>

          {/* WHAT CAN BE EQUIPPED. The HERO's own bag, with the pieces this
              companion could wear lit — and COUNTED in the heading, so the
              answer is on screen before any cell is tapped. */}
          <section className="companion-bag-side">
            <div className="companion-section-head">
              <PixelText
                font={font}
                text="YOUR BAG ·"
                scale={2}
                color={LABEL}
              />
              <PixelText
                font={font}
                text={
                  fits > 0
                    ? `${fits} FIT - TAP ONE TO EQUIP`
                    : "NOTHING HERE FITS"
                }
                scale={2}
                color={fits > 0 ? "#7ef0c8" : FAINT}
              />
            </div>
            <div className="inv-grid companion-bag">
              {hero.inventory.map((item, index) => {
                const dest = item ? companionSlotOf(item) : null;
                const usable =
                  item !== null &&
                  dest !== null &&
                  meetsLevelReq(state, hero, item);
                // A piece this companion COULD wear but the hero is too low to
                // carry: the level is the whole reason it is dark, so it says
                // the number rather than just sitting dim.
                const lowLevel = item !== null && dest !== null && !usable;
                return (
                  <button
                    key={index}
                    type="button"
                    className={`inv-cell companion-bag-cell${usable ? " usable" : ""}${
                      usable && item ? tierGlowClass(item.tier) : ""
                    }`}
                    aria-label={`companion-bag-${index}`}
                    disabled={!usable}
                    style={
                      usable && item
                        ? { borderColor: TIER_COLORS[item.tier] }
                        : undefined
                    }
                    onClick={() => {
                      if (!usable) return;
                      if (
                        runCommandOk(
                          state,
                          "equipCompanionFromInventory",
                          companion.id,
                          index,
                        )
                      ) {
                        playUiSound(synth, "confirm");
                        onChange();
                      }
                    }}
                  >
                    {item ? (
                      <span
                        className={usable ? undefined : "companion-bag-dim"}
                      >
                        <ItemIcon sprites={sprites} item={item} />
                      </span>
                    ) : null}
                    {lowLevel ? (
                      <span className="companion-bag-req">
                        <PixelText
                          font={font}
                          text={`L${itemLevelReq(item)}`}
                          scale={1}
                          color="#d83a3a"
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Full-width CLOSE at scale 3 — the same footer button the other
            modals dismiss through. */}
        <button
          type="button"
          className="pixel-button modal-action companion-close"
          aria-label="close-companion"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={3} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
