import Foundation
import GeoCore
import Photos
import Testing

@testable import ns_marks_the_spot

/// The photo map's switch and index, driven without a photo library.
@Suite("Photo map state")
@MainActor
struct PhotoMapViewModelTests {
    /// Holds the fake library's read until the test lets it finish, and
    /// counts how many reads were started.
    nonisolated final class FakeLibrary: @unchecked Sendable {
        private let lock = NSLock()
        private var waiters: [CheckedContinuation<Void, Never>] = []
        private(set) var reads = 0
        var snapshot = PhotoMapIndex.Snapshot(entries: [
            PhotoMapIndex.Entry(id: "one", latitude: 45.8, longitude: -61.47, capturedAt: "2026-09-02T10:00:00.000Z"),
        ])

        func wait() async {
            await withCheckedContinuation { continuation in
                lock.lock()
                reads += 1
                waiters.append(continuation)
                lock.unlock()
            }
        }

        func release() {
            lock.lock()
            let pending = waiters
            waiters = []
            lock.unlock()
            for waiter in pending { waiter.resume() }
        }

        var readCount: Int {
            lock.lock()
            defer { lock.unlock() }
            return reads
        }
    }

    private func make(
        access: PhotoMapViewModel.Access = .granted,
        grants: PhotoMapViewModel.Access = .granted
    ) -> (PhotoMapViewModel, FakeLibrary) {
        let fake = FakeLibrary()
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { access },
            requestAccess: { grants },
            enumerate: { await fake.wait(); return fake.snapshot },
            applyChanges: { _ in nil }
        )
        return (PhotoMapViewModel(directory: directory, library: library), fake)
    }

    /// The reported symptom: the switch read "off" through the whole first
    /// index. It flips at once, and says that it is indexing.
    @Test func theSwitchFlipsOnAtOnceAndSaysItIsIndexing() async {
        let (model, fake) = make()
        let toggle = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }

        #expect(model.isOn)
        #expect(model.state == .indexing)
        #expect(model.indexLine == "Indexing your photos…")
        #expect(model.snapshotGeneration == 0)

        fake.release()
        await toggle.value

        #expect(model.state == .on)
        #expect(model.snapshotGeneration == 1)
        #expect(model.snapshot.entries.count == 1)
    }

    /// A second tap during the first read waits for it; it does not start a
    /// second enumeration of the whole library.
    @Test func aSecondTapDoesNotStartASecondRead() async {
        let (model, fake) = make()
        let first = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        let second = Task { await model.setVisible(true) }
        await Task.yield()
        await Task.yield()

        fake.release()
        await first.value
        await second.value

        #expect(fake.readCount == 1)
        #expect(model.state == .on)
        #expect(model.snapshotGeneration == 1)
    }

    /// Switched off while the library was being read: the switch stays off
    /// when the read lands, and the snapshot is kept for the next time.
    @Test func switchingOffDuringTheReadWins() async {
        let (model, fake) = make()
        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        await model.setVisible(false)
        #expect(model.state == .off)

        fake.release()
        await on.value

        #expect(model.state == .off)
        #expect(model.isVisible == false)
        #expect(model.drawing() == nil)
        #expect(model.snapshot.entries.count == 1)
    }

    /// Denied is a state of its own, not a switch that will not stay on.
    @Test func aRefusalLeavesTheSwitchOffAndSaysWhy() async {
        let (model, fake) = make(access: .unknown, grants: .denied)

        await model.setVisible(true)

        #expect(model.state == .off)
        #expect(model.access == .denied)
        #expect(fake.readCount == 0)
        #expect(model.statusLine?.contains("Photo access is off") == true)
    }

    /// Limited access is enough to index what was selected.
    @Test func limitedAccessIndexesTheSelection() async {
        let (model, fake) = make(access: .unknown, grants: .limited)
        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        fake.release()
        await on.value

        #expect(model.state == .on)
        #expect(model.access == .limited)
        #expect(model.statusLine == "Showing only the photos you selected.")
    }

    /// Every outcome after indexing has a line: nothing geotagged, nothing in
    /// this view, or a count.
    @Test func theRowSaysWhatTheIndexHoldsAndWhatIsInView() async {
        let (model, fake) = make()
        fake.snapshot = PhotoMapIndex.Snapshot(entries: [])
        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        fake.release()
        await on.value
        #expect(model.indexLine == "No photos with a location were found in your library.")

        let (populated, library) = make()
        let second = Task { await populated.setVisible(true) }
        await settles("the read to start") { library.readCount == 1 }
        library.release()
        await second.value
        populated.refreshViewport(bounds: GeoBoundingBox(south: 44, west: -64, north: 44.5, east: -63))
        #expect(populated.indexLine == "1 geotagged photo indexed · none in this view")
        populated.refreshViewport(bounds: GeoBoundingBox(south: 45, west: -62, north: 46, east: -61))
        #expect(populated.indexLine == "1 of 1 geotagged photo in this view")

        // Under limited access the empty line names the selection, not the
        // library that was not searched.
        let (limited, fakeLimited) = make(access: .limited)
        fakeLimited.snapshot = PhotoMapIndex.Snapshot(entries: [])
        let third = Task { await limited.setVisible(true) }
        await settles("the read to start") { fakeLimited.readCount == 1 }
        fakeLimited.release()
        await third.value
        #expect(limited.indexLine == "No selected photos with a location were found.")
        #expect(populated.drawing()?.parsed.features.count == 1)
    }

    /// A real PhotoKit identifier carries slashes, which the stored-photo
    /// descriptor parser refuses as a path. The photo map folds them on the
    /// way in and unfolds them on the way out, so the card has its photo and
    /// PhotoKit gets its identifier back.
    @Test func aPhotoKitIdentifierSurvivesTheDescriptor() async {
        let localIdentifier = "ED7AC36B-A150-4C38-BB8C-B6D696F4F2ED/L0/001"
        let entry = PhotoMapIndex.Entry(
            id: localIdentifier, latitude: 45.8, longitude: -61.47,
            capturedAt: "2026-09-02T13:14:00.000Z", width: 4032, height: 3024
        )
        let feature = PhotoMapViewModel.feature(for: entry)
        let photos = PhotoDescriptor.read(from: feature.properties)
        #expect(photos.count == 1)
        #expect(photos.first.map { PhotoMapViewModel.assetID(forDescriptorID: $0.id) } == localIdentifier)
        // Opaque means opaque: bars, dots and backslashes come back exactly,
        // and the descriptor parser accepts every encoded form.
        for odd in ["A|B/L0/001", "a..b\\c/L0/001", "plain", "", "ünïcödé/L0/001"] {
            let encoded = PhotoMapViewModel.descriptorID(forAssetID: odd)
            #expect(PhotoMapViewModel.assetID(forDescriptorID: encoded) == odd)
            #expect(!encoded.contains("/") && !encoded.contains("\\") && !encoded.contains(".."))
        }

        let (model, fake) = make()
        fake.snapshot = PhotoMapIndex.Snapshot(entries: [entry])
        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        fake.release()
        await on.value
        model.refreshViewport(bounds: GeoBoundingBox(south: 45, west: -62, north: 46, east: -61))
        let drawing = model.drawing()
        #expect(drawing?.annotations().first?.hasPhotos == true)
        let annotationID = drawing?.annotations().first?.mapAnnotationID ?? ""
        #expect(model.callout(annotationID: annotationID)?.photos.count == 1)
        #expect(model.callout(clusterMemberIDs: [annotationID])?.photos.count == 1)
    }

    /// Holds an access value the test can change between reads.
    nonisolated final class AccessBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: PhotoMapViewModel.Access
        init(_ value: PhotoMapViewModel.Access) { self.value = value }
        var current: PhotoMapViewModel.Access {
            get { lock.lock(); defer { lock.unlock() }; return value }
            set { lock.lock(); value = newValue; lock.unlock() }
        }
    }

    /// Change history under limited access covers only the selected photos,
    /// so the selection is read whole; and access narrowed in Settings takes
    /// the full library's pins down at once rather than after the read.
    @Test func aChangeOfScopeReadsTheLibraryWholeAndADowngradeClearsThePins() async {
        let box = AccessBox(.granted)
        let a = PhotoMapIndex.Entry(id: "a", latitude: 45.8, longitude: -61.47, capturedAt: nil)
        let b = PhotoMapIndex.Entry(id: "b", latitude: 45.9, longitude: -61.40, capturedAt: nil)
        let whole = PhotoMapIndex.Snapshot(entries: [a], changeToken: Data([1]))
        let applied = PhotoMapIndex.Snapshot(entries: [a, b], changeToken: Data([2]))
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { box.current },
            requestAccess: { box.current },
            enumerate: { whole },
            applyChanges: { _ in applied }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        await model.setVisible(true)
        #expect(model.snapshot.entries.map(\.id) == ["a"])
        #expect(model.indexedAccess == .granted)
        // Under the same full scope, the next refresh is incremental.
        await model.refreshIndex()
        #expect(model.snapshot.entries.map(\.id) == ["a", "b"])

        // Narrowed in Settings: the pins come down before the read.
        box.current = .limited
        model.refreshAccess()
        #expect(model.access == .limited)
        #expect(model.snapshot.entries.isEmpty)
        // And the selection is read whole, never from the history.
        await model.refreshIndex()
        #expect(model.snapshot.entries.map(\.id) == ["a"])
        #expect(model.indexedAccess == .limited)
        await model.refreshIndex()
        #expect(model.snapshot.entries.map(\.id) == ["a"])

        // The same file, opened again under full access, remembers the scope
        // it was read in, so the first read is whole rather than incremental.
        // (Opened under limited access it would forget on purpose: every
        // return under limited is a possibly changed selection.)
        box.current = .granted
        let reopened = PhotoMapViewModel(directory: directory, library: library)
        #expect(reopened.indexedAccess == .limited)
    }

    /// A full-library read still out when access narrows is history: its
    /// result is discarded, and the selection is read whole afterwards.
    @Test func aReadOvertakenByADowngradeIsDiscarded() async {
        let box = AccessBox(.granted)
        let fake = FakeLibrary()
        let a = PhotoMapIndex.Entry(id: "a", latitude: 45.8, longitude: -61.47, capturedAt: nil)
        let b = PhotoMapIndex.Entry(id: "b", latitude: 45.9, longitude: -61.40, capturedAt: nil)
        fake.snapshot = PhotoMapIndex.Snapshot(entries: [a, b], changeToken: Data([1]))
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { box.current },
            requestAccess: { box.current },
            enumerate: { await fake.wait(); return fake.snapshot },
            applyChanges: { _ in nil }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        let on = Task { await model.setVisible(true) }
        await settles("the full read to start") { fake.readCount == 1 }
        box.current = .limited
        model.refreshAccess()
        fake.release()
        await on.value
        #expect(model.snapshot.entries.isEmpty)
        #expect(model.indexedAccess == nil)

        fake.snapshot = PhotoMapIndex.Snapshot(entries: [a])
        let again = Task { await model.refreshIndex() }
        await settles("the limited read to start") { fake.readCount == 2 }
        fake.release()
        await again.value
        #expect(model.snapshot.entries.map(\.id) == ["a"])
        #expect(model.indexedAccess == .limited)
        #expect(model.state == .on)
    }

    /// Under limited access the selection can change in Settings without a
    /// trace this app can read: every return is a possibly changed
    /// selection, so the pins come down and the selection is read again.
    @Test func aLimitedSelectionIsReadAgainOnEveryReturn() async {
        let (model, fake) = make(access: .limited)
        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        fake.release()
        await on.value
        #expect(model.snapshot.entries.map(\.id) == ["one"])

        model.refreshAccess()
        #expect(model.snapshot.entries.isEmpty)
        let again = Task { await model.refreshIndex() }
        await settles("the second read to start") { fake.readCount == 2 }
        fake.release()
        await again.value
        #expect(model.snapshot.entries.map(\.id) == ["one"])
    }

    /// A cluster's date range is only stated when every member has a date;
    /// otherwise the card says how many do, so one dated photo's day does not
    /// read as the day of them all.
    @Test func aClusterDateIsNotBorrowedByUndatedMembers() {
        let dated = GeoJsonFeature(
            id: "a", geometry: .point(GeoJsonPosition(lng: -61.47, lat: 45.8)),
            properties: [CaptureSpec.capturedAtKey: .string("2026-09-02T13:14:00.000Z")]
        )
        let undated = GeoJsonFeature(
            id: "b", geometry: .point(GeoJsonPosition(lng: -61.47, lat: 45.8)), properties: [:]
        )
        #expect(PhotoMapViewModel.clusterDateDetail([dated, undated]) == "1 of 2 photos dated")
        #expect(PhotoMapViewModel.clusterDateDetail([undated]) == nil)
        #expect(PhotoMapViewModel.clusterDateDetail([dated, dated])?.isEmpty == false)
    }

    /// A read that comes back empty-handed after the switch went off leaves
    /// the switch off: "couldn't be read" belongs under a switch that is on.
    @Test func aFailureAfterSwitchingOffIsNotShown() async {
        let fake = FakeLibrary()
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { .granted },
            requestAccess: { .granted },
            enumerate: { await fake.wait(); return nil },
            applyChanges: { _ in nil }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        // A return to the foreground joins the read with no intent of its own.
        let returning = Task { await model.refreshIndex() }
        await model.setVisible(false)
        fake.release()
        await on.value
        await returning.value

        #expect(model.state == .off)
        #expect(model.indexLine == nil)
    }

    /// A stale read — one a downgrade made history — is waited out before
    /// the next begins: never two whole libraries in memory at once.
    @Test func aStaleReadIsWaitedOutNotRaced() async {
        let box = AccessBox(.granted)
        let fake = FakeLibrary()
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { box.current },
            requestAccess: { box.current },
            enumerate: { await fake.wait(); return fake.snapshot },
            applyChanges: { _ in nil }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        let on = Task { await model.setVisible(true) }
        await settles("the first read to start") { fake.readCount == 1 }
        box.current = .limited
        model.refreshAccess()
        let again = Task { await model.refreshIndex() }
        // The second read has not started while the first is still out.
        try? await Task.sleep(for: .milliseconds(50))
        #expect(fake.readCount == 1)

        fake.release()
        await settles("the second read to start") { fake.readCount == 2 }
        fake.release()
        await on.value
        await again.value
        #expect(model.snapshot.entries.map(\.id) == ["one"])
    }

    /// A grant withdrawn while the library was being read is not an empty
    /// library: nothing is kept, nothing is written, and the switch goes off.
    @Test func aGrantWithdrawnDuringTheReadIsNotAnEmptyLibrary() async {
        let box = AccessBox(.granted)
        let fake = FakeLibrary()
        fake.snapshot = PhotoMapIndex.Snapshot(entries: [])
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { box.current },
            requestAccess: { box.current },
            enumerate: { await fake.wait(); return fake.snapshot },
            applyChanges: { _ in nil }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        let on = Task { await model.setVisible(true) }
        await settles("the read to start") { fake.readCount == 1 }
        // Revoked in Settings, and read again on the way back into the app,
        // while the library read is still out.
        box.current = .denied
        model.refreshAccess()
        fake.release()
        await on.value

        // Nothing of that read is kept: not the snapshot, not the scope, and
        // nothing on disk to resume from.
        #expect(model.indexedAccess == nil)
        #expect(model.snapshot.entries.isEmpty)
        #expect(!model.isVisible)
        #expect(model.state == .off)
    }

    /// A stored layer's cluster is dated by its photos, counted as photos.
    @Test func aStoredClusterIsDatedByItsPhotos() {
        #expect(
            PhotoMapViewModel.clusterDateDetail(
                dates: ["2026-09-02T13:14:00.000Z"], of: 3
            ) == "1 of 3 photos dated"
        )
        #expect(PhotoMapViewModel.clusterDateDetail(dates: [], of: 2) == nil)
    }

    /// Why nothing was placed is said in terms of what was found out.
    @Test func theNothingPlacedMessageDoesNotCallUnreadPhotosUntagged() {
        #expect(
            MapContainerView.nothingPlacedMessage(untagged: 3, notInspected: 0)
                == "No selected photos had a location, so none were added."
        )
        #expect(
            MapContainerView.nothingPlacedMessage(untagged: 0, notInspected: 1)
                == "The selected photo couldn't be read, so it wasn't added."
        )
        #expect(
            MapContainerView.nothingPlacedMessage(untagged: 2, notInspected: 1)
                == "Of the selected photos, 2 had no location, 1 couldn't be read, so none were added."
        )
        // A photo read and refused for its size was inspected, and had a
        // location: neither "unread" nor "untagged".
        #expect(
            MapContainerView.nothingPlacedMessage(untagged: 0, notInspected: 0, refused: 1)
                == "The selected photo was refused for its size or format, so it wasn't added."
        )
        #expect(
            MapContainerView.nothingPlacedMessage(untagged: 1, notInspected: 0, refused: 2)
                == "Of the selected photos, 1 had no location, 2 were refused for size or format, so none were added."
        )
    }

    /// A stored date that names no moment is not a date: not counted, and
    /// never sorted as text.
    @Test func aMalformedStoredDateIsNotADate() {
        #expect(PhotoMapViewModel.clusterDateDetail(dates: ["unknown", "later"], of: 2) == nil)
        #expect(
            PhotoMapViewModel.clusterDateDetail(dates: ["unknown", "2026-09-02T13:14:00.000Z"], of: 2)
                == "1 of 2 photos dated"
        )
        // Sorted as moments, not as text: a fractional and a whole form of
        // the same instant are the same day.
        #expect(
            PhotoMapViewModel.clusterDateDetail(
                dates: ["2026-09-02T13:14:00.000Z", "2026-09-02T13:14:00Z"], of: 2
            ) == PhotoMapViewModel.captureDateTitle("2026-09-02T13:14:00Z")
        )
    }

    /// A library that could not be read is not an empty one.
    @Test func aFailedReadIsNotAnEmptyLibrary() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let library = PhotoMapViewModel.Library(
            authorization: { .granted },
            requestAccess: { .granted },
            enumerate: { nil },
            applyChanges: { _ in nil }
        )
        let model = PhotoMapViewModel(directory: directory, library: library)

        await model.setVisible(true)

        #expect(model.state == .failed)
        #expect(model.indexLine?.contains("couldn't be read") == true)
        #expect(!model.isVisible)
    }

    /// Restricted is not the reader's refusal, and an unavailable library is
    /// not an empty one: each has its own line, and neither offers Settings
    /// as the way out.
    @Test func restrictedAndUnavailableAreNotDenials() {
        #expect(PhotoMapViewModel.Library.access(for: .restricted) == .restricted)
        #expect(PhotoMapViewModel.Library.access(for: .denied) == .denied)
        let (restricted, _) = make(access: .restricted)
        #expect(restricted.statusLine?.contains("restricted") == true)
        #expect(!restricted.canShowOnMap)
        let (unavailable, _) = make(access: .unavailable)
        #expect(unavailable.statusLine?.contains("not available") == true)
        #expect(!unavailable.canShowOnMap)
    }

    /// A photo pin is titled by its capture date and carries the descriptor
    /// the card loads its thumbnail through; nothing about it is invented,
    /// and a hand-placed point's GPS keys are not on it.
    @Test func aPhotoFeatureCarriesItsDateAndDescriptor() {
        let entry = PhotoMapIndex.Entry(
            id: "asset-1", latitude: 45.8, longitude: -61.47,
            capturedAt: "2026-09-02T13:14:00.000Z", width: 4032, height: 3024
        )
        let feature = PhotoMapViewModel.feature(for: entry)
        let photos = PhotoDescriptor.read(from: feature.properties)
        #expect(photos.map { PhotoMapViewModel.assetID(forDescriptorID: $0.id) } == ["asset-1"])
        #expect(photos.first?.width == 4032)
        #expect(feature.properties["name"]?.stringValue?.isEmpty == false)
        #expect(feature.properties[CaptureSpec.accuracyKey] == nil)

        let undated = PhotoMapViewModel.feature(
            for: PhotoMapIndex.Entry(id: "asset-2", latitude: 45.8, longitude: -61.47, capturedAt: nil)
        )
        #expect(undated.properties["name"] == nil)
        #expect(undated.properties[CaptureSpec.capturedAtKey] == nil)
    }
}
