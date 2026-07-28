// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GAME CENTER, the Apple half: the signed-in player, the game's achievement
// progress, its public leaderboard scores, and the system boards that show
// both off.
//
// This module is the ONE owner of `GKLocalPlayer.authenticateHandler` in the
// app. Game Center authentication is a single global thing — a second module
// assigning that handler would replace this one's mid-flight — so cloud save
// asks HERE for the player's name (native/src/cloud-icloud.ts) rather than
// authenticating a second time.
//
// Achievements are REPORTED, never read back for gameplay: the game's own
// ledger (pwa/src/game/achievements.ts, carried between devices by cloud save)
// stays the source of truth, and Game Center is a mirror of it. Reporting is
// idempotent and monotone — Game Center keeps the highest percentage it has
// seen for an id — so a replay of the whole set costs nothing and can never
// take a badge away.
//
// SCORES work the same way and for the same reason: Game Center keeps the best
// value it has ever been sent for a board, so submitting the player's whole
// slate at any convenient moment is idempotent, needs no memory of what went
// before, and cannot lower a standing. Nothing is ever read back — the ranking
// itself is drawn by Game Center's own board (`showLeaderboards`), which is why
// the game ships no leaderboard UI at all.
//
// Requires the Game Center capability on the App ID (see native/README.md);
// the entitlement comes from native/app.config.js.

import ExpoModulesCore
import GameKit

/// One badge's progress, as the web side sends it. `percent` is 0…100; 100 is
/// earned. The id is the platform's own achievement identifier (the game's
/// badge id — see pwa/src/game/platform-achievements.ts), which must exist in
/// App Store Connect for the report to stick.
struct AchievementEntry: Record {
  @Field var id: String = ""
  @Field var percent: Double = 0
}

/// One board's score, as the web side sends it. `value` is already the whole
/// number the board stores — a rate or a duration was scaled on the way out
/// (see pwa/src/game/platform-leaderboards.ts), because a Game Center score is
/// an Int64 and the portal's score format is what writes the decimal point or
/// the clock back in. The id is the board's Leaderboard ID, which must exist in
/// App Store Connect for the submission to stick.
struct ScoreEntry: Record {
  @Field var id: String = ""
  @Field var value: Int = 0
}

public class GameCenterModule: Module {
  /// Callers waiting on the one in-flight authentication. Apple's handler can
  /// fire more than once (once to hand us a sign-in sheet, again with the
  /// outcome), and the page may ask twice before either lands, so every waiter
  /// is settled together and exactly once.
  private var waiting: [Promise] = []
  private var authenticating = false
  /// Retained for the lifetime of the module — the board's delegate is what
  /// closes it, and a delegate is held weakly by GameKit.
  private let boardDelegate = GameCenterBoardDelegate()

  public func definition() -> ModuleDefinition {
    Name("GameCenter")

    /// Is there an authenticated player to report to? False before sign-in
    /// completes, and for a player who declined Game Center — the game then
    /// keeps its badges locally and simply doesn't mirror them.
    Function("isAvailable") { () -> Bool in
      GKLocalPlayer.local.isAuthenticated
    }

    /// Authenticate and report the player. Resolves nil when the player
    /// declines or Game Center is unavailable — identity is a nice-to-have,
    /// never a gate on playing (or on saving: cloud save reads this too).
    AsyncFunction("authenticate") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          promise.resolve(nil)
          return
        }
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
          promise.resolve(Self.describe(player))
          return
        }
        self.waiting.append(promise)
        guard !self.authenticating else { return }
        self.authenticating = true
        player.authenticateHandler = { [weak self] viewController, _ in
          if let viewController {
            self?.present(viewController)
            return
          }
          self?.settle(player.isAuthenticated ? Self.describe(player) : nil)
        }
      }
    }

    /// Mirror a batch of badges. The bool is "Game Center took it" — a false
    /// leaves the web side's last-reported marks untouched, so the same batch
    /// is retried on the next sync rather than being silently lost.
    AsyncFunction("report") { (entries: [AchievementEntry], promise: Promise) in
      // GameKit's player state is read on the main queue, like everything else
      // here — the report itself is an async network call and settles wherever
      // GameKit chooses.
      DispatchQueue.main.async {
        guard GKLocalPlayer.local.isAuthenticated else {
          promise.resolve(false)
          return
        }
        if entries.isEmpty {
          promise.resolve(true)
          return
        }
        let achievements = entries.map { entry -> GKAchievement in
          let achievement = GKAchievement(identifier: entry.id)
          achievement.percentComplete = min(100, max(0, entry.percent))
          // The game celebrates a badge with its own pixel toast and jingle; a
          // second, system banner on top of it would be a double celebration —
          // and it lands across the top of a landscape frame mid-fight.
          achievement.showsCompletionBanner = false
          return achievement
        }
        GKAchievement.report(achievements) { error in
          promise.resolve(error == nil)
        }
      }
    }

    /// Put Game Center's own achievements board on screen — the game's
    /// ACHIEVEMENTS shelf offers it as a row, for a player who wants to see
    /// their badges next to their friends'.
    AsyncFunction("show") { (promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        guard GKLocalPlayer.local.isAuthenticated, let self else {
          promise.resolve(false)
          return
        }
        let board = GKGameCenterViewController(state: .achievements)
        board.gameCenterDelegate = self.boardDelegate
        self.present(board)
        promise.resolve(true)
      }
    }

    /// Publish a batch of scores. Each entry names its own board, so the whole
    /// slate goes out in one call; the bool is "every one of them landed",
    /// which the web side only logs — a score the player will re-earn is not
    /// worth interrupting them for. A board the portal doesn't know yet simply
    /// errors for that id and leaves the rest of the batch alone, so a new
    /// board can ship ahead of its App Store Connect entry.
    AsyncFunction("submitScores") { (entries: [ScoreEntry], promise: Promise) in
      DispatchQueue.main.async {
        let player = GKLocalPlayer.local
        guard player.isAuthenticated else {
          promise.resolve(false)
          return
        }
        if entries.isEmpty {
          promise.resolve(true)
          return
        }
        // GameKit submits ONE value to a list of boards, so a slate of
        // different values is one call per entry; they are independent, so the
        // group waits for all of them rather than chaining.
        let group = DispatchGroup()
        var allLanded = true
        let lock = NSLock()
        for entry in entries {
          group.enter()
          GKLeaderboard.submitScore(
            entry.value,
            context: 0,
            player: player,
            leaderboardIDs: [entry.id]
          ) { error in
            if error != nil {
              lock.lock()
              allLanded = false
              lock.unlock()
            }
            group.leave()
          }
        }
        group.notify(queue: .main) { promise.resolve(allLanded) }
      }
    }

    /// Put Game Center's own LEADERBOARD board on screen — on one board when
    /// given an id, otherwise the whole list. This is the entire leaderboard
    /// UI: the ranking, the player's own rank, their friends' scores and the
    /// time scopes are Game Center's to draw, and drawing a worse copy of them
    /// in the game would be the only way to get them wrong.
    AsyncFunction("showLeaderboards") {
      (leaderboardID: String?, promise: Promise) in
      DispatchQueue.main.async { [weak self] in
        guard GKLocalPlayer.local.isAuthenticated, let self else {
          promise.resolve(false)
          return
        }
        let board: GKGameCenterViewController
        if let leaderboardID {
          board = GKGameCenterViewController(
            leaderboardID: leaderboardID,
            playerScope: .global,
            timeScope: .allTime
          )
        } else {
          board = GKGameCenterViewController(state: .leaderboards)
        }
        board.gameCenterDelegate = self.boardDelegate
        self.present(board)
        promise.resolve(true)
      }
    }
  }

  /// Settle every waiter on the in-flight authentication, exactly once.
  private func settle(_ player: [String: String]?) {
    guard authenticating else { return }
    authenticating = false
    let promises = waiting
    waiting = []
    for promise in promises { promise.resolve(player) }
  }

  private static func describe(_ player: GKLocalPlayer) -> [String: String] {
    ["id": player.gamePlayerID, "name": player.displayName]
  }

  /// Put a Game Center view controller (the sign-in sheet, the board) on screen
  /// over the game's WebView.
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

/// Closes the achievements board when the player is done with it — GameKit
/// hands the dismissal back to the presenter rather than doing it itself.
final class GameCenterBoardDelegate: NSObject, GKGameCenterControllerDelegate {
  func gameCenterViewControllerDidFinish(
    _ gameCenterViewController: GKGameCenterViewController
  ) {
    gameCenterViewController.dismiss(animated: true)
  }
}
