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

    /// A degenerate ring is not a shape, and it never reaches the drawing at
    /// all: the import refuses the file and says why. Refusing is the stronger
    /// answer — a layer that silently drew nothing would sit in the list
    /// claiming to be on the map.
    @Test func aRingWithTooFewPointsIsRefusedAtImport() {
        #expect(throws: UserMapImportRefusal.self) {
            try UserVectorParse.parseGeoJson(
                Data(#"{"type":"Polygon","coordinates":[[[-63,44],[-62,44]]]}"#.utf8)
            )
        }
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

    /// A handle's ring index has to mean the same thing to the map and to the
    /// edit. This walks a dragged handle all the way through `VectorEdit` and
    /// checks the vertex that moved is the one the handle sat on.
    @Test func everyPartOfAMultiPartFeatureIsDraggable() throws {
        let parts = [[position(-63, 44), position(-62, 45)], [position(-61, 46)]]
        let handles = try #require(
            VectorSelectionHandles(
                feature: feature(.multiLineString(parts)), colorHex: "#d55e00"
            )
        )
        let dragged = handles.handles()
        #expect(dragged.count == 3)
        #expect(dragged.map(\.ring) == [0, 0, 1])
        #expect(dragged.map(\.vertex) == [0, 1, 0])

        let lastHandle = try #require(dragged.last)
        let parsed = ParsedVector(
            features: [feature(.multiLineString(parts))], bbox: nil
        )
        let edited = VectorEdit.moving(
            featureID: lastHandle.featureID,
            ring: lastHandle.ring,
            vertex: lastHandle.vertex,
            to: position(-60, 47),
            in: parsed
        )
        guard case .multiLineString(let lines)? = edited.features.first?.geometry else {
            Issue.record("Expected a multi-line.")
            return
        }
        #expect(lines[0] == parts[0])
        #expect(lines[1] == [position(-60, 47)])
    }

    /// Unlike the vertex handles: a shift applies to every part equally, so
    /// there is no part index to guess and nothing to get wrong.
    @Test func aMultiPartFeatureCanStillBeCarriedWhole() throws {
        let parts = [[position(-63, 44), position(-61, 44)], [position(-61, 46)]]
        let handle = try #require(
            VectorMoveHandle(feature: feature(.multiLineString(parts)), colorHex: "#d55e00")
        )

        #expect(handle.featureID == "f1")
        // The mean of the three vertices.
        #expect(abs(handle.centre.lng - (-61.666666666)) < 1e-6)
        #expect(abs(handle.centre.lat - 44.666666666) < 1e-6)
    }

    /// One pin per position on a traced coastline is a frozen map. The shape
    /// stays selectable and carryable; only the corner handles stand down.
    @Test func aShapeWithTooManyCornersOffersNoHandlesAndStillMovesWhole() throws {
        let ring = (0...VectorSelectionHandles.maximumHandles).map {
            position(-63 + Double($0) * 0.0001, 44)
        }
        let traced = feature(.lineString(ring))
        #expect(ring.count > VectorSelectionHandles.maximumHandles)
        #expect(VectorSelectionHandles.isReshapable(traced) == false)
        #expect(VectorSelectionHandles(feature: traced, colorHex: "#d55e00") == nil)
        #expect(VectorMoveHandle(feature: traced, colorHex: "#d55e00") != nil)

        // Exactly the cap is still draggable: the refusal starts above it.
        let atCap = feature(.lineString(Array(ring.dropLast())))
        #expect(VectorSelectionHandles.isReshapable(atCap))
    }

    /// The cap counts handles, not stored positions. A closed ring's last
    /// position repeats its first and the two share one handle, so counting
    /// positions would refuse a thousand-corner polygon for having a thousand
    /// and one.
    @Test func aClosedRingIsMeasuredByItsCornersNotItsPositions() throws {
        let corners = (0..<VectorSelectionHandles.maximumHandles).map {
            position(-63 + Double($0) * 0.0001, 44 + Double($0 % 2) * 0.0001)
        }
        let closed = corners + [corners[0]]
        #expect(closed.count == VectorSelectionHandles.maximumHandles + 1)

        let atCap = feature(.polygon([closed]))
        #expect(VectorSelectionHandles.isReshapable(atCap))
        let handles = try #require(
            VectorSelectionHandles(feature: atCap, colorHex: "#d55e00")
        )
        #expect(handles.handles().count == VectorSelectionHandles.maximumHandles)

        // One corner more is one handle more, and that is over.
        let overCap = corners + [position(-62, 45), corners[0]]
        #expect(VectorSelectionHandles.isReshapable(feature(.polygon([overCap]))) == false)
    }

    @Test func aFeatureWithNoPlaceHasNothingToPickUp() {
        #expect(
            VectorMoveHandle(
                feature: GeoJsonFeature(id: "f1", geometry: nil, properties: [:]),
                colorHex: "#d55e00"
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
