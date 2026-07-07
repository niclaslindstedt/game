# playtest — game-specific notes

Game-feel targets for **this** game (a survivors-style horde survival
scroller). The harness, bot, and viewport workflow live in `SKILL.md`; this
file records the numbers and feel-rules a run is judged against here. A
sequel resets this file to its own genre's targets.

## Feel targets (tune `src/game/config.ts` until they hold)

- **Horde escalation:** an early-run minute should be a trickle, and a
  passive strategy (kite/idle) should eventually be overwhelmed — that is
  the survivors-style pressure working, not a difficulty bug.
- **Run length:** on the order of 30s–5min; sub-10s means enemies are too
  passive or the weapon too strong.
- **Damage taken** should trend > 0 — zero-pressure runs mean spawn distance
  or enemy speed is off.
- **Pickup flow at horde scale:** if `itemsCollected` stays 0 across
  strategies, drops are too rare or too far from the action.
