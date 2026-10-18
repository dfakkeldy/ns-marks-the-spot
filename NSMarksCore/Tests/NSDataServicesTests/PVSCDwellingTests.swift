import Foundation
import Testing

@testable import NSDataServices

private func reply(_ rows: [String]) -> Data {
    Data("[\(rows.joined(separator: ","))]".utf8)
}

private func answering(_ data: Data, status: Int = 200) -> HTTPTransport {
    HTTPTransport { request in
        (
            data,
            HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil
            )!
        )
    }
}

@Suite("PVSC dwelling queries")
struct PVSCDwellingQueryTests {
    @Test("The request string is the one the web sends, byte for byte")
    func requestStringMatchesTheWeb() throws {
        #expect(
            try PVSCDwellingQuery.url(forAANs: ["1234", "5678"]).absoluteString
                == "https://www.thedatazone.ca/resource/a859-xvcs.json?"
                    + "%24select=aan%2Cyear_built%2Cstyle%2Csquare_foot_living_area"
                    + "%2Cliving_units%2Cbathrooms%2Cgarage%2Cunder_construction"
                    + "&%24where=aan+in%28%2700001234%27%2C%2700005678%27%29"
                    + "&%24order=aan%2Cyear_built+DESC&%24limit=100"
        )
    }

    @Test("An account asked about twice is asked about once")
    func duplicatesAreDropped() {
        #expect(PVSCDwellingQuery.accountNumbers(["1234", "00001234", " 1234 "]) == ["00001234"])
    }

    @Test("Text that is not an account number is dropped, and the rest is still asked")
    func junkIsDroppedNotGuessedAt() {
        #expect(PVSCDwellingQuery.accountNumbers(["see notice", "1234"]) == ["00001234"])
    }

    @Test("No usable account is a refusal, not an empty question")
    func nothingToAskAboutIsRefused() {
        #expect(throws: PVSCDwellingQuery.Refusal.noAccounts) {
            try PVSCDwellingQuery.url(forAANs: ["see notice", ""])
        }
    }
}

@Suite("PVSC dwelling rows")
struct PVSCDwellingResponseTests {
    @Test("A row is read into the characteristics PVSC published")
    func rowIsRead() throws {
        let page = try PVSCDwellingResponse.page(
            from: reply([
                """
                {"aan":"1234","year_built":"1962","style":"1 Storey",\
                "square_foot_living_area":"1240","living_units":"1",\
                "bathrooms":"1.5","garage":"Y","under_construction":"N"}
                """
            ])
        )
        let dwelling = try #require(page.accounts.first?.dwellings.first)
        #expect(page.accounts.first?.aan == "00001234")
        #expect(dwelling.yearBuilt == 1962)
        #expect(dwelling.style == "1 Storey")
        #expect(dwelling.squareFeetLivingArea == 1240)
        #expect(dwelling.livingUnits == 1)
        #expect(dwelling.bathrooms == 1.5)
        #expect(dwelling.garage == true)
        #expect(dwelling.underConstruction == false)
    }

    @Test("A row that names an account and publishes nothing else is still a dwelling")
    func aBareRowIsStillARecord() throws {
        let page = try PVSCDwellingResponse.page(from: reply([#"{"aan":"1234"}"#]))
        let dwelling = try #require(page.accounts.first?.dwellings.first)
        #expect(dwelling.yearBuilt == nil)
        #expect(dwelling.style == nil)
        #expect(dwelling.garage == nil)
    }

    @Test("An unmarked flag is unknown, not a no")
    func anUnmarkedFlagIsNotAFalse() throws {
        let page = try PVSCDwellingResponse.page(
            from: reply([#"{"aan":"1234","garage":"","under_construction":"maybe"}"#])
        )
        let dwelling = try #require(page.accounts.first?.dwellings.first)
        #expect(dwelling.garage == nil)
        #expect(dwelling.underConstruction == nil)
    }

    @Test("A blank year is missing, not the year zero")
    func aBlankYearIsNotZero() throws {
        let page = try PVSCDwellingResponse.page(
            from: reply([#"{"aan":"1234","year_built":"","square_foot_living_area":" "}"#])
        )
        let dwelling = try #require(page.accounts.first?.dwellings.first)
        #expect(dwelling.yearBuilt == nil)
        #expect(dwelling.squareFeetLivingArea == nil)
    }

    @Test("A row with no readable account number is dropped")
    func aRowWithoutAnAccountIsDropped() throws {
        let page = try PVSCDwellingResponse.page(
            from: reply([#"{"aan":"not an aan","year_built":"1962"}"#])
        )
        #expect(page.rowCount == 1)
        #expect(page.accounts.isEmpty)
    }

    @Test("Dwellings list newest first, undated ones last, and are never merged")
    func dwellingsAreOrdered() throws {
        let page = try PVSCDwellingResponse.page(
            from: reply([
                #"{"aan":"22","year_built":"1990"}"#,
                #"{"aan":"11","style":"Shed"}"#,
                #"{"aan":"11","year_built":"1962"}"#,
                #"{"aan":"11","year_built":"2001"}"#,
            ])
        )
        #expect(page.accounts.map(\.aan) == ["00000011", "00000022"])
        #expect(page.accounts[0].dwellings.map(\.yearBuilt) == [2001, 1962, nil])
        // Three rows, three dwellings. Two records on one account are two
        // buildings PVSC listed, not one to be reconciled here.
        #expect(page.accounts[0].dwellings.count == 3)
    }

    @Test("A reply that is not a list of rows is unreadable, not an absence of dwellings")
    func aMalformedReplyIsNotAnEmptyDataset() {
        #expect(throws: PVSCDwellingResponse.Failure.malformed) {
            try PVSCDwellingResponse.page(from: Data(#"{"error":"nope"}"#.utf8))
        }
    }
}

@Suite("PVSC dwelling lookups")
struct PVSCDwellingFetcherTests {
    @Test("The accounts come back grouped")
    func accountsComeBack() async throws {
        let result = try await PVSCDwellingFetcher(
            transport: answering(reply([#"{"aan":"1234","year_built":"1962"}"#]))
        ).dwellings(forAANs: ["1234"])

        #expect(result.accounts.map(\.aan) == ["00001234"])
        #expect(result.unreadableRows == 0)
    }

    @Test("An account PVSC lists no dwelling for comes back with none")
    func anAccountWithNoDwellingIsEmptyNotAFailure() async throws {
        let result = try await PVSCDwellingFetcher(transport: answering(reply([])))
            .dwellings(forAANs: ["1234"])
        #expect(result.accounts.isEmpty)
        #expect(result.unreadableRows == 0)
    }

    @Test("A page that was partly unreadable says so rather than reading as a short list")
    func partiallyUnreadableRowsAreCounted() async throws {
        let result = try await PVSCDwellingFetcher(
            transport: answering(
                reply([#"{"aan":"1234","year_built":"1962"}"#, #"{"aan":"not an aan"}"#])
            )
        ).dwellings(forAANs: ["1234"])

        #expect(result.accounts.map(\.aan) == ["00001234"])
        // The row PVSC sent and this app could not read. Silence here would
        // render one dwelling as the whole answer for these accounts.
        #expect(result.unreadableRows == 1)
    }

    @Test("An outage is an outage, not a parcel with no dwelling")
    func anOutageIsNotAnAbsence() async {
        await #expect(throws: PVSCDwellingFailure.invalidHTTPStatus(503)) {
            try await PVSCDwellingFetcher(transport: answering(reply([]), status: 503))
                .dwellings(forAANs: ["1234"])
        }
    }

    @Test("Rows that all fail to read are unreadable, not an absence")
    func aPageOfUnreadableRowsIsNotAnAbsence() async {
        await #expect(throws: PVSCDwellingFailure.unreadable(.unusableRows(1))) {
            try await PVSCDwellingFetcher(
                transport: answering(reply([#"{"aan":"not an aan"}"#]))
            ).dwellings(forAANs: ["1234"])
        }
    }

    @Test("With no account to ask about, nothing is sent and nothing is claimed")
    func noAccountsIsRefusedWithoutARequest() async {
        let sent = Sent()
        await #expect(throws: PVSCDwellingFailure.refused(.noAccounts)) {
            try await PVSCDwellingFetcher(transport: sent.transport).dwellings(forAANs: [])
        }
        #expect(await sent.count == 0)
    }

    private actor Sent {
        private(set) var count = 0

        func record() { count += 1 }

        nonisolated var transport: HTTPTransport {
            HTTPTransport { request in
                await self.record()
                return (
                    Data("[]".utf8),
                    HTTPURLResponse(
                        url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
                    )!
                )
            }
        }
    }
}
