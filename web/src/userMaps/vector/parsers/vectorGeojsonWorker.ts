/// <reference lib="webworker" />
import { UserMapImportError } from "../../errors";
import { parseGeoJson, type ParsedVector } from "./geojsonSource";

export type VectorWorkerReply =
  | { ok: true; parsed: ParsedVector }
  | { ok: false; code: UserMapImportError["code"]; userMessage: string };

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    // TextDecoder strips a UTF-8 BOM, which JSON.parse would choke on.
    const parsed = parseGeoJson(new TextDecoder().decode(event.data));
    self.postMessage({ ok: true, parsed } satisfies VectorWorkerReply);
  } catch (error) {
    const reply: VectorWorkerReply =
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
