import Testing

@testable import ns_marks_the_spot

/// Reading a QR code back out of Core Image as a grid.
///
/// The page draws what this returns, so a grid that is the wrong size, the
/// wrong way up, or padded with the encoder's own quiet zone produces a square
/// that looks like a code and scans as nothing.
@Suite("The printed page's QR code")
struct QRCodeModulesTests {
    private static let link = "https://nsmarks.kinnoki.com/?lat=46.1&lng=-61.2&z=14"

    @Test func aLinkEncodesToASquareGridOfModules() throws {
        let modules = try #require(QRCodeModules.modules(for: Self.link))

        #expect(modules.count >= 21)
        for row in modules {
            #expect(row.count == modules.count)
        }
    }

    /// A QR carries its three finder patterns in the corners — seven dark
    /// modules across the top of each. Checking one is enough to know the grid
    /// is the code itself and not a scaled or padded rendering of it.
    @Test func theGridStartsAtTheCodeRatherThanItsQuietZone() throws {
        let modules = try #require(QRCodeModules.modules(for: Self.link))

        #expect(Array(modules[0].prefix(7)) == Array(repeating: true, count: 7))
        #expect(Array(modules[6].prefix(7)) == Array(repeating: true, count: 7))
        // The finder pattern's white ring: the eighth module of the top row is
        // light in every valid code.
        #expect(modules[0][7] == false)
    }

    /// Which way up the grid is, measured rather than assumed.
    ///
    /// A QR carries exactly three finder squares: top-left, top-right and
    /// bottom-left. The empty fourth corner is the only thing in the code that
    /// tells the two vertical orientations apart, and it is the reason a
    /// mirrored grid has to be caught here. Encoding the link and decoding it
    /// again does not catch it: Apple's own detector reads a mirrored code
    /// quite happily, so that round trip passes whichever way up the grid is.
    /// A phone camera pointed at the printed page mostly does not.
    @Test func theThreeFinderSquaresSitInTheCornersAQrReaderLooksIn() throws {
        let modules = try #require(QRCodeModules.modules(for: Self.link))
        let last = modules.count - 7

        #expect(Self.holdsAFinder(modules, row: 0, column: 0))
        #expect(Self.holdsAFinder(modules, row: 0, column: last))
        #expect(Self.holdsAFinder(modules, row: last, column: 0))
        #expect(Self.holdsAFinder(modules, row: last, column: last) == false)
    }

    /// The seven-by-seven finder square: a dark border, a light ring inside it,
    /// a three-by-three dark core.
    private static func holdsAFinder(_ modules: [[Bool]], row: Int, column: Int) -> Bool {
        for down in 0..<7 {
            for across in 0..<7 {
                let onBorder = down == 0 || down == 6 || across == 0 || across == 6
                let inCore = (2...4).contains(down) && (2...4).contains(across)
                if modules[row + down][column + across] != (onBorder || inCore) {
                    return false
                }
            }
        }
        return true
    }

    @Test func theSameLinkAlwaysEncodesTheSameWay() throws {
        let first = try #require(QRCodeModules.modules(for: Self.link))
        let second = try #require(QRCodeModules.modules(for: Self.link))
        #expect(first == second)
    }

    /// Nothing to point at is not an error to report; it is a page with no
    /// shortcut on it.
    @Test func anEmptyLinkEncodesNothing() {
        #expect(QRCodeModules.modules(for: "") == nil)
    }

    @Test func aGridWithNoDarkModulesTrimsToNothing() {
        #expect(QRCodeModules.trimmed([[false, false], [false, false]]) == nil)
    }
}
