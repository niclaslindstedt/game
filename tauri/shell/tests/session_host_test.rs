// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHAT THE SESSION PROCESS SAID — the sidecar's control protocol, read.
//!
//! Two of these are the ones that break a session silently. `unsolicited` is
//! the list the whole request/reply queue rests on: the server answers in
//! ORDER, so a log line wrongly counted as an answer would settle whatever
//! request happened to be in flight and the HOST screen would report a refusal
//! it was never sent. And the snapshot endpoint is what the page is told to
//! connect to — a port of 0 or a missing token is a channel that cannot open,
//! and it must be caught here rather than presented as a session that never
//! starts.

use adastrail_shell::session_host::{describe_exit, parse_reply, ServerReply, SnapshotEndpoint};
use serde_json::json;

#[test]
fn the_first_line_says_where_the_page_connects() {
    let reply = parse_reply(
        r#"{"kind":"ready","protocol":17,"snapshot":{"port":49312,"token":"abc","path":"/snapshot"}}"#,
    )
    .expect("a ready");
    let ServerReply::Ready { protocol, snapshot } = reply else {
        panic!("the first line is always ready");
    };
    assert_eq!(protocol, 17);
    let endpoint = snapshot.expect("an endpoint");
    assert_eq!(
        endpoint,
        SnapshotEndpoint {
            port: 49_312,
            token: "abc".to_string(),
            path: "/snapshot".to_string(),
        }
    );
    // 127.0.0.1 rather than `localhost`: the name resolves to two addresses on
    // a dual-stack machine and the child bound one of them.
    assert_eq!(endpoint.url(), "ws://127.0.0.1:49312/snapshot?token=abc");
}

#[test]
fn an_endpoint_that_cannot_be_connected_to_is_no_endpoint() {
    // Port 0 is what an UNBOUND listener reports, and a page told to connect to
    // it gets a refusal with nothing to say about why.
    for broken in [
        r#"{"kind":"ready","protocol":1,"snapshot":{"port":0,"token":"abc"}}"#,
        r#"{"kind":"ready","protocol":1,"snapshot":{"port":80,"token":""}}"#,
        r#"{"kind":"ready","protocol":1,"snapshot":{"port":80}}"#,
        r#"{"kind":"ready","protocol":1}"#,
    ] {
        let Some(ServerReply::Ready { snapshot, .. }) = parse_reply(broken) else {
            panic!("still a ready: {broken}");
        };
        assert!(snapshot.is_none(), "{broken}");
    }
}

#[test]
fn nothing_is_ever_waiting_on_the_four_that_arrive_unasked() {
    // Get this list wrong and the failure is SILENT: a log line settles whatever
    // request is in flight, and the HOST screen reports a refusal nobody sent.
    for raw in [
        r#"{"kind":"ready","protocol":1}"#,
        r#"{"kind":"log","line":"session server ready"}"#,
        r#"{"kind":"invite"}"#,
        r#"{"kind":"peer-send","to":"7656","data":[1,2],"mode":"reliable"}"#,
    ] {
        let reply = parse_reply(raw).expect("a reply");
        assert!(reply.unsolicited(), "{raw}");
    }
    for raw in [
        r#"{"kind":"started","levelId":"moon"}"#,
        r#"{"kind":"status","tick":1}"#,
        r#"{"kind":"listening","bound":null}"#,
        r#"{"kind":"connected","ok":true}"#,
        r#"{"kind":"stopped","reason":"stopped"}"#,
        r#"{"kind":"error","detail":"nope"}"#,
    ] {
        let reply = parse_reply(raw).expect("a reply");
        assert!(!reply.unsolicited(), "{raw} answers somebody");
    }
}

#[test]
fn a_relayed_packet_defaults_to_the_unreliable_path() {
    // The relay's unreliable path is the one that carries snapshots; a
    // mis-defaulted mode would put every frame through Valve's retransmit
    // queue and turn a dropped packet into a stall.
    let Some(ServerReply::PeerSend { reliable, data, to }) =
        parse_reply(r#"{"kind":"peer-send","to":"7656","data":[7,8,9]}"#)
    else {
        panic!("a peer-send");
    };
    assert!(!reliable);
    assert_eq!(data, vec![7, 8, 9]);
    assert_eq!(to, "7656");

    let Some(ServerReply::PeerSend { reliable, .. }) =
        parse_reply(r#"{"kind":"peer-send","to":"7656","data":[],"mode":"reliable"}"#)
    else {
        panic!("a peer-send");
    };
    assert!(reliable);
}

#[test]
fn stray_output_is_noise_rather_than_a_reason_to_stop_reading() {
    // The child's stdout is a protocol channel, and a session killed by
    // somebody else's `console.log` would be a spectacular way to lose a run.
    for raw in [
        "",
        "   ",
        "Debugger attached.",
        "[]",
        r#"{"no":"kind"}"#,
        "{ half an object",
    ] {
        assert!(parse_reply(raw).is_none(), "{raw:?}");
    }
}

#[test]
fn a_newer_server_talking_to_an_older_shell_degrades_rather_than_crashes() {
    let reply = parse_reply(r#"{"kind":"telemetry","frames":90}"#).expect("still parsed");
    assert_eq!(
        reply,
        ServerReply::Unknown {
            kind: "telemetry".to_string()
        }
    );
    assert_eq!(reply.kind(), "telemetry");
    assert!(
        !reply.unsolicited(),
        "an unknown kind is not assumed harmless"
    );
}

#[test]
fn a_crash_and_a_stop_do_not_read_the_same() {
    // The exit handler fires for a clean stop and for a segfault alike, so the
    // reason is recorded BEFORE the kill — without that, the HOST screen says
    // "stopped" over a crash.
    assert_eq!(describe_exit(Some(0), true), None, "the player asked");
    let line = describe_exit(Some(139), false).expect("a warning");
    assert!(line.contains("139"));
    assert!(describe_exit(None, false)
        .expect("a warning")
        .contains("killed"));
}

#[test]
fn every_reply_reports_the_kind_it_arrived_as() {
    // The pending queue matches on this string, so a variant whose `kind` did
    // not round-trip would settle the wrong waiter.
    for (raw, kind) in [
        (r#"{"kind":"started","levelId":"m"}"#, "started"),
        (r#"{"kind":"status"}"#, "status"),
        (r#"{"kind":"listening"}"#, "listening"),
        (r#"{"kind":"connected","ok":false}"#, "connected"),
        (r#"{"kind":"stopped"}"#, "stopped"),
        (r#"{"kind":"error","detail":"x"}"#, "error"),
        (r#"{"kind":"invite"}"#, "invite"),
    ] {
        assert_eq!(parse_reply(raw).expect("a reply").kind(), kind, "{raw}");
    }
}

#[test]
fn a_listening_reply_travels_whole_to_the_page() {
    // The shell reads three fields off it and forwards the rest untouched — the
    // bound address in particular is the session's own and must not be restated.
    let Some(ServerReply::Listening { detail }) = parse_reply(
        r#"{"kind":"listening","bound":{"address":"0.0.0.0","port":27016},"steam":true,"protocol":17,"build":"1.4.2"}"#,
    ) else {
        panic!("a listening");
    };
    assert_eq!(detail["bound"]["port"], json!(27_016));
    assert_eq!(detail["build"], json!("1.4.2"));
}
