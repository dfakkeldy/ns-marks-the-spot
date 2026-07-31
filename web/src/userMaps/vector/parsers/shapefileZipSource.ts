import { strFromU8, unzip } from "fflate";
import proj4 from "proj4";
import shp from "shpjs";
import type { Feature, FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
import { normalizeCollection, type ParsedVector } from "./geojsonSource";

export type ParsedShapefileLayer = ParsedVector & { name: string; note?: string };

type ZipEntries = Record<string, Uint8Array>;

function unzipAsync(bytes: Uint8Array): Promise<ZipEntries> {
  return new Promise((resolve, reject) => {
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

function isContentEntry(name: string): boolean {
  return !name.includes("__MACOSX") && !(name.split("/").pop() ?? "").startsWith("._");
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Every `.shp` in the archive must be accompanied by a readable `.prj`.
 *
 * This gate runs BEFORE shpjs is handed anything, because shpjs's own
 * behaviour is the hazard: `parseShp(shp, prj)` builds a proj4 transform when
 * a `.prj` is present and otherwise passes the raw coordinates through
 * untouched — so a projected shapefile with no `.prj` silently arrives as if
 * its eastings and northings were already degrees, landing the layer in the
 * Gulf of Guinea rather than failing. Refusing here keeps that impossible.
 *
 * A `.prj` that proj4 cannot read is a different problem from an absent one
 * and gets its own code: the first asks the user to fix the projection, the
 * second to include one at all.
 */
function assertUsableProjections(entries: ZipEntries): string[] {
  const names = Object.keys(entries).filter(isContentEntry);
  const shapefiles = names.filter((name) => name.toLowerCase().endsWith(".shp"));
  if (shapefiles.length === 0) {
    throw new UserMapImportError(
      "unsupported-type",
      "This archive has no shapefile (.shp) in it.",
    );
  }
  for (const shapefile of shapefiles) {
    const stem = shapefile.slice(0, -4);
    const prj = names.find((name) => name.toLowerCase() === `${stem.toLowerCase()}.prj`);
    if (!prj) {
      throw new UserMapImportError(
        "missing-crs",
        `"${baseName(stem)}" does not say what coordinate system it uses — its ` +
          ".prj file is missing. Re-export the shapefile with all of its " +
          "sidecar files and import it again.",
      );
    }
    try {
      proj4(strFromU8(entries[prj]));
    } catch {
      throw new UserMapImportError(
        "unsupported-crs",
        `The coordinate system in "${baseName(prj)}" could not be read. ` +
          "Re-export the shapefile in NAD83 UTM (EPSG:26920) or WGS84.",
      );
    }
  }
  return shapefiles;
}

type ShpResult = FeatureCollection & { fileName?: string };

function layerName(result: ShpResult, index: number, shapefiles: string[]): string {
  if (typeof result.fileName === "string" && result.fileName.length > 0) {
    return baseName(result.fileName);
  }
  const fallback = shapefiles[index];
  return fallback ? baseName(fallback.slice(0, -4)) : `layer-${index + 1}`;
}

/**
 * Reads every shapefile in a zip archive as its own layer. One `.shp` is one
 * layer: a multi-layer archive that collapsed into a single collection would
 * mix unrelated feature sets under one name and one style.
 */
export async function parseShapefileZip(
  buffer: ArrayBuffer,
): Promise<ParsedShapefileLayer[]> {
  const bytes = new Uint8Array(buffer);
  const entries = await unzipAsync(bytes);
  const shapefiles = assertUsableProjections(entries);

  let parsed: ShpResult | ShpResult[];
  try {
    parsed = (await shp(bytes.slice().buffer as ArrayBuffer)) as ShpResult | ShpResult[];
  } catch (error) {
    if (error instanceof UserMapImportError) {
      throw error;
    }
    throw new UserMapImportError(
      "corrupt-file",
      "Couldn't read the shapefile inside this archive.",
    );
  }

  const results = Array.isArray(parsed) ? parsed : [parsed];
  return results.map((result, index) => {
    const name = layerName(result, index, shapefiles);
    const features = (result.features ?? []) as Feature[];
    // shpjs gives every feature `{}` properties when the .dbf is absent;
    // saying so is more useful than an unexplained set of blank popups.
    const hasAttributes = features.some(
      (feature) => Object.keys(feature.properties ?? {}).length > 0,
    );
    return {
      ...normalizeCollection(features),
      name,
      note: hasAttributes
        ? undefined
        : "No attribute table (.dbf) came with this shapefile, so its features have no details.",
    };
  });
}
