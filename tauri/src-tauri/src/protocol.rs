// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Answering the `game://` scheme — the effects half of
//! `adastrail_shell::webroot`, which owns every decision this file acts on.
//!
//! Where the bundled site lives depends on the shape the app is in, and there
//! are exactly two:
//!
//! | Shape                       | `webroot/` is                                  |
//! | --------------------------- | ---------------------------------------------- |
//! | a checkout (`cargo run`)    | `tauri/webroot/`, beside the crate             |
//! | a packaged app              | in the bundle's resource directory             |
//!
//! `GIS_WEBROOT` overrides both, which is what lets a build serve a site from
//! somewhere else without rebuilding — the same escape hatch `GIS_GAME_URL`
//! gives for a REMOTE site.

use std::fs;
use std::path::PathBuf;

use adastrail_shell::output;
use adastrail_shell::webroot::{content_type_for, resolve_webroot_file};
use tauri::http::{Request, Response};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// Where the bundled site is, for this shape of app.
pub fn webroot_dir(app: &AppHandle) -> PathBuf {
    if let Some(override_dir) = std::env::var_os("GIS_WEBROOT") {
        return PathBuf::from(override_dir);
    }
    // The packaged answer first, because a developer running a packaged build
    // has both trees on disk and only one of them is the one they installed.
    if let Some(resource) = packaged_resource_dir(app) {
        return resource.join("webroot");
    }
    // A checkout: `src-tauri/` is one hop below the tree `bundle-web.mjs`
    // writes into, and `CARGO_MANIFEST_DIR` is resolved at compile time — which
    // is exactly right, since this branch only ever runs from that build.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|tree| tree.join("webroot"))
        .unwrap_or_else(|| PathBuf::from("webroot"))
}

/// The bundle's resource directory, or `None` when this is a checkout.
///
/// **THE TEST IS THE SITE'S OWN `index.html`**, and it is the same test
/// [`webroot_dir`] made before the resource directory grew three more
/// tenants (the session server, the mod toolchain, the Node runtime). They
/// cannot be told apart by looking for a file each, because a build packaged
/// without multiplayer legitimately has no server in there — but every packaged
/// build has a site, or it is not a build of this game at all.
pub fn packaged_resource_dir(app: &AppHandle) -> Option<PathBuf> {
    let resource = app
        .path()
        .resolve("webroot", BaseDirectory::Resource)
        .ok()?;
    if !resource.join("index.html").is_file() {
        return None;
    }
    resource.parent().map(std::path::Path::to_path_buf)
}

/// The repository root, for a checkout.
///
/// `CARGO_MANIFEST_DIR` is resolved at COMPILE time, which is exactly right:
/// this answer is only ever used by the build that was compiled from that tree.
pub fn checkout_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|tauri| tauri.parent())
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn not_found(path: &str) -> Response<Vec<u8>> {
    output::warn(&format!("webroot: 404 {path}"));
    Response::builder()
        .status(404)
        .header("content-type", "text/plain; charset=utf-8")
        .body(b"Not found".to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Serve one request off the bundled site.
///
/// **Read whole rather than streamed**, which is the one place this diverges
/// from the Electron peer and is a difference in the API rather than in the
/// judgement: Tauri's synchronous protocol handler returns a body, not a
/// stream. The biggest thing here is the sprite atlas, so the cost is one
/// copy of one asset at a time; if a future asset makes that wrong, the
/// asynchronous handler is the seam to move to.
pub fn serve(
    app: &AppHandle,
    request: &Request<Vec<u8>>,
    root: &std::path::Path,
) -> Response<Vec<u8>> {
    let _ = app;
    let uri = request.uri();
    let path = uri.path();
    let Some(file) = resolve_webroot_file(path, root) else {
        return not_found(path);
    };
    let Ok(body) = fs::read(&file) else {
        return not_found(path);
    };
    Response::builder()
        .status(200)
        .header("content-type", content_type_for(&file))
        // The bundle is on local disk and is replaced wholesale by an update,
        // so revalidation buys nothing — but a stale cached index.html pointing
        // at hashed chunks from a previous build is a silent black screen, the
        // exact failure the mobile shell disables its HTTP cache to avoid.
        .header("cache-control", "no-store")
        .body(body)
        .unwrap_or_else(|_| not_found(path))
}
