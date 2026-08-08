// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The Tauri desktop shell's decision layer.
//!
//! Every module here is the peer of a file in [`electron/src/`], and answers
//! the same question with the same name — deliberately, so that a change to one
//! shell is a visible gap in the other rather than a silent divergence. What is
//! NOT here is anything that draws, opens or talks to something: those live in
//! `src-tauri/`, which is the only crate in this tree that knows Tauri exists.
//!
//! | Here                       | Its Electron peer            | Answers                             |
//! | -------------------------- | ---------------------------- | ----------------------------------- |
//! | [`capabilities`]           | `capabilities.ts`            | what this copy of the app may do    |
//! | [`bridge`]                 | `main.ts`'s `routeMessage`   | which protocol a page message is    |
//! | [`channels`]               | `channels.ts`                | what the one IPC command is called  |
//! | [`config`]                 | `config.ts`                  | where the app points itself         |
//! | [`output`]                 | `output.ts`                  | where a diagnostic line goes        |
//! | [`user_data`]              | `user-data.ts`               | what the app's folder is called     |
//! | [`webroot`]                | `webroot.ts`                 | which file one request path is      |
//! | [`window_state`]           | `window-state.ts`            | where the window opens              |
//! | [`steam`]                  | `steam.ts`                   | which app id, and whether to relaunch |
//! | [`cloud_save`]             | `cloud-save.ts`              | what one cloud message is answered with |
//! | [`cloud_provider`]         | `cloud-provider.ts`          | what a platform cloud has to be     |
//! | [`achievements`]           | `achievements.ts`            | what one badge batch is answered with |
//! | [`achievements_provider`]  | `achievements-provider.ts`   | what a badge service has to be      |
//! | [`leaderboards`]           | `leaderboards.ts`            | what one score batch is answered with |
//! | [`leaderboards_provider`]  | `leaderboards-provider.ts`   | why there is no board on this shell |
//! | [`screenshots`]            | `screenshots.ts`             | where a picture goes, and under what name |
//! | [`screenshots_provider`]   | `screenshots-provider.ts`    | whether the platform keeps a copy   |
//! | [`net`]                    | `net.ts`                     | what one multiplayer message means  |
//! | [`net_lobby`]              | `net-lobby.ts`               | what a lobby row says               |
//! | [`net_invite`]             | `net-invite.ts`              | what a launch argument asked to join |
//! | [`net_firewall`]           | `net-firewall.ts`            | whether the port is open, and how to open it |
//! | [`steam_p2p`]              | `net-steam-p2p.ts`           | when to accept a peer, and when it is gone |
//! | [`session_host`]           | `session-host.ts`            | what the session process just said  |
//! | [`snapshot`]               | (`net.ts`'s `MessagePort`)   | how twenty frames a second reach the page |
//! | [`mods`]                   | `mods.ts`                    | which folders hold mods, and what may be published |
//! | [`mod_archive`]            | `mod-archive.ts`             | what is safely inside a `.zip`      |
//! | [`workshop`]               | `workshop.ts`                | what a mod portal has to be         |
//! | [`runtime`]                | `resources.ts`               | where the things that are not Rust are |
//! | [`dedicated`]              | `dedicated-mode.ts`          | what a windowless server is handed  |
//! | [`media`]                  | `main.ts`'s permission handler | whether the page may open a microphone |
//! | [`steam_pump`]             | (`steam.ts`'s callback loop) | how often Steam's queue is drained  |
//!
//! **The four platform seams are the SAME three-file shape the rest of the game
//! uses** — bridge → provider → platform — with the third file the only one that
//! lives in `src-tauri/`, because it is the only one that talks to Steam. That
//! is what makes the whole of a protocol testable here against a fake provider,
//! including the failure paths a real Steam client cannot be asked to produce on
//! demand.
//!
//! Tests for all of it live in `tests/` as their own files (OSS_SPEC §20.1) —
//! which is the second reason this is a library crate rather than a module of
//! the binary: a Rust integration test can only reach a crate's public API.
//!
//! [`electron/src/`]: https://github.com/niclaslindstedt/game/tree/main/electron/src

pub mod achievements;
pub mod achievements_provider;
pub mod bridge;
pub mod capabilities;
pub mod channels;
pub mod cloud_provider;
pub mod cloud_save;
pub mod config;
pub mod dedicated;
pub mod leaderboards;
pub mod leaderboards_provider;
pub mod media;
pub mod mod_archive;
pub mod mods;
pub mod net;
pub mod net_firewall;
pub mod net_invite;
pub mod net_lobby;
pub mod output;
pub mod runtime;
pub mod screenshots;
pub mod screenshots_provider;
pub mod session_host;
pub mod snapshot;
pub mod steam;
pub mod steam_p2p;
pub mod steam_pump;
pub mod user_data;
pub mod webroot;
pub mod window_state;
pub mod workshop;
