/**
 * Screen wake lock for recording sessions. The browser silently releases the
 * lock when the tab hides, so a visibilitychange listener re-requests it on
 * return; a browser without the API degrades to `supported: false` and the
 * HUD shows a keep-your-screen-on hint instead.
 */

export type WakeLockHandle = {
  supported: boolean;
  release: () => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

export function acquireScreenWakeLock(
  navigatorLike: WakeLockNavigator | undefined = typeof navigator !== "undefined"
    ? (navigator as WakeLockNavigator)
    : undefined,
  documentLike: Document | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): WakeLockHandle {
  const wakeLock = navigatorLike?.wakeLock;
  if (!wakeLock) {
    return { supported: false, release: () => {} };
  }

  let released = false;
  let sentinel: WakeLockSentinel | null = null;

  const requestLock = () => {
    // Rejection (backgrounded tab, power-save policy) is not an error worth
    // surfacing: the visibility listener retries when the tab returns.
    void wakeLock
      .request("screen")
      .then((acquired) => {
        if (released) {
          void acquired.release().catch(() => {});
          return;
        }
        // Only the sentinel this variable holds can be released later, so a
        // second live one has to go now: a visibility event that lands before
        // the previous request resolves leaves two in flight, and they need
        // not resolve in the order they were made. Overwriting strands the
        // other, and a lock nothing can reach holds the screen awake past the
        // end of the session. A lock the browser already released on hide is
        // not live, so returning to the tab still re-acquires.
        if (sentinel && !sentinel.released) {
          void acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
      })
      .catch(() => {});
  };

  const onVisibilityChange = () => {
    if (!released && documentLike?.visibilityState === "visible") {
      requestLock();
    }
  };

  requestLock();
  documentLike?.addEventListener("visibilitychange", onVisibilityChange);

  return {
    supported: true,
    release: () => {
      released = true;
      documentLike?.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
}
