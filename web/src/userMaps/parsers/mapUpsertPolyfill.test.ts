import { describe, expect, it, vi } from "vitest";
import {
  mapUpsertMethods,
  weakMapUpsertMethods,
} from "./mapUpsertPolyfill";

// The implementations are called directly, so these checks hold whether or
// not the Node running the tests has native upsert methods.
const { getOrInsert, getOrInsertComputed } = mapUpsertMethods;
const weak = weakMapUpsertMethods;

describe("Map upsert polyfill", () => {
  it("returns an existing value without calling the callback", () => {
    const map = new Map([["a", 1]]);
    const callback = vi.fn(() => 2);
    expect(getOrInsertComputed.call(map, "a", callback)).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    expect(getOrInsert.call(map, "a", 3)).toBe(1);
    expect(map.get("a")).toBe(1);
  });

  it("inserts and returns a missing value", () => {
    const map = new Map<string, number>();
    const callback = vi.fn(() => 2);
    expect(getOrInsertComputed.call(map, "b", callback)).toBe(2);
    expect(callback).toHaveBeenCalledExactlyOnceWith("b");
    expect(getOrInsert.call(map, "c", 3)).toBe(3);
    expect([...map]).toEqual([["b", 2], ["c", 3]]);
  });

  it("passes +0 to the callback for a -0 key", () => {
    const map = new Map();
    let received: unknown;
    getOrInsertComputed.call(map, -0, (key: unknown) => {
      received = key;
      return "zero";
    });
    expect(Object.is(received, 0)).toBe(true);
    expect(Object.is([...map.keys()][0], 0)).toBe(true);
  });

  it("stores the computed value over one the callback inserted", () => {
    const map = new Map<string, string>();
    const value = getOrInsertComputed.call(map, "k", () => {
      map.set("k", "inner");
      return "outer";
    });
    expect(value).toBe("outer");
    expect(map.get("k")).toBe("outer");
  });

  it("rejects a non-callable callback even when the key exists", () => {
    const map = new Map([["a", 1]]);
    expect(() => getOrInsertComputed.call(map, "a", 1)).toThrow(TypeError);
  });

  it("rejects a receiver that is not a Map", () => {
    const callback = vi.fn();
    expect(() =>
      getOrInsertComputed.call(
        new WeakMap() as unknown as Map<unknown, unknown>,
        {},
        callback,
      ),
    ).toThrow(TypeError);
    expect(() =>
      getOrInsert.call({} as Map<unknown, unknown>, "a", 1),
    ).toThrow(TypeError);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("WeakMap upsert polyfill", () => {
  it("returns an existing value and inserts a missing one", () => {
    const present = {};
    const missing = {};
    const map = new WeakMap<object, string>([[present, "kept"]]);
    const callback = vi.fn(() => "computed");
    expect(weak.getOrInsertComputed.call(map, present, callback)).toBe("kept");
    expect(callback).not.toHaveBeenCalled();
    expect(weak.getOrInsertComputed.call(map, missing, callback)).toBe(
      "computed",
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith(missing);
    const other = {};
    expect(weak.getOrInsert.call(map, other, "inserted")).toBe("inserted");
    expect(weak.getOrInsert.call(map, other, "ignored")).toBe("inserted");
  });

  it("rejects a key that cannot be held weakly before the callback", () => {
    const map = new WeakMap();
    const callback = vi.fn();
    for (const key of [1, "a", null, undefined, Symbol.for("registered")]) {
      expect(() => weak.getOrInsertComputed.call(map, key, callback)).toThrow(
        TypeError,
      );
      expect(() => weak.getOrInsert.call(map, key, 1)).toThrow(TypeError);
    }
    expect(callback).not.toHaveBeenCalled();
  });

  it("rejects a non-callable callback and a non-WeakMap receiver", () => {
    expect(() =>
      weak.getOrInsertComputed.call(new WeakMap(), {}, "nope"),
    ).toThrow(TypeError);
    expect(() =>
      weak.getOrInsert.call(
        new Map() as unknown as WeakMap<object, unknown>,
        {},
        1,
      ),
    ).toThrow(TypeError);
  });
});

describe("installation", () => {
  it("leaves every method callable and non-enumerable, like built-ins", () => {
    for (const prototype of [Map.prototype, WeakMap.prototype]) {
      for (const name of ["getOrInsert", "getOrInsertComputed"]) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        expect(typeof descriptor?.value).toBe("function");
        expect(descriptor).toMatchObject({
          writable: true,
          enumerable: false,
          configurable: true,
        });
        expect(descriptor?.value.length).toBe(2);
        expect(descriptor?.value.name).toBe(name);
      }
    }
  });
});
