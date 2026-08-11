---
title: A `#[cfg(windows)]` branch IS checkable from Linux — `cargo check --target x86_64-pc-windows-msvc`
date: 2026-08-08
scope: tauri/src-tauri, tauri/shell, .github/workflows/desktop-tauri.yml
concepts: [quality-gates, ci, shells, false-green, rust]
---

The sibling lesson ("a shell's config is checked only on the OS it is FOR") is
about a field only one OS reads. Rust CODE behind `#[cfg(windows)]` is a
weaker case than it looks: `make tauri-lint` on Linux compiles the `not(windows)`
half and agrees with itself, but the Windows half — including any
`[target.'cfg(windows)'.dependencies]` and every call into them — can be
type-checked on the same Linux box:

```sh
rustup target add x86_64-pc-windows-msvc
cargo check --target x86_64-pc-windows-msvc -p adastrail-tauri
cargo clippy --target x86_64-pc-windows-msvc -p adastrail-tauri --all-targets -- -D warnings
```

No MSVC toolchain is needed, because `check`/`clippy` never link. Three things
this tree needs first, and the third is the one that turns a green local run
into a red CI:

1. `tauri/webroot/index.html` must exist — a placeholder, same as the workflow
   makes.
2. **`tauri-build` refuses a Windows target without `src-tauri/icons/icon.ico`.**
   `tauri/scripts/icons.mjs` now emits one; before this it wrote only the four
   PNGs Linux and macOS ask for, which is why nothing could build for Windows
   from a fresh checkout.
3. **A RESOURCE COMPILER.** `tauri-build` builds a Windows resource file (icon
   + version block) through `embed-resource`, which shells out to `llvm-rc` and
   panics `NotAttempted("llvm-rc")` without one. A dev box with LLVM installed
   has it on `PATH` and never notices; a GitHub runner keeps LLVM under
   `/usr/lib/llvm-*/bin` and does not. `embed-resource` reads `RC` (and
   `RC_<target>`), so pointing that at the newest `/usr/lib/llvm-*/bin/llvm-rc`
   is the version-agnostic fix — and it is what
   `.github/workflows/desktop-tauri.yml` now does.

It does NOT prove the code RUNS — the decoy overlay surface still needs a
Windows machine with Steam — but "it compiles on the OS it is for" is no longer
something to leave to a packaging dispatch.
