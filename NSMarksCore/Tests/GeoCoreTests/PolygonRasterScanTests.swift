import Foundation
import Testing

@testable import GeoCore

// The scan exists so the flood sampler can ask a whole raster cheaply, and its
// promise is exact agreement with the interior ray cast it replaces. These
// tests hold it to that promise pixel by pixel, including centres that land
// exactly on ring edges — where the two must still agree, because they run the
// same arithmetic.

@Suite("PolygonRasterScan")
struct PolygonRasterScanTests {
    /// The rule the scan replaces, spelled out with the original per-point
    /// pieces: interior of the outer ring, not interior of any hole, any part.
    /// No boundary short-circuit — that is the sampler's deliberate departure
    /// from `PolygonHitTest.contains`.
    private func rayCastInterior(
        _ point: GeoPoint, _ parts: [PolygonHitTest.PolygonPart]
    ) -> Bool {
        parts.contains { part in
            guard let outer = part.first else { return false }
            return PolygonHitTest.isInRingInterior(point, ring: outer)
                && !part.dropFirst().contains {
                    PolygonHitTest.isInRingInterior(point, ring: $0)
                }
        }
    }

    /// Walks a pixel grid the way the flood sampler does — row-major, centres,
    /// west to east — and requires the scan and the ray cast to agree on every
    /// pixel.
    private func expectAgreementOnGrid(
        parts: [PolygonHitTest.PolygonPart],
        south: Double, west: Double, north: Double, east: Double,
        width: Int, height: Int,
        sourceLocation: SourceLocation = #_sourceLocation
    ) -> Int {
        var scan = PolygonRasterScan(parts)
        var contained = 0
        for row in 0..<height {
            let latitude = north - ((Double(row) + 0.5) / Double(height)) * (north - south)
            scan.beginRow(latitude: latitude)
            for column in 0..<width {
                let longitude = west + ((Double(column) + 0.5) / Double(width)) * (east - west)
                let fromScan = scan.contains(longitude: longitude)
                let fromRayCast = rayCastInterior(
                    GeoPoint(lat: latitude, lng: longitude), parts
                )
                #expect(
                    fromScan == fromRayCast,
                    "disagree at row \(row) column \(column) (\(latitude), \(longitude))",
                    sourceLocation: sourceLocation
                )
                if fromScan { contained += 1 }
            }
        }
        return contained
    }

    @Test("Agrees with the ray cast over a square with a hole, edges included")
    func squareWithHole() {
        let part: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 10),
                GeoPoint(lat: 10, lng: 10),
                GeoPoint(lat: 10, lng: 0),
            ],
            [
                GeoPoint(lat: 4, lng: 4),
                GeoPoint(lat: 4, lng: 6),
                GeoPoint(lat: 6, lng: 6),
                GeoPoint(lat: 6, lng: 4),
            ],
        ]
        // Centres land exactly on the integers −1…14 — the span is a power of
        // two, so the centre arithmetic is exact — and so columns and rows sit
        // exactly on the outer edges (0, 10) and the hole edges (4, 6): the
        // half-open parity decisions are exercised, not dodged.
        let contained = expectAgreementOnGrid(
            parts: [part],
            south: -1.5, west: -1.5, north: 14.5, east: 14.5,
            width: 16, height: 16
        )
        // Rows 0–9 × columns 0–9 minus the hole's rows 4–5 × columns 4–5:
        // the half-open rule keeps west/south edges and drops east/north.
        #expect(contained == 10 * 10 - 2 * 2)
    }

    @Test("Agrees with the ray cast over a concave outline crossed twice a row")
    func concaveComb() {
        // Two teeth: rows through the gap cross the ring four times.
        let comb: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 9),
                GeoPoint(lat: 10, lng: 9),
                GeoPoint(lat: 10, lng: 6),
                GeoPoint(lat: 2, lng: 6),
                GeoPoint(lat: 2, lng: 4),
                GeoPoint(lat: 10, lng: 4),
                GeoPoint(lat: 10, lng: 0),
            ]
        ]
        _ = expectAgreementOnGrid(
            parts: [comb],
            south: -0.7, west: -0.9, north: 10.3, east: 9.8,
            width: 41, height: 37
        )
    }

    @Test("Agrees with the ray cast over a multipolygon, holes and all")
    func multiPart() {
        let westPart: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 0, lng: 0),
                GeoPoint(lat: 0, lng: 3),
                GeoPoint(lat: 8, lng: 3),
                GeoPoint(lat: 8, lng: 0),
            ],
            [
                GeoPoint(lat: 2, lng: 1),
                GeoPoint(lat: 2, lng: 2),
                GeoPoint(lat: 3, lng: 2),
                GeoPoint(lat: 3, lng: 1),
            ],
        ]
        let eastPart: PolygonHitTest.PolygonPart = [
            [
                GeoPoint(lat: 4, lng: 6),
                GeoPoint(lat: 4, lng: 9),
                GeoPoint(lat: 9, lng: 9),
                GeoPoint(lat: 9, lng: 6),
            ]
        ]
        let degenerate: PolygonHitTest.PolygonPart = [
            [GeoPoint(lat: 20, lng: 20), GeoPoint(lat: 21, lng: 21)]
        ]
        _ = expectAgreementOnGrid(
            parts: [westPart, eastPart, degenerate, []],
            south: -0.4, west: -0.6, north: 9.7, east: 9.9,
            width: 43, height: 39
        )
    }

    @Test("Agrees with the ray cast over an irregular many-vertex shoreline")
    func irregularShoreline() {
        // A deterministic star-shaped outline: angles in order, radius jittered
        // by a fixed-seed generator, so the ring is simple but nothing about it
        // is axis-aligned or repeats.
        var seed: UInt64 = 0x5DEE_CE66_D001
        func jitter() -> Double {
            seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Double(seed >> 11) / Double(1 << 53)
        }
        let ring = (0..<400).map { step -> GeoPoint in
            let angle = 2 * Double.pi * Double(step) / 400
            let radius = 0.5 + 0.45 * jitter()
            return GeoPoint(lat: radius * sin(angle), lng: radius * cos(angle))
        }
        _ = expectAgreementOnGrid(
            parts: [[ring]],
            south: -1, west: -1, north: 1, east: 1,
            width: 48, height: 48
        )
    }

    @Test("Drops the boundary indulgence the tap test keeps")
    func boundaryPixelsFallToParity() {
        let square: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 10),
                    GeoPoint(lat: 10, lng: 10),
                    GeoPoint(lat: 10, lng: 0),
                ]
            ]
        ]
        let westEdge = GeoPoint(lat: 5, lng: 0)
        let eastEdge = GeoPoint(lat: 5, lng: 10)
        // The tap test counts both edges as contained; the sampler decides by
        // parity, which keeps the west edge and drops the east one.
        #expect(PolygonHitTest.contains(westEdge, multiPolygon: square))
        #expect(PolygonHitTest.contains(eastEdge, multiPolygon: square))
        var scan = PolygonRasterScan(square)
        scan.beginRow(latitude: 5)
        let westEdgeSampled = scan.contains(longitude: 0)
        let eastEdgeSampled = scan.contains(longitude: 10)
        #expect(westEdgeSampled)
        #expect(!eastEdgeSampled)
    }

    @Test("A ring poisoned by a non-finite vertex never crashes the row")
    func nonFiniteVertexIsContainedGarbage() {
        let poisoned: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 10),
                    GeoPoint(lat: 10, lng: .nan),
                    GeoPoint(lat: 10, lng: 0),
                ]
            ]
        ]
        // No exact claim about a broken ring's shape — only that the scan
        // walks it without trapping and still answers something everywhere.
        var scan = PolygonRasterScan(poisoned)
        for row in 0..<8 {
            scan.beginRow(latitude: Double(row) * 1.5 - 0.5)
            for column in 0..<8 {
                _ = scan.contains(longitude: Double(column) * 1.5 - 0.5)
            }
        }
    }
}
