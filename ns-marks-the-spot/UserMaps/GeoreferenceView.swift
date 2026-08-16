import CoreGraphics
import GeoCore
import MapKit
import SwiftUI

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
    let onSave: ([SessionControlPoint], GeoreferenceMethod) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var session: GeoreferenceSession
    @State private var share: SharePayload?
    @State private var exportFailure: String?
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 45.0, longitude: -63.0),
        span: MKCoordinateSpan(latitudeDelta: 4, longitudeDelta: 5)
    )
    @State private var showsPoints = false
    @State private var sort = GcpListPresentation.Sort(key: .index)

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
    }

    private static let scanDragThreshold: Double = 3

    init(
        identifier: String,
        name: String,
        preview: CGImage?,
        pixelSize: PixelSize,
        controlPoints: [SessionControlPoint] = [],
        method: GeoreferenceMethod = .affine,
        onSave: @escaping ([SessionControlPoint], GeoreferenceMethod) -> Void
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
    }

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
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(session.controlPoints, session.method)
                        dismiss()
                    }
                    // Saving fewer points than a solver needs would store a
                    // placement that cannot draw, and the row would come back
                    // saying it still needs placing — with the user's work in
                    // it, invisibly.
                    .disabled(session.mesh == nil)
                }
            }
            .sheet(item: $share) { payload in
                ShareSheet(items: payload.items)
            }
            .sheet(isPresented: $showsPoints) { pointsSheet }
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
                          scale: max(scanScale, 4)
                      )
                else { return }
                scanScale = max(scanScale, 4)
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

    // MARK: - The map

    private var mapPane: some View {
        GeoreferenceMapPane(
            region: $region,
            points: session.controlPoints,
            pending: session.pending,
            draft: draft,
            focus: mapFocus,
            onTap: { coordinate in
                session.pickMapPoint(lat: coordinate.latitude, lng: coordinate.longitude)
            },
            onDragBegin: { session.beginDrag($0) },
            onMove: { id, coordinate in
                session.moveOnMap(id, lat: coordinate.latitude, lng: coordinate.longitude)
            },
            onDragEnd: { _ in session.endDrag() }
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
            Text(session.status.message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

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

                if session.pending != nil {
                    Button("Cancel this point") { session.cancelPending() }
                        .font(.footnote)
                }

                Spacer()

                // The same bar Save uses: a solved placement. Counting points
                // instead would export three collinear or coincident ones — a
                // fit this app refuses to draw, handed to another tool as
                // though it were a placement. Absent rather than disabled — a
                // disabled control advertises something the user cannot have
                // and explains nothing about why.
                if session.mesh != nil {
                    Button {
                        exportAnnotation()
                    } label: {
                        Label("Export georeference", systemImage: "square.and.arrow.up")
                            .font(.footnote)
                    }
                    .accessibilityIdentifier("export-georeference")
                }
            }

            if let exportFailure {
                Text(exportFailure)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding()
        .background(.bar)
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
