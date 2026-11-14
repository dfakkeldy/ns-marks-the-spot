import type { UserLayerKind } from "./types";

export function guessKind(url: string): UserLayerKind {
  if (/\{(?:z|x|-y|y)\}/i.test(url)) return /\{-y\}/i.test(url) ? "tms" : "xyz";
  if (/\/imageserver(?:\/|\?|$)/i.test(url)) return "arcgis-image";
  if (/\/mapserver\/wmsserver(?:\/|\?|$)/i.test(url) || /[?&]service=wms(?:&|$)/i.test(url)) return "wms";
  if (/\/mapserver(?:\/|\?|$)/i.test(url)) return "arcgis-map";
  return "wms";
}

export function validateLayerUrl(value: string, kind: UserLayerKind = guessKind(value)): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return "Use HTTPS, or HTTP for localhost.";
    try { decodeURIComponent(url.pathname); } catch { return "Address contains invalid encoding."; }
    if (url.username || url.password || url.hash) return "Addresses cannot contain credentials or fragments.";
    if ((kind === "arcgis-map" || kind === "arcgis-image") && /\/(?:mapserver|imageserver)\/\d+(?:\/|$)/i.test(url.pathname)) return "Use the service address and specify sublayers separately.";
    if ((kind === "xyz" || kind === "tms") && (!/\{z\}/i.test(value) || !/\{x\}/i.test(value) || !/\{(?:-y|y)\}/i.test(value))) return "Tile addresses need {z}, {x}, and {y} or {-y}.";
    if (/\{(?:switch:|q\})/i.test(value)) return "This tile template is not supported.";
    return null;
  } catch { return "Enter a valid address."; }
}

export function validateTermsUrl(value: string): string | null {
  if (!value.trim()) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? null : "Terms links must use HTTPS and contain no credentials."; }
  catch { return "Enter a valid terms link."; }
}

export function normalizeLayerUrl(value: string, kind: UserLayerKind): string {
  const trimmed = value.trim();
  if (kind !== "arcgis-map" && kind !== "arcgis-image") return trimmed;
  const url = new URL(trimmed);
  url.pathname = url.pathname.replace(/\/(MapServer|ImageServer)(?:\/.*)?$/i, "/$1");
  return url.toString();
}
export function hostOf(value: string): string { try { return new URL(value).host; } catch { return ""; } }
export function maskUrl(value: string): string {
  try {
    const url = new URL(value); url.username = ""; url.password = ""; url.hash = "";
    for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, "....");
    return url.toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  } catch { return "Invalid address"; }
}
