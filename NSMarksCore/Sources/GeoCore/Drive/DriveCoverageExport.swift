import Foundation

/// Combines app-recorded raw GPX legs into one track per trip.
public enum DriveCoverageExport {
    public struct Trip: Sendable {
        public var name: String
        public var legs: [Data]
        public init(name: String, legs: [Data]) { self.name = name; self.legs = legs }
    }
    public enum Refusal: Error { case malformed }

    public static func gpx(_ trips: [Trip]) throws -> String {
        var tracks = ""
        for trip in trips {
            var segments = ""
            for data in trip.legs {
                try VectorExport.requireOriginalReproduction(data, filename: "track.gpx")
                let root = try XmlTree.parse(data)
                let tracks = root.children(named: "trk")
                guard root.name == "gpx", tracks.count == 1 else { throw Refusal.malformed }
                for segment in tracks[0].children(named: "trkseg") {
                    segments += "<trkseg>"
                    for point in segment.children(named: "trkpt") {
                        guard let latitude = point.attributes["lat"].flatMap(Double.init), latitude.isFinite, (-90...90).contains(latitude),
                              let longitude = point.attributes["lon"].flatMap(Double.init), longitude.isFinite, (-180...180).contains(longitude),
                              let time = point.firstChild(named: "time")?.trimmedText, CaptureTime.parse(time) != nil else { throw Refusal.malformed }
                        segments += "<trkpt lat=\"\(latitude)\" lon=\"\(longitude)\">"
                        if let elevation = point.firstChild(named: "ele")?.trimmedText {
                            guard let value = Double(elevation), value.isFinite else { throw Refusal.malformed }
                            segments += "<ele>\(value)</ele>"
                        }
                        segments += "<time>\(VectorExport.escaped(time))</time>"
                        if let accuracy = point.firstChild(named: "extensions")?.firstChild(named: "accuracyM")?.trimmedText {
                            guard let value = Double(accuracy), value.isFinite else { throw Refusal.malformed }
                            segments += "<extensions><nsmts:accuracyM>\(value)</nsmts:accuracyM></extensions>"
                        }
                        segments += "</trkpt>"
                    }
                    segments += "</trkseg>"
                }
            }
            guard !segments.isEmpty else { throw Refusal.malformed }
            tracks += "<trk><name>\(VectorExport.escaped(trip.name))</name>\(segments)</trk>"
        }
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><gpx xmlns=\"http://www.topografix.com/GPX/1/1\" xmlns:nsmts=\"urn:nsmts:gpx:1\" version=\"1.1\" creator=\"NS Marks The Spot\">\(tracks)</gpx>"
    }
}
