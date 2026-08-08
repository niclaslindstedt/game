// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The Tauri desktop shell's decision layer.
//!
//! Every module here is the peer of a file in [`electron/src/`], and answers
//! the same question with the same name — deliberately, so that a change to one
//! shell is a visible gap in the other rather than a silent divergence. What is
//! NOT here is anything that draws, opens or talks to something: those live in
//! `src-tauri/`, which is the only crate in this tree that knows Tauri exists.
//!
//! | Here                | Its Electron peer            | Answers                              |
//! | ------------------- | ---------------------------- | ------------------------------------ |
//! | [`capabilities`]    | `capabilities.ts`            | what this copy of the app may do     |
//! | [`bridge`]          | `main.ts`'s `routeMessage`   | which protocol a page message is     |
//! | [`channels`]        | `channels.ts`                | what the one IPC command is called   |
//! | [`config`]          | `config.ts`                  | where the app points itself          |
//! | [`output`]          | `output.ts`                  | where a diagnostic line goes         |
//! | [`user_data`]       | `user-data.ts`               | what the app's folder is called      |
//! | [`webroot`]         | `webroot.ts`                 | which file one request path is       |
//! | [`window_state`]    | `window-state.ts`            | where the window opens               |
//!
//! Tests for all of it live in `tests/` as their own files (OSS_SPEC §20.1) —
//! which is the second reason this is a library crate rather than a module of
//! the binary: a Rust integration test can only reach a crate's public API.
//!
//! [`electron/src/`]: https://github.com/niclaslindstedt/game/tree/main/electron/src

pub mod bridge;
pub mod capabilities;
pub mod channels;
pub mod config;
pub mod output;
pub mod user_data;
pub mod webroot;
pub mod window_state;
