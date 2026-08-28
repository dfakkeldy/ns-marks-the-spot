import CoreGraphics
import Foundation
import GeoCore
import Observation

/// One row of the user's own maps in the layer panel, and what it draws.
@MainActor
@Observable
final class UserMapsViewModel {
    /// A map the user brought in, as the panel sees it.
    struct Row: Identifiable, Equatable {
        var record: UserMapRecord
        var isVisible: Bool
        var opacity: CGFloat
        /// Nil while the preview is still being read off disk, and after a
        /// preview that has gone missing. A row with no pixels still appears:
        /// it is the user's map, and a row that vanished would look like the
        /// app had thrown it away.
        var preview: CGImage?

        var id: String { record.id }
        /// The user has to place it before it can draw.
        var needsGeoreferencing: Bool { record.needsGeoreferencing }
        /// A PDF that offered more than one frame and is still waiting to be
        /// told which one it is. Placing it by hand answers the question too,
        /// which is why this stops asking once the sheet is placed.
        var needsFrameSelection: Bool {
            record.pdf?.needsFrameSelection == true && record.needsGeoreferencing
        }
        /// A placed PDF whose page carried other frames as well. Offered as a
        /// change rather than a choice: the sheet is drawn on ground the file
        /// named, and the user is the only one who can know it named the wrong
        /// frame.
        var canChangeFrame: Bool { record.pdf?.canChangeFrame == true }
        /// The frames the file offered, for the chooser.
        var frames: [PdfMapRegistration.Candidate] { record.pdf?.candidates ?? [] }
        /// Which frame is placing the sheet now, so the chooser opens on it.
        var selectedFrameID: String? { record.pdf?.selectedFrameID }
        /// Whether switching frames would throw away points the user moved.
        var frameChangeReplacesUserWork: Bool {
            record.pdf?.isAdjusted == true && record.pdf?.selectedFrameID != nil
        }
        /// What placed this sheet, for the row to say out loud.
        var provenance: String? { record.pdf?.provenance }

        static func == (lhs: Row, rhs: Row) -> Bool {
            lhs.record == rhs.record && lhs.isVisible == rhs.isVisible
                && lhs.opacity == rhs.opacity && lhs.preview === rhs.preview
        }
    }

    /// Something the panel has to say about a map. Shared with the vector
    /// panel, because one selection can now land in both.
    typealias Notice = UserImportNotice

    private(set) var rows: [Row] = []
    /// What the last thing the user asked for came to, for the panel to show.
    /// Held rather than thrown past the user: an import that failed silently
    /// reads as a file that vanished.
    private(set) var notices: [Notice] = []

    /// The files this batch has turned away because the library is sealed,
    /// kept so the single refusal can name all of them.
    private var sealedRefusalNames: [String] = []

    /// True when there is a library on this device that this build could not
    /// read, so nothing may be written over it.
    ///
    /// A newer build's document, or a damaged one. Either way the file holds
    /// maps the user still has, and the panel showing no rows is already the
    /// worst of it: saving anything at all from here — one import is enough —
    /// would replace their whole library with whatever this session happens to
    /// hold. Refusing every write keeps the file intact for a build that can
    /// read it, or for a support answer that recovers it.
    private(set) var isLibrarySealed = false

    /// The library as the disk last confirmed it.
    ///
    /// What an undone change is undone *to*. Remembering instead the record
    /// each edit found in front of it looks equivalent and is not: two edits to
    /// one sheet can overlap, and the second finds what the first put there
    /// rather than what was saved. Undoing both then leaves the sheet on the
    /// first edit, which never reached the disk either, while the panel says
    /// the change was undone.
    private var saved: [UserMapRecord] = []

    /// How many library writes have been started since launch.
    ///
    /// `load` reads the file across an await, and a write can begin while it is
    /// still reading. What comes back is then older than what is on screen, and
    /// applying it drops a map the file already holds — after which the next
    /// placement writes that shortened list back and the map is gone for real.
    /// Counted from the start of each write rather than its finish, so a write
    /// still in flight counts too.
    private var writes = 0

    private let store: UserMapStore

    /// Half-finished placements, which live outside the library.
    ///
    /// Held here only so that deleting a map takes its draft with it. The
    /// georeferencer owns the writing.
    private let drafts: GeoreferenceDraftStore

    init(
        store: UserMapStore = .shared,
        display: UserMapDisplayStore = UserMapDisplayStore(),
        drafts: GeoreferenceDraftStore = GeoreferenceDraftStore()
    ) {
        self.store = store
        self.display = display
        self.drafts = drafts
    }

    /// Which maps are drawn and how strongly, which is not part of the library.
    private let display: UserMapDisplayStore

    /// Reads the library, then fills in previews as they load.
    ///
    /// The rows appear before their pixels do. A user with a large scan should
    /// see their map listed while it decodes rather than an empty panel that
    /// fills in all at once, which is indistinguishable from an app that lost
    /// their maps.
    func load() async {
        let mark = writes
        let records: [UserMapRecord]
        do {
            records = try await store.load()
            // Nothing read here may be applied over a newer write. What came
            // back describes the file as it was before that write, and putting
            // it on screen drops a map the file already holds — after which the
            // next placement writes the shortened list back and the map is gone
            // for real.
            guard mark == writes else { return }
        } catch UserMapStore.StoreRefusal.unreadable {
            // The same check, for a stronger reason: a write that landed while
            // this read was in flight has replaced the damaged document with a
            // sound one, and setting it aside now would carry off the map that
            // just arrived along with the damage.
            guard mark == writes else { return }
            // Damaged at this build's own version, which the store establishes
            // by reading the format number before anything else. There is no
            // later build coming to read this file, so sealing would take the
            // user's maps away and never give them back: the panel would refuse
            // every import for the life of the install, and only deleting the
            // app would clear it. The file is moved aside instead, never
            // deleted, and a new library starts.
            rows = []
            // Sealed only if it could not even be moved, which leaves the
            // unreadable file in place and every write still dangerous.
            let recovered = (try? await store.setAsideDamagedLibrary()) ?? false
            isLibrarySealed = !recovered
            // The library moves as a directory, so the maps and their previews
            // go with it. The drafts are somewhere else and would be left
            // pointing at ids no library holds any more, for the sweep below
            // to collect on the next launch. They are set aside too, so that
            // "nothing was deleted" covers the placements as well.
            if recovered { _ = drafts.setAside() }
            notices = [
                Notice(
                    id: "library",
                    name: "Your maps",
                    message: recovered ? """
                        Your saved maps could not be read, so they have been \
                        set aside and a new library started. Nothing was \
                        deleted: the maps are still on this device.
                        """ : sealedMessage,
                    isRefusal: true
                ),
            ]
            return
        } catch {
            // No `writes` check here, unlike the two branches above. This is
            // the later-version case, and the store refuses every write once it
            // has read one, so a write that started meanwhile did not land and
            // cannot have made the file readable. Bailing out on the count
            // would leave the panel unsealed over a library this build must not
            // touch, which is the one state this branch exists to prevent.
            //
            // A library this build cannot read is left exactly as it is, and
            // the fact is remembered. Empty rows are not enough on their own:
            // the very next import would compute its document from an empty
            // list and write the user's maps away.
            rows = []
            isLibrarySealed = true
            notices = [
                Notice(
                    id: "library",
                    name: "Your maps",
                    message: sealedMessage,
                    isRefusal: true
                ),
            ]
            return
        }
        isLibrarySealed = false
        saved = records
        let remembered = display.load()
        rows = records.map { record in
            let last = remembered[record.id]
            // A map nothing is remembered about is not drawn. Opening every
            // stored scan at full strength over the province is not a state
            // anybody asked for, and it is not what the browser does with the
            // same gap.
            return Row(
                record: record,
                isVisible: last?.isVisible ?? false,
                opacity: CGFloat(last?.opacity ?? UserMapDisplayStore.defaultOpacity),
                preview: nil
            )
        }
        // Half-finished placements with no map left to belong to, for the
        // reason the store gives at `sweepOrphans` and under the same rule as
        // the previews below: only against a library that read. The count is
        // checked once more because an import can land between the read and
        // here, and a map that arrived after the read is not in `records`.
        // An empty library sweeps nothing, which is the same rule the store
        // applies to previews and for the same reason: "there are no maps" is
        // a statement this app can arrive at by being reset, and every draft on
        // the device is not the price of getting there. The cost is a draft
        // left behind by an app killed between deleting its last map and
        // discarding its draft, which fails towards keeping the user's work.
        if mark == writes, !records.isEmpty {
            // Detached: the sweep is a directory enumeration plus removes on
            // the launch path, and nothing below reads its result. The store
            // is nonisolated for exactly this.
            let drafts = drafts
            let kept = Set(records.map(\.id))
            Task.detached(priority: .utility) {
                drafts.sweepOrphans(keeping: kept)
            }
        }
        // Pixels with no record left to belong to. An import whose library
        // write was refused has already written its preview, and a crash
        // between the two writes leaves the same thing; either way it is tens
        // of megabytes of a map the user cannot see and cannot delete. Only
        // after a load that succeeded: `records` is the whole library here, and
        // sweeping against the empty list a failed load leaves would take every
        // preview on the device with it.
        try? await store.sweepOrphanedPreviews()
        // Collected first, assigned in one pass with no suspension between
        // assignments: each preview assignment republishes the drapes, and
        // interleaving them with the per-record reads made MapKit rebuild and
        // re-warp every placed scan once per preview that arrived.
        // Only the rows that will draw. A preview is a decoded raster of up
        // to 4096 px on its long edge — ~50-64 MB apiece resident — and a
        // hidden row's pixels were being pinned for the app's lifetime for
        // nothing. Hidden rows load theirs on demand: when switched visible,
        // or when their frame-chooser or georeferencing sheet opens.
        let visibleIDs = Set(rows.filter(\.isVisible).map(\.id))
        var previews: [String: CGImage] = [:]
        for record in records where visibleIDs.contains(record.id) {
            if let preview = try? await store.preview(id: record.id) {
                previews[record.id] = preview
            }
        }
        for (id, preview) in previews {
            guard let index = rows.firstIndex(where: { $0.id == id }) else { continue }
            rows[index].preview = preview
        }
    }

    /// Clears what the panel is saying, ready for a batch of imports.
    ///
    /// Called once before the files rather than taken as a list of them,
    /// because the caller reads each file only when its turn comes: several
    /// large scans held as `Data` at once is a gigabyte of buffers resident
    /// before the first one has been decoded, and the system stops the app for
    /// it while every individual file was within the size limit.
    func beginImports() {
        sealedRefusalNames = []
        pendingFit = nil
        guard !isLibrarySealed else { return }
        notices = []
    }

    /// Imports one chosen file.
    ///
    /// One file's refusal never stops the next: a user who selected a folder of
    /// scans with one broken file in it should get the other nine maps and be
    /// told which one did not come.
    /// `filename` is the file as the picker showed it; `name` is what the row
    /// will be called. They differ by the extension, and the messages use the
    /// former: a refusal names a file that produced no row, so the only thing
    /// the reader can match it against is their own file list, where
    /// `lots.json` and `lots.geojson` are two different files and `lots` is
    /// neither.
    func importMap(data: Data, name: String, filename: String? = nil) async {
        let named = filename ?? name
        guard !isLibrarySealed else { return refuseWhileSealed(name: named) }
        let id = UUID().uuidString
        do {
            // Detached: decoding a 4096 px thumbnail out of a possibly
            // hundreds-of-MB GeoTIFF, or rendering a PDF page, is seconds of
            // CPU, and `UserFileImport` already went off-main to read the
            // bytes — decoding them on the main actor gave that back.
            let imported = try await Task.detached(priority: .userInitiated) {
                try UserMapImporter.import(data: data, id: id, name: name)
            }.value
            // Counted from here, not from the library write below. The preview
            // lands on disk first, and until the record naming it lands too
            // there is a file no document claims — which is exactly what the
            // orphan sweep deletes. A reload that overlaps this import has to
            // know the import began before it can sweep anything.
            writes += 1
            try await store.writePreview(imported.preview, id: id)
            // Checked again, because the seal can go up while this file was
            // decoding. `load()` reads the library across an await, so an
            // import started before it finished passes the check at the top of
            // this function and would resume afterwards to write its single map
            // over a library the app had meanwhile refused to read. The preview
            // just written is left where it is: the next load that succeeds
            // sweeps it, which is what the sweep is for.
            guard !isLibrarySealed else { return refuseWhileSealed(name: named) }
            rows.append(
                Row(
                    record: imported.record,
                    isVisible: true,
                    // The browser imports at 70%. A scan laid over the map at
                    // full strength hides the ground it is there to be compared
                    // against, and the reader's first act is to pull the slider
                    // back down.
                    opacity: CGFloat(UserMapDisplayStore.defaultOpacity),
                    preview: imported.preview
                )
            )
            // Appended first, so the document written below is the whole
            // library including this map. Ordering, not decoration: two imports
            // running at once — a second selection made while the first is
            // still decoding — otherwise each build their document from a
            // `rows` neither has been added to yet, and the second write lands
            // without the first map in it. The row is on screen and the file
            // has lost it, which shows up as a map that vanished overnight.
            // With the append first, every write holds every mutation made
            // before it, and the store is an actor, so the last write made is
            // the last one applied.
            do {
                // The document is read once and then both written and
                // remembered. Reading `rows` again after the write would record
                // whatever a second import appended while this one was in
                // flight as confirmed, when only this document reached the
                // disk.
                let document = rows.map(\.record)
                writes += 1
                try await store.save(document)
                saved = document
                // Only now, and never before. The whole set is written each
                // time, so remembering a map the library then refused would
                // replace the entries of every map that library does hold —
                // and a refusal is exactly when those entries belong to maps
                // this build cannot even see.
                rememberDisplay()
            } catch let refusal as UserMapStore.StoreRefusal {
                // Not a device that could not write, but a library this build
                // must not write to: a document from a later build, or one that
                // is not a library at all. The row goes back. Keeping it would
                // draw a map over a library this build cannot read, and every
                // later write would carry it into that library — which is the
                // one case where the whole-document write really would replace
                // entries belonging to maps this build cannot see.
                rows.removeAll { $0.id == id }
                throw refusal
            } catch {
                // The browser's promise, kept here: a device that cannot keep a
                // map never takes it away from the reader who just imported it.
                // The row stays, drawn and usable, and says plainly that it
                // will not be here next time. Removing it instead sends
                // somebody off to re-export a file that was never the problem,
                // when what they need is to free some space before they close
                // the app.
                //
                // A later write that succeeds — another import, or a delete —
                // carries this map into the library with it, because the whole
                // document is written each time and the row is in it. That is a
                // recovery rather than a contradiction: the preview is already
                // on disk, so what lands is a complete entry, and the notice
                // asks for the one thing that is certain to work.
                notices.append(
                    Notice(
                        id: id,
                        name: named,
                        message: """
                            This map could not be saved to your device. It stays on the map \
                            until you close the app. Free some space and import it again to \
                            keep it.
                            """,
                        isRefusal: false
                    )
                )
            }
            // A file that placed itself is drawn somewhere the reader is
            // probably not looking. The browser flies to it; here the panel
            // covers the map on a phone, so without this the import of a
            // georeferenced sheet produces no visible change at all and reads
            // as a file the app quietly refused. Outside the write, because a
            // map that could not be saved is still on the map and still worth
            // flying to.
            //
            // Only the ones that arrived placed. A scan with no georeferencing
            // has nowhere to fly to, and the reader is about to place it by
            // hand anyway.
            if !imported.record.needsGeoreferencing {
                pendingFit = Self.box(around: imported.record)
            }
            // A PDF is the one import whose result does not show what the app
            // did: which page came, whether the file placed it, and whether it
            // offered more than one frame. Said out loud, or the user reads a
            // hand-placeable cover sheet as the whole atlas.
            if let note = imported.record.pdf?.note {
                notices.append(
                    Notice(id: id, name: named, message: note, isRefusal: false)
                )
            }
            // A sheet that carried georeferencing this app could not read. The
            // map is in the library and the row offers placement, so this is
            // not a refusal — but without it the reader watches a file they
            // exported *with* a projection arrive asking to be placed by hand,
            // with nothing to say why or what would fix it.
            if let unread = imported.unreadGeoreferencing {
                notices.append(
                    Notice(id: id, name: named, message: unread, isRefusal: false)
                )
            }
        } catch let refusal as UserMapImportRefusal {
            notices.append(
                Notice(
                    id: id, name: named, message: refusal.userMessage, isRefusal: true
                )
            )
        } catch is UserMapStore.StoreRefusal {
            // The library, not the device: a document from a later build, or
            // one that is not a library at all. "Free some space" would send
            // the user retrying a write no amount of space will fix — and
            // every retry re-decodes the file and writes another preview. The
            // panel seals, exactly as `load()` seals it, and the sealed
            // message names what actually stands in the way. The row was
            // already removed where the refusal was first caught.
            isLibrarySealed = true
            notices.append(
                Notice(id: id, name: named, message: sealedMessage, isRefusal: true)
            )
        } catch {
            // Writing failed rather than reading: the file was fine and the
            // device could not keep it. Said as its own thing, because "your
            // map is corrupt" would send the user to re-export a file that
            // was never the problem.
            notices.append(
                Notice(
                    id: id,
                    name: named,
                    message: """
                        This map could not be saved to your device. Free some \
                        space and import it again.
                        """,
                    isRefusal: true
                )
            )
        }
    }

    /// Puts the notices away once the user has read them.
    ///
    /// Manual rather than timed: several of these are the only statement the
    /// app makes about what it did with a file, and one that cleared itself
    /// would be a statement the user could miss entirely.
    func clearNotices() { notices = [] }

    /// Records which of a PDF's frames the user says the sheet is.
    ///
    /// The chosen frame's own control points, not a guess: each candidate was
    /// read from the file and describes its own ground. Nothing is redrawn from
    /// the page — only which part of it is claimed to cover which ground.
    func selectFrame(id: String, candidateID: String) async {
        guard !isLibrarySealed else { return }
        guard let index = rows.firstIndex(where: { $0.id == id }),
              let metadata = rows[index].record.pdf,
              let candidate = metadata.candidates.first(where: { $0.id == candidateID })
        else { return }
        rows[index].record.sourceRect = candidate.sourceRect
        rows[index].record.placement = .controlPoints(
            UserMapImporter.controlPoints(of: candidate), method: .affine
        )
        rows[index].record.pdf = PdfImportMetadata(
            pageCount: metadata.pageCount,
            registration: .embedded(
                PdfImportMetadata.Embedded(
                    flavour: candidate.flavour,
                    selection: .user,
                    frameID: candidate.id,
                    label: candidate.label,
                    candidates: metadata.candidates,
                    // The points are the frame's own again, whatever the user
                    // had moved them to. That is why switching frames away from
                    // adjusted points is something they get asked about first.
                    adjusted: false
                )
            )
        )
        let chosen = rows[index].record
        await save(chosen.name, at: id)
        // The chosen frame is a different piece of ground from the one drawn a
        // moment ago, and the reader chose it from a picker rather than from
        // the map. The browser brings the map to it; so does this.
        //
        // Only if the choice was kept. A refused write has already put the old
        // frame back, and flying to it would tell the reader their choice
        // landed.
        if rows.first(where: { $0.id == id })?.record == chosen {
            pendingFit = Self.box(around: chosen)
        }
    }

    /// The ground a placed record covers, or nil when it draws nothing.
    ///
    /// `mesh` is the same lattice the overlay draws through, so the box is the
    /// sheet as it is actually placed rather than the corners of what the file
    /// claimed. A record with no mesh has no extent, and flying to a guess
    /// would land the reader somewhere the sheet is not.
    private static func box(around record: UserMapRecord) -> GeoBoundingBox? {
        record.mesh.flatMap { GeoBoundingBox.covering($0.lazy.flatMap { $0 }) }
    }

    /// A box the map should come to, cleared by whoever takes it.
    private(set) var pendingFit: GeoBoundingBox?

    /// Takes the request, so a later change cannot fire the same journey twice.
    func takePendingFit() -> GeoBoundingBox? {
        defer { pendingFit = nil }
        return pendingFit
    }

    /// Writes the library, and puts the record back if the device would not
    /// keep it.
    ///
    /// A discarded write is the failure mode with no symptom: the sheet moves
    /// on screen, the editor closes, and the work is gone at the next launch
    /// with nothing having looked wrong. Reverting keeps what is drawn and what
    /// is stored the same thing, and says so.
    /// Whether the library on disk now holds what the panel is showing.
    ///
    /// Reported rather than swallowed because a caller can hold the only other
    /// copy of the user's work: the georeferencer's draft is deleted on a save,
    /// and deleting it on a write that failed loses the points it was keeping.
    @discardableResult
    private func save(_ name: String, at id: String) async -> Bool {
        let document = rows.map(\.record)
        do {
            writes += 1
            try await store.save(document)
            saved = document
            return true
        } catch {
            // Everything goes back, not only the record this call was told
            // about: a failed write leaves the whole document unwritten, and
            // any other edit still in flight is just as unsaved as this one.
            let confirmed = Dictionary(uniqueKeysWithValues: saved.map { ($0.id, $0) })
            for index in rows.indices {
                guard let record = confirmed[rows[index].id] else { continue }
                rows[index].record = record
            }
            notices = [
                Notice(
                    id: id,
                    name: name,
                    message: """
                        This change could not be saved to your device, so it \
                        has been undone. Free some space and try again.
                        """,
                    isRefusal: true
                ),
            ]
            return false
        }
    }

    /// What the panel says when the user acts on a library it cannot write to.
    private var sealedMessage: String {
        """
        Your saved maps could not be read by this version, so they are not \
        shown and nothing new can be saved over them. Update the app and open \
        it again.
        """
    }

    /// Says that a file the picker offered could not be opened at all.
    func reportUnreadable(name: String) {
        notices.append(
            Notice(
                id: UUID().uuidString,
                name: name,
                message: "This file could not be opened from where it is stored.",
                isRefusal: true
            )
        )
    }

    /// Says that a file was past the size limit before anything read it.
    ///
    /// The message is passed in because the picker measures the file, and the
    /// limit it measured against depends on which pipeline the file was headed
    /// for.
    func reportTooLarge(name: String, message: String) {
        notices.append(
            Notice(id: UUID().uuidString, name: name, message: message, isRefusal: true)
        )
    }

    /// Says why nothing can be written, once, however many files were chosen.
    ///
    /// One notice rather than one per file: a selection of ten would otherwise
    /// post the same paragraph ten times, and the reason is the library rather
    /// than any of the files. Every file it covers is still named in it, so a
    /// user who imported three scans can see that all three were turned away
    /// and not guess which of them the app kept.
    private func refuseWhileSealed(name: String) {
        if !sealedRefusalNames.contains(name) { sealedRefusalNames.append(name) }
        notices = [
            Notice(
                id: "library",
                name: sealedRefusalNames.joined(separator: ", "),
                message: sealedMessage,
                isRefusal: true
            ),
        ]
    }

    func setVisible(_ isVisible: Bool, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].isVisible = isVisible
        rememberDisplay()
        if isVisible {
            ensurePreviewLoaded(id: id)
        } else {
            // The decoded raster goes with the drape. The preview file stays
            // on disk, so switching the row back on re-reads it; keeping the
            // pixels resident made memory grow with library size for rows
            // nothing was drawing.
            rows[index].preview = nil
        }
    }

    /// Loads a row's full preview if eviction (or a hidden-at-launch load)
    /// dropped it. Assigned only if the row is still visible when the read
    /// lands, so a quick off-on-off does not resurrect the pixels.
    private func ensurePreviewLoaded(id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }),
              rows[index].preview == nil else { return }
        Task { [weak self, store] in
            guard let preview = try? await store.preview(id: id),
                  let self,
                  let index = self.rows.firstIndex(where: { $0.id == id }),
                  self.rows[index].isVisible
            else { return }
            self.rows[index].preview = preview
        }
    }

    /// The row with its full preview in hand, fetched if it was evicted.
    ///
    /// For the sheets that draw the page itself — the frame chooser and the
    /// georeferencer — which need the pixels whether or not the row is
    /// currently drawing on the map.
    func rowEnsuringPreview(id: String) async -> Row? {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return nil }
        if rows[index].preview == nil,
           let preview = try? await store.preview(id: id) {
            rows[index].preview = preview
        }
        return rows[index]
    }

    func setOpacity(_ opacity: CGFloat, id: String) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        rows[index].opacity = opacity
        rememberDisplay()
    }

    /// Writes down what every row is showing, so the next launch opens on it.
    ///
    /// The whole set each time rather than the one row that changed: a map
    /// deleted here should lose its entry, and a set rebuilt from the rows does
    /// that without a second call to remember.
    ///
    /// Nothing is written while the library is sealed. `rows` is empty then,
    /// and saving would take the entries for maps that are still on the device
    /// with it.
    private func rememberDisplay() {
        guard !isLibrarySealed else { return }
        display.save(
            Dictionary(
                uniqueKeysWithValues: rows.map {
                    (
                        $0.id,
                        UserMapDisplayStore.Display(
                            isVisible: $0.isVisible, opacity: Double($0.opacity)
                        )
                    )
                }
            )
        )
    }

    /// Saves a placement the user worked out in the georeferencer, and says
    /// whether the device took it. The georeferencer is holding the only other
    /// copy of those points and deletes it on a `true`.
    @discardableResult
    func place(
        id: String, controlPoints: [SessionControlPoint], method: GeoreferenceMethod
    ) async -> Bool {
        guard !isLibrarySealed else { return false }
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return false }
        // Points that actually moved mark the record as the user's work, so
        // switching to another frame later asks before replacing it. Compared
        // rather than assumed: the georeferencer saves on a close as well as on
        // an edit, and a record marked adjusted by merely being opened would
        // put a warning in front of a user who changed nothing.
        if case .controlPoints(let existing, _) = rows[index].record.placement,
           existing != controlPoints {
            rows[index].record.pdf = rows[index].record.pdf?.markingAdjusted()
        }
        rows[index].record.placement = .controlPoints(controlPoints, method: method)
        return await save(rows[index].record.name, at: id)
    }

    func delete(id: String) async {
        guard !isLibrarySealed else { return }
        writes += 1
        let named = rows.first(where: { $0.id == id })?.record.name ?? "This map"
        let remaining: [UserMapRecord]
        do {
            remaining = try await store.delete(id: id, from: rows.map(\.record))
        } catch is UserMapStore.StoreRefusal {
            // The same sealing every other write path performs: a library this
            // build must not write to refuses deletes too, and the panel has
            // to say so rather than leave a Delete button that does nothing.
            isLibrarySealed = true
            notices.append(
                Notice(id: id, name: named, message: sealedMessage, isRefusal: true)
            )
            return
        } catch {
            // A failed delete looks identical to an unresponsive button
            // without this. The file's own principle — an import that failed
            // silently reads as a file that vanished — applies symmetrically.
            notices.append(
                Notice(
                    id: id,
                    name: named,
                    message: """
                        This map could not be deleted from your library. \
                        Nothing was changed; try again.
                        """,
                    isRefusal: true
                )
            )
            return
        }
        let kept = Set(remaining.map(\.id))
        rows.removeAll { !kept.contains($0.id) }
        saved = remaining
        rememberDisplay()
        // The placement the user was part way through is theirs too, and it
        // outlives the library row that named it: a points file keyed by an id
        // no map has any more is unreachable ground truth about somewhere the
        // user has been, kept forever. Deleting a map deletes it.
        drafts.discard(identifier: id)
    }

    /// What the map should be drawing, in panel order.
    ///
    /// A hidden row is left out entirely rather than passed at zero alpha. A
    /// user's scan is already decoded and resident; an invisible overlay would
    /// still be walked and clipped on every draw for no pixels at all.
    ///
    /// Values, not overlays: the map state is diffed before anything is
    /// rebuilt, and building an overlay here would mean solving a mesh on
    /// every read of this property.
    var drapes: [UserMapDrape] {
        rows.compactMap { row in
            guard row.isVisible, let preview = row.preview else { return nil }
            return UserMapDrape(record: row.record, image: preview, alpha: row.opacity)
        }
    }
}
