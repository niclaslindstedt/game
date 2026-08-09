// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEATH RITE CATALOG — every scripted send-off a boss can die by, and the
// one place a new one is registered.
//
// Adding a rite is an entry here plus, where the rite genuinely BEHAVES
// differently, a `step` hook (`./types.ts`). Adding a rite to a BOSS is one
// line of YAML (`death:` in `content/enemies/<biome>/<id>.yaml`). Nothing else
// in the engine grows a member per idea, which is the whole point of the
// catalog and the reason it mirrors `mechanics/catalog.ts` field for field.
//
// THE DEFAULT IS A REAL RITE, NOT A NO-OP. A boss that names none — including a
// MOD's boss, whose author never read this file — still gets the full three
// beats and comes apart into whatever it is made of, because `dismantle` reads
// the victim's own GORE FAMILY (`game-screen/gore.ts`) and so is already
// correct for a body, a machine, a haunting and a rift-thing alike. `death:` is
// therefore an UPGRADE a boss earns, never a field it is broken without — the
// same bargain the authored cast poses strike (`<sprite>_cast_0/1`).

import type { DeathRiteDef, DeathRiteId } from "./types.ts";

/**
 * The rite every boss falls back to: the body is opened and comes apart into
 * its own material. Correct for all four gore families with nothing authored
 * per boss, which is what makes it a safe default rather than a placeholder.
 */
export const DEFAULT_RITE: DeathRiteId = "dismantle";

/**
 * The rite every FLEEING boss falls back to (`EnemyDef.flees`): it tears its
 * way out, runs, and is spun out of existence at the mouth.
 *
 * A SECOND default is needed rather than one, and the bug it exists for is
 * worth recording: a fleeing boss with no `death:` used to resolve to
 * `DEFAULT_RITE`, which is a DEATH rite — so the scene played the finisher's
 * choreography over a boss that was supposed to run, tore no exit open, and
 * booked `bossDefeated` for a mob that had escaped. The ENDING decides the
 * default; the def only refines it.
 */
export const DEFAULT_FLIGHT_RITE: DeathRiteId = "bolt";

const RITES: readonly DeathRiteDef[] = [
  // THE FOUNDER, on all three of the venues he is met on. The brief's own
  // example, and the only rite in the catalog whose victim BLEEDS: the hero
  // leaps, lands astride him, and drives the blade down through the skull.
  // The long aftermath is the point — he holds it there, then wrenches it
  // free, and the body folds under its own weight.
  {
    id: "execution",
    blurb:
      "The hero vaults onto him and drives the blade down through the skull, holds it there, and wrenches it free. He folds under his own weight.",
    actMs: 300,
    aftermathMs: 600,
    approach: "leap",
    remains: "cleave",
    // Astride the body: a leap that stops short of it reads as a man swinging
    // at the air in front of somebody.
    standoff: 0.35,
    force: 6,
  },
  // THE FLAGBEARER. It floats, so there is nothing to pin and nothing to stand on:
  // the blade goes UP through it, the suit fails, and what was inside vents
  // out of the breach. The empty suit is what falls, and what stays.
  {
    id: "unmaking",
    blurb:
      "It hovers, so the blade goes up through it. The suit fails, what was inside vents out of the breach, and the empty suit is what falls.",
    staggerMs: 300,
    actMs: 500,
    aftermathMs: 900,
    approach: "stride",
    remains: "corpse",
    standoff: 1.15,
    force: 4,
  },
  // PAYLOAD-1 and BRO OMEGA — the two that CHARGE. The hero catches the charge
  // rather than dodging it: he rides it, plants a foot, and takes the core out.
  // The short execution is deliberate; this one is over in a movement.
  {
    id: "override",
    blurb:
      "The charge is caught rather than dodged: the hero rides it in, plants a foot, and tears the core out. It runs on for a moment without one.",
    actMs: 200,
    aftermathMs: 800,
    approach: "leap",
    remains: "gib",
    standoff: 0.5,
    force: 9,
  },
  // THE VAULT WARDEN. It does not chase, it SCANS — so it dies by its own
  // scan: the hero shoves the emitter round and the beam cuts the Warden in
  // half along the arc it had locked. The longest stagger in the catalog,
  // because the whole read is watching it aim at itself.
  {
    id: "last_sweep",
    blurb:
      "Its own scan finishes it. The emitter is shoved round and the beam cuts the Warden in half along the arc it had already locked.",
    staggerMs: 600,
    actMs: 500,
    aftermathMs: 700,
    approach: "stride",
    remains: "cleave",
    standoff: 1.3,
    force: 7,
  },
  // THE BRO SUPERCORE. The hero climbs it and puts the blade into the core;
  // the core does the rest. He is not the one who finishes this, which is why
  // the aftermath is the longest here and the execution barely exists.
  {
    id: "shutdown",
    blurb:
      "The hero prises the housing open and puts a blade into the core. The core does the rest, and the lights die a bank at a time.",
    staggerMs: 200,
    actMs: 400,
    aftermathMs: 1400,
    approach: "leap",
    remains: "gib",
    standoff: 0.4,
    force: 12,
  },
  // THE FOUNDER, on Mars and again at the rift — and every OTHER boss that
  // escapes rather than dying. He does not fight to the end: he tears his way
  // out, bolts for it with his back to the hero, and is drawn through spinning
  // — a coward leaving at speed, and legible as one from across the field. The
  // long aftermath is the twirl, and it is the joke: the man who has been
  // talking about owning Mars for the whole level exits like a scrap of paper
  // going down a drain.
  //
  // Named `bolt` rather than for the rift because WHAT he goes through is the
  // boss's own business — the exit is drawn with whatever `flees.landmark`
  // names, so this same rite serves a hatch, a lift or a hole in the ground.
  {
    id: "bolt",
    blurb:
      "He does not stay to be finished. He tears his way out, runs for it with his back turned, and is drawn through spinning.",
    flight: true,
    staggerMs: 400,
    actMs: 500,
    aftermathMs: 500,
    // Far enough that the bolt is a RUN the player watches him make, near
    // enough that the whole thing stays on a phone's ~422×260 world view.
    exitDistance: 96,
    spin: 4,
  },
  // BRO ALPHA / BETA / GAMMA, and every boss that names nothing. It comes
  // apart into what it is made of. THE VARIETY IS NOT AUTHORED: the cut itself
  // is rolled (`cleaveCut`, an unbounded family × a continuous offset), so the
  // boot_hill trilogy never plays the same end twice and nobody had to write
  // three of these.
  {
    id: "dismantle",
    blurb:
      "It is opened along the line the blow came in on, and comes apart into whatever it was made of.",
    approach: "leap",
    remains: "cleave",
    standoff: 0.45,
    force: 5,
  },
] as const;

const BY_ID = new Map<DeathRiteId, DeathRiteDef>(RITES.map((r) => [r.id, r]));

/** Every rite in the catalog, in author order. */
export function deathRites(): readonly DeathRiteDef[] {
  return RITES;
}

/** Whether `id` names a rite — what the enemy schema checks a `death:` against. */
export function isDeathRite(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * The rite a boss dies by. An unknown or absent id resolves to `DEFAULT_RITE`
 * rather than throwing: a boss whose rite was retired still has to be killable,
 * and the fallback is a real send-off (see the header).
 */
export function deathRite(id: DeathRiteId | undefined): DeathRiteDef {
  return (
    (id !== undefined ? BY_ID.get(id) : undefined) ??
    (BY_ID.get(DEFAULT_RITE) as DeathRiteDef)
  );
}

/**
 * The rite a boss actually gets, given how it LEAVES the field.
 *
 * `flees` is the deciding fact, not the authored id: a rite whose kind
 * disagrees with the ending could never play (a finisher on a boss that runs
 * has nobody left to finish; a flight on a boss that dies has no exit to run
 * to), so a mismatch resolves to the right default rather than staging a scene
 * that cannot resolve. The build refuses the mismatch outright
 * (`enemy-schema.mjs`) — this is the engine refusing to be broken by one that
 * slipped through, which for a MOD's boss is not hypothetical.
 */
export function riteFor(
  id: DeathRiteId | undefined,
  flees: boolean,
): DeathRiteDef {
  const named = id !== undefined ? BY_ID.get(id) : undefined;
  if (named && (named.flight ?? false) === flees) return named;
  return BY_ID.get(flees ? DEFAULT_FLIGHT_RITE : DEFAULT_RITE) as DeathRiteDef;
}
