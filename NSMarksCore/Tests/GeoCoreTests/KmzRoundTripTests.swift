import Foundation
import Testing

@testable import GeoCore

@Suite("KMZ export, import, and photo re-link")
struct KmzRoundTripTests {
    private func layer(descriptors: [PhotoDescriptor], description: String? = nil)
        -> ParsedVector
    {
        var properties: [String: JSONValue] = [
            "name": .string("Culvert"),
            CaptureSpec.photosKey: PhotoDescriptor.propertyValue(internalForm: descriptors),
        ]
        if let description {
            properties["description"] = .string(description)
        }
        return VectorEdit.recomputed([
            GeoJsonFeature(
                id: "f1",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
                properties: properties
            )
        ])
    }

    private let jpegBytes = Data([0xff, 0xd8, 0xff, 0xe0] + Array(repeating: 0x11, count: 64))

    private func fakeProcess(_ data: Data) throws -> KmzRelink.ProcessedPhoto {
        guard data.first == 0xff else {
            struct NotAnImage: Error {}
            throw NotAnImage()
        }
        return KmzRelink.ProcessedPhoto(fullJpeg: data, thumbJpeg: data, width: 10, height: 5)
    }

    @Test func theArchiveHoldsDocKmlPlusOneStoredJpegPerPhoto() throws {
        let descriptor = PhotoDescriptor(
            id: "p1", capturedAt: "2026-08-29T14:00:00.000Z", sourceName: "IMG_1.jpg",
            width: 10, height: 5
        )
        let export = try #require(
            VectorExport.kmz(
                layerName: "Field visit",
                parsed: layer(descriptors: [descriptor], description: "washed out"),
                photos: ["p1": jpegBytes]
            )
        )
        #expect(export.photosEmbedded == 1)
        #expect(export.photosMissing == 0)

        let entries = try ZipArchive.entries(in: export.data)
        #expect(entries.map(\.name) == ["doc.kml", "files/p1.jpg"])
        let doc = try #require(entries.first)
        #expect(doc.method == 8)
        let photo = try #require(entries.last)
        #expect(photo.method == 0)

        let kml = String(
            data: try ZipArchive.contents(of: doc, in: export.data), encoding: .utf8
        ) ?? ""
        // The CDATA description: the user's text, a blank line, one img per
        // photo at the pinned width.
        #expect(kml.contains("<![CDATA[washed out\n\n<img src=\"files/p1.jpg\" width=\"400\"/>]]>"))
        // The descriptor in KMZ form (href present), JSON inside ExtendedData.
        #expect(kml.contains("nsmts:photos"))
        #expect(kml.contains("files/p1.jpg"))
    }

    /// A descriptor whose bytes cannot be read is dropped from the document
    /// entirely — no Data entry, no img tag, counted for the caller.
    @Test func missingPhotoBytesDropTheReferenceAndAreCounted() throws {
        let export = try #require(
            VectorExport.kmz(
                layerName: "Layer",
                parsed: layer(descriptors: [
                    PhotoDescriptor(id: "here"), PhotoDescriptor(id: "gone"),
                ]),
                photos: ["here": jpegBytes]
            )
        )
        #expect(export.photosEmbedded == 1)
        #expect(export.photosMissing == 1)
        let entries = try ZipArchive.entries(in: export.data)
        #expect(entries.map(\.name) == ["doc.kml", "files/here.jpg"])
        let kml = String(
            data: try ZipArchive.contents(of: entries[0], in: export.data), encoding: .utf8
        ) ?? ""
        #expect(!kml.contains("gone"))
    }

    @Test func aKmzRoundTripRelinksPhotosUnderFreshIds() throws {
        let descriptor = PhotoDescriptor(
            id: "original-id", capturedAt: "2026-08-29T14:00:00.000Z",
            sourceName: "IMG_1.jpg", width: 10, height: 5
        )
        let export = try #require(
            VectorExport.kmz(
                layerName: "Field visit",
                parsed: layer(descriptors: [descriptor], description: "washed out"),
                photos: ["original-id": jpegBytes]
            )
        )

        let opened = try KmzParse.parseWithAssets(export.data)
        #expect(opened.assets.keys.contains("files/original-id.jpg"))

        var minted = 0
        let result = KmzRelink.relink(
            parsed: opened.parsed,
            assets: opened.assets,
            mintID: {
                minted += 1
                return "fresh-\(minted)"
            },
            process: fakeProcess
        )
        #expect(result.linked == 1)
        #expect(result.missingFromArchive == 0)
        #expect(result.undecodable == 0)
        #expect(result.capped == 0)
        #expect(result.photos.map(\.id) == ["fresh-1"])

        let feature = try #require(result.parsed.features.first)
        let relinked = PhotoDescriptor.read(from: feature.properties)
        #expect(relinked.count == 1)
        // Re-minted id, capturedAt carried, never re-invented.
        #expect(relinked[0].id == "fresh-1")
        #expect(relinked[0].capturedAt == "2026-08-29T14:00:00.000Z")
        #expect(relinked[0].href == nil)
        // The viewer img appendix is stripped back off the description.
        #expect(feature.properties["description"] == .string("washed out"))
    }

    @Test func missingUndecodableAndCappedStayDistinct() throws {
        // 22 descriptors: one missing from the archive, one undecodable,
        // and enough valid ones to push past the 20-per-feature cap.
        var descriptors: [PhotoDescriptor] = []
        var assets: [String: Data] = [:]
        for index in 0..<22 {
            let id = "photo-\(index)"
            descriptors.append(PhotoDescriptor(id: id))
            if index == 0 {
                continue  // missing from the archive
            }
            if index == 1 {
                assets["files/\(id).jpg"] = Data([0x00])  // undecodable
                continue
            }
            assets["files/\(id).jpg"] = jpegBytes
        }
        let parsed = layer(descriptors: descriptors)
        let kmlForm = ParsedVector(
            features: parsed.features.map { feature in
                var copy = feature
                // As it would arrive from KML: the descriptor array as a
                // JSON string.
                if case .array(let values)? = copy.properties[CaptureSpec.photosKey] {
                    let objects = values.map(\.jsonObject)
                    let data = try? JSONSerialization.data(withJSONObject: objects)
                    copy.properties[CaptureSpec.photosKey] =
                        .string(String(data: data ?? Data(), encoding: .utf8) ?? "")
                }
                return copy
            },
            bbox: parsed.bbox
        )

        let result = KmzRelink.relink(
            parsed: kmlForm, assets: assets, process: fakeProcess
        )
        #expect(result.missingFromArchive == 1)
        #expect(result.undecodable == 1)
        // 22 total − 1 missing − 1 undecodable = 20 valid, but the two
        // failures were tried inside the cap window: descriptors past the
        // 20th slot count as capped once 20 are attached... the arithmetic
        // is pinned by the counts summing to the descriptor total.
        #expect(result.linked <= 20)
        #expect(
            result.linked + result.missingFromArchive + result.undecodable + result.capped
                == 22
        )
        #expect(result.capped > 0)
        let note = try #require(result.noteText)
        #expect(note.contains("missing from the archive"))
        #expect(note.contains("couldn't be decoded"))
        #expect(note.contains("photo cap"))
    }

    /// KMZs edited by other tools do not preserve entry-name case; href
    /// resolution is case-insensitive by lowercasing both sides.
    @Test func hrefResolutionIsCaseInsensitive() {
        let parsed = layer(descriptors: [
            PhotoDescriptor(id: "p1", href: "FILES/P1.JPG")
        ])
        let result = KmzRelink.relink(
            parsed: parsed,
            assets: ["files/p1.jpg": jpegBytes],
            process: fakeProcess
        )
        #expect(result.linked == 1)
    }

    @Test func theImgStripToleratesHistoricalVariants() {
        #expect(
            KmzRelink.strippedImgAppendix(
                "note\n\n<img src=\"files/a.jpg\" width=\"400\"/>"
            ) == "note"
        )
        #expect(
            KmzRelink.strippedImgAppendix(
                "note\n\n<IMG SRC=\"files/a.jpg\" width=\"400\"></img>"
            ) == "note"
        )
        // An img pointing elsewhere is the user's own content and stays.
        #expect(
            KmzRelink.strippedImgAppendix("see <img src=\"http://example.com/x.jpg\"/>")
                == "see <img src=\"http://example.com/x.jpg\"/>"
        )
    }
}
