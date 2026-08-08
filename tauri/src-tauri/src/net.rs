// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE NET BRIDGE, wired up — the effects half of [`adastrail_shell::net`], and
//! the peer of `createNetBridge` in `electron/src/net.ts`.
//!
//! Everything it DECIDES lives in the shell crate: what a request means, what
//! goes down to the session, what comes back to the page. What is here is the
//! orchestration — a process, a lobby, a pump, and the request/reply queue that
//! ties a page's `requestId` to a session's answer.
//!
//! **REPLIES ARE MATCHED BY ORDER, NOT BY ID.** The session answers in order,
//! so a queue is enough and no correlation id has to cross — which keeps
//! `server/main.ts` free of request bookkeeping the dedicated server would also
//! have to carry. The list of replies nobody is waiting on is
//! [`ServerReply::unsolicited`], and getting it wrong is silent.
//!
//! **EVERY REQUEST THAT WAITS RUNS ON A THREAD OF ITS OWN.** `shell_post` is
//! Tauri's IPC thread; a `connect` blocking it for twenty-five seconds would
//! stop the page reaching the shell at all — including the QUIT row.

use std::collections::VecDeque;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use adastrail_shell::capabilities::Capabilities;
use adastrail_shell::net::{
    self, NetRequest, CONNECT_TIMEOUT_MS, DEFAULT_MAX_PLAYERS, DEFAULT_SESSION_NAME,
    LISTEN_TIMEOUT_MS, REPLY_TIMEOUT_MS,
};
use adastrail_shell::net_invite::Invite;
use adastrail_shell::net_lobby::{row, worth_showing, LobbyAdvert, LobbyProvider, LobbyVisibility};
use adastrail_shell::output;
use adastrail_shell::runtime::Resources;
use adastrail_shell::session_host::ServerReply;
use adastrail_shell::snapshot::open_script;
use adastrail_shell::steam_pump::PumpState;
use serde_json::Value;
use tauri::AppHandle;

use crate::firewall;
use crate::p2p::P2pPump;
use crate::session::Sidecar;

/// What the bridge is holding right now.
#[derive(Default)]
struct Live {
    /// The session process, when there is one.
    sidecar: Option<Arc<Sidecar>>,
    /// The Steam relay's pump, when the Steam door is open.
    pump: Option<P2pPump>,
    /// The lobby's id, when one is published.
    lobby: Option<String>,
    /// What the running session was STARTED with.
    ///
    /// Held because the LOBBY row needs the level and the difficulty and
    /// `listen` is a separate request that does not carry them — asking the
    /// page to send the params twice is asking for the two copies to disagree.
    params: Option<Value>,
    /// How many seats the lobby advertises, from the `host` that opened it.
    max_players: u32,
}

/// The shell's whole multiplayer state.
pub struct NetBridge {
    app: AppHandle,
    capabilities: Capabilities,
    resources: Resources,
    lobbies: Option<Box<dyn LobbyProvider>>,
    live: Mutex<Live>,
    /// Control requests waiting on a reply, oldest first.
    pending: Mutex<VecDeque<Sender<ServerReply>>>,
    /// An invite read off a command line and waiting for a page to hand it to.
    ///
    /// It arrives before the window exists, so it is PARKED — and it is
    /// CONSUMED rather than remembered, because an invite left parked would
    /// re-join the same session every time the page reloaded, which looks like
    /// the game ignoring the player's attempts to leave.
    invite: Mutex<Option<Invite>>,
}

impl NetBridge {
    /// Build the bridge. Cheap: nothing is spawned until a session is asked for.
    pub fn new(
        app: AppHandle,
        capabilities: Capabilities,
        resources: Resources,
        lobbies: Option<Box<dyn LobbyProvider>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            app,
            capabilities,
            resources,
            lobbies,
            live: Mutex::new(Live::default()),
            pending: Mutex::new(VecDeque::new()),
            invite: Mutex::new(None),
        })
    }

    /// Park an invite from a launch argument or a second instance.
    pub fn park_invite(&self, invite: Invite) {
        if let Ok(mut slot) = self.invite.lock() {
            *slot = Some(invite);
        }
    }

    /// Hand the page whatever invite is parked, once.
    ///
    /// Down the NET bridge's own event channel rather than a new one: the
    /// page's half already exists and already knows how to reach the JOIN path,
    /// and a second channel for one message would be a second thing to keep in
    /// step.
    pub fn deliver_invite(&self) {
        let Ok(mut slot) = self.invite.lock() else {
            return;
        };
        let Some(invite) = slot.take() else {
            return;
        };
        drop(slot);
        let event = match &invite {
            Invite::Lobby(id) => net::invite_event(Some(id), None),
            Invite::Address(address) => net::invite_event(None, Some(address)),
        };
        self.emit(&event);
    }

    /// Route one message from the page.
    pub fn handle(self: &Arc<Self>, message: &Value) {
        let request = net::parse(message);
        let bridge = Arc::clone(self);
        match request.action.as_str() {
            "host" => spawn(move || bridge.host(&request)),
            "listen" => spawn(move || bridge.listen(&request)),
            "stop" => spawn(move || bridge.stop(&request)),
            "status" => spawn(move || bridge.status(&request)),
            "browse" => spawn(move || bridge.browse(&request)),
            "join" => spawn(move || bridge.join(&request)),
            "connect" => spawn(move || bridge.connect(&request)),
            "firewall" | "allow-firewall" => spawn(move || bridge.firewall(&request)),
            // An action this shell does not know is answered with nothing, and
            // the page's own timeout resolves it — exactly as the four stateless
            // bridges' `match` arms fall through.
            _ => {}
        }
    }

    /// Kill any running session.
    ///
    /// Called when the app goes away — a server outliving the only client it
    /// had is an orphan holding a level in memory.
    pub fn shutdown(&self) {
        self.close_doors();
        if let Ok(mut live) = self.live.lock() {
            if let Some(sidecar) = live.sidecar.take() {
                sidecar.stop();
            }
        }
        crate::steam::set_pump(PumpState::Idle);
    }

    // -----------------------------------------------------------------------
    // The actions
    // -----------------------------------------------------------------------

    fn host(self: &Arc<Self>, request: &NetRequest) {
        let id = request.request_id;
        let Some(control) = net::start_control(request, &self.capabilities) else {
            self.emit(&net::hosted_event(id, None, Some("bad-params")));
            return;
        };
        let sidecar = match self.ensure_sidecar() {
            Ok(sidecar) => sidecar,
            Err(reason) => {
                output::error(&format!("could not host a session: {reason}"));
                self.emit(&net::hosted_event(id, None, Some(&reason)));
                return;
            }
        };
        if let Ok(mut live) = self.live.lock() {
            live.params = request.passthrough("params");
            live.max_players = request
                .message
                .get("maxClients")
                .and_then(Value::as_u64)
                .unwrap_or(u64::from(DEFAULT_MAX_PLAYERS)) as u32;
        }
        // The page opens its own channel BEFORE the session is told to build,
        // exactly as Electron's port travels with the message that starts it:
        // the server tolerates either order, and arriving first is what makes
        // the first snapshot the first thing the client sees.
        self.open_snapshot(&sidecar);
        sidecar.send(&control);

        match self.await_reply(REPLY_TIMEOUT_MS) {
            Some(ServerReply::Started { level_id }) => {
                self.emit(&net::hosted_event(id, Some(&level_id), None));
            }
            Some(ServerReply::Error { detail }) => {
                self.emit(&net::hosted_event(id, None, Some(&detail)));
            }
            _ => self.emit(&net::hosted_event(id, None, Some("no-reply"))),
        }
    }

    fn listen(self: &Arc<Self>, request: &NetRequest) {
        let id = request.request_id;
        let Some(sidecar) = self.sidecar() else {
            self.emit(&net::listening_event(id, None, false, None));
            return;
        };
        if net::wants_steam(request, &self.capabilities) {
            if let Ok(mut live) = self.live.lock() {
                live.pump = P2pPump::start(Arc::clone(&sidecar));
            }
        }
        let steam_open = self.live.lock().is_ok_and(|live| live.pump.is_some());
        sidecar.send(&net::listen_control(
            request,
            &self.capabilities,
            steam_open,
        ));

        let reply = match self.await_reply(LISTEN_TIMEOUT_MS) {
            Some(ServerReply::Listening { detail }) => Some(detail),
            _ => None,
        };
        let lobby = if steam_open {
            self.open_lobby(request, reply.as_ref())
        } else {
            None
        };
        self.emit(&net::listening_event(
            id,
            reply.as_ref(),
            steam_open,
            lobby.as_deref(),
        ));
    }

    fn stop(self: &Arc<Self>, request: &NetRequest) {
        self.shutdown();
        if let Ok(mut live) = self.live.lock() {
            live.params = None;
        }
        self.emit(&net::stopped_event(request.request_id));
    }

    fn status(self: &Arc<Self>, request: &NetRequest) {
        let id = request.request_id;
        let Some(sidecar) = self.sidecar() else {
            self.emit(&net::idle_status_event(id));
            return;
        };
        sidecar.send(&net::plain_control("status"));
        let reply = match self.await_reply(REPLY_TIMEOUT_MS) {
            Some(ServerReply::Status(status)) => Some(status),
            _ => None,
        };
        // The lobby row is rewritten from the same poll that draws the HOST
        // screen, so what the browser shows and what the host sees can never be
        // two different numbers.
        if let (Some(status), Some(provider), Some(lobby)) =
            (reply.as_ref(), self.lobbies.as_deref(), self.lobby())
        {
            let players = status.get("clients").and_then(Value::as_u64).unwrap_or(0);
            let mut patch = std::collections::BTreeMap::new();
            patch.insert(
                adastrail_shell::net_lobby::keys::PLAYERS,
                players.to_string(),
            );
            provider.update(&lobby, &patch);
        }
        self.emit(&net::status_event(id, reply.as_ref()));
    }

    fn browse(self: &Arc<Self>, request: &NetRequest) {
        let Some(provider) = self.lobbies.as_deref() else {
            self.emit(&net::browse_event(request.request_id, Vec::new()));
            return;
        };
        crate::steam::set_pump(PumpState::Live);
        let rows: Vec<Value> = provider
            .browse()
            .into_iter()
            .map(|(id, data)| row(&id, &data))
            .filter(worth_showing)
            .collect();
        if !self.holding_a_session() {
            crate::steam::set_pump(PumpState::Idle);
        }
        self.emit(&net::browse_event(request.request_id, rows));
    }

    fn join(self: &Arc<Self>, request: &NetRequest) {
        let id = request.request_id;
        let Some(lobby_id) = request.text("lobbyId") else {
            self.emit(&net::joined_event(id, None, "no-lobby"));
            return;
        };
        let Some(provider) = self.lobbies.as_deref() else {
            self.emit(&net::joined_event(id, None, "no-session"));
            return;
        };
        crate::steam::set_pump(PumpState::Live);
        match provider.join(&lobby_id) {
            Some((host_id, data)) => {
                let found = row(&lobby_id, &data);
                self.emit(&net::joined_event(id, Some((&host_id, &found)), ""));
            }
            None => self.emit(&net::joined_event(id, None, "no-session")),
        }
    }

    fn connect(self: &Arc<Self>, request: &NetRequest) {
        let id = request.request_id;
        let sidecar = match self.ensure_sidecar() {
            Ok(sidecar) => sidecar,
            Err(reason) => {
                output::error(&format!("could not join a session: {reason}"));
                self.emit(&net::connected_event(id, false, Some(&reason), None));
                return;
            }
        };
        // The STEAM path needs the pump on this side for the reason the host
        // path does: the handshake is a global one this process owns, so a
        // relayed peer's packets come through here whichever end we are.
        if request.text("peer").is_some() {
            if let Ok(mut live) = self.live.lock() {
                live.pump = P2pPump::start(Arc::clone(&sidecar));
            }
        }
        self.open_snapshot(&sidecar);
        sidecar.send(&net::connect_control(request));

        match self.await_reply(CONNECT_TIMEOUT_MS) {
            Some(ServerReply::Connected { ok: true, .. }) => {
                self.emit(&net::connected_event(id, true, None, None));
            }
            Some(ServerReply::Connected { reason, detail, .. }) => {
                // A refused join leaves nothing worth keeping alive: the process
                // holds no session, and a second attempt starts a fresh one.
                self.shutdown();
                self.emit(&net::connected_event(
                    id,
                    false,
                    reason.as_deref(),
                    detail.as_deref(),
                ));
            }
            _ => {
                self.shutdown();
                self.emit(&net::connected_event(id, false, Some("no-reply"), None));
            }
        }
    }

    fn firewall(self: &Arc<Self>, request: &NetRequest) {
        let port = request.port().unwrap_or(0);
        let state = if request.action == "allow-firewall" {
            firewall::allow(port)
        } else {
            firewall::check(port)
        };
        self.emit(&net::firewall_event(request.request_id, state.to_json()));
    }

    // -----------------------------------------------------------------------
    // The plumbing
    // -----------------------------------------------------------------------

    /// The session process, starting one if there is none.
    fn ensure_sidecar(self: &Arc<Self>) -> Result<Arc<Sidecar>, String> {
        if let Some(running) = self.sidecar() {
            return Ok(running);
        }
        let weak: Weak<Self> = Arc::downgrade(self);
        let sidecar = Sidecar::start(&self.resources, move |reply| {
            if let Some(bridge) = weak.upgrade() {
                bridge.on_reply(reply);
            }
        })?;
        if let Ok(mut live) = self.live.lock() {
            live.sidecar = Some(Arc::clone(&sidecar));
        }
        // A session is up, so matchmaking and P2P call-results are now on the
        // callback queue — see `adastrail_shell::steam_pump`.
        crate::steam::set_pump(PumpState::Live);
        Ok(sidecar)
    }

    fn sidecar(&self) -> Option<Arc<Sidecar>> {
        self.live.lock().ok().and_then(|live| live.sidecar.clone())
    }

    fn lobby(&self) -> Option<String> {
        self.live.lock().ok().and_then(|live| live.lobby.clone())
    }

    fn holding_a_session(&self) -> bool {
        self.live.lock().is_ok_and(|live| live.sidecar.is_some())
    }

    /// Tell the page where to open the snapshot channel.
    fn open_snapshot(&self, sidecar: &Sidecar) {
        let Some(endpoint) = sidecar.snapshot() else {
            output::warn("the session server never reported a snapshot channel");
            return;
        };
        let Some(window) = tauri::Manager::get_webview_window(&self.app, "main") else {
            return;
        };
        let _ = window.eval(open_script(&endpoint.url()));
    }

    /// Publish the lobby that advertises this session.
    fn open_lobby(&self, request: &NetRequest, listening: Option<&Value>) -> Option<String> {
        let provider = self.lobbies.as_deref()?;
        let (params, max_players) = self
            .live
            .lock()
            .ok()
            .map(|live| (live.params.clone(), live.max_players))
            .unwrap_or((None, DEFAULT_MAX_PLAYERS));
        let params = request.passthrough("params").or(params);
        let at = |field: &str| {
            listening
                .and_then(|reply| reply.get(field))
                .and_then(Value::as_u64)
                .unwrap_or(0)
        };
        let bound = listening.and_then(|reply| reply.get("bound"));
        let advert = LobbyAdvert {
            name: request
                .text("name")
                .unwrap_or_else(|| DEFAULT_SESSION_NAME.to_string()),
            host: String::new(),
            level: net::read_string(params.as_ref(), "levelId"),
            difficulty: net::read_string(params.as_ref(), "difficulty"),
            players: 1,
            max_players: request
                .message
                .get("maxClients")
                .and_then(Value::as_u64)
                .map_or(max_players, |seats| seats as u32),
            // Both come from the SESSION, which is the only process that has
            // actually loaded the engine it is describing. A shell that filled
            // these in itself would be a second copy of two numbers the
            // handshake refuses a mismatch on.
            protocol: at("protocol") as u32,
            build: listening
                .and_then(|reply| reply.get("build"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            needs_password: request.text("password").is_some(),
            mods: request
                .message
                .get("mods")
                .and_then(Value::as_array)
                .map(|mods| {
                    mods.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            // THE PORT THE SOCKET ACTUALLY GOT, never the one that was asked
            // for. A lobby row advertising the requested port is the exact bug
            // that makes "direct connect doesn't work" unanswerable.
            address: bound.and_then(|bound| {
                let host = bound.get("address")?.as_str()?;
                let port = bound.get("port")?.as_u64()?;
                Some(net::format_address(host, port as u16))
            }),
        };
        let visibility = if request.off_by_default("publicListing") {
            LobbyVisibility::Public
        } else {
            LobbyVisibility::FriendsOnly
        };
        let id = provider.host(&advert, visibility)?;
        if let Ok(mut live) = self.live.lock() {
            live.lobby = Some(id.clone());
        }
        Some(id)
    }

    /// Give up the Steam half. The UDP socket lives in the session process and
    /// dies with it; this is everything this shell was holding.
    fn close_doors(&self) {
        let lobby = if let Ok(mut live) = self.live.lock() {
            live.pump = None;
            live.lobby.take()
        } else {
            None
        };
        if let (Some(provider), Some(lobby)) = (self.lobbies.as_deref(), lobby) {
            provider.close(&lobby);
        }
    }

    /// One reply from the session, routed.
    fn on_reply(&self, reply: ServerReply) {
        if reply.unsolicited() {
            self.unsolicited(&reply);
            return;
        }
        let Ok(mut queue) = self.pending.lock() else {
            return;
        };
        // A waiter whose receiver has gone (its own timeout fired) is SKIPPED
        // rather than counted, because counting it would shift every later
        // reply by one — which is the whole failure this ordered queue exists
        // to avoid.
        while let Some(waiter) = queue.pop_front() {
            if waiter.send(reply.clone()).is_ok() {
                return;
            }
        }
    }

    fn unsolicited(&self, reply: &ServerReply) {
        match reply {
            ServerReply::Ready { protocol, .. } => {
                output::info(&format!("session server ready (protocol {protocol})"));
            }
            ServerReply::Log { line } => output::info(line),
            ServerReply::Invite => {
                if let (Some(provider), Some(lobby)) = (self.lobbies.as_deref(), self.lobby()) {
                    provider.invite(&lobby);
                }
            }
            ServerReply::PeerSend { to, data, reliable } => {
                P2pPump::send(to, data, *reliable);
            }
            _ => {}
        }
    }

    /// Wait for the session's next solicited reply.
    fn await_reply(&self, timeout_ms: u64) -> Option<ServerReply> {
        let (sender, replies) = mpsc::channel();
        self.pending.lock().ok()?.push_back(sender);
        replies.recv_timeout(Duration::from_millis(timeout_ms)).ok()
    }

    /// THE RETURN PATH — the page's own `window.__gisNetEvent(...)`, called
    /// from outside, exactly as every other bridge on every other shell.
    fn emit(&self, event: &Value) {
        crate::emit_event(&self.app, "net", event);
    }
}

/// Run one request off the IPC thread.
fn spawn(work: impl FnOnce() + Send + 'static) {
    if std::thread::Builder::new()
        .name("net-request".to_string())
        .spawn(work)
        .is_err()
    {
        output::warn("net: could not start a worker for this request");
    }
}
