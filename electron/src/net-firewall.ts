// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OS FIREWALL — the one layer of the three that cannot be opened silently.
//
// The router is a packet on the LAN and needs nobody's permission
// (`server/net/upnp.ts`). The socket binds or it does not. This one asks the
// player, once, on a press — and the whole file exists to make that ask honest.
//
// **THERE IS NO INSTALLER TO HANG A RULE ON.** The Steam depot target is `dir`
// and Steam's own client does the installing, so there is no elevated moment to
// inherit and nothing to do at first run. That is why this is a button on the
// HOST screen rather than a step in a setup wizard.
//
// THREE RULES GOVERN THE WHOLE AREA, and each one is a mistake somebody else
// has already shipped:
//
//  1. **NEVER ELEVATE AT LAUNCH, AND NEVER WITHOUT BEING ASKED.** A game that
//     pops UAC when it starts is a game people uninstall. The prompt happens on
//     a press, labelled with what it will do, and only when the check says a
//     rule is actually missing.
//  2. **VERIFY, NEVER ASSUME.** After a rule is added the check runs again and
//     the result is what is shown. A green "opened" that is not open is worse
//     than a red one, because it sends the player looking in the wrong place.
//  3. **ALWAYS LEAVE A MANUAL PATH.** The exact command, copyable, beside the
//     button. Some machines are locked down by an administrator who is not the
//     player, and that must read as "here is what to ask for" rather than as a
//     dead end.
//
// **AND THE HONEST LIMIT, which the HOST screen has to say out loud:
// reachability from the outside cannot be self-tested without an outside.**
// Everything here reports on a rule being PRESENT. The only proof that the
// internet can reach this machine is the first joiner who does.

import { execFile } from "node:child_process";
import { platform } from "node:process";

import { output } from "./output";

/** What the FIREWALL row shows. */
export type FirewallState =
  /** Nothing to do: no host firewall, or one that is off. */
  | { status: "not-needed"; detail: string }
  /** A rule for this port exists. */
  | { status: "allowed" }
  /** No rule, and we know how to add one. */
  | { status: "blocked"; manual: string }
  /** We could not tell — an unknown firewall, a command that failed. Reported
   * as its own state rather than folded into "blocked", because telling a
   * player to fix something that may not be broken is how a status row loses
   * their trust. */
  | { status: "unknown"; detail: string; manual?: string };

/** How long any one firewall command may take. These are local queries; past
 * this the tool is waiting on something and the HOST screen must not. */
const COMMAND_TIMEOUT_MS = 5_000;

/** The rule's name on Windows and in every message about it. Stable, because
 * the check looks it up by name — renaming it would leave every existing
 * player with an invisible orphan rule. */
const RULE_NAME = "Ada's Trail (multiplayer)";

/**
 * Is UDP `port` allowed in?
 *
 * Never throws and never spawns anything elevated. A platform with nothing to
 * check answers `not-needed`, which is the correct answer for most Linux
 * gaming machines and the Steam Deck.
 */
export async function checkFirewall(port: number): Promise<FirewallState> {
  if (platform === "win32") return checkWindows(port);
  // The macOS check takes no port: its firewall filters by APPLICATION, so
  // there is no number to look for.
  if (platform === "darwin") return checkMac();
  return checkLinux(port);
}

/**
 * Add the rule, then CHECK IT AGAIN and report what the check said.
 *
 * The return value is deliberately the verification's answer and not "did the
 * command exit zero": `netsh` reports success for a rule the group policy then
 * declines to honour, and a player told "opened" in that case has been sent to
 * debug their router for the rest of the evening.
 */
export async function allowFirewall(port: number): Promise<FirewallState> {
  try {
    if (platform === "win32") await elevateWindows(port);
    else if (platform === "darwin") await elevateMac();
    else await elevateLinux(port);
  } catch (err) {
    output.warn(`firewall: could not add a rule — ${describe(err)}`);
  }
  return checkFirewall(port);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/**
 * Windows Defender Firewall, which is on by default and is the one platform
 * where this matters to nearly everybody.
 *
 * Binding a listening socket makes Windows show its OWN allow dialog, and a
 * player who clicks Allow there is done — so in practice this check reports
 * `allowed` for most players without anybody pressing anything. The button
 * exists for the ones who clicked Cancel, or who never saw the dialog because
 * the game was launched from Steam's overlay while another window had focus.
 */
async function checkWindows(port: number): Promise<FirewallState> {
  const manual = windowsCommand(port);
  try {
    const rules = await run("netsh", [
      "advfirewall",
      "firewall",
      "show",
      "rule",
      `name=${RULE_NAME}`,
    ]);
    // `netsh` exits 1 with "No rules match" rather than printing an empty
    // list, so the absence is read off the text; the localized message differs
    // per install, which is why the PORT is what is looked for rather than any
    // English word.
    if (rules.includes(String(port))) return { status: "allowed" };
    return { status: "blocked", manual };
  } catch {
    return { status: "blocked", manual };
  }
}

function windowsCommand(port: number): string {
  return (
    `netsh advfirewall firewall add rule name="${RULE_NAME}" ` +
    `dir=in action=allow protocol=UDP localport=${port}`
  );
}

async function elevateWindows(port: number): Promise<void> {
  // ONE UAC prompt, on the press. `Start-Process -Verb RunAs` is what raises
  // it; `-Wait` is what makes the verification afterwards mean anything,
  // because without it the check races the rule being written.
  const args = [
    "advfirewall",
    "firewall",
    "add",
    "rule",
    `name=${RULE_NAME}`,
    "dir=in",
    "action=allow",
    "protocol=UDP",
    `localport=${port}`,
  ]
    .map((arg) => `'${arg.replace(/'/g, "''")}'`)
    .join(",");
  await run("powershell", [
    "-NoProfile",
    "-Command",
    `Start-Process netsh -Verb RunAs -Wait -ArgumentList ${args}`,
  ]);
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

/**
 * The macOS application firewall, which is OFF by default on most Macs — so
 * the common answer here is `not-needed` and the row should say so rather than
 * offering a remedy nobody requires.
 *
 * It also filters by APPLICATION rather than by port, which is why the remedy
 * unblocks the app instead of opening a number.
 */
async function checkMac(): Promise<FirewallState> {
  const tool = "/usr/libexec/ApplicationFirewall/socketfilterfw";
  try {
    const global = await run(tool, ["--getglobalstate"]);
    if (/disabled/i.test(global)) {
      return { status: "not-needed", detail: "THE MACOS FIREWALL IS OFF" };
    }
    const apps = await run(tool, ["--listapps"]);
    if (apps.includes(process.execPath)) return { status: "allowed" };
    return { status: "blocked", manual: macCommand() };
  } catch {
    return {
      status: "unknown",
      detail: "COULD NOT READ THE MACOS FIREWALL",
      manual: macCommand(),
    };
  }
}

function macCommand(): string {
  return (
    `sudo /usr/libexec/ApplicationFirewall/socketfilterfw ` +
    `--add "${process.execPath}" --unblockapp "${process.execPath}"`
  );
}

async function elevateMac(): Promise<void> {
  const tool = "/usr/libexec/ApplicationFirewall/socketfilterfw";
  const script =
    `do shell script "${tool} --add \\"${process.execPath}\\" && ` +
    `${tool} --unblockapp \\"${process.execPath}\\"" with administrator privileges`;
  await run("osascript", ["-e", script]);
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

/**
 * Linux, where the honest answer is usually "there is nothing to do".
 *
 * Most gaming distributions and the Steam Deck ship with no host firewall at
 * all, so the check looks for the two that people actually run and says
 * `not-needed` when neither is there — rather than reporting a problem
 * invented by looking for one.
 */
async function checkLinux(port: number): Promise<FirewallState> {
  const ufw = await tryRun("ufw", ["status"]);
  if (ufw !== null) {
    if (/inactive/i.test(ufw)) {
      return { status: "not-needed", detail: "UFW IS INACTIVE" };
    }
    if (ufw.includes(`${port}/udp`)) return { status: "allowed" };
    return { status: "blocked", manual: `sudo ufw allow ${port}/udp` };
  }
  const firewalld = await tryRun("firewall-cmd", ["--state"]);
  if (firewalld !== null) {
    // `--state` prints exactly `running` or `not running`, and the second
    // CONTAINS the first — so a bare /running/ test reports a stopped firewalld
    // as running and then offers a remedy for a problem this machine does not
    // have.
    if (!/running/i.test(firewalld) || /not\s+running/i.test(firewalld)) {
      return { status: "not-needed", detail: "FIREWALLD IS NOT RUNNING" };
    }
    const ports = await tryRun("firewall-cmd", ["--list-ports"]);
    if (ports?.includes(`${port}/udp`)) return { status: "allowed" };
    return {
      status: "blocked",
      manual: `sudo firewall-cmd --add-port=${port}/udp --permanent && sudo firewall-cmd --reload`,
    };
  }
  return { status: "not-needed", detail: "NO HOST FIREWALL FOUND" };
}

async function elevateLinux(port: number): Promise<void> {
  // `pkexec` is the desktop's own elevation prompt, and it is the only one
  // that works without a terminal — `sudo` from a windowed app either fails or
  // silently waits for a password nobody can type.
  if ((await tryRun("ufw", ["status"])) !== null) {
    await run("pkexec", ["ufw", "allow", `${port}/udp`]);
    return;
  }
  if ((await tryRun("firewall-cmd", ["--state"])) !== null) {
    await run("pkexec", [
      "firewall-cmd",
      `--add-port=${port}/udp`,
      "--permanent",
    ]);
    await run("pkexec", ["firewall-cmd", "--reload"]);
  }
}

// ---------------------------------------------------------------------------

/** Run a command and hand back its output. Rejects on a non-zero exit. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: COMMAND_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(`${stdout}${stderr}`);
      },
    );
  });
}

/** …or null when the command is not on this machine at all, which is a fact
 * rather than a failure: "there is no ufw here" is exactly what the Linux
 * check needs to know. */
async function tryRun(command: string, args: string[]): Promise<string | null> {
  try {
    return await run(command, args);
  } catch (err) {
    // A tool that ran and exited non-zero still told us it EXISTS — `ufw
    // status` without root is a refusal, not an absence — so only a spawn
    // failure counts as "not installed".
    const code = (err as { code?: unknown } | null)?.code;
    if (code === "ENOENT") return null;
    const stdout = (err as { stdout?: unknown } | null)?.stdout;
    return typeof stdout === "string" ? stdout : "";
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
