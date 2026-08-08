// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! STEAM UGC — the seam's third file, and the only one in the mods feature that
//! knows Steam exists. The effects half of [`adastrail_shell::workshop`], and
//! the peer of `electron/src/workshop.ts`.
//!
//! Two directions, asymmetric on purpose: a SUBSCRIPTION is downloaded and
//! unpacked by Steam and we only ask where it went, while a PUBLISH hands Steam
//! the AUTHORED folder so a mod on the Workshop stays readable, forkable and
//! diffable the way the game's own content is.
//!
//! Everything degrades to "no Workshop" without Steam: the provider is `None`
//! on a developer machine, in CI, and on a build launched outside the client. A
//! game with no mods is the game.

use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use adastrail_shell::output;
use adastrail_shell::workshop::{
    disposition, ItemDisposition, PublishAnswer, PublishRequest, WorkshopItem, WorkshopProvider,
};
use steamworks::{FileType, PublishedFileId};

use crate::steam::{steam_app_id, steam_client};

/// How long an upload may take.
///
/// Ten minutes, which is the page's own publish timeout: what is being sent is
/// a folder of YAML and a thumbnail over Steam's own transfer, and the one
/// thing worse than a slow publish is one that reports failure while the upload
/// is still running and the item is half-written.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// The Workshop provider, or `None` when there is no Steam here.
pub fn workshop_provider() -> Option<Box<dyn WorkshopProvider>> {
    steam_client().map(|_| Box::new(SteamWorkshop) as Box<dyn WorkshopProvider>)
}

struct SteamWorkshop;

impl WorkshopProvider for SteamWorkshop {
    fn subscribed(&self) -> Vec<WorkshopItem> {
        let Some(client) = steam_client() else {
            return Vec::new();
        };
        let ugc = client.ugc();
        let mut items = Vec::new();
        for id in ugc.subscribed_items(false) {
            match disposition(ugc.item_state(id).bits()) {
                ItemDisposition::Downloading => {
                    // Kick it along and leave it out of this pass; the next
                    // launch (or the next refresh) sees it. A subscription
                    // mid-download is not a failure and not a mod.
                    ugc.download_item(id, false);
                }
                ItemDisposition::Ready { needs_update } => {
                    let Some(info) = ugc.item_install_info(id) else {
                        continue;
                    };
                    if !Path::new(&info.folder).is_dir() {
                        continue;
                    }
                    items.push(WorkshopItem {
                        item_id: id.0.to_string(),
                        folder: info.folder,
                        needs_update,
                    });
                }
            }
        }
        items
    }

    fn publish(&self, request: &PublishRequest) -> PublishAnswer {
        let Some(client) = steam_client() else {
            return PublishAnswer::Failed {
                detail: "there is no Steam client here".to_string(),
            };
        };
        let app = steamworks::AppId(steam_app_id());
        let ugc = client.ugc();

        // The first publish MINTS the item; every one after it updates the same
        // one, because the id was written down beside the mod. A mod cannot
        // accidentally become two Workshop entries.
        let (item, mut needs_agreement) = match request
            .item_id
            .as_deref()
            .and_then(|id| id.parse::<u64>().ok())
        {
            Some(id) => (PublishedFileId(id), false),
            None => {
                let (sender, replies) = mpsc::channel();
                ugc.create_item(app, FileType::Community, move |result| {
                    let _ = sender.send(result);
                });
                match replies.recv_timeout(UPLOAD_TIMEOUT) {
                    Ok(Ok((id, agreement))) => (id, agreement),
                    Ok(Err(err)) => {
                        return PublishAnswer::Failed {
                            detail: err.to_string(),
                        }
                    }
                    Err(_) => {
                        return PublishAnswer::Failed {
                            detail: "Steam did not answer".to_string(),
                        }
                    }
                }
            }
        };

        let mut update = ugc
            .start_item_update(app, item)
            .title(&request.title)
            .description(&request.description)
            // The AUTHORED folder, not a compiled bundle — see the module
            // header.
            .content_path(Path::new(&request.folder));
        if let Some(preview) = request.preview.as_deref() {
            update = update.preview_path(Path::new(preview));
        }
        if !request.tags.is_empty() {
            update = update.tags(request.tags.clone(), false);
        }

        let (sender, replies) = mpsc::channel();
        let note = (!request.change_note.is_empty()).then_some(request.change_note.as_str());
        let _watch = update.submit(note, move |result| {
            let _ = sender.send(result);
        });
        match replies.recv_timeout(UPLOAD_TIMEOUT) {
            Ok(Ok((id, agreement))) => {
                needs_agreement |= agreement;
                output::info(&format!(
                    "workshop: published {} as {}",
                    request.title, id.0
                ));
                PublishAnswer::Ok {
                    item_id: id.0.to_string(),
                    needs_to_accept_agreement: needs_agreement,
                }
            }
            Ok(Err(err)) => {
                output::warn(&format!("workshop: publish failed — {err}"));
                PublishAnswer::Failed {
                    detail: err.to_string(),
                }
            }
            Err(_) => PublishAnswer::Failed {
                detail: "Steam did not finish the upload".to_string(),
            },
        }
    }
}
