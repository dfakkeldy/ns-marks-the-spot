import { UserMapImportError } from "../../errors";

/**
 * DOMParser never throws on bad XML — it returns a document whose root is a
 * `<parsererror>` element instead, so the failure has to be detected rather
 * than caught. Main thread by necessity: DOMParser does not exist in a
 * worker (the text parsers in `parsers/fletcherGcps.ts` set the precedent).
 */
export function parseXmlDocument(text: string): Document {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) {
    throw new UserMapImportError(
      "corrupt-file",
      "Couldn't read this file — the XML inside it is malformed.",
    );
  }
  return parsed;
}
