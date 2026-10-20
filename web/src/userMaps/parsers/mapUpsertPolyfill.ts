/**
 * Map and WeakMap `getOrInsert` and `getOrInsertComputed`, the TC39 "upsert"
 * methods, for engines that predate them (Chromium 141, for one). pdfjs-dist
 * 6.1.200 calls getOrInsertComputed in its display layer and in its worker
 * without a fallback, so every module that loads PDF.js imports this first.
 * Native methods are left in place.
 */

const { has: mapHas, get: mapGet, set: mapSet } = Map.prototype;
const {
  has: weakMapHas,
  get: weakMapGet,
  set: weakMapSet,
} = WeakMap.prototype;

function requireCallable(
  callbackfn: unknown,
): asserts callbackfn is (key: unknown) => unknown {
  if (typeof callbackfn !== "function") {
    throw new TypeError("getOrInsertComputed requires a callable callback");
  }
}

/** CanBeHeldWeakly: objects and symbols that are not registered. */
function requireWeakKey(key: unknown): asserts key is object {
  if (
    (typeof key !== "object" || key === null) &&
    typeof key !== "function" &&
    (typeof key !== "symbol" || Symbol.keyFor(key) !== undefined)
  ) {
    throw new TypeError("Invalid value used as weak map key");
  }
}

// Method shorthand gives the same shape as the built-ins: the right name,
// length 2, and no constructor. Each `has` call also rejects a receiver of
// the wrong type, as the specification's internal-slot check does.
export const mapUpsertMethods = {
  getOrInsert(this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (mapHas.call(this, key)) {
      return mapGet.call(this, key);
    }
    mapSet.call(this, key, value);
    return value;
  },
  getOrInsertComputed(
    this: Map<unknown, unknown>,
    key: unknown,
    callbackfn: unknown,
  ) {
    const present = mapHas.call(this, key);
    requireCallable(callbackfn);
    if (present) {
      return mapGet.call(this, key);
    }
    // CanonicalizeKeyedCollectionKey: the callback sees +0, never -0.
    const canonicalKey = key === 0 ? 0 : key;
    const value = callbackfn(canonicalKey);
    mapSet.call(this, canonicalKey, value);
    return value;
  },
};

export const weakMapUpsertMethods = {
  getOrInsert(this: WeakMap<object, unknown>, key: unknown, value: unknown) {
    const present = weakMapHas.call(this, key as object);
    requireWeakKey(key);
    if (present) {
      return weakMapGet.call(this, key);
    }
    weakMapSet.call(this, key, value);
    return value;
  },
  getOrInsertComputed(
    this: WeakMap<object, unknown>,
    key: unknown,
    callbackfn: unknown,
  ) {
    const present = weakMapHas.call(this, key as object);
    requireCallable(callbackfn);
    requireWeakKey(key);
    if (present) {
      return weakMapGet.call(this, key);
    }
    const value = callbackfn(key);
    weakMapSet.call(this, key, value);
    return value;
  },
};

function installMissing(prototype: object, methods: object) {
  for (const [name, method] of Object.entries(methods)) {
    if (!(name in prototype)) {
      Object.defineProperty(prototype, name, {
        value: method,
        writable: true,
        configurable: true,
      });
    }
  }
}

installMissing(Map.prototype, mapUpsertMethods);
installMissing(WeakMap.prototype, weakMapUpsertMethods);
