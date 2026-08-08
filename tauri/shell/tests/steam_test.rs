// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE HANDSHAKE'S DECISIONS — which app id, whether to relaunch, and what the
//! shell says about an overlay it cannot draw.
//!
//! None of this needs Steam, which is the point: every one of these is a rule
//! that has to hold on a machine with the client closed, because that machine is
//! where the game is developed.

use adastrail_shell::steam::{
    describe_status, is_placeholder_app_id, overlay_explanation, overlay_support, restart_wanted,
    steam_app_id, steam_enabled, steam_overlay_wanted, OverlaySupport, SteamStatus, Webview,
    SPACEWAR_APP_ID,
};

/// An environment built from a literal table, which is what makes every rule
/// below testable without one.
fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
    move |name: &str| {
        pairs
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| (*value).to_string())
    }
}

#[test]
fn the_app_id_falls_back_to_spacewar_and_says_so() {
    assert_eq!(steam_app_id(&env(&[]), None), SPACEWAR_APP_ID);
    assert!(is_placeholder_app_id(steam_app_id(&env(&[]), None)));
    assert_eq!(
        steam_app_id(&env(&[("GIS_STEAM_APP_ID", "3011600")]), None),
        3_011_600
    );
    assert!(!is_placeholder_app_id(3_011_600));
}

#[test]
fn a_packaged_build_carries_its_own_app_id() {
    // The whole point of the stamp: an installed copy must not depend on the
    // environment it happens to be started in.
    assert_eq!(steam_app_id(&env(&[]), Some("3011600")), 3_011_600);
    // And a developer pointing a checkout somewhere else still wins.
    assert_eq!(
        steam_app_id(&env(&[("GIS_STEAM_APP_ID", "480")]), Some("3011600")),
        SPACEWAR_APP_ID
    );
}

#[test]
fn an_unreadable_app_id_is_the_placeholder_rather_than_a_guess() {
    // A typo in a packaging environment must not become a handshake against
    // somebody else's app — falling back to Spacewar keeps it obviously a
    // development build, which `is_placeholder_app_id` then refuses to ship.
    for bad in ["", "  ", "0", "not-a-number", "-7", "3011600x"] {
        assert_eq!(
            steam_app_id(&env(&[("GIS_STEAM_APP_ID", bad)]), None),
            SPACEWAR_APP_ID,
            "{bad:?}"
        );
        assert_eq!(
            steam_app_id(&env(&[]), Some(bad)),
            SPACEWAR_APP_ID,
            "stamped {bad:?}"
        );
    }
}

#[test]
fn steam_is_on_unless_it_is_explicitly_off() {
    assert!(steam_enabled(&env(&[])));
    assert!(steam_enabled(&env(&[("GIS_STEAM", "on")])));
    assert!(!steam_enabled(&env(&[("GIS_STEAM", "off")])));
}

#[test]
fn only_a_real_app_id_asks_steam_to_relaunch_us() {
    // Spacewar is shared by every developer testing against it, and asking
    // Steam to relaunch us as it would send a local run somewhere surprising.
    assert!(!restart_wanted(true, SPACEWAR_APP_ID));
    assert!(restart_wanted(true, 3_011_600));
    assert!(!restart_wanted(false, 3_011_600), "GIS_STEAM=off is off");
}

#[test]
fn steam_starting_the_process_is_read_off_the_variables_steam_stamps() {
    assert!(!steam_overlay_wanted(&env(&[])));
    for stamped in ["SteamAppId", "SteamGameId", "SteamClientLaunch"] {
        assert!(
            steam_overlay_wanted(&env(&[(stamped, "480")])),
            "{stamped} means Steam started us"
        );
        assert!(
            !steam_overlay_wanted(&env(&[(stamped, "")])),
            "{stamped} set to nothing says nothing"
        );
    }
}

#[test]
fn the_overlay_switch_overrides_the_stamps_both_ways() {
    assert!(steam_overlay_wanted(&env(&[("GIS_STEAM_OVERLAY", "1")])));
    assert!(!steam_overlay_wanted(&env(&[
        ("GIS_STEAM_OVERLAY", "0"),
        ("SteamAppId", "480"),
    ])));
}

#[test]
fn no_webview_can_carry_valves_overlay() {
    // The finding, pinned. If this ever stops being true it is a
    // platform change worth a failing test and a paragraph, not a quiet flip.
    assert_eq!(
        overlay_support(Webview::WkWebView),
        OverlaySupport::Unsupported
    );
    assert_eq!(
        overlay_support(Webview::WebKitGtk),
        OverlaySupport::Unsupported
    );
    assert_eq!(overlay_support(Webview::WebView2), OverlaySupport::NotYet);
}

#[test]
fn the_overlay_line_names_the_webview_and_where_to_read_more() {
    for (webview, name) in [
        (Webview::WebView2, "WebView2"),
        (Webview::WkWebView, "WKWebView"),
        (Webview::WebKitGtk, "WebKitGTK"),
    ] {
        let line = overlay_explanation(webview, true);
        assert!(line.contains(name), "{name} must be named");
        assert!(line.contains("tauri/README.md"));
        assert!(
            line.contains("Steam started this process"),
            "and how this launch began"
        );
    }
    assert!(overlay_explanation(Webview::WkWebView, false).contains("Steam did not start"));
}

#[test]
fn a_handshake_that_failed_reads_as_an_ordinary_state() {
    // "No Steam here" is a developer build, a closed client, or GIS_STEAM=off —
    // all ordinary, none of them an error the player has to do anything about.
    let disabled = describe_status(&SteamStatus::Disabled);
    assert!(disabled.contains("GIS_STEAM=off"));

    let unavailable = describe_status(&SteamStatus::Unavailable {
        reason: "steam probably isn't running".to_string(),
    });
    assert!(unavailable.contains("plays device-locally"));
    assert!(unavailable.contains("steam probably isn't running"));
}

#[test]
fn a_spacewar_connection_says_so_in_the_log() {
    // The one line that stops somebody reporting "achievements don't stick" on
    // a build that was never talking to our app at all.
    let line = describe_status(&SteamStatus::Connected {
        player: "Ada".to_string(),
        app_id: SPACEWAR_APP_ID,
        placeholder: true,
    });
    assert!(line.contains("Ada"));
    assert!(line.contains("SPACEWAR TEST APP"));

    let real = describe_status(&SteamStatus::Connected {
        player: "Ada".to_string(),
        app_id: 3_011_600,
        placeholder: false,
    });
    assert!(!real.contains("SPACEWAR"));
    assert!(real.contains("3011600"));
}
