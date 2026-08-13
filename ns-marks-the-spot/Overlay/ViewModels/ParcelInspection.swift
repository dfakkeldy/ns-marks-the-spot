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

    /// How many buildings NSTDB has mapped inside the outline. A count of zero
    /// is an answer; it is not a vacant lot.
    var buildings: ParcelEvidence<ParcelBuildingCount> = .looking

    var civicAddresses: ParcelEvidence<[CivicAddressResponse.CivicAddress]> = .looking
    var mappedContext: ParcelEvidence<ParcelContext> = .looking
    var assessments: ParcelEvidence<PVSCAssessmentResponse.Result> = .looking

    /// Downstream of `assessments`: the dwelling dataset is keyed by account
    /// number, so this question cannot be asked until that one is answered, and
    /// cannot be asked at all when it comes back with no account.
    var dwellings: ParcelEvidence<PVSCDwellingResponse.Result> = .looking
}
