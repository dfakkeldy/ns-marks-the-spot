import Foundation

/// What the user is drawing.
public enum VectorEditShape: String, Hashable, Sendable, CaseIterable {
    case point, line, area
}

/// A shape the user is part-way through drawing.
///
/// Its own type rather than a feature that is not finished yet: a half-drawn
/// area is two points and a rubber band, which is not a polygon and must not be
/// saved as one, exported as one, or counted in the layer's feature count.
public struct VectorDraft: Hashable, Sendable {
    public var shape: VectorEditShape
    public var vertices: [GeoJsonPosition]

    public init(shape: VectorEditShape, vertices: [GeoJsonPosition] = []) {
        self.shape = shape
        self.vertices = vertices
    }

    /// How many distinct positions this shape needs before it is one.
    ///
    /// Three for an area rather than four: the closing position is the first
    /// one repeated, and asking the user to place it twice would be asking them
    /// to know how GeoJSON stores a ring.
    public var requiredVertices: Int {
        switch shape {
        case .point: return 1
        case .line: return 2
        case .area: return 3
        }
    }

    public var canFinish: Bool { vertices.count >= requiredVertices }

    public mutating func append(_ position: GeoJsonPosition) {
        // A point is one position. Tapping again moves it rather than starting
        // a second marker the user cannot see they have made.
        if shape == .point {
            vertices = [position]
        } else {
            vertices.append(position)
        }
    }

    public mutating func removeLastVertex() {
        guard !vertices.isEmpty else { return }
        vertices.removeLast()
    }

    /// The geometry this draft finishes as, or nil while it is still short.
    public func geometry() -> GeoJsonGeometry? {
        guard canFinish else { return nil }
        switch shape {
        case .point:
            guard let first = vertices.first else { return nil }
            return .point(first)
        case .line:
            return .lineString(vertices)
        case .area:
            // Closed here rather than left to the writer: an unclosed ring is
            // valid-looking GeoJSON that other tools draw as a line, so a
            // parcel the user traced would leave this app as an open path.
            var ring = vertices
            if ring.first != ring.last, let first = ring.first {
                ring.append(first)
            }
            return .polygon([ring])
        }
    }
}

/// Editing a user's layer.
///
/// Whole-collection operations returning a new collection, rather than mutation
/// in place: the store writes a layer's features as one file, the map redraws a
/// layer as a whole, and an edit is one revision of one layer.
public enum VectorEdit {
    /// The layer with a drawn feature added.
    ///
    /// The id is minted rather than taken from the caller so it cannot collide
    /// with a feature already in the layer — which would make the edit panel
    /// address two features at once.
    public static func adding(
        _ geometry: GeoJsonGeometry,
        to parsed: ParsedVector,
        properties: [String: JSONValue] = [:]
    ) -> ParsedVector {
        let existing = Set(parsed.features.compactMap(\.id))
        var index = parsed.features.count + 1
        var id = "drawn-\(index)"
        while existing.contains(id) {
            index += 1
            id = "drawn-\(index)"
        }
        return recomputed(
            parsed.features + [
                GeoJsonFeature(id: id, geometry: geometry, properties: properties)
            ]
        )
    }

    /// The layer with one feature's name and description replaced.
    ///
    /// `name` and `description` because those are the two the panel edits and
    /// the two KML carries; every other property the file arrived with is left
    /// exactly as it was. An edit that rewrote the properties wholesale would
    /// quietly drop the attribute table a shapefile came in with.
    public static func updating(
        featureID: String,
        name: String?,
        description: String?,
        in parsed: ParsedVector
    ) -> ParsedVector {
        recomputed(
            parsed.features.map { feature in
                guard feature.id == featureID else { return feature }
                var updated = feature
                updated.properties["name"] = value(name)
                updated.properties["description"] = value(description)
                // Removed rather than stored empty: a name the user cleared
                // should leave the callout titled by what is left, not by an
                // empty line.
                if updated.properties["name"] == nil {
                    updated.properties.removeValue(forKey: "name")
                }
                if updated.properties["description"] == nil {
                    updated.properties.removeValue(forKey: "description")
                }
                return updated
            }
        )
    }

    private static func value(_ text: String?) -> JSONValue? {
        guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return .string(text)
    }

    public static func removing(featureID: String, from parsed: ParsedVector) -> ParsedVector {
        recomputed(parsed.features.filter { $0.id != featureID })
    }

    /// The layer with one vertex of one feature moved.
    ///
    /// Addressed by feature, ring and index rather than by proximity: a vertex
    /// dragged onto its neighbour would otherwise become ambiguous exactly when
    /// the user most needs the app to move the one they grabbed.
    public static func moving(
        featureID: String,
        ring: Int,
        vertex: Int,
        to position: GeoJsonPosition,
        in parsed: ParsedVector
    ) -> ParsedVector {
        recomputed(
            parsed.features.map { feature in
                guard feature.id == featureID, let geometry = feature.geometry else {
                    return feature
                }
                var updated = feature
                updated.geometry = moved(geometry, ring: ring, vertex: vertex, to: position)
                return updated
            }
        )
    }

    private static func moved(
        _ geometry: GeoJsonGeometry, ring: Int, vertex: Int, to position: GeoJsonPosition
    ) -> GeoJsonGeometry {
        func replacing(_ positions: [GeoJsonPosition]) -> [GeoJsonPosition] {
            guard positions.indices.contains(vertex) else { return positions }
            var moved = positions
            moved[vertex] = position
            // A closed ring's first and last position are the same vertex. Move
            // one and leave the other and the polygon tears open.
            if moved.count > 1, vertex == 0, positions.first == positions.last {
                moved[moved.count - 1] = position
            }
            if moved.count > 1, vertex == moved.count - 1, positions.first == positions.last {
                moved[0] = position
            }
            return moved
        }

        switch geometry {
        case .point:
            return .point(position)
        case .lineString(let line):
            return .lineString(replacing(line))
        case .polygon(let rings):
            guard rings.indices.contains(ring) else { return geometry }
            var updated = rings
            updated[ring] = replacing(rings[ring])
            return .polygon(updated)
        case .multiPoint, .multiLineString, .multiPolygon, .collection:
            // Multi-part geometry needs a part index this call does not carry.
            // Left alone rather than guessed at: moving the wrong part is a
            // silent corruption of the user's own data.
            return geometry
        }
    }

    /// The layer with one whole feature shifted.
    ///
    /// A shape drawn in the wrong place is a common mistake and an expensive
    /// one to correct a vertex at a time: a traced boundary of thirty corners
    /// would have to be dragged thirty times, and would come out a different
    /// shape. Moving every position by the same offset keeps the shape and
    /// changes only where it sits.
    ///
    /// The offset is in degrees, which is not distance: a shape dragged east
    /// keeps its longitude span rather than its width in metres. That is what
    /// the user sees on a Mercator map — the shape stays under the finger and
    /// stays the size it looked — and it is what the web's drag mode does.
    ///
    /// Multi-part geometry moves too, unlike a vertex drag: a shift applies to
    /// every position equally, so no part index is needed to know what to move.
    public static func translating(
        featureID: String,
        byLatitude latitudeDelta: Double,
        longitude longitudeDelta: Double,
        in parsed: ParsedVector
    ) -> ParsedVector {
        guard latitudeDelta != 0 || longitudeDelta != 0 else { return parsed }
        return recomputed(
            parsed.features.map { feature in
                guard feature.id == featureID, let geometry = feature.geometry else {
                    return feature
                }
                var updated = feature
                updated.geometry = translated(
                    geometry, byLatitude: latitudeDelta, longitude: longitudeDelta
                )
                return updated
            }
        )
    }

    private static func translated(
        _ geometry: GeoJsonGeometry, byLatitude dLat: Double, longitude dLng: Double
    ) -> GeoJsonGeometry {
        func shift(_ position: GeoJsonPosition) -> GeoJsonPosition {
            // Latitude is held inside the world rather than wrapped: a shape
            // pushed off the top of the map is a shape the user can no longer
            // see or recover. Longitude is left alone, because this app's
            // ground is nowhere near the antimeridian and clamping there would
            // deform a shape rather than stop it.
            GeoJsonPosition(
                lng: position.lng + dLng,
                lat: min(90, max(-90, position.lat + dLat))
            )
        }
        func shiftAll(_ positions: [GeoJsonPosition]) -> [GeoJsonPosition] {
            positions.map(shift)
        }

        switch geometry {
        case .point(let position): return .point(shift(position))
        case .multiPoint(let positions): return .multiPoint(shiftAll(positions))
        case .lineString(let line): return .lineString(shiftAll(line))
        case .multiLineString(let lines): return .multiLineString(lines.map(shiftAll))
        case .polygon(let rings): return .polygon(rings.map(shiftAll))
        case .multiPolygon(let polygons):
            return .multiPolygon(polygons.map { $0.map(shiftAll) })
        case .collection(let geometries):
            return .collection(
                geometries.map { translated($0, byLatitude: dLat, longitude: dLng) }
            )
        }
    }

    /// The feature under a tap, or nil for a tap on nothing.
    ///
    /// Areas are hit-tested by containment and lines by distance, because a
    /// line has no inside. `toleranceDegrees` is the finger: it comes from the
    /// caller because how much ground a fingertip covers depends on the zoom,
    /// and a fixed tolerance would make a line untappable when zoomed out and
    /// greedy when zoomed in.
    ///
    /// Last match wins, so the answer is the feature drawn on top — the one the
    /// user can see they are pointing at.
    public static func feature(
        at position: GeoJsonPosition, in parsed: ParsedVector, toleranceDegrees: Double
    ) -> GeoJsonFeature? {
        var hit: GeoJsonFeature?
        for feature in parsed.features {
            guard let geometry = feature.geometry else { continue }
            if isHit(geometry, at: position, tolerance: toleranceDegrees) {
                hit = feature
            }
        }
        return hit
    }

    private static func isHit(
        _ geometry: GeoJsonGeometry, at position: GeoJsonPosition, tolerance: Double
    ) -> Bool {
        let point = GeoPoint(lat: position.lat, lng: position.lng)
        func ring(_ positions: [GeoJsonPosition]) -> [GeoPoint] {
            positions.map { GeoPoint(lat: $0.lat, lng: $0.lng) }
        }
        func nearLine(_ positions: [GeoJsonPosition]) -> Bool {
            let points = ring(positions)
            guard points.count >= 2 else {
                return points.first.map { distance(point, $0) <= tolerance } ?? false
            }
            for index in 0..<(points.count - 1) {
                if distanceToSegment(point, points[index], points[index + 1]) <= tolerance {
                    return true
                }
            }
            return false
        }

        switch geometry {
        case .point(let candidate):
            return distance(point, GeoPoint(lat: candidate.lat, lng: candidate.lng)) <= tolerance
        case .multiPoint(let candidates):
            return candidates.contains {
                distance(point, GeoPoint(lat: $0.lat, lng: $0.lng)) <= tolerance
            }
        case .lineString(let line):
            return nearLine(line)
        case .multiLineString(let lines):
            return lines.contains(where: nearLine)
        case .polygon(let rings):
            // The boundary as well as the interior: the stroke is drawn a few
            // points wide, and a tap that lands on the line the user aimed at
            // must not miss because it fell a metre outside it.
            return PolygonHitTest.contains(point, part: rings.map(ring))
                || rings.contains(where: nearLine)
        case .multiPolygon(let parts):
            return PolygonHitTest.contains(point, multiPolygon: parts.map { $0.map(ring) })
                || parts.contains { $0.contains(where: nearLine) }
        case .collection(let geometries):
            return geometries.contains { isHit($0, at: position, tolerance: tolerance) }
        }
    }

    // The screen-shaped distances live in `GeometryHitTest`, which the
    // catalogued layers hit-test through as well: a tap that reaches a user's
    // imported boundary but not a zone polygon drawn over the same ground would
    // be two different fingers.
    private static func distance(_ first: GeoPoint, _ second: GeoPoint) -> Double {
        GeometryHitTest.distance(first, second)
    }

    private static func distanceToSegment(
        _ point: GeoPoint, _ start: GeoPoint, _ end: GeoPoint
    ) -> Double {
        GeometryHitTest.distanceToSegment(point, start, end)
    }

    /// The layer's bounding box, recomputed from what it now holds.
    ///
    /// Recomputed on every edit because the record's bbox is what "zoom to
    /// layer" uses: a stale one sends the user to where their features were
    /// before they moved them.
    public static func recomputed(_ features: [GeoJsonFeature]) -> ParsedVector {
        var box: GeoBoundingBox?
        for position in features.flatMap({ $0.geometry?.positions ?? [] }) {
            if var current = box {
                current.south = min(current.south, position.lat)
                current.north = max(current.north, position.lat)
                current.west = min(current.west, position.lng)
                current.east = max(current.east, position.lng)
                box = current
            } else {
                box = GeoBoundingBox(
                    south: position.lat, west: position.lng,
                    north: position.lat, east: position.lng
                )
            }
        }
        return ParsedVector(features: features, bbox: box)
    }
}
