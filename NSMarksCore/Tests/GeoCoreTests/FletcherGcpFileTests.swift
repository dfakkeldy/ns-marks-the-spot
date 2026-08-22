import Foundation
import Testing

@testable import GeoCore

/// Two controls and one check, matching the emitted `tools/fletcher/gcps`
/// schema. The same sample the web parser's tests use.
private let sample = [
    "# sheet-19 Fletcher graticule points.",
    "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
    FletcherGcpFile.header,
    "1652.0,1326.0,-61.583333,45.916667,control,61d35mW 45d55mN",
    "1652.0,3950.0,-61.583333,45.833333,check,61d35mW 45d50mN",
    "3472.0,1326.0,-61.500000,45.916667,control,61d30mW 45d55mN",
    "",
].joined(separator: "\n")

@Suite("Reading a Fletcher points file")
struct FletcherGcpParseTests {
    @Test("Control rows arrive as placeable points")
    func controlRowsArriveAsPlaceablePoints() throws {
        let parsed = try FletcherGcpFile.parse(sample)
        #expect(parsed.controls.count == 2)
        #expect(parsed.controls[0].id == "61d35mW 45d55mN")
        #expect(parsed.controls[0].pixel.x == 1652)
        #expect(parsed.controls[0].pixel.y == 1326)
        #expect(abs(parsed.controls[0].map.lat - 45.916667) < 1e-9)
        #expect(abs(parsed.controls[0].map.lng - -61.583333) < 1e-9)
    }

    /// The whole reason for reading the role column. A check folded into the
    /// controls would be fitted to, and the error it then reported would be
    /// measured against a point that helped produce the fit.
    @Test("A check is kept, and kept out of the fit")
    func aCheckIsKeptAndKeptOutOfTheFit() throws {
        let parsed = try FletcherGcpFile.parse(sample)
        #expect(parsed.checks.count == 1)
        #expect(parsed.checks[0].pixel.y == 3950)
        #expect(!parsed.controls.contains { $0.pixel.y == 3950 })
    }

    @Test("Comments and blank lines are not rows")
    func commentsAndBlankLinesAreNotRows() throws {
        let parsed = try FletcherGcpFile.parse(sample)
        #expect(parsed.rows.count == 3)
        #expect(parsed.comments.count == 2)
        #expect(parsed.comments[0].hasPrefix("# sheet-19"))
    }

    @Test("A file with different columns is a different format")
    func aFileWithDifferentColumnsIsADifferentFormat() {
        let other = "x,y,lon,lat\n1,2,-61,45\n"
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(other)
        }
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse("1652.0,1326.0,-61.5,45.9,control,a\n")
        }
    }

    /// `Double("nope")` is nil rather than a NaN, but a row that reached the
    /// map as NaN would place a pin nowhere and warp the fit silently.
    @Test("A non-numeric coordinate is refused, not imported as nothing")
    func aNonNumericCoordinateIsRefused() {
        let text = [
            FletcherGcpFile.header,
            "1652.0,1326.0,nope,45.916667,control,a",
            "",
        ].joined(separator: "\n")
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(text)
        }
    }

    @Test("A coordinate off the earth is refused")
    func aCoordinateOffTheEarthIsRefused() {
        let text = [
            FletcherGcpFile.header,
            "1652.0,1326.0,-361.0,45.916667,control,a",
            "",
        ].joined(separator: "\n")
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(text)
        }
    }

    @Test("A role that is neither control nor check is refused")
    func anUnknownRoleIsRefused() {
        let text = [
            FletcherGcpFile.header,
            "1652.0,1326.0,-61.5,45.9,reference,a",
            "",
        ].joined(separator: "\n")
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(text)
        }
    }

    @Test("Checks alone place nothing")
    func checksAlonePlaceNothing() {
        let text = [
            FletcherGcpFile.header,
            "1652.0,1326.0,-61.5,45.9,check,a",
            "",
        ].joined(separator: "\n")
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(text)
        }
    }

    /// Points measured against a different scan of the same sheet parse
    /// cleanly and land every pin in the wrong place. Size is the only thing
    /// that catches it.
    @Test("Points measured against another scan are refused")
    func pointsMeasuredAgainstAnotherScanAreRefused() {
        let size = PixelSize(width: 2000, height: 2000)
        #expect(throws: FletcherGcpFile.ReadFailure.self) {
            try FletcherGcpFile.parse(sample, pixelSize: size)
        }
        let failure = failure(parsing: sample, pixelSize: size)
        #expect(failure?.message.contains("different scan") == true)
        #expect(failure?.message.contains("3950") == true)
    }

    @Test("A file that fits the image is accepted")
    func aFileThatFitsTheImageIsAccepted() throws {
        let parsed = try FletcherGcpFile.parse(
            sample, pixelSize: PixelSize(width: 4000, height: 4200)
        )
        #expect(parsed.controls.count == 2)
    }

    private func failure(
        parsing text: String, pixelSize: PixelSize?
    ) -> FletcherGcpFile.ReadFailure? {
        do {
            _ = try FletcherGcpFile.parse(text, pixelSize: pixelSize)
            return nil
        } catch {
            return error
        }
    }
}

@Suite("Writing a Fletcher points file")
struct FletcherGcpSerializeTests {
    @Test("A file read and written again is the same bytes")
    func aFileReadAndWrittenAgainIsTheSameBytes() throws {
        let parsed = try FletcherGcpFile.parse(sample)
        #expect(
            FletcherGcpFile.serialize(rows: parsed.rows, comments: parsed.comments) == sample
        )
    }

    @Test("Roles survive the trip")
    func rolesSurviveTheTrip() throws {
        let parsed = try FletcherGcpFile.parse(sample)
        let again = try FletcherGcpFile.parse(
            FletcherGcpFile.serialize(rows: parsed.rows, comments: parsed.comments)
        )
        #expect(again.controls.count == parsed.controls.count)
        #expect(again.checks.count == parsed.checks.count)
        #expect(again.rows.map(\.role) == parsed.rows.map(\.role))
    }

    /// A point placed in the app has no field text to echo, so it is formatted.
    @Test("A point that never came from a file is formatted")
    func aPointThatNeverCameFromAFileIsFormatted() {
        let row = FletcherGcpFile.Row(
            id: "placed",
            pixel: PixelPoint(x: 12.25, y: 40),
            map: GeoPoint(lat: 45.5, lng: -61.25),
            role: .control
        )
        let text = FletcherGcpFile.serialize(rows: [row])
        // 12.3, not 12.2: exactly on a boundary, and every emitter rounds away
        // from zero there.
        #expect(text.contains("12.3,40.0,-61.25000000,45.50000000,control,placed"))
        #expect(text.hasSuffix("\n"))
    }
}

/// The two Python emitters disagree on precision, and neither one is the
/// format. Reading what they actually wrote is the only test that catches
/// drift between them. Skipped rather than failed when the tools tree is
/// absent, so a package-only checkout still passes.
@Suite("Against the files the emitters wrote")
struct FletcherGcpEmittedFileTests {
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // GeoCoreTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // NSMarksCore
        .deletingLastPathComponent()  // repository root
        .appendingPathComponent("tools/fletcher/gcps")

    static let files: [String] = {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasSuffix(".csv") }.sorted()
    }()

    @Test("The emitted sheets are where they were")
    func theEmittedSheetsAreWhereTheyWere() throws {
        try #require(FileManager.default.fileExists(atPath: Self.directory.path))
        #expect(Self.files.count >= 24)
    }

    /// The whole point of the role column, end to end: an emitted sheet goes
    /// in, and an accuracy figure measured on points the fit never saw comes
    /// out. A parser that folded checks into controls would still pass every
    /// test above and produce nothing here.
    @Test("An emitted sheet scores itself against ground the fit never saw")
    func anEmittedSheetScoresItselfAgainstGroundTheFitNeverSaw() throws {
        let name = try #require(Self.files.first)
        let text = try String(
            contentsOf: Self.directory.appendingPathComponent(name), encoding: .utf8
        )
        let parsed = try FletcherGcpFile.parse(text)
        var session = GeoreferenceSession(pixelSize: PixelSize(width: 8000, height: 8000))
        session.replaceAll(with: parsed.controls, checks: parsed.checks)
        let heldOut = try #require(session.heldOut)
        #expect(heldOut.count == parsed.checks.count)
        #expect(heldOut.rmsMetres.isFinite)
        #expect(heldOut.maxMetres >= heldOut.rmsMetres)
    }

    @Test("Every emitted sheet survives a round trip", arguments: files)
    func everyEmittedSheetSurvivesARoundTrip(name: String) throws {
        let text = try String(
            contentsOf: Self.directory.appendingPathComponent(name), encoding: .utf8
        )
        let parsed = try FletcherGcpFile.parse(text)
        #expect(
            FletcherGcpFile.serialize(rows: parsed.rows, comments: parsed.comments) == text,
            "\(name) did not come back byte-identical"
        )
        #expect(!parsed.checks.isEmpty, "\(name) has no held-out points to score against")
    }
}

@Suite("Saying what the held-out points measured")
struct HeldOutMessageTests {
    @Test("Reads the way the browser panel reads")
    func readsTheWayTheBrowserPanelReads() {
        let report = GeoreferenceResiduals.HeldOutReport(
            count: 3, rmsMetres: 11.6, maxMetres: 40.2
        )
        #expect(report.message == "12 m at 3 held-out checks (worst 40 m)")
    }

    @Test("One check is not checks")
    func oneCheckIsNotChecks() {
        let report = GeoreferenceResiduals.HeldOutReport(
            count: 1, rmsMetres: 4, maxMetres: 4
        )
        #expect(report.message == "4 m at 1 held-out check (worst 4 m)")
    }
}
