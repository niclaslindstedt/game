// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A minimal React error boundary. Its main customer is lazy-loaded chunks: a
// dynamic import that fails (deploy changed the hashed filenames under a
// stale page, flaky network, stale native webroot) rejects during render, and
// without a boundary React unmounts the whole tree — the player sees a silent
// black screen with no way out. The boundary catches it and renders the given
// fallback instead, which should offer a reload.
// Generic React/UI game code: lives in website/src/lib/ (imported as @ui/lib/*)
// so it can be extracted into oss-framework once mature.

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  {
    /** What to render when a descendant throws. */
    fallback: ReactNode;
    /** Called with the caught error (log it via the app's output channel). */
    onError?: (error: unknown) => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
