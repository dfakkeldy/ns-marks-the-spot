import NSDataServices

/// One source's answer about the selected parcel.
///
/// Three states and no fourth, because the fourth is the one that does damage:
/// a source that could not be asked rendering as a source that answered with
/// nothing. `unavailable` carries words for exactly that reason — the panel has
/// to be able to say *why* it knows nothing, and an empty `ready` is the only
/// thing that means the parcel has none of whatever was asked for.
enum ParcelEvidence<Value: Equatable>: Equatable {
    case looking
    case ready(Value)
    case unavailable(String)
}

/// What the panel knows about the parcel the user selected.
///
/// Assembled here rather than in the view so that "loaded", "empty" and
/// "unavailable" are decided once, by the code that saw the failure, instead of
/// being inferred from an empty array further down.
struct ParcelInspection: Equatable {
    /// Exactly the PID the service returned.
    let pid: String

    /// The service's own computed area, or `nil` when it sent none. Never
    /// derived from the drawn outline: an area measured here would be a second
    /// number competing with the official one.
    let mappedArea: MappedArea?

    /// Why the parcel is not drawn, when it is not. The panel repeats it
    /// because a parcel with no outline looks identical to one that is not
    /// there.
    let boundaryNotice: String?

    /// The current municipal notice that named this PID, when one did.
    ///
    /// Not `ParcelEvidence`: the notices ship with the app, so this is known
    /// the moment a parcel is selected and can never be "still looking" or
    /// "could not ask". `nil` means no notice this map carries lists the
    /// parcel — which is not the same as the parcel not being in a tax sale
    /// somewhere this map does not cover.
    var taxSaleNotice: TaxSaleNoticeContext?

    /// The published historical records naming this PID, when the map is
    /// reading them.
    ///
    /// Empty in the current-notice mode by design rather than by accident: the
    /// two record sets answer different questions, and a dated result shown
    /// beside a live notice is the one confusion this feature cannot afford.
    var historicalRecords: [HistoricalRecordContext] = []

    /// Which record set the map is reading, printed on the card when that is not
    /// the ordinary one. A reader who left the app in the historical mode and
    /// came back to it needs to know which question the parcel colours and this
    /// card are answering before they read either.
    var recordModeMarker: String?

    /// How many buildings NSTDB has mapped inside the outline. A count of zero
    /// is an answer; it is not a vacant lot.
    var buildings: ParcelEvidence<ParcelBuildingCount> = .looking

    /// The geology and resource sources, each carrying its own answer or its
    /// own reason for having none.
    var resources: ParcelEvidence<ParcelResourceIntersections> = .looking

    /// Published river study areas and the three coastal scenarios. Screening
    /// evidence: the coastal half is a pixel count taken off the Province's own
    /// render, not a survey of the ground.
    var floodHazard: ParcelEvidence<ParcelFloodHazard> = .looking

    var civicAddresses: ParcelEvidence<[CivicAddressResponse.CivicAddress]> = .looking
    var mappedContext: ParcelEvidence<ParcelContext> = .looking
    var assessments: ParcelEvidence<PVSCAssessmentResponse.Result> = .looking

    /// Downstream of `assessments`: the dwelling dataset is keyed by account
    /// number, so this question cannot be asked until that one is answered, and
    /// cannot be asked at all when it comes back with no account.
    var dwellings: ParcelEvidence<PVSCDwellingResponse.Result> = .looking
}
