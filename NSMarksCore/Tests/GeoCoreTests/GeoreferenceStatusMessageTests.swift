import Testing

@testable import GeoCore

@Suite("What the georeferencer says about a fit")
struct GeoreferenceStatusMessageTests {
    /// The same number means two things, and the sentence has to say which. A
    /// spline's figure is leave-one-out, which overstates true warp error and
    /// never understates it; printing it as an RMS reads as a georeference to
    /// throw away when the sheet is in fact fine.
    @Test func theSplineFigureIsAnUpperBoundAndTheAffineFigureIsAResidual() {
        #expect(
            GeoreferenceStatus.solved(metres: 240.4, count: 4, method: .spline).message
                == "No worse than 240 m across 4 points"
        )
        #expect(
            GeoreferenceStatus.solved(metres: 12.6, count: 7, method: .affine).message
                == "RMS 13 m across 7 points"
        )
    }

    /// Three states that all mean "no accuracy figure" and are three states
    /// because their remedies differ: add a point, take one away from a
    /// straight line, or do nothing at all. A message that blurred them would
    /// send a user with fifty-one points off to add a fourth.
    @Test func theThreeNoFigureStatesSayDifferentThings() {
        let exact = GeoreferenceStatus.exactFit.message
        let tooMany = GeoreferenceStatus.tooManyPoints.message
        let refused = GeoreferenceStatus.refitRefused.message
        #expect(exact.contains("4th point"))
        #expect(!tooMany.contains("4th point"))
        #expect(Set([exact, tooMany, refused]).count == 3)
        // Neither of the two that still draw may read as a failure, so both
        // say so in as many words.
        #expect(tooMany.contains("still draws"))
        #expect(refused.contains("still draws"))
        #expect(!exact.contains("still draws"))
    }

    /// A coincident pair has a concrete fix and gets it. The generic refusal
    /// deliberately names both sides, because most of what reaches it is not a
    /// straight line on the scan.
    @Test func theActionableRefusalIsNotFoldedIntoTheGenericOne() {
        #expect(
            GeoreferenceStatus.coincidentPoints.message
                == "Two points are on the same spot — move or delete one."
        )
        let degenerate = GeoreferenceStatus.degenerate.message
        #expect(degenerate.contains("scan points"))
        #expect(degenerate.contains("map points"))
    }

    @Test(arguments: [(3, "Place 3 points"), (2, "2 more points"), (1, "1 more point")])
    func theCountdownIsPluralisedAndTheFirstMessageIsNotACountdown(
        remaining: Int, expected: String
    ) {
        #expect(GeoreferenceStatus.needMore(remaining: remaining).message.contains(expected))
    }

    /// No escape key on a phone.
    @Test func theHalfPlacedMessagesAskForATap() {
        #expect(GeoreferenceStatus.awaitingMap.message == "Now tap the same spot on the map.")
        #expect(GeoreferenceStatus.awaitingScan.message == "Now tap the same spot on the scan.")
    }
}
