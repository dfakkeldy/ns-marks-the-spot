import Foundation
import GeoCore

/// What the app can honestly say about a parcel, written down.
///
/// A port of the web's `evidenceNote.ts`, kept word-for-word. The note is the
/// thing somebody carries into a municipal office or a lawyer's office, and two
/// people reading the same parcel off two devices must be carrying the same
/// sentences — including the sentences about what the note does not establish.
///
/// The limitations are not a footer. A source that failed, a source that
/// returned nothing, and a source that was never asked are three different
/// statements and each is printed as itself. Nothing here is a finding of
/// ownership, access, condition, or value.
public struct EvidenceNote: Sendable, Equatable {
    public let filename: String
    public let markdown: String
}

/// Everything the note is built from. Assembled by the caller, because only the
/// caller knows which sources were actually asked.
public struct EvidenceNoteInput: Sendable {
    /// A named source with a date, for the layers that were drawn.
    public struct Source: Sendable, Equatable {
        public let name: String
        public let sourceURL: URL
        public let sourceDate: String

        public init(name: String, sourceURL: URL, sourceDate: String) {
            self.name = name
            self.sourceURL = sourceURL
            self.sourceDate = sourceDate
        }
    }

    public struct Link: Sendable, Equatable {
        public let label: String
        public let sourceURL: URL

        public init(label: String, sourceURL: URL) {
            self.label = label
            self.sourceURL = sourceURL
        }
    }

    public struct Event: Sendable, Equatable {
        public let name: String
        public let sources: [Link]

        public init(name: String, sources: [Link]) {
            self.name = name
            self.sources = sources
        }
    }

    /// One geology or resource screen.
    ///
    /// `emptyMessage` is per source on purpose: "nothing returned" means
    /// something different for a mineral occurrence than for a flood zone, and
    /// a shared sentence would flatten the difference into an absence claim.
    public struct Result: Sendable, Equatable {
        public enum Status: Sendable, Equatable {
            case ready
            case error
        }

        public let name: String
        public let sourceURL: URL
        public let status: Status
        public let results: [String]
        public let emptyMessage: String?
        /// Why this source has no answer, in its own words.
        ///
        /// A licence never accepted, a service that failed, and a question that
        /// could not be asked are three different states, and the note keeps
        /// them apart. Without this they all printed as "source unavailable",
        /// which reads as an outage for a layer the reader could switch on.
        public let errorMessage: String?
        /// The credit and any notice the licence obliges, printed with this
        /// source's findings.
        ///
        /// Beside the finding rather than in a footer: the appendix is torn
        /// out, quoted, and pasted into other documents, and an obligation that
        /// travels one page away from the data does not travel at all.
        public let attribution: String?
        public let licenceURL: URL?
        /// What the source itself says about how current it is. Printed with
        /// the link, because a finding quoted with no date reads as current.
        public let sourceDate: String?

        public init(
            name: String,
            sourceURL: URL,
            status: Status,
            results: [String],
            emptyMessage: String? = nil,
            errorMessage: String? = nil,
            attribution: String? = nil,
            licenceURL: URL? = nil,
            sourceDate: String? = nil
        ) {
            self.name = name
            self.sourceURL = sourceURL
            self.status = status
            self.results = results
            self.emptyMessage = emptyMessage
            self.errorMessage = errorMessage
            self.attribution = attribution
            self.licenceURL = licenceURL
            self.sourceDate = sourceDate
        }
    }

    public enum AssessmentEvidence: Sendable, Equatable {
        case ready(PVSCAssessmentResponse.Result)
        case error
    }

    public enum DwellingEvidence: Sendable, Equatable {
        case ready([PVSCDwellingResponse.Account])
        case error
        /// Never asked, because no account was resolved to ask about. Not the
        /// same as asked-and-empty.
        case blocked
    }

    public var generatedAt: Date
    public var pid: String
    public var mode: MapShareState.Mode
    public var shareURL: URL
    public var position: MapPosition
    public var activeLayers: [Source]
    public var events: [Event]
    public var civicAddresses: [Link]
    /// Why no civic point could be looked up, when none could.
    ///
    /// Set instead of leaving `civicAddresses` empty. An empty list is the
    /// statement that the file has no address point inside this parcel, and a
    /// lookup that never ran must not make that statement.
    public var civicNotice: String?
    /// The parcel's mapped area as the panel says it, or nil where the
    /// geometry returned none. Not computed here: an area the note worked out
    /// for itself could disagree with the one on the screen.
    public var mappedArea: String?
    /// Mapped buildings, mapped roads and water, and the flood screens.
    ///
    /// Carried in the same shape as the resource screens, and for the same
    /// reason: each names its own source, and each says in its own words what
    /// its empty answer means. The web's appendix reports all three, and a note
    /// that skipped them let a parcel with a failed flood lookup read as a
    /// parcel nobody had asked about flooding.
    public var buildingResults: [Result]
    public var contextResults: [Result]
    public var floodResults: [Result]
    public var assessmentEvidence: AssessmentEvidence
    public var dwellingEvidence: DwellingEvidence
    public var resourceResults: [Result]
    /// Why the geology and resource sources were not asked at all, when they
    /// were not — a parcel with no boundary has nothing to intersect.
    public var resourceNotice: String?

    public init(
        generatedAt: Date,
        pid: String,
        mode: MapShareState.Mode,
        shareURL: URL,
        position: MapPosition,
        activeLayers: [Source] = [],
        events: [Event] = [],
        civicAddresses: [Link] = [],
        civicNotice: String? = nil,
        mappedArea: String? = nil,
        buildingResults: [Result] = [],
        contextResults: [Result] = [],
        floodResults: [Result] = [],
        assessmentEvidence: AssessmentEvidence,
        dwellingEvidence: DwellingEvidence,
        resourceResults: [Result] = [],
        resourceNotice: String? = nil
    ) {
        self.generatedAt = generatedAt
        self.pid = pid
        self.mode = mode
        self.shareURL = shareURL
        self.position = position
        self.activeLayers = activeLayers
        self.events = events
        self.civicAddresses = civicAddresses
        self.civicNotice = civicNotice
        self.mappedArea = mappedArea
        self.buildingResults = buildingResults
        self.contextResults = contextResults
        self.floodResults = floodResults
        self.assessmentEvidence = assessmentEvidence
        self.dwellingEvidence = dwellingEvidence
        self.resourceResults = resourceResults
        self.resourceNotice = resourceNotice
    }
}

extension EvidenceNote {
    public static func build(_ input: EvidenceNoteInput) -> EvidenceNote {
        let generated = Format.timestamp(input.generatedAt)
        let layers = input.activeLayers.isEmpty
            ? ["- No optional map layers enabled."]
            : input.activeLayers.map {
                "- [\($0.name)](\($0.sourceURL.absoluteString)) — \($0.sourceDate)"
            }
        let civic: [String]
        if let notice = input.civicNotice {
            civic = ["- \(notice) No absence is inferred."]
        } else if input.civicAddresses.isEmpty {
            civic = ["- No mapped civic address point returned inside the parcel."]
        } else {
            civic = input.civicAddresses.map { "- [\($0.label)](\($0.sourceURL.absoluteString))" }
        }
        let events = input.events.isEmpty
            ? ["No included municipal event is associated with this parcel in the selected mode."]
            : input.events.flatMap { event in
                ["### \(event.name)", ""]
                    + event.sources.map { "- [\($0.label)](\($0.sourceURL.absoluteString))" }
            }

        let markdown = ([
            "# NS Marks The Spot parcel evidence note",
            "",
            "Generated: \(generated)",
            "PID: \(input.pid)",
            "Mode: \(input.mode == .current ? "Current notices" : "Historical records")",
            "Map position: \(Format.fixed(input.position.latitude)), "
                + "\(Format.fixed(input.position.longitude)) at zoom \(input.position.zoom)",
            "[Open this map state](\(input.shareURL.absoluteString))",
            "",
            "## Event",
            "",
        ]
            + events
            + [
                "",
                "## Active map sources",
                "",
            ]
            + layers
            + [
                "",
                "## Authoritative mapped civic points",
                "",
            ]
            + civic
            + [
                "",
                """
                Mapped physical-address points are not proof of ownership, access, \
                occupancy, mailing address, or legal parcel status.
                """,
                "",
                "## Mapped parcel area",
                "",
                "- " + (input.mappedArea ?? "No mapped parcel area returned."),
                "",
                """
                Mapped area is measured from NSPRD boundary geometry. It is approximate, \
                is not a survey, and does not establish the parcel's legal dimensions.
                """,
                "",
                "## Mapped buildings",
                "",
            ]
            + input.buildingResults.flatMap(resultLines)
            + input.buildingResults.flatMap(sourceLines)
            + [
                "",
                """
                A mapped building feature is a record in a topographic dataset, not a \
                building census. It does not establish current structures, condition, \
                occupancy, permits, or that every structure here was mapped.
                """,
                "",
                "## Mapped roads and water",
                "",
            ]
            + input.contextResults.flatMap(resultLines)
            + input.contextResults.flatMap(sourceLines)
            + [
                "",
                """
                A mapped road touching or near this parcel does not establish legal \
                access, frontage, right of way, maintenance, or that the road is \
                passable. Mapped water does not establish a watercourse boundary, \
                riparian right, or a regulated buffer.
                """,
                "",
                "## Flood evidence",
                "",
            ]
            + input.floodResults.flatMap(resultLines)
            + input.floodResults.flatMap(sourceLines)
            + [
                "",
                FloodEvidenceCaveat.measurement,
                "",
                """
                Published river mapping and coastal scenarios are screening layers at \
                their own scales and dates. Outside a study extent means the question was \
                not assessed here, which is not a finding of no flood hazard. No result \
                here establishes a parcel-level flood probability, insurability, or a \
                development permission.
                """,
                "",
                "## PVSC assessment accounts",
                "",
            ]
            + assessmentLines(input.assessmentEvidence)
            + [
                "",
                "[PVSC assessed-value history open-data source]"
                    + "(\(PVSCAssessmentQuery.datasetURL.absoluteString)) "
                    + "— \(PVSCAssessmentQuery.sourceDate)",
                "[Open Data & Information Government Licence]"
                    + "(\(PVSCAssessmentQuery.licenceURL.absoluteString))",
                PVSCAssessmentQuery.attribution,
                "",
                """
                Assessment values are dated public assessment records, not a current market \
                appraisal or sale price. A point-in-parcel match is screening evidence and does \
                not establish title, ownership, legal parcel-account linkage, or that every \
                account associated with the parcel was returned.
                """,
                "",
                "## PVSC residential dwelling records",
                "",
            ]
            + dwellingLines(input.dwellingEvidence)
            + [
                "",
                "[PVSC residential dwelling characteristics open-data source]"
                    + "(\(PVSCDwellingQuery.datasetURL.absoluteString)) "
                    + "— \(PVSCDwellingQuery.sourceDate)",
                "",
                """
                Assessment dwelling records are fresher than aerial mapping but are not a \
                building census. Multi-unit parcels can repeat living-unit totals across records, \
                and records do not establish current condition, occupancy, or permits.
                """,
                "",
                "## Geology and resource context",
                "",
            ]
            + (input.resourceNotice.map { ["- \($0) No absence is inferred."] }
                ?? input.resourceResults.flatMap(resultLines)
                    + input.resourceResults.flatMap(sourceLines))
            + [
                "",
                """
                Mapped intersections and proximity to a published record are screening evidence \
                only. A returned-empty result does not prove absence. This evidence does not \
                prove mineralization, deposit extent, grade, recoverability, value, mineral \
                rights, access, permission to explore, or completeness of the published \
                inventory.
                """,
                "",
                "## General limitations",
                "",
                """
                NSPRD geometry and mapped area are approximate and are not a legal survey. Road \
                adjacency and civic addressing do not prove legal access or frontage. Tax-sale \
                notices and results are dated source records and require current verification \
                with the municipality.
                """,
                "",
            ]).joined(separator: "\n")

        return EvidenceNote(
            filename: "ns-marks-evidence-\(input.pid)-\(Format.filenameStamp(input.generatedAt)).md",
            markdown: markdown
        )
    }

    /// A source's link, its credit, and its licence — the lines that have to
    /// accompany the finding above them.
    private static func sourceLines(_ result: EvidenceNoteInput.Result) -> [String] {
        ["- [\(result.name) source](\(result.sourceURL.absoluteString))"
            + (result.sourceDate.map { " — \($0)" } ?? "")]
            + (result.attribution.map { ["- \($0)"] } ?? [])
            + (result.licenceURL.map { ["- [\(result.name) licence](\($0.absoluteString))"] } ?? [])
    }

    private static func resultLines(_ result: EvidenceNoteInput.Result) -> [String] {
        if result.status == .error {
            return [
                "- \(result.name): "
                    + (result.errorMessage ?? "source unavailable at export time.")
            ]
        }
        if result.results.isEmpty {
            return [
                "- \(result.name): "
                    + (result.emptyMessage ?? "No mapped intersection returned.")
            ]
        }
        return result.results.map { "- \(result.name): \($0)" }
    }

    private static func assessmentLines(
        _ evidence: EvidenceNoteInput.AssessmentEvidence
    ) -> [String] {
        guard case .ready(let result) = evidence else {
            return ["PVSC assessment source unavailable at export time."]
        }
        if result.accounts.isEmpty {
            return [
                result.matchMethod == .noticeAAN
                    ? "No PVSC assessment history was returned for the municipal notice AAN."
                    : """
                    No PVSC assessment account point was returned inside the mapped parcel \
                    geometry.
                    """
            ]
        }

        let methodNote = result.matchMethod == .noticeAAN
            ? "This account was matched directly from the municipal notice AAN."
            : """
            These accounts were spatially matched using their published point coordinates and \
            the mapped parcel geometry.
            """
        // Two accounts are two accounts. Adding them would invent a parcel
        // value nobody published.
        let multipleNote = result.accounts.count > 1
            ? ["", "Multiple assessment accounts were returned. They are kept separate and are not summed."]
            : []

        return [methodNote] + multipleNote + result.accounts.flatMap { account in
            ["", "### AAN \(account.aan)", ""]
                + account.records.map {
                    "- \($0.taxYear): assessed \(Format.currency($0.assessedValue)); "
                        + "taxable assessed \(Format.currency($0.taxableAssessedValue))"
                }
        }
    }

    private static func dwellingLines(
        _ evidence: EvidenceNoteInput.DwellingEvidence
    ) -> [String] {
        switch evidence {
        case .error:
            return ["PVSC residential dwelling source unavailable at export time."]
        case .blocked:
            return [
                """
                Dwelling records were not looked up because no PVSC assessment account could be \
                resolved.
                """
            ]
        case .ready(let accounts) where accounts.isEmpty:
            return [
                """
                No residential dwelling record was returned for the matched assessment accounts. \
                This does not prove no building exists; commercial and other non-residential \
                structures are not in this dataset.
                """
            ]
        case .ready(let accounts):
            return accounts.flatMap { account in
                ["", "### AAN \(account.aan)", ""]
                    + account.dwellings.map { "- \(facts($0))" }
            }
        }
    }

    private static func facts(_ dwelling: PVSCDwellingResponse.Dwelling) -> String {
        [
            dwelling.yearBuilt.map { "built \($0)" } ?? "build year not published",
            dwelling.style,
            dwelling.squareFeetLivingArea.map { "\(Format.decimal($0)) sq ft living area" },
            dwelling.livingUnits.map {
                "\(Format.decimal($0)) living unit\($0 == 1 ? "" : "s")"
            },
            dwelling.bathrooms.map {
                "\(Format.decimal($0)) bathroom\($0 == 1 ? "" : "s")"
            },
            dwelling.garage.map { $0 ? "garage" : "no garage" },
            dwelling.underConstruction == true ? "under construction" : nil,
        ]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// The web writes these with `Intl` and `toISOString`. Everything here is
    /// pinned to those, not to the reader's locale: the note is a record, and a
    /// record that reads differently on two phones is two records.
    enum Format {
        static func currency(_ value: Double) -> String {
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.currencyCode = "CAD"
            formatter.locale = Locale(identifier: "en_CA")
            return formatter.string(from: value as NSNumber) ?? "$\(value)"
        }

        /// JavaScript's `toLocaleString` default: no padding, at most three
        /// decimals.
        static func decimal(_ value: Double) -> String {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.locale = Locale(identifier: "en_CA")
            formatter.minimumFractionDigits = 0
            formatter.maximumFractionDigits = 3
            return formatter.string(from: value as NSNumber) ?? "\(value)"
        }

        static func fixed(_ value: Double) -> String {
            String(format: "%.5f", value)
        }

        static func timestamp(_ date: Date) -> String {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            formatter.timeZone = TimeZone(identifier: "UTC")
            return formatter.string(from: date)
        }

        static func filenameStamp(_ date: Date) -> String {
            var stamp = timestamp(date)
            if stamp.hasSuffix(".000Z") {
                stamp.removeLast(5)
                stamp.append("Z")
            }
            return stamp.replacingOccurrences(of: ":", with: "-")
        }

    }
}
