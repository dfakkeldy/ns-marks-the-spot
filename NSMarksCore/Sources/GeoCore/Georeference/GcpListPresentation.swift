import Foundation

/// What a control-point list says about each point, and in what order.
///
/// Ported from `web/src/userMaps/components/GcpList.tsx`. It lives here rather
/// than in the view because the two halves are both substantive: the column's
/// *name* changes what the number means, and the ordering rules decide which
/// point a user reaches for first. Both were arrived at by measurement, and
/// both are the kind of thing a second surface re-derives slightly differently.
public enum GcpListPresentation {
    /// The residual column, named for the question it is answering.
    ///
    /// The figure means different things per method, and the difference is the
    /// one a user acts on. Under an affine it is the fit residual — how far
    /// this point sits from the fit — so a large value really can mean a
    /// misplaced point. Under a spline the surface passes exactly through every
    /// control, so the figure is instead leave-one-out: how far the map would
    /// move *here* if this point were deleted. A large value there means the
    /// point is load-bearing, not wrong.
    ///
    /// Labelling both "Off by" cost a real sheet. Sorting descending and
    /// deleting the top of the list took true error at eight frozen checks on
    /// Fletcher sheet 19 from 43 m to 392 m, because every deletion removed the
    /// only control holding down a sparse patch.
    public struct ResidualColumn: Hashable, Sendable {
        public var label: String
        public var hint: String
    }

    public static func residualColumn(for method: GeoreferenceMethod) -> ResidualColumn {
        method == .spline
            ? ResidualColumn(
                label: "If removed",
                hint:
                    "How far this part of the map would shift if this point were deleted. A big "
                    + "number means the point is doing a lot of work — not that it is in the "
                    + "wrong place."
            )
            : ResidualColumn(
                label: "Off by",
                hint: "How far this point sits from the fitted transform."
            )
    }

    /// The one phrase for the highlighted row, so the badge and its
    /// accessibility label can never drift apart.
    ///
    /// A consistency claim, not a largest-error one: under a spline the
    /// accused row is deliberately often not the largest number in the column.
    public static let suspectLabel = "Disagrees most with the other points"

    /// Sub-metre precision would be false confidence: a hand-placed point on a
    /// 19th-century scan is not accurate to a centimetre, and trailing decimals
    /// invite a user to chase noise.
    public static func residualText(_ metres: Double?) -> String {
        guard let metres, metres.isFinite else { return "—" }
        return "\(Int(metres.rounded())) m"
    }

    public enum SortKey: String, Hashable, Sendable, CaseIterable {
        case index
        case scan
        case map
        case residual
    }

    public struct Sort: Hashable, Sendable {
        public var key: SortKey
        public var descending: Bool

        public init(key: SortKey, descending: Bool = false) {
            self.key = key
            self.descending = descending
        }
    }

    /// The points in the order the list draws them, carrying the index each one
    /// keeps whatever the order is.
    ///
    /// The number a user reads is the point's identity — the workflow refers to
    /// it, and the residual array is indexed by it — so a re-numbered list would
    /// both mislabel points and misread their residuals.
    public struct Row: Identifiable, Hashable, Sendable {
        public var point: SessionControlPoint
        /// Position in the session's own order, from zero.
        public var index: Int
        public var residualMetres: Double?
        public var isSuspect: Bool

        public var id: String { point.id }
        /// What the marker and the row both show.
        public var number: Int { index + 1 }
    }

    public static func rows(
        _ points: [SessionControlPoint],
        report: GeoreferenceResiduals.Report?,
        sort: Sort? = nil
    ) -> [Row] {
        let rows = points.enumerated().map { index, point in
            Row(
                point: point,
                index: index,
                // A report is all-or-nothing by construction, but the array is
                // read positionally and a mismatch here would label one point
                // with another's error rather than showing none.
                residualMetres: report.flatMap {
                    index < $0.metresPerControlPoint.count
                        ? $0.metresPerControlPoint[index] : nil
                },
                isSuspect: report?.mostInconsistentIndex == index
            )
        }
        guard let sort else { return rows }
        return sorted(rows, by: sort)
    }

    /// Sorts a copy, and always breaks ties on the original index so the order
    /// is total. Without that, points sharing a residual — every un-nudged
    /// imported point reads the same — would shuffle between renders, and this
    /// list is rebuilt on every touch move of a drag.
    static func sorted(_ rows: [Row], by sort: Sort) -> [Row] {
        // A point with no residual sorts last in *both* directions rather than
        // pretending to be 0 m. Zero is a real and meaningful value here — a
        // freshly imported proposal reads exactly that — so parking the
        // unknowns among it would hide the points that most need moving.
        func missingResidual(_ row: Row) -> Bool {
            sort.key == .residual && row.residualMetres == nil
        }
        func compare(_ a: Row, _ b: Row) -> Int {
            switch sort.key {
            case .index:
                return a.index - b.index
            case .scan:
                if a.point.pixel.x != b.point.pixel.x {
                    return a.point.pixel.x < b.point.pixel.x ? -1 : 1
                }
                if a.point.pixel.y != b.point.pixel.y {
                    return a.point.pixel.y < b.point.pixel.y ? -1 : 1
                }
                return 0
            case .map:
                if a.point.map.lat != b.point.map.lat {
                    return a.point.map.lat < b.point.map.lat ? -1 : 1
                }
                if a.point.map.lng != b.point.map.lng {
                    return a.point.map.lng < b.point.map.lng ? -1 : 1
                }
                return 0
            case .residual:
                guard let left = a.residualMetres, let right = b.residualMetres else { return 0 }
                if left == right { return 0 }
                return left < right ? -1 : 1
            }
        }
        return rows.sorted { a, b in
            if missingResidual(a) != missingResidual(b) { return !missingResidual(a) }
            let ordered = compare(a, b)
            if ordered != 0 { return sort.descending ? ordered > 0 : ordered < 0 }
            return a.index < b.index
        }
    }
}
