// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Import-free IPC channel names for the main process. The sandboxed preload
// mirrors these literals because Electron does not let it require arbitrary
// local modules; the preload architecture test keeps the copies in step.

/** The channel every JSON bridge message travels on. */
export const SHELL_CHANNEL = "gis:post";

/** The channel used to deliver the multiplayer snapshot MessagePort. */
export const NET_PORT_CHANNEL = "gis:net-port";
