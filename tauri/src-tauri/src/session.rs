// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE SESSION SIDECAR, as a process — the effects half of
//! [`adastrail_shell::session_host`], and the peer of what
//! `electron/src/session-host.ts` gets from `utilityProcess.fork`.
//!
//! One process per SESSION. It is spawned on the Node runtime
//! ([`adastrail_shell::runtime`]) with `--shell`, which is the entry
//! `server/main.ts` calls "a shell spawned us as a plain child": the control
//! channel is this process's own stdio and the snapshot channel is a loopback
//! socket the PAGE opens straight to it.
//!
//! Three things are worth knowing before changing anything here:
//!
//!  * **STDIN'S END IS THE ORPHAN REAPER.** Electron kills its utility process
//!    in `before-quit`; a spawned child has no such handler to inherit. Dropping
//!    this struct closes the pipe, the child sees EOF, and it stops — so a
//!    session cannot outlive the shell even if the shell is killed rather than
//!    quit.
//!  * **A CRASH MUST LOOK LIKE A CRASH.** The expected-exit flag is set BEFORE
//!    the stop is written, and read back by the waiter; without that, a server
//!    that died mid-run and one the player asked to stop are indistinguishable
//!    and the HOST screen says "stopped" over a crash.
//!  * **STDERR IS NOT THE PROTOCOL.** Node writes its own diagnostics there, so
//!    it is forwarded to the launch log rather than parsed — which is also what
//!    makes a stack trace from the session readable in a bug report.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use adastrail_shell::output;
use adastrail_shell::runtime::Resources;
use adastrail_shell::session_host::{
    describe_exit, parse_reply, ServerReply, SnapshotEndpoint, READY_TIMEOUT_MS, SHUTDOWN_GRACE_MS,
};
use serde_json::Value;

/// A running session process.
pub struct Sidecar {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    expected_exit: Arc<AtomicBool>,
    /// Where the page opens the snapshot channel, once the child has said.
    snapshot: Mutex<Option<SnapshotEndpoint>>,
}

impl Sidecar {
    /// Spawn the session server and wait for it to say where the page connects.
    ///
    /// The wait is deliberate and short ([`READY_TIMEOUT_MS`]): the endpoint has
    /// to be in hand before the page is told to host anything, because the
    /// alternative is a page that asks for a port before one exists and a HOST
    /// screen that reports a session which never produced a frame.
    pub fn start(
        resources: &Resources,
        on_reply: impl Fn(ServerReply) + Send + Sync + 'static,
    ) -> Result<Arc<Self>, String> {
        if let Some(missing) = resources.missing_for_sessions() {
            return Err(missing);
        }
        let entry = resources.server_entry();
        let node = resources.node();
        output::info(&format!(
            "session server: starting {} {}",
            node.display(),
            entry.display()
        ));

        let mut child = Command::new(&node)
            .arg(&entry)
            .arg("--shell")
            // The compiled tree is self-contained ESM that finds its neighbours
            // by relative import, so the working directory only matters for a
            // relative path somebody types — and the entry's own directory is
            // the least surprising one.
            .current_dir(entry.parent().unwrap_or(Path::new(".")))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| format!("the session server could not be started — {err}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "the session server has no output channel".to_string())?;
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();

        let sidecar = Arc::new(Self {
            child: Mutex::new(Some(child)),
            stdin: Mutex::new(stdin),
            expected_exit: Arc::new(AtomicBool::new(false)),
            snapshot: Mutex::new(None),
        });

        let reader = Arc::clone(&sidecar);
        let expected = Arc::clone(&sidecar.expected_exit);
        std::thread::Builder::new()
            .name("session-replies".to_string())
            .spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    let Some(reply) = parse_reply(&line) else {
                        continue;
                    };
                    // The endpoint is held HERE rather than pushed at the
                    // caller, so a `start` that raced the ready line still finds
                    // it — the two arrive on different threads by construction.
                    if let ServerReply::Ready {
                        snapshot: Some(endpoint),
                        ..
                    } = &reply
                    {
                        if let Ok(mut slot) = reader.snapshot.lock() {
                            *slot = Some(endpoint.clone());
                        }
                    }
                    on_reply(reply);
                }
                // The pipe closed, which is the process ending.
                if let Some(line) = describe_exit(None, expected.load(Ordering::SeqCst)) {
                    output::warn(&line);
                }
            })
            .map_err(|err| format!("the session server's reader could not start — {err}"))?;

        if let Some(stderr) = stderr {
            std::thread::Builder::new()
                .name("session-stderr".to_string())
                .spawn(move || {
                    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                        output::warn(&format!("session server: {line}"));
                    }
                })
                .ok();
        }

        sidecar.await_snapshot()?;
        Ok(sidecar)
    }

    /// Block until the child reports its snapshot endpoint.
    fn await_snapshot(&self) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_millis(READY_TIMEOUT_MS);
        while Instant::now() < deadline {
            if self.snapshot().is_some() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        Err("the session server did not open its snapshot channel".to_string())
    }

    /// Where the page opens the snapshot channel.
    pub fn snapshot(&self) -> Option<SnapshotEndpoint> {
        self.snapshot.lock().ok().and_then(|slot| slot.clone())
    }

    /// Send one control message. A no-op when the process has gone.
    pub fn send(&self, control: &Value) {
        let Ok(mut slot) = self.stdin.lock() else {
            return;
        };
        let Some(stdin) = slot.as_mut() else {
            return;
        };
        // One line, flushed: the child reads newline-delimited JSON and a
        // buffered write would hold a `stop` until the buffer filled.
        if writeln!(stdin, "{control}")
            .and_then(|()| stdin.flush())
            .is_err()
        {
            // The child has gone; the reader thread is what reports that, and a
            // second complaint per message would drown it.
            *slot = None;
        }
    }

    /// Ask for an orderly shutdown, then kill if it does not come.
    ///
    /// Short grace, exactly as on the Electron side: the server's own stop is
    /// synchronous, so anything past this is a process that is no longer
    /// answering — and a host that will not quit is worse than one that is
    /// killed.
    pub fn stop(&self) {
        self.expected_exit.store(true, Ordering::SeqCst);
        self.send(&serde_json::json!({ "kind": "stop" }));
        // Closing stdin is the second half of the same instruction and the one
        // that works on a process that has stopped reading: the child treats
        // EOF as "nobody is driving".
        if let Ok(mut slot) = self.stdin.lock() {
            *slot = None;
        }
        let deadline = Instant::now() + Duration::from_millis(SHUTDOWN_GRACE_MS);
        loop {
            let Ok(mut slot) = self.child.lock() else {
                return;
            };
            let Some(child) = slot.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(_)) => {
                    *slot = None;
                    return;
                }
                Ok(None) if Instant::now() >= deadline => {
                    output::warn("session server did not stop; killing it");
                    let _ = child.kill();
                    let _ = child.wait();
                    *slot = None;
                    return;
                }
                Ok(None) => {}
                Err(_) => {
                    *slot = None;
                    return;
                }
            }
            drop(slot);
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        // A session server outliving the window it was started for is an orphan
        // holding a whole level in memory, and on a depot install nothing else
        // will ever reap it.
        self.stop();
    }
}
