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

    /// The service returned shapes this build could not identify.
    ///
    /// Neither "there is no parcel" nor "we could not ask": something came back
    /// and it carried no readable PID. Saying either of the others would turn a
    /// gap in the reply into a fact about the ground or about the network.
    static func unidentifiedAtPoint(_ count: Int) -> String {
        count == 1
            ? "NSPRD returned a boundary at that point with no readable PID."
            : "NSPRD returned \(count) boundaries at that point with no readable PID."
    }

    static func unidentifiedForPID(_ count: Int) -> String {
        "NSPRD answered for that PID with \(count) boundar\(count == 1 ? "y" : "ies") "
            + "carrying no readable PID."
    }

    /// Several parcels meet at the point that was asked about.
    ///
    /// The one selected is the first the service listed, and the order it lists
    /// in is not evidence of which parcel the point belongs to — so the user is
    /// told there is a choice rather than left to assume there was not.
    static func selectedWhereParcelsMeet(pid: String, others: Int) -> String {
        "PID \(pid) selected. \(others + 1) parcels meet at that point; "
            + "this is the first NSPRD listed, not a determination of which one it is."
    }

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

    // MARK: - The parcel panel

    /// The record arrived without a shape, so the lookups that take its rings
    /// could not be made. Not a finding about the parcel.
    static let noBoundaryToAskWith =
        "This parcel arrived without a boundary, so nothing could be looked up inside it."

    /// What an empty road list means, which depends on who answered.
    ///
    /// Two sources fill that list. The web credits both in one sentence
    /// whatever state they are in, so a civic lookup that is still loading — or
    /// that failed — reads as a source that looked and found no road. Only the
    /// sources that actually answered are named here.
    static func noRoadsListed(addressesAnswered: Bool) -> String {
        addressesAnswered
            ? "No intersecting, adjacent, or civic-address road was found for this parcel."
            : "No mapped road intersects or runs beside this parcel."
    }

    /// Why a road list may be short, or `nil` when it is not.
    ///
    /// A list missing the roads one source would have named looks exactly like
    /// a complete one, so the shortfall has to be said out loud.
    static func roadListShortfall(addressesAnswered: Bool) -> String? {
        addressesAnswered
            ? nil
            : "The civic address file has not answered, so a road named only by an "
                + "address on this parcel would not be listed."
    }

    /// Why the civic-address lookup for a parcel produced nothing.
    ///
    /// Separate from the search wording because it answers a different
    /// question: the search says the file matched nothing, this says the file
    /// could not be consulted about this parcel.
    static func addressEvidenceFailure(_ failure: CivicAddressFailure) -> String {
        switch failure {
        case .cancelled:
            return "Civic address lookup was replaced."
        case .refused(.noBoundary):
            return noBoundaryToAskWith
        case .refused(.queryTooShort), .refused(.malformedURL):
            return "The civic address lookup is misconfigured in this build."
        case .unreachable, .invalidHTTPStatus, .unreadable:
            return "Civic address lookup is unavailable right now."
        }
    }

    /// Why the mapped-feature lookup produced nothing.
    static func contextEvidenceFailure(_ failure: ParcelContextFailure) -> String {
        switch failure {
        case .cancelled:
            return "Mapped feature lookup was replaced."
        case .refused(.licenceNotAccepted):
            return "Accept the Province data licence to see mapped roads and water."
        case .refused(.noBoundary):
            return noBoundaryToAskWith
        case .refused(.noServiceURL), .refused(.malformedURL):
            return "The mapped feature services are misconfigured in this build."
        case .unreachable, .invalidHTTPStatus, .unreadable:
            return "Mapped road and water intersections are unavailable right now."
        }
    }

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
