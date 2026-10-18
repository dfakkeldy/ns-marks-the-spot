/// <reference lib="webworker" />
import { UserMapImportError } from "../../errors";
import {
  parseShapefileZip,
  type ParsedShapefileLayer,
} from "./shapefileZipSource";

export type ShapefileWorkerReply =
  | { ok: true; layers: ParsedShapefileLayer[] }
  | { ok: false; code: UserMapImportError["code"]; userMessage: string };

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const layers = await parseShapefileZip(event.data);
    self.postMessage({ ok: true, layers } satisfies ShapefileWorkerReply);
  } catch (error) {
    const reply: ShapefileWorkerReply =
      error instanceof UserMapImportError
        ? { ok: false, code: error.code, userMessage: error.userMessage }
        : {
            ok: false,
            code: "corrupt-file",
            userMessage: "Something went wrong reading this file.",
          };
    self.postMessage(reply);
  }
};
