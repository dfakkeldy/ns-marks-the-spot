import Foundation
import GeoCore

/// Why an assessment lookup produced no accounts.
///
/// None of these may reach the user as "this parcel has no assessment
/// account". A parcel PVSC published nothing for returns an empty result with
/// its match method intact, and the wording for that case says what was
/// actually checked.
public nonisolated enum PVSCAssessmentFailure: Error, Equatable {
    case refused(PVSCAssessmentQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(PVSCAssessmentResponse.Failure)
}

/// Fetches assessment accounts from PVSC's open dataset.
///
/// Licensed under the Open Data & Information Government Licence – PVSC &
/// Participating Municipalities: attribution required, no acceptance gate, so
/// this takes no `ProvinceLicenceClearance`.
public nonisolated final class PVSCAssessmentFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// The accounts on record for a parcel.
    ///
    /// `noticeAAN` is the account number printed on a tax-sale notice. When one
    /// is given, that account is asked about directly and nothing is inferred
    /// from geometry — the notice is the Province's own link between the sale
    /// and the account, and it beats a point landing inside an outline.
    ///
    /// Without one, PVSC's published account points are asked for by box and
    /// then tested against the parcel's rings. A point inside the outline is
    /// where PVSC put the point. It is not proof that the account covers this
    /// parcel, that it covers only this parcel, or that no other account does.
    public func assessments(
        for parts: [PolygonHitTest.PolygonPart],
        noticeAAN: String? = nil
    ) async throws(PVSCAssessmentFailure) -> PVSCAssessmentResponse.Result {
        if let noticeAAN, PVSCAssessmentQuery.normalizeAAN(noticeAAN) != nil {
            let url: URL
            do {
                url = try PVSCAssessmentQuery.historyURL(forAAN: noticeAAN)
            } catch {
                throw .refused(error)
            }
            let page = try await page(from: url)
            return PVSCAssessmentResponse.Result(
                matchMethod: .noticeAAN,
                accounts: PVSCAssessmentResponse.accounts(from: page.rows),
                unreadableRows: page.rowCount - page.rows.count
            )
        }

        let boxes = parts.compactMap(CivicAddressFetcher.bounds(of:))
        // Nothing was asked, so nothing was learned. An empty result here would
        // render as "no account is mapped on this parcel", which is a finding.
        guard !boxes.isEmpty else { throw .refused(.noBoundary) }

        var collected: [Box] = Array(repeating: Box(rows: [], unreadableRows: 0), count: boxes.count)
        do {
            try await withThrowingTaskGroup(of: (Int, Box).self) { group in
                for (index, box) in boxes.enumerated() {
                    group.addTask { (index, try await self.allPages(in: box)) }
                }
                for try await (index, box) in group {
                    collected[index] = box
                }
            }
        } catch let failure as PVSCAssessmentFailure {
            throw failure
        } catch {
            throw .cancelled
        }

        var inside: [(aan: String, record: PVSCAssessmentResponse.Record)] = []
        var strictlyInside: Set<String> = []
        var onBoundary: Set<String> = []
        for row in collected.flatMap(\.rows) {
            guard let containment = parts
                .compactMap({ PolygonHitTest.containment(row.record.coordinate, part: $0) })
                .max()
            else { continue }
            inside.append(row)
            if containment == .interior {
                strictlyInside.insert(row.aan)
            } else {
                onBoundary.insert(row.aan)
            }
        }

        return PVSCAssessmentResponse.Result(
            matchMethod: .spatial,
            accounts: PVSCAssessmentResponse.accounts(
                from: inside, onParcelBoundary: onBoundary.subtracting(strictlyInside)
            ),
            // Overlapping boxes can re-read a row, so a multi-part parcel can
            // count one unreadable row more than once. It is a floor on how
            // much was missed, and a floor above zero is the whole point.
            unreadableRows: collected.map(\.unreadableRows).reduce(0, +)
        )
    }

    /// What one bounding box produced.
    private struct Box: Sendable {
        var rows: [(aan: String, record: PVSCAssessmentResponse.Record)]
        var unreadableRows: Int
    }

    /// Every page of one box. Socrata pages silently, so the run ends on a
    /// short page rather than on the first one.
    private func allPages(in bounds: CivicAddressQuery.Bounds) async throws(PVSCAssessmentFailure) -> Box {
        var collected = Box(rows: [], unreadableRows: 0)
        var offset = 0
        while true {
            let url: URL
            do {
                url = try PVSCAssessmentQuery.boundedQueryURL(bounds, offset: offset)
            } catch {
                throw .refused(error)
            }

            let page = try await page(from: url)
            collected.rows.append(contentsOf: page.rows)
            collected.unreadableRows += page.rowCount - page.rows.count
            // Measured on rows sent, not rows read: a full page with one
            // unreadable row is still a full page.
            if page.rowCount < PVSCAssessmentQuery.pageSize { return collected }
            offset += PVSCAssessmentQuery.pageSize
        }
    }

    private func page(
        from url: URL
    ) async throws(PVSCAssessmentFailure) -> PVSCAssessmentResponse.Page {
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

        let page: PVSCAssessmentResponse.Page
        do {
            page = try PVSCAssessmentResponse.page(from: data)
        } catch {
            throw .unreadable(error)
        }
        // Rows arrived and not one could be read. That is a failure to read the
        // dataset, not a dataset with no account in it, and only the second
        // means there is no assessment on record.
        if page.rowCount > 0 && page.rows.isEmpty {
            throw .unreadable(.unusableRows(page.rowCount))
        }
        return page
    }
}
