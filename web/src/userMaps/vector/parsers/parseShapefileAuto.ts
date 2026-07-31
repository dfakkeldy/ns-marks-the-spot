import { UserMapImportError } from "../../errors";
import {
  parseShapefileZip,
  type ParsedShapefileLayer,
} from "./shapefileZipSource";
import type { ShapefileWorkerReply } from "./shapefileWorker";

/**
 * Decode off the main thread when the browser can: inflating an archive and
 * walking every vertex through a proj4 transform is the heaviest parse in
 * this subsystem. jsdom has no Worker, so tests exercise the main-thread
 * path — the same shape as `parsers/parseInWorker.ts`.
 */
export function parseShapefileAuto(
  buffer: ArrayBuffer,
): Promise<ParsedShapefileLayer[]> {
  if (typeof Worker === "undefined") {
    return parseShapefileZip(buffer);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./shapefileWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<ShapefileWorkerReply>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.layers);
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
