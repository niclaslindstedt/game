// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The Tauri desktop shell's decision layer.
//!
//! Every module here answers one question, named after it. What is NOT here
//! is anything that draws, opens or talks to something: those live in
//! `src-tauri/`, which is the only crate in this tree that knows Tauri exists.
//!
//! | Module                     | Answers                                          |
//! | -------------------------- | ------------------------------------------------ |
//! | [`capabilities`]           | what this copy of the app may do                 |
//! | [`bridge`]                 | which protocol a page message is                 |
//! | [`channels`]               | what the one IPC command is called               |
//! | [`config`]                 | where the app points itself                      |
//! | [`output`]                 | where a diagnostic line goes                     |
//! | [`user_data`]              | what the app's folder is called                  |
//! | [`webroot`]                | which file one request path is                   |
//! | [`window_state`]           | where the window opens                           |
//! | [`steam`]                  | which app id, and whether to relaunch            |
//! | [`cloud_save`]             | what one cloud message is answered with          |
//! | [`cloud_provider`]         | what a platform cloud has to be                  |
//! | [`achievements`]           | what one badge batch is answered with            |
//! | [`achievements_provider`]  | what a badge service has to be                   |
//! | [`leaderboards`]           | what one score batch is answered with            |
//! | [`leaderboards_provider`]  | why there is no board on this shell              |
//! | [`screenshots`]            | where a picture goes, and under what name        |
//! | [`screenshots_provider`]   | whether the platform keeps a copy                |
//! | [`net`]                    | what one multiplayer message means               |
//! | [`net_lobby`]              | what a lobby row says                            |
//! | [`net_invite`]             | what a launch argument asked to join             |
//! | [`net_firewall`]           | whether the port is open, and how to open it     |
//! | [`steam_p2p`]              | when to accept a peer, and when it is gone       |
//! | [`session_host`]           | what the session process just said               |
//! | [`snapshot`]               | how twenty frames a second reach the page        |
//! | [`mods`]                   | which folders hold mods, and what may be published |
//! | [`mod_archive`]            | what is safely inside a `.zip`                   |
//! | [`workshop`]               | what a mod portal has to be                      |
//! | [`runtime`]                | where the things that are not Rust are           |
//! | [`dedicated`]              | what a windowless server is handed               |
//! | [`media`]                  | whether the page may open a microphone           |
//! | [`display`]                | whether there is anywhere to put a window        |
//! | [`steam_pump`]             | how often Steam's queue is drained               |
//! | [`metrics`]                | how long the shell took to get out of the way    |
//! | [`roster`]                 | whether the cloud holds the roster that went into it |
//!
//! **The four platform seams are the SAME three-file shape the rest of the game
//! uses** — bridge → provider → platform — with the third file the only one that
//! lives in `src-tauri/`, because it is the only one that talks to Steam. That
//! is what makes the whole of a protocol testable here against a fake provider,
//! including the failure paths a real Steam client cannot be asked to produce on
//! demand.
//!
//! Tests for all of it live in `tests/` as their own files (OSS_GAME_SPEC §20.1) —
//! which is the second reason this is a library crate rather than a module of
//! the binary: a Rust integration test can only reach a crate's public API.

pub mod achievements;
pub mod achievements_provider;
pub mod bridge;
pub mod capabilities;
pub mod channels;
pub mod cloud_provider;
pub mod cloud_save;
pub mod config;
pub mod dedicated;
pub mod display;
pub mod leaderboards;
pub mod leaderboards_provider;
pub mod media;
pub mod metrics;
pub mod mod_archive;
pub mod mods;
pub mod net;
pub mod net_firewall;
pub mod net_invite;
pub mod net_lobby;
pub mod output;
pub mod roster;
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
