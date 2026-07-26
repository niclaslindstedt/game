// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE, the Apple half: the game's save blob in the player's iCloud, and
// the Game Center player behind it.
//
// The transport is NSUbiquitousKeyValueStore — Apple's key-value iCloud, built
// for exactly this (a small save that follows the Apple ID across the player's
// devices). It needs no sign-in UI, no container plumbing and no conflict
// resolution API: the OS mirrors the store locally, so a read is instant and
// offline-safe, and a write syncs when the network allows. The game's own merge
// (pwa/src/game/cloud-save.ts) reconciles what two devices wrote, so we never
// need last-writer-wins from the store itself — we only need to be TOLD when
// the value changed underneath us, which is the change notification below.
//
// Game Center is identity only. Apple's cross-device save mechanism IS iCloud;
// Game Center's contribution is naming the player, which lets the game show
// whose save this is ("SIGNED IN AS …") and lets a future leaderboard hang off
// the same authentication.
//
// Requires two capabilities on the App ID (see native/README.md): iCloud with
// "Key-value storage", and Game Center. The entitlements come from
// native/app.config.js.

import ExpoModulesCore
import GameKit

public class CloudSaveModule: Module {
  private var changeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CloudSave")

    // Fired when another device wrote the store — the web side pulls + merges.
    Events("onCloudChange")

    OnCreate {
      let store = NSUbiquitousKeyValueStore.default
      self.changeObserver = NotificationCenter.default.addObserver(
        forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
        object: store,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onCloudChange", [:])
      }
      // Pull whatever iCloud already has down into the local mirror, so the
      // first read of the launch isn't stale.
      store.synchronize()
    }

    OnDestroy {
      if let observer = self.changeObserver {
        NotificationCenter.default.removeObserver(observer)
        self.changeObserver = nil
      }
    }

    /// Is there an iCloud account to save into? False when the player is
    /// signed out of iCloud entirely — the game then stays device-local
    /// instead of pretending it is syncing.
    Function("isAvailable") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    /// The stored blob, or nil when this account has never saved.
    AsyncFunction("getItem") { (key: String) -> String? in
      let store = NSUbiquitousKeyValueStore.default
      store.synchronize()
      return store.string(forKey: key)
    }

    /// Write the blob. The bool is `synchronize()`'s own answer: false means
    /// the store refused it (over quota), which the web side surfaces rather
    /// than reporting a save that never happened.
    AsyncFunction("setItem") { (key: String, value: String) -> Bool in
      let store = NSUbiquitousKeyValueStore.default
      store.set(value, forKey: key)
      return store.synchronize()
    }

    /// Authenticate with Game Center and report the player. Resolves nil when
    /// the player declines or Game Center is unavailable — identity is a
    /// nice-to-have, never a gate on saving.
    AsyncFunction("signIn") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
          promise.resolve(Self.describe(player))
          return
        }
        // The handler can fire more than once (once to hand us a sign-in
        // sheet, again with the outcome), so the promise is settled at most
        // once.
        var settled = false
        player.authenticateHandler = { viewController, _ in
          if let viewController {
            self?.present(viewController)
            return
          }
          guard !settled else { return }
          settled = true
          promise.resolve(player.isAuthenticated ? Self.describe(player) : nil)
        }
      }
    }
  }

  private static func describe(_ player: GKLocalPlayer) -> [String: String] {
    ["id": player.gamePlayerID, "name": player.displayName]
  }

  /// Put Game Center's sign-in sheet on screen over the game's WebView.
  private func present(_ viewController: UIViewController) {
    guard
      let root = appContext?.utilities?.currentViewController()
        ?? UIApplication.shared.connectedScenes
          .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
          .first?.rootViewController
    else { return }
    root.present(viewController, animated: true)
  }
}
