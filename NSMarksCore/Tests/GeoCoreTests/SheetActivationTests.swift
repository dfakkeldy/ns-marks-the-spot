import Foundation
import ParityFixtures
import Testing
@testable import GeoCore

@Suite("Drive sheet activation")
struct SheetActivationTests {
    struct Fixture: Decodable {
        struct Config: Decodable { var enterFixes: Int; var exitMarginM: Double; var exitFixes: Int; var maxAccuracyM: Double; var maxShown: Int; var boundaryToleranceM: Double }
        struct Sheet: Decodable { var id: String; var ring: [[Double]] }
        struct Step: Decodable {
            var point: [Double]; var accuracyM: Double; var first: Bool
            var pinned: [String]; var dismissed: [String]
            var shown: [String]; var contained: [String]; var status: String
            var notDrawn: Int; var cleared: [String]; var reason: String
            var nearestId: String?; var nearestDistanceM: Double?; var nearestBearing: Double?
            var nearestAbsent: Bool?; var nearestBearingAbsent: Bool?
        }
        struct Case: Decodable { var name: String; var sheets: [Sheet]; var steps: [Step] }
        var config: Config; var cases: [Case]
    }

    @Test func sharedFixture() throws {
        let fixture = try JSONDecoder().decode(Fixture.self, from: SheetActivationFixture.data())
        #expect(fixture.config.enterFixes == SheetActivationConfig.enterFixes)
        #expect(fixture.config.exitMarginM == SheetActivationConfig.exitMarginM)
        #expect(fixture.config.exitFixes == SheetActivationConfig.exitFixes)
        #expect(fixture.config.maxAccuracyM == SheetActivationConfig.maxAccuracyM)
        #expect(fixture.config.maxShown == SheetActivationConfig.maxShown)
        #expect(fixture.config.boundaryToleranceM == SheetActivationConfig.boundaryToleranceM)
        for example in fixture.cases {
            let sheets = example.sheets.map { sheet in
                SheetActivationSheet(id: sheet.id, ring: sheet.ring.map { GeoPoint(lat: $0[0], lng: $0[1]) })
            }
            var state = SheetActivationState()
            for step in example.steps {
                let result = SheetActivation.step(
                    state: state, sheets: sheets,
                    fix: .init(point: .init(lat: step.point[0], lng: step.point[1]), accuracyM: step.accuracyM),
                    pinned: Set(step.pinned), dismissed: Set(step.dismissed), isFirstFix: step.first
                )
                #expect(result.output.shown == step.shown, "\(example.name)")
                #expect(result.output.contained == step.contained, "\(example.name)")
                #expect(result.output.status.rawValue == step.status, "\(example.name)")
                #expect(result.output.reason.rawValue == step.reason)
                #expect(result.output.notDrawn == step.notDrawn)
                #expect(result.output.clearedDismissals == step.cleared)
                if step.nearestAbsent == true { #expect(result.output.nearest == nil) }
                if step.nearestBearingAbsent == true { #expect(result.output.nearest?.bearingDegrees == nil) }
                if let nearest = step.nearestId { #expect(result.output.nearest?.id == nearest) }
                if let distance = step.nearestDistanceM {
                    #expect(abs((result.output.nearest?.distanceM ?? .infinity) - distance) < 1)
                }
                if let bearing = step.nearestBearing {
                    let difference = abs((result.output.nearest?.bearingDegrees ?? .infinity) - bearing)
                    #expect(min(difference, abs(360 - difference)) < 1)
                }
                state = result.state
            }
        }
    }

    @Test func meshEdgesAndRotatedFootprint() throws {
        let grid = (0..<9).map { y in (0..<9).map { x in GeoPoint(lat: Double(y), lng: Double(x)) } }
        #expect(SheetFootprint.ring(fromMesh: grid)?.count == 32)
        let diamond = [GeoPoint(lat: 1, lng: 0), GeoPoint(lat: 0, lng: 1), GeoPoint(lat: -1, lng: 0), GeoPoint(lat: 0, lng: -1)]
        let mesh = [[diamond[0], diamond[1]], [diamond[3], diamond[2]]]
        let rotatedRing = try #require(SheetFootprint.ring(fromMesh: mesh))
        #expect(rotatedRing == diamond)
        #expect(rotatedRing.contains { abs($0.lat) < 1 || abs($0.lng) < 1 })
        let outside = SheetFootprint.signedDistanceM(from: .init(lat: 0.9, lng: 0.9), toRing: diamond)
        #expect(outside > 0)
        let inside = SheetFootprint.signedDistanceM(from: .init(lat: 0, lng: 0), toRing: diamond)
        #expect(inside < 0)
        #expect(SheetFootprint.signedDistanceM(from: .init(lat: 1, lng: 0), toRing: diamond) == 0)
        #expect(SheetFootprint.ring(fromMesh: [[GeoPoint(lat: 0, lng: 0)]]) == nil)
    }

    @Test func unusableAccuracyKeepsThePreviousOutput() {
        let ring = [GeoPoint(lat: 0, lng: 0), .init(lat: 0, lng: 1), .init(lat: 1, lng: 1), .init(lat: 1, lng: 0)]
        let sheets = [SheetActivationSheet(id: "a", ring: ring)]
        let initial = SheetActivation.step(state: .init(), sheets: sheets, fix: .init(point: .init(lat: 0.5, lng: 0.5), accuracyM: 5), pinned: [], dismissed: [], isFirstFix: true)
        let second = SheetActivationSheet(id: "b", ring: ring)
        let pinned = SheetActivation.output(state: initial.state, sheets: [sheets[0], second], pinned: ["b"], dismissed: [])
        #expect(pinned.shown == ["a", "b"])
        for accuracy in [0.0, -1.0, Double.nan, Double.infinity, 150] {
            let held = SheetActivation.step(state: initial.state, sheets: sheets, fix: .init(point: .init(lat: 5, lng: 5), accuracyM: accuracy), pinned: [], dismissed: [], isFirstFix: false)
            #expect(held.output.shown == ["a"])
            #expect(held.output.contained == ["a"])
            #expect(held.output.reason == .heldPoorFix)
            let hidden = SheetActivation.step(state: initial.state, sheets: sheets, fix: .init(point: .init(lat: 5, lng: 5), accuracyM: accuracy), pinned: [], dismissed: ["a"], isFirstFix: false)
            #expect(hidden.output.shown.isEmpty)
            let removed = SheetActivation.output(state: initial.state, sheets: [], pinned: ["a"], dismissed: [])
            #expect(removed.shown.isEmpty)
            let restored = SheetActivation.output(state: initial.state, sheets: sheets, pinned: [], dismissed: [])
            #expect(restored.shown == ["a"])
        }
    }
}
