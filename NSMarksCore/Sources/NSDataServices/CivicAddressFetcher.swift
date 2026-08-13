import Foundation
import GeoCore

/// Why a civic-address lookup produced no addresses.
///
/// As everywhere else here, none of these may reach the user as "this parcel has
/// no civic address". A parcel genuinely without one returns an empty list.
public nonisolated enum CivicAddressFailure: Error, Equatable {
    case refused(CivicAddressQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(CivicAddressResponse.Failure)
}

/// Fetches civic points from the Province's open-data portal.
///
/// Open Government Licence – Nova Scotia: attribution is required and no
/// acceptance gate is, which is why this is the one fetcher here that takes no
/// `ProvinceLicenceClearance`. `CivicAddressQuery` explains the distinction.
public nonisolated final class CivicAddressFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// The civic points that fall inside a parcel.
    ///
    /// Socrata can only be asked for a bounding box, so the box is asked for and
    /// the points outside the actual boundary are dropped here. A point on the
    /// boundary counts as inside, matching parcel identification.
    ///
    /// Being inside a parcel is not proof that the address belongs to it: the
    /// file places points by rules of its own, and a shared driveway or a
    /// mis-placed point lands where it lands.
    public func addresses(
        inside parts: [PolygonHitTest.PolygonPart]
    ) async throws(CivicAddressFailure) -> [CivicAddressResponse.CivicAddress] {
        let boxes = parts.compactMap(Self.bounds(of:))
        // Nothing was asked, so nothing was learned — the same refusal the
        // mapped-feature lookup makes, and for the same reason: an empty list
        // here would render as "no civic address on this parcel".
        guard !boxes.isEmpty else { throw .refused(.noBoundary) }

        var candidates: [[CivicAddressResponse.CivicAddress]] = Array(
            repeating: [], count: boxes.count
        )
        do {
            try await withThrowingTaskGroup(
                of: (Int, [CivicAddressResponse.CivicAddress]).self
            ) { group in
                for (index, box) in boxes.enumerated() {
                    group.addTask { (index, try await self.allPages(in: box)) }
                }
                for try await (index, page) in group {
                    candidates[index] = page
                }
            }
        } catch let failure as CivicAddressFailure {
            throw failure
        } catch {
            throw .cancelled
        }

        var seen = Set<String>()
        return candidates.flatMap(\.self).filter { address in
            parts.contains { PolygonHitTest.contains(address.coordinate, part: $0) }
                && seen.insert(address.pntid).inserted
        }
    }

    /// The civic points matching typed text, best first.
    ///
    /// Asked twice at most: once as typed, and once as the Province would spell
    /// it if the first found nothing. The second query is not a guess about what
    /// the user meant — it is the same words with the file's own conventions
    /// applied, and anything it returns is still ranked against what was typed.
    public func search(
        _ query: String
    ) async throws(CivicAddressFailure) -> [CivicAddressResponse.CivicAddress] {
        let typed = try await addresses(matching: query)
        let ranked = CivicAddressResponse.ranked(typed, for: query)
        if !ranked.isEmpty {
            return ranked
        }

        guard let official = CivicAddressQuery.officialSpelling(of: query) else { return [] }
        let alternates = try await addresses(matching: official)
        return CivicAddressResponse.ranked(alternates, for: query)
    }

    private func addresses(
        matching query: String
    ) async throws(CivicAddressFailure) -> [CivicAddressResponse.CivicAddress] {
        let url: URL
        do {
            url = try CivicAddressQuery.searchURL(query)
        } catch {
            throw .refused(error)
        }
        return try await page(from: url).addresses
    }

    /// Every page of one bounding box.
    ///
    /// Socrata pages silently: a full page means there may be more, and the run
    /// only ends on a short one. Stopping at the first page would quietly drop
    /// addresses from any parcel with more than a thousand civic points — rare,
    /// and exactly the case where the answer matters.
    private func allPages(
        in bounds: CivicAddressQuery.Bounds
    ) async throws(CivicAddressFailure) -> [CivicAddressResponse.CivicAddress] {
        var collected: [CivicAddressResponse.CivicAddress] = []
        var offset = 0
        while true {
            let url: URL
            do {
                url = try CivicAddressQuery.boundedQueryURL(bounds, offset: offset)
            } catch {
                throw .refused(error)
            }

            let page = try await page(from: url)
            collected.append(contentsOf: page.addresses)
            // Short page: the file has no more rows in this box. Measured
            // against the rows sent rather than the addresses kept — a page of
            // a thousand rows with one unusable row is still a full page, and
            // stopping there would drop every address after it.
            if page.rowCount < CivicAddressQuery.pageSize {
                return collected
            }
            offset += CivicAddressQuery.pageSize
        }
    }

    private func page(
        from url: URL
    ) async throws(CivicAddressFailure) -> CivicAddressResponse.Page {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport(URLRequest(url: url))
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

        do {
            return try CivicAddressResponse.page(from: data)
        } catch {
            throw .unreadable(error)
        }
    }

    /// The box around one polygon part, or `nil` if it has no usable positions.
    static func bounds(of part: PolygonHitTest.PolygonPart) -> CivicAddressQuery.Bounds? {
        let positions = part.flatMap(\.self).filter { $0.lat.isFinite && $0.lng.isFinite }
        guard let first = positions.first else { return nil }

        var bounds = CivicAddressQuery.Bounds(
            north: first.lat, west: first.lng, south: first.lat, east: first.lng
        )
        for position in positions.dropFirst() {
            bounds = CivicAddressQuery.Bounds(
                north: max(bounds.north, position.lat),
                west: min(bounds.west, position.lng),
                south: min(bounds.south, position.lat),
                east: max(bounds.east, position.lng)
            )
        }
        return bounds
    }
}
