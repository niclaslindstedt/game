// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's plumbing behind the store screens (menus-store.ts): the
// pending-pack / chosen-hero / slider-amount state the flow carries between
// screens, the localized price fetch, and the purchase + send runners.
// Results surface through the setNotice line TitleScreen renders under the
// menu; refreshRoster re-reads the purse/bank blurbs after money moves.

import { useCallback, useEffect, useState } from "react";

import { formatCompact } from "@ui/lib/format-number.ts";

import { synth } from "../audio.ts";
import type { Character } from "../characters.ts";
import { playUiSound } from "../sfx/index.ts";
import {
  bankBalance,
  buyCoinPack,
  COIN_PACKS,
  coinStoreAvailable,
  fetchCoinPrices,
  sendCoins,
  type CoinPack,
} from "../store.ts";
import type { MenuScreen, TitleNotice } from "./menu-model.ts";

export function useCoinStore({
  screen,
  setScreen,
  setCursor,
  setNotice,
  refreshRoster,
}: {
  screen: MenuScreen;
  setScreen: (screen: MenuScreen) => void;
  setCursor: (at: number) => void;
  setNotice: (notice: TitleNotice | null) => void;
  refreshRoster: () => void;
}) {
  // The COIN STORE: the native shell, or any build where the DEVELOPER →
  // FORCE STORE switch is on (free packs — see game/store.ts). Recomputed
  // every render so flipping the switch surfaces the row immediately.
  const storeOpen = coinStoreAvailable();
  // The pack a player tapped, held while the BUY confirmation screen asks them
  // to commit — so a mis-tap on a coin row never charges (or, in free builds,
  // banks) anything on its own.
  const [storePackSku, setStorePackSku] = useState<string | null>(null);
  // The hero picked in the DISTRIBUTE flow, carried into the amount screen.
  const [storeHeroId, setStoreHeroId] = useState<string | null>(null);
  // The DISTRIBUTE slider's chosen amount (coins, in SEND_TICK steps).
  const [storeAmount, setStoreAmount] = useState(0);
  // Localized price tags from the platform store, fetched on first entry;
  // null until they arrive (rows show the shipped USD tags meanwhile).
  const [storePrices, setStorePrices] = useState<Record<string, string> | null>(
    null,
  );
  // A pay sheet is open — further store rows buzz instead of stacking flows.
  const [storeBusy, setStoreBusy] = useState(false);
  // Bumped once per successful purchase — the store backdrop watches it and
  // rains a celebratory coin burst each time it changes (see StoreBackdrop).
  const [storeCelebrate, setStoreCelebrate] = useState(0);
  useEffect(() => {
    if (screen !== "store" || storePrices !== null || !storeOpen) return;
    let cancelled = false;
    void fetchCoinPrices().then((prices) => {
      if (!cancelled && prices) setStorePrices(prices);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, storePrices, storeOpen]);

  // STORE → pack tapped: run the platform pay sheet; the coins land in the
  // undistributed bank (store.ts). The promise resolves only after the
  // credit is persisted, so the refresh below reads the new balance.
  const runPurchase = useCallback(
    async (pack: CoinPack) => {
      playUiSound(synth, "confirm");
      setStoreBusy(true);
      setNotice({ tone: "info", text: "OPENING THE STORE" });
      const result = await buyCoinPack(pack);
      setStoreBusy(false);
      if (result.ok) {
        playUiSound(synth, "start");
        setStoreCelebrate((c) => c + 1); // rain a coin burst over the vault
        setNotice({
          tone: "info",
          text: `${pack.amount} COINS BANKED - ${formatCompact(bankBalance())} UNDISTRIBUTED`,
        });
        refreshRoster(); // the DISTRIBUTE blurb re-reads the bank
      } else if (result.reason === "cancelled") {
        // The player changed their mind — that's fine, and it stays quiet.
        playUiSound(synth, "back");
        setNotice(null);
      } else {
        playUiSound(synth, "back");
        setNotice({
          tone: "error",
          text: "STORE UNAVAILABLE - TRY AGAIN LATER",
        });
      }
    },
    [setNotice, refreshRoster],
  );

  // DISTRIBUTE → SEND: move the slider's amount from the bank onto the
  // chosen hero and report exactly what moved and what stayed.
  const runSend = useCallback(
    (hero: Character, amount: number) => {
      const sent = sendCoins(hero.id, amount);
      if (sent <= 0) {
        playUiSound(synth, "back");
        return;
      }
      playUiSound(synth, "start");
      setNotice({
        tone: "info",
        text: `SENT ${formatCompact(sent)} TO ${hero.name} - ${formatCompact(bankBalance())} UNDISTRIBUTED`,
      });
      setStoreAmount(0);
      refreshRoster(); // purse blurbs + bank readouts refresh
      // Nothing left to hand out: the amount screen would be a dead slider, so
      // step back to the store.
      if (bankBalance() <= 0) {
        setScreen("store");
        setCursor(COIN_PACKS.length);
      }
    },
    [setNotice, refreshRoster, setScreen, setCursor],
  );

  return {
    storeOpen,
    storePackSku,
    setStorePackSku,
    storeHeroId,
    setStoreHeroId,
    storeAmount,
    setStoreAmount,
    storePrices,
    storeBusy,
    storeCelebrate,
    runPurchase,
    runSend,
  };
}
