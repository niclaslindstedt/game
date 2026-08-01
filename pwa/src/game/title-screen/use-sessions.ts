// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MULTIPLAYER SCREENS' PLUMBING (menus-net.ts): the lobby list, the
// firewall check, the persisted session settings, and the two handoffs — host
// the next run, or go and watch somebody else's.
//
// **NOTHING HERE REACHES `pwa/src/game/net/`.** These are TITLE MENU screens,
// i.e. the app's startup path, and that directory imports `@game/core` — one
// static edge from here would drag the whole simulation into every player's
// first download and blow the 200 KB critical-path budget.
// `pwa/src/app/net-bridge.ts` is import-free by construction and is the only
// thing this file talks to; the client that speaks the wire is loaded by the
// RUN, behind its own lazy chunk. `tests/content/net_reachability_test.ts` is
// what catches the mistake at the source level.
//
// The browse is LAZY and it is REPEATED, which is the opposite of the mod
// list's rule beside it and for a good reason: a mod list does not change while
// the game runs, and who is hosting changes every minute. So it refreshes on
// entering the screen and on a press, and never at launch — a player who came
// to press RESUME must not pay a Steam matchmaking round trip for it.

import { useCallback, useEffect, useState } from "react";

import {
  browseSessions,
  firewallStatus,
  initNetBridge,
  joinSession,
  netBridgeAvailable,
  onSessionInvite,
  type BrowserRow,
  type FirewallStatus,
} from "../../app/net-bridge.ts";
import { modsBridgeAvailable, openWorkshop } from "../../app/mods-bridge.ts";
import { engineVersion } from "@game/menu";
import type { JoinModsHelper } from "./join-mods.ts";

import { activeMods } from "../mod-state.ts";
import { myHandshake, sessionRowRefusal } from "../net-text.ts";
import { hostIntentFor, type JoinIntent } from "../session-intent.ts";
import {
  getSettings,
  MAX_RECENT_SESSIONS,
  updateSettings,
} from "../settings.ts";
import type { MenuScreen, NetMenuState } from "./menu-model.ts";

export function useSessions({
  screen,
  heroName,
  heroHardcore,
  heroLoadout,
  applyForSession,
  onJoin,
}: {
  screen: MenuScreen;
  /** What this player is called in a session's roster and chat — their hero's
   * name, which is the only name the game knows them by. */
  heroName: string;
  /** The picked hero is HARDCORE (§4.2): rides every join so the handshake can
   * hold hardcore and softcore apart — the mismatch is refused by name. */
  heroHardcore: boolean;
  /** The picked hero's banked loadout (§4.5), purse already funded — what the
   * session seats them with. Null for a fresh hero (the authored fresh
   * start), and for no hero at all. */
  heroLoadout: Record<string, unknown> | null;
  /**
   * APPLY THIS EXACT MOD SET FOR THE SESSION (§4.4) — the host's ids, in the
   * host's load order (empty = the shipped game, i.e. restore). Owned by the
   * title screen because applying needs the sprite atlas and `game/mods.ts`,
   * both of which live behind lazy chunks this startup-path module may not
   * reach. Resolves false when it could not (assets not loaded, a bundle
   * missing), and then the join is not attempted.
   */
  applyForSession: (modIds: string[]) => Promise<boolean>;
  /** Go and watch one. The title screen does not connect: joining is a RUN,
   * and a run belongs to the app above it. */
  onJoin: (intent: JoinIntent) => void;
}): { netOpen: boolean; net: NetMenuState } {
  const netOpen = netBridgeAvailable();
  const [rows, setRows] = useState<BrowserRow[] | null>(null);
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  // THE JOINER'S MOD RECONCILE (§4.4), behind its own lazy chunk — what
  // decides whether a modded host's row is a door (all installed: the set is
  // applied on the way through) or a refusal with a Workshop pointer. Null
  // until the sessions screen loads it; a row is then treated exactly as it
  // was before reconciliation existed.
  const [joinMods, setJoinMods] = useState<JoinModsHelper | null>(null);
  // Bumped to re-read the settings this screen writes through (the port, the
  // password, the seats) — they live in the settings rather than in state so a
  // session's shape survives a relaunch.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (netOpen) initNetBridge();
  }, [netOpen]);

  // THE LAUNCH INVITE — a friend's Steam invite accepted while the game was
  // closed (`+connect_lobby`), or a shared address clicked (`--connect`). It is
  // picked up here rather than in the app root because this is where a JOIN is
  // already assembled: the intent it produces is the same one a browser row
  // produces, so an invited player and a browsing one walk the identical path.
  useEffect(() => {
    if (!netOpen) return;
    return onSessionInvite((invite) => {
      if (invite.address) {
        onJoin({
          address: invite.address,
          name: heroName,
          hardcore: heroHardcore,
          loadout: heroLoadout,
          label: invite.address,
        });
        return;
      }
      if (!invite.lobbyId) return;
      void joinSession(invite.lobbyId).then((found) => {
        if (found) {
          onJoin({
            peer: found.hostId,
            name: heroName,
            hardcore: heroHardcore,
            loadout: heroLoadout,
            label: found.row.name,
          });
        }
      });
    });
  }, [netOpen, heroName, heroHardcore, heroLoadout, onJoin]);

  // Browsing starts when the browser is opened, and again on every press of
  // REFRESH: the list is a live fact about other people, not a fetched resource
  // to cache. The fetch is in the EFFECT and the press only bumps a round, so
  // nothing sets state synchronously inside a render pass.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!netOpen || screen !== "sessions") return;
    let cancelled = false;
    void browseSessions().then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, [netOpen, screen, round]);
  const refresh = useCallback(() => {
    setRows(null);
    setRound((n) => n + 1);
  }, []);

  // The reconcile helper rides the browser screen the way the rows do —
  // loaded when it opens (its chunk AND the installed-mod list it compiles),
  // because neither is work the title menu may pay at launch.
  useEffect(() => {
    if (screen !== "sessions" || !modsBridgeAvailable()) return;
    let live = true;
    void import("./join-mods.ts")
      .then((m) => m.loadJoinMods())
      .then((helper) => {
        if (live) setJoinMods(helper);
      });
    return () => {
      live = false;
    };
  }, [screen]);

  /** The gap between a row's mod set and this build's (§4.4), or null while
   * the helper has not loaded — a row is then judged exactly as it was
   * before reconciliation existed. */
  const modsGap = useCallback(
    (target: readonly string[]) => joinMods?.gap(target) ?? null,
    [joinMods],
  );

  /**
   * Walk through a row's door with the host's mod set applied (§4.4): the
   * host's set is the session's, in the host's load order, and a joiner who
   * has it all installed simply plays under it — `restoreBaseDefs` puts the
   * shipped game back when the run ends (the intent's `appliedMods` is what
   * tells the run it must). A joiner missing one never reaches here: the row
   * is a refusal with the Workshop behind it.
   */
  const reconcileAndJoin = useCallback(
    (target: readonly string[], intent: JoinIntent) => {
      const gap = modsGap(target);
      if (!gap || !gap.needsApply) {
        onJoin(intent);
        return;
      }
      if (gap.missing.length) return; // the row was a refusal; belt and braces
      void applyForSession([...target]).then((ok) => {
        if (ok) onJoin({ ...intent, appliedMods: true });
      });
    },
    [modsGap, applyForSession, onJoin],
  );

  // The FIREWALL row asks its question when the HOST screen is opened, and
  // never elevates anything doing so: this is the CHECK, and the remedy is a
  // press (see `allowFirewall`).
  const port = getSettings().multiplayer.port;
  useEffect(() => {
    if (screen !== "host" || !netOpen) return;
    let live = true;
    void firewallStatus(port).then((state) => {
      if (live) setFirewall(state);
    });
    return () => {
      live = false;
    };
  }, [screen, netOpen, port, tick]);

  const allowFirewall = useCallback(() => {
    if (!netOpen) return;
    setFirewall(null);
    // The VERIFICATION's answer, not whether the command exited zero — a green
    // "opened" that is not open sends the player looking in the wrong place.
    void firewallStatus(getSettings().multiplayer.port, true).then(setFirewall);
  }, [netOpen]);

  const remember = useCallback((address: string) => {
    const recent = getSettings().multiplayer.recent.filter(
      (entry) => entry !== address,
    );
    updateSettings({
      multiplayer: {
        ...getSettings().multiplayer,
        recent: [address, ...recent].slice(0, MAX_RECENT_SESSIONS),
      },
    });
  }, []);

  return {
    netOpen,
    net: {
      rows,
      refresh,
      firewall,
      allowFirewall,
      session: getSettings().multiplayer,
      setSession: (patch) => {
        updateSettings({
          multiplayer: { ...getSettings().multiplayer, ...patch },
        });
        setTick((n) => n + 1);
      },
      hostIntent: () => hostIntentFor(heroName),
      // A MOD GAP THIS BUILD CAN CLOSE IS NOT A REFUSAL (§4.4): when every
      // one of the host's mods is installed here, the row presents itself
      // WITH the host's set — joining applies it on the way through — and
      // only a genuinely missing mod (or a build/protocol skew) still greys
      // the row.
      refusalFor: (row) => {
        const gap = modsGap(row.mods);
        return sessionRowRefusal(
          row,
          myHandshake(
            engineVersion,
            gap && gap.missing.length === 0
              ? row.mods
              : activeMods().map((stamp) => stamp.id),
          ),
        );
      },
      missingMods: (row) => (modsGap(row.mods)?.missing.length ?? 0) > 0,
      openWorkshop,
      joinRow: (row, password) => {
        // A lobby row carries the host's direct address when it is offering
        // one, and only the Steam relay when it is not. The ADDRESS is
        // preferred: a LAN party whose traffic went out to Valve and back would
        // be paying an ocean of latency for a cable in the same room.
        if (row.address) {
          remember(row.address);
          reconcileAndJoin(row.mods, {
            address: row.address,
            name: heroName,
            password,
            hardcore: heroHardcore,
            loadout: heroLoadout,
            label: row.name,
          });
          return;
        }
        // The relayed path needs one more round trip: a lobby row names a
        // LOBBY, and what a P2P packet is addressed to is the HOST. Joining the
        // lobby is what hands that back — and it is also what makes Valve
        // willing to route the two of us to each other at all.
        void joinSession(row.id).then((found) => {
          if (!found) return;
          reconcileAndJoin(row.mods, {
            peer: found.hostId,
            name: heroName,
            password,
            hardcore: heroHardcore,
            loadout: heroLoadout,
            label: row.name,
          });
        });
      },
      joinAddress: (address, password) => {
        remember(address);
        onJoin({
          address,
          name: heroName,
          password,
          hardcore: heroHardcore,
          loadout: heroLoadout,
          label: address,
        });
      },
    },
  };
}
