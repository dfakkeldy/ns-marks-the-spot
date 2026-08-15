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
