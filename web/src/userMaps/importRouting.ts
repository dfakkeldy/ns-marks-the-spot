import { sniffFileType } from "./parsers/sniff";
import { sniffVectorType } from "./vector/parsers/sniffVector";

export type RoutedImportFiles = { raster: File[]; vector: File[] };

/**
 * The shared drop zone's dispatcher: content decides the pipeline, never the
 * extension. Raster magic bytes win first (they are exact signatures); the
 * vector probes run only on what's left. Unrecognized files go to the raster
 * pipeline on purpose — its outcome machinery already owns the "not a
 * recognized file" message, so every file gets reported exactly once.
 *
 * Only the head of each file is read here; the pipelines re-read the full
 * bytes themselves.
 */
export async function routeImportFiles(
  files: ArrayLike<File>,
): Promise<RoutedImportFiles> {
  const raster: File[] = [];
  const vector: File[] = [];
  for (const file of Array.from(files)) {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (sniffFileType(head.subarray(0, 16)) !== "unknown") {
      raster.push(file);
    } else if (sniffVectorType(head) !== "unknown") {
      vector.push(file);
    } else {
      raster.push(file);
    }
  }
  return { raster, vector };
}
