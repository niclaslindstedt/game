// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Where the window points itself, and what it will follow a link to.
//!
//! The navigation rule is the security-shaped one: the window is pinned to our
//! own origin, so the game can never be replaced by a web page the player
//! cannot get out of. Everything else opens in their browser.

use adastrail_shell::config::{is_internal_url, start_url, APP_HOST, APP_SCHEME};

/// What the two desktop webviews actually grant a registered scheme. Both are
/// tested, because only one of them is what the developer writing this sees.
const UNIX_ORIGIN: &str = "game://localhost";
const WINDOWS_ORIGIN: &str = "http://game.localhost";

#[test]
fn the_window_opens_on_the_bundled_index() {
    assert_eq!(start_url(UNIX_ORIGIN), "game://localhost/index.html");
    assert_eq!(
        start_url("http://game.localhost/"),
        "http://game.localhost/index.html"
    );
}

#[test]
fn the_scheme_and_host_are_constants_the_saves_are_keyed_to() {
    // Changing either word orphans every roster on the machine, so they are
    // pinned here rather than left as a thing somebody could tidy.
    assert_eq!(APP_SCHEME, "game");
    assert_eq!(APP_HOST, "localhost");
}

#[test]
fn the_sites_own_pages_navigate_normally() {
    for origin in [UNIX_ORIGIN, WINDOWS_ORIGIN] {
        assert!(is_internal_url(origin, origin, None));
        assert!(is_internal_url(
            &format!("{origin}/library/index.html"),
            origin,
            None
        ));
        assert!(is_internal_url(&format!("{origin}/privacy"), origin, None));
    }
}

#[test]
fn anything_else_is_the_players_browser_rather_than_this_window() {
    for outside in [
        "https://github.com/niclaslindstedt/game",
        "http://game.localhost.evil.example/steal",
        "game://localhost.evil.example/steal",
        "file:///etc/passwd",
        "javascript:alert(1)",
    ] {
        assert!(
            !is_internal_url(outside, UNIX_ORIGIN, None),
            "{outside} must not replace the game"
        );
    }
}

#[test]
fn a_remote_build_may_also_navigate_within_the_slot_it_was_pointed_at() {
    // GIS_GAME_URL points a debugging build at a deploy slot; its own pages
    // have to keep working, and nothing else gains anything.
    let remote = "https://game.niclaslindstedt.se/preview/";
    assert!(is_internal_url(
        &format!("{remote}library/"),
        UNIX_ORIGIN,
        Some(remote)
    ));
    assert!(!is_internal_url(
        "https://game.niclaslindstedt.se/",
        UNIX_ORIGIN,
        Some(remote)
    ));
    assert!(
        !is_internal_url("https://elsewhere.example/", UNIX_ORIGIN, Some("")),
        "an empty override must not match every URL"
    );
}
