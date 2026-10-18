import Foundation
import Testing

@testable import GeoCore

@Suite("Georeference annotation")
struct GeoreferenceAnnotationTests {
    private static let points = [
        SessionControlPoint(
            id: "gcp-1", pixel: PixelPoint(x: 120, y: 340),
            map: GeoPoint(lat: 46.353_788, lng: -61.387_588)
        ),
        SessionControlPoint(
            id: "gcp-2", pixel: PixelPoint(x: 1800, y: 300),
            map: GeoPoint(lat: 46.361_2, lng: -61.301_4)
        ),
        SessionControlPoint(
            id: "gcp-3", pixel: PixelPoint(x: 900, y: 1500),
            map: GeoPoint(lat: 46.300_1, lng: -61.344_9)
        ),
    ]
    private static let size = PixelSize(width: 2000, height: 1700)

    private static func written(
        _ method: GeoreferenceMethod = .affine
    ) throws -> Data {
        try GeoreferenceAnnotation.data(
            controlPoints: points, method: method, pixelSize: size,
            target: "urn:uuid:0F5C1E9A-1111-4A2B-9C3D-000000000001"
        )
    }

    private static func json(_ data: Data) throws -> [String: Any] {
        try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func aWrittenAnnotationReadsBackWithEveryPointIntact() throws {
        let document = try GeoreferenceAnnotation.read(try Self.written())
        #expect(document.method == .affine)
        #expect(document.pixelSize == Self.size)
        #expect(document.controlPoints.count == 3)
        for (written, read) in zip(Self.points, document.controlPoints) {
            #expect(read.pixel == written.pixel)
            #expect(read.map == written.map)
        }
    }

    /// The pixel pair is [x, y] and the GeoJSON pair is [lng, lat] — opposite
    /// orders. Both are two numbers, so getting it backwards produces a
    /// document that validates and puts the sheet in the Indian Ocean. Read
    /// out of the raw JSON rather than through the reader, because a reader
    /// with the same mistake would round-trip perfectly.
    @Test func theTwoCoordinatePairsAreInOppositeOrders() throws {
        let body = try #require(
            try Self.json(try Self.written())["body"] as? [String: Any]
        )
        let features = try #require(body["features"] as? [[String: Any]])
        let properties = try #require(features[0]["properties"] as? [String: Any])
        let geometry = try #require(features[0]["geometry"] as? [String: Any])

        #expect(try #require(properties["resourceCoords"] as? [Double]) == [120, 340])
        #expect(
            try #require(geometry["coordinates"] as? [Double])
                == [-61.387_588, 46.353_788]
        )
    }

    /// The transformation belongs on the body. At the root it parses as JSON
    /// and is silently invalid against the extension, which is the kind of
    /// mistake that only shows up in somebody else's tool.
    @Test func theTransformationSitsOnTheBodyAndNamesTheMethod() throws {
        let affine = try Self.json(try Self.written(.affine))
        #expect(affine["transformation"] == nil)
        let affineBody = try #require(affine["body"] as? [String: Any])
        let polynomial = try #require(affineBody["transformation"] as? [String: Any])
        #expect(polynomial["type"] as? String == "polynomial")
        #expect(
            (polynomial["options"] as? [String: Any])?["order"] as? Int == 1
        )

        let splineBody = try #require(
            try Self.json(try Self.written(.spline))["body"] as? [String: Any]
        )
        #expect(
            (splineBody["transformation"] as? [String: Any])?["type"] as? String
                == "thinPlateSpline"
        )
    }

    @Test func theRequiredContextsAreDeclaredInOrder() throws {
        let document = try Self.json(try Self.written())
        #expect(document["@context"] as? [String] == GeoreferenceAnnotation.context)
        #expect(document["motivation"] as? String == "georeferencing")
        let target = try #require(document["target"] as? [String: Any])
        #expect(target["width"] as? Double == 2000)
        #expect(target["height"] as? Double == 1700)
    }

    /// The size is the original raster's, and the points are in those pixels.
    /// A session that took the annotation's word for a preview's size would
    /// place every point proportionally wrong with nothing able to tell.
    @Test func aReadAnnotationCanBeSolvedAtTheSizeItStates() throws {
        let document = try GeoreferenceAnnotation.read(try Self.written())
        let session = GeoreferenceSession(
            controlPoints: document.controlPoints,
            pixelSize: try #require(document.pixelSize),
            method: document.method
        )
        #expect(session.transform != nil)
        #expect(session.status == .exactFit)
    }

    /// A higher-order polynomial is a different surface. Reading its points as
    /// an affine's would place the sheet with a fit its author rejected, so it
    /// is named rather than substituted.
    @Test func aTransformationThisAppDoesNotFitIsNamedRatherThanSubstituted() throws {
        var document = try Self.json(try Self.written())
        var body = try #require(document["body"] as? [String: Any])
        body["transformation"] = ["type": "polynomial", "options": ["order": 3]]
        document["body"] = body
        let data = try JSONSerialization.data(withJSONObject: document)

        #expect(throws: GeoreferenceAnnotation.Refusal.self) {
            try GeoreferenceAnnotation.read(data)
        }
        // And the refusal quotes what it saw, so the message can too.
        do {
            _ = try GeoreferenceAnnotation.read(data)
        } catch {
            guard case .unsupportedTransformation(let named) = error else {
                Issue.record("expected the transformation to be named")
                return
            }
            #expect(named.contains("polynomial"))
            #expect(named.contains("3"))
        }
    }

    /// A feature missing half a control point is refused rather than skipped.
    /// A silently shorter set still solves, and it would place the sheet from
    /// points the user never checked.
    @Test func aFeatureMissingHalfAPointIsRefusedRatherThanSkipped() throws {
        var document = try Self.json(try Self.written())
        var body = try #require(document["body"] as? [String: Any])
        var features = try #require(body["features"] as? [[String: Any]])
        features[1]["geometry"] = ["type": "Point", "coordinates": [-61.3]]
        body["features"] = features
        document["body"] = body

        #expect(throws: GeoreferenceAnnotation.Refusal.malformedControlPoint) {
            try GeoreferenceAnnotation.read(
                try JSONSerialization.data(withJSONObject: document)
            )
        }
    }

    /// Coordinates written as strings — which is how a spreadsheet export
    /// usually arrives — are refused rather than coerced. A coerced zero is a
    /// point off the coast of Africa.
    @Test func coordinatesWrittenAsTextAreRefused() throws {
        var document = try Self.json(try Self.written())
        var body = try #require(document["body"] as? [String: Any])
        var features = try #require(body["features"] as? [[String: Any]])
        features[0]["geometry"] = [
            "type": "Point", "coordinates": ["-61.387588", "46.353788"],
        ]
        body["features"] = features
        document["body"] = body

        #expect(throws: GeoreferenceAnnotation.Refusal.malformedControlPoint) {
            try GeoreferenceAnnotation.read(
                try JSONSerialization.data(withJSONObject: document)
            )
        }
    }

    @Test func somethingThatIsNotAnAnnotationIsRefused() throws {
        #expect(throws: GeoreferenceAnnotation.Refusal.notJson) {
            try GeoreferenceAnnotation.read(Data("not json at all".utf8))
        }
        #expect(throws: GeoreferenceAnnotation.Refusal.notAnAnnotation) {
            try GeoreferenceAnnotation.read(
                Data(#"{"type":"Annotation","motivation":"painting"}"#.utf8)
            )
        }
        // A georeferencing annotation with no points is not a placement.
        #expect(throws: GeoreferenceAnnotation.Refusal.notAnAnnotation) {
            try GeoreferenceAnnotation.read(
                Data(
                    #"{"motivation":"georeferencing","body":{"features":[]}}"#.utf8
                )
            )
        }
    }
}
