import Foundation
import GeoCore
import NSDataServices
import Observation

/// The selected parcel's evidence panel: the seven-source lookup group and the
/// inspection it fills in.
///
/// Its own model, extracted from `OverlayViewModel`, because the panel is a
/// complete machine with one clean seam: a `Context` describing what is
/// selected goes in, an observable `ParcelInspection` comes out, and nothing
/// in between needs to know how the selection came to be. `OverlayViewModel`
/// stays the coordinator — it assembles the context, because notice, records
/// and record mode are its facts — and forwards the panel's state to the
/// views, so the observation graph is unchanged.
@MainActor
@Observable
final class ParcelEvidencePanel {
    /// Everything a rebuild needs to know about what is selected, gathered by
    /// the coordinator at the moment of the refresh.
    struct Context {
        var pid: String
        var showsTaxSale: Bool
        var taxSaleNotice: TaxSaleNoticeContext?
        var historicalRecords: [HistoricalRecordContext]
        var recordModeMarker: String?
        var selectedFeatures: [ParcelFeature]
        var boundaryNotice: String?
    }

    /// What the panel shows about the selected parcel, `nil` when none is
    /// selected.
    private(set) var inspection: ParcelInspection?

    /// Bumped every time a parcel's evidence starts over.
    ///
    /// The open PID is not enough to tell one wait from the next. Toggling tax
    /// sales, or tapping the parcel that is already open, rebuilds the same
    /// PID's inspection with every service back at `looking` — and anything
    /// timing that wait off the PID alone would carry the finished clock
    /// straight over the new one, and let a page be written naming sources
    /// that had been given no time at all.
    private(set) var evidenceGeneration = 0

    @ObservationIgnored private var inspectionLookup: Task<Void, Never>?

    /// Set by every explicit selection, so the next refresh rebuilds the
    /// evidence in full even when the parcel is the one already open. Asking
    /// about the same parcel again is the reader asking again: the sources are
    /// re-asked and the sources-have-had-their-time wait starts over. Without
    /// this, the unchanged-inputs fast path below would read a deliberate
    /// re-ask as a styling refresh.
    @ObservationIgnored private var wantsFreshInspection = false

    @ObservationIgnored private let civicFetcher: CivicAddressFetcher
    @ObservationIgnored private let contextFetcher: ParcelContextFetcher
    @ObservationIgnored private let assessmentFetcher: PVSCAssessmentFetcher
    @ObservationIgnored private let dwellingFetcher: PVSCDwellingFetcher
    @ObservationIgnored private let buildingFetcher: BuildingCountFetcher
    @ObservationIgnored private let resourceFetcher: ResourceIntersectionFetcher
    @ObservationIgnored private let floodFetcher: FloodHazardFetcher
    @ObservationIgnored private let clearanceBox: LicenceClearanceBox

    init(
        civicFetcher: CivicAddressFetcher,
        contextFetcher: ParcelContextFetcher,
        assessmentFetcher: PVSCAssessmentFetcher,
        dwellingFetcher: PVSCDwellingFetcher,
        buildingFetcher: BuildingCountFetcher,
        resourceFetcher: ResourceIntersectionFetcher,
        floodFetcher: FloodHazardFetcher,
        clearanceBox: LicenceClearanceBox
    ) {
        self.civicFetcher = civicFetcher
        self.contextFetcher = contextFetcher
        self.assessmentFetcher = assessmentFetcher
        self.dwellingFetcher = dwellingFetcher
        self.buildingFetcher = buildingFetcher
        self.resourceFetcher = resourceFetcher
        self.floodFetcher = floodFetcher
        self.clearanceBox = clearanceBox
    }

    /// The same seam as `awaitParcelLookup`, for the panel's two lookups.
    func awaitInspection() async {
        await inspectionLookup?.value
    }

    /// The next `refresh` rebuilds in full even for the unchanged parcel.
    func requestFreshRebuild() {
        wantsFreshInspection = true
    }

    /// One answer from one source, on its way back to the panel.
    private enum Evidence: Sendable {
        case addresses(Result<CivicAddressResponse.Reading, CivicAddressFailure>)
        case context(Result<ParcelContext, ParcelContextFailure>)
        case assessments(Result<PVSCAssessmentResponse.Result, PVSCAssessmentFailure>)
        case dwellings(Result<PVSCDwellingResponse.Result, PVSCDwellingFailure>)
        case buildings(Result<ParcelBuildingCount, BuildingCountFailure>)
        /// One value carrying three sources, because they are refused together
        /// — a parcel with no rings — and answer separately.
        case resources(Result<ParcelResourceIntersections, ResourceIntersectionQuery.Refusal>)
        /// Likewise: the river study areas and the three coastal scenarios are
        /// refused together and answer separately.
        case flood(Result<ParcelFloodHazard, FloodHazardQuery.Refusal>)
    }

    /// Publishes a rebuilt panel, and says that its evidence is new.
    private func beginInspection(_ state: ParcelInspection) {
        inspection = state
        evidenceGeneration &+= 1
    }

    /// Closes the panel, and says that whatever was being waited on is over.
    private func endInspection() {
        inspection = nil
        evidenceGeneration &+= 1
    }

    /// Rebuilds the panel for whatever the context says is selected now, or
    /// closes it for `nil`.
    ///
    /// Everything the parcel record itself carries is filled in at once; the
    /// lookups that go out to services start `looking` and land separately,
    /// so a slow one does not hold up a fast one.
    func refresh(_ context: Context?) {
        guard let context else {
            wantsFreshInspection = false
            inspectionLookup?.cancel()
            inspectionLookup = nil
            endInspection()
            return
        }
        let pid = context.pid
        let noticeAAN = context.taxSaleNotice?.listing.aan

        // A styling refresh for the parcel already open: same PID, same
        // account, same geometry, and no explicit re-ask pending. Only the
        // synchronous fields can have changed, and recomputing just those
        // keeps a notice switch or a redemption filter from cancelling six
        // in-flight service lookups, resetting the whole card to "looking",
        // and — because the export clock is keyed on `evidenceGeneration` —
        // restarting the sources-have-had-their-time wait the reader may be
        // sitting out.
        if !wantsFreshInspection,
           var current = inspection,
           current.pid == pid,
           current.taxSaleNotice?.listing.aan == noticeAAN,
           current.boundaryNotice == context.boundaryNotice,
           current.mappedArea == ParcelResponse.mappedArea(
               forPID: pid,
               in: ParcelFeatureCollection(identifiedFeatures: context.selectedFeatures)
           ) {
            current.showsTaxSale = context.showsTaxSale
            current.taxSaleNotice = context.taxSaleNotice
            current.historicalRecords = context.historicalRecords
            current.recordModeMarker = context.recordModeMarker
            inspection = current
            return
        }

        wantsFreshInspection = false
        inspectionLookup?.cancel()
        inspectionLookup = nil

        guard !context.selectedFeatures.isEmpty else {
            // No parcel record, so every source that takes the parcel's rings
            // is unaskable. A notice is still worth showing on its own: the
            // municipality named this PID, and that fact does not depend on
            // NSPRD holding geometry for it.
            guard context.taxSaleNotice != nil || !context.historicalRecords.isEmpty else {
                endInspection()
                return
            }
            var state = ParcelInspection(pid: pid, mappedArea: nil, boundaryNotice: nil)
            state.showsTaxSale = context.showsTaxSale
            state.taxSaleNotice = context.taxSaleNotice
            state.historicalRecords = context.historicalRecords
            state.recordModeMarker = context.recordModeMarker
            let reason = ParcelLookupMessage.noParcelRecordToAskWith
            state.civicAddresses = .unavailable(reason)
            state.mappedContext = .unavailable(reason)
            state.buildings = .unavailable(reason)
            state.resources = .unavailable(reason)
            state.floodHazard = .unavailable(reason)
            if !askingPVSCByAccount(noticeAAN, of: &state) {
                state.assessments = .unavailable(reason)
                state.dwellings = .unavailable(reason)
            }
            beginInspection(state)
            askPVSCByAccount(noticeAAN, for: pid)
            return
        }

        let features = context.selectedFeatures
        var state = ParcelInspection(
            pid: pid,
            mappedArea: ParcelResponse.mappedArea(
                forPID: pid,
                in: ParcelFeatureCollection(identifiedFeatures: features)
            ),
            boundaryNotice: context.boundaryNotice
        )
        state.showsTaxSale = context.showsTaxSale
        state.taxSaleNotice = context.taxSaleNotice
        state.historicalRecords = context.historicalRecords
        state.recordModeMarker = context.recordModeMarker

        let parts = features.flatMap(\.boundary.parts)
        guard !parts.isEmpty else {
            // The record came back without a shape, so neither lookup can be
            // made: both take the parcel's rings. Saying so is the point —
            // "no civic address on this parcel" would be a finding, and nothing
            // was asked.
            state.civicAddresses = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.mappedContext = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.buildings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.resources = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            state.floodHazard = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            if !askingPVSCByAccount(noticeAAN, of: &state) {
                state.assessments = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
                state.dwellings = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
            }
            beginInspection(state)
            askPVSCByAccount(noticeAAN, for: pid)
            return
        }
        beginInspection(state)

        inspectionLookup = Task {
            [
                weak self, civicFetcher, contextFetcher, assessmentFetcher, dwellingFetcher,
                buildingFetcher, resourceFetcher, floodFetcher,
                clearance = clearanceBox.clearance,
                // The area the coastal sample is turned into square metres
                // with, which is the area of the pieces that were sampled and
                // not the whole PID's. A parcel with a piece that could not be
                // drawn was never looked at there, and spreading a percentage
                // measured on the drawn pieces across the undrawn one would
                // report flooded ground nobody screened.
                mappedAreaSquareMetres = ParcelResponse.mappedAreaSquareMetres(
                    forPID: pid,
                    in: ParcelFeatureCollection(
                        identifiedFeatures: features.filter { !$0.boundary.parts.isEmpty }
                    )
                ),
                noticeAAN
            ] in
            await withTaskGroup(of: Evidence.self) { group in
                group.addTask {
                    do throws(CivicAddressFailure) {
                        return .addresses(.success(try await civicFetcher.addresses(inside: parts)))
                    } catch {
                        return .addresses(.failure(error))
                    }
                }
                group.addTask {
                    do throws(ParcelContextFailure) {
                        return .context(
                            .success(try await contextFetcher.context(for: parts, clearance: clearance))
                        )
                    } catch {
                        return .context(.failure(error))
                    }
                }
                group.addTask {
                    do throws(PVSCAssessmentFailure) {
                        return .assessments(
                            .success(
                                try await assessmentFetcher.assessments(
                                    for: parts, noticeAAN: noticeAAN
                                )
                            )
                        )
                    } catch {
                        return .assessments(.failure(error))
                    }
                }
                group.addTask {
                    do throws(BuildingCountFailure) {
                        return .buildings(
                            .success(try await buildingFetcher.count(for: parts, clearance: clearance))
                        )
                    } catch {
                        return .buildings(.failure(error))
                    }
                }
                group.addTask {
                    do throws(ResourceIntersectionQuery.Refusal) {
                        return .resources(
                            .success(
                                try await resourceFetcher.intersections(
                                    for: parts, clearance: clearance
                                )
                            )
                        )
                    } catch {
                        return .resources(.failure(error))
                    }
                }
                group.addTask {
                    do throws(FloodHazardQuery.Refusal) {
                        return .flood(
                            .success(
                                try await floodFetcher.hazard(
                                    for: parts,
                                    mappedAreaSquareMetres: mappedAreaSquareMetres,
                                    clearance: clearance
                                )
                            )
                        )
                    } catch {
                        return .flood(.failure(error))
                    }
                }
                for await evidence in group {
                    guard !Task.isCancelled, let self else { return }
                    self.apply(evidence, to: pid)
                    // The dwelling dataset is keyed by account number, so it
                    // joins the group only once the assessment lookup has named
                    // some — and it joins this group rather than a task of its
                    // own so that abandoning the parcel cancels it too.
                    if case .assessments(.success(let result)) = evidence, !result.accounts.isEmpty,
                        self.inspection?.pid == pid {
                        let aans = result.accounts.map(\.aan)
                        group.addTask {
                            do throws(PVSCDwellingFailure) {
                                return .dwellings(
                                    .success(try await dwellingFetcher.dwellings(forAANs: aans))
                                )
                            } catch {
                                return .dwellings(.failure(error))
                            }
                        }
                    }
                }
            }
        }
    }

    /// Whether PVSC can still be asked about a parcel with no usable geometry.
    ///
    /// An account number is not a shape, so the absence of one does not stop
    /// this lookup the way it stops the others. Sets the two account-fed
    /// sections back to `looking` when the answer is yes, because the caller
    /// has already written the refusal that applies to everything else.
    private func askingPVSCByAccount(
        _ noticeAAN: String?,
        of state: inout ParcelInspection
    ) -> Bool {
        guard let noticeAAN, PVSCAssessmentQuery.normalizeAAN(noticeAAN) != nil else {
            return false
        }
        state.assessments = .looking
        state.dwellings = .looking
        return true
    }

    /// Asks PVSC for the notice's account, without any parcel geometry.
    ///
    /// The web runs this lookup whenever the notice named an AAN, even with no
    /// parcel feature selected. Without it, a listed property NSPRD holds no
    /// shape for would show nothing at all, when the assessment record it is
    /// keyed to is sitting there under a number the municipality printed.
    private func askPVSCByAccount(_ noticeAAN: String?, for pid: String) {
        guard let noticeAAN, PVSCAssessmentQuery.normalizeAAN(noticeAAN) != nil else { return }

        inspectionLookup = Task { [weak self, assessmentFetcher, dwellingFetcher] in
            let assessed: Evidence
            do throws(PVSCAssessmentFailure) {
                assessed = .assessments(
                    .success(try await assessmentFetcher.assessments(for: [], noticeAAN: noticeAAN))
                )
            } catch {
                assessed = .assessments(.failure(error))
            }
            guard !Task.isCancelled, let self else { return }
            self.apply(assessed, to: pid)

            guard case .assessments(.success(let result)) = assessed, !result.accounts.isEmpty,
                self.inspection?.pid == pid
            else { return }

            let dwelt: Evidence
            do throws(PVSCDwellingFailure) {
                dwelt = .dwellings(
                    .success(try await dwellingFetcher.dwellings(forAANs: result.accounts.map(\.aan)))
                )
            } catch {
                dwelt = .dwellings(.failure(error))
            }
            guard !Task.isCancelled else { return }
            self.apply(dwelt, to: pid)
        }
    }

    /// Writes one source's answer into the panel, if the panel is still showing
    /// the parcel it was asked about.
    private func apply(_ evidence: Evidence, to pid: String) {
        guard inspection?.pid == pid else { return }
        switch evidence {
        case .addresses(.success(let reading)):
            inspection?.civicAddresses = .ready(reading)
        case .addresses(.failure(.cancelled)), .context(.failure(.cancelled)),
            .assessments(.failure(.cancelled)), .dwellings(.failure(.cancelled)),
            .buildings(.failure(.cancelled)):
            // Superseded, not failed. Leaving it `looking` is honest: this
            // parcel's panel is about to be replaced.
            break
        case .addresses(.failure(let failure)):
            inspection?.civicAddresses = .unavailable(
                ParcelLookupMessage.addressEvidenceFailure(failure)
            )
        case .context(.success(let context)):
            inspection?.mappedContext = .ready(context)
        case .context(.failure(let failure)):
            inspection?.mappedContext = .unavailable(
                ParcelLookupMessage.contextEvidenceFailure(failure)
            )
        case .assessments(.success(let result)):
            inspection?.assessments = .ready(result)
            if result.accounts.isEmpty {
                // No account to ask about, so the dwelling dataset is never
                // consulted. "No dwelling record" would be a finding drawn from
                // a question nobody asked.
                inspection?.dwellings = .unavailable(ParcelLookupMessage.noAccountToAskDwellingsWith)
            }
        case .assessments(.failure(let failure)):
            inspection?.assessments = .unavailable(
                ParcelLookupMessage.assessmentEvidenceFailure(failure)
            )
            inspection?.dwellings = .unavailable(ParcelLookupMessage.dwellingsNotLookedUp)
        case .dwellings(.success(let result)):
            inspection?.dwellings = .ready(result)
        case .dwellings(.failure(let failure)):
            inspection?.dwellings = .unavailable(
                ParcelLookupMessage.dwellingEvidenceFailure(failure)
            )
        case .buildings(.success(let count)):
            inspection?.buildings = .ready(count)
        case .buildings(.failure(let failure)):
            inspection?.buildings = .unavailable(
                ParcelLookupMessage.buildingEvidenceFailure(failure)
            )
        case .resources(.success(let intersections)):
            inspection?.resources = .ready(intersections)
        case .resources(.failure(.noBoundary)):
            inspection?.resources = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
        case .flood(.success(let hazard)):
            inspection?.floodHazard = .ready(hazard)
        case .flood(.failure(.noBoundary)):
            inspection?.floodHazard = .unavailable(ParcelLookupMessage.noBoundaryToAskWith)
        }
    }
}
