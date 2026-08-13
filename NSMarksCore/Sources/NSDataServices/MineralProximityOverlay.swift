import Foundation
import GeoCore
import MapCatalog

/// Parcels lying within a kilometre of a recorded mineral occurrence.
///
/// Ported from `web/src/services/mineralProximity.ts`. This is the one layer
/// the app derives rather than fetches: it asks the occurrence inventory what
/// is in the viewport, then asks NSPRD which parcels sit within a kilometre of
/// those points. Because the parcels come out of NSPRD, drawing them is a
/// restricted use even though the occurrence half is open — which is why the
/// catalog marks the derived layer as needing the Province licence in its own
/// right.
///
/// A parcel appearing here is near a *recorded occurrence*: a report that
/// something was found somewhere nearby, at whatever precision the record
/// carries. It is not a mineral claim, not a deposit, and not a statement about
/// what is under that parcel.
public enum MineralProximityOverlay {
    /// The radius the web uses, in metres, for both halves of the derivation.
    public static let distanceMetres: Double = 1_000
    /// Below this zoom the layer is not drawn at all: the derivation is two
    /// round trips and a viewport-wide occurrence query, which at province
    /// scale is neither fast nor meaningful.
    public static let minimumZoom = 12

    /// Occurrence points per NSPRD request.
    ///
    /// The multipoint geometry travels in the request body, so the batch size
    /// is a limit on how large that body may get, not on how many parcels come
    /// back.
    static let pointsPerBatch = 500
    static let pageSize = 2_000
    static let maximumPagesPerBatch = 10

    static let occurrenceFields = [
        "geo_id", "Occ_num", "Name", "Status", "Comm_prim", "Comm_list",
    ]

    public enum Failure: Error, Equatable {
        case refused(FeatureOverlayQuery.Refusal)
        case cancelled
        case unreachable(URLError.Code)
        case invalidHTTPStatus(Int)
        case unreadable(FeatureOverlayResponse.Failure)
        case tooManyFeatures
    }

    /// One parcel near an occurrence.
    public struct Parcel: Sendable, Hashable {
        public let pid: String
        public let geometry: GeoJSONGeometry
    }

    static func batches(of points: [GeoPoint]) -> [[GeoPoint]] {
        stride(from: 0, to: points.count, by: pointsPerBatch).map { start in
            Array(points[start..<Swift.min(start + pointsPerBatch, points.count)])
        }
    }

    /// The form body for one NSPRD multipoint proximity request.
    ///
    /// Written in the web's parameter order, since that is the byte sequence
    /// the service has been exercised with.
    static func body(for points: [GeoPoint], page: Int) -> String {
        let coordinates = points
            .map { "[\(ArcGISExportURL.jsNumber($0.lng)),\(ArcGISExportURL.jsNumber($0.lat))]" }
            .joined(separator: ",")
        let geometry = #"{"points":[\#(coordinates)],"spatialReference":{"wkid":4326}}"#

        return [
            ("f", "geojson"),
            ("where", "1=1"),
            ("geometry", geometry),
            ("geometryType", "esriGeometryMultipoint"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("distance", ArcGISExportURL.jsNumber(distanceMetres)),
            ("units", "esriSRUnit_Meter"),
            ("outFields", "PID"),
            ("returnGeometry", "true"),
            ("outSR", "4326"),
            ("resultRecordCount", String(pageSize)),
            ("resultOffset", String(page * pageSize)),
            ("orderByFields", "PID"),
        ]
        .map { "\(ArcGISExportURL.formURLEncoded($0))=\(ArcGISExportURL.formURLEncoded($1))" }
        .joined(separator: "&")
    }
}

/// Derives the mineral-proximity parcels for a viewport.
public nonisolated final class MineralProximityFetcher: Sendable {
    private let transport: HTTPTransport
    private let occurrences: FeatureOverlayFetcher

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
        occurrences = FeatureOverlayFetcher(transport: transport)
    }

    /// The parcels within a kilometre of an occurrence in `bounds`.
    ///
    /// The occurrence query goes out first and its result decides whether NSPRD
    /// is asked at all: no occurrences in the viewport means no parcels, with
    /// no restricted request made.
    public func parcels(
        in bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(MineralProximityOverlay.Failure) -> [MineralProximityOverlay.Parcel] {
        // Gated on the derived layer, not on NSPRD: the derived layer is what
        // the user turned on, and the catalog marks it restricted in its own
        // right precisely so this check cannot be satisfied by the occurrence
        // half being open.
        guard clearance.allows(.mineralProximityParcels) else {
            throw .refused(.licenceNotAccepted)
        }

        let plan: FeatureOverlayQuery.Plan
        do {
            plan = try FeatureOverlayQuery.plan(
                for: .mineralOccurrences,
                bounds: bounds,
                outFields: MineralProximityOverlay.occurrenceFields,
                distanceMetres: MineralProximityOverlay.distanceMetres,
                clearance: clearance
            )
        } catch {
            throw .refused(error)
        }

        let found: FeatureOverlay
        do {
            found = try await occurrences.features(for: plan)
        } catch {
            throw MineralProximityOverlay.Failure(error)
        }

        let points = found.features.compactMap { feature -> GeoPoint? in
            guard case .point(let location) = feature.geometry else { return nil }
            return location
        }
        guard !points.isEmpty else { return [] }

        var parcels: [MineralProximityOverlay.Parcel] = []
        var seen = Set<String>()
        // Batches run in parallel, as the web's `Promise.all` does, but the
        // pages inside a batch cannot: the next offset is only known once the
        // page before it comes back short.
        let batched: [[MineralProximityOverlay.Parcel]]
        do {
            batched = try await withThrowingTaskGroup(
                of: (Int, [MineralProximityOverlay.Parcel]).self
            ) { group in
                for (index, batch) in MineralProximityOverlay.batches(of: points).enumerated() {
                    group.addTask { (index, try await self.parcels(near: batch)) }
                }
                var results: [(Int, [MineralProximityOverlay.Parcel])] = []
                for try await result in group {
                    results.append(result)
                }
                return results.sorted { $0.0 < $1.0 }.map(\.1)
            }
        } catch let failure as MineralProximityOverlay.Failure {
            throw failure
        } catch {
            throw .cancelled
        }

        for parcel in batched.joined() where seen.insert(parcel.pid).inserted {
            parcels.append(parcel)
        }
        return parcels
    }

    private func parcels(
        near points: [GeoPoint]
    ) async throws(MineralProximityOverlay.Failure) -> [MineralProximityOverlay.Parcel] {
        guard let url = ParcelQuery.layerURL.map({ $0.appendingPathComponent("query") }) else {
            throw .refused(.noServiceURL)
        }

        var found: [MineralProximityOverlay.Parcel] = []
        for page in 0..<MineralProximityOverlay.maximumPagesPerBatch {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(
                "application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type"
            )
            request.httpBody = Data(MineralProximityOverlay.body(for: points, page: page).utf8)

            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await transport(request)
            } catch is CancellationError {
                throw .cancelled
            } catch let error as URLError {
                throw error.code == .cancelled ? .cancelled : .unreachable(error.code)
            } catch {
                throw .unreachable(.unknown)
            }

            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw .invalidHTTPStatus(http.statusCode)
            }

            let result: FeatureOverlayResponse.Page
            do {
                result = try FeatureOverlayResponse.page(from: data)
            } catch {
                throw .unreadable(error)
            }

            for feature in result.features {
                // Only a textual PID is accepted. NSPRD publishes the column as
                // text and its numbers carry leading zeros; reading a numeric
                // value here would turn 01234567 into 1234567, which is a
                // different parcel's identifier rather than an unreadable one.
                guard case .string(let pid) = feature.properties["PID"] else { continue }
                found.append(
                    MineralProximityOverlay.Parcel(pid: pid, geometry: feature.geometry)
                )
            }

            if result.returnedCount < MineralProximityOverlay.pageSize {
                return found
            }
        }

        throw .tooManyFeatures
    }
}

extension MineralProximityOverlay.Failure {
    /// Carries a seam failure across without flattening what it said.
    init(_ failure: FeatureOverlayFailure) {
        switch failure {
        case .refused(let refusal): self = .refused(refusal)
        case .cancelled: self = .cancelled
        case .unreachable(let code): self = .unreachable(code)
        case .invalidHTTPStatus(let status): self = .invalidHTTPStatus(status)
        case .unreadable(let failure): self = .unreadable(failure)
        case .tooManyFeatures: self = .tooManyFeatures
        }
    }
}
