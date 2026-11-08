import { describe, expect, it } from "vitest";
import { classifyOpening, clearLastView, offersReturn, readLastView, writeLastView, writeTabView } from "./returnMemory";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const view = { search: "?theme=fishing&position=45.8,-61.4,9", setupName: "Fishing" };

describe("return memory", () => {
  it("keeps, reads and forgets the reader's last view", () => {
    const store = memoryStore();
    expect(readLastView(store)).toBeNull();
    writeLastView(store, view);
    expect(readLastView(store)).toEqual(view);
    clearLastView(store);
    expect(readLastView(store)).toBeNull();
  });

  it("treats a blocked or damaged store as nothing remembered", () => {
    const blocked = {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("blocked", "SecurityError"); },
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(readLastView(blocked)).toBeNull();
    expect(() => writeLastView(blocked, view)).not.toThrow();
    expect(classifyOpening("?layers=roads", true, null, blocked)).toBe("link");
    const damaged = memoryStore();
    damaged.setItem("ns-marks-the-spot:last-view:v1", "{not json");
    expect(readLastView(damaged)).toBeNull();
  });

  it("offers a last view only when there is one", () => {
    expect(offersReturn(null)).toBe(false);
    expect(offersReturn(view)).toBe(true);
  });

  it("tells a plain address, the reader's own address and a link apart", () => {
    const tab = memoryStore();
    expect(classifyOpening("", false, view, tab)).toBe("plain");
    // The map rewrites the address on every move, so this is the reader's own.
    expect(classifyOpening(view.search, true, view, tab)).toBe("own");
    expect(classifyOpening("?layers=roads", true, view, tab)).toBe("link");
  });

  it("keeps a link a link across a reload in the same tab, until the reader keeps it", () => {
    const tab = memoryStore();
    writeTabView(tab, "?layers=roads", true);
    expect(classifyOpening("?layers=roads", true, view, tab)).toBe("link");
    writeTabView(tab, "?layers=roads", false);
    expect(classifyOpening("?layers=roads", true, view, tab)).toBe("own");
    // A different address pasted into the tab is a new link.
    expect(classifyOpening("?layers=water-features", true, view, tab)).toBe("link");
  });
});
