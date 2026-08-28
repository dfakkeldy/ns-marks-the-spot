import { UserMapImportError } from "../errors";
import type { ParsedGeoTiff } from "./geoTiffSource";
import type { WorkerReply } from "./geoTiffWorker";
import { raceWithWatchdog } from "./workerWatchdog";

/**
 * Decode off the main thread when the browser can (spec requirement: the UI
 * never blocks on a parse). jsdom and pre-16.4 Safari lack Worker-side
 * OffscreenCanvas 2D, so those fall back to the main-thread DOM-canvas path.
 */
export function parseGeoTiffAuto(buffer: ArrayBuffer): Promise<ParsedGeoTiff> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    // Dynamic on purpose: this fallback exists for jsdom and pre-16.4 Safari,
    // and a static import here was one of the two chains hauling the geotiff
    // decoder into the entry chunk for every visitor.
    return import("./geoTiffSource").then(({ parseGeoTiff }) =>
      parseGeoTiff(buffer),
    );
  }
  const worker = new Worker(new URL("./geoTiffWorker.ts", import.meta.url), {
    type: "module",
  });
  const reply = new Promise<ParsedGeoTiff>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new UserMapImportError(event.data.code, event.data.userMessage));
      }
    };
    worker.onerror = () => {
      reject(
        new UserMapImportError(
          "corrupt-file",
          "Something went wrong reading this file.",
        ),
      );
    };
    // Transfer, don't copy: the buffer is not reused by the caller.
    worker.postMessage(buffer, [buffer]);
  });
  // The watchdog covers the third outcome the two events cannot: a worker
  // the OS killed (decode OOM on a huge raster is expected here) dies
  // silently, and this promise used to stay pending forever.
  return raceWithWatchdog(reply).finally(() => worker.terminate());
}
