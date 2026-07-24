// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autoplay driving seat: the developer BOT VIEW / `?bot=` playtest bot,
// or the paid AUTO PILOT's own bot while its engine meter runs. A drop-in
// input source for the sim tick — it clears the paused phases a human would
// click through, spends level-ups, runs the merchant economy, and adopts the
// bot's decided steer/aim/casts into the frame's GameInput.

import type { MutableRefObject } from "react";

import {
  advanceDialogue,
  allocateStat,
  botAct,
  botAllocate,
  botAssignSpellBar,
  confirmRespec,
  createBot,
  cullWorstLoot,
  gateKeyTarget,
  resolveChoice,
  resumeGame,
  skipCutscene,
  skipIntro,
  skipOutro,
  sortBotInventory,
  spendGateKey,
  stepBotWeaponSwap,
  takeSpellUnlock,
  tradeAtMerchant,
  wantsMerchantVisit,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";

import type { DemoDirector } from "./demo-director.ts";

// Autoplay economy: the least sim ms between the bot's merchant counter visits
// (`tradeAtMerchant`), so a stall it can't afford anything at isn't re-opened
// every tick it stands at the counter.
const BOT_SHOP_COOLDOWN_MS = 15_000;
// How often (in sim ticks) the ride scans the bag for a live gate key — the
// severed hand's USE is a ritual, not a per-tick poll.
const AUTOPILOT_KEY_SCAN_TICKS = 30;

export type BotDriver = {
  /** The seat for this tick: the debug/playtest bot, or the AUTO PILOT's
   * (lazily built — a manual run never pays for it), or null (human). */
  resolveDrivingBot: () => Bot | null;
  /** Clear waiting phases, run the autoplay economy, and adopt the bot's
   * decision into `input` for this tick. */
  drive: (drivingBot: Bot, dtMs: number) => void;
  /** Post-step bot housekeeping — BAG DISCIPLINE (see below). */
  postStep: (drivingBot: Bot | null) => void;
};

export function createBotDriver(deps: {
  state: GameState;
  input: GameInput;
  /** The developer BOT VIEW / `?bot=` playtest bot (null when none). */
  bot: Bot | null;
  demo: boolean;
  demoDirector: DemoDirector;
  /** A pause the VIEWER opened by hand — the one pause the bot must not
   * clear (see GameScreen's userPausedRef). */
  userPausedRef: MutableRefObject<boolean>;
  /** Sim ms of the bot's last merchant counter visit — the cooldown gate so
   * it doesn't re-open a stall every tick. A component-lifetime ref so it
   * carries across the ride's own run remounts. */
  botShopMsRef: MutableRefObject<number>;
  /** Dismiss the level intro and roll the level theme (the run's opener). */
  beginRun: () => void;
  bumpUi: () => void;
}): BotDriver {
  const {
    state,
    input,
    bot,
    demo,
    demoDirector,
    userPausedRef,
    botShopMsRef,
    beginRun,
    bumpUi,
  } = deps;

  // The AUTO PILOT ride's bot, built lazily on the first driven tick.
  let autopilotBot: Bot | null = null;
  const ensureAutopilotBot = () =>
    (autopilotBot ??= createBot("balanced", "meta"));
  let autopilotKeyTick = 0;

  const resolveDrivingBot = () =>
    bot ?? (state.autopilot.active ? ensureAutopilotBot() : null);

  const drive = (drivingBot: Bot, dtMs: number) => {
    // The bot is a drop-in input source; it also clears the paused
    // phases a human would click through (including an auto-pause from
    // the headless tab reporting itself hidden/unfocused). But a LATCHED
    // pause is left alone so the loop still runs while step() no-ops under
    // the paused phase: one the VIEWER opened by hand (timer tap / P while
    // watching BOT VIEW), and — for BOT VIEW — a genuine app-switch /
    // backgrounding (onVisibility latches it), so switching away from a
    // watched run actually pauses it instead of playing on in the
    // background.
    if (state.phase === "paused" && !userPausedRef.current) {
      resumeGame(state);
    }
    if (state.phase === "cutscene") skipCutscene(state);
    if (state.phase === "intro") skipIntro(state);
    if (state.phase === "outro") skipOutro(state);
    if (state.phase === "title") beginRun();
    if (state.phase === "dialogue") {
      advanceDialogue(state);
      bumpUi();
    }
    // The bot always SPARES a kneeling unique — autoplay runs exercise
    // the companion systems, and a party beats a lone bot anyway.
    if (state.phase === "choice") {
      resolveChoice(state, true);
      bumpUi();
    }
    if (state.phase === "levelup") {
      // The demo plays the modal at a watchable pace (see demo-director);
      // the developer BOT VIEW drains the banked points instantly.
      if (demo) {
        demoDirector.stepLevelup(dtMs);
      } else {
        allocateStat(state, botAllocate(drivingBot, state));
        bumpUi();
      }
    } else if (demo) {
      demoDirector.resetLevelupPacing();
    }
    if (state.phase === "respec") {
      // Spend the refunded pool point-by-point, then commit and drop in.
      if (state.player.pendingStatPoints > 0) {
        allocateStat(state, botAllocate(drivingBot, state));
      } else {
        confirmRespec(state);
      }
      bumpUi();
    }
    // A ding may have queued a "SPELL UNLOCKED" reward (a class stat crossed a
    // ×10 mark). No bot-driven run shows that modal, and the engine now holds
    // the level-up pause OPEN behind it (allocateStat/resumeAfterLevelup) so a
    // human's hero can't die while the reveal is read — so any bot seat must
    // drain the queue itself, which both accepts the power and lifts that
    // pause. Applies to the demo, the developer BOT VIEW, and the paid AUTO
    // PILOT alike; without it a bot run would freeze on the reward.
    if (state.pendingSpellUnlocks.length > 0) {
      while (takeSpellUnlock(state) !== null) {
        /* drain all */
      }
      botAssignSpellBar(state);
      bumpUi();
    }
    // Autoplay ECONOMY (mirrors the campaign sim; BOT VIEW and the paid
    // AUTO PILOT ride alike — both steer the merchant errand through
    // botAct, so both need the counter routine run for them): keep a bag
    // cell open by dropping the cheapest outgrown junk, and run the
    // counter routine (sell junk → buy an upgrade → mend → powerups)
    // whenever a visit would resolve something and the hero is at the
    // stall — `tradeAtMerchant` is proximity-gated, so until he walks
    // there (the bot steers the errand itself) it's a cheap no-op.
    if (state.phase === "playing") {
      // POCKET ARSENAL: keep the hand on whatever maximizes damage this
      // moment — the blade with a body in blade reach, the banked
      // ranged/magic shot out of reach and through every airborne frame
      // (see bot/economy.ts stepBotWeaponSwap). The BAG DISCIPLINE cull +
      // sort runs AFTER step() (postStep), not here: culling before the step
      // only reopened a slot the same step's pickup immediately refilled,
      // so a watched AUTO PILOT run rode a full bag — the "keep one slot
      // open" rule looked broken. The sim culls after its step; so do we.
      if (stepBotWeaponSwap(drivingBot, state)) bumpUi();
      // SPELL-BAR LOADOUT: keep the bar carrying the strongest unlocked
      // powers (best attack + AoE + buff + heal — see bot/economy.ts
      // botAssignSpellBar). Gear can raise the class stat and unlock a
      // spell without a ding, so this runs every tick, not just on a
      // level-up; a settled bar makes it a free no-op.
      if (botAssignSpellBar(state)) bumpUi();
      if (
        wantsMerchantVisit(state) &&
        state.stats.timeMs - botShopMsRef.current >= BOT_SHOP_COOLDOWN_MS &&
        tradeAtMerchant(state)
      ) {
        botShopMsRef.current = state.stats.timeMs;
        bumpUi();
      }
    }
    // AUTO PILOT extras (never the developer BOT VIEW): run the cow-level
    // ritual — USE a live gate key the moment the bag carries one (Rasputin's
    // severed hand on the rift), which tears the bunker door open a step ahead.
    if (!bot && state.autopilot.active) {
      autopilotKeyTick = (autopilotKeyTick + 1) % AUTOPILOT_KEY_SCAN_TICKS;
      if (autopilotKeyTick === 0 && state.phase === "playing") {
        const bag = state.player.inventory;
        const keyAt = bag.findIndex(
          (it) => it != null && gateKeyTarget(state, it) != null,
        );
        if (keyAt >= 0 && spendGateKey(state, keyAt)) bumpUi();
      }
    }
    const decided = botAct(drivingBot, state);
    // HOW TO PLAY: keep the watched hero from strobing left↔right as the
    // bot re-steers each tick (a no-op outside the demo — the developer
    // BOT VIEW shows the raw steer).
    demoDirector.dampFlicker(decided, dtMs);
    input.steering = decided.steering;
    input.target.x = decided.target.x;
    input.target.y = decided.target.y;
    input.throttle = 1;
    input.jump = decided.jump;
    input.useItem = decided.useItem ?? false;
    // The bot spends stacked consumables on its own read of the state
    // (botAct: medkit under half hp, drink when winded, repair a broken
    // weapon) — wire them through so autoplay actually spends them.
    input.useMedkit = decided.useMedkit ?? false;
    input.useStaminaPotion = decided.useStaminaPotion ?? false;
    input.useRepairKit = decided.useRepairKit ?? false;
    input.useItemIndex = undefined;
    // The bot AIMS like a desktop mouse: botAct points the auto-weapon
    // at the foe worth hitting (the densest cluster for a cone/spread,
    // the wounded body a single shot finishes) — wire it through.
    input.aim = decided.aim;
    // The bot never manual-fires — clear a stale gate so autoplay's
    // weapon stays autonomous even if a player run set it last tick.
    input.fire = undefined;
    // The bot casts too — wire its spell pick through as an enqueue edge
    // (the queue dedupes a slot re-picked every tick, so it just paces to
    // the global cooldown). Reset when it isn't casting so the flag never
    // sticks true and re-fires every frame.
    input.castSpell = decided.castSpell ?? false;
    input.castSpellIndex = decided.castSpellIndex;
    // An OPEN travel gate overrides the steer: the AUTO PILOT walks
    // straight into the door it just tore open (stepGates books the
    // crossing on arrival — the gateEntered handler travels).
    if (!bot && state.autopilot.active) {
      const gate = state.gates.find((g) => !g.entered);
      if (gate) {
        input.steering = true;
        input.target.x = gate.pos.x;
        input.target.y = gate.pos.y;
        input.throttle = 1;
        input.jump = false;
      }
    }
  };

  // BAG DISCIPLINE (mirrors the campaign sim, which culls AFTER its step):
  // now that THIS step's pickups have landed, trim the bag back to one
  // free cell by dropping the cheapest outgrown junk (keepers, the pocket
  // arsenal, and the good sell-fodder all stay — see bot/economy.ts), then
  // re-sort. Running it here rather than before step() is the whole fix for
  // "keep one slot open" under AUTO PILOT: a pre-step cull reopened a slot
  // the same step's pickup refilled, so the rendered/at-rest bag never
  // showed the promised open cell.
  const postStep = (drivingBot: Bot | null) => {
    if (drivingBot && state.phase === "playing") {
      cullWorstLoot(state);
      if (sortBotInventory(state)) bumpUi();
    }
  };

  return { resolveDrivingBot, drive, postStep };
}
