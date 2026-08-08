// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! SCREENSHOTS — the bytes the page hands the shell, the name they are written
//! under, and the platform library that gets a copy.
//!
//! This is the one bridge where the page's payload becomes a FILE, so the tests
//! that matter are the ones about not trusting it: base64 that is not a picture,
//! a name that tries to leave the folder, and a disk that says no.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use adastrail_shell::screenshots::{
    decode_png, handle, parse, png_dimensions, safe_name, ShotSink, ShotsOptions,
};
use adastrail_shell::screenshots_provider::ScreenshotLibrary;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};

/// A 1×1 PNG's first 24 bytes, which is everything this shell reads: the
/// signature, the IHDR length and tag, and the two dimensions.
fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    bytes.extend_from_slice(&13u32.to_be_bytes());
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
    bytes
}

#[derive(Default)]
struct Disk {
    refuses: bool,
    written: Mutex<Vec<PathBuf>>,
    shared: Mutex<Vec<PathBuf>>,
}

impl ShotSink for Disk {
    fn write(&self, path: &Path, _png: &[u8]) -> bool {
        if self.refuses {
            return false;
        }
        self.written
            .lock()
            .expect("a fake's own lock")
            .push(path.to_path_buf());
        true
    }
    fn share(&self, path: &Path, _png: &[u8]) -> bool {
        self.shared
            .lock()
            .expect("a fake's own lock")
            .push(path.to_path_buf());
        true
    }
}

impl Disk {
    fn written(&self) -> Vec<PathBuf> {
        self.written.lock().expect("a fake's own lock").clone()
    }
}

#[derive(Default)]
struct Library {
    added: Mutex<Vec<(PathBuf, u32, u32)>>,
}

impl ScreenshotLibrary for Library {
    fn id(&self) -> &'static str {
        "steam"
    }
    fn add(&self, path: &Path, width: u32, height: u32) -> bool {
        self.added
            .lock()
            .expect("a fake's own lock")
            .push((path.to_path_buf(), width, height));
        true
    }
}

impl Library {
    fn added(&self) -> Vec<(PathBuf, u32, u32)> {
        self.added.lock().expect("a fake's own lock").clone()
    }
}

fn options() -> ShotsOptions {
    ShotsOptions {
        folder: PathBuf::from("/home/ada/Pictures/adastrail-tauri"),
        steam_overlay: false,
        stamp: 1_700_000_000,
    }
}

fn answer(
    message: Value,
    sink: &dyn ShotSink,
    library: Option<&dyn ScreenshotLibrary>,
) -> Option<Value> {
    handle(&parse(&message), &options(), sink, library)
}

#[test]
fn the_hello_is_answered_with_silence() {
    // Nothing to set up — the folder is made on the first write.
    assert_eq!(
        answer(json!({ "action": "init" }), &Disk::default(), None),
        None
    );
}

#[test]
fn status_tells_the_gallery_where_pictures_go() {
    let status = answer(
        json!({ "action": "status", "requestId": 1 }),
        &Disk::default(),
        None,
    )
    .expect("ev");
    assert_eq!(status["available"], json!(true));
    assert_eq!(status["canShare"], json!(true));
    // The PLATFORM, not the library — the page's union is `steam | ios |
    // android`, and it is the same platform whichever binary is showing it.
    assert_eq!(status["provider"], json!("steam"));
    assert!(status["folder"]
        .as_str()
        .expect("a folder")
        .ends_with("adastrail-tauri"));
    // ALWAYS false on this shell, INCLUDING where the overlay works: Steam's
    // key photographs the swap chain it hooked, which here is the decoy's empty
    // one. So Steam is NOT filing a copy of the game and the gallery must not
    // tell the player it is.
    assert_eq!(status["steamOverlay"], json!(false));
}

#[test]
fn the_status_line_names_the_platform_whether_or_not_a_library_answered() {
    // A value invented here (the library's own id, say) would be a protocol
    // redesigned for this shell — the one thing the migration may not do.
    let library = Library::default();
    for library in [None, Some(&library as &dyn ScreenshotLibrary)] {
        let status = answer(
            json!({ "action": "status", "requestId": 1 }),
            &Disk::default(),
            library,
        )
        .expect("an event");
        assert_eq!(status["provider"], json!("steam"));
    }
}

#[test]
fn a_picture_lands_in_the_folder_and_in_the_platform_library() {
    let disk = Disk::default();
    let library = Library::default();
    let event = answer(
        json!({
            "action": "file",
            "requestId": 4,
            "name": "adas-trail-2026-08-08.png",
            "png": STANDARD.encode(png(844, 390)),
        }),
        &disk,
        Some(&library),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true));
    assert!(event["path"]
        .as_str()
        .expect("a path")
        .ends_with("adastrail-tauri/adas-trail-2026-08-08.png"));
    assert_eq!(disk.written().len(), 1);
    // BY PATH and with the real dimensions — Steam is handed the same file the
    // player got rather than a second copy of the bytes.
    assert_eq!(
        library.added(),
        vec![(
            PathBuf::from("/home/ada/Pictures/adastrail-tauri/adas-trail-2026-08-08.png"),
            844,
            390,
        )]
    );
}

#[test]
fn anything_that_is_not_a_png_is_refused_before_it_becomes_a_file() {
    for payload in [
        json!({ "action": "file", "requestId": 1 }),
        json!({ "action": "file", "requestId": 1, "png": "" }),
        json!({ "action": "file", "requestId": 1, "png": "not base64 !!" }),
        json!({ "action": "file", "requestId": 1, "png": STANDARD.encode(b"GIF89a-nope") }),
        json!({ "action": "file", "requestId": 1, "png": STANDARD.encode([0x89, b'P']) }),
    ] {
        let disk = Disk::default();
        let event = answer(payload.clone(), &disk, None).expect("an event");
        assert_eq!(event["ok"], json!(false), "{payload}");
        assert!(disk.written().is_empty(), "{payload} must not be written");
    }
}

#[test]
fn a_disk_that_says_no_is_an_ok_false_rather_than_a_crash() {
    let disk = Disk {
        refuses: true,
        ..Disk::default()
    };
    let library = Library::default();
    let event = answer(
        json!({ "action": "file", "requestId": 1, "name": "a.png", "png": STANDARD.encode(png(2, 2)) }),
        &disk,
        Some(&library),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(false));
    assert!(
        library.added().is_empty(),
        "and nothing is filed that was never written"
    );
}

#[test]
fn a_share_writes_the_file_first_and_then_sends_it() {
    let disk = Disk::default();
    let event = answer(
        json!({
            "action": "share",
            "requestId": 2,
            "name": "shot.png",
            "png": STANDARD.encode(png(4, 4)),
        }),
        &disk,
        None,
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true));
    assert_eq!(disk.written().len(), 1);
    assert_eq!(
        disk.shared.lock().expect("a fake's own lock").len(),
        1,
        "the clipboard and the file manager both get the written file"
    );
}

#[test]
fn a_name_cannot_leave_the_screenshots_folder() {
    // The game builds these itself and they are already tame; this is the belt
    // on the braces, because a name from the page joins a path here.
    for hostile in [
        "../../.bashrc",
        "..\\..\\windows\\system32\\x",
        "/etc/passwd",
        "C:\\Windows\\evil.png",
    ] {
        let cleaned = safe_name(Some(hostile), 7);
        assert!(!cleaned.contains('/'), "{hostile}");
        assert!(!cleaned.contains('\\'), "{hostile}");
        assert!(!cleaned.contains(':'), "{hostile}");
        assert!(
            Path::new(&cleaned).components().count() == 1,
            "{hostile} → {cleaned} must be one path component"
        );
    }
}

#[test]
fn a_name_that_starts_with_nothing_usable_is_replaced_rather_than_repaired() {
    // A leading dash presents itself to things as an option, and a name that is
    // now entirely dashes is not a name anybody chose.
    assert_eq!(safe_name(Some("../x"), 7), "screenshot-7.png");
    assert_eq!(safe_name(Some(""), 7), "screenshot-7.png");
    assert_eq!(safe_name(None, 7), "screenshot-7.png");
    assert_eq!(safe_name(Some(".hidden"), 7), "screenshot-7.png");
    assert_eq!(safe_name(Some("shot_01.png"), 7), "shot_01.png");
}

#[test]
fn a_name_is_bounded_so_it_survives_the_filesystem_it_lands_on() {
    let long = safe_name(Some(&"a".repeat(500)), 7);
    assert_eq!(long.len(), 120);
}

#[test]
fn a_pngs_size_is_read_off_its_header_rather_than_decoded() {
    assert_eq!(png_dimensions(&png(1920, 1080)), Some((1920, 1080)));
    assert_eq!(png_dimensions(&png(0, 10)), None, "not a picture");
    assert_eq!(png_dimensions(b"too short"), None);
    let mut wrong = png(4, 4);
    wrong[12..16].copy_from_slice(b"IDAT");
    assert_eq!(png_dimensions(&wrong), None, "IHDR comes first or nothing");
}

#[test]
fn decoding_is_the_one_gate_and_it_checks_the_magic_number() {
    assert!(decode_png(Some(&STANDARD.encode(png(2, 2)))).is_some());
    assert!(decode_png(Some(&STANDARD.encode(b"MZ\x90\x00 an executable"))).is_none());
    assert!(decode_png(None).is_none());
}
