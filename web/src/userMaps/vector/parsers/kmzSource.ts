import { strFromU8, unzip } from "fflate";
import { UserMapImportError } from "../../errors";
import type { ParsedVector } from "./geojsonSource";
import { parseKml } from "./kmlSource";
import { classifyZipEntries, type ZipKind } from "./sniffVector";

type ZipEntries = Record<string, Uint8Array>;

function unzipAsync(bytes: Uint8Array): Promise<ZipEntries> {
  return new Promise((resolve, reject) => {
    // fflate's async unzip runs the inflate off the main thread in its own
    // worker, so a large archive never blocks the UI.
    unzip(bytes, (error, entries) => {
      if (error) {
        reject(
          new UserMapImportError(
            "corrupt-file",
            "Couldn't open this archive — the file appears to be damaged.",
          ),
        );
        return;
      }
      resolve(entries);
    });
  });
}

/**
 * Picks the KML document out of a KMZ archive. `doc.kml` at the root is the
 * conventional name Google Earth writes, but exports from other tools name
 * it after the map, so any single `.kml` entry is accepted as a fallback.
 * Overlay images and other payloads inside the archive are ignored — this
 * phase imports the vector content only.
 */
export async function extractKmzDocument(buffer: ArrayBuffer): Promise<string> {
  const entries = await unzipAsync(new Uint8Array(buffer));
  const names = Object.keys(entries);
  const rootDoc = names.find((name) => name.toLowerCase() === "doc.kml");
  const anyKml = names.find((name) => name.toLowerCase().endsWith(".kml"));
  const chosen = rootDoc ?? anyKml;
  if (!chosen) {
    throw new UserMapImportError(
      "corrupt-file",
      "This archive has no KML file inside it.",
    );
  }
  return strFromU8(entries[chosen]);
}

export async function parseKmz(buffer: ArrayBuffer): Promise<ParsedVector> {
  return parseKml(await extractKmzDocument(buffer));
}

/**
 * Distinguishes a KMZ from the other zip a user may drop — a zipped
 * shapefile. Both share the same magic bytes, so only the entry names can
 * tell them apart, and each needs a different reader.
 */
export async function classifyArchive(buffer: ArrayBuffer): Promise<ZipKind> {
  try {
    const entries = await unzipAsync(new Uint8Array(buffer));
    return classifyZipEntries(Object.keys(entries));
  } catch {
    // An unreadable archive belongs to neither reader; the caller's own path
    // reports the failure.
    return "unknown-zip";
  }
}
