import Foundation

/// What somebody typed into the search field.
///
/// One field takes two kinds of identifier, and the wrong reading of an input
/// produces the wrong complaint: `1234567` searched as an address comes back as
/// an address that does not exist, when what happened is that a PID is eight
/// digits and this is seven.
///
/// The order of the tests is the web's `submitPidSearch`, and it is the order
/// that makes those complaints correct.
public enum ParcelSearchInput: Sendable, Equatable {
    /// Nothing to look up. Not an error — an empty field is how a search is
    /// abandoned.
    case empty
    /// Eight digits, normalised.
    case pid(String)
    /// Digits and separators, but not a PID. Meant as a parcel ID and the wrong
    /// length, so it is never searched as an address.
    case notAPID
    /// Too little to search the address file with. Two characters match half
    /// the province.
    case tooShort
    /// Civic address text, normalised for the query.
    case address(String)

    public static func classify(_ typed: String) -> ParcelSearchInput {
        if let pid = ParcelQuery.normalizePID(typed) {
            return .pid(pid)
        }
        let normalized = CivicAddressQuery.normalize(typed)
        if normalized.isEmpty {
            return .empty
        }
        if typed.range(of: #"^[\d\s-]+$"#, options: .regularExpression) != nil {
            return .notAPID
        }
        // JavaScript's `.length`, so the same three characters count on both
        // surfaces.
        return normalized.utf16.count < 3 ? .tooShort : .address(normalized)
    }
}
