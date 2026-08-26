import CoreGraphics
import GeoCore
import MapKit
import SwiftUI
import UniformTypeIdentifiers

/// Placing a scan on the map by hand: tap a feature on the sheet, tap the same
/// feature on the map, repeat — then drag either half of a pair until the sheet
/// sits where the ground says it should.
///
/// The scan and the map are stacked rather than side by side. On a phone there
/// is no width for two panes, and the pair of taps is a sequence anyway — the
/// panel says which half it is waiting for. The map draws the placement as it
/// currently stands, so a drag is judged against the ground rather than against
/// a number.
struct GeoreferenceView: View {
    /// The record's own id, which is what the exported annotation names.
    ///
    /// Not the name: two scans can be called `survey.png`, and an annotation
    /// that gives them the same target says they are one document placed twice.
    let identifier: String
    let name: String
    let preview: CGImage?
    let pixelSize: PixelSize
    /// Called with the points and method the user settled on. Not called on
    /// cancel: a session abandoned half-placed must not overwrite a placement
    /// that already worked.
    /// Saves the placement and says whether the device kept it. The draft
    /// below is the only other copy of these points, so it is discarded on
    /// a `true` and on nothing else.
    let onSave: ([SessionControlPoint], GeoreferenceMethod) async -> Bool

    @Environment(\.dismiss) private var dismiss
    /// The app's tile cache, fetcher and licence clearance, lent so this pane
    /// can draw official layers without a second route to them.
    @Environment(\.georeferenceReferences) private var referenceServices
    @State private var session: GeoreferenceSession
    @State private var share: SharePayload?
    @State private var exportFailure: String?
    @State private var region: MKCoordinateRegion
    @State private var showsPoints = false
    /// How much of the ground shows through the sheet being placed.
    ///
    /// Starts where the fixed value used to be, so nothing moves for a reader
    /// who never touches it. The web's slider runs 0 to 100 in fives, and a
    /// dense scan can hide the shoreline it is being lined up against, which is
    /// the whole reason the control exists.
    @State private var draftOpacity: Double = 0.7
    @State private var sort = GcpListPresentation.Sort(key: .index)
    @State private var showsPointsImporter = false
    /// Which official layers are drawn under the scan. Off to start, like the
    /// browser: a sheet opened over imagery it was not meant to be compared
    /// against costs a wait for tiles and hides the base map's labels.
    @State private var references: Set<GeoreferenceReference> = []
    /// The pane's current zoom, so the panel can say when a layer is on but the
    /// map is too far out for it to draw anything.
    @State private var paneZoom: Double = 0
    /// Whether the opening state has been copied from the main map. Once only:
    /// after that the reader owns these switches, and re-seeding would turn a
    /// layer they just switched off back on.
    @State private var seededReferences = false
    /// What the last points file did, said out loud.
    ///
    /// A failure has to be readable, and so does a success: an import replaces
    /// every point that was there, and a reader who is not told how many were
    /// swapped has no way to know whether to undo.
    @State private var importMessage: ImportMessage?
    /// The names the held-out checks arrived with, in the order the session
    /// holds them. A check is stored as ground and pixels alone, and for a
    /// graticule file those names are the intersections — so they are kept
    /// here rather than lost the moment a file is read.
    @State private var checkLabels: [String] = []
    private let drafts = GeoreferenceDraftStore()
    /// Points found on disk that the stored placement does not have. Offered,
    /// never applied on its own: a draft is what the user was in the middle of
    /// when something interrupted them, and replacing a saved placement with
    /// it without asking would be the same data loss in the other direction.
    @State private var restorable: GeoreferenceDraftStore.Draft?

    /// The device would not take the placement. Said here rather than only in
    /// the panel behind this sheet, which the reader cannot see.
    @State private var couldNotSave = false

    /// A save is in flight. The points it took are a snapshot, and a point
    /// moved while the write is out would be discarded along with the draft
    /// the moment the older snapshot lands. The sheet is held still instead.
    @State private var isSaving = false

    private struct ImportMessage: Equatable {
        var succeeded: Bool
        var text: String
    }

    // The scan's own pan and zoom. A sheet fitted to a phone-height pane is
    // thousands of raster pixels to the point, so a control placed on it could
    // not be aimed and could not be corrected.
    @State private var scanScale: Double = 1
    @State private var scanOffset = CGSize.zero
    /// What the scan settled at when the last gesture let go. A live gesture
    /// reports its change relative to its own start, so the committed value is
    /// what it has to be applied to.
    @State private var scanScaleCommitted: Double = 1
    @State private var scanOffsetCommitted = CGSize.zero
    /// Where a two-finger pan first reported. Subtracted from every later
    /// report so the sheet does not jump by the gesture's own recognition
    /// distance the moment it starts.
    @State private var scanPanAnchor: CGSize?
    /// Which marker a finger is on, and whether it has moved far enough to be a
    /// drag rather than a tap. A tap on a marker must not open an undo step.
    @State private var scanDragID: String?
    @State private var scanDragBegan = false
    @State private var mapFocus: (point: GeoPoint, request: PaneFocusRequest)?
    @State private var focusRequests = 0
    @State private var scanFocus: ScanFocus?

    /// A request to bring one raster pixel to the middle of the scan pane.
    /// Numbered, so asking twice for the same point still moves the pane.
    private struct ScanFocus: Equatable {
        var pixel: PixelPoint
        var requestID: Int
        /// How close the pane must be after the move.
        ///
        /// Looking up a placed point is an inspection and goes in close.
        /// Pointing at where a ground tap probably falls is a hint, and pulling
        /// the reader in to 4x would take away the surroundings they recognise
        /// the feature by — so that one recentres at whatever scale they chose.
        var minimumScale: Double = 4
    }

    private static let scanDragThreshold: Double = 3

    init(
        identifier: String,
        name: String,
        preview: CGImage?,
        pixelSize: PixelSize,
        controlPoints: [SessionControlPoint] = [],
        method: GeoreferenceMethod = .affine,
        /// The ground the reader was already on. Taken here rather than copied
        /// in `onAppear` like the reference switches, because the map pane is
        /// built before that runs: seeded late, the first frame is the whole
        /// province and the pane visibly jumps.
        openingRegion: MKCoordinateRegion? = nil,
        onSave: @escaping ([SessionControlPoint], GeoreferenceMethod) async -> Bool
    ) {
        self.identifier = identifier
        self.name = name
        self.preview = preview
        self.pixelSize = pixelSize
        self.onSave = onSave
        _session = State(
            initialValue: GeoreferenceSession(
                controlPoints: controlPoints, pixelSize: pixelSize, method: method
            )
        )
        _region = State(initialValue: openingRegion ?? Self.provinceWide)
    }

    /// The whole province, for a pane with nowhere better to start.
    private static let provinceWide = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 45.0, longitude: -63.0),
        span: MKCoordinateSpan(latitudeDelta: 4, longitudeDelta: 5)
    )

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                scanPane
                Divider()
                mapPane
                controls
            }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        Task {
                            // Awaited, then checked. The draft is the only copy
                            // of these points until the library has them, and
                            // discarding it on the strength of having asked
                            // threw away an hour's placement whenever the
                            // write came back refused.
                            let saved = await onSave(
                                session.controlPoints, session.method
                            )
                            isSaving = false
                            guard saved else {
                                couldNotSave = true
                                return
                            }
                            drafts.discard(identifier: identifier)
                            dismiss()
                        }
                    }
                    // Saving fewer points than a solver needs would store a
                    // placement that cannot draw, and the row would come back
                    // saying it still needs placing — with the user's work in
                    // it, invisibly.
                    .disabled(session.mesh == nil || isSaving)
                }
            }
            .alert(
                "This placement could not be saved.",
                isPresented: $couldNotSave
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                // No cause named. The write can be refused for a library this
                // build must not touch, for a disk with nothing left on it, or
                // for a container the phone has locked, and this sheet is told
                // none of them apart. Guessing "free some space" at a user
                // whose disk is fine sends them off to delete photographs.
                Text("Your points are still here, so you can try again.")
            }
            .sheet(item: $share) { payload in
                ShareSheet(items: payload.items)
            }
            .sheet(isPresented: $showsPoints) { pointsSheet }
            .onChange(of: session.pending) { _, _ in
                focusScanOnPendingGround()
            }
            .onAppear {
                seedReferences()
                guard let draft = drafts.draft(identifier: identifier),
                      draft.controls != session.controlPoints
                else { return }
                restorable = draft
            }
            // Both, because the two say different things. Points changing is
            // every placement, deletion and undo; the drag flag going false is
            // the end of a drag, whose last move already changed the points
            // and would otherwise be the one position never written.
            .onChange(of: session.controlPoints) { _, _ in saveDraft() }
            .onChange(of: session.isDragging) { _, _ in saveDraft() }
            .fileImporter(
                isPresented: $showsPointsImporter,
                // Both types, because a `.csv` handed over by Files sometimes
                // arrives typed as plain text and a picker that will not offer
                // it reads as the file being unsupported.
                allowedContentTypes: [.commaSeparatedText, .plainText]
            ) { result in
                switch result {
                case .success(let url): loadPoints(from: url)
                case .failure:
                    importMessage = ImportMessage(
                        succeeded: false, text: "That file could not be opened."
                    )
                }
            }
        }
    }

    /// Writes the placement as a IIIF Georeference Annotation and hands it to
    /// the share sheet.
    ///
    /// The points the user is looking at, not a stored copy: on this surface
    /// the session is the state, so there is no window in which the button is
    /// offering an older placement than the one on screen.
    ///
    /// A local scan has no public IIIF address, so the annotation names it by a
    /// urn placeholder. That is a document another tool can read the placement
    /// out of — it is not a published map, and it does not become one by being
    /// exported.
    private func exportAnnotation() {
        exportFailure = nil
        do {
            let data = try GeoreferenceAnnotation.data(
                controlPoints: session.controlPoints,
                method: session.method,
                pixelSize: pixelSize,
                target: "urn:ns-marks-the-spot:\(identifier)"
            )
            // The record's id in the directory, its name on the file. Two
            // scans called `survey` wrote the same path, and the second export
            // replaced the first annotation while the share sheet for it was
            // still open.
            let directory = FileManager.default.temporaryDirectory
                .appending(path: "georef-\(identifier)")
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true
            )
            let url = directory.appending(path: "\(name).georef.json")
            try data.write(to: url, options: .atomic)
            share = SharePayload(url: url)
        } catch {
            exportFailure = "The georeference could not be written to this device."
        }
    }

    /// Writes the working points to the container, unless a finger is down.
    ///
    /// Skipped mid-drag because a drag reports every frame, and a file written
    /// sixty times a second buys nothing over the one written when the finger
    /// lifts.
    private func saveDraft() {
        guard !session.isDragging else { return }
        drafts.write(
            identifier: identifier,
            name: name,
            controls: session.controlPoints,
            checks: session.checks,
            checkLabels: checkLabels
        )
    }

    /// Puts the draft on the sheet. One undo takes it back off again, because
    /// `replaceAll` opens an undo step like any other edit.
    private func restore(_ draft: GeoreferenceDraftStore.Draft) {
        session.replaceAll(with: draft.controls, checks: draft.checks)
        checkLabels = draft.checkLabels
        restorable = nil
    }

    /// Reads a Fletcher points file and puts its control points on the sheet.
    ///
    /// The record's own pixel size goes in with it, so a file measured against
    /// a different scan of the same sheet is refused here rather than placing
    /// every pin somewhere plausible and wrong.
    private func loadPoints(from url: URL) {
        let name = url.lastPathComponent
        // A file picked from Files is outside the app's container, and reading
        // it without this returns nothing.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let text: String
        do {
            text = try String(contentsOf: url, encoding: .utf8)
        } catch {
            importMessage = ImportMessage(
                succeeded: false, text: "Could not read \(name)."
            )
            return
        }

        do {
            let parsed = try FletcherGcpFile.parse(text, pixelSize: pixelSize)
            let replaced = session.controlPoints.count
            session.replaceAll(with: parsed.controls, checks: parsed.checks)
            checkLabels = parsed.rows.filter { $0.role == .check }.map(\.id)
            // Checks are counted and not placed. They are the points the fit is
            // scored against, so promoting one would make the accuracy figure
            // circular — saying so is what stops the missing pins reading as
            // points the app dropped.
            let held = parsed.checks.isEmpty
                ? ""
                : " \(parsed.checks.count) check points were left out on purpose."
            let over = replaced == 0 ? "" : ", replacing \(replaced) — Undo puts them back"
            importMessage = ImportMessage(
                succeeded: true,
                text: "Loaded \(parsed.controls.count) control points from \(name)\(over).\(held)"
            )
        } catch {
            importMessage = ImportMessage(succeeded: false, text: error.message)
        }
    }

    /// Writes the session as a points file and hands it to the share sheet.
    ///
    /// The same format the import reads, at full precision, so the file is a
    /// restore point rather than a rounded picture of one. Checks are written
    /// with their own role and stay out of any later fit, which is what makes
    /// this a complete record of the session instead of half of it.
    private func exportPoints() {
        exportFailure = nil
        let now = Date()
        do {
            let text = FletcherGcpFile.snapshot(
                name: name,
                controls: session.controlPoints,
                checks: session.checks,
                checkLabels: checkLabels,
                at: now
            )
            let directory = FileManager.default.temporaryDirectory
                .appending(path: "georef-\(identifier)")
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true
            )
            let url = directory.appending(
                path: FletcherGcpFile.snapshotFileName(for: name, at: now)
            )
            try Data(text.utf8).write(to: url, options: .atomic)
            share = SharePayload(url: url)
        } catch {
            exportFailure = "The points could not be written to this device."
        }
    }

    // MARK: - The scan

    private var scanPane: some View {
        GeometryReader { geometry in
            let pane = ScanGeometry.PaneRect(
                x: 0, y: 0,
                width: geometry.size.width, height: geometry.size.height
            )
            // One rectangle answers for the tap, the markers and the drags
            // together. A zoom applied to the picture but not to the maths
            // would place every point somewhere the user did not touch, while
            // the panel, the residuals and the drape all agreed on the wrong
            // answer.
            let fitted = ScanGeometry.fitted(pixelSize, in: pane).flatMap {
                ScanGeometry.zoomed(
                    $0, in: pane, scale: scanScale,
                    offset: (x: scanOffset.width, y: scanOffset.height)
                )
            }
            ZStack(alignment: .topLeading) {
                Color(.secondarySystemBackground)
                if let preview, let fitted {
                    Image(decorative: preview, scale: 1)
                        .resizable()
                        .frame(width: fitted.width, height: fitted.height)
                        .offset(x: fitted.x, y: fitted.y)
                        .clipped()
                    ForEach(session.controlPoints) { point in
                        if let at = ScanGeometry.point(
                            for: point.pixel, pixelSize: pixelSize, fitted: fitted
                        ) {
                            marker(label: number(of: point))
                                .position(x: at.x, y: at.y)
                                .gesture(scanDrag(for: point, fitted: fitted))
                        }
                    }
                    if case .scan(let pixel) = session.pending,
                       let at = ScanGeometry.point(
                           for: pixel, pixelSize: pixelSize, fitted: fitted
                       ) {
                        marker(label: "?", isPending: true).position(x: at.x, y: at.y)
                    }
                } else {
                    // The row exists and its pixels do not. Said plainly, so
                    // it does not read as a sheet that failed to place.
                    Text("This map's preview could not be read.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .contentShape(Rectangle())
            .gesture(scanPanAndZoom)
            .onTapGesture { location in
                guard let fitted,
                      let pixel = ScanGeometry.pixel(
                          at: (x: location.x, y: location.y),
                          pixelSize: pixelSize, fitted: fitted
                      )
                else { return }
                session.pickScanPoint(x: pixel.x, y: pixel.y)
            }
            .clipped()
            .onChange(of: scanFocus) { _, focus in
                // Only the pane knows how big it is, so the request is held as
                // a value it watches rather than acted on where it is made.
                guard let focus,
                      let base = ScanGeometry.fitted(pixelSize, in: pane),
                      let offset = ScanGeometry.offsetCentring(
                          focus.pixel, pixelSize: pixelSize, fitted: base, in: pane,
                          // Zoom in only, never back out: a user who has moved
                          // closer to check a point must not be pulled away
                          // from what they are looking at.
                          scale: max(scanScale, focus.minimumScale)
                      )
                else { return }
                scanScale = max(scanScale, focus.minimumScale)
                scanScaleCommitted = scanScale
                scanOffset = CGSize(width: offset.x, height: offset.y)
                scanOffsetCommitted = scanOffset
            }
        }
    }

    /// Pan and pinch on the sheet itself.
    private var scanPanAndZoom: some Gesture {
        SimultaneousGesture(
            MagnifyGesture()
                .onChanged { value in
                    scanScale = min(max(scanScaleCommitted * value.magnification, 1), 40)
                }
                .onEnded { _ in scanScaleCommitted = scanScale },
            // Far enough not to swallow a tap, which is how points are placed.
            // The first report is remembered and subtracted, so crossing that
            // distance moves the sheet by nothing rather than by all of it.
            DragGesture(minimumDistance: 12)
                .onChanged { value in
                    let anchor = scanPanAnchor ?? value.translation
                    if scanPanAnchor == nil { scanPanAnchor = anchor }
                    scanOffset = CGSize(
                        width: scanOffsetCommitted.width + value.translation.width - anchor.width,
                        height: scanOffsetCommitted.height + value.translation.height
                            - anchor.height
                    )
                }
                .onEnded { _ in
                    scanOffsetCommitted = scanOffset
                    scanPanAnchor = nil
                }
        )
    }

    /// Moving one control point on the sheet.
    ///
    /// The undo step opens on the first move past a few points, not on touch
    /// down: a tap that happened to land on a marker would otherwise fill the
    /// history with steps that changed nothing, and the user's real last edit
    /// would fall off the end of it.
    private func scanDrag(
        for point: SessionControlPoint, fitted: ScanGeometry.PaneRect
    ) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let travelled = max(
                    abs(value.translation.width), abs(value.translation.height)
                )
                if !scanDragBegan {
                    guard travelled >= Self.scanDragThreshold else { return }
                    scanDragBegan = true
                    scanDragID = point.id
                    session.beginDrag(point.id)
                }
                guard scanDragID == point.id,
                      let pixel = ScanGeometry.pixel(
                          at: (x: value.location.x, y: value.location.y),
                          pixelSize: pixelSize, fitted: fitted
                      )
                else { return }
                session.moveOnScan(point.id, x: pixel.x, y: pixel.y)
            }
            .onEnded { _ in
                // The real end of the touch. A drag released without a final
                // move would otherwise leave the sheet on the coarse lattice
                // for the rest of the session.
                if scanDragBegan, scanDragID == point.id { session.endDrag() }
                scanDragBegan = false
                scanDragID = nil
            }
    }

    /// Whether the provincial layers may be drawn at all.
    ///
    /// Read on every pass rather than captured, so a clearance revoked while
    /// this sheet is open takes the switches with it. Acceptance itself is not
    /// offered here: it belongs to the licence sheet on the main map, and a
    /// second place to agree would be a second record of what was agreed to.
    private var referenceLayersLocked: Bool {
        referenceServices?.allowsRestrictedLayers != true
    }

    /// The official evidence a scan can be lined up against.
    ///
    /// Buttons rather than switch rows: two labelled switches would take a
    /// third of a phone panel that already has to hold the status, the fit and
    /// the point list.
    @ViewBuilder
    private var referenceLayerControls: some View {
        VStack(alignment: .leading, spacing: 4) {
            // The caption above the buttons rather than beside them, as the
            // browser's fieldset legend sits above its checkboxes. On one line
            // a 402-point phone truncated the second button to "Property
            // bound...", and which boundaries a reader is switching on is the
            // half that got cut.
            Text("Reference layers")
                .font(.footnote)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                ForEach(GeoreferenceReference.allCases) { reference in
                    Toggle(reference.title, isOn: binding(for: reference))
                        .toggleStyle(.button)
                        .font(.footnote)
                        .accessibilityIdentifier("georeference-reference-\(reference.id)")
                }

                Spacer(minLength: 0)
            }
            .disabled(referenceLayersLocked)

            if referenceLayersLocked {
                // The browser's sentence. It says where to go rather than
                // offering a shortcut, because accepting a licence next to the
                // layer it unlocks is agreeing to terms nobody has read.
                Text("Close this panel and accept the provincial data licence to use these.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("georeference-references-locked")
            } else {
                ForEach(tooFarOut, id: \.id) { reference in
                    // Said out loud, because the alternative is a switch that
                    // reads "on" over empty ground. A reader lining a scan up
                    // against nothing would take the blank for the register
                    // having no parcels here.
                    Label(
                        "\(reference.title): zoom in to see them.",
                        systemImage: "arrow.up.left.and.arrow.down.right"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("georeference-reference-too-far-out")
                }
            }

            // The sources' own words, beside the map they cover. This pane is
            // a map of its own behind a sheet: the strip under the main map is
            // not on screen and does not describe what is drawn here, and an
            // obligation to attribute follows the pixels. Outside the licence
            // branch, because the OpenStreetMap ground draws — and owes its
            // credit — whether or not the provincial layers are unlocked.
            ForEach(credits) { credit in
                VStack(alignment: .leading, spacing: 1) {
                    Text(credit.copyright ?? credit.provider)
                    Text(credit.disclaimer)
                    if let title = credit.licenseTitle, let url = credit.licenseURL {
                        Link(title, destination: url)
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("georeference-reference-credit")
            }
        }
    }

    /// The layers switched on that this map is too far out to draw.
    private var tooFarOut: [GeoreferenceReference] {
        guard let referenceServices, paneZoom > 0 else { return [] }
        return GeoreferenceReference.allCases.filter {
            references.contains($0)
                && paneZoom < Double(referenceServices.minimumZoom(for: $0) ?? 0)
        }
    }

    /// Brings the scan to where the ground point just tapped should fall, when
    /// the points placed so far can say. The browser moves its scan pane on the
    /// same answer.
    private func focusScanOnPendingGround() {
        guard let pixel = session.pendingGroundOnScan else { return }
        focusRequests += 1
        scanFocus = ScanFocus(
            pixel: pixel,
            requestID: focusRequests,
            // A hint, not an inspection: recentre, and leave the zoom alone.
            minimumScale: scanScale
        )
    }

    /// What the ground and the layers currently drawn here oblige this panel
    /// to say. The pane draws its OpenStreetMap ground with or without an app
    /// container behind it, so a preview owes the credit as much as the app.
    private var credits: [ActiveAttribution.Credit] {
        referenceServices?.credits(for: references)
            ?? ActiveAttribution.credits(for: [], baseMap: .openStreetMap)
    }

    /// Copies the main map's reference layers, once, when the sheet opens.
    private func seedReferences() {
        guard !seededReferences, let referenceServices else { return }
        seededReferences = true
        references = referenceServices.activeOnTheMainMap
    }

    /// A switch that cannot turn a layer on while the licence is unanswered.
    ///
    /// The guard is on the write, not only on `disabled`: an accessibility
    /// action or a state restored from a draft would otherwise install an
    /// overlay the user never cleared.
    private func binding(for reference: GeoreferenceReference) -> Binding<Bool> {
        Binding(
            get: { references.contains(reference) },
            set: { isOn in
                guard isOn, !referenceLayersLocked else {
                    references.remove(reference)
                    return
                }
                references.insert(reference)
            }
        )
    }

    // MARK: - The map

    private var mapPane: some View {
        GeoreferenceMapPane(
            region: $region,
            points: session.controlPoints,
            pending: session.pending,
            draft: draft,
            draftOpacity: draftOpacity,
            // Locked means none, whatever the switches last said. A licence
            // withdrawn while this sheet is open takes the imagery off this map
            // as well as off the one behind it.
            references: referenceLayersLocked ? [] : references,
            referenceServices: referenceServices,
            focus: mapFocus,
            onTap: { coordinate in
                session.pickMapPoint(lat: coordinate.latitude, lng: coordinate.longitude)
            },
            onDragBegin: { session.beginDrag($0) },
            onMove: { id, coordinate in
                session.moveOnMap(id, lat: coordinate.latitude, lng: coordinate.longitude)
            },
            onDragEnd: { _ in session.endDrag() },
            onZoomChange: { paneZoom = $0 }
        )
    }

    /// The placement as it stands, or nothing when the points cannot place the
    /// sheet — which is the honest picture, rather than the last one that
    /// worked left on screen under points that no longer support it.
    private var draft: GeoreferenceDraft? {
        guard let preview, let mesh = session.mesh else { return nil }
        return GeoreferenceDraft(
            mesh: mesh,
            gridSize: session.meshGridSize,
            pixelSize: pixelSize,
            sourceRect: session.sourceRect,
            image: preview
        )
    }

    // MARK: - The panel

    private var controls: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let restorable {
                restoreBanner(restorable)
            }

            Text(session.status.message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Measured at points the fit never saw, which is why it is stated
            // apart from the status line above rather than folded into it.
            // The status figure is how well the transform hits the pins it was
            // built from; this is how far off the sheet is somewhere else.
            if let heldOut = session.heldOut {
                Text(heldOut.message)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("georeference-held-out")
            }

            HStack {
                Text("Map opacity")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Slider(value: $draftOpacity, in: 0...1, step: 0.05)
                    .accessibilityLabel("Map opacity")
                    .accessibilityValue("\(Int((draftOpacity * 100).rounded())) percent")
                    .accessibilityIdentifier("georeference-opacity")
            }

            if referenceServices != nil {
                referenceLayerControls
            }

            HStack {
                Picker("Fit", selection: $session.method) {
                    Text("Straight").tag(GeoreferenceMethod.affine)
                    Text("Warped").tag(GeoreferenceMethod.spline)
                }
                .pickerStyle(.segmented)

                Button("Undo") { session.undo() }
                    .disabled(!session.canUndo)
            }

            HStack {
                if !session.controlPoints.isEmpty {
                    Button {
                        showsPoints = true
                    } label: {
                        Label(
                            "Points (\(session.controlPoints.count))",
                            systemImage: "list.bullet"
                        )
                        .font(.footnote)
                    }
                    .accessibilityIdentifier("georeference-points")
                }

                Button {
                    showsPointsImporter = true
                } label: {
                    Label("Load points", systemImage: "square.and.arrow.down")
                        .font(.footnote)
                }
                .accessibilityIdentifier("georeference-load-points")

                if session.pending != nil {
                    Button("Cancel this point") { session.cancelPending() }
                        .font(.footnote)
                }

                Spacer()

                // A menu rather than two more buttons: six controls on one
                // row do not fit a phone, and these two are the pair a reader
                // chooses between rather than uses together.
                if !session.controlPoints.isEmpty {
                    Menu {
                        Button {
                            exportPoints()
                        } label: {
                            Label("Points file", systemImage: "tablecells")
                        }
                        .accessibilityIdentifier("export-points")

                        // The same bar Save uses: a solved placement.
                        // Counting points instead would export three
                        // collinear or coincident ones — a fit this app
                        // refuses to draw, handed to another tool as though
                        // it were a placement. Absent rather than disabled: a
                        // disabled control advertises something the user
                        // cannot have and explains nothing about why.
                        if session.mesh != nil {
                            Button {
                                exportAnnotation()
                            } label: {
                                Label("Georeference", systemImage: "mappin.and.ellipse")
                            }
                            .accessibilityIdentifier("export-georeference")
                        }
                    } label: {
                        Label("Export", systemImage: "square.and.arrow.up")
                            .font(.footnote)
                    }
                    .accessibilityIdentifier("georeference-export")
                }
            }

            if let exportFailure {
                Text(exportFailure)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let importMessage {
                Text(importMessage.text)
                    .font(.caption)
                    .foregroundStyle(importMessage.succeeded ? Color.secondary : Color.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("georeference-import-message")
            }
        }
        .padding()
        .background(.bar)
    }

    /// Says what was found and how much of it, then gets out of the way.
    ///
    /// A count and a time, because that is what tells a reader whether the
    /// draft is the afternoon they lost or a stale copy of something they
    /// already redid. Discard is offered next to it so the offer can be made
    /// to stop coming back.
    private func restoreBanner(_ draft: GeoreferenceDraftStore.Draft) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(
                """
                \(draft.controls.count) unsaved point\(draft.controls.count == 1 ? "" : "s") \
                from \(draft.savedAt.formatted(date: .abbreviated, time: .shortened)).
                """
            )
            .font(.footnote)
            .fixedSize(horizontal: false, vertical: true)

            Spacer()

            Button("Restore") { restore(draft) }
                .font(.footnote)
                .accessibilityIdentifier("georeference-restore-draft")

            Button("Discard") {
                drafts.discard(identifier: identifier)
                restorable = nil
            }
            .font(.footnote)
            .accessibilityIdentifier("georeference-discard-draft")
        }
        .padding(8)
        .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }

    private var pointsSheet: some View {
        NavigationStack {
            GcpDiagnosticsList(
                rows: GcpListPresentation.rows(
                    session.controlPoints, report: session.report, sort: sort
                ),
                column: GcpListPresentation.residualColumn(for: session.method),
                sort: $sort,
                onZoomTo: { row in
                    // Both panes at once. The point of looking at a row is
                    // comparing the two halves of the pair, and a user sent to
                    // one of them would have to find the other by hand.
                    focusRequests += 1
                    scanFocus = ScanFocus(pixel: row.point.pixel, requestID: focusRequests)
                    mapFocus = (
                        point: row.point.map, request: PaneFocusRequest(requestID: focusRequests)
                    )
                    showsPoints = false
                },
                onDelete: { session.delete($0) }
            )
            .navigationTitle("Control points")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showsPoints = false }
                }
            }
        }
    }

    private func marker(label: String, isPending: Bool = false) -> some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(isPending ? Color.orange : Color.accentColor, in: Circle())
            .overlay(Circle().stroke(.white, lineWidth: 1))
            // A touch target the size of a fingertip, without a disc that
            // covers the feature it is pinned to.
            .contentShape(Circle().inset(by: -8))
    }

    /// The point's position in the list, which is what its marker says. The
    /// session mints ids of its own and they are not numbers a user should
    /// ever see.
    private func number(of point: SessionControlPoint) -> String {
        guard let index = session.controlPoints.firstIndex(where: { $0.id == point.id })
        else { return "?" }
        return "\(index + 1)"
    }
}
