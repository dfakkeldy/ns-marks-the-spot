import Foundation
import Testing

@testable import GeoCore

@Suite("Points to line or area")
struct VectorConvertTests {
    private func point(
        _ id: String, _ lat: Double, _ lng: Double, properties: [String: JSONValue] = [:]
    ) -> GeoJsonFeature {
        GeoJsonFeature(
            id: id, geometry: .point(GeoJsonPosition(lng: lng, lat: lat)),
            properties: properties
        )
    }

    private func layer(_ features: [GeoJsonFeature]) -> ParsedVector {
        VectorEdit.recomputed(features)
    }

    @Test func pointsConnectInStoredArrayOrder() throws {
        let parsed = layer([
            point("a", 44.6, -63.5),
            point("b", 44.7, -63.4),
            point("c", 44.65, -63.3),
        ])
        let result = try #require(
            VectorEdit.convertingPoints(
                in: parsed, shape: .line, keepSourcePoints: true, id: "line-1"
            )
        )
        guard case .lineString(let line)? = result.feature.geometry else {
            Issue.record("Expected a LineString.")
            return
        }
        #expect(line.map(\.lat) == [44.6, 44.7, 44.65])
        #expect(
            result.feature.properties[CaptureSpec.convertedFromPointsKey] == .number(3)
        )
        #expect(result.feature.properties[CaptureSpec.createdAtKey] != nil)
        // Source points kept: three points plus the new line.
        #expect(result.parsed.featureCount == 4)
    }

    @Test func consecutiveDuplicatesAreDroppedButStillCounted() throws {
        let parsed = layer([
            point("a", 44.6, -63.5),
            point("b", 44.6, -63.5),
            point("c", 44.7, -63.4),
        ])
        let plan = VectorEdit.conversionPlan(for: parsed, shape: .line)
        #expect(plan.positions.count == 2)
        #expect(plan.sourcePointCount == 3)
        #expect(plan.viable)
    }

    @Test func anAreaClosesItsRingWithoutDoubleClosingAHandClosedOne() throws {
        let openResult = try #require(
            VectorEdit.convertingPoints(
                in: layer([
                    point("a", 44.6, -63.5), point("b", 44.7, -63.5), point("c", 44.7, -63.4),
                ]),
                shape: .area, keepSourcePoints: true
            )
        )
        guard case .polygon(let rings)? = openResult.feature.geometry else {
            Issue.record("Expected a Polygon.")
            return
        }
        #expect(rings[0].count == 4)
        #expect(rings[0].first == rings[0].last)

        // A hand-closed set (last point back on the first) must not close
        // twice.
        let handClosed = try #require(
            VectorEdit.convertingPoints(
                in: layer([
                    point("a", 44.6, -63.5), point("b", 44.7, -63.5),
                    point("c", 44.7, -63.4), point("d", 44.6, -63.5),
                ]),
                shape: .area, keepSourcePoints: true
            )
        )
        guard case .polygon(let closedRings)? = handClosed.feature.geometry else {
            Issue.record("Expected a Polygon.")
            return
        }
        #expect(closedRings[0].count == 4)
    }

    @Test func viabilityNeedsTwoDistinctForALineAndThreeForAnArea() {
        let two = layer([point("a", 44.6, -63.5), point("b", 44.7, -63.4)])
        #expect(VectorEdit.conversionPlan(for: two, shape: .line).viable)
        #expect(!VectorEdit.conversionPlan(for: two, shape: .area).viable)
        #expect(
            VectorEdit.convertingPoints(in: two, shape: .area, keepSourcePoints: true) == nil
        )
        // Two distinct positions among three points is still not an area.
        let duplicated = layer([
            point("a", 44.6, -63.5), point("b", 44.6, -63.5), point("c", 44.7, -63.4),
        ])
        #expect(!VectorEdit.conversionPlan(for: duplicated, shape: .area).viable)
    }

    @Test func removingSourcePointsKeepsEverythingElse() throws {
        let existingLine = GeoJsonFeature(
            id: "road",
            geometry: .lineString([
                GeoJsonPosition(lng: -63.5, lat: 44.6), GeoJsonPosition(lng: -63.4, lat: 44.7),
            ])
        )
        let parsed = layer([
            existingLine, point("a", 44.6, -63.5), point("b", 44.7, -63.4),
        ])
        let result = try #require(
            VectorEdit.convertingPoints(in: parsed, shape: .line, keepSourcePoints: false)
        )
        #expect(result.parsed.featureCount == 2)
        #expect(result.parsed.features.first?.id == "road")
        #expect(result.parsed.features.last?.id == result.feature.id)
    }

    @Test func tracedProvenanceIsInheritedFromAnySourcePoint() throws {
        let parsed = layer([
            point("a", 44.6, -63.5),
            point("b", 44.7, -63.4, properties: [
                CaptureSpec.tracedKey: .string(CaptureSpec.tracedParcelValue)
            ]),
        ])
        let result = try #require(
            VectorEdit.convertingPoints(in: parsed, shape: .line, keepSourcePoints: true)
        )
        #expect(
            result.feature.properties[CaptureSpec.tracedKey]
                == .string(CaptureSpec.tracedParcelValue)
        )
        let plain = try #require(
            VectorEdit.convertingPoints(
                in: layer([point("a", 44.6, -63.5), point("b", 44.7, -63.4)]),
                shape: .line, keepSourcePoints: true
            )
        )
        #expect(plain.feature.properties[CaptureSpec.tracedKey] == nil)
    }

    @Test func selfIntersectionIsWarnedNotBlocked() throws {
        // A bowtie: the hourglass ordering crosses itself as an area.
        let bowtie = layer([
            point("a", 44.6, -63.5),
            point("b", 44.7, -63.4),
            point("c", 44.6, -63.4),
            point("d", 44.7, -63.5),
        ])
        let plan = VectorEdit.conversionPlan(for: bowtie, shape: .area)
        #expect(plan.viable)
        #expect(plan.selfIntersects)
        // Warned, never blocked: the conversion still happens.
        #expect(
            VectorEdit.convertingPoints(in: bowtie, shape: .area, keepSourcePoints: true)
                != nil
        )
        // The same four corners in walking order do not intersect.
        let square = layer([
            point("a", 44.6, -63.5),
            point("b", 44.7, -63.5),
            point("c", 44.7, -63.4),
            point("d", 44.6, -63.4),
        ])
        #expect(!VectorEdit.conversionPlan(for: square, shape: .area).selfIntersects)
    }

    @Test func thePlanMeasuresLengthAndArea() {
        // Roughly an 11 km × 8 km rectangle.
        let square = layer([
            point("a", 44.6, -63.5),
            point("b", 44.7, -63.5),
            point("c", 44.7, -63.4),
            point("d", 44.6, -63.4),
        ])
        let linePlan = VectorEdit.conversionPlan(for: square, shape: .line)
        #expect(linePlan.lengthM > 25_000)
        #expect(linePlan.areaM2 == nil)
        let areaPlan = VectorEdit.conversionPlan(for: square, shape: .area)
        // The area perimeter includes the closing edge.
        #expect(areaPlan.lengthM > linePlan.lengthM)
        let areaM2 = areaPlan.areaM2 ?? 0
        #expect(areaM2 > 80_000_000)
    }

    /// Conversion output is planimetric: a marked point's altitude must not
    /// fabricate a 3D outline.
    @Test func altitudesAreStripped() throws {
        let parsed = layer([
            GeoJsonFeature(
                id: "a",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6, altitude: 30))
            ),
            GeoJsonFeature(
                id: "b",
                geometry: .point(GeoJsonPosition(lng: -63.4, lat: 44.7, altitude: 60))
            ),
        ])
        let result = try #require(
            VectorEdit.convertingPoints(in: parsed, shape: .line, keepSourcePoints: true)
        )
        guard case .lineString(let line)? = result.feature.geometry else {
            Issue.record("Expected a LineString.")
            return
        }
        #expect(line.allSatisfy { $0.altitude == nil })
    }
}
