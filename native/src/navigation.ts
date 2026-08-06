// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How the shell CLASSIFIES a URL the WebView is about to load. Two questions,
// both asked on every navigation (App.tsx), and both pure string work — which
// is why they live here rather than in App.tsx: this module imports nothing, so
// the suite can test it without standing up react-native.

/**
 * Is this URL one of the site's DOCUMENTS rather than the game itself?
 *
 * The library (`/library/…`) and the two store-mandated pages are plain long
 * HTML served off the very same local origin as the game, so the WebView can
 * only tell them apart by path. Keep this in step with `DOC_PAGES`
 * (pwa/pwa-plugin.ts) and the library's mount point.
 *
 * Matched on the PATH, not with `includes`, so a query or fragment can't smuggle
 * the word past it and a level called `library` in some future URL can't either.
 */
export function isDocumentUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return /(^|\/)(library|privacy|contact)(\/|$)/.test(path);
}

/**
 * Is this navigation leaving the SITE — somewhere the shell serves nothing?
 *
 * The WebView is the whole app: no address bar, no back button, and
 * `allowsBackForwardNavigationGestures` is off because a swipe belongs to the
 * game. So a link to an off-site page (EXTRAS -> COMMUNITY, the chat server
 * the players keep) would replace the game with a web page the player cannot
 * leave without killing the app. App.tsx hands such a URL to the system browser
 * instead, exactly as the desktop shell hands one to `shell.openExternal`
 * (electron/src/main.ts) — keep the two in step.
 *
 * Only http(s) is judged, and everything else is INTERNAL by default: the
 * WebView's own `about:blank`, `blob:` and `data:` loads must not be cancelled,
 * and cancelling an unrecognised scheme would break a navigation this shell has
 * no opinion about. A null `origin` is the source not having resolved yet, so
 * there is nothing for a URL to be outside of.
 *
 * Compared by ORIGIN rather than by prefix, so a lookalike host cannot pass by
 * starting with ours (`http://localhost:9006.evil.test/`) and a deep link into
 * our own site cannot fail by differing in its path.
 */
export function isExternalUrl(url: string, origin: string | null): boolean {
  if (!origin) return false;
  if (!/^https?:/i.test(url)) return false;
  let home: URL;
  try {
    home = new URL(origin);
  } catch {
    // Our OWN origin is the unparseable one — nothing can be judged against it,
    // and refusing every navigation would leave a blank shell.
    return false;
  }
  try {
    return new URL(url).origin !== home.origin;
  } catch {
    // An http(s) URL this runtime cannot parse (`http://localhost:9006.evil.test/`
    // — a port that isn't a number). It claims to be the web and cannot be shown
    // to be ours, and the WebView's own parser may well disagree with this one,
    // so it fails CLOSED: the load is cancelled and handed off rather than
    // trusted. `Linking.openURL` refusing it too is the correct end of that.
    return true;
  }
}
