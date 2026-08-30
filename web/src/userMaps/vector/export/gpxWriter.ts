import type { Feature, FeatureCollection, Position } from "geojson";
import { TRACED_PROVENANCE_NOTE, hasTracedFeatures } from "./tracedProvenance";

const GPX_NS = "http://www.topografix.com/GPX/1/1";

/**
 * GPX 1.1 export of a user layer: Points become waypoints, LineStrings become
 * tracks (a MultiLineString is one track with a trkseg per part), and
 * per-vertex timestamps come from the togeojson `coordinateProperties.times`
 * convention — the same shape recorded tracks and GPX imports already carry,
 * so a field recording round-trips out with its times intact. Times are
 * emitted only when the array length matches the coordinates; a mismatch is
 * omitted, never padded — fabricated timestamps would be worse than none.
 * Polygons are skipped: GPX has no area primitive, and the export button
 * says so. DOM-built like kmlWriter.ts so escaping stays structural.
 */

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function props(feature: Feature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

/** Per-segment times arrays, normalized; null when absent or malformed. */
function segmentTimes(feature: Feature, segmentCount: number): string[][] | null {
  const coordinateProperties = props(feature).coordinateProperties;
  if (!coordinateProperties || typeof coordinateProperties !== "object") {
    return null;
  }
  const times = (coordinateProperties as { times?: unknown }).times;
  if (!Array.isArray(times)) {
    return null;
  }
  const nested = segmentCount === 1 && typeof times[0] === "string"
    ? [times]
    : times;
  if (!Array.isArray(nested) || nested.length !== segmentCount) {
    return null;
  }
  return nested.every(
    (segment) =>
      Array.isArray(segment) &&
      segment.every((entry) => typeof entry === "string"),
  )
    ? (nested as string[][])
    : null;
}

export function gpxDocumentString(
  layerName: string,
  collection: FeatureCollection,
): string {
  const doc = document.implementation.createDocument(GPX_NS, "gpx", null);
  const root = doc.documentElement;
  root.setAttribute("version", "1.1");
  root.setAttribute("creator", "NS Marks The Spot");

  const element = (tag: string, text?: string): Element => {
    const node = doc.createElementNS(GPX_NS, tag);
    if (text !== undefined) {
      // textContent, not markup: the serializer escapes structurally, so a
      // description containing `<script>` leaves as text.
      node.textContent = text;
    }
    return node;
  };

  const metadata = element("metadata");
  metadata.append(element("name", layerName));
  if (hasTracedFeatures(collection)) {
    metadata.append(element("desc", TRACED_PROVENANCE_NOTE));
  }
  root.append(metadata);

  // GPX 1.1 is order-strict: inside wpt/trkpt, ele then time then name/desc;
  // inside trk, name/desc before the trksegs.
  const waypoint = (position: Position, feature: Feature): Element => {
    const [lon, lat, ele] = position;
    const wpt = element("wpt");
    wpt.setAttribute("lat", String(lat));
    wpt.setAttribute("lon", String(lon));
    if (typeof ele === "number") {
      wpt.append(element("ele", String(ele)));
    }
    const capturedAt = asText(props(feature)["nsmts:capturedAt"]);
    if (capturedAt) {
      wpt.append(element("time", capturedAt));
    }
    const name = asText(props(feature).name);
    if (name) {
      wpt.append(element("name", name));
    }
    const description = asText(props(feature).description);
    if (description) {
      wpt.append(element("desc", description));
    }
    return wpt;
  };

  const trackPoint = (position: Position, time: string | undefined): Element => {
    const [lon, lat, ele] = position;
    const trkpt = element("trkpt");
    trkpt.setAttribute("lat", String(lat));
    trkpt.setAttribute("lon", String(lon));
    if (typeof ele === "number") {
      trkpt.append(element("ele", String(ele)));
    }
    if (time !== undefined) {
      trkpt.append(element("time", time));
    }
    return trkpt;
  };

  const track = (segments: Position[][], feature: Feature): Element => {
    const trk = element("trk");
    const name = asText(props(feature).name);
    if (name) {
      trk.append(element("name", name));
    }
    const description = asText(props(feature).description);
    if (description) {
      trk.append(element("desc", description));
    }
    const times = segmentTimes(feature, segments.length);
    segments.forEach((positions, segmentIndex) => {
      const trkseg = element("trkseg");
      const segmentTimeList =
        times && times[segmentIndex].length === positions.length
          ? times[segmentIndex]
          : null;
      positions.forEach((position, index) => {
        trkseg.append(trackPoint(position, segmentTimeList?.[index]));
      });
      trk.append(trkseg);
    });
    return trk;
  };

  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) {
      continue;
    }
    switch (geometry.type) {
      case "Point":
        root.append(waypoint(geometry.coordinates, feature));
        break;
      case "MultiPoint":
        for (const position of geometry.coordinates) {
          root.append(waypoint(position, feature));
        }
        break;
      case "LineString":
        root.append(track([geometry.coordinates], feature));
        break;
      case "MultiLineString":
        root.append(track(geometry.coordinates, feature));
        break;
      default:
        // Polygons and geometry collections have no GPX form; the export
        // button's label carries the caveat.
        break;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}`;
}

export function gpxExportBlob(
  layerName: string,
  collection: FeatureCollection,
): Blob {
  return new Blob([gpxDocumentString(layerName, collection)], {
    type: "application/gpx+xml",
  });
}
