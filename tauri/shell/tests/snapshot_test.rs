// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE SNAPSHOT CHANNEL's page-side adapter.
//!
//! The point of the whole design is that `pwa/` did not change: the page asks
//! for a `MessagePort` and gets one. So what is asserted here is that the
//! script the shell injects really does mint that pair, really does hold an
//! early port, and really does refuse to be pointed anywhere but loopback.

use adastrail_shell::snapshot::{
    adapter_script, open_script, shell_member, ON_NET_PORT_MEMBER, OPEN_PORT_FUNCTION,
};
use adastrail_shell::workshop::{disposition, tag_for_kind, ItemDisposition};

#[test]
fn the_page_is_handed_a_message_port_and_never_a_socket() {
    // `pwa/src/app/net-bridge.ts` types its listener as taking a `MessagePort`
    // and `pwa/src/game/net/port-transport.ts` calls `postMessage`/`start` on
    // it. A shell that handed over anything else would have forked the website.
    let script = adapter_script();
    assert!(script.contains("new MessageChannel()"));
    assert!(script.contains("channel.port1.start()"));
    assert!(script.contains("netListener(channel.port2)"));
}

#[test]
fn frames_arrive_as_array_buffers_rather_than_blobs() {
    // The default `binaryType` is `blob`, which would hand the client a `Blob`
    // where it expects an `ArrayBuffer` and turn every frame into an async read.
    assert!(adapter_script().contains("binaryType = 'arraybuffer'"));
}

#[test]
fn inputs_sent_before_the_socket_opens_are_queued_rather_than_thrown_away() {
    // The page starts sending the moment it has a port, and a `send` on a
    // CONNECTING socket throws — a thrown input is a run that never begins.
    let script = adapter_script();
    assert!(script.contains("queue.push"));
    assert!(script.contains("readyState === 0"));
}

#[test]
fn a_port_that_arrives_before_the_listener_is_held() {
    // The page registers `onSessionPort` before it asks to host — but a reload
    // can invert that, and an endpoint dropped for being early is a session
    // that never reaches the screen.
    let script = adapter_script();
    assert!(script.contains("netPending = channel.port2"));
    assert!(shell_member().contains("netPending"));
    assert!(shell_member().starts_with(&format!("    {ON_NET_PORT_MEMBER}:")));
}

#[test]
fn a_second_session_replaces_the_first_rather_than_running_beside_it() {
    // Hosting after joining mints a new session; the old socket must not go on
    // pumping frames into a port nobody reads.
    assert!(adapter_script().contains("netSocket.close()"));
}

#[test]
fn the_adapter_refuses_to_be_pointed_anywhere_but_loopback() {
    // The endpoint is minted by the session process and told only to the shell,
    // and the page-side half checks the shape anyway — one line, and it means a
    // bug in the shell cannot become an outbound connection.
    assert!(adapter_script().contains("indexOf('ws://127.0.0.1:') !== 0"));
}

#[test]
fn the_shell_reaches_the_page_the_same_way_every_other_bridge_does() {
    // A `window.__gis…` function called from OUTSIDE, guarded, never throwing
    // into the game's own console.
    let call = open_script("ws://127.0.0.1:49312/snapshot?token=abc");
    assert!(call.starts_with(&format!("try{{window.{OPEN_PORT_FUNCTION}&&")));
    assert!(call.contains("catch(e){}"));
    assert!(call.contains("\"ws://127.0.0.1:49312/snapshot?token=abc\""));
}

#[test]
fn a_url_reaching_the_page_is_encoded_rather_than_interpolated() {
    // The token is base64url and could not break out of a string literal today
    // — which is only true until the thing that builds it changes.
    let call = open_script("ws://127.0.0.1:1/snapshot?token=a\"'</script>");
    assert!(!call.contains("token=a\"'"), "{call}");
    assert!(call.contains("\\\""));
}

#[test]
fn a_workshop_kind_earns_one_of_two_tags() {
    // Two, because two is what the Workshop's own filter is worth: a player
    // wants to know whether this replaces the game or adds to it.
    assert_eq!(tag_for_kind("conversion"), "Total Conversion");
    assert_eq!(tag_for_kind("addon"), "Addon");
    assert_eq!(tag_for_kind(""), "Addon");
}

#[test]
fn a_subscription_mid_download_is_not_a_failure_and_not_a_mod() {
    // Kick the download along and leave it out of this pass; the next launch
    // sees it.
    assert_eq!(disposition(0), ItemDisposition::Downloading);
    assert_eq!(disposition(1), ItemDisposition::Downloading);
    assert_eq!(
        disposition(4),
        ItemDisposition::Ready {
            needs_update: false
        }
    );
    assert_eq!(
        disposition(4 | 8),
        ItemDisposition::Ready { needs_update: true }
    );
}
