// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE SNAPSHOT CHANNEL — the decision phase 3 exists to make, and the page's
//! half of it.
//!
//! A session publishes twenty times a second. Electron mints a `MessagePort`
//! pair and hands the page one end, so those frames never touch the main
//! process; Tauri's IPC has no port transfer, so the property that mattered —
//! **the shell is not in the path** — has to be bought some other way. Three
//! candidates were on the table (`docs/tauri-migration.md`), and this is the
//! one that keeps the property without changing anything else:
//!
//! | Candidate | What it costs |
//! | --------- | ------------- |
//! | `tauri::ipc::Channel` | Every frame crosses the SHELL's event loop — the exact cost the `MessagePort` was chosen to avoid, paid twice (in and out) |
//! | A `SharedArrayBuffer` ring | Needs COOP/COEP on the game's own origin, so the WEBSITE's serving changes to suit one shell |
//! | **A loopback WebSocket the page opens** | One listening socket on 127.0.0.1, behind a per-session token |
//!
//! **AND THE PAGE NEVER LEARNS.** `pwa/src/app/net-bridge.ts` asks for a
//! `MessagePort` and gets one: this script mints the pair IN THE PAGE and
//! bridges the shell's end to the socket. Not one line of `pwa/` changed for
//! this shell to have multiplayer, which is the same test cloud save,
//! achievements and screenshots passed in phase 2.
//!
//! **WHAT THE SOCKET COSTS IS ANSWERED RATHER THAN WAVED AT.** It binds
//! 127.0.0.1 on an ephemeral port the session process itself chose, it answers
//! 426 to everything that is not the one upgrade path, and the upgrade carries
//! a secret that process minted and told only the shell. That is a strictly
//! smaller door than the UDP socket a host already opens to the internet — and
//! unlike that one, it closes when the session does.

use serde_json::json;

/// The function the SHELL calls in the page to hand over one endpoint.
///
/// The same shape as every other return path on every shell — the native side
/// calling a `window.__gis…` function from outside — rather than an event or a
/// second channel, because that shape is already the one thing all three shells
/// have in common.
pub const OPEN_PORT_FUNCTION: &str = "__gisShellOpenNetPort";

/// The page's own accessor, which `pwa/src/app/shell-bridge.ts` declares and
/// `net-bridge.ts` calls. Optional on the web side precisely because only a
/// desktop shell has one.
pub const ON_NET_PORT_MEMBER: &str = "onNetPort";

/// The page-side adapter, as JavaScript for the initialization script.
///
/// It is written as one function on the shell object plus one global the shell
/// calls, and it holds four rules that are each a bug otherwise:
///
///  1. **The listener may be registered before OR after the port arrives.** The
///     page registers `onSessionPort` before it asks to host, and the shell
///     opens the endpoint as part of answering that — but a reload can invert
///     it. So a port that arrives early is HELD, exactly as the page holds an
///     early invite.
///  2. **Outbound frames are queued until the socket opens.** The page starts
///     sending inputs the moment it has a port; a `send` on a CONNECTING socket
///     throws, and a thrown input is a run that never begins.
///  3. **Binary, and `arraybuffer`.** The default `binaryType` is `blob`, which
///     would hand the client a `Blob` where it expects an `ArrayBuffer` and turn
///     every frame into an async read.
///  4. **A second endpoint replaces the first.** Hosting after joining (or
///     joining twice) mints a new session; the old socket is closed rather than
///     left pumping frames into a port nobody reads.
pub fn adapter_script() -> String {
    format!(
        r#"  var netListener = null;
  var netPending = null;
  var netSocket = null;

  var openNetPort = function (url) {{
    if (typeof url !== 'string' || url.indexOf('ws://127.0.0.1:') !== 0) return;
    if (netSocket) {{ try {{ netSocket.close(); }} catch (e) {{}} }}
    var socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    netSocket = socket;
    var channel = new MessageChannel();
    var queue = [];
    socket.addEventListener('open', function () {{
      for (var i = 0; i < queue.length; i++) socket.send(queue[i]);
      queue = [];
    }});
    socket.addEventListener('message', function (event) {{
      // The page's client takes ownership of every frame, so the buffer is
      // handed over rather than copied — the same contract the MessagePort
      // pair has under Electron.
      try {{ channel.port1.postMessage(event.data, [event.data]); }} catch (e) {{}}
    }});
    socket.addEventListener('close', function () {{
      if (netSocket === socket) netSocket = null;
    }});
    channel.port1.onmessage = function (event) {{
      if (socket.readyState === 0) {{ queue.push(event.data); return; }}
      if (socket.readyState !== 1) return;
      try {{ socket.send(event.data); }} catch (e) {{}}
    }};
    channel.port1.start();
    if (netListener) netListener(channel.port2);
    else netPending = channel.port2;
  }};

  define({open_function}, openNetPort);
"#,
        open_function = json!(OPEN_PORT_FUNCTION),
    )
}

/// The member the shell object carries, spliced into its literal.
pub fn shell_member() -> String {
    format!(
        r#"    {member}: function (listener) {{
      netListener = listener;
      if (netPending) {{ var held = netPending; netPending = null; listener(held); }}
    }}"#,
        member = ON_NET_PORT_MEMBER,
    )
}

/// The call that hands one endpoint over, ready to be evaluated in the webview.
///
/// The URL is JSON-encoded rather than interpolated raw: the token is base64url
/// and could not break out of a string literal, but a URL reaching an `eval`
/// unescaped is the kind of thing that is only safe until the thing that builds
/// it changes.
pub fn open_script(url: &str) -> String {
    format!(
        "try{{window.{OPEN_PORT_FUNCTION}&&window.{OPEN_PORT_FUNCTION}({})}}catch(e){{}};",
        json!(url)
    )
}
