// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autoplay driving seat: the developer BOT VIEW / `?bot=` playtest bot,
// or the paid AUTO PILOT's own bot while its engine meter runs. A drop-in
// input source for the sim tick — it clears the paused phases a human would
// click through, spends level-ups, runs the merchant economy, and adopts the
// bot's decided steer/aim/casts into the frame's GameInput.

import { localHero } from "../local-seat.ts";
import type { MutableRefObject } from "react";

import {
  giverTopics,
  botAct,
  botAllocate,
  botAutoEquip,
  botPickTalent,
  createBot,
  cullWorstLoot,
  gateKeyTarget,
  sortBotInventory,
  careForCompanion,
  stepBotWeaponSwap,
  tradeAtMerchant,
  wantsMerchantVisit,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";

import type { DemoDirector } from "./demo-director.ts";

import { runCommand, runCommandOk } from "../run-commands.ts";

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
      runCommand(state, "resumeGame");
    }
    if (state.phase === "cutscene") runCommand(state, "skipCutscene");
    if (state.phase === "intro") runCommand(state, "skipIntro");
    if (state.phase === "outro") runCommand(state, "skipOutro");
    if (state.phase === "title") beginRun();
    if (state.phase === "dialogue") {
      runCommand(state, "advanceDialogue");
      bumpUi();
    }
    // AN ERRAND IS WHAT THE RIDE IS FOR, so the bot takes it. An unattended
    // AUTO PILOT run parked in a quest modal forever is the failure this
    // exists to prevent — but the right answer is not "dismiss it": xp, coins
    // and loot are exactly what the ride is paying for, and accepting also
    // means an autoplay run actually exercises the quest system. It skips the
    // speech (a bot has nothing to read) and hands in whatever is finished
    // whenever it happens to wander back past the giver.
    if (state.phase === "quest") {
      const offer = state.questOffer;
      if (offer?.kind === "list") {
        // A giver with several errands opens on the pick list; the bot takes
        // them top-down (finished work first, then fresh work — `giverTopics`
        // already orders it that way), one per frame.
        const first = giverTopics(state, offer.giverId)[0];
        if (first) runCommandOk(state, "pickQuestTopic", first.questId);
        else runCommand(state, "closeQuestDialogue");
      } else if (offer?.kind === "offer") runCommandOk(state, "acceptQuest");
      else if (offer?.kind === "complete") runCommand(state, "turnInQuest");
      else runCommand(state, "closeQuestDialogue");
      bumpUi();
    }
    // The bot always SPARES a kneeling unique — autoplay runs exercise
    // the companion systems, and a party beats a lone bot anyway.
    if (state.phase === "choice") {
      runCommandOk(state, "resolveChoice", true);
      bumpUi();
    }
    if (state.phase === "levelup") {
      // The demo plays the modal at a watchable pace (see demo-director);
      // the developer BOT VIEW drains the banked points instantly.
      if (demo) {
        demoDirector.stepLevelup(dtMs);
      } else {
        runCommandOk(
          state,
          "allocateStat",
          botAllocate(drivingBot, state, localHero(state)),
        );
        bumpUi();
      }
    } else if (demo) {
      demoDirector.resetLevelupPacing();
    }
    if (state.phase === "respec") {
      // Spend the refunded pool point-by-point, then commit and drop in.
      if (localHero(state).pendingStatPoints > 0) {
        runCommandOk(
          state,
          "allocateStat",
          botAllocate(drivingBot, state, localHero(state)),
        );
      } else {
        runCommandOk(state, "confirmRespec");
      }
      bumpUi();
    }
    // A ding that crossed a ×10 TREE milestone earns a talent point, which holds
    // the same level-up pause behind the picker. No bot seat shows the picker,
    // so drain it here — pick per the bot's build (`botPickTalent`) and spend,
    // which lifts the pause once the queue empties. The break guards against a
    // pick that can't be spent (should never happen: the queue is
    // capacity-clamped), so the loop can't spin. The demo instead plays the
    // picker at a watchable pace (see demo-director), exactly as it does the
    // level-up chooser above — a drained-in-one-tick picker never paints.
    if (state.pendingTalentPoints.length > 0) {
      if (demo) {
        demoDirector.stepTalent(dtMs);
      } else {
        let picked = false;
        while (state.pendingTalentPoints.length > 0) {
          const id = botPickTalent(drivingBot, state, localHero(state));
          if (!id || !runCommandOk(state, "spendTalentPoint", id)) break;
          picked = true;
        }
        if (picked) bumpUi();
      }
    } else if (demo) {
      demoDirector.resetTalentPacing();
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
      // The demo plays the swap as the two presses a player makes (open the
      // switcher, tap the weapon — see demo-director); every other seat
      // commits it silently.
      const swapped = demo
        ? demoDirector.stepWeaponSwap(drivingBot, dtMs)
        : stepBotWeaponSwap(drivingBot, state, localHero(state));
      if (swapped) bumpUi();
      // KEEP THE FRIEND ON ITS FEET — the same call the campaign sim makes, in
      // the same place, for both bot seats: a downed companion is woken with a
      // bought bottle of SMELLING SALTS and a badly hurt one gets a spare
      // medkit. It sits here rather than in the AUTO PILOT-only block below
      // (with the gate-key ritual) because the developer BOT VIEW is where this
      // gets measured, and a bot that plays the companion rules only when a
      // player is paying for it measures nothing.
      if (careForCompanion(state, localHero(state))) bumpUi();
      if (
        wantsMerchantVisit(state, localHero(state)) &&
        state.stats.timeMs - botShopMsRef.current >= BOT_SHOP_COOLDOWN_MS &&
        tradeAtMerchant(state, localHero(state))
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
        const bag = localHero(state).inventory;
        const keyAt = bag.findIndex(
          (it) => it != null && gateKeyTarget(state, it) != null,
        );
        if (keyAt >= 0 && runCommandOk(state, "spendGateKey", keyAt)) bumpUi();
      }
    }
    const decided = botAct(drivingBot, state, localHero(state));
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
    // HOW TO PLAY: teach the dock the beat BEFORE the first swallow, so the
    // callout points at an item that is still there. Holds this tick's use back
    // for the read beat; a no-op outside the demo and once taught.
    demoDirector.holdItemUse(input);
    input.useItemIndex = undefined;
    // The bot AIMS like a desktop mouse: botAct points the auto-weapon
    // at the foe worth hitting (the densest cluster for a cone/spread,
    // the wounded body a single shot finishes) — wire it through.
    input.aim = decided.aim;
    // The bot never manual-fires — clear a stale gate so autoplay's
    // weapon stays autonomous even if a player run set it last tick.
    input.fire = undefined;
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

  // BAG DISCIPLINE (mirrors the campaign sim, which sweeps AFTER its step):
  // now that THIS step's pickups have landed, WEAR the upgrades they brought
  // (`botAutoEquip` — the bot equips whatever it finds regardless of the
  // human's on-pickup AUTO-EQUIP setting, which ships off; the hand is left
  // to the pocket arsenal), then trim the bag back to one free cell by
  // dropping the cheapest outgrown junk (keepers, the pocket arsenal, and the
  // good sell-fodder all stay — see bot/economy.ts), then re-sort. The sweep
  // runs FIRST so the pieces it displaces are on the table for the cull, and
  // so cells an upgrade freed count toward the open-slot rule. Running all of
  // it here rather than before step() is the whole fix for "keep one slot
  // open" under AUTO PILOT: a pre-step cull reopened a slot the same step's
  // pickup refilled, so the rendered/at-rest bag never showed the promised
  // open cell.
  const postStep = (drivingBot: Bot | null) => {
    if (drivingBot && state.phase === "playing") {
      if (botAutoEquip(state, localHero(state))) bumpUi();
      cullWorstLoot(state, localHero(state));
      if (sortBotInventory(state, localHero(state))) bumpUi();
    }
  };

  return { resolveDrivingBot, drive, postStep };
}
