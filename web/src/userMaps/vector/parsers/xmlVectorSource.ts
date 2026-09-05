import { UserMapImportError } from "../../errors";
import type { ParsedVector } from "./geojsonSource";
import { parseGpx } from "./gpxSource";
import { parseKml } from "./kmlSource";
import { parseXmlDocument } from "./xmlDocument";
import type { UserVectorSource } from "../types";

export type ParsedXmlVector = ParsedVector & { source: UserVectorSource };

/**
 * Routes an XML document by its root element rather than by namespace: real
 * exports from consumer GPS units and older desktop tools frequently omit or
 * misspell the namespace, and refusing those would fail files that are
 * otherwise perfectly readable.
 */
export function parseXmlVector(text: string): ParsedXmlVector {
  const document = parseXmlDocument(text);
  const root = document.documentElement?.localName?.toLowerCase();
  if (root === "kml") {
    return { ...parseKml(document), source: "kml" };
  }
  if (root === "gpx") {
    return { ...parseGpx(document), source: "gpx" };
  }
  throw new UserMapImportError(
    "unsupported-type",
    "This XML file isn't KML or GPX — those are the XML map formats this map reads.",
  );
}
