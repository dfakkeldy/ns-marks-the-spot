import Foundation
import GeoCore
import Observation
import Photos
import PhotosUI
import UIKit

/// PhotoKit-backed photo map: one full enumeration per grant, persisted under
/// Caches with the change token; later refreshes apply the library's changes
/// since that token and read the whole library again only when the token
/// cannot be resumed from. The row in My Maps is the only UI; LayerCatalog is
/// untouched.
@MainActor
@Observable
final class PhotoMapViewModel {
    enum Access: Equatable {
        case unknown
        case denied
        /// Screen Time or a management profile: not the reader's refusal,
        /// and the app's Settings page cannot lift it.
        case restricted
        /// PhotoKit itself is unavailable on this device or in this process.
        case unavailable
        case limited
        case granted
    }

    /// Where the layer is between the switch and the pins.
    ///
    /// The switch shows the reader's intent from the moment they set it. The
    /// work that intent starts is a state of its own, not a delay in the
    /// switch: a switch that read "off" through the permission prompt and the
    /// whole first index read as a switch that had not taken.
    enum State: Equatable {
        case off
        /// The system prompt is up.
        case requestingAccess
        /// The library is being read. Pins from an earlier snapshot stay up.
        case indexing
        case on
        /// The library could not be read. Not an empty library: the row says
        /// so, and no pins are drawn from a read that did not happen.
        case failed
    }

    /// The library side of the index, so the state machine can be driven by a
    /// test without a photo library.
    struct Library {
        var authorization: @MainActor () -> Access
        var requestAccess: @MainActor () async -> Access
        /// Every geotagged image in the library, with the token to resume
        /// from; nil when the library could not be read, which is not the
        /// same as a library with nothing in it.
        var enumerate: @Sendable () async -> PhotoMapIndex.Snapshot?
        /// The snapshot brought up to date with the library's changes since
        /// its token, or nil when the token cannot be resumed from and the
        /// library has to be read whole again.
        var applyChanges: @Sendable (PhotoMapIndex.Snapshot) async -> PhotoMapIndex.Snapshot?

        static let photoKit = Library(
            authorization: {
                // Asked before the status: a library that is not there has no
                // status worth reading, and "no photos were found" in it
                // would be a source failure told as an empty answer.
                if PHPhotoLibrary.shared().unavailabilityReason != nil { return .unavailable }
                return access(for: PHPhotoLibrary.authorizationStatus(for: .readWrite))
            },
            requestAccess: { access(for: await PHPhotoLibrary.requestAuthorization(for: .readWrite)) },
            enumerate: { PhotoKitIndexer.enumerateAll() },
            applyChanges: { PhotoKitIndexer.applyChanges(to: $0) }
        )

        static func access(for status: PHAuthorizationStatus) -> Access {
            switch status {
            case .authorized: .granted
            case .limited: .limited
            case .denied: .denied
            case .restricted: .restricted
            case .notDetermined: .unknown
            @unknown default: .unknown
            }
        }
    }

    private(set) var access: Access = .unknown
    private(set) var state: State = .off
    private(set) var snapshot = PhotoMapIndex.Snapshot(entries: [])
    /// The access the snapshot was read under. Persistent change history
    /// under limited access covers only the selected photos, so a change of
    /// scope — full to limited, limited to full, or a different selection —
    /// is not in it; the library is read whole again when the scope differs.
    private(set) var indexedAccess: Access?
    /// Moves every time the snapshot is replaced. The map refreshes on it,
    /// so a refresh is never tied to the falling edge of a flag that a second
    /// run could clear early.
    private(set) var snapshotGeneration = 0
    private(set) var viewport = PhotoMapIndex.Viewport(entries: [], truncated: false, totalInView: 0)
    /// iCloud download progress for a photo a card is loading, by asset id.
    private(set) var downloadProgress: [String: Double] = [:]

    private let library: Library
    private let storeURL: URL
    /// The reader's latest intent, counted: work that resumes after an await
    /// checks it is still wanted before touching the state.
    @ObservationIgnored private var intent = 0
    /// The one library read in flight, if there is one, with the scope it
    /// reads under and the revision of the index it will replace. A second
    /// caller joins it only if both still stand; a result is applied only if
    /// the revision still stands. A downgrade or a changed selection while a
    /// read was out makes that read history, however recently it started.
    private struct Refresh {
        var task: Task<PhotoMapIndex.Snapshot?, Never>
        var scope: Access
        var revision: Int
    }
    @ObservationIgnored private var refresh: Refresh?
    @ObservationIgnored private var indexRevision = 0

    init(directory: URL = PhotoMapViewModel.defaultDirectory, library: Library = .photoKit) {
        self.library = library
        self.storeURL = directory.appending(path: "index.json")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        loadSnapshot()
        refreshAccess()
    }

    private static var defaultDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhotoMapIndex", isDirectory: true)
    }

    /// What the switch shows: the reader's intent, from the moment they set it.
    var isOn: Bool { state != .off }

    /// Whether pins may be on the map: on, or reading the library again over
    /// an earlier snapshot.
    var isVisible: Bool { state == .on || state == .indexing }

    var canShowOnMap: Bool {
        access == .granted || access == .limited
    }

    var subtitle: String { "Your photos · never uploaded" }

    /// The access line, when access is the thing to say.
    var statusLine: String? {
        switch access {
        case .limited:
            return "Showing only the photos you selected."
        case .denied:
            return "Photo access is off. The map cannot show your library."
        case .restricted:
            return "Photo access is restricted on this device, for example by Screen Time "
                + "or a management profile."
        case .unavailable:
            return "The photo library is not available on this device."
        case .granted, .unknown:
            return nil
        }
    }

    /// What the index holds and what is in view, once the switch is on.
    ///
    /// Every state has a line. An empty map under a switch that only said ON
    /// was indistinguishable from a broken layer: no photos with a location,
    /// none in this view, and still reading are three different things.
    var indexLine: String? {
        switch state {
        case .off:
            return nil
        case .requestingAccess:
            return "Waiting for photo access…"
        case .indexing:
            return snapshot.entries.isEmpty ? "Indexing your photos…" : "Updating your photo index…"
        case .failed:
            return "Your photo library couldn't be read. Turn the switch off and on to try again."
        case .on:
            let total = snapshot.entries.count
            if total == 0 {
                // Under limited access the library is the selection, and
                // "your library" would claim more was searched than was.
                return access == .limited
                    ? "No selected photos with a location were found."
                    : "No photos with a location were found in your library."
            }
            if viewport.totalInView == 0 {
                return "\(total) geotagged photo\(total == 1 ? "" : "s") indexed · none in this view"
            }
            if viewport.truncated {
                // No zoom advice: photos taken from one spot do not come
                // apart at any zoom, and the ones past the cap stay behind it.
                return "Showing the \(PhotoMapIndex.maxAnnotations) most recent of "
                    + "\(viewport.totalInView) in view"
            }
            return "\(viewport.totalInView) of \(total) geotagged photo\(total == 1 ? "" : "s") in this view"
        }
    }

    /// The cap, said on the map as well as in the row: the row is behind the
    /// closed layers panel while the map is being looked at.
    var truncationNote: String? {
        guard isVisible, viewport.truncated else { return nil }
        return "Showing the \(PhotoMapIndex.maxAnnotations) most recent of "
            + "\(viewport.totalInView) photos here."
    }

    /// Re-read on launch and on every return to the foreground: the setting
    /// changes in Settings, and a grant made there relaunches the app while a
    /// revocation does not.
    func refreshAccess() {
        // Not while the prompt is up: its answer is the access, and a
        // reconciliation now would clear the pins for a selection that has
        // not been read yet and start a read the answer starts again.
        guard state != .requestingAccess else { return }
        access = library.authorization()
        if isOn, access != .unknown, !canShowOnMap {
            state = .off
        }
        reconcileScope()
    }

    /// Under limited access the selection can change in Settings without a
    /// trace this app can read, so every return under it — and the first
    /// answer to the prompt — is treated as a possibly changed selection:
    /// the pins come down at once, ahead of the read that brings the current
    /// selection back, and any read still out is history.
    private func reconcileScope() {
        guard access == .limited else { return }
        indexRevision += 1
        snapshot = PhotoMapIndex.Snapshot(entries: [])
        indexedAccess = nil
        snapshotGeneration += 1
    }

    func setVisible(_ visible: Bool) async {
        intent += 1
        let mine = intent
        guard visible else {
            state = .off
            return
        }
        if access == .unknown {
            state = .requestingAccess
            access = await library.requestAccess()
            // The reader may have switched off while the prompt was up.
            guard intent == mine else { return }
            // A limited answer to the prompt makes any cached full-library
            // snapshot a claim about photos this app may not see.
            reconcileScope()
        }
        guard canShowOnMap else {
            state = .off
            return
        }
        // On at once: pins from an earlier snapshot show while the library is
        // read again, and the switch stays where the reader put it.
        state = .on
        await refreshIndex(intent: mine)
    }

    /// Brings the index up to date with the library.
    ///
    /// Single-flight: a second caller waits for the read in progress rather
    /// than starting another, and a caller whose intent was overtaken (the
    /// switch went off meanwhile) leaves the state alone. The snapshot is
    /// kept either way; it is data about the library, not about the switch.
    func refreshIndex(intent mine: Int? = nil) async {
        guard canShowOnMap, isOn else { return }
        var scope = access
        var run: Refresh
        while true {
            if let inFlight = refresh {
                if inFlight.revision == indexRevision, inFlight.scope == scope {
                    run = inFlight
                    break
                }
                // Stale — a downgrade or a new selection since it started —
                // but still enumerating. Waited out rather than raced: two
                // whole-library reads at once hold two libraries in memory,
                // and its result is discarded by the revision anyway. Said
                // as indexing meanwhile, not as an empty selection.
                state = .indexing
                inFlight.task.cancel()
                _ = await inFlight.task.value
                if refresh?.task == inFlight.task { refresh = nil }
                guard canShowOnMap, isOn else { return }
                scope = access
                continue
            }
            let current = snapshot
            let enumerate = library.enumerate
            let applyChanges = library.applyChanges
            // Incremental only under the scope the snapshot was read in, and
            // never under limited access: the change history there covers
            // the selected photos only, so a selection changed in Settings
            // leaves no trace in it. A limited selection is small; it is
            // read whole.
            let incremental = current.changeToken != nil && indexedAccess == scope && scope == .granted
            let task = Task.detached(priority: .userInitiated) { () -> PhotoMapIndex.Snapshot? in
                // Detached: PhotoKit fetches are thread-safe, and enumerating
                // a whole library on the main actor froze the map for the
                // scan.
                if incremental, let applied = await applyChanges(current) {
                    return applied
                }
                return await enumerate()
            }
            run = Refresh(task: task, scope: scope, revision: indexRevision)
            refresh = run
            break
        }
        state = .indexing
        let built = await run.task.value
        if refresh?.task == run.task { refresh = nil }
        // Overtaken while it was out — a downgrade, a new selection — its
        // result is history; the read that replaced it will land.
        guard run.revision == indexRevision else { return }
        guard let built else {
            // The library could not be read. Not an empty library, and not
            // a snapshot to keep. Unavailable and failed are told apart: the
            // access is read again, and a library that is not there is
            // reported as that.
            if let mine, intent != mine { return }
            // Switched off while the read was out: off is what the reader
            // asked for, and "couldn't be read" would be shown under a
            // switch that is off.
            guard state != .off else { return }
            // "Couldn't be read" only while it may be read: access withdrawn
            // during the read — Screen Time, a profile — is its own row
            // state, with the switch off rather than on and disabled.
            access = library.authorization()
            state = access == .granted || access == .limited ? .failed : .off
            return
        }
        // The grant as it stands now, not as the read began: PhotoKit
        // answers a fetch under a withdrawn grant with an empty result
        // rather than a failure, and a read that landed after the grant went
        // would otherwise be kept as "no geotagged photos", written to disk
        // under a scope it no longer has, and resumed from incrementally for
        // good once access came back. The access is the one this model has
        // been told about — the foreground return re-reads it — rather than
        // another read of the library, which under limited access answers
        // with the status from before the prompt.
        guard access == run.scope else {
            if !canShowOnMap { state = .off }
            return
        }
        // Persisted with the scope it was read under, here and now: a write
        // deferred past a suspension could land after a newer read's and
        // leave a revoked selection on disk. The file is small — and not
        // rewritten when nothing in it would change.
        let changed = built != snapshot || indexedAccess != run.scope
        indexedAccess = run.scope
        if built != snapshot {
            snapshot = built
            snapshotGeneration += 1
        }
        if changed {
            Self.persist(built, scope: run.scope, to: storeURL)
        }
        if let mine, intent != mine { return }
        if state == .indexing { state = .on }
    }

    func refreshViewport(bounds: GeoBoundingBox?) {
        guard isVisible, let bounds else {
            viewport = PhotoMapIndex.Viewport(entries: [], truncated: false, totalInView: 0)
            return
        }
        viewport = PhotoMapIndex.viewport(snapshot, bounds: bounds)
    }

    // MARK: - Drawing

    /// Transient overlay of the in-view geotagged library. Not a stored layer.
    ///
    /// The record is the same on every pan: its count is the whole index,
    /// not the view, so the map's diff sees only the points that changed
    /// rather than a new layer to tear down and put back.
    func drawing() -> UserVectorDrawing? {
        guard isVisible, !viewport.entries.isEmpty else { return nil }
        return UserVectorDrawing(
            record: record,
            parsed: ParsedVector(features: viewport.entries.map(Self.feature(for:)), bbox: nil)
        )
    }

    private var record: UserVectorLayerRecord {
        let epoch = Date(timeIntervalSince1970: 0)
        return UserVectorLayerRecord(
            id: Self.layerID,
            name: "Your photos",
            source: .photos,
            origin: .photos(createdAt: epoch, count: snapshot.entries.count),
            createdAt: epoch,
            colorHex: "#7c3aed",
            featureCount: snapshot.entries.count,
            bbox: nil
        )
    }

    /// One photo as a feature: titled by its capture date, carrying the
    /// descriptor the card loads the thumbnail through. Only what the library
    /// said about the photo; a photo without a date is titled as a photo.
    static func feature(for entry: PhotoMapIndex.Entry) -> GeoJsonFeature {
        var properties: [String: JSONValue] = [
            CaptureSpec.photosKey: PhotoDescriptor.propertyValue(internalForm: [descriptor(for: entry)])
        ]
        if let capturedAt = entry.capturedAt {
            properties[CaptureSpec.capturedAtKey] = .string(capturedAt)
            properties["name"] = .string(captureDateTitle(capturedAt))
        }
        return GeoJsonFeature(
            id: "photo-map:\(entry.id)",
            geometry: .point(GeoJsonPosition(lng: entry.longitude, lat: entry.latitude)),
            properties: properties
        )
    }

    static func descriptor(for entry: PhotoMapIndex.Entry) -> PhotoDescriptor {
        PhotoDescriptor(
            id: descriptorID(forAssetID: entry.id),
            capturedAt: entry.capturedAt,
            width: entry.width.map(Double.init),
            height: entry.height.map(Double.init)
        )
    }

    /// A PhotoKit local identifier is opaque and carries slashes
    /// (`…/L0/001`), and the descriptor parser refuses a slash: for a stored
    /// photo the id is a filename stem. The photo map's ids are never
    /// filenames, so the slash is folded to a bar on the way into the
    /// descriptor and back on the way out to PhotoKit. A bar does not occur
    /// in a local identifier.
    static func descriptorID(forAssetID id: String) -> String {
        // Base64url of the whole identifier, so any opaque string comes back
        // exactly, and the result is letters, digits, '-' and '_': never a
        // slash, a backslash or a '..' for the path check to refuse.
        let encoded = Data(id.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "pk_" + encoded
    }

    static func assetID(forDescriptorID id: String) -> String {
        guard id.hasPrefix("pk_") else { return id }
        var base64 = String(id.dropFirst(3))
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64), let text = String(data: data, encoding: .utf8)
        else { return id }
        return text
    }

    /// The open card, re-read from the index: the same photo or cluster if
    /// the library still shows it, nil if it does not. A card left open over
    /// a pin that has gone would be a claim about a photo this app may no
    /// longer see.
    func callout(matching item: UserVectorCalloutItem) -> UserVectorCalloutItem? {
        // The members as the card holds them, never parsed back out of the
        // id: an opaque identifier may itself contain the joining character.
        if let members = item.memberFeatureIDs {
            return callout(clusterMemberIDs: members.map { "\(Self.layerID)/\($0)" })
        }
        return callout(annotationID: item.id)
    }

    /// "2 Sep 2026 at 10:14", in the reader's locale, from the ISO capture time.
    static func captureDateTitle(_ iso: String) -> String {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else { return "Photo" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // MARK: - Callouts

    func callout(annotationID: String) -> UserVectorCalloutItem? {
        guard let drawing = drawing() else { return nil }
        guard let separator = annotationID.firstIndex(of: "/") else { return nil }
        let layerID = String(annotationID[..<separator])
        let featureID = String(annotationID[annotationID.index(after: separator)...])
        guard layerID == PhotoMapViewModel.layerID,
              let feature = drawing.parsed.features.first(where: { $0.id == featureID })
        else { return nil }
        return UserVectorCalloutItem(feature: feature, record: drawing.record)
    }

    /// One card for the photos of a cluster that zooming cannot pull apart:
    /// several shots from one standing spot. Their thumbnails share the strip.
    func callout(clusterMemberIDs ids: [String]) -> UserVectorCalloutItem? {
        guard let drawing = drawing() else { return nil }
        let prefix = "\(Self.layerID)/"
        let featureIDs = Set(ids.filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) })
        let features = drawing.parsed.features.filter { $0.id.map(featureIDs.contains) == true }
        guard let first = features.first else { return nil }
        if features.count == 1 {
            return UserVectorCalloutItem(feature: first, record: drawing.record)
        }
        let members = featureIDs.sorted()
        return UserVectorCalloutItem(
            id: "\(Self.layerID)/cluster:\(members.joined(separator: ","))",
            callout: VectorFeatureCallout(
                title: "\(features.count) photos here",
                detail: Self.clusterDateDetail(features),
                provenance: drawing.record.provenanceText
            ),
            layerName: drawing.record.name,
            layerID: Self.layerID,
            photos: features.flatMap { PhotoDescriptor.read(from: $0.properties) },
            memberFeatureIDs: members
        )
    }

    /// The dates of a cluster's photos, only when every member has one: a
    /// range over the dated members alone would read as the date of them
    /// all. Otherwise how many are dated.
    static func clusterDateDetail(_ features: [GeoJsonFeature]) -> String? {
        clusterDateDetail(
            dates: features.compactMap { $0.properties[CaptureSpec.capturedAtKey]?.stringValue },
            of: features.count
        )
    }

    /// The date range of `total` photos, of which `dates` are dated. Stated
    /// as a range only when every one is dated; otherwise as how many are,
    /// so one dated photo's day does not read as the day of them all.
    static func clusterDateDetail(dates: [String], of total: Int) -> String? {
        // Only a string that names a moment is a date; a descriptor's
        // "unknown" is kept on the photo but not counted, and never sorted
        // as text into "Photo to Photo".
        let dated = dates.compactMap { text in CaptureTime.parse(text).map { (date: $0, text: text) } }
            .sorted { $0.date < $1.date }
        guard let earliest = dated.first, let latest = dated.last else { return nil }
        if dated.count == total {
            return earliest.date == latest.date
                ? captureDateTitle(earliest.text)
                : "\(captureDateTitle(earliest.text)) to \(captureDateTitle(latest.text))"
        }
        return "\(dated.count) of \(total) photos dated"
    }

    // MARK: - Photo bytes

    /// The bytes for a card's thumbnail or lightbox, from PhotoKit.
    ///
    /// Cancelling the task cancels the request, so a card closed while an
    /// iCloud original downloads does not keep the download; while one
    /// downloads, its progress is in `downloadProgress` for the card to show.
    /// `photoID` is the descriptor's id, as the card holds it; the PhotoKit
    /// identifier is unfolded from it here. Progress is keyed the same way.
    func imageData(assetID photoID: String, thumb: Bool) async -> Data? {
        let localIdentifier = Self.assetID(forDescriptorID: photoID)
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil)
        guard let asset = assets.firstObject else { return nil }
        let target = thumb ? CGSize(width: 256, height: 256) : CGSize(width: 1600, height: 1600)
        let request = ImageRequest()
        defer { downloadProgress[photoID] = nil }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Data?, Never>) in
                request.arm(continuation)
                let options = PHImageRequestOptions()
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .fast
                options.isNetworkAccessAllowed = true
                options.isSynchronous = false
                options.progressHandler = { [weak self] progress, _, _, _ in
                    Task { @MainActor in self?.downloadProgress[photoID] = progress }
                }
                let id = PHImageManager.default().requestImage(
                    for: asset,
                    targetSize: target,
                    contentMode: thumb ? .aspectFill : .aspectFit,
                    options: options
                ) { image, _ in
                    request.finish(with: image?.jpegData(compressionQuality: 0.8))
                }
                request.begin(id)
            }
        } onCancel: {
            request.cancel()
        }
    }

    /// The request id and the continuation, owned together under one lock,
    /// so whichever of PhotoKit's callback (any queue) and the cancellation
    /// handler comes first — or comes at all — resumes the wait exactly
    /// once. PhotoKit may not call back after a cancel, and a continuation
    /// that only the callback could resume was then suspended for good.
    private nonisolated final class ImageRequest: @unchecked Sendable {
        private let lock = NSLock()
        private var id: PHImageRequestID?
        private var continuation: CheckedContinuation<Data?, Never>?
        private var cancelled = false

        func arm(_ continuation: CheckedContinuation<Data?, Never>) {
            lock.lock()
            if cancelled {
                lock.unlock()
                continuation.resume(returning: nil)
                return
            }
            self.continuation = continuation
            lock.unlock()
        }

        func begin(_ id: PHImageRequestID) {
            lock.lock()
            self.id = id
            let cancelled = self.cancelled
            lock.unlock()
            if cancelled { PHImageManager.default().cancelImageRequest(id) }
        }

        func finish(with data: Data?) {
            lock.lock()
            let continuation = self.continuation
            self.continuation = nil
            lock.unlock()
            continuation?.resume(returning: data)
        }

        func cancel() {
            lock.lock()
            cancelled = true
            let id = self.id
            let continuation = self.continuation
            self.continuation = nil
            lock.unlock()
            if let id { PHImageManager.default().cancelImageRequest(id) }
            continuation?.resume(returning: nil)
        }
    }

    // MARK: - Access

    /// The system's own picker for a limited selection, presented from here
    /// rather than by sending the reader to Settings. The index is read whole
    /// afterwards: the selection is the library, as far as this app can see.
    func presentLimitedLibraryPicker() async {
        guard let presenter = Self.frontmostViewController() else { return }
        _ = await PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: presenter)
        // The old selection is history: a read of it still out is discarded
        // by the revision, and its pins come down now rather than after the
        // new read, since they may be photos this app may no longer see.
        indexRevision += 1
        snapshot = PhotoMapIndex.Snapshot(entries: [])
        indexedAccess = nil
        snapshotGeneration += 1
        await refreshIndex()
    }

    private static func frontmostViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    static let layerID = "photo-map-layer"

    // MARK: - Persistence

    /// The on-disk shape, shared by the loader and the writer. Nonisolated
    /// so the detached read can encode it off the main actor.
    private nonisolated struct IndexFile: Codable {
        var entries: [PhotoMapIndex.Entry]
        var changeToken: Data?
        /// "granted" or "limited": the scope the index was read under. An
        /// older file without it is read whole again once.
        var accessScope: String?
    }

    private func loadSnapshot() {
        guard let data = try? Data(contentsOf: storeURL) else { return }
        guard let file = try? JSONDecoder().decode(IndexFile.self, from: data) else { return }
        snapshot = PhotoMapIndex.Snapshot(entries: file.entries, changeToken: file.changeToken)
        indexedAccess = file.accessScope.flatMap(Self.access(fromScope:))
    }

    private nonisolated static func scope(for access: Access) -> String? {
        switch access {
        case .granted: "granted"
        case .limited: "limited"
        default: nil
        }
    }

    private nonisolated static func access(fromScope scope: String) -> Access? {
        switch scope {
        case "granted": .granted
        case "limited": .limited
        default: nil
        }
    }

    private nonisolated static func persist(_ snapshot: PhotoMapIndex.Snapshot, scope: Access, to url: URL) {
        let file = IndexFile(
            entries: snapshot.entries, changeToken: snapshot.changeToken, accessScope: self.scope(for: scope)
        )
        guard let data = try? JSONEncoder().encode(file) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// The PhotoKit reads, off the main actor.
nonisolated enum PhotoKitIndexer {
    /// Every geotagged image. The token is taken before the read, so a photo
    /// added while the library was being enumerated is caught by the next
    /// refresh rather than lost between the two.
    static func enumerateAll() -> PhotoMapIndex.Snapshot? {
        // A library that is not there yields no assets, which is not the
        // same as a library with none: checked before and after the read.
        guard PHPhotoLibrary.shared().unavailabilityReason == nil else { return nil }
        let token = PHPhotoLibrary.shared().currentChangeToken
        let fetched = PHAsset.fetchAssets(with: .image, options: nil)
        var entries: [PhotoMapIndex.Entry] = []
        entries.reserveCapacity(fetched.count)
        fetched.enumerateObjects { asset, _, _ in
            if let entry = entry(for: asset) {
                entries.append(entry)
            }
        }
        entries.sort(by: PhotoMapIndex.mostRecentFirst)
        guard PHPhotoLibrary.shared().unavailabilityReason == nil else { return nil }
        return PhotoMapIndex.Snapshot(entries: entries, changeToken: archive(token))
    }

    static func entry(for asset: PHAsset) -> PhotoMapIndex.Entry? {
        guard let location = asset.location else { return nil }
        return PhotoMapIndex.Entry(
            id: asset.localIdentifier,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            capturedAt: asset.creationDate.map { CaptureTime.iso($0) },
            width: asset.pixelWidth,
            height: asset.pixelHeight
        )
    }

    /// The snapshot with the library's changes since its token applied:
    /// deleted assets dropped, inserted and updated ones read again (a photo
    /// whose location was removed leaves the index). Nil when the token cannot
    /// be resumed from, which is PhotoKit saying the whole library has to be
    /// read. A screenshot or a favourite no longer costs a full enumeration.
    static func applyChanges(to current: PhotoMapIndex.Snapshot) -> PhotoMapIndex.Snapshot? {
        guard let data = current.changeToken, let token = unarchive(data) else { return nil }
        let result: PHPersistentChangeFetchResult
        do {
            result = try PHPhotoLibrary.shared().fetchPersistentChanges(since: token)
        } catch {
            return nil
        }
        var deleted = Set<String>()
        var touched = Set<String>()
        var latest: PHPersistentChangeToken?
        for change in result {
            // Any change whose asset details cannot be read is a reason to
            // read the library whole, not to step past it: a change skipped
            // here is skipped for good once the token moves on, and an
            // album-only change costs a full read at worst.
            guard let details = try? change.changeDetails(for: .asset) else { return nil }
            // In order, so the last word on an identifier wins: a photo
            // deleted and then restored from Recently Deleted is fetched
            // again, not dropped; one added and then deleted is dropped.
            for id in details.deletedLocalIdentifiers {
                touched.remove(id)
                deleted.insert(id)
            }
            for id in details.insertedLocalIdentifiers.union(details.updatedLocalIdentifiers) {
                deleted.remove(id)
                touched.insert(id)
            }
            latest = change.changeToken
        }
        guard let latest else {
            // Nothing changed; the same snapshot, so the map is left alone.
            return current
        }
        var byID: [String: PhotoMapIndex.Entry] = [:]
        for entry in current.entries { byID[entry.id] = entry }
        for id in deleted { byID[id] = nil }
        for id in touched { byID[id] = nil }
        if !touched.isEmpty {
            let fetched = PHAsset.fetchAssets(withLocalIdentifiers: Array(touched), options: nil)
            fetched.enumerateObjects { asset, _, _ in
                if let entry = entry(for: asset) {
                    byID[asset.localIdentifier] = entry
                }
            }
        }
        let entries = byID.values.sorted(by: PhotoMapIndex.mostRecentFirst)
        return PhotoMapIndex.Snapshot(entries: entries, changeToken: archive(latest))
    }

    private static func archive(_ token: PHPersistentChangeToken) -> Data? {
        try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    }

    private static func unarchive(_ data: Data) -> PHPersistentChangeToken? {
        try? NSKeyedUnarchiver.unarchivedObject(ofClass: PHPersistentChangeToken.self, from: data)
    }
}
