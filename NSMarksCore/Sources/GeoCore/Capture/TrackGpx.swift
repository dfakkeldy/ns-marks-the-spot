import Foundation

/// The raw recording as GPX 1.1: every fix received while recording, kept and
/// dropped alike, one `<trkseg>` per recording segment, with per-point time,
/// elevation when the fix had one, and reported accuracy in `<extensions>`.
/// This document becomes the recorded layer's original file — the unprocessed
/// evidence behind the filtered geometry. String-built like
/// `VectorExport.kml`, with the same total escaping discipline; the
/// round-trip through `GpxParse` is pinned by test.
/// Mirrors `web/src/location/rawTrackGpx.ts`.
public enum TrackGpx {
    static let gpxNamespace = "http://www.topografix.com/GPX/1/1"
    /// Namespace for the accuracy extension both surfaces write and ignore.
    static let nsmtsNamespace = "urn:nsmts:gpx:1"

    public static func rawGpx(name: String, rawSegments: [[TrackFix]]) -> String {
        var body = "<trk><name>\(VectorExport.escaped(name))</name>"
        for segment in rawSegments {
            body += "<trkseg>"
            for fix in segment {
                body += "<trkpt lat=\"\(fix.latitude)\" lon=\"\(fix.longitude)\">"
                if let altitude = fix.altitudeM {
                    body += "<ele>\(altitude)</ele>"
                }
                body += "<time>\(CaptureTime.iso(fix.timestamp))</time>"
                body += "<extensions><nsmts:accuracyM>\(fix.accuracyM)"
                body += "</nsmts:accuracyM></extensions>"
                body += "</trkpt>"
            }
            body += "</trkseg>"
        }
        body += "</trk>"
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx xmlns="\(gpxNamespace)" xmlns:nsmts="\(nsmtsNamespace)" \
            version="1.1" creator="NS Marks The Spot">\(body)</gpx>
            """
    }
}
