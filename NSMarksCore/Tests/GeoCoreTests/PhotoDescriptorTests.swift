import Foundation
import Testing

@testable import GeoCore

@Suite("Photo descriptors")
struct PhotoDescriptorTests {
    @Test func descriptorsReadFromTheInternalForm() {
        let properties: [String: JSONValue] = [
            "nsmts:photos": .array([
                .object([
                    "id": .string("photo-1"),
                    "capturedAt": .string("2026-08-29T14:00:00.000Z"),
                    "sourceName": .string("IMG_0001.jpg"),
                    "width": .number(2048),
                    "height": .number(1536),
                ]),
                .object(["id": .string("photo-2")]),
            ])
        ]
        let descriptors = PhotoDescriptor.read(from: properties)
        #expect(descriptors.count == 2)
        #expect(descriptors[0].id == "photo-1")
        #expect(descriptors[0].capturedAt == "2026-08-29T14:00:00.000Z")
        #expect(descriptors[0].width == 2048)
        #expect(descriptors[1].capturedAt == nil)
    }

    /// All-or-nothing: a half-valid array would attribute the wrong photos
    /// to a feature, which is worse than attributing none.
    @Test func aMalformedEntryDropsTheWholeArray() {
        let properties: [String: JSONValue] = [
            "nsmts:photos": .array([
                .object(["id": .string("photo-1")]),
                .object(["capturedAt": .string("no id here")]),
            ])
        ]
        #expect(PhotoDescriptor.read(from: properties).isEmpty)
        // Absent and non-array values also read as no photos.
        #expect(PhotoDescriptor.read(from: [:]).isEmpty)
        #expect(PhotoDescriptor.read(from: ["nsmts:photos": .string("[]")]).isEmpty)
    }

    /// Unknown fields are ignored per the contract, so a future surface can
    /// add fields without breaking this parser.
    @Test func unknownFieldsAreIgnored() {
        let properties: [String: JSONValue] = [
            "nsmts:photos": .array([
                .object(["id": .string("photo-1"), "someFutureField": .number(7)])
            ])
        ]
        #expect(PhotoDescriptor.read(from: properties).count == 1)
    }

    /// ExtendedData values come back from the KML parser as strings, so the
    /// KMZ-side reader accepts the JSON-string form too.
    @Test func theKmzReaderAcceptsAJsonString() {
        let json = """
            [{"id":"photo-1","href":"files/photo-1.jpg","width":2048,"height":1536}]
            """
        let descriptors = PhotoDescriptor.readKmz(from: ["nsmts:photos": .string(json)])
        #expect(descriptors.count == 1)
        #expect(descriptors[0].href == "files/photo-1.jpg")
        // Malformed JSON stays an opaque attribute: no photos.
        #expect(
            PhotoDescriptor.readKmz(from: ["nsmts:photos": .string("not json")]).isEmpty
        )
    }

    @Test func theKmzFormAddsTheRequiredHref() throws {
        let descriptor = PhotoDescriptor(
            id: "abc", capturedAt: "2026-08-29T14:00:00.000Z", width: 100, height: 50
        )
        guard case .object(let kmz) = descriptor.kmzValue else {
            Issue.record("Expected an object.")
            return
        }
        #expect(kmz["href"] == .string("files/abc.jpg"))
        guard case .object(let internalForm) = descriptor.internalValue else {
            Issue.record("Expected an object.")
            return
        }
        #expect(internalForm["href"] == nil)
        #expect(internalForm["width"] == .number(100))
    }

    @Test func theContractCapsAreThePinnedValues() {
        #expect(PhotoDescriptor.maxPerFeature == 20)
        #expect(PhotoDescriptor.maxPerLayer == 500)
        #expect(PhotoDescriptor.maxFileBytes == 50 * 1024 * 1024)
    }
}
