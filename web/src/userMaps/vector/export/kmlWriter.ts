import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { FIELD_CAPTURE_SPEC } from "../../../location/captureSpec";
import {
  PHOTOS_PROPERTY,
  readPhotoDescriptors,
  type FeaturePhotoDescriptor,
} from "../photos/types";
import { TRACED_PROVENANCE_NOTE, hasTracedFeatures } from "./tracedProvenance";

/**
 * The KMZ photo profile (field-capture contract): descriptors gain a
 * required href (`files/<id>.jpg`) in ExtendedData, and the description
 * becomes a CDATA section carrying the user's text plus one viewer-facing
 * `<img>` per photo so Google Earth renders them from the archive. Plain
 * KML omits both — a lone .kml must never dangle photo references.
 */
export type KmlPhotoMode = "omit" | "kmz";

function kmzHref(descriptor: FeaturePhotoDescriptor): string {
  return `${FIELD_CAPTURE_SPEC.kmz.photoDir}${descriptor.id}.jpg`;
}

const KML_NS = "http://www.opengis.net/kml/2.2";

/**
 * KML positions are `lon,lat[,alt]` separated by whitespace — the same axis
 * order as GeoJSON, unlike most of the rest of the geospatial world.
 */
function positionText(position: Position): string {
  const [lon, lat, alt] = position;
  return typeof alt === "number" ? `${lon},${lat},${alt}` : `${lon},${lat}`;
}

function coordinatesText(positions: Position[]): string {
  return positions.map(positionText).join(" ");
}

function element(doc: Document, name: string, text?: string): Element {
  const node = doc.createElementNS(KML_NS, name);
  if (text !== undefined) {
    // textContent, not markup: the serializer escapes it structurally, so a
    // description containing `<script>` leaves as text and can never become
    // live markup in whatever tool opens the file.
    node.textContent = text;
  }
  return node;
}

function linearRing(doc: Document, positions: Position[]): Element {
  const ring = element(doc, "LinearRing");
  ring.append(element(doc, "coordinates", coordinatesText(positions)));
  return ring;
}

function polygon(doc: Document, rings: Position[][]): Element {
  const node = element(doc, "Polygon");
  const [outer, ...inners] = rings;
  if (outer) {
    const outerBoundary = element(doc, "outerBoundaryIs");
    outerBoundary.append(linearRing(doc, outer));
    node.append(outerBoundary);
  }
  for (const inner of inners) {
    const innerBoundary = element(doc, "innerBoundaryIs");
    innerBoundary.append(linearRing(doc, inner));
    node.append(innerBoundary);
  }
  return node;
}

/** Returns null for geometry KML has no representation for. */
function geometryElement(doc: Document, geometry: Geometry): Element | null {
  switch (geometry.type) {
    case "Point": {
      const node = element(doc, "Point");
      node.append(element(doc, "coordinates", positionText(geometry.coordinates)));
      return node;
    }
    case "LineString": {
      const node = element(doc, "LineString");
      node.append(element(doc, "coordinates", coordinatesText(geometry.coordinates)));
      return node;
    }
    case "Polygon":
      return polygon(doc, geometry.coordinates);
    case "MultiPoint":
    case "MultiLineString":
    case "MultiPolygon": {
      // KML has no Multi* primitives — a MultiGeometry holding one child per
      // part is the spec's equivalent, and what togeojson reads back.
      const node = element(doc, "MultiGeometry");
      const parts: Geometry[] =
        geometry.type === "MultiPoint"
          ? geometry.coordinates.map((c) => ({ type: "Point", coordinates: c }))
          : geometry.type === "MultiLineString"
            ? geometry.coordinates.map((c) => ({ type: "LineString", coordinates: c }))
            : geometry.coordinates.map((c) => ({ type: "Polygon", coordinates: c }));
      for (const part of parts) {
        const child = geometryElement(doc, part);
        if (child) {
          node.append(child);
        }
      }
      return node;
    }
    case "GeometryCollection": {
      const node = element(doc, "MultiGeometry");
      for (const part of geometry.geometries) {
        const child = geometryElement(doc, part);
        if (child) {
          node.append(child);
        }
      }
      return node;
    }
    default:
      return null;
  }
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * ExtendedData carries every property except the ones with their own KML
 * homes (`name`, `description`), togeojson's per-vertex `coordinateProperties`
 * (times are a GPX/GeoJSON concern per the field-capture contract), and
 * `nsmts:photos` (whose KMZ form arrives with the photo work; a plain KML
 * must not carry dangling photo references). All other `nsmts:` keys ARE
 * written — a parcel-traced or recorded feature keeps its provenance through
 * a KML round trip. KML is string-typed: numbers and booleans stringify, and
 * objects ride as JSON text; GeoJSON stays the type-faithful format.
 */
const EXTENDED_DATA_EXCLUDED = new Set([
  "name",
  "description",
  "coordinateProperties",
  PHOTOS_PROPERTY,
]);

function extendedData(
  doc: Document,
  props: Record<string, unknown>,
  kmzDescriptors: FeaturePhotoDescriptor[] | null,
): Element | null {
  const entries = Object.entries(props).filter(
    ([key, value]) =>
      !EXTENDED_DATA_EXCLUDED.has(key) && value !== null && value !== undefined,
  );
  if (entries.length === 0 && (!kmzDescriptors || kmzDescriptors.length === 0)) {
    return null;
  }
  const node = element(doc, "ExtendedData");
  for (const [key, value] of entries) {
    const data = element(doc, "Data");
    data.setAttribute("name", key);
    data.append(
      element(
        doc,
        "value",
        typeof value === "string"
          ? value
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
      ),
    );
    node.append(data);
  }
  if (kmzDescriptors && kmzDescriptors.length > 0) {
    const data = element(doc, "Data");
    data.setAttribute("name", PHOTOS_PROPERTY);
    data.append(
      element(
        doc,
        "value",
        JSON.stringify(
          kmzDescriptors.map((descriptor) => ({
            ...descriptor,
            href: kmzHref(descriptor),
          })),
        ),
      ),
    );
    node.append(data);
  }
  return node;
}

function placemark(
  doc: Document,
  feature: Feature,
  photoMode: KmlPhotoMode,
): Element | null {
  if (!feature.geometry) {
    return null;
  }
  const geometry = geometryElement(doc, feature.geometry);
  if (!geometry) {
    return null;
  }
  const node = element(doc, "Placemark");
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const descriptors =
    photoMode === "kmz" ? readPhotoDescriptors(props) : [];
  const name = asText(props.name);
  if (name) {
    node.append(element(doc, "name", name));
  }
  const description = asText(props.description);
  if (descriptors.length > 0) {
    // CDATA per the contract profile: the user's text, a blank line, then
    // one viewer-facing img per photo. Import strips exactly the img tags
    // whose src begins with the photo directory.
    const imgTags = descriptors
      .map(
        (descriptor) =>
          `<img src="${kmzHref(descriptor)}" width="${FIELD_CAPTURE_SPEC.kmz.descriptionImgWidth}"/>`,
      )
      .join("");
    const descriptionNode = element(doc, "description");
    descriptionNode.append(
      doc.createCDATASection(
        `${description ? `${description}\n\n` : ""}${imgTags}`,
      ),
    );
    node.append(descriptionNode);
  } else if (description) {
    node.append(element(doc, "description", description));
  }
  const data = extendedData(doc, props, photoMode === "kmz" ? descriptors : null);
  if (data) {
    node.append(data);
  }
  node.append(geometry);
  return node;
}

/**
 * Hand-written rather than dependency-based: the approved libraries cover
 * import only, and `allmaps/annotation.ts` sets the precedent for a small
 * hand-written serializer. Built through the DOM and `XMLSerializer` instead
 * of string concatenation so escaping is structural — there is no code path
 * where user text can be emitted unescaped, which string templates would
 * make one bad interpolation away.
 *
 * Styling is deliberately not written back: simplestyle properties survive
 * in the GeoJSON export, and a wrong `<Style>` block would misrepresent the
 * layer in a consuming tool more than an absent one does.
 */
export function kmlDocumentString(
  layerName: string,
  collection: FeatureCollection,
  photoMode: KmlPhotoMode = "omit",
): string {
  const doc = document.implementation.createDocument(KML_NS, "kml", null);
  const documentNode = element(doc, "Document");
  documentNode.append(element(doc, "name", layerName));
  if (hasTracedFeatures(collection)) {
    documentNode.append(element(doc, "description", TRACED_PROVENANCE_NOTE));
  }
  for (const feature of collection.features) {
    const node = placemark(doc, feature, photoMode);
    if (node) {
      documentNode.append(node);
    }
  }
  doc.documentElement.append(documentNode);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}`;
}

export function kmlExportBlob(
  layerName: string,
  collection: FeatureCollection,
): Blob {
  return new Blob([kmlDocumentString(layerName, collection)], {
    type: "application/vnd.google-earth.kml+xml",
  });
}
