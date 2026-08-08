// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! FINDING THE THINGS THAT ARE NOT RUST — the peer of
//! `electron/src/resources.ts`, and the mirror image of its problem.
//!
//! Two of this shell's features are Node programs that the Electron shell
//! merely IMPORTS, because its main process is already Node:
//!
//!   THE SESSION SERVER  the engine compiled for Node (`scripts/build-server.mjs`).
//!                       Electron forks it with `utilityProcess`; here it is a
//!                       child process on a Node runtime.
//!   THE MOD COMPILER    `mod/tools/build.mjs`, shared verbatim with the CLI a
//!                       modder runs. Electron `import()`s it; here it is a
//!                       child process too, and what crosses is JSON.
//!
//! Neither may be rewritten in Rust, and the reason is the same for both: there
//! is ONE compiler and ONE server, so that "it works in my mod" and "it works in
//! the game" — and "the dedicated server is the same file" — stay true rather
//! than aspirational. A second implementation would be a second set of bugs
//! nobody could reconcile.
//!
//! **SO THE SHELL NEEDS A NODE RUNTIME, AND A PLAYER HAS NO REASON TO HAVE
//! ONE.** A packaged build therefore carries one beside itself. That is the one
//! place this shell is fatter than the promise Tauri makes — a Node binary is
//! ~50 MB — and it is still a fraction of Electron's Chromium, which is a whole
//! browser carried for the same two features plus the window. A build with
//! neither multiplayer nor mods stamped does not need it at all, and
//! `scripts/package.mjs` leaves it out of one.
//!
//! There are exactly two layouts to resolve between, as there are on the
//! Electron side, and they cannot be told apart by looking for a file — a
//! developer running a packaged build has both. The caller says which.

use std::path::{Path, PathBuf};

/// Where the shell's out-of-band files are, for one shape of app.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resources {
    root: PathBuf,
    packaged: bool,
}

impl Resources {
    /// A PACKAGED app: the bundle's own resource directory, laid out by
    /// `tauri/scripts/package.mjs` to mirror the repo where it matters.
    pub fn packaged(resource_dir: impl Into<PathBuf>) -> Self {
        Self {
            root: resource_dir.into(),
            packaged: true,
        }
    }

    /// A CHECKOUT: the repository root.
    pub fn checkout(repo_root: impl Into<PathBuf>) -> Self {
        Self {
            root: repo_root.into(),
            packaged: false,
        }
    }

    /// Whether this is the packaged shape.
    pub fn is_packaged(&self) -> bool {
        self.packaged
    }

    /// The root everything below is resolved from.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The session server's entry point — what the sidecar runs.
    ///
    /// **In a checkout it is under `electron/`, and that is history rather than
    /// ownership.** `scripts/build-server.mjs` is the ENGINE's Node ship target
    /// and predates this tree; both shells consume the same output, and
    /// building it twice would be two copies of the simulation that could
    /// disagree. The directory moves beside `server/` the day only one desktop
    /// wrapper is left, which is the moment it stops being confusing rather than
    /// merely inaccurate.
    ///
    /// The compiled tree is self-contained ESM with its own `package.json`, so
    /// nothing here has to resolve anything inside it — the one path is the
    /// entry, and Node finds the rest by relative import from there.
    pub fn server_entry(&self) -> PathBuf {
        if self.packaged {
            self.root.join("server").join("server").join("main.js")
        } else {
            self.root
                .join("electron")
                .join("server-dist")
                .join("server")
                .join("main.js")
        }
    }

    /// A file inside the mod toolchain, by its path relative to `mod/tools/`.
    ///
    /// The packaged tree MIRRORS the repo's layout rather than flattening it,
    /// because every module in there finds its neighbours by relative path
    /// (`../../scripts/…`, `new URL("../../content", …)`). Only the root
    /// differs.
    pub fn mod_tools(&self, file: &str) -> PathBuf {
        let root = if self.packaged {
            self.root.join("modtools").join("mod").join("tools")
        } else {
            self.root.join("mod").join("tools")
        };
        root.join(file)
    }

    /// The reference catalog the compiler validates a mod against. It sits
    /// beside `tools/` in both layouts.
    pub fn mod_catalog(&self) -> PathBuf {
        self.mod_tools("..").join("catalog.json")
    }

    /// The adapter that runs the compiler and prints JSON.
    ///
    /// It belongs to this SHELL rather than to the mod SDK: the SDK's own CLI
    /// is written for a person at a terminal, and what a Rust process needs is
    /// one folder in and one JSON document out. Putting a machine mode on the
    /// modder's command would be a shell concern leaking into a published tool.
    pub fn mod_compiler(&self) -> PathBuf {
        if self.packaged {
            self.root.join("modtools").join("mod-compile.mjs")
        } else {
            self.root
                .join("tauri")
                .join("scripts")
                .join("mod-compile.mjs")
        }
    }

    /// The Node runtime to run all of the above on.
    ///
    /// A packaged build carries one; a checkout uses whatever the developer
    /// already has, because they built this tree with it. The bare name is
    /// resolved by the OS's own PATH search, which is exactly right for a
    /// developer machine and exactly wrong for a player's — hence the bundled
    /// copy, which is an absolute path and cannot be shadowed.
    pub fn node(&self) -> PathBuf {
        if self.packaged {
            self.root.join("runtime").join(NODE_EXECUTABLE)
        } else {
            PathBuf::from(NODE_EXECUTABLE)
        }
    }

    /// Is everything the sidecar needs actually here?
    ///
    /// Answered so the failure is one legible line in the launch log at the
    /// moment multiplayer is first asked for, rather than a spawn error with an
    /// OS message about a path nobody recognises.
    pub fn missing_for_sessions(&self) -> Option<String> {
        let entry = self.server_entry();
        if !entry.is_file() {
            return Some(format!(
                "the session server is not built — looked for {}. \
                 From a checkout, run `npm run server:build` at the repo root.",
                entry.display()
            ));
        }
        self.missing_runtime()
    }

    /// …and for compiling a mod.
    pub fn missing_for_mods(&self) -> Option<String> {
        let compiler = self.mod_compiler();
        if !compiler.is_file() {
            return Some(format!(
                "the mod compiler is missing — looked for {}",
                compiler.display()
            ));
        }
        self.missing_runtime()
    }

    fn missing_runtime(&self) -> Option<String> {
        // Only the PACKAGED runtime is checked: a checkout's `node` is a PATH
        // lookup, and a shell that tried to resolve one itself would be
        // re-implementing the OS's search and getting it wrong on somebody's
        // version manager.
        let node = self.node();
        if self.packaged && !node.is_file() {
            return Some(format!(
                "this build carries no Node runtime — looked for {}. \
                 It was packaged without multiplayer or mods.",
                node.display()
            ));
        }
        None
    }
}

/// What the Node binary is called on the platform being built for.
#[cfg(windows)]
pub const NODE_EXECUTABLE: &str = "node.exe";
/// What the Node binary is called on the platform being built for.
#[cfg(not(windows))]
pub const NODE_EXECUTABLE: &str = "node";
