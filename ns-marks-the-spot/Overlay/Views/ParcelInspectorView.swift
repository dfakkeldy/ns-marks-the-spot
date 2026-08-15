import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import SwiftUI

/// What is known about the selected parcel, and on whose word.
///
/// A card over the map rather than a sheet: the panel is read against the
/// outline it describes, and a modal would cover the thing being talked about.
///
/// Every section keeps its own three states — looking, answered, unavailable —
/// because the whole point of the panel is that "nothing is mapped here" and
/// "we could not ask" are different, and only one of them says anything about
/// the property.
struct ParcelInspectorView: View {
    let inspection: ParcelInspection
    let onClose: () -> Void

    /// Whether every source the evidence note reports on has answered. The
    /// export waits for that rather than stamping "unavailable" on a source
    /// that was still being asked.
    var canExportNote = false
    /// Shares a link back to this map view. `nil` where the card is shown
    /// without the map behind it.
    var onShareMapLink: (() -> Void)?
    var onExportNote: (() -> Void)?

    /// Read once when the card opens, so an event's lifecycle label does not
    /// change under the reader mid-scroll.
    @State private var now = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    taxSaleNotice
                    historicalRecords
                    assessments
                    dwellings
                    civicAddresses
                    mappedContext
                    resources
                    floodHazard
                    fieldTools
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 2)
        .accessibilityIdentifier("parcel-inspector")
        .onAppear { now = Date() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PID \(inspection.pid)")
                        .font(.headline)
                        .monospacedDigit()
                    Text(sourceSubtitle)
                        .font(.caption)
                        .foregroundStyle(inspection.taxSaleNotice == nil ? .secondary : .primary)
                    if let marker = inspection.recordModeMarker {
                        Text(marker)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.purple)
                    }
                }

                Spacer()

                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Close parcel details")
            }

            if let area = inspection.mappedArea {
                LabeledContent("Mapped area") {
                    Text(area.label).monospacedDigit()
                }
                .font(.subheadline)
                // The web carries this caveat beside the figure and so does
                // this: the number is the service's own, computed from mapped
                // geometry, and mapped geometry is not a survey.
                Text("Calculated from NSPRD geometry and approximate; not a survey.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            buildings

            if let notice = inspection.boundaryNotice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    // MARK: - Tax-sale notice

    /// Who says this parcel is worth looking at: a municipality's notice, or
    /// only the parcel fabric.
    private var sourceSubtitle: String {
        guard let notice = inspection.taxSaleNotice else { return "NSPRD parcel" }
        switch notice.event.lifecycle(now: now) {
        case .historical: return "Historical result - not available"
        case .verifyResults: return TaxSaleEventLifecycle.verifyResults.label
        case .upcoming: return "Listed in official notice"
        }
    }

    /// What the notice itself says about this PID.
    ///
    /// Every line is the municipality's, quoted under its own label — the
    /// amount under the name the notice gave it, the redemption wording as
    /// printed, the retrieval day of the snapshot this build carries. A reader
    /// has to be able to tell a fact the municipality published from a fact
    /// this map computed, and the two sit in the same card.
    @ViewBuilder
    private var taxSaleNotice: some View {
        if let notice = inspection.taxSaleNotice {
            let event = notice.event
            let listing = notice.listing

            VStack(alignment: .leading, spacing: 8) {
                Text("Municipal tax-sale notice")
                    .font(.subheadline.weight(.semibold))

                Text(listing.propertyLabel)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)

                LabeledContent("Municipality") { Text(event.municipality) }
                LabeledContent("Event") {
                    Text("\(TaxSaleFormat.eventDateLabel(event)) · \(event.eventType.label)")
                }
                if let lien = listing.lien {
                    LabeledContent("Lien") { Text(lien).monospacedDigit() }
                }
                if let aan = listing.aan {
                    LabeledContent("AAN") { Text(aan).monospacedDigit() }
                }
                LabeledContent("Official location") { Text(listing.location) }
                LabeledContent(listing.financial.label) {
                    Text(TaxSaleFormat.currency(cents: listing.financial.amountCents))
                        .monospacedDigit()
                }
                LabeledContent("Redemption") { Text(listing.redemptionLabel) }
                LabeledContent("Listing status") { Text(listing.listingStatus.label) }
                LabeledContent("Source retrieved") {
                    Text(TaxSaleFormat.day(event.retrievedOn)).monospacedDigit()
                }

                Label(noticeCaveat(event: event, listing: listing), systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)

                Link("View direct official source", destination: event.sourceURL)
                    .font(.footnote)
            }
            .font(.subheadline)
            .multilineTextAlignment(.leading)
            .accessibilityIdentifier("parcel-inspector-tax-sale")
        } else {
            // Said out loud rather than left to the absence of a section: a
            // card with no notice on it looks the same as a card whose notice
            // failed to load, and only one of those is a fact.
            Text("This PID is not listed in any municipal notice included by this map.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The sentence the web attaches to every listing, chosen by what is
    /// actually uncertain: a struck-out listing, a sale date already past, or a
    /// live notice that any of the usual things may have already changed.
    private func noticeCaveat(event: TaxSaleEvent, listing: TaxSaleListing) -> String {
        let municipality = event.shortMunicipality
        let disclaimer =
            "This map does not imply access, clear title, possession or buildability."
        switch (event.lifecycle(now: now), listing.listingStatus) {
        case (.historical, _):
            return "This is a dated historical result, not a currently available property."
        case (_, .withdrawn):
            return "The municipality's current notice revision strikes this listing out. "
                + "Verify status directly with \(municipality); this map does not imply "
                + "access, clear title, possession or buildability."
        case (.verifyResults, _):
            return "The advertised sale date has passed. Verify results and current status "
                + "with \(municipality). \(disclaimer)"
        case (.upcoming, _):
            return "Properties may be paid, removed or deferred. Verify current status with "
                + "\(municipality). \(disclaimer)"
        }
    }

    // MARK: - Historical records

    /// What the published results said about this PID, one card per sale.
    ///
    /// Shown only in the historical mode, and only for the records the panel's
    /// filters currently leave: a card that quietly included a sale the list is
    /// hiding would make the filter mean something different on the map than it
    /// means in the panel.
    @ViewBuilder
    private var historicalRecords: some View {
        if !inspection.historicalRecords.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                Text("Historical tax-sale records")
                    .font(.subheadline.weight(.semibold))

                ForEach(inspection.historicalRecords, id: \.record.recordID) { context in
                    historicalRecord(context)
                }
            }
            .font(.subheadline)
            .accessibilityIdentifier("parcel-inspector-historical")
        }
    }

    @ViewBuilder
    private func historicalRecord(_ context: HistoricalRecordContext) -> some View {
        let event = context.event
        let record = context.record

        VStack(alignment: .leading, spacing: 6) {
            Text("\(event.shortMunicipality) · \(TaxSaleFormat.day(event.saleDate))")
                .font(.subheadline.weight(.semibold))

            Text(record.civicDescription)
                .fixedSize(horizontal: false, vertical: true)

            LabeledContent("Sale method") { Text(event.saleMethod.label) }
            LabeledContent(event.listingIdentifierLabel) {
                Text(record.listingIdentifier).monospacedDigit()
            }
            LabeledContent(event.advertisedAmountLabel) {
                Text(TaxSaleFormat.currency(cents: record.advertisedAmountCents))
                    .monospacedDigit()
            }
            LabeledContent("Outcome") { Text(context.outcomeLabel) }
            LabeledContent("Winning bid") { Text(context.winningBidLabel).monospacedDigit() }

            // Only where the source published both numbers. A comparison against
            // an unpublished bid would be arithmetic on a number nobody printed.
            if let comparison = context.financialComparison {
                LabeledContent("Difference") {
                    Text(TaxSaleFormat.currency(cents: comparison.differenceCents))
                        .monospacedDigit()
                }
                LabeledContent("Above \(event.advertisedAmountLabel.lowercased())") {
                    Text(String(format: "%.2f%%", comparison.percentageAbove))
                        .monospacedDigit()
                }
                LabeledContent("Winning-bid multiple") {
                    Text(String(format: "%.2f×", comparison.winningBidMultiple))
                        .monospacedDigit()
                }
            }

            LabeledContent("Redemption field") { Text(record.redemptionLabel) }
            if let note = record.resultNote {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            LabeledContent("Parcel match") { Text(record.nsprdMatchMethod.label) }
            LabeledContent("Source retrieved") {
                Text(TaxSaleFormat.day(event.retrievedOn)).monospacedDigit()
            }

            Label(context.limitNote, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)

            // Both documents, separately named. The notice is what was
            // advertised and the result is what was published afterwards; a
            // reader checking one of them should not be handed the other.
            Link("Official notice", destination: event.noticeURL)
                .font(.footnote)
            if let resultURL = event.resultURL {
                Link("Published results", destination: resultURL)
                    .font(.footnote)
            }
        }
    }

    // MARK: - PVSC assessment accounts

    private var assessments: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(assessmentHeading)
                .font(.subheadline.weight(.semibold))

            switch inspection.assessments {
            case .looking:
                status("Checking PVSC open assessment data…")
            case .unavailable(let reason):
                // "No absence is inferred" in the web's words, kept because a
                // reader who skips the reason still needs to know that nothing
                // about this parcel was learned.
                status("\(reason) No absence is inferred.")
            case .ready(let result) where result.accounts.isEmpty:
                status(
                    result.matchMethod == .noticeAAN
                        ? "No record was returned for the official notice AAN in the PVSC open "
                            + "dataset. This does not prove no assessment account exists."
                        : "No PVSC account point from the open dataset was mapped inside this "
                            + "parcel. This does not prove no assessment account or assessed "
                            + "value exists."
                )
                unreadableRowsNotice(result.unreadableRows)
            case .ready(let result):
                Text(Self.matchSentence(for: result))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(result.accounts, id: \.aan) { account in
                    accountRow(account)
                }

                if result.accounts.contains(where: \.onParcelBoundary) {
                    Text(
                        "An account marked as on the boundary sits on a line this parcel shares "
                            + "with its neighbour, so it falls inside both."
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }

                if let year = result.accounts.first?.current?.taxYear {
                    Text(
                        "The \(Self.year(year)) assessment reflects market value as of "
                            + "January 1, \(Self.year(year - 1)) and physical state as of "
                            + "December 1, \(Self.year(year - 1)). It is not today's sale price "
                            + "or an appraisal. Taxable assessment may differ."
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }

                unreadableRowsNotice(result.unreadableRows)
            }

            Link(destination: PVSCAssessmentQuery.datasetURL) {
                Text(
                    "Source: PVSC assessed and taxable assessment history · "
                        + "\(PVSCAssessmentQuery.sourceDate). "
                        + PVSCAssessmentQuery.attribution
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            licenceLink
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The governing terms, reachable rather than merely named. The licence
    /// requires the attribution above; a reader who wants to know what else it
    /// requires has to be able to open it.
    private var licenceLink: some View {
        Link(destination: PVSCAssessmentQuery.licenceURL) {
            Text("Open Data & Information Government Licence – PVSC & Participating Municipalities")
                .font(.caption2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// What the reply carried and this app could not read.
    ///
    /// Without it a row that failed to parse is indistinguishable from a row
    /// that was never sent, and the second is the one that means the parcel has
    /// no such record.
    @ViewBuilder
    private func unreadableRowsNotice(_ count: Int) -> some View {
        if count > 0 {
            Text(
                count == 1
                    ? "1 row in the PVSC reply could not be read and is not listed."
                    : "\(count) rows in the PVSC reply could not be read and are not listed."
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var assessmentHeading: String {
        if case .ready(let result) = inspection.assessments, result.accounts.count == 1 {
            return "PVSC assessment account"
        }
        return "PVSC assessment accounts"
    }

    /// What the accounts are evidence of, which is not the same question as
    /// what they say. A notice AAN is a record; a point inside an outline is a
    /// point inside an outline.
    private static func matchSentence(for result: PVSCAssessmentResponse.Result) -> String {
        if result.matchMethod == .noticeAAN {
            return "Matched by official notice AAN."
        }
        if result.accounts.count == 1 {
            return "Matched by a PVSC account point inside the mapped parcel."
        }
        return "\(result.accounts.count) PVSC account points were mapped inside this parcel. "
            + "Values are shown separately and are not summed."
    }

    private func accountRow(_ account: PVSCAssessmentResponse.Account) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("AAN \(account.aan)")
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                if account.onParcelBoundary {
                    Text("on the boundary")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if let current = account.current {
                LabeledContent("Tax year") {
                    Text(Self.year(current.taxYear)).monospacedDigit()
                }
                LabeledContent("Assessed value") {
                    Text(Self.money(current.assessedValue)).monospacedDigit()
                }
                LabeledContent("Taxable assessment") {
                    Text(Self.money(current.taxableAssessedValue)).monospacedDigit()
                }
            }

            if account.records.count > 1 {
                DisclosureGroup("Assessment history") {
                    ForEach(account.records, id: \.taxYear) { record in
                        LabeledContent(Self.year(record.taxYear)) {
                            Text(
                                "\(Self.money(record.assessedValue)) assessed · "
                                    + "\(Self.money(record.taxableAssessedValue)) taxable"
                            )
                            .monospacedDigit()
                        }
                        .font(.caption2)
                    }
                }
                .font(.caption)
            }
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A year is a label, not a quantity: the device's grouping separator would
    /// print 2026 as "2,026".
    private static func year(_ value: Int) -> String { String(value) }

    /// Canadian dollars in the web's `en-CA` formatting. Pinned rather than
    /// taken from the device, because the figure is a Nova Scotia record and
    /// both surfaces have to print the same one.
    private static func money(_ value: Double) -> String {
        value.formatted(.currency(code: "CAD").locale(Locale(identifier: "en_CA")))
    }

    // MARK: - PVSC dwellings

    private var dwellings: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PVSC dwellings")
                .font(.subheadline.weight(.semibold))

            switch inspection.dwellings {
            case .looking:
                status("Checking PVSC residential dwelling data…")
            case .unavailable(let reason):
                status(reason)
            case .ready(let result) where result.accounts.isEmpty:
                // The only line here that says something about the parcel, and
                // it still stops well short of "no building": this dataset is
                // residential, so a shop or a barn is absent from it by design.
                status(
                    "No residential dwelling record was returned for this parcel's matched "
                        + "accounts. This does not prove no building exists — commercial and "
                        + "other non-residential structures are not in this dataset."
                )
                unreadableRowsNotice(result.unreadableRows)
            case .ready(let result):
                ForEach(result.accounts, id: \.aan) { account in
                    dwellingAccountRow(account, showAAN: result.accounts.count > 1)
                }

                unreadableRowsNotice(result.unreadableRows)

                Text(
                    "Assessment dwelling records are fresher than aerial mapping but are not a "
                        + "building census. Multi-unit parcels can repeat living-unit totals "
                        + "across records, and records do not establish current condition, "
                        + "occupancy, or permits."
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }

            Link(destination: PVSCDwellingQuery.datasetURL) {
                Text(
                    "Source: PVSC residential dwelling characteristics · "
                        + "\(PVSCDwellingQuery.sourceDate). "
                        + PVSCAssessmentQuery.attribution
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dwellingAccountRow(
        _ account: PVSCDwellingResponse.Account, showAAN: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if showAAN {
                Text("AAN \(account.aan)")
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
            }

            // By position: two dwellings on one account can carry identical
            // characteristics, and collapsing them would drop a building.
            ForEach(Array(account.dwellings.enumerated()), id: \.offset) { _, dwelling in
                VStack(alignment: .leading, spacing: 1) {
                    Text(
                        dwelling.yearBuilt.map { "Built \(Self.year($0))" }
                            ?? "Build year not published"
                    )
                    .font(.footnote)

                    let facts = Self.facts(dwelling)
                    if !facts.isEmpty {
                        Text(facts)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The web's `dwellingFactsLabel`. A characteristic PVSC did not publish is
    /// left out rather than written as a zero or a no.
    private static func facts(_ dwelling: PVSCDwellingResponse.Dwelling) -> String {
        var parts: [String] = []
        if let style = dwelling.style { parts.append(style) }
        if let area = dwelling.squareFeetLivingArea {
            parts.append("\(count(area)) sq ft living area")
        }
        if let units = dwelling.livingUnits {
            parts.append("\(count(units)) living unit\(units == 1 ? "" : "s")")
        }
        if let bathrooms = dwelling.bathrooms {
            parts.append("\(count(bathrooms)) bathroom\(bathrooms == 1 ? "" : "s")")
        }
        if let garage = dwelling.garage { parts.append(garage ? "Garage" : "No garage") }
        if dwelling.underConstruction == true { parts.append("Under construction") }
        return parts.joined(separator: " · ")
    }

    /// `toLocaleString("en-CA")`: grouped, and fractional only when the figure
    /// is (a bathroom and a half is a real PVSC value).
    private static func count(_ value: Double) -> String {
        value.formatted(
            .number.grouping(.automatic).precision(.fractionLength(0...3))
                .locale(Locale(identifier: "en_CA"))
        )
    }

    // MARK: - Civic addresses

    private var civicAddresses: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(addressHeading)
                .font(.subheadline.weight(.semibold))

            // The web gives this caveat its own prominence and it earns it: a
            // civic point is a mapped address, and readers reach for it as
            // proof of things it cannot show.
            Text(
                "Authoritative mapped civic points only. Mapped physical-address "
                    + "points are not proof of ownership, mailing address, access, "
                    + "occupancy, or legal parcel status."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            switch inspection.civicAddresses {
            case .looking:
                status("Looking up mapped civic addresses…")
            case .unavailable(let reason):
                status(reason)
            case .ready(let reading) where reading.addresses.isEmpty:
                // Asked and answered. The only line here allowed to say the
                // parcel has none — and only when every row the file sent was
                // read, which is what the shortfall below is guarding.
                status(
                    reading.unreadableRows == 0
                        ? "No civic address point is mapped inside this parcel."
                        : ParcelLookupMessage.noReadableAddresses(reading.unreadableRows)
                )
            case .ready(let reading):
                ForEach(reading.addresses, id: \.pntid) { address in
                    addressRow(address)
                }
                if reading.unreadableRows > 0 {
                    // The list above is not the file's answer, only the part of
                    // it this build could place. Said here rather than left to
                    // the reader to infer from a short list.
                    status(ParcelLookupMessage.addressShortfall(reading.unreadableRows))
                }
            }

            Link(destination: CivicAddressQuery.datasetURL) {
                Text("Source: Nova Scotia Civic Address File · Open Government Licence – Nova Scotia")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var addressHeading: String {
        if case .ready(let reading) = inspection.civicAddresses, reading.addresses.count == 1 {
            return "Mapped civic address"
        }
        return "Mapped civic addresses"
    }

    private func addressRow(_ address: CivicAddressResponse.CivicAddress) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(address.label)
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)

            // Directions go to the Province's coordinate for the address point,
            // which is where the file put it — not to a door or a driveway.
            if let plusCode = PlaceLinks.plusCode(for: address.coordinate),
               let directions = PlaceLinks.directionsURL(for: address.coordinate) {
                Link(destination: directions) {
                    HStack(spacing: 6) {
                        Text(plusCode).monospaced()
                        // Spelled out as it is on the web. The icon alone
                        // leaves what the link does to be guessed at, and a
                        // link that opens another app should say so.
                        Text("Directions in Google Maps")
                    }
                    .font(.caption2)
                }
                .accessibilityLabel("\(plusCode) — Directions in Google Maps")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Taking the parcel with you

    /// The three ways this parcel leaves the app: a link back to this view, the
    /// evidence note, and the commercial listing page.
    @ViewBuilder
    private var fieldTools: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Take this with you")
                .font(.subheadline.weight(.semibold))

            if let onShareMapLink {
                Button(action: onShareMapLink) {
                    Label("Share this map view", systemImage: "square.and.arrow.up")
                        .font(.footnote)
                }
                .accessibilityIdentifier("parcel-inspector-share-link")
            }

            if let onExportNote {
                Button(action: onExportNote) {
                    Label("Export evidence note", systemImage: "doc.text")
                        .font(.footnote)
                }
                .disabled(!canExportNote)
                .accessibilityIdentifier("parcel-inspector-export-note")

                if !canExportNote {
                    // Said out loud rather than left as a greyed button: the
                    // note names every source it asked, so it waits until every
                    // source has answered.
                    Text("Available once every source above has answered.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if let listing = PlaceLinks.viewpointParcelURL(pid: inspection.pid) {
                Link(destination: listing) {
                    Label("Open on ViewPoint", systemImage: "arrow.up.right.square")
                        .font(.footnote)
                }
                // ViewPoint is a commercial listing site. Nothing there is a
                // record source, and a page existing for a PID is not a
                // statement that the property is for sale.
                Text(
                    "A commercial listing site, not a record source. Nothing shown there is "
                        + "evidence about this parcel."
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Mapped roads and water

    private var mappedContext: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch inspection.mappedContext {
            case .looking:
                status("Loading mapped road and water intersections…")
            case .unavailable(let reason):
                status(reason)
            case .ready(let context):
                featureList(
                    "Roads at or beside parcel",
                    empty: ParcelLookupMessage.noRoadsListed(addressesAnswered: addressesAnswered),
                    rows: Self.rows(
                        ParcelRoads.list(context, namedBy: readyAddresses).map {
                            ($0.name, $0.kind, ParcelEvidenceWording.label(for: $0.evidence))
                        }
                    )
                )

                if let shortfall = ParcelLookupMessage
                    .roadListShortfall(addressesAnswered: addressesAnswered) {
                    Text(shortfall)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(
                    "Adjacency and civic addressing are useful map context, not proof "
                        + "of legal access or road frontage."
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                featureList(
                    "Intersecting water features",
                    empty: ParcelEvidenceWording.noWaterFeature,
                    rows: Self.rows(
                        context.water.map {
                            (
                                $0.name,
                                $0.kind,
                                $0.relationship == .intersects
                                    ? "Intersects parcel"
                                    : ParcelEvidenceWording.adjacentLabel
                            )
                        }
                    )
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Geology & resource context

    private var resources: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Geology & resource context")
                .font(.subheadline.weight(.semibold))

            switch inspection.resources {
            case .looking:
                status("Checking official mapped resource sources against this parcel…")
            case .unavailable(let reason):
                status("\(reason) No absence is inferred.")
            case .ready(let intersections):
                ForEach(intersections.sources, id: \.layerID) { source in
                    resourceSource(source)
                }

                Text(
                    "On-parcel and nearby published records are screening context only. This "
                        + "context does not prove mineralization, deposit extent, grade, "
                        + "recoverability, value, mineral rights, access, permission to explore, "
                        + "or source completeness."
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One source's own heading, answer, and source link.
    ///
    /// Each source stands alone because one being down says nothing about the
    /// other two, and a single "unavailable" over all three would hide the two
    /// that answered.
    @ViewBuilder
    private func resourceSource(_ source: ParcelResourceIntersections.Source) -> some View {
        let descriptor = LayerCatalog.descriptor(for: source.layerID)

        VStack(alignment: .leading, spacing: 6) {
            Text(descriptor?.name ?? source.layerID.rawValue)
                .font(.footnote.weight(.semibold))

            switch source.records {
            case .failure:
                status("Source unavailable; no absence is inferred.")
            case .success(let records) where records.isEmpty:
                status(
                    source.layerID == .mineralOccurrences
                        ? "No published mineral occurrence was returned on or within 1 km of "
                            + "this parcel."
                        : "No mapped intersection was returned for this parcel."
                )
            case .success(let records):
                ForEach(records, id: \.id) { record in
                    resourceRow(record, showingRelationship: source.layerID == .mineralOccurrences)
                }
            }

            if let sourceURL = descriptor?.sourceURL {
                Link("\(descriptor?.name ?? "Source") source", destination: sourceURL)
                    .font(.caption2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func resourceRow(
        _ record: ResourceIntersectionResponse.Intersection,
        showingRelationship: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(record.name)
                .font(.footnote.weight(.semibold))
            if showingRelationship {
                // Only the mineral inventory is asked twice, so only there does
                // "on the parcel" mean something different from "within a
                // kilometre of it".
                Text(
                    "\(record.id) · "
                        + (record.relationship == .onParcel ? "On parcel" : "Within 1 km")
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            if !record.detail.isEmpty {
                Text(record.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Flood hazard

    private var floodHazard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Flood hazard evidence")
                .font(.subheadline.weight(.semibold))

            switch inspection.floodHazard {
            case .looking:
                status("Checking published river and coastal hazard mapping…")
            case .unavailable(let reason):
                status("\(reason) No absence is inferred.")
            case .ready(let hazard):
                riverFlood(hazard.river)
                coastalFlood(hazard.coastal)

                // The same sentence the note and the printed appendix carry.
                Text(FloodEvidenceCaveat.measurement)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                if let river = LayerCatalog.descriptor(for: .publishedRiverFloodZones)?.sourceURL {
                    Link("Published river flood layers", destination: river)
                        .font(.caption2)
                }
                if let coast = LayerCatalog.descriptor(for: .coastalFloodCurrent)?.sourceURL {
                    Link("Nova Scotia Coastal Hazard Map", destination: coast)
                        .font(.caption2)
                }
                if let licence = LayerCatalog.descriptor(for: .coastalFloodCurrent)?.licenceURL {
                    Link("Coastal data licence and notices", destination: licence)
                        .font(.caption2)
                }

                floodLicenceNotice
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The notices the coastal licence requires to travel with the data. The
    /// same three sentences the exported note and the printed appendix carry,
    /// read from one place so a licence condition cannot be reworded on one
    /// surface and not the other.
    private var floodLicenceNotice: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(CoastalFloodLicence.notices, id: \.self) { notice in
                Text(notice)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func riverFlood(_ river: RiverFloodEvidence) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Published river mapping")
                .font(.footnote.weight(.semibold))

            switch river {
            case .publishedIntersection(let findings):
                ForEach(findings, id: \.self) { finding in
                    Text(ParcelEvidenceWording.sentence(for: finding))
                        .font(.footnote)
                        .fixedSize(horizontal: false, vertical: true)
                }
            case .withinPublishedExtentWithNoIntersection:
                status(ParcelEvidenceWording.withinPublishedExtentWithNoIntersection)
            case .outsidePublishedExtents:
                status(ParcelEvidenceWording.outsidePublishedExtents)
            case .unavailable(let failure):
                status(ParcelEvidenceWording.sentence(for: failure))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func coastalFlood(_ scenarios: [CoastalFloodEvidence]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Coastal scenarios")
                .font(.footnote.weight(.semibold))

            ForEach(scenarios, id: \.scenario) { scenario in
                Text(ParcelEvidenceWording.sentence(for: scenario))
                    .font(.footnote)
                    .foregroundStyle(scenarioIsAnswered(scenario) ? .primary : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func scenarioIsAnswered(_ scenario: CoastalFloodEvidence) -> Bool {
        if case .success = scenario.sample { return true }
        return false
    }

    /// The civic addresses to merge into the road list, and only when they have
    /// actually arrived: a road named by an address must not appear because the
    /// address lookup failed quietly.
    private var readyAddresses: [CivicAddressResponse.CivicAddress] {
        if case .ready(let reading) = inspection.civicAddresses { return reading.addresses }
        return []
    }

    /// Whether the address file is one of the sources the road list can be
    /// described as having consulted.
    private var addressesAnswered: Bool {
        if case .ready = inspection.civicAddresses { return true }
        return false
    }

    /// One listed feature. Identified by position rather than by name: two
    /// water features can share a name under different kinds, and collapsing
    /// them would drop one from the list.
    private struct FeatureRow: Identifiable {
        let id: Int
        let name: String
        let kind: String
        let evidence: String
    }

    private static func rows(_ values: [(String, String, String)]) -> [FeatureRow] {
        values.enumerated().map {
            FeatureRow(id: $0.offset, name: $0.element.0, kind: $0.element.1, evidence: $0.element.2)
        }
    }

    private func featureList(
        _ title: String,
        empty: String,
        rows: [FeatureRow]
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))

            if rows.isEmpty {
                Text(empty)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.name).font(.footnote)
                        Text(
                            row.name.lowercased() == row.kind.lowercased()
                                ? row.evidence
                                : "\(row.kind) · \(row.evidence)"
                        )
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Mapped buildings

    /// The NSTDB building count, beside the mapped area because both are facts
    /// about the outline rather than about a record attached to it.
    @ViewBuilder
    private var buildings: some View {
        LabeledContent("Mapped buildings") {
            switch inspection.buildings {
            case .looking:
                Text("Checking…").foregroundStyle(.secondary)
            case .unavailable:
                Text("Unavailable").foregroundStyle(.secondary)
            case .ready(let count):
                Text(count.total.formatted(.number)).monospacedDigit()
            }
        }
        .font(.subheadline)

        switch inspection.buildings {
        case .looking:
            EmptyView()
        case .unavailable(let reason):
            Text("\(reason) No absence is inferred.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        case .ready(let count):
            Text(ParcelEvidenceWording.buildingCaveat(count))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func status(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
