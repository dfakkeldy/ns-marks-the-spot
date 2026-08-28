import Foundation

/// Every historical tax-sale record this build carries, checked before it is
/// offered to anyone.
///
/// The validation is the web's, rule for rule, and it is fail-closed in the
/// same way: a dataset that breaks an invariant is not partially loaded, it is
/// dropped and the reason is reported. A record that claims a sale with no
/// winning bid, or a match method on a listing that was never matched, is a
/// record that would tell a user something the sources did not say — and the
/// safe thing to do with it is not to draw it.
public struct HistoricalTaxSaleCatalog: Sendable {
    public let events: [HistoricalTaxSaleEvent]
    public let records: [HistoricalTaxSaleRecord]

    /// Why a dataset this build ships is absent from the two arrays above.
    ///
    /// Surfaced rather than swallowed, for the same reason the current notices
    /// surface theirs: a historical panel that quietly shows 414 records when
    /// the build ships 468 reads as a complete history.
    public let unreadable: [Unreadable]

    public struct Unreadable: Error, Equatable, Sendable {
        public let dataset: String
        public let reason: String
    }

    public static let bundled = HistoricalTaxSaleCatalog()

    public init() {
        var events: [HistoricalTaxSaleEvent] = []
        var records: [HistoricalTaxSaleRecord] = []
        var unreadable: [Unreadable] = []

        do {
            let dataset = try Self.decodeDataset()
            events = dataset.events
            records = dataset.records
        } catch {
            unreadable.append(
                Unreadable(
                    dataset: SharedData.Dataset.historicalTaxSales.rawValue,
                    reason: Self.describe(error)
                )
            )
        }

        // CBRM's result PDF is reconciled against CBRM's own notice at load,
        // not baked into the dataset, so a notice edit that no longer agrees
        // with the published results drops the sale rather than pairing rows
        // that do not belong together.
        do {
            let cbrm = try Self.cbrmResultEvent()
            events.append(cbrm.event)
            records.append(contentsOf: cbrm.records)
        } catch {
            unreadable.append(
                Unreadable(
                    dataset: SharedData.Dataset.cbrmTaxSaleResults.rawValue,
                    reason: Self.describe(error)
                )
            )
        }

        do {
            try Self.validate(events: events, records: records)
            self.events = events
            self.records = records
            self.unreadable = unreadable
        } catch {
            // The whole set fails together. A validation error is a statement
            // that this build's idea of what the sources say is wrong, and
            // there is no principled way to keep the half of it that happened
            // to pass.
            self.events = []
            self.records = []
            self.unreadable = unreadable + [
                Unreadable(
                    dataset: SharedData.Dataset.historicalTaxSales.rawValue,
                    reason: Self.describe(error)
                )
            ]
        }
    }

    public init(
        events: [HistoricalTaxSaleEvent],
        records: [HistoricalTaxSaleRecord],
        unreadable: [Unreadable] = []
    ) {
        self.events = events
        self.records = records
        self.unreadable = unreadable
    }

    // MARK: - Reading

    public func event(id: String) -> HistoricalTaxSaleEvent? {
        events.first { $0.id == id }
    }

    /// Every historical record naming this PID, with its sale.
    ///
    /// A parcel can appear in several: a property sold twice is two records,
    /// and both are part of what the sources say about it.
    public func contexts(forPID pid: String) -> [HistoricalRecordContext] {
        records.compactMap { record in
            guard record.pids.contains(pid), let event = event(id: record.eventID) else {
                return nil
            }
            return HistoricalRecordContext(event: event, record: record)
        }
    }

    /// The PIDs worth asking NSPRD for.
    ///
    /// Matched records only. An ambiguous or unmatched listing has no parcel
    /// this build is willing to name, and drawing a guess would attach a real
    /// sale to the wrong piece of ground.
    public func matchedPIDs(
        in records: [HistoricalTaxSaleRecord]? = nil
    ) -> [String] {
        (records ?? self.records)
            .filter { $0.nsprdMatchStatus == .matched }
            .flatMap(\.pids)
            .deduplicatedPreservingOrder()
    }

    /// The municipalities in the record set, by ID, in first-seen order.
    public var municipalities: [(id: String, label: String)] {
        var seen: Set<String> = []
        return events.compactMap { event in
            guard seen.insert(event.municipalityID).inserted else { return nil }
            return (event.municipalityID, event.shortMunicipality)
        }
    }

    /// Sale years, newest first, as the web lists them.
    public var years: [String] {
        Set(events.map(\.saleYear)).sorted(by: >)
    }

    /// The outcomes actually present, in the web's display order. A filter
    /// offering "Redeemed" when nothing was redeemed invites the reader to
    /// conclude the dataset was searched and came back empty.
    public var outcomes: [HistoricalOutcome] {
        let order: [HistoricalOutcome] = [.sold, .unsold, .redeemed, .withdrawn, .cancelled, .unknown]
        return order.filter { outcome in records.contains { $0.outcome == outcome } }
    }

    // MARK: - Filtering

    public struct Filter: Sendable, Hashable {
        public var municipalityID: String?
        public var year: String?
        public var outcome: HistoricalOutcome?

        public init(
            municipalityID: String? = nil,
            year: String? = nil,
            outcome: HistoricalOutcome? = nil
        ) {
            self.municipalityID = municipalityID
            self.year = year
            self.outcome = outcome
        }
    }

    public func records(matching filter: Filter) -> [HistoricalTaxSaleRecord] {
        records.filter { record in
            guard let event = event(id: record.eventID) else { return false }
            if let municipality = filter.municipalityID, event.municipalityID != municipality {
                return false
            }
            if let year = filter.year, event.saleYear != year { return false }
            if let outcome = filter.outcome, record.outcome != outcome { return false }
            return true
        }
    }

    // MARK: - Loading

    private struct Dataset: Decodable {
        let schemaVersion: Int
        let events: [HistoricalTaxSaleEvent]
        let records: [HistoricalTaxSaleRecord]
    }

    private struct Invalid: Error, Equatable {
        let reason: String
    }

    private static func decodeDataset() throws -> Dataset {
        let dataset = try JSONDecoder().decode(
            Dataset.self,
            from: SharedData.bytes(of: .historicalTaxSales)
        )
        guard dataset.schemaVersion == 1 else {
            throw Invalid(reason: "Unsupported historical tax-sale dataset schema.")
        }
        return dataset
    }

    private static func describe(_ error: Error) -> String {
        if let invalid = error as? Invalid { return invalid.reason }
        if let missing = error as? SharedData.MissingResource {
            return "\(missing.name) is not in this build."
        }
        return String(describing: error)
    }

    // MARK: - CBRM's published results

    private struct CBRMResultSnapshot: Decodable {
        struct Row: Decodable {
            let lien: String
            let aan: String
            let pid: String
            let minimumBidCents: Int
            let redemptionCategory: RedemptionCategory
            let outcome: HistoricalOutcome
            let winningBidCents: Int?
            let resultNote: String?
        }

        let schemaVersion: Int
        let eventId: String
        let saleDate: String
        let landingPage: URL?
        let source: URL
        let retrievedDate: String
        let sourceDocumentSha256: String
        let ownerNamesExcluded: Bool
        let resultRowCount: Int
        let results: [Row]
    }

    /// CBRM's sale as a historical event, built by reconciling its result PDF
    /// against its own notice.
    ///
    /// Every published row must agree with the notice on AAN, PID, amount, and
    /// redemption treatment before it is used. A row that does not agree is not
    /// a row about the property the notice named, and the sale is dropped
    /// whole rather than half-paired.
    private static func cbrmResultEvent() throws -> (
        event: HistoricalTaxSaleEvent,
        records: [HistoricalTaxSaleRecord]
    ) {
        let snapshot = try JSONDecoder().decode(
            CBRMResultSnapshot.self,
            from: SharedData.bytes(of: .cbrmTaxSaleResults)
        )
        let noticeBytes = try SharedData.bytes(of: .cbrmTaxSale)
        let notice = try TaxSaleSnapshots.cbrm(
            noticeBytes,
            datasetSHA256: SharedData.sha256(of: noticeBytes)
        )

        guard snapshot.schemaVersion == 1,
              snapshot.eventId == notice.id,
              snapshot.saleDate == "2026-07-21",
              snapshot.ownerNamesExcluded,
              snapshot.resultRowCount == snapshot.results.count,
              snapshot.source.absoluteString.hasPrefix("https://cbrm.ns.ca/"),
              snapshot.sourceDocumentSha256.count == 64,
              snapshot.sourceDocumentSha256.allSatisfy({ $0.isHexDigit && !$0.isUppercase })
        else {
            throw Invalid(reason: "The CBRM result snapshot receipt is invalid.")
        }

        var noticeByLien: [String: TaxSaleListing] = [:]
        for listing in notice.listings {
            guard let lien = listing.lien else { continue }
            noticeByLien[lien] = listing
        }

        var resultByLien: [String: CBRMResultSnapshot.Row] = [:]
        for row in snapshot.results {
            guard let listing = noticeByLien[row.lien], resultByLien[row.lien] == nil else {
                throw Invalid(
                    reason: "CBRM result \(row.lien) is missing from the notice or duplicated."
                )
            }
            guard listing.aan == row.aan,
                  listing.pids.contains(row.pid),
                  listing.financial.amountCents == row.minimumBidCents,
                  listing.redemptionCategory == row.redemptionCategory else {
                throw Invalid(
                    reason: "CBRM result \(row.lien) does not match its owner-free notice fields."
                )
            }
            switch (row.outcome, row.winningBidCents) {
            case (.sold, let bid?) where bid >= 0: break
            case (.unknown, nil): break
            default:
                throw Invalid(reason: "CBRM result \(row.lien) has an invalid outcome.")
            }
            resultByLien[row.lien] = row
        }

        let sold = resultByLien.values.count { $0.outcome == .sold }
        let unknown = resultByLien.count - sold
        let omitted = notice.listings.count - resultByLien.count

        // Assembled in pieces: as one concatenated literal with four
        // interpolations the type-checker gives up on it.
        var sourceNotes = "The owner-free official notice was reconciled and all exact PIDs "
        sourceNotes += "matched NSPRD. CBRM's \(snapshot.resultRowCount)-row official result PDF "
        sourceNotes += "was rendered and reviewed: \(sold) rows print numeric winning bids, "
        sourceNotes += "\(unknown) published result rows stay outcome-unknown because no numeric "
        sourceNotes += "bid is printed, and \(omitted) notice rows absent from the result PDF "
        sourceNotes += "also stay outcome-unknown. Owner fields were discarded before the public "
        sourceNotes += "snapshot was written."

        let event = HistoricalTaxSaleEvent(
            id: notice.id,
            municipalityID: notice.municipalityID,
            municipality: notice.municipality,
            shortMunicipality: notice.shortMunicipality,
            saleDate: snapshot.saleDate,
            saleMethod: .publicAuction,
            listingIdentifierLabel: "Lien",
            advertisedAmountLabel: "Minimum bid",
            noticeURL: notice.sourceURL,
            landingPageURL: notice.landingPageURL,
            resultStatus: .verified,
            resultURL: snapshot.source,
            retrievedOn: snapshot.retrievedDate,
            noticeSnapshotDate: "2026-07-19",
            resultSnapshotDate: snapshot.retrievedDate,
            noticeSHA256: "5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566",
            resultSHA256: snapshot.sourceDocumentSha256,
            sourceNotes: sourceNotes
        )

        let records = notice.listings.map { listing -> HistoricalTaxSaleRecord in
            let result = listing.lien.flatMap { resultByLien[$0] }
            return HistoricalTaxSaleRecord(
                eventID: notice.id,
                recordID: listing.recordID,
                listingIdentifier: listing.lien ?? listing.recordID,
                pids: listing.pids,
                civicDescription: [listing.addressOrDescription, listing.location]
                    .compactMap { $0 }
                    .joined(separator: " · "),
                advertisedAmountCents: listing.financial.amountCents,
                winningBidCents: result?.winningBidCents,
                outcome: result?.outcome ?? .unknown,
                // A notice row the result PDF does not carry is not a row that
                // failed to sell. Saying so is the whole note.
                resultNote: result?.resultNote
                    ?? (result == nil
                        ? "The official result PDF does not carry this notice row; no outcome "
                            + "or winning bid is inferred."
                        : nil),
                redemptionLabel: listing.redemptionLabel,
                nsprdMatchStatus: .matched,
                nsprdMatchMethod: .exactOfficialPID,
                reviewState: result == nil ? .noticeVerified : .visuallyVerified
            )
        }

        return (event, records)
    }

    // MARK: - The invariants

    static func validate(
        events: [HistoricalTaxSaleEvent],
        records: [HistoricalTaxSaleRecord]
    ) throws {
        let eventIDs = Set(events.map(\.id))
        guard eventIDs.count == events.count else {
            throw Invalid(reason: "Historical tax-sale event IDs must be unique.")
        }

        for event in events {
            if event.resultStatus == .verified,
               event.resultURL == nil || event.resultSnapshotDate == nil || event.resultSHA256 == nil {
                throw Invalid(
                    reason: "Verified historical event \(event.id) requires a result receipt."
                )
            }
            if event.resultStatus == .awaitingOfficialResults,
               event.landingPageURL == nil || event.resultCheckedOn == nil {
                throw Invalid(
                    reason: "Historical event \(event.id) awaiting results requires a checked "
                        + "landing page."
                )
            }
        }

        var recordIDs: Set<String> = []
        for record in records {
            guard eventIDs.contains(record.eventID) else {
                throw Invalid(reason: "Historical record \(record.recordID) has no event.")
            }
            guard recordIDs.insert(record.recordID).inserted else {
                throw Invalid(reason: "Duplicate historical record ID \(record.recordID).")
            }
            guard !record.pids.isEmpty,
                  record.pids.allSatisfy({ $0.count == 8 && $0.allSatisfy(\.isNumber) }) else {
                throw Invalid(reason: "Historical record \(record.recordID) has an invalid PID.")
            }
            guard Set(record.pids).count == record.pids.count else {
                throw Invalid(reason: "Historical record \(record.recordID) repeats a PID.")
            }
            guard record.advertisedAmountCents > 0,
                  record.winningBidCents.map({ $0 >= 0 }) ?? true else {
                throw Invalid(reason: "Historical record \(record.recordID) has invalid cents.")
            }
            // The two that would put words in a source's mouth: a sale with no
            // price, and a published "nobody bid" carrying one.
            guard !(record.outcome == .sold && record.winningBidCents == nil) else {
                throw Invalid(reason: "Sold record \(record.recordID) requires a winning bid.")
            }
            guard !(record.outcome == .unsold && record.winningBidCents != nil) else {
                throw Invalid(reason: "Unsold record \(record.recordID) cannot have a winning bid.")
            }
            guard !(record.nsprdMatchStatus == .matched && record.nsprdMatchMethod == .none) else {
                throw Invalid(reason: "Matched record \(record.recordID) requires a match method.")
            }
            guard !(record.nsprdMatchStatus != .matched && record.nsprdMatchMethod != .none) else {
                throw Invalid(
                    reason: "Non-matched record \(record.recordID) cannot claim a match method."
                )
            }
        }
    }
}
