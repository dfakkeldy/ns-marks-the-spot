import { strFromU8, unzip } from "fflate";
import { UserMapImportError } from "../../errors";
import type { ParsedVector } from "./geojsonSource";
import { parseKml } from "./kmlSource";
import { parseXmlDocument } from "./xmlDocument";
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

export type ParsedKmzWithAssets = {
  parsed: ParsedVector;
  /** Non-KML archive entries, keyed by LOWERCASED entry name. */
  assets: Map<string, Uint8Array>;
};

/**
 * KMZ parse that keeps the archive's other entries — the photo bytes a
 * field-capture KMZ carries under `files/`. Names are lowercased for the
 * case-insensitive href resolution the interchange profile requires (KMZs
 * edited by other tools do not preserve case reliably).
 */
export async function parseKmzWithAssets(
  buffer: ArrayBuffer,
): Promise<ParsedKmzWithAssets> {
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
  const assets = new Map<string, Uint8Array>();
  for (const name of names) {
    if (name !== chosen) {
      assets.set(name.toLowerCase(), entries[name]);
    }
  }
  return { parsed: parseKml(parseXmlDocument(strFromU8(entries[chosen]))), assets };
}

/**
 * Distinguishes a KMZ from the other zip a user may drop — a zipped
 * shapefile. Both share the same magic bytes, so only the entry names can
 * tell them apart, and each needs a different reader.
 */
export function classifyArchive(buffer: ArrayBuffer): Promise<ZipKind> {
  return new Promise((resolve) => {
    const names: string[] = [];
    // fflate visits the central directory before deciding which entries to
    // inflate. Classification needs names only, especially for photo KMZs.
    unzip(new Uint8Array(buffer), {
      filter: ({ name }) => {
        names.push(name);
        return false;
      },
    }, (error) => {
      resolve(error ? "unknown-zip" : classifyZipEntries(names));
    });
  });
}
