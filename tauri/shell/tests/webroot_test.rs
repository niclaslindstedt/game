// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE CONTAINMENT CHECK, which is the one thing in this crate an attacker
//! would go at — the peer of `electron/tests/webroot_test.ts`.
//!
//! The URL path is attacker-influenced in principle (any link the page
//! follows), and the webroot sits inside the player's install next to whatever
//! else that directory holds. Every case below is a way out that has worked on
//! somebody's static file server.

use std::fs;
use std::path::{Path, PathBuf};

use adastrail_shell::webroot::{
    content_type_for, percent_decode, resolve_webroot_file, webroot_exists,
};

/// A throwaway webroot with a couple of files in it, plus a SECRET beside it —
/// the file every escape below is trying to reach.
struct Fixture {
    root: PathBuf,
    outside: PathBuf,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let base = std::env::temp_dir().join(format!("adastrail-webroot-{name}"));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("webroot");
        fs::create_dir_all(root.join("assets")).expect("fixture webroot");
        fs::write(root.join("index.html"), "<!doctype html>").expect("index");
        fs::write(root.join("assets/app.js"), "export {}").expect("app.js");
        fs::create_dir_all(root.join("library")).expect("library dir");
        fs::write(root.join("library/index.html"), "<!doctype html>").expect("library index");
        let outside = base.join("secret.txt");
        fs::write(&outside, "not yours").expect("secret");
        Self { root, outside }
    }

    fn resolve(&self, path: &str) -> Option<PathBuf> {
        resolve_webroot_file(path, &self.root)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(self.root.parent().unwrap_or(Path::new("/")));
    }
}

#[test]
fn serves_a_file_inside_the_root() {
    let fixture = Fixture::new("inside");
    let resolved = fixture.resolve("/assets/app.js").expect("a file");
    assert!(resolved.ends_with("assets/app.js"));
}

#[test]
fn the_bare_root_is_the_index() {
    let fixture = Fixture::new("bare-root");
    assert!(fixture.resolve("/").expect("index").ends_with("index.html"));
}

#[test]
fn a_directory_is_its_index() {
    let fixture = Fixture::new("directory");
    let resolved = fixture.resolve("/library").expect("library index");
    assert!(resolved.ends_with("library/index.html"));
}

#[test]
fn a_missing_file_is_not_a_file() {
    let fixture = Fixture::new("missing");
    assert_eq!(fixture.resolve("/nope.js"), None);
}

#[test]
fn a_dot_dot_never_leaves_the_root() {
    let fixture = Fixture::new("dotdot");
    assert!(fixture.outside.is_file(), "the fixture's bait must exist");
    assert_eq!(fixture.resolve("/../secret.txt"), None);
    assert_eq!(fixture.resolve("/assets/../../secret.txt"), None);
    assert_eq!(fixture.resolve("/a/b/../../../secret.txt"), None);
}

#[test]
fn a_percent_encoded_dot_dot_never_leaves_the_root() {
    // The whole reason decoding happens BEFORE containment: `%2e%2e` is a `..`
    // that has not been spelled as one yet, and a check that ran first would
    // wave it through.
    let fixture = Fixture::new("encoded-dotdot");
    assert_eq!(fixture.resolve("/%2e%2e/secret.txt"), None);
    assert_eq!(fixture.resolve("/assets/%2E%2E/%2E%2E/secret.txt"), None);
}

#[test]
fn an_absolute_path_is_not_a_way_in() {
    let fixture = Fixture::new("absolute");
    // A second leading slash, a drive letter, a UNC-ish prefix: all of these
    // are "start again from the top of the filesystem" in some resolver.
    assert_eq!(fixture.resolve("//etc/passwd"), None);
    assert_eq!(fixture.resolve("/C:/Windows/win.ini"), None);
}

#[test]
fn a_nul_is_refused_rather_than_truncated() {
    let fixture = Fixture::new("nul");
    assert_eq!(fixture.resolve("/index.html%00.png"), None);
}

#[test]
fn an_undecodable_path_is_refused_rather_than_taken_raw() {
    assert_eq!(percent_decode("/%zz"), None);
    assert_eq!(percent_decode("/%2"), None);
    assert_eq!(percent_decode("/ok"), Some("/ok".to_string()));
    assert_eq!(percent_decode("/a%20b"), Some("/a b".to_string()));
}

#[test]
fn a_module_is_served_as_javascript() {
    // A browser refuses a module served as anything else, and the failure is a
    // blank screen rather than an error — which is why the map is explicit.
    assert_eq!(
        content_type_for(Path::new("app.js")),
        "text/javascript; charset=utf-8"
    );
    assert_eq!(
        content_type_for(Path::new("app.MJS")),
        "text/javascript; charset=utf-8"
    );
    assert_eq!(content_type_for(Path::new("atlas.png")), "image/png");
    assert_eq!(
        content_type_for(Path::new("sw.webmanifest")),
        "application/manifest+json; charset=utf-8"
    );
}

#[test]
fn an_unknown_extension_is_bytes_rather_than_a_guess() {
    assert_eq!(
        content_type_for(Path::new("thing.xyz")),
        "application/octet-stream"
    );
    assert_eq!(
        content_type_for(Path::new("LICENSE")),
        "application/octet-stream"
    );
}

#[test]
fn an_unbundled_webroot_is_visible_before_the_window_opens() {
    let fixture = Fixture::new("exists");
    assert!(webroot_exists(&fixture.root));
    assert!(!webroot_exists(&fixture.root.join("assets")));
}
