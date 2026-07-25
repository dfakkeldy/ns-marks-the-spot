import { UserMapImportError } from "../errors";
import { parseGeoTiff, type ParsedGeoTiff } from "./geoTiffSource";
import type { WorkerReply } from "./geoTiffWorker";

/**
 * Decode off the main thread when the browser can (spec requirement: the UI
 * never blocks on a parse). jsdom and pre-16.4 Safari lack Worker-side
 * OffscreenCanvas 2D, so those fall back to the main-thread DOM-canvas path.
 */
export function parseGeoTiffAuto(buffer: ArrayBuffer): Promise<ParsedGeoTiff> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return parseGeoTiff(buffer);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./geoTiffWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.parsed);
      } else {
        reject(new UserMapImportError(event.data.code, event.data.userMessage));
      }
    };
    worker.onerror = () => {
      worker.terminate();
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
}
