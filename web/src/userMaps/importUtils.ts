/** Shared by the raster (useUserMaps) and vector (useUserVectorLayers) imports. */

export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * `crypto.randomUUID()` only exists in a secure context (HTTPS or
 * localhost). It's undefined on a plain `http://192.168.x.x:5173` dev
 * server — exactly how this app gets tested on a phone over the LAN — so
 * calling it unconditionally makes every import fail there, after a full
 * parse, with a generic error. `crypto.getRandomValues` has no such
 * restriction, so it's the fallback; ids only need to be unique within this
 * device's store, so RFC 4122 shape doesn't matter.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
