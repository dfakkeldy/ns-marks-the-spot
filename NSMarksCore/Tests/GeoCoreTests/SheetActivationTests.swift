import Foundation
import ParityFixtures
import Testing
@testable import GeoCore

@Suite("Drive sheet activation")
struct SheetActivationTests {
    struct Fixture: Decodable {
        struct Config: Decodable { var enterFixes: Int; var exitMarginM: Double; var exitFixes: Int; var maxAccuracyM: Double; var maxShown: Int }
        struct Sheet: Decodable { var id: String; var ring: [[Double]] }
        struct Step: Decodable {
            var point: [Double]; var accuracyM: Double; var first: Bool
            var pinned: [String]; var dismissed: [String]
            var shown: [String]; var contained: [String]; var status: String
            var notDrawn: Int?; var cleared: [String]?
            var nearestId: String?; var nearestDistanceM: Double?; var nearestBearing: Double?
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
                if step.accuracyM > SheetActivationConfig.maxAccuracyM {
                    #expect(result.output.reason == .heldPoorFix)
                }
                if let count = step.notDrawn { #expect(result.output.notDrawn == count) }
                if let cleared = step.cleared { #expect(result.output.clearedDismissals == cleared) }
                if let nearest = step.nearestId { #expect(result.output.nearest?.id == nearest) }
                if let distance = step.nearestDistanceM {
                    #expect(abs((result.output.nearest?.distanceM ?? .infinity) - distance) < 1)
                }
                if let bearing = step.nearestBearing {
                    #expect(abs((result.output.nearest?.bearingDegrees ?? .infinity) - bearing) < 1)
                }
                state = result.state
            }
        }
    }

    @Test func meshEdgesAndRotatedFootprint() throws {
        let grid = (0..<9).map { y in (0..<9).map { x in GeoPoint(lat: Double(y), lng: Double(x)) } }
        #expect(SheetFootprint.ring(fromMesh: grid)?.count == 32)
        let diamond = [GeoPoint(lat: 1, lng: 0), GeoPoint(lat: 0, lng: 1), GeoPoint(lat: -1, lng: 0), GeoPoint(lat: 0, lng: -1)]
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
        for accuracy in [0.0, -1.0, Double.nan, Double.infinity, 150] {
            let held = SheetActivation.step(state: initial.state, sheets: sheets, fix: .init(point: .init(lat: 5, lng: 5), accuracyM: accuracy), pinned: [], dismissed: [], isFirstFix: false)
            #expect(held.output.shown == ["a"])
            #expect(held.output.contained == ["a"])
            #expect(held.output.reason == .heldPoorFix)
        }
    }
}
