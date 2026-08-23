import Foundation
import GeoCore
import MapCatalog
import NSDataServices

/// Turns what the panel is showing into the note somebody carries out of the
/// app.
///
/// Separate from the view model so the mapping can be read and tested on its
/// own. It is the place where the panel's three-state evidence becomes the
/// note's four-state evidence, and that translation is exactly where a source
/// that was never asked could quietly become a source that answered with
/// nothing.
nonisolated enum ParcelEvidenceExport {
    /// Whether every source the note reports on has settled.
    ///
    /// The note is dated and shared. Exporting one mid-lookup would stamp
    /// "unavailable at export time" on a source that was about to answer, and
    /// the reader has no way to tell that from a source that was genuinely
    /// down.
    static func isReady(_ inspection: ParcelInspection) -> Bool {
        hasSettled(inspection.resources)
            && hasSettled(inspection.assessments)
            && hasSettled(inspection.dwellings)
            && hasSettled(inspection.civicAddresses)
            && hasSettled(inspection.buildings)
            && hasSettled(inspection.mappedContext)
            && hasSettled(inspection.floodHazard)
    }

    /// The sources the note reports on that have not answered yet, under the
    /// headings the note gives them.
    ///
    /// Named rather than counted, because "a source is still looking" leaves
    /// the reader waiting on something they cannot see, and the wait is worth
    /// very different amounts depending on which one it is.
    static func pending(_ inspection: ParcelInspection) -> [String] {
        [
            ("Authoritative mapped civic points", hasSettled(inspection.civicAddresses)),
            ("Mapped buildings", hasSettled(inspection.buildings)),
            ("Mapped roads and water", hasSettled(inspection.mappedContext)),
            ("Flood evidence", hasSettled(inspection.floodHazard)),
            ("PVSC assessment accounts", hasSettled(inspection.assessments)),
            ("PVSC residential dwelling records", hasSettled(inspection.dwellings)),
            ("Geology and resource context", hasSettled(inspection.resources)),
        ]
        .filter { !$0.1 }
        .map(\.0)
    }

    private static func hasSettled<Value>(_ evidence: ParcelEvidence<Value>) -> Bool {
        if case .looking = evidence { return false }
        return true
    }

    static func input(
        generatedAt: Date,
        inspection: ParcelInspection,
        taxSaleEnabled: Bool,
        mode: MapShareState.Mode,
        shareURL: URL,
        position: MapPosition,
        activeLayers: [LayerDescriptor],
        baseMap: MapBaseType,
        fletcherBaseURL: URL?
    ) -> EvidenceNoteInput {
        EvidenceNoteInput(
            generatedAt: generatedAt,
            pid: inspection.pid,
            taxSaleEnabled: taxSaleEnabled,
            mode: mode,
            shareURL: shareURL,
            position: position,
            activeLayers: sources(
                activeLayers,
                baseMap: baseMap,
                fletcherBaseURL: fletcherBaseURL
            ),
            events: taxSaleEnabled ? events(inspection, mode: mode) : [],
            civicAddresses: civicAddresses(inspection),
            civicNotice: notice(inspection.civicAddresses),
            mappedArea: inspection.mappedArea?.label,
            buildingResults: buildingResults(inspection),
            contextResults: contextResults(inspection),
            floodResults: floodResults(inspection),
            assessmentEvidence: assessments(inspection),
            dwellingEvidence: dwellings(inspection),
            resourceResults: resourceResults(inspection),
            resourceNotice: notice(inspection.resources)
        )
    }

    /// Why a whole lookup produced nothing, when the reason is that it never
    /// ran. `nil` when the source answered — including when it answered with
    /// nothing, which is a different thing and the note says so on its own.
    private static func notice<Value>(_ evidence: ParcelEvidence<Value>) -> String? {
        switch evidence {
        case .ready:
            return nil
        case .unavailable(let reason):
            return reason
        case .looking:
            return "This source had not answered when the note was written."
        }
    }

    /// Everything that was drawn under the parcel, base map included.
    ///
    /// The base map is listed because it is a source: what the reader was
    /// looking at came from somewhere, and a note that lists only the overlays
    /// describes a map nobody saw.
    private static func sources(
        _ descriptors: [LayerDescriptor],
        baseMap: MapBaseType,
        fletcherBaseURL: URL?
    ) -> [EvidenceNoteInput.Source] {
        [
            EvidenceNoteInput.Source(
                name: baseMapName(baseMap),
                sourceURL: URL(string: "https://www.apple.com/legal/internet-services/maps/")!,
                sourceDate: "Live Apple Maps tiles"
            )
        ]
            + descriptors.flatMap { descriptor -> [EvidenceNoteInput.Source] in
                var listed = [EvidenceNoteInput.Source]()
                if let url = url(for: descriptor, fletcherBaseURL: fletcherBaseURL) {
                    listed.append(
                        EvidenceNoteInput.Source(
                            name: descriptor.name,
                            sourceURL: url,
                            sourceDate: descriptor.sourceDate
                        )
                    )
                }
                // The derived proximity layer is made from two sources, and
                // the parcel geometry half is the one a reader would otherwise
                // never see named.
                if descriptor.id == .mineralProximityParcels,
                   let nsprd = LayerCatalog.descriptor(for: .nsprd),
                   let url = nsprd.serviceURL ?? nsprd.sourceURL {
                    listed.append(
                        EvidenceNoteInput.Source(
                            name: "NSPRD parcel geometry — derived proximity input",
                            sourceURL: url,
                            sourceDate: nsprd.sourceDate
                        )
                    )
                }
                return listed
            }
    }

    /// What the reader was reading over. Named exactly, because "standard base
    /// map" against a photograph would misdescribe the page the note is about.
    /// The NS aerial base draws over Apple's standard tiles and is listed as
    /// its own layer besides, so here it is the tiles underneath that get named.
    private static func baseMapName(_ baseMap: MapBaseType) -> String {
        switch baseMap {
        case .standard, .nsAerial:
            return "Apple Maps standard base map"
        case .satellite:
            return "Apple Maps satellite imagery"
        case .hybrid:
            return "Apple Maps satellite imagery with labels"
        case .blank:
            return "no base map"
        }
    }

    /// Where a reader can go and check a layer.
    ///
    /// Fletcher has no catalog URL because its tiles are runtime configuration.
    /// Its receipt describes the build actually being loaded; the collection's
    /// permissions page stands in when no host is configured, rather than the
    /// layer going unlisted.
    private static func url(
        for descriptor: LayerDescriptor,
        fletcherBaseURL: URL?
    ) -> URL? {
        if descriptor.id == .fletcher {
            return FletcherTileURL.sourceReceiptURL(baseURL: fletcherBaseURL)
                ?? URL(string: "https://www.davidrumsey.com/about/copyright-and-permissions")
        }
        return descriptor.sourceURL ?? descriptor.serviceURL
    }

    /// The notice or the dated records, decided by the mode the note is
    /// stamped with.
    ///
    /// Read from the mode rather than from whichever field happens to be
    /// populated: the card can hold historical records while the map is on the
    /// current notices, and a note headed "Mode: Current notices" listing dated
    /// outcomes is the one confusion this whole feature exists to prevent.
    private static func events(
        _ inspection: ParcelInspection,
        mode: MapShareState.Mode
    ) -> [EvidenceNoteInput.Event] {
        guard mode == .historical else {
            guard let notice = inspection.taxSaleNotice else { return [] }
            return [
                EvidenceNoteInput.Event(
                    name: "\(notice.event.shortMunicipality) — "
                        + TaxSaleFormat.eventDateLabel(notice.event),
                    sources: [
                        EvidenceNoteInput.Link(
                            label: "Official notice",
                            sourceURL: notice.event.sourceURL
                        )
                    ]
                )
            ]
        }

        return inspection.historicalRecords.map { context in
            let event = context.event
            var sources = [
                EvidenceNoteInput.Link(label: "Official notice", sourceURL: event.noticeURL)
            ]
            // The published result if there is one; otherwise the page the
            // municipality posts results on, which is a weaker link and is
            // labelled as the different thing it is.
            if let resultURL = event.resultURL {
                sources.append(
                    EvidenceNoteInput.Link(label: "Official result", sourceURL: resultURL)
                )
            } else if let landingPageURL = event.landingPageURL {
                sources.append(
                    EvidenceNoteInput.Link(
                        label: "Municipal results page",
                        sourceURL: landingPageURL
                    )
                )
            }
            return EvidenceNoteInput.Event(
                name: "\(event.shortMunicipality) — \(TaxSaleFormat.day(event.saleDate))",
                sources: sources
            )
        }
    }

    private static func civicAddresses(
        _ inspection: ParcelInspection
    ) -> [EvidenceNoteInput.Link] {
        guard case .ready(let reading) = inspection.civicAddresses else { return [] }
        return reading.addresses.map {
            EvidenceNoteInput.Link(label: $0.label, sourceURL: CivicAddressQuery.datasetURL)
        }
    }

    private static func assessments(
        _ inspection: ParcelInspection
    ) -> EvidenceNoteInput.AssessmentEvidence {
        guard case .ready(let result) = inspection.assessments else { return .error }
        return .ready(result)
    }

    /// The dwelling dataset has a third answer the others do not: it can be
    /// unasked. It is keyed by assessment account, so no account means no
    /// question — which is not the dataset failing and not the dataset saying
    /// there is no house.
    private static func dwellings(
        _ inspection: ParcelInspection
    ) -> EvidenceNoteInput.DwellingEvidence {
        switch inspection.dwellings {
        case .ready(let result):
            return .ready(result.accounts)
        case .unavailable(let reason)
            where reason == ParcelLookupMessage.noAccountToAskDwellingsWith
                || reason == ParcelLookupMessage.dwellingsNotLookedUp:
            return .blocked
        case .unavailable, .looking:
            return .error
        }
    }

    /// A layer's public address, for the note's "go and check this yourself"
    /// link. `nil` drops the whole result rather than printing a finding a
    /// reader cannot trace.
    private static func sourceURL(for id: LayerID) -> URL? {
        let descriptor = LayerCatalog.descriptor(for: id)
        return descriptor?.sourceURL ?? descriptor?.serviceURL
    }

    /// Who a layer's data belongs to, in the words its licence requires.
    ///
    /// The same credit table the printed page uses. The note quotes findings
    /// out of these sources, so it owes the same credit the map does.
    private static func attribution(for id: LayerID) -> (String?, URL?) {
        guard let descriptor = LayerCatalog.descriptor(for: id) else { return (nil, nil) }
        let credit = NativeLayerTraits.attribution(for: descriptor)
        return (
            [credit.copyright ?? credit.provider, credit.disclaimer].joined(separator: ". "),
            credit.licenseURL
        )
    }

    /// How current the source says it is. A finding quoted with no date reads
    /// as today's.
    private static func sourceDate(for id: LayerID) -> String? {
        LayerCatalog.descriptor(for: id)?.sourceDate
    }

    private static func buildingResults(
        _ inspection: ParcelInspection
    ) -> [EvidenceNoteInput.Result] {
        guard let sourceURL = sourceURL(for: .buildings) else { return [] }
        let name = LayerCatalog.descriptor(for: .buildings)?.name ?? "Buildings"
        let (credit, licence) = attribution(for: .buildings)
        switch inspection.buildings {
        case .ready(let count):
            // The count and the caveat travel together. The number on its own
            // reads as a structure count, which is exactly what it is not.
            return [
                EvidenceNoteInput.Result(
                    name: name,
                    sourceURL: sourceURL,
                    status: .ready,
                    results: [
                        "\(count.total) mapped building feature"
                            + (count.total == 1 ? "" : "s"),
                        ParcelEvidenceWording.buildingCaveat(count),
                    ],
                    attribution: credit,
                    licenceURL: licence,
                    sourceDate: sourceDate(for: .buildings)
                )
            ]
        case .unavailable(let reason):
            return [
                EvidenceNoteInput.Result(
                    name: name, sourceURL: sourceURL, status: .error, results: [],
                    errorMessage: "\(reason) No absence is inferred.",
                    attribution: credit, licenceURL: licence
                )
            ]
        case .looking:
            return [
                EvidenceNoteInput.Result(
                    name: name, sourceURL: sourceURL, status: .error, results: [],
                    errorMessage: unsettled,
                    attribution: credit, licenceURL: licence
                )
            ]
        }
    }

    /// The roads and the water, as two sources rather than one.
    ///
    /// They come back in a single lookup, but they answer different questions
    /// and their empty answers mean different things — and "no road listed"
    /// depends on whether the address file answered, which the water half does
    /// not care about.
    private static func contextResults(
        _ inspection: ParcelInspection
    ) -> [EvidenceNoteInput.Result] {
        guard let roadURL = sourceURL(for: .roads),
              let waterURL = sourceURL(for: .waterFeatures)
        else { return [] }
        let roadName = LayerCatalog.descriptor(for: .roads)?.name ?? "Roads"
        let waterName = LayerCatalog.descriptor(for: .waterFeatures)?.name ?? "Water features"
        let (roadCredit, roadLicence) = attribution(for: .roads)
        let (waterCredit, waterLicence) = attribution(for: .waterFeatures)

        switch inspection.mappedContext {
        case .ready(let context):
            let addresses: [CivicAddressResponse.CivicAddress]
            let addressesAnswered: Bool
            if case .ready(let reading) = inspection.civicAddresses {
                addresses = reading.addresses
                addressesAnswered = true
            } else {
                addresses = []
                addressesAnswered = false
            }
            var roads = ParcelRoads.list(context, namedBy: addresses).map { road in
                "\(road.name) · \(road.kind) · "
                    + ParcelEvidenceWording.label(for: road.evidence)
            }
            // A list missing the roads one source would have named looks
            // exactly like a complete one. The panel says so under the list;
            // without this the note handed over the short list on its own.
            if let shortfall = ParcelLookupMessage.roadListShortfall(
                addressesAnswered: addressesAnswered
            ) {
                roads.append(shortfall)
            }
            let water = context.water.map { feature in
                "\(feature.name) · \(feature.kind) · "
                    + (feature.relationship == .intersects
                        ? "Intersects parcel"
                        : ParcelEvidenceWording.adjacentLabel)
            }
            return [
                EvidenceNoteInput.Result(
                    name: roadName,
                    sourceURL: roadURL,
                    status: .ready,
                    results: roads,
                    emptyMessage: ParcelLookupMessage.noRoadsListed(
                        addressesAnswered: addressesAnswered
                    ),
                    attribution: roadCredit,
                    licenceURL: roadLicence,
                    sourceDate: sourceDate(for: .roads)
                ),
                EvidenceNoteInput.Result(
                    name: waterName,
                    sourceURL: waterURL,
                    status: .ready,
                    results: water,
                    emptyMessage: ParcelEvidenceWording.noWaterFeature,
                    attribution: waterCredit,
                    licenceURL: waterLicence,
                    sourceDate: sourceDate(for: .waterFeatures)
                ),
            ]
        case .unavailable(let reason):
            return [
                EvidenceNoteInput.Result(
                    name: roadName, sourceURL: roadURL, status: .error, results: [],
                    errorMessage: reason, attribution: roadCredit, licenceURL: roadLicence
                ),
                EvidenceNoteInput.Result(
                    name: waterName, sourceURL: waterURL, status: .error, results: [],
                    errorMessage: reason, attribution: waterCredit, licenceURL: waterLicence
                ),
            ]
        case .looking:
            return [
                EvidenceNoteInput.Result(
                    name: roadName, sourceURL: roadURL, status: .error, results: [],
                    errorMessage: unsettled, attribution: roadCredit, licenceURL: roadLicence
                ),
                EvidenceNoteInput.Result(
                    name: waterName, sourceURL: waterURL, status: .error, results: [],
                    errorMessage: unsettled, attribution: waterCredit, licenceURL: waterLicence
                ),
            ]
        }
    }

    private static func floodResults(
        _ inspection: ParcelInspection
    ) -> [EvidenceNoteInput.Result] {
        guard let riverURL = sourceURL(for: .publishedRiverFloodZones),
              let coastalURL = sourceURL(for: .coastalFloodCurrent)
        else { return [] }
        let riverName = "Published river flood mapping"
        let coastalName = "Nova Scotia Coastal Hazard Map"
        let (riverCredit, riverLicence) = attribution(for: .publishedRiverFloodZones)
        // The coastal licence names its own three notices, which are conditions
        // of using the data rather than a credit line, so they travel with
        // every coastal finding this note reports.
        let coastalCredit = CoastalFloodLicence.attribution
        let coastalLicence = LayerCatalog.descriptor(for: .coastalFloodCurrent)?.licenceURL
        let riverDate = sourceDate(for: .publishedRiverFloodZones)
        let coastalDate = sourceDate(for: .coastalFloodCurrent)

        switch inspection.floodHazard {
        case .ready(let hazard):
            let river: EvidenceNoteInput.Result
            switch hazard.river {
            case .publishedIntersection(let findings):
                river = EvidenceNoteInput.Result(
                    name: riverName,
                    sourceURL: riverURL,
                    status: .ready,
                    results: findings.map(ParcelEvidenceWording.sentence(for:)),
                    attribution: riverCredit,
                    licenceURL: riverLicence,
                    sourceDate: riverDate
                )
            case .withinPublishedExtentWithNoIntersection:
                river = EvidenceNoteInput.Result(
                    name: riverName, sourceURL: riverURL, status: .ready, results: [],
                    emptyMessage: ParcelEvidenceWording
                        .withinPublishedExtentWithNoIntersection,
                    attribution: riverCredit, licenceURL: riverLicence,
                    sourceDate: riverDate
                )
            case .outsidePublishedExtents:
                // Not an error and not an empty answer: the question was never
                // in scope here, and the note has to be able to say that.
                river = EvidenceNoteInput.Result(
                    name: riverName, sourceURL: riverURL, status: .ready, results: [],
                    emptyMessage: ParcelEvidenceWording.outsidePublishedExtents,
                    attribution: riverCredit, licenceURL: riverLicence,
                    sourceDate: riverDate
                )
            case .unavailable(let failure):
                river = EvidenceNoteInput.Result(
                    name: riverName, sourceURL: riverURL, status: .error, results: [],
                    errorMessage: ParcelEvidenceWording.sentence(for: failure),
                    attribution: riverCredit, licenceURL: riverLicence,
                    sourceDate: riverDate
                )
            }
            return [
                river,
                EvidenceNoteInput.Result(
                    name: coastalName,
                    sourceURL: coastalURL,
                    status: .ready,
                    results: hazard.coastal.map(ParcelEvidenceWording.sentence(for:)),
                    emptyMessage: "No coastal scenario was sampled for this parcel.",
                    attribution: coastalCredit,
                    licenceURL: coastalLicence,
                    sourceDate: coastalDate
                ),
            ]
        case .unavailable(let reason):
            let message = "\(reason) No absence is inferred."
            return [
                EvidenceNoteInput.Result(
                    name: riverName, sourceURL: riverURL, status: .error, results: [],
                    errorMessage: message, attribution: riverCredit, licenceURL: riverLicence
                ),
                EvidenceNoteInput.Result(
                    name: coastalName, sourceURL: coastalURL, status: .error, results: [],
                    errorMessage: message, attribution: coastalCredit, licenceURL: coastalLicence
                ),
            ]
        case .looking:
            return [
                EvidenceNoteInput.Result(
                    name: riverName, sourceURL: riverURL, status: .error, results: [],
                    errorMessage: unsettled, attribution: riverCredit, licenceURL: riverLicence
                ),
                EvidenceNoteInput.Result(
                    name: coastalName, sourceURL: coastalURL, status: .error, results: [],
                    errorMessage: unsettled, attribution: coastalCredit, licenceURL: coastalLicence
                ),
            ]
        }
    }

    /// What a source that had not answered yet is called. The export is gated
    /// on every source having settled, so this should never print — it is here
    /// so that if the gate is ever bypassed the note says "not answered"
    /// rather than "nothing found".
    private static let unsettled =
        "This source had not answered when the note was written."

    private static func resourceResults(
        _ inspection: ParcelInspection
    ) -> [EvidenceNoteInput.Result] {
        guard case .ready(let intersections) = inspection.resources else { return [] }
        return intersections.sources.compactMap { source in
            let descriptor = LayerCatalog.descriptor(for: source.layerID)
            guard let sourceURL = descriptor?.sourceURL ?? descriptor?.serviceURL else {
                return nil
            }
            let name = descriptor?.name ?? source.layerID.rawValue
            let (credit, licence) = attribution(for: source.layerID)
            // Only the mineral inventory is asked twice — on the parcel and
            // within a kilometre — so only there does the relationship need
            // saying. Printing it elsewhere would imply a proximity search
            // that was never run.
            let isMineral = source.layerID == .mineralOccurrences

            switch source.records {
            case .failure:
                return EvidenceNoteInput.Result(
                    name: name,
                    sourceURL: sourceURL,
                    status: .error,
                    results: [],
                    attribution: credit,
                    licenceURL: licence,
                    sourceDate: descriptor?.sourceDate
                )
            case .success(let records):
                return EvidenceNoteInput.Result(
                    name: name,
                    sourceURL: sourceURL,
                    status: .ready,
                    results: records.map { record in
                        (isMineral
                            ? [
                                record.id,
                                record.name,
                                record.relationship == .onParcel ? "On parcel" : "Within 1 km",
                                record.detail,
                            ]
                            : [record.name, record.detail])
                            .filter { !$0.isEmpty }
                            .joined(separator: " · ")
                    },
                    emptyMessage: isMineral
                        ? "No published mineral occurrence was returned on or within 1 km of "
                            + "this parcel."
                        : nil,
                    attribution: credit,
                    licenceURL: licence,
                    sourceDate: descriptor?.sourceDate
                )
            }
        }
    }
}
