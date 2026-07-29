// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Building the VDF script that `steamcmd` consumes to upload a depot, and the
// checks that decide whether it is safe to.
//
// Split out from steam-upload.mjs and kept PURE so the parts that can be wrong
// silently — the escaping, the id validation, the "is this actually a store
// build" test — are testable without steamcmd, a Steam account, or a packaged
// app. The driver next door does the I/O.
//
// VDF is Valve's KeyValues format: quoted strings, tab-indented, braces for
// nesting. Depots are declared INLINE inside the appbuild rather than in
// separate per-depot files, which Valve's own documentation offers as the
// simpler form and which keeps one generated artifact instead of four.

/** Valve's Spacewar test app — never a release target. */
export const SPACEWAR_APP_ID = 480;

/**
 * Escape a string for a VDF quoted value.
 *
 * Windows content roots are full of backslashes, and an unescaped one is a
 * VDF escape character — `C:\release\win-unpacked` silently becomes
 * `C:releasewin-unpacked` and steamcmd uploads nothing, or the wrong thing.
 */
export function escapeVdf(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * The platforms a depot can be built for, and the electron-builder output
 * directory each one produces. Keep in step with electron-builder.config.cjs.
 */
export const PLATFORM_DIRS = {
  windows: "win-unpacked",
  macos: "mac-universal",
  linux: "linux-unpacked",
};

/**
 * Validate the app/depot id configuration, returning a list of problems.
 *
 * Returns reasons rather than throwing so the caller can print all of them at
 * once — being told about one missing id at a time, across a multi-minute
 * upload each, is how this becomes an afternoon.
 */
export function validateIds(config, platform) {
  const problems = [];
  const appId = config?.appId;
  if (appId === null || appId === undefined || appId === "") {
    problems.push(
      "appId is not set — fill it in from the Steamworks partner site " +
        "(App Admin → the number in the URL).",
    );
  } else if (!Number.isInteger(appId) || appId <= 0) {
    problems.push(`appId must be a positive whole number, got ${appId}.`);
  } else if (appId === SPACEWAR_APP_ID) {
    problems.push(
      "appId is 480 (Valve's shared Spacewar test app). That is for local " +
        "development only and must never be uploaded to.",
    );
  }

  const depotId = config?.depots?.[platform];
  if (depotId === null || depotId === undefined || depotId === "") {
    problems.push(
      `depots.${platform} is not set — create the depot in the partner site ` +
        "(App Admin → Depots) and put its id here.",
    );
  } else if (!Number.isInteger(depotId) || depotId <= 0) {
    problems.push(
      `depots.${platform} must be a positive whole number, got ${depotId}.`,
    );
  }
  return problems;
}

/**
 * Chunk names Rollup only emits when the developer tooling is compiled in.
 *
 * `__DEV_TOOLS__` is a build-time literal, so with it off these lazy chunks are
 * dropped from the bundle entirely — which makes their PRESENCE a reliable
 * signal that a build was made with the developer menu, the hidden sun-tap
 * reveal and the arsenal/effects galleries still in it. That is fine for a
 * local run and wrong for a store upload, and it is otherwise invisible: the
 * app looks identical until someone taps the sun seven times.
 */
export const DEV_TOOL_CHUNKS = ["ArsenalScreen", "EffectsGallery"];

/** Does this list of built asset filenames look like a developer build? */
export function looksLikeDeveloperBuild(assetFilenames) {
  return assetFilenames.some((name) =>
    DEV_TOOL_CHUNKS.some((chunk) => name.startsWith(chunk)),
  );
}

/**
 * The app build script steamcmd runs.
 *
 * `setlive` is empty by default and that is deliberate: uploading and GOING
 * LIVE are different decisions, and a script that did both means one mistyped
 * command ships to every player. The build lands in the partner site where it
 * can be looked at, and a human sets it live there (or passes an explicit
 * branch here).
 */
export function buildAppVdf({
  appId,
  depotId,
  contentRoot,
  outputDir,
  description,
  branch = "",
  preview = false,
}) {
  const q = (value) => `"${escapeVdf(value)}"`;
  return `"appbuild"
{
\t"appid"\t${q(appId)}
\t"desc"\t${q(description)}
\t"buildoutput"\t${q(outputDir)}
\t"contentroot"\t${q(contentRoot)}
\t"setlive"\t${q(branch)}
\t"preview"\t${q(preview ? "1" : "0")}

\t"depots"
\t{
\t\t${q(depotId)}
\t\t{
\t\t\t"FileMapping"
\t\t\t{
\t\t\t\t"LocalPath"\t"*"
\t\t\t\t"DepotPath"\t"."
\t\t\t\t"recursive"\t"1"
\t\t\t}
\t\t\t"FileExclusion"\t"*.pdb"
\t\t\t"FileExclusion"\t"*.map"
\t\t}
\t}
}
`;
}
