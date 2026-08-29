import type { LiveFix } from "./liveLocation";

const GPX_NS = "http://www.topografix.com/GPX/1/1";
/** Namespace for the accuracy extension both surfaces write and ignore. */
const NSMTS_NS = "urn:nsmts:gpx:1";

/**
 * The raw recording as GPX 1.1: every fix received while recording, kept and
 * dropped alike, one `<trkseg>` per recording segment, with per-point time,
 * elevation when the fix had one, and reported accuracy in `<extensions>`.
 * This document becomes the recorded layer's original file — the unprocessed
 * evidence behind the filtered geometry. DOM-built like kmlWriter.ts so
 * escaping stays structural.
 */
export function rawTrackGpxString(
  name: string,
  rawSegments: readonly (readonly LiveFix[])[],
): string {
  const doc = document.implementation.createDocument(GPX_NS, "gpx", null);
  const root = doc.documentElement;
  root.setAttribute("version", "1.1");
  root.setAttribute("creator", "NS Marks The Spot");

  const element = (tag: string, text?: string): Element => {
    const node = doc.createElementNS(GPX_NS, tag);
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };

  const trk = element("trk");
  trk.append(element("name", name));
  for (const segment of rawSegments) {
    const trkseg = element("trkseg");
    for (const fix of segment) {
      const trkpt = element("trkpt");
      trkpt.setAttribute("lat", String(fix.latitude));
      trkpt.setAttribute("lon", String(fix.longitude));
      if (fix.altitudeM !== null) {
        trkpt.append(element("ele", String(fix.altitudeM)));
      }
      trkpt.append(element("time", new Date(fix.timestampMs).toISOString()));
      const extensions = element("extensions");
      const accuracy = doc.createElementNS(NSMTS_NS, "nsmts:accuracyM");
      accuracy.textContent = String(fix.accuracyM);
      extensions.append(accuracy);
      trkpt.append(extensions);
      trkseg.append(trkpt);
    }
    trk.append(trkseg);
  }
  root.append(trk);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}`;
}

export function rawTrackGpxBlob(
  name: string,
  rawSegments: readonly (readonly LiveFix[])[],
): Blob {
  return new Blob([rawTrackGpxString(name, rawSegments)], {
    type: "application/gpx+xml",
  });
}
