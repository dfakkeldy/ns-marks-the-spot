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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    assessments
                    civicAddresses
                    mappedContext
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 2)
        .accessibilityIdentifier("parcel-inspector")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PID \(inspection.pid)")
                        .font(.headline)
                        .monospacedDigit()
                    Text("NSPRD parcel")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
            case .ready(let result):
                Text(Self.matchSentence(for: result))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(result.accounts, id: \.aan) { account in
                    accountRow(account)
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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
            Text("AAN \(account.aan)")
                .font(.footnote.weight(.semibold))
                .monospacedDigit()

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
            case .ready(let addresses) where addresses.isEmpty:
                // Asked and answered. The only line here allowed to say the
                // parcel has none.
                status("No civic address point is mapped inside this parcel.")
            case .ready(let addresses):
                ForEach(addresses, id: \.pntid) { address in
                    addressRow(address)
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
        if case .ready(let addresses) = inspection.civicAddresses, addresses.count == 1 {
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
                            ($0.name, $0.kind, Self.label(for: $0.evidence))
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
                    empty: "No mapped water feature intersects this parcel.",
                    rows: Self.rows(
                        context.water.map {
                            (
                                $0.name,
                                $0.kind,
                                $0.relationship == .intersects
                                    ? "Intersects parcel"
                                    : Self.adjacentLabel
                            )
                        }
                    )
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The civic addresses to merge into the road list, and only when they have
    /// actually arrived: a road named by an address must not appear because the
    /// address lookup failed quietly.
    private var readyAddresses: [CivicAddressResponse.CivicAddress] {
        if case .ready(let addresses) = inspection.civicAddresses { return addresses }
        return []
    }

    /// Whether the address file is one of the sources the road list can be
    /// described as having consulted.
    private var addressesAnswered: Bool {
        if case .ready = inspection.civicAddresses { return true }
        return false
    }

    private static let adjacentLabel =
        "Adjacent within \(MappedFeatureQuery.adjacentRoadDistanceMetres) m"

    private static func label(for evidence: ParcelRoads.Evidence) -> String {
        switch evidence {
        case .intersects: "Intersects parcel"
        case .adjacent: adjacentLabel
        case .namedByCivicAddress: "Named by civic address"
        }
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

    private func status(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
