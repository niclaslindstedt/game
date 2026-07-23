// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A tiny React hook that subscribes to a CSS media query and re-renders when it
// flips (device rotate, window resize). SSR-safe: it returns false when there
// is no `window`/`matchMedia`. Generic UI plumbing (earmarked for oss-framework
// extraction) — imported via `@ui/lib/use-media-query.ts`.

import { useEffect, useState } from "react";

/** True while `query` matches, updating live as the viewport changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
