import Testing

@testable import NSDataServices

/// One field, two kinds of identifier. These tests pin which reading wins,
/// because the reading decides which complaint the user gets back.
@Suite("Reading what was typed into the search field")
struct ParcelSearchInputTests {
    @Test(
        "Eight digits are a PID however they are written",
        arguments: [
            ("40012345", "40012345"),
            (" 40012345 ", "40012345"),
            ("40-012-345", "40012345"),
            ("400 123 45", "40012345"),
        ]
    )
    func eightDigitsAreAPID(typed: String, expected: String) {
        #expect(ParcelSearchInput.classify(typed) == .pid(expected))
    }

    /// Web parity, and a rough edge worth knowing about: a letter anywhere
    /// disqualifies the whole string as a PID, so "PID 40012345" is searched as
    /// address text and comes back unmatched. Left as the web has it — the
    /// message that results is still true about what was searched — rather than
    /// invented here on one surface.
    @Test("A letter anywhere means it is not read as a PID")
    func aLetterMeansItIsNotAPID() {
        #expect(ParcelSearchInput.classify("PID 40012345") == .address("PID 40012345"))
    }

    /// The case the ordering exists for. Seven digits searched as an address
    /// comes back "no mapped civic address matched", which reads as "that
    /// property is not in the file" when the real answer is "a PID is eight
    /// digits".
    @Test(
        "Digits that are not a PID are the wrong length, not a missing address",
        arguments: ["1234567", "400123456", "40-012-34", "  12 ", "-", "1 2 3"]
    )
    func digitsThatAreNotAPIDAreNotSearchedAsAddresses(typed: String) {
        #expect(ParcelSearchInput.classify(typed) == .notAPID)
    }

    @Test("An empty field is abandonment, not an error", arguments: ["", "   ", "\n\t"])
    func anEmptyFieldIsNotAnError(typed: String) {
        #expect(ParcelSearchInput.classify(typed) == .empty)
    }

    @Test("Under three characters is too little to search on", arguments: ["ab", "a", "Rd"])
    func underThreeCharactersIsTooShort(typed: String) {
        #expect(ParcelSearchInput.classify(typed) == .tooShort)
    }

    /// Counted in UTF-16 units, as JavaScript counts, so the same three
    /// characters are accepted on both surfaces.
    @Test("The three-character floor is counted the way the web counts it")
    func theFloorIsCountedInUTF16() {
        #expect(ParcelSearchInput.classify("Ré") == .tooShort)
        #expect(ParcelSearchInput.classify("Réo") == .address("Réo"))
    }

    @Test("Address text arrives normalised")
    func addressTextArrivesNormalised() {
        #expect(ParcelSearchInput.classify("  12   Main   St  ") == .address("12 Main St"))
    }

    /// A house number with a road name is an address, not a malformed PID —
    /// the digit test only fires when there is nothing but digits.
    @Test("A civic number with a road name is an address")
    func aCivicNumberWithARoadNameIsAnAddress() {
        #expect(ParcelSearchInput.classify("12 Main St") == .address("12 Main St"))
    }
}
