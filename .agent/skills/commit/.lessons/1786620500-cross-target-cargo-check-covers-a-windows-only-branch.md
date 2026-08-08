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

No MSVC toolchain is needed, because `check`/`clippy` never link. Two things
this tree needs first, both cheap: `tauri/webroot/index.html` must exist (a
placeholder is enough, same as the workflow makes), and **`tauri-build` refuses
a Windows target without `src-tauri/icons/icon.ico`** — which
`tauri/scripts/icons.mjs` does not emit, since it only writes the four PNGs
Linux and macOS ask for. Wrapping the 256×256 PNG in a 22-byte ICO header is
enough to get past it locally (the icons directory is gitignored, so nothing
of that reaches a commit).

It does NOT prove the code RUNS — the decoy overlay surface still needs a
Windows machine with Steam — but "it compiles on the OS it is for" is no longer
something to leave to a packaging dispatch.
