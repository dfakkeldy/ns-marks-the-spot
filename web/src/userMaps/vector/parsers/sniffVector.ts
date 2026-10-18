export type SniffedVectorType =
  | "geojson-candidate"
  | "zip"
  | "xml-candidate"
  | "unknown";

export type ZipKind = "kmz" | "shapefile" | "unknown-zip";

/**
 * A KMZ and a zipped shapefile are both zip archives with identical magic
 * bytes, so only the entry names can tell them apart — and the two need
 * different messages when neither applies.
 *
 * `__MACOSX` resource forks are skipped: zipping a folder on macOS adds
 * mirror entries (`__MACOSX/._parcels.shp`) that would otherwise classify an
 * archive by a file it does not actually contain. shpjs skips them for the
 * same reason.
 */
export function classifyZipEntries(names: string[]): ZipKind {
  const content = names.filter(
    (name) => !name.includes("__MACOSX") && !name.split("/").pop()?.startsWith("._"),
  );
  const hasExtension = (extension: string) =>
    content.some((name) => name.toLowerCase().endsWith(extension));
  if (hasExtension(".kml")) {
    return "kmz";
  }
  if (hasExtension(".shp")) {
    return "shapefile";
  }
  return "unknown-zip";
}

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
