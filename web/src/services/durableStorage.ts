/**
 * Ask the browser to treat this origin's storage as persistent — once, and
 * only after the user has actually saved something.
 *
 * Safari evicts ALL script-writable storage, IndexedDB included, after about
 * seven days without interaction with the site. Hours of georeferencing and
 * imported rasters can vanish silently between visits; navigator.storage
 * .persist() is the one lever against that. It is requested after the first
 * successful write rather than at startup because Firefox surfaces the
 * request as a user prompt — asking before the user has stored anything is
 * noise, and Chromium's silent heuristics don't mind the later ask.
 *
 * Fire-and-forget on purpose: a denial changes nothing about how the app
 * writes, and there is nothing actionable to render.
 */
let requested = false;

export function requestDurableStorage(): void {
  if (requested) {
    return;
  }
  requested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // navigator.storage itself can throw in hardened/embedded contexts.
  }
}

/** Test seam: module-level once-latch, reset between cases. */
export function resetDurableStorageRequestForTests(): void {
  requested = false;
}
