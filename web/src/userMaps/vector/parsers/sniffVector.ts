export type SniffedVectorType =
  | "geojson-candidate"
  | "zip"
  | "xml-candidate"
  | "unknown";

const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

/**
 * Content-based sniffing for user vector files, run only after the raster
 * sniffer (magic bytes) returns "unknown". Text formats have no magic bytes,
 * so this probes the first printable character instead: `{` can only start a
 * JSON document and `<` an XML one. "-candidate" because the real parser is
 * the authority — a `{` file may still fail to parse as GeoJSON.
 */
export function sniffVectorType(bytes: Uint8Array): SniffedVectorType {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "zip";
  }
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }
  while (i < bytes.length && WHITESPACE.has(bytes[i])) {
    i += 1;
  }
  if (i < bytes.length) {
    if (bytes[i] === 0x7b) return "geojson-candidate";
    if (bytes[i] === 0x3c) return "xml-candidate";
  }
  return "unknown";
}
