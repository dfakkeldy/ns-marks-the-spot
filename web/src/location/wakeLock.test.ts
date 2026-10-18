import { describe, expect, it } from "vitest";
import { acquireScreenWakeLock } from "./wakeLock";

type NavigatorLike = Parameters<typeof acquireScreenWakeLock>[0];
type DocumentLike = Parameters<typeof acquireScreenWakeLock>[1];

type FakeSentinel = {
  released: boolean;
  releaseCount: number;
  release: () => Promise<void>;
};

/** A sentinel the browser can also release on its own, as it does on hide. */
function fakeSentinel(): FakeSentinel {
  const sentinel: FakeSentinel = {
    released: false,
    releaseCount: 0,
    release: () => {
      sentinel.released = true;
      sentinel.releaseCount += 1;
      return Promise.resolve();
    },
  };
  return sentinel;
}

/** Requests stay pending until the test settles them, in any order. */
function fakeWakeLock() {
  const pending: ((sentinel: WakeLockSentinel) => void)[] = [];
  let requestCount = 0;
  const navigatorLike = {
    wakeLock: {
      request: () => {
        requestCount += 1;
        return new Promise<WakeLockSentinel>((resolve) => pending.push(resolve));
      },
    },
  } as unknown as NavigatorLike;
  return {
    navigatorLike,
    requestCount: () => requestCount,
    settle(index: number, sentinel: FakeSentinel) {
      pending[index](sentinel as unknown as WakeLockSentinel);
    },
  };
}

function fakeDocument() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (type: string, listener: () => void) => {
      if (type === "visibilitychange") listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  return {
    documentLike: doc as unknown as DocumentLike,
    listenerCount: () => listeners.size,
    setVisibility(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** Let every queued promise reaction run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("acquireScreenWakeLock", () => {
  it("reports unsupported, and listens for nothing, without the API", () => {
    const doc = fakeDocument();
    const handle = acquireScreenWakeLock(
      {} as unknown as NavigatorLike,
      doc.documentLike,
    );

    expect(handle.supported).toBe(false);
    expect(doc.listenerCount()).toBe(0);
    expect(() => handle.release()).not.toThrow();
  });

  it("lets go of the lock it cannot keep when two requests resolve out of order", async () => {
    // Regression: a hide/show round trip re-requests before the first
    // request has resolved, and the two need not resolve in the order they
    // were made. Overwriting the variable strands the other sentinel, and a
    // lock nothing can reach holds the screen awake after the session ends.
    const lock = fakeWakeLock();
    const doc = fakeDocument();
    const handle = acquireScreenWakeLock(lock.navigatorLike, doc.documentLike);
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(lock.requestCount()).toBe(2);

    const first = fakeSentinel();
    const second = fakeSentinel();
    lock.settle(1, second);
    await flush();
    lock.settle(0, first);
    await flush();

    // The request issued second resolved first and is the one held; the
    // older request resolves late and is released at once.
    expect(first.releaseCount).toBe(1);
    expect(second.releaseCount).toBe(0);

    handle.release();
    await flush();
    expect(second.releaseCount).toBe(1);
    expect(first.releaseCount).toBe(1);
  });

  it("keeps a live lock while a re-request is in flight, and drops the spare", async () => {
    const lock = fakeWakeLock();
    const doc = fakeDocument();
    const handle = acquireScreenWakeLock(lock.navigatorLike, doc.documentLike);
    const first = fakeSentinel();
    lock.settle(0, first);
    await flush();

    // Letting the held lock go the moment a replacement is merely requested
    // would sleep the screen mid-walk if that request is then refused.
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(first.releaseCount).toBe(0);
    expect(first.released).toBe(false);

    const second = fakeSentinel();
    lock.settle(1, second);
    await flush();
    expect(second.releaseCount).toBe(1);

    handle.release();
    await flush();
    expect(first.releaseCount).toBe(1);
  });

  it("re-acquires after the browser released the lock on hide", async () => {
    const lock = fakeWakeLock();
    const doc = fakeDocument();
    const handle = acquireScreenWakeLock(lock.navigatorLike, doc.documentLike);
    const first = fakeSentinel();
    lock.settle(0, first);
    await flush();

    // The browser drops the screen lock itself when the tab hides.
    first.released = true;
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    const second = fakeSentinel();
    lock.settle(1, second);
    await flush();

    handle.release();
    await flush();
    expect(second.releaseCount).toBe(1);
    // The browser had already let the first one go; nothing left to release.
    expect(first.releaseCount).toBe(0);
  });

  it("releases a lock that arrives after the session ended, and stops listening", async () => {
    const lock = fakeWakeLock();
    const doc = fakeDocument();
    const handle = acquireScreenWakeLock(lock.navigatorLike, doc.documentLike);
    handle.release();
    expect(doc.listenerCount()).toBe(0);

    const late = fakeSentinel();
    lock.settle(0, late);
    await flush();
    expect(late.releaseCount).toBe(1);

    doc.setVisibility("visible");
    expect(lock.requestCount()).toBe(1);
  });
});
