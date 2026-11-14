import Foundation

/// The outside of a placed sheet's mesh, in the same order as its edges.
public enum SheetFootprint {
    public static func ring(fromMesh mesh: [[GeoPoint]]) -> [GeoPoint]? {
        guard let first = mesh.first, mesh.count >= 2, first.count >= 2,
              mesh.allSatisfy({ $0.count == first.count }) else { return nil }
        let rows = mesh.count
        let cols = first.count
        var edge = first
        for row in 1..<rows { edge.append(mesh[row][cols - 1]) }
        for col in stride(from: cols - 2, through: 0, by: -1) { edge.append(mesh[rows - 1][col]) }
        if rows > 2 {
            for row in stride(from: rows - 2, through: 1, by: -1) { edge.append(mesh[row][0]) }
        }
        let finite = edge.filter { $0.lat.isFinite && $0.lng.isFinite }
        return finite.count >= 3 ? finite : nil
    }

    /// The nearest edge point and the signed distance in local metres.
    static func measure(from fix: GeoPoint, toRing ring: [GeoPoint]) -> (distance: Double, nearest: GeoPoint)? {
        guard fix.lat.isFinite, fix.lng.isFinite, ring.count >= 3,
              ring.allSatisfy({ $0.lat.isFinite && $0.lng.isFinite }) else { return nil }
        let frame = Geodesy.localMetricProjection(fix)
        let points = ring.map { frame.toXY($0) }
        var inside = false
        var best = Double.infinity
        var nearest = fix
        for i in points.indices {
            let j = (i + 1) % points.count
            let a = points[i], b = points[j]
            if (a.y > 0) != (b.y > 0), 0 < (b.x - a.x) * (-a.y) / (b.y - a.y) + a.x {
                inside.toggle()
            }
            let dx = b.x - a.x, dy = b.y - a.y
            let lengthSquared = dx * dx + dy * dy
            let t = lengthSquared == 0 ? 0 : max(0, min(1, -(a.x * dx + a.y * dy) / lengthSquared))
            let x = a.x + t * dx, y = a.y + t * dy
            let distance = hypot(x, y)
            if distance < best {
                best = distance
                nearest = frame.toGeo(x: x, y: y)
            }
        }
        // Projection and segment arithmetic can leave sub-micrometre residue
        // at an exact edge. Treat that numerical noise as the boundary.
        if best < SheetActivationConfig.boundaryToleranceM { return (0, nearest) }
        return (inside ? -best : best, nearest)
    }

    public static func signedDistanceM(from fix: GeoPoint, toRing ring: [GeoPoint]) -> Double {
        measure(from: fix, toRing: ring)?.distance ?? .infinity
    }
}
