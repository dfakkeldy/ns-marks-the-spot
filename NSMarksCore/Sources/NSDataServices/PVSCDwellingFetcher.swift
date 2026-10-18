import Foundation

public nonisolated enum PVSCDwellingFailure: Error, Equatable {
    case refused(PVSCDwellingQuery.Refusal)
    case cancelled
    case unreachable(URLError.Code)
    case invalidHTTPStatus(Int)
    case unreadable(PVSCDwellingResponse.Failure)
}

/// Fetches residential dwelling records for accounts an assessment lookup
/// already matched.
public nonisolated final class PVSCDwellingFetcher: Sendable {
    private let transport: HTTPTransport

    public init(transport: HTTPTransport = .urlSession()) {
        self.transport = transport
    }

    /// The dwellings PVSC lists on these accounts.
    ///
    /// One request, not one per account, because the dataset takes an `in(…)`
    /// list. An account with no dwelling row simply does not come back, and an
    /// account missing from the answer is an account with no *residential*
    /// record — the dataset holds nothing else.
    public func dwellings(
        forAANs values: [String]
    ) async throws(PVSCDwellingFailure) -> PVSCDwellingResponse.Result {
        let url: URL
        do {
            url = try PVSCDwellingQuery.url(forAANs: values)
        } catch {
            throw .refused(error)
        }

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

        let page: PVSCDwellingResponse.Page
        do {
            page = try PVSCDwellingResponse.page(from: data)
        } catch {
            throw .unreadable(error)
        }
        // Rows arrived and not one could be read. Reporting that as no dwelling
        // record would turn a parsing failure into a statement about buildings.
        if page.rowCount > 0 && page.accounts.isEmpty {
            throw .unreadable(.unusableRows(page.rowCount))
        }
        return PVSCDwellingResponse.Result(
            accounts: page.accounts, unreadableRows: page.rowCount - page.readableRows
        )
    }
}
