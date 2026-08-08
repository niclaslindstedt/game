// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Tauri's own build step: it reads `tauri.conf.json`, generates the permission
//! schemas the `capabilities/` files are checked against, and on Windows
//! compiles the resource block that carries the icon and version.

fn main() {
    tauri_build::build();
}
