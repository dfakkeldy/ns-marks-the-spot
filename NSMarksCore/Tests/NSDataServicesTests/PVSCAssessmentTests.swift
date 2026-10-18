import Foundation
import GeoCore
import Testing

@testable import NSDataServices

/// The parcel used throughout: a unit square from (0,0) to (1,1).
private let square: [PolygonHitTest.PolygonPart] = [
    [
        [
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 1),
            GeoPoint(lat: 1, lng: 1),
            GeoPoint(lat: 1, lng: 0),
        ]
    ]
]

private func row(
    aan: String, year: Int, assessed: Double = 100_000, taxable: Double = 100_000,
    lng: Double = 0.5, lat: Double = 0.5
) -> String {
    """
    {"aan":"\(aan)","tax_year":"\(year)","assessed_value":"\(assessed)",\
    "taxable_assessed_value":"\(taxable)","x_coord":"\(lng)","y_coord":"\(lat)"}
    """
}

private func reply(_ rows: [String]) -> Data {
    Data("[\(rows.joined(separator: ","))]".utf8)
}

/// Answers whatever is asked, recording the URLs, and replies with the pages in
/// order. A single page repeats forever, which is what the one-page tests want.
private actor Recorder {
    private(set) var urls: [URL] = []
    private var pages: [Data]
    private let status: Int

    init(pages: [Data], status: Int = 200) {
        self.pages = pages
        self.status = status
    }

    func take(_ url: URL) -> (Data, Int) {
        urls.append(url)
        let page = pages.count > 1 ? pages.removeFirst() : (pages.first ?? Data("[]".utf8))
        return (page, status)
    }

    nonisolated var transport: HTTPTransport {
        HTTPTransport { request in
            let url = request.url!
            let (data, status) = await self.take(url)
            return (
                data,
                HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

@Suite("PVSC assessment queries")
struct PVSCAssessmentQueryTests {
    @Test("An account number is padded to the eight digits the dataset stores")
    func aanIsPadded() {
        #expect(PVSCAssessmentQuery.normalizeAAN("1234") == "00001234")
        #expect(PVSCAssessmentQuery.normalizeAAN("01234567") == "01234567")
        #expect(PVSCAssessmentQuery.normalizeAAN(" 123-456 ") == "00123456")
    }

    @Test("A label that is not an account number is refused rather than guessed at")
    func aLabelIsNotAnAAN() {
        #expect(PVSCAssessmentQuery.normalizeAAN("AAN 1234") == nil)
        #expect(PVSCAssessmentQuery.normalizeAAN("") == nil)
        #expect(PVSCAssessmentQuery.normalizeAAN("123456789") == nil)
        #expect(PVSCAssessmentQuery.normalizeAAN("-") == nil)
    }

    @Test("A digit that is not an ASCII digit is not an account number")
    func onlyASCIIDigitsCount() {
        // Foundation reads Devanagari and full-width digits as numbers; PVSC's
        // account numbers are ASCII, so accepting these would send a query for
        // an account nobody typed.
        #expect(PVSCAssessmentQuery.normalizeAAN("१२३४") == nil)
        #expect(PVSCAssessmentQuery.normalizeAAN("１２３４") == nil)
        #expect(PVSCAssessmentQuery.normalizeAAN("12٣4") == nil)
    }

    @Test("The account query asks for that account's last ten years, newest first")
    func historyURL() throws {
        let url = try PVSCAssessmentQuery.historyURL(forAAN: "1234")
        let query = url.query!.removingPercentEncoding!
        #expect(url.absoluteString.hasPrefix("https://www.thedatazone.ca/resource/bt58-qu28.json?"))
        #expect(query.contains("$where=aan='00001234'"))
        // `+` for the space, because `URLSearchParams` writes it that way and
        // the request string is the thing being matched to the web's.
        #expect(query.contains("$order=tax_year+DESC"))
        #expect(query.contains("$limit=10"))
        #expect(
            query.contains(
                "$select=aan,tax_year,assessed_value,taxable_assessed_value,x_coord,y_coord"
            )
        )
    }

    @Test("The spatial query asks a box in the web's north, west, south, east order")
    func boundedURL() throws {
        let url = try PVSCAssessmentQuery.boundedQueryURL(
            CivicAddressQuery.Bounds(north: 45.5, west: -63.75, south: 45, east: -63),
            offset: 2_000
        )
        let query = url.query!.removingPercentEncoding!
        #expect(query.contains("$where=within_box(location,45.5,-63.75,45,-63)"))
        #expect(query.contains("$order=aan,tax_year+DESC"))
        #expect(query.contains("$limit=1000"))
        #expect(query.contains("$offset=2000"))
    }

    @Test("Both request strings are the ones the web sends, byte for byte")
    func requestStringsMatchTheWeb() throws {
        // Captured from `URLSearchParams` in node against the web's own
        // `buildPvscAanQueryUrl` and `buildPvscSpatialQueryUrl`. Socrata is
        // strict about `$where`, so this is worth pinning rather than
        // approximating.
        #expect(
            try PVSCAssessmentQuery.historyURL(forAAN: "1234").absoluteString
                == "https://www.thedatazone.ca/resource/bt58-qu28.json?"
                    + "%24select=aan%2Ctax_year%2Cassessed_value%2Ctaxable_assessed_value"
                    + "%2Cx_coord%2Cy_coord&%24where=aan%3D%2700001234%27"
                    + "&%24order=tax_year+DESC&%24limit=10"
        )
        #expect(
            try PVSCAssessmentQuery.boundedQueryURL(
                CivicAddressQuery.Bounds(north: 45.5, west: -63.75, south: 45, east: -63),
                offset: 2_000
            ).absoluteString
                == "https://www.thedatazone.ca/resource/bt58-qu28.json?"
                    + "%24select=aan%2Ctax_year%2Cassessed_value%2Ctaxable_assessed_value"
                    + "%2Cx_coord%2Cy_coord&%24where=within_box%28location%2C45.5%2C-63.75"
                    + "%2C45%2C-63%29&%24order=aan%2Ctax_year+DESC&%24limit=1000&%24offset=2000"
        )
    }

    @Test("A box that is not a number is refused, not sent")
    func nonFiniteBoundsAreRefused() {
        #expect(throws: PVSCAssessmentQuery.Refusal.noBoundary) {
            try PVSCAssessmentQuery.boundedQueryURL(
                CivicAddressQuery.Bounds(north: .nan, west: 0, south: 0, east: 0), offset: 0
            )
        }
    }
}

@Suite("PVSC assessment rows")
struct PVSCAssessmentResponseTests {
    @Test("A row is read into an account number, a year, two figures, and a point")
    func rowIsRead() throws {
        let page = try PVSCAssessmentResponse.page(
            from: reply([row(aan: "1234", year: 2026, assessed: 231_500, taxable: 198_000)])
        )
        #expect(page.rowCount == 1)
        #expect(page.rows.count == 1)
        #expect(page.rows[0].aan == "00001234")
        #expect(page.rows[0].record.taxYear == 2026)
        #expect(page.rows[0].record.assessedValue == 231_500)
        #expect(page.rows[0].record.taxableAssessedValue == 198_000)
        #expect(page.rows[0].record.coordinate == GeoPoint(lat: 0.5, lng: 0.5))
    }

    @Test("A blank figure drops the row rather than reaching the screen as zero")
    func aBlankFigureIsNotZero() throws {
        let blank = """
            {"aan":"00001234","tax_year":"2026","assessed_value":"",\
            "taxable_assessed_value":"1","x_coord":"0.5","y_coord":"0.5"}
            """
        let page = try PVSCAssessmentResponse.page(from: reply([blank]))
        #expect(page.rowCount == 1)
        #expect(page.rows.isEmpty)
    }

    @Test("A numeric account number is dropped, because its leading zeros are gone")
    func aNumericAANIsDropped() throws {
        let numeric = """
            {"aan":1234,"tax_year":"2026","assessed_value":"1",\
            "taxable_assessed_value":"1","x_coord":"0.5","y_coord":"0.5"}
            """
        let page = try PVSCAssessmentResponse.page(from: reply([numeric]))
        #expect(page.rows.isEmpty)
    }

    @Test("A coordinate off the globe drops the row")
    func anImpossibleCoordinateIsDropped() throws {
        let page = try PVSCAssessmentResponse.page(
            from: reply([row(aan: "1", year: 2026, lng: -181, lat: 0)])
        )
        #expect(page.rows.isEmpty)
    }

    @Test("One odd cell drops its own row and leaves the rest of the page readable")
    func anOddCellDoesNotTakeThePageDown() throws {
        let odd = """
            {"aan":true,"tax_year":"2026","assessed_value":"1",\
            "taxable_assessed_value":"1","x_coord":"0.5","y_coord":"0.5"}
            """
        let page = try PVSCAssessmentResponse.page(from: reply([odd, row(aan: "2", year: 2026)]))
        #expect(page.rowCount == 2)
        #expect(page.rows.count == 1)
        #expect(page.rows[0].aan == "00000002")
    }

    @Test("A reply that is not a list of rows is unreadable, not empty")
    func aMalformedReplyIsNotAnEmptyDataset() {
        #expect(throws: PVSCAssessmentResponse.Failure.malformed) {
            try PVSCAssessmentResponse.page(from: Data(#"{"error":"nope"}"#.utf8))
        }
    }

    @Test("An account keeps one record per year, newest first, and accounts sort by number")
    func accountsAreGrouped() throws {
        let page = try PVSCAssessmentResponse.page(
            from: reply([
                row(aan: "22", year: 2024, assessed: 1),
                row(aan: "11", year: 2026, assessed: 2),
                row(aan: "11", year: 2025, assessed: 3),
                row(aan: "11", year: 2026, assessed: 999),
            ])
        )
        let accounts = PVSCAssessmentResponse.accounts(from: page.rows)
        #expect(accounts.map(\.aan) == ["00000011", "00000022"])
        #expect(accounts[0].records.map(\.taxYear) == [2026, 2025])
        // The first spelling of a repeated year wins; the later one is not
        // added to it, because PVSC never published their sum.
        #expect(accounts[0].current?.assessedValue == 2)
    }
}

@Suite("PVSC assessment lookups")
struct PVSCAssessmentFetcherTests {
    @Test("An account named on a notice is asked about directly")
    func noticeAANIsAskedDirectly() async throws {
        let recorder = Recorder(pages: [reply([row(aan: "1234", year: 2026)])])
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square, noticeAAN: "1234")

        #expect(result.matchMethod == .noticeAAN)
        #expect(result.accounts.map(\.aan) == ["00001234"])
        let urls = await recorder.urls
        #expect(urls.count == 1)
        #expect(urls[0].query!.removingPercentEncoding!.contains("aan='00001234'"))
    }

    @Test("A notice account is reported even when its point is nowhere near the parcel")
    func aNoticeAccountIsNotSecondGuessedByGeometry() async throws {
        // The notice is the Province's own link between the sale and the
        // account. A point that disagrees is a mapping problem, not grounds for
        // dropping the account the notice named.
        let recorder = Recorder(pages: [reply([row(aan: "1234", year: 2026, lng: -63, lat: 45)])])
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square, noticeAAN: "1234")
        #expect(result.accounts.map(\.aan) == ["00001234"])
    }

    @Test("Text that is not an account number falls through to the parcel's own geometry")
    func junkNoticeTextDoesNotBecomeAnAccountQuery() async throws {
        let recorder = Recorder(pages: [reply([])])
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square, noticeAAN: "see notice")

        #expect(result.matchMethod == .spatial)
        let urls = await recorder.urls
        #expect(urls.count == 1)
        #expect(urls[0].query!.removingPercentEncoding!.contains("within_box"))
    }

    @Test("A point outside the outline is not an account on this parcel")
    func aPointInTheBoxButOutsideTheParcelIsNotAMatch() async throws {
        // An L-shaped parcel: the box covers the notch, the outline does not.
        let notched: [PolygonHitTest.PolygonPart] = [
            [
                [
                    GeoPoint(lat: 0, lng: 0),
                    GeoPoint(lat: 0, lng: 1),
                    GeoPoint(lat: 0.4, lng: 1),
                    GeoPoint(lat: 0.4, lng: 0.4),
                    GeoPoint(lat: 1, lng: 0.4),
                    GeoPoint(lat: 1, lng: 0),
                ]
            ]
        ]
        let recorder = Recorder(
            pages: [
                reply([
                    row(aan: "1", year: 2026, lng: 0.2, lat: 0.2),
                    row(aan: "2", year: 2026, lng: 0.8, lat: 0.8),
                ])
            ]
        )
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: notched)

        #expect(result.matchMethod == .spatial)
        #expect(result.accounts.map(\.aan) == ["00000001"])
    }

    @Test("Paging runs until a short page, so account 1001 is not lost")
    func pagingRunsToTheEnd() async throws {
        let full = (0..<PVSCAssessmentQuery.pageSize).map { row(aan: String($0), year: 2026) }
        let recorder = Recorder(pages: [reply(full), reply([row(aan: "99999999", year: 2026)])])
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square)

        #expect(result.accounts.count == PVSCAssessmentQuery.pageSize + 1)
        let urls = await recorder.urls
        #expect(urls.count == 2)
        #expect(urls[1].query!.removingPercentEncoding!.contains("$offset=1000"))
    }

    @Test("A full page of unreadable rows still pages on, because the count is what arrived")
    func afullPageOfDroppedRowsStillPages() async throws {
        let unreadable = (0..<PVSCAssessmentQuery.pageSize).map { index in
            """
            {"aan":"\(index)","tax_year":"2026","assessed_value":"",\
            "taxable_assessed_value":"1","x_coord":"0.5","y_coord":"0.5"}
            """
        }
        let recorder = Recorder(pages: [reply(unreadable), reply([])])
        // Every row on page one is dropped, so the page reads as unusable
        // rather than as a page with nothing on it.
        await #expect(throws: PVSCAssessmentFailure.unreadable(.unusableRows(1_000))) {
            try await PVSCAssessmentFetcher(transport: recorder.transport).assessments(for: square)
        }
    }

    @Test("A parcel with no rings is refused rather than answered with no accounts")
    func noBoundaryIsNotAnEmptyAnswer() async {
        let recorder = Recorder(pages: [reply([])])
        await #expect(throws: PVSCAssessmentFailure.refused(.noBoundary)) {
            try await PVSCAssessmentFetcher(transport: recorder.transport).assessments(for: [])
        }
        let urls = await recorder.urls
        #expect(urls.isEmpty)
    }

    @Test("An outage is an outage, not a parcel with no assessment account")
    func anOutageIsNotAnAbsence() async {
        let recorder = Recorder(pages: [reply([])], status: 503)
        await #expect(throws: PVSCAssessmentFailure.invalidHTTPStatus(503)) {
            try await PVSCAssessmentFetcher(transport: recorder.transport).assessments(for: square)
        }
    }

    @Test("A parcel PVSC published nothing for answers with no accounts and says how it looked")
    func anEmptyAnswerKeepsItsMatchMethod() async throws {
        let recorder = Recorder(pages: [reply([])])
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square)
        #expect(result.matchMethod == .spatial)
        #expect(result.accounts.isEmpty)
    }

    @Test("Rows that could not be read are counted, not quietly dropped")
    func aPartlyUnreadablePageSaysHowMuchWasMissed() async throws {
        let recorder = Recorder(
            pages: [
                reply([
                    row(aan: "1", year: 2026),
                    // A blank figure drops this row. One account comes back
                    // where PVSC sent two, and only this count says so.
                    """
                    {"aan":"2","tax_year":"2026","assessed_value":"",\
                    "taxable_assessed_value":"1","x_coord":"0.5","y_coord":"0.5"}
                    """,
                ])
            ]
        )
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square)

        #expect(result.accounts.map(\.aan) == ["00000001"])
        #expect(result.unreadableRows == 1)
    }

    @Test("An account point on the parcel's edge is marked, because the edge is shared")
    func aPointOnTheEdgeIsFlagged() async throws {
        let recorder = Recorder(
            pages: [
                reply([
                    row(aan: "1", year: 2026, lng: 0.5, lat: 0.5),
                    // Exactly on the southern edge, which the neighbour shares.
                    row(aan: "2", year: 2026, lng: 0.5, lat: 0),
                ])
            ]
        )
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square)

        #expect(result.accounts.map(\.aan) == ["00000001", "00000002"])
        #expect(result.accounts.map(\.onParcelBoundary) == [false, true])
    }

    @Test("An account with a point inside as well as one on the edge is not marked")
    func anAccountWithAnInteriorPointIsNotFlagged() async throws {
        let recorder = Recorder(
            pages: [
                reply([
                    row(aan: "1", year: 2026, lng: 0.5, lat: 0),
                    row(aan: "1", year: 2025, lng: 0.5, lat: 0.5),
                ])
            ]
        )
        let result = try await PVSCAssessmentFetcher(transport: recorder.transport)
            .assessments(for: square)

        // One of this account's points is unambiguously on the parcel. Calling
        // the account "on the boundary" on the strength of the other would
        // understate what PVSC published.
        #expect(result.accounts.map(\.onParcelBoundary) == [false])
    }
}
