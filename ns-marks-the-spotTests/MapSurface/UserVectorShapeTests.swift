import Foundation
import GeoCore
import MapKit
import Testing

@testable import ns_marks_the_spot

@Suite("Drawing a user's vector layer")
struct UserVectorShapeTests {
    private func drawing(
        _ json: String, name: String = "Woodlot", colorHex: String = "#0072b2"
    ) throws -> UserVectorDrawing {
        let parsed = try UserVectorParse.parseGeoJson(Data(json.utf8))
        return UserVectorDrawing(
            record: UserVectorLayerRecord(
                id: "layer-1",
                name: name,
                source: .geoJson,
                origin: .imported(filename: "woodlot.geojson", importedAt: Date(timeIntervalSince1970: 0)),
                createdAt: Date(timeIntervalSince1970: 0),
                colorHex: colorHex,
                featureCount: parsed.featureCount,
                bbox: parsed.bbox
            ),
            parsed: parsed
        )
    }

    /// A ring after the first is a hole. A parcel with a right-of-way cut out
    /// of it must not be painted over the strip it excludes.
    @Test func holesAreDrawnAsInteriorPolygons() throws {
        let overlays = try drawing(
            """
            {"type":"Polygon","coordinates":
              [[[-63,44],[-62,44],[-62,45],[-63,44]],
               [[-62.8,44.2],[-62.5,44.2],[-62.5,44.4],[-62.8,44.2]]]}
            """
        ).overlays()
        #expect(overlays.count == 1)
        let polygon = try #require(overlays.first as? UserVectorPolygon)
        #expect(polygon.interiorPolygons?.count == 1)
        #expect(polygon.layerID == "layer-1")
    }

    @Test func aMultiPolygonBecomesOnePolygonPerPart() throws {
        let overlays = try drawing(
            """
            {"type":"MultiPolygon","coordinates":
              [[[[-63,44],[-62,44],[-62,45],[-63,44]]],
               [[[-61,46],[-60,46],[-60,47],[-61,46]]]]}
            """
        ).overlays()
        #expect(overlays.count == 2)
    }

    /// Points are annotations, not overlays: a marker has to be tappable and
    /// carry a callout, which an overlay cannot.
    @Test func pointsBecomeAnnotationsAndNotOverlays() throws {
        let drawing = try drawing(
            """
            {"type":"FeatureCollection","features":[
              {"type":"Feature","geometry":{"type":"Point","coordinates":[-63.5,44.6]},
               "properties":{"name":"Gate"}},
              {"type":"Feature","geometry":{"type":"LineString","coordinates":[[-63,44],[-62,45]]},
               "properties":{}}]}
            """
        )
        #expect(drawing.overlays().count == 1)
        let annotations = drawing.annotations()
        #expect(annotations.count == 1)
        #expect(annotations[0].title == "Gate")
        #expect(abs(annotations[0].coordinate.latitude - 44.6) < 1e-9)
    }

    /// Every point of a multi-point feature is drawn, not just the first.
    @Test func everyPointOfAMultiPointIsDrawn() throws {
        let annotations = try drawing(
            #"{"type":"MultiPoint","coordinates":[[-63,44],[-62,45],[-61,46]]}"#
        ).annotations()
        #expect(annotations.count == 3)
    }

    /// A GeometryCollection holds whatever it holds — a KML MultiGeometry of a
    /// point and a boundary arrives as one. Both halves have to be drawn, or a
    /// placemark loses part of itself on import.
    @Test func aCollectionDrawsBothItsOverlaysAndItsPoints() throws {
        let drawing = try drawing(
            """
            {"type":"GeometryCollection","geometries":[
              {"type":"Point","coordinates":[-63,44]},
              {"type":"LineString","coordinates":[[-63,44],[-62,45]]}]}
            """
        )
        #expect(drawing.overlays().count == 1)
        #expect(drawing.annotations().count == 1)
    }

    /// The provenance is not decoration. A feature the user loaded has to say
    /// so wherever it is shown, because everything else this map draws a marker
    /// for is a published record.
    @Test func aPointCarriesWhereItCameFrom() throws {
        let annotation = try #require(
            try drawing(#"{"type":"Point","coordinates":[-63,44]}"#).annotations().first
        )
        #expect(annotation.provenance == "From your file woodlot.geojson")
    }

    /// Two layers can each hold a feature the parser called `feature-1`, and an
    /// id that collided would select the wrong one.
    @Test func annotationIdsAreQualifiedByTheirLayer() throws {
        let annotation = try #require(
            try drawing(#"{"type":"Point","coordinates":[-63,44]}"#).annotations().first
        )
        #expect(annotation.mapAnnotationID.hasPrefix("layer-1/"))
    }

    /// The layer colour is the default; a feature's own simplestyle property
    /// wins, which is how an authored KML keeps the look its author gave it.
    @Test func aFeaturesOwnColourOutranksTheLayers() throws {
        let overlays = try drawing(
            """
            {"type":"Feature","geometry":{"type":"Polygon","coordinates":
              [[[-63,44],[-62,44],[-62,45],[-63,44]]]},
             "properties":{"stroke":"#ff0000"}}
            """,
            colorHex: "#0072b2"
        ).overlays()
        let polygon = try #require(overlays.first as? UserVectorPolygon)
        #expect(polygon.style.strokeHex == "#ff0000")
        // Untouched properties still come from the layer.
        #expect(polygon.style.fillHex == "#0072b2")
    }

    /// A degenerate ring is not a shape. Drawn as one it would be an invisible
    /// overlay that still gets hit-tested on every tap.
    @Test func aRingWithTooFewPointsDrawsNothing() throws {
        #expect(
            try drawing(#"{"type":"Polygon","coordinates":[[[-63,44],[-62,44]]]}"#)
                .overlays().isEmpty
        )
    }

    /// The user's own layers draw above every catalogued one: a boundary they
    /// sketched must not disappear under the layer they are comparing it to.
    @Test func aUserLayerDrawsAboveTheCataloguedOnes() throws {
        let overlays = try drawing(
            #"{"type":"LineString","coordinates":[[-63,44],[-62,45]]}"#
        ).overlays()
        let polyline = try #require(overlays.first)
        #expect(
            polyline.webDrawOrder
                > OverlayZIndex.drawOrder(OverlayZIndex.establishedParcel, in: .pane)
        )
    }
}

@Suite("Reconciling the user's vector layers")
struct UserVectorStateDiffTests {
    private var drawing: UserVectorDrawing {
        get throws {
            let parsed = try UserVectorParse.parseGeoJson(
                Data(#"{"type":"Point","coordinates":[-63,44]}"#.utf8)
            )
            return UserVectorDrawing(
                record: UserVectorLayerRecord(
                    id: "layer-1",
                    name: "Woodlot",
                    source: .geoJson,
                    origin: .drawn(createdAt: Date(timeIntervalSince1970: 0)),
                    createdAt: Date(timeIntervalSince1970: 0),
                    colorHex: "#0072b2",
                    featureCount: 1,
                    bbox: parsed.bbox
                ),
                parsed: parsed
            )
        }
    }

    @Test func addingALayerEmitsOneMutation() throws {
        var desired = MapViewState()
        desired.userVectors = [try drawing]
        #expect(
            MapStateDiff.mutations(from: MapViewState(), to: desired)
                == [.setUserVectors(desired.userVectors)]
        )
    }

    /// An edit rewrites a layer's features rather than patching one of them, so
    /// a bumped revision has to reach the map even when the geometry it
    /// replaced happened to be the same shape.
    @Test func anEditedLayerIsReinstalled() throws {
        var current = MapViewState()
        current.userVectors = [try drawing]
        var desired = current
        desired.userVectors[0].record.revision += 1
        #expect(
            MapStateDiff.mutations(from: current, to: desired)
                == [.setUserVectors(desired.userVectors)]
        )
    }

    @Test func anUnchangedLayerEmitsNothing() throws {
        var state = MapViewState()
        state.userVectors = [try drawing]
        #expect(MapStateDiff.mutations(from: state, to: state).isEmpty)
    }
}

@Suite("Handles on the feature being edited")
struct VectorSelectionHandleTests {
    private func position(_ lng: Double, _ lat: Double) -> GeoJsonPosition {
        GeoJsonPosition(lng: lng, lat: lat)
    }

    private func feature(_ geometry: GeoJsonGeometry) -> GeoJsonFeature {
        GeoJsonFeature(id: "f1", geometry: geometry, properties: [:])
    }

    /// A closed ring's last position is its first one. Two handles on one
    /// corner would let the user drag the copy and watch the shape not move.
    @Test func aClosedRingGetsOneHandlePerCornerNotTwo() throws {
        let ring = [
            position(-63, 44), position(-62, 44), position(-62, 45), position(-63, 44),
        ]
        let handles = try #require(
            VectorSelectionHandles(feature: feature(.polygon([ring])), colorHex: "#d55e00")
        )
        #expect(handles.handles().count == 3)
    }

    @Test func everyVertexOfALineIsDraggable() throws {
        let line = [position(-63, 44), position(-62, 44), position(-61, 45)]
        let handles = try #require(
            VectorSelectionHandles(feature: feature(.lineString(line)), colorHex: "#d55e00")
        )
        let dragged = handles.handles()
        #expect(dragged.count == 3)
        #expect(dragged.map(\.vertex) == [0, 1, 2])
    }

    /// `VectorEdit.moving` carries no part index, so a multi-part feature would
    /// need this view to guess which part a handle meant. It offers none rather
    /// than moving the wrong one.
    @Test func aMultiPartFeatureOffersNoHandles() {
        let parts = [[position(-63, 44), position(-62, 45)], [position(-61, 46)]]
        #expect(
            VectorSelectionHandles(
                feature: feature(.multiLineString(parts)), colorHex: "#d55e00"
            ) == nil
        )
    }

    /// A hole is the user's ground too: it has corners, and they must be
    /// draggable and addressed by their own ring.
    @Test func aHoleSCornersAreHandlesOnTheirOwnRing() throws {
        let outer = [
            position(-63, 44), position(-60, 44), position(-60, 47), position(-63, 44),
        ]
        let hole = [
            position(-62, 45), position(-61, 45), position(-61, 46), position(-62, 45),
        ]
        let handles = try #require(
            VectorSelectionHandles(feature: feature(.polygon([outer, hole])), colorHex: "#d55e00")
        )
        #expect(handles.handles().filter { $0.ring == 1 }.count == 3)
    }
}
