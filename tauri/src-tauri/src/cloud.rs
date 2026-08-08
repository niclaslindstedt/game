// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! CLOUD SAVE on Steam — the [`CloudProvider`] implementation, and the peer of
//! `electron/src/cloud-steam.ts`.
//!
//! Steam Cloud is a FILE store (ISteamRemoteStorage) where iCloud is a key-value
//! store, so the mapping is: our one save key becomes one file name. Everything
//! else lines up exactly, which is the whole point of the seam — the payload, the
//! merge, and the per-device coin ledger on the web side never learn that this
//! platform is different.
//!
//! Two Steam-specific facts shape this file, and both are the same two the
//! Electron peer records:
//!
//!  1. **Cloud can be off two different ways.** Steam lets the PLAYER disable
//!     cloud sync per game, and lets the DEVELOPER not enable it for the app at
//!     all. Either one means writes go nowhere useful, so `is_available` demands
//!     both — reporting available when the app has it switched off would leave
//!     the game showing a green CLOUD SAVE row that silently loses every write.
//!  2. **A read failure and an empty cloud must not be confused.** The
//!     existence check comes first and a failure after that is a genuine one.
//!     [`CloudRead`] is what keeps the two apart; see its own seam for what
//!     collapsing them would cost.
//!
//! Steam Cloud's per-file ceiling is set per app in the partner site (100 MB by
//! default), i.e. it is not a hard API constant the way iCloud's 1 MB per key
//! is. [`MAX_BYTES`] is therefore a self-imposed sanity bound rather than a
//! platform one; it is far above any plausible roster and exists so a runaway
//! payload is refused here rather than silently eating the app's quota.

use std::io::{Read, Write};

use adastrail_shell::cloud_provider::{CloudPlayer, CloudProvider, CloudRead};
use adastrail_shell::output;

use crate::steam::{steam_client, steam_player_id, steam_player_name};

/// Our self-imposed payload ceiling — see the module header.
const MAX_BYTES: usize = 4 * 1024 * 1024;

/// Steam Cloud, as the bridge above it sees it.
pub struct SteamCloud;

impl CloudProvider for SteamCloud {
    fn id(&self) -> &'static str {
        "steam-cloud"
    }

    fn is_available(&self) -> bool {
        let Some(client) = steam_client() else {
            return false;
        };
        let storage = client.remote_storage();
        // BOTH switches, for the reason in the header: the player's per-game
        // toggle AND the app's own cloud setting.
        storage.is_cloud_enabled_for_account() && storage.is_cloud_enabled_for_app()
    }

    fn identify(&self) -> Option<CloudPlayer> {
        Some(CloudPlayer {
            id: steam_player_id()?,
            name: steam_player_name().unwrap_or_default(),
        })
    }

    fn load(&self, key: &str) -> CloudRead {
        let Some(client) = steam_client() else {
            return CloudRead::Failed;
        };
        let storage = client.remote_storage();
        let file = storage.file(key);
        // Existence FIRST — see the header. A read of a file that was never
        // written would otherwise be indistinguishable from a real failure.
        if !file.exists() {
            return CloudRead::Missing;
        }
        let mut blob = Vec::new();
        if let Err(err) = file.read().read_to_end(&mut blob) {
            output::warn(&format!("steam cloud: read failed — {err}"));
            return CloudRead::Failed;
        }
        match String::from_utf8(blob) {
            Ok(text) => CloudRead::Blob(text),
            Err(_) => {
                // The save is our own JSON, so this is a corrupted or
                // half-written file rather than a format question. FAILED
                // rather than MISSING: the game must not answer it by pushing a
                // fresh roster over whatever is really up there.
                output::warn(
                    "steam cloud: the stored save is not text — treating it as a failed read",
                );
                CloudRead::Failed
            }
        }
    }

    fn save(&self, key: &str, data: &str) -> bool {
        let Some(client) = steam_client() else {
            return false;
        };
        let storage = client.remote_storage();
        let mut writer = storage.file(key).write();
        if let Err(err) = writer.write_all(data.as_bytes()) {
            output::warn(&format!("steam cloud: write failed — {err}"));
            return false;
        }
        // The stream is committed when the writer is dropped, so it is dropped
        // HERE rather than at the end of the function — a `true` returned while
        // the handle is still open would be a success reported before the write
        // had happened.
        drop(writer);
        true
    }

    fn max_bytes(&self) -> usize {
        MAX_BYTES
    }
}

/// The cloud provider for this shell, or `None` where there is none.
///
/// `None` is a normal state, not an error: a build run outside Steam (or with
/// `GIS_STEAM=off`) reports cloud save unavailable and keeps playing
/// device-locally.
pub fn cloud_provider() -> Option<Box<dyn CloudProvider>> {
    steam_client().map(|_| Box::new(SteamCloud) as Box<dyn CloudProvider>)
}
