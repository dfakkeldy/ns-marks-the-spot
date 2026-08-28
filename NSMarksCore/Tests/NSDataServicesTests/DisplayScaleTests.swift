import Foundation
import Testing

@testable import NSDataServices

@Suite("Screen scale readout")
struct DisplayScaleTests {
    @Test func aMetreToThePointIsAboutOneToSixThousand() throws {
        let denominator = try #require(DisplayScale.denominator(groundMetresPerPoint: 1))

        // 1 m of ground per point ÷ (0.0254 / 163) m of glass per point.
        #expect(abs(denominator - 6420) < 10)
    }

    @Test func theNumberIsRoundedToThreeFiguresLikeTheWeb() throws {
        let denominator = try #require(
            DisplayScale.denominator(groundMetresPerPoint: 3.4567)
        )

        #expect(denominator == 22200)
    }

    @Test(arguments: [0.0, -1.0, Double.infinity, Double.nan])
    func anUnmeasurableMapGetsNoReadoutRatherThanAWrongOne(metres: Double) {
        #expect(DisplayScale.denominator(groundMetresPerPoint: metres) == nil)
        #expect(DisplayScale.label(groundMetresPerPoint: metres) == nil)
    }

    @Test func theLabelGroupsItsDigits() throws {
        let label = try #require(DisplayScale.label(groundMetresPerPoint: 10))

        #expect(label == "Approx. screen scale 1:64,200")
    }
}
