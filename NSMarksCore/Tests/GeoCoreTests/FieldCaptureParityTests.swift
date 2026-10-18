import Foundation
import ParityFixtures
import Testing

@testable import GeoCore

/// `CaptureSpec` against the shared fixture the web exports.
///
/// The fixture is the web's declaration of the field-capture contract
/// (`web/src/location/captureSpec.ts` writes it); these tests assert the
/// GeoCore constants against it, so a change on either surface fails the
/// other until it catches up. The fixture must never be regenerated from
/// Swift — that would make the port its own witness.
@Suite("Field-capture parity with the web")
struct FieldCaptureParityTests {
    private let fixture = FieldCaptureFixture.loaded

    @Test func theReservedNamespaceMatches() throws {
        #expect(fixture["reservedPrefix"]?.string == CaptureSpec.reservedPrefix)
        let keys = try #require(fixture["reservedPropertyKeys"]?.array)
        #expect(keys.compactMap(\.string) == CaptureSpec.reservedPropertyKeys)
        // Every reserved key lives under the prefix the editor refuses, so
        // refusing the prefix refuses them all.
        for key in CaptureSpec.reservedPropertyKeys {
            #expect(key.hasPrefix(CaptureSpec.reservedPrefix))
        }
    }

    @Test func theSharedStringsMatch() {
        #expect(fixture["fieldNotesLayerName"]?.string == CaptureSpec.fieldNotesLayerName)
        #expect(fixture["recordedProvenance"]?.string == CaptureSpec.recordedProvenance)
    }

    @Test func theMarkFreshnessRuleMatches() throws {
        let mark = try #require(fixture.object("mark"))
        #expect(mark["maxFixAgeMs"]?.double == CaptureSpec.Mark.maxFixAgeMs)
        #expect(mark["maxAccuracyM"]?.double == CaptureSpec.Mark.maxAccuracyM)
    }

    @Test func theTrackFilterConstantsMatch() throws {
        let filter = try #require(fixture.object("trackFilter"))
        #expect(filter["accuracyGateM"]?.double == CaptureSpec.TrackFilter.accuracyGateM)
        #expect(filter["maxSpeedMps"]?.double == CaptureSpec.TrackFilter.maxSpeedMps)
        #expect(filter["smoothingAlpha"]?.double == CaptureSpec.TrackFilter.smoothingAlpha)
        #expect(filter["minSpacingFloorM"]?.double == CaptureSpec.TrackFilter.minSpacingFloorM)
        #expect(
            filter["spacingAccuracyFactor"]?.double
                == CaptureSpec.TrackFilter.spacingAccuracyFactor
        )
    }

    @Test func theSimplifyConstantsMatch() throws {
        let simplify = try #require(fixture.object("simplify"))
        #expect(simplify["defaultToleranceM"]?.double == CaptureSpec.Simplify.defaultToleranceM)
        let presets = try #require(simplify["presetsM"]?.array)
        #expect(presets.compactMap(\.double) == CaptureSpec.Simplify.presetsM)
    }

    @Test func theSnapConstantsMatch() throws {
        let snap = try #require(fixture.object("snap"))
        #expect(snap["minZoom"]?.int == CaptureSpec.Snap.minZoom)
        #expect(snap["toleranceScreenUnits"]?.double == CaptureSpec.Snap.toleranceScreenUnits)
        #expect(snap["vertexPriority"]?.string == CaptureSpec.Snap.vertexPriority)
        #expect(snap["maxParcels"]?.int == CaptureSpec.Snap.maxParcels)
        #expect(snap["parcelCaveat"]?.string == CaptureSpec.Snap.parcelCaveat)
        #expect(snap["tracedValue"]?.string == CaptureSpec.tracedParcelValue)
    }

    /// The photo caps and the re-encode sizes.
    ///
    /// Both surfaces declared these independently and neither fixture nor
    /// test knew about them, so the numbers agreeing was luck rather than a
    /// guard. The re-encode sizes are part of the contract because the
    /// re-encode is what leaves the EXIF — GPS included — behind.
    @Test func thePhotoContractMatches() throws {
        let photos = try #require(fixture.object("photos"))
        #expect(photos["maxPerFeature"]?.int == PhotoDescriptor.maxPerFeature)
        #expect(photos["maxPerLayer"]?.int == PhotoDescriptor.maxPerLayer)
        #expect(photos["maxFileBytes"]?.int == PhotoDescriptor.maxFileBytes)
        #expect(photos["fullLongEdgePx"]?.int == PhotoPipeline.fullLongEdgePx)
        #expect(photos["fullJpegQuality"]?.double == PhotoPipeline.fullJpegQuality)
        #expect(photos["thumbLongEdgePx"]?.int == PhotoPipeline.thumbLongEdgePx)
        #expect(photos["thumbJpegQuality"]?.double == PhotoPipeline.thumbJpegQuality)
    }

    @Test func theKmzProfileMatches() throws {
        let kmz = try #require(fixture.object("kmz"))
        #expect(kmz["docEntry"]?.string == CaptureSpec.Kmz.docEntry)
        #expect(kmz["photoDir"]?.string == CaptureSpec.Kmz.photoDir)
        #expect(kmz["descriptionImgWidth"]?.int == CaptureSpec.Kmz.descriptionImgWidth)
    }
}
