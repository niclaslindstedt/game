// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHAT THIS COPY OF THE APP MAY DO — the peer of `electron/src/capabilities.ts`,
//! with the same five capabilities, the same command line and the same refusals.
//!
//! Five of the shell's capabilities are decided when the binary is BUILT rather
//! than when it runs, because they are not the same product everywhere: a depot
//! build is sold with them, a plain download is not. A build with none of them
//! stamped — a checkout, `npm run tauri`, anything built without the switches —
//! starts with NONE of them, exactly as a plain download does. That is
//! deliberate: a tree somebody cloned behaves like the thing they would have
//! downloaded, so "it works here" and "it works for a player" mean the same
//! thing.
//!
//! **The stamp is stronger here than on the Electron shell, and that is the one
//! difference worth knowing.** Electron reads the set out of the packaged
//! `package.json`, which is a JSON file inside an installed copy; this crate is
//! handed a [`BuildStamp`] the binary read from `option_env!` — the packager's
//! environment, baked in at COMPILE time. So an installed copy has nothing to
//! edit at all, rather than a file somebody would have to know not to edit.
//!
//! Three of the five can be turned on for a single launch by command line —
//! `--multiplayer`, `--mods` and `--voice` — and `portMap` deliberately cannot:
//! a port mapping is a change this program makes to somebody's ROUTER, so it is
//! a property of the build and of nothing else.

/// The capabilities a build is stamped with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BuildCapabilities {
    /// Sessions, the server browser, the direct door.
    pub multiplayer: bool,
    /// The Workshop and the local mod folder.
    pub mods: bool,
    /// May ask the router to forward the bound port.
    pub port_map: bool,
    /// VOICE CHAT in a session — the microphone, and other players' voices.
    ///
    /// Separate from `multiplayer` rather than folded into it, and the split is
    /// the same one `licensed` makes: a build can honestly host sessions
    /// without carrying voice, and that build should host a perfectly good
    /// silent game rather than a broken noisy one. It is its own capability
    /// because it opens a microphone, because the host relays every speaker to
    /// every listener, and because voice in a game shipped to a store is a
    /// thing the store asks about.
    pub voice: bool,
    /// Whether this copy holds the multiplayer licence.
    ///
    /// SEPARATE from `multiplayer`, and the split is the whole point: one is
    /// whether the feature is here at all, the other is whether a session it
    /// hosts may admit anybody. A build can honestly have the first without the
    /// second — that is what a download someone turned on with `--multiplayer`
    /// is — and it then hosts a session nobody may join, which is the correct
    /// answer rather than a broken one.
    pub licensed: bool,
}

/// Everything on — what a depot build is stamped with.
pub const ALL_CAPABILITIES: BuildCapabilities = BuildCapabilities {
    multiplayer: true,
    mods: true,
    port_map: true,
    voice: true,
    licensed: true,
};

/// Nothing on. What an unstamped build is, and what a download is.
pub const NO_CAPABILITIES: BuildCapabilities = BuildCapabilities {
    multiplayer: false,
    mods: false,
    port_map: false,
    voice: false,
    licensed: false,
};

/// The raw stamp, exactly as the packager's environment spelled it.
///
/// Passed in rather than read here so the whole of this module stays testable
/// without building a binary: the app crate fills it from `option_env!`, a test
/// fills it from a literal, and neither can tell the difference.
#[derive(Debug, Clone, Copy, Default)]
pub struct BuildStamp<'a> {
    /// `GIS_STAMP_CAPABILITIES` — whether anything packaged this binary at all.
    pub stamped: Option<&'a str>,
    /// `GIS_ENABLE_MULTIPLAYER`.
    pub multiplayer: Option<&'a str>,
    /// `GIS_ENABLE_MODS`.
    pub mods: Option<&'a str>,
    /// `GIS_ENABLE_UPNP`.
    pub port_map: Option<&'a str>,
    /// `GIS_ENABLE_VOICE`.
    pub voice: Option<&'a str>,
    /// `GIS_ENABLE_LICENSED`.
    pub licensed: Option<&'a str>,
}

/// Is this switch on? Only an explicit `1` (or `true`, since a packager typing
/// one and meaning the other should not silently ship the narrow build).
fn on(value: Option<&str>) -> bool {
    matches!(value, Some("1") | Some("true"))
}

/// The stamp, read into the set it grants.
///
/// NO stamp means nothing is on: a build only carries what something
/// deliberately gave it, so the narrow case is the one that happens by default
/// and the wide one has to be asked for. Within a stamp an absent switch reads
/// the same way.
pub fn read_build_capabilities(stamp: &BuildStamp) -> BuildCapabilities {
    if !is_stamped(stamp) {
        return NO_CAPABILITIES;
    }
    BuildCapabilities {
        multiplayer: on(stamp.multiplayer),
        mods: on(stamp.mods),
        port_map: on(stamp.port_map),
        voice: on(stamp.voice),
        licensed: on(stamp.licensed),
    }
}

/// Whether this binary was stamped at all.
///
/// An unstamped build is a DEVELOPER BUILD by definition: nothing packaged it
/// for a store or for distribution, so it is somebody's own tree. It is a
/// separate question from what the build MAY do, and it is what the startup
/// notice is keyed on.
pub fn is_stamped(stamp: &BuildStamp) -> bool {
    on(stamp.stamped)
}

/// What this LAUNCH may do: the stamped set, plus anything the command line
/// turned on, plus the door that came with it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Capabilities {
    /// The stamped set, widened by the command line.
    pub built: BuildCapabilities,
    /// True when the command line — rather than the build — is what turned
    /// multiplayer, mods or voice on. The launch says so out loud when it is.
    pub unlocked: bool,
    /// The direct door — set only by `--port`, never by a stamp. A stamped
    /// build takes its door from the HOST screen instead.
    pub direct: bool,
    /// The port the direct door was pinned to.
    pub port: Option<u16>,
}

impl Capabilities {
    /// Sessions, the server browser, the direct door.
    pub fn multiplayer(&self) -> bool {
        self.built.multiplayer
    }
    /// The Workshop and the local mod folder.
    pub fn mods(&self) -> bool {
        self.built.mods
    }
    /// Voice chat inside a session.
    pub fn voice(&self) -> bool {
        self.built.voice
    }
    /// Whether a session this copy hosts may admit anybody.
    pub fn licensed(&self) -> bool {
        self.built.licensed
    }
    /// Whether this copy may ask the router to forward its port.
    pub fn port_map(&self) -> bool {
        self.built.port_map
    }
}

/// `--flag=value` and `--flag value`, for the one option that takes one.
fn value_of<'a>(argv: &'a [String], name: &str) -> Option<&'a str> {
    let long = format!("--{name}");
    let eq = format!("--{name}=");
    for (i, arg) in argv.iter().enumerate() {
        if arg == &long {
            return argv.get(i + 1).map(String::as_str);
        }
        if let Some(rest) = arg.strip_prefix(&eq) {
            return Some(rest);
        }
    }
    None
}

fn has(argv: &[String], name: &str) -> bool {
    let long = format!("--{name}");
    let eq = format!("--{name}=");
    argv.iter().any(|arg| arg == &long || arg.starts_with(&eq))
}

/// What this launch may do, and everything it refused along the way.
///
/// `--multiplayer` and `--mods` each stand alone. `--port` is a REFINEMENT
/// rather than a requirement: hosting from the menu has a port on the HOST
/// screen already, so naming one here only pins the direct door to it.
///
/// `--voice` is the one switch that DOES depend on another, and it is refused
/// rather than silently ignored when it stands alone: voice travels inside a
/// session, so on a build that cannot host or join one there is nothing for a
/// microphone to talk into. Turning it on there would grant the media
/// permission, put a VOICE CHAT page in the settings, and then never carry a
/// syllable — which reads as a broken feature rather than as an absent one.
///
/// `--licensed` is a DECLARATION rather than an unlock: the person starting the
/// game saying they hold the multiplayer licence. Nothing here can check that
/// and nothing pretends to.
pub fn resolve_capabilities(
    built: BuildCapabilities,
    argv: &[String],
) -> (Capabilities, Vec<String>) {
    let mut refusals = Vec::new();

    let multiplayer = built.multiplayer || has(argv, "multiplayer");
    let mods = built.mods || has(argv, "mods");

    // VOICE NEEDS A SESSION TO TRAVEL IN — see the doc comment. The refusal
    // names the pairing rather than the flag, because "--voice does nothing"
    // would leave somebody adding it a second time and louder.
    let voice_asked = built.voice || has(argv, "voice");
    let voice = voice_asked && multiplayer;
    if voice_asked && !multiplayer {
        refusals.push("--voice does nothing without --multiplayer".to_string());
    }

    let licensed = built.licensed || has(argv, "licensed");

    let port_text = value_of(argv, "port");
    let port = port_text.and_then(|text| text.parse::<u32>().ok());
    // A port is 1..=65535: zero means "any free port", which is a server nobody
    // can be told to connect to.
    let port_ok = port.is_some_and(|port| port > 0 && port <= 65_535);

    let mut direct = false;
    let mut open_port = None;
    match port_text {
        Some(text) if !multiplayer => {
            let _ = text;
            refusals.push("--port does nothing without --multiplayer".to_string());
        }
        Some(text) if !port_ok => {
            refusals.push(format!("--port {text} is not a port number"));
        }
        Some(_) => {
            direct = true;
            open_port = port.map(|port| port as u16);
        }
        None => {}
    }

    let capabilities = Capabilities {
        built: BuildCapabilities {
            multiplayer,
            mods,
            port_map: built.port_map,
            voice,
            licensed,
        },
        unlocked: (multiplayer && !built.multiplayer)
            || (mods && !built.mods)
            || (voice && !built.voice),
        direct,
        port: open_port,
    };
    (capabilities, refusals)
}

/// The list the page is handed, so the menus offer only what this launch can
/// honour.
///
/// Kept to plain names — the page has no business knowing WHY it may host, only
/// whether it may. It reaches the page in the window's initialization script
/// rather than over the shell channel, because the menus have to know before
/// they are first drawn: a row that appears and then vanishes a round trip
/// later is worse than one that was never offered.
pub fn capability_list(capabilities: &Capabilities) -> Vec<&'static str> {
    let mut list = Vec::new();
    if capabilities.multiplayer() {
        list.push("multiplayer");
    }
    if capabilities.mods() {
        list.push("mods");
    }
    if capabilities.voice() {
        list.push("voice");
    }
    list
}
