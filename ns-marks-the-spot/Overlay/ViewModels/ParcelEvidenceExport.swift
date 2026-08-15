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
    }

    private static func hasSettled<Value>(_ evidence: ParcelEvidence<Value>) -> Bool {
        if case .looking = evidence { return false }
        return true
    }

    static func input(
        generatedAt: Date,
        inspection: ParcelInspection,
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
            mode: mode,
            shareURL: shareURL,
            position: position,
            activeLayers: sources(
                activeLayers,
                baseMap: baseMap,
                fletcherBaseURL: fletcherBaseURL
            ),
            events: events(inspection, mode: mode),
            civicAddresses: civicAddresses(inspection),
            civicNotice: notice(inspection.civicAddresses),
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
                    results: []
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
                        : nil
                )
            }
        }
    }
}
