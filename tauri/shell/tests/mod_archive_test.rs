// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! A MOD IN A .ZIP — every refusal, because this is the one file in the tree
//! that is pointed at something a stranger made.
//!
//! The archives are built here rather than committed as fixtures: a hostile zip
//! is easier to read as the six lines that make it hostile than as a binary
//! blob somebody has to trust, and the writer below is deliberately dumber than
//! the reader — it will happily produce the malformed shapes the reader exists
//! to refuse.

use adastrail_shell::mod_archive::{mod_entries, mod_root, read_zip};

/// A minimal, deliberately naive zip writer: stored entries only, no zip64, no
/// data descriptors. Enough to build every case the reader has an opinion on.
fn zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in entries {
        let offset = out.len() as u32;
        let crc = crc32(data);
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        out.extend_from_slice(&[20, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // version..time
        out.extend_from_slice(&crc.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(name.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(data);

        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&[20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(name.as_bytes());
    }
    let central_at = out.len() as u32;
    let count = entries.len() as u16;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&central_at.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn refusal(bytes: &[u8]) -> String {
    read_zip(bytes)
        .expect_err("this archive must be refused")
        .to_string()
}

#[test]
fn a_plain_mod_zip_reads_back_the_files_that_went_in() {
    let archive = zip(&[
        ("mod.yaml", b"id: greenhouse\n"),
        ("items/spade.yaml", b"name: SPADE\n"),
    ]);
    let entries = read_zip(&archive).expect("a mod");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].name, "mod.yaml");
    assert_eq!(entries[0].data, b"id: greenhouse\n");
    assert_eq!(entries[1].name, "items/spade.yaml");
}

#[test]
fn a_directory_entry_is_dropped_rather_than_stored() {
    // The paths of the FILES are what say which directories exist; a zip that
    // names a directory it stores nothing in has told us nothing we need.
    let archive = zip(&[("items/", b""), ("mod.yaml", b"id: x\n")]);
    let entries = read_zip(&archive).expect("a mod");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "mod.yaml");
}

#[test]
fn nothing_may_be_written_outside_the_mod() {
    // Refused by NAME and before any write: the check that runs after a path
    // has been joined is the check that has already lost, and a name is the
    // same on every OS while a resolved path is not.
    for (name, why) in [
        ("../outside.yaml", "climbs out"),
        ("mods/../../outside.yaml", "climbs out"),
        ("/etc/passwd", "absolute"),
        ("C:\\windows\\system32\\x", "backslash"),
        ("nested\\path.yaml", "backslash"),
        ("./mod.yaml", "climbs out"),
    ] {
        let message = refusal(&zip(&[(name, b"x")]));
        assert!(message.contains(name), "{name}: {message}");
        assert!(!why.is_empty());
    }
    // A control character in a path is neither a mistake nor a filename.
    assert!(refusal(&zip(&[("bell\u{7}.yaml", b"x")])).contains("control character"));
}

#[test]
fn a_drive_letter_is_refused_and_a_two_letter_name_is_not() {
    assert!(refusal(&zip(&[("D:data.yaml", b"x")])).contains("names a drive"));
    // The check is "letter then colon", so an ordinary short name survives it.
    let ok = read_zip(&zip(&[("ab.yaml", b"x")])).expect("an ordinary file");
    assert_eq!(ok[0].name, "ab.yaml");
}

#[test]
fn a_file_that_is_not_a_zip_says_so_rather_than_reading_rubbish() {
    assert!(refusal(b"not a zip at all").contains("not a zip"));
    assert!(refusal(b"").contains("not a zip"));
    // A truncated archive: the EOCD points at a central directory that is gone.
    let mut archive = zip(&[("mod.yaml", b"id: x\n")]);
    let end = archive.len();
    archive[end - 6..end - 2].copy_from_slice(&0xffff_0000u32.to_le_bytes());
    assert!(!refusal(&archive).is_empty());
}

#[test]
fn a_mod_zipped_the_obvious_way_is_still_a_mod() {
    // Right-click → compress puts everything under one top-level directory, so
    // the manifest is at `my-mod/mod.yaml`. Both shapes are what people send.
    let nested = zip(&[
        ("greenhouse/mod.yaml", b"id: greenhouse\n"),
        ("greenhouse/items/spade.yaml", b"name: SPADE\n"),
    ]);
    let entries = read_zip(&nested).expect("a mod");
    assert_eq!(mod_root(&entries).expect("a root"), "greenhouse/");
    let rooted = mod_entries(entries).expect("rooted");
    assert_eq!(rooted[0].name, "mod.yaml");
    assert_eq!(rooted[1].name, "items/spade.yaml");

    // …and a flat one needs no rerooting at all.
    let flat = read_zip(&zip(&[("mod.yaml", b"id: x\n")])).expect("a mod");
    assert_eq!(mod_root(&flat).expect("a root"), "");
    assert_eq!(mod_entries(flat).expect("rooted")[0].name, "mod.yaml");
}

#[test]
fn an_archive_with_no_mod_or_with_two_is_refused_rather_than_guessed_at() {
    let none = read_zip(&zip(&[("readme.txt", b"hello")])).expect("a zip");
    assert!(mod_root(&none)
        .unwrap_err()
        .to_string()
        .contains("no mod.yaml"));

    let two = read_zip(&zip(&[
        ("a/mod.yaml", b"id: a\n"),
        ("b/mod.yaml", b"id: b\n"),
    ]))
    .expect("a zip");
    let message = mod_root(&two).unwrap_err().to_string();
    assert!(message.contains("2 mods"));
    assert!(message.contains("one mod at a time"));
}

#[test]
fn a_lying_size_is_a_refusal_rather_than_a_silent_truncation() {
    // The central directory is the record that is always complete, so it is
    // what every size comes from — and an entry whose bytes do not match what
    // it declared is not an entry.
    let mut archive = zip(&[("mod.yaml", b"id: greenhouse\n")]);
    // Rewrite the CENTRAL directory's uncompressed size to something smaller.
    let at = archive
        .windows(4)
        .position(|window| window == 0x0201_4b50u32.to_le_bytes())
        .expect("a central record");
    archive[at + 24..at + 28].copy_from_slice(&3u32.to_le_bytes());
    assert!(refusal(&archive).contains("does not match its declared size"));
}

#[test]
fn an_unsupported_compression_method_is_named_rather_than_attempted() {
    let mut archive = zip(&[("mod.yaml", b"id: x\n")]);
    // Method 14 is LZMA — legal in a zip, and not something a mod is.
    let at = archive
        .windows(4)
        .position(|window| window == 0x0201_4b50u32.to_le_bytes())
        .expect("a central record");
    archive[at + 10..at + 12].copy_from_slice(&14u16.to_le_bytes());
    assert!(refusal(&archive).contains("unsupported compression method"));
}

#[test]
fn a_name_that_is_not_text_is_refused_rather_than_replaced() {
    // A lossy name is a name that no longer matches what the manifest declares.
    let mut archive = zip(&[("mod.yaml", b"id: x\n")]);
    let at = archive
        .windows(4)
        .position(|window| window == 0x0201_4b50u32.to_le_bytes())
        .expect("a central record");
    // The name sits right after the 46-byte central header.
    archive[at + 46] = 0xff;
    assert!(refusal(&archive).contains("not text"));
}
