import NSDataServices

/// What a parcel lookup is allowed to say to the user.
///
/// The wording is the web's, and the distinction it protects is the one the
/// whole parcel path exists to protect: "the service looked and found no
/// parcel" and "we could not ask" are different sentences, because a user
/// deciding whether a property exists will act on whichever one they read.
nonisolated enum ParcelLookupMessage {
    static let searchingAtPoint = "Finding the parcel at that map point…"

    static func searching(for label: String) -> String {
        "Finding the parcel for \(label)…"
    }

    static func loading(pid: String) -> String {
        "Loading parcel \(pid)…"
    }

    static func selected(pid: String) -> String {
        "PID \(pid) selected."
    }

    /// The service answered, and there was nothing there.
    ///
    /// The only message in this file that says something about the ground. It
    /// is reachable from a successful empty collection and from nowhere else.
    static let noParcelAtPoint = "No NSPRD parcel was found at that point."

    static let noParcelForPID = "No NSPRD parcel was found for that PID."

    // MARK: - Civic addresses

    static let searchingAddresses = "Searching mapped civic addresses…"

    /// What to type. Two sentences rather than one, because the two inputs fail
    /// for opposite reasons: digits that are not a PID are the wrong length,
    /// and a two-letter address is too little to search on.
    static let enterAPID = "Enter an 8-digit Nova Scotia parcel ID."
    static let enterMoreOfAnAddress = "Enter at least three characters of a civic address."

    /// The file was searched and matched nothing.
    ///
    /// "Mapped" is doing work: the Civic Address File is a record of civic
    /// points, and an address missing from it is not an address that does not
    /// exist.
    static let noAddressMatched = "No mapped civic address matched that search."

    /// Why an address search produced nothing, in words that do not claim the
    /// address is absent. `nil` for cancellation, as with parcels.
    static func failure(_ failure: CivicAddressFailure) -> String? {
        switch failure {
        case .cancelled:
            return nil
        case .refused(.queryTooShort):
            return enterMoreOfAnAddress
        case .refused(.noBoundary), .refused(.malformedURL):
            return "The civic address search is misconfigured in this build."
        case .unreachable, .invalidHTTPStatus, .unreadable:
            return "Civic address search is unavailable right now."
        }
    }

    /// Why a lookup produced nothing, in words that do not claim the parcel is
    /// absent.
    ///
    /// `nil` for cancellation: the user tapped somewhere else or typed on, and
    /// a message about a lookup they already replaced would arrive after the
    /// one they are waiting for.
    static func failure(_ failure: ParcelLookupFailure, forPointTap: Bool) -> String? {
        switch failure {
        case .cancelled:
            return nil
        case .refused(.licenceNotAccepted):
            return "Accept the Province data licence to look up parcels."
        case .refused(.noValidPID):
            return "Enter an 8-digit Nova Scotia parcel ID."
        case .refused(.invalidCoordinate):
            return "That point is not on the map."
        case .refused(.noServiceURL), .refused(.malformedURL):
            return "The parcel service address is misconfigured in this build."
        case .unreachable, .invalidHTTPStatus, .unreadable:
            // One sentence for every way of not getting an answer, because the
            // difference between them is not the user's to act on — what
            // matters is that the question went unanswered, which is not the
            // same as the answer being no.
            return forPointTap
                ? "The Province parcel lookup is unavailable right now."
                : "The Province parcel search is unavailable right now."
        }
    }
}
