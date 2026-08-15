import CoreGraphics
import GeoCore
import MapKit
import SwiftUI

/// Placing a scan on the map by hand: tap a feature on the sheet, tap the same
/// feature on the map, repeat.
///
/// The scan and the map are stacked rather than side by side. On a phone there
/// is no width for two panes, and the pair of taps is a sequence anyway — the
/// panel says which half it is waiting for.
struct GeoreferenceView: View {
    let name: String
    let preview: CGImage?
    let pixelSize: PixelSize
    /// Called with the points and method the user settled on. Not called on
    /// cancel: a session abandoned half-placed must not overwrite a placement
    /// that already worked.
    let onSave: ([SessionControlPoint], GeoreferenceMethod) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var session: GeoreferenceSession
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 45.0, longitude: -63.0),
        span: MKCoordinateSpan(latitudeDelta: 4, longitudeDelta: 5)
    )

    init(
        name: String,
        preview: CGImage?,
        pixelSize: PixelSize,
        controlPoints: [SessionControlPoint] = [],
        method: GeoreferenceMethod = .affine,
        onSave: @escaping ([SessionControlPoint], GeoreferenceMethod) -> Void
    ) {
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
        }
    }

    private var scanPane: some View {
        GeometryReader { geometry in
            let pane = ScanGeometry.PaneRect(
                x: 0, y: 0,
                width: geometry.size.width, height: geometry.size.height
            )
            let fitted = ScanGeometry.fitted(pixelSize, in: pane)
            ZStack(alignment: .topLeading) {
                Color(.secondarySystemBackground)
                if let preview, let fitted {
                    Image(decorative: preview, scale: 1)
                        .resizable()
                        .frame(width: fitted.width, height: fitted.height)
                        .offset(x: fitted.x, y: fitted.y)
                    ForEach(session.controlPoints) { point in
                        if let at = ScanGeometry.point(
                            for: point.pixel, pixelSize: pixelSize, fitted: fitted
                        ) {
                            marker(label: number(of: point))
                                .position(x: at.x, y: at.y)
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
            .onTapGesture { location in
                guard let fitted,
                      let pixel = ScanGeometry.pixel(
                          at: (x: location.x, y: location.y),
                          pixelSize: pixelSize, fitted: fitted
                      )
                else { return }
                session.pickScanPoint(x: pixel.x, y: pixel.y)
            }
        }
    }

    private var mapPane: some View {
        GeoreferenceMapPane(region: $region) { coordinate in
            session.pickMapPoint(lat: coordinate.latitude, lng: coordinate.longitude)
        }
    }

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

            if !session.controlPoints.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(session.controlPoints) { point in
                            Button {
                                session.delete(point.id)
                            } label: {
                                Label(number(of: point), systemImage: "xmark.circle")
                                    .font(.caption)
                            }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Delete point \(number(of: point))")
                        }
                    }
                }
            }

            if session.pending != nil {
                Button("Cancel this point") { session.cancelPending() }
                    .font(.footnote)
            }
        }
        .padding()
        .background(.bar)
    }

    private func marker(label: String, isPending: Bool = false) -> some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .frame(width: 24, height: 24)
            .background(isPending ? Color.orange : Color.accentColor, in: Circle())
            .overlay(Circle().stroke(.white, lineWidth: 1))
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

/// A plain map for picking ground points.
///
/// Its own view rather than the app's map: this one carries no layers, no
/// parcels and no selection, because a tap here means one thing only, and a
/// tap that might instead have selected a parcel would place control points by
/// accident.
private struct GeoreferenceMapPane: UIViewRepresentable {
    @Binding var region: MKCoordinateRegion
    let onTap: (CLLocationCoordinate2D) -> Void

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.setRegion(region, animated: false)
        mapView.delegate = context.coordinator
        let tap = UITapGestureRecognizer(
            target: context.coordinator, action: #selector(Coordinator.handleTap(_:))
        )
        mapView.addGestureRecognizer(tap)
        context.coordinator.mapView = mapView
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.onTap = onTap
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var onTap: (CLLocationCoordinate2D) -> Void
        weak var mapView: MKMapView?

        init(onTap: @escaping (CLLocationCoordinate2D) -> Void) {
            self.onTap = onTap
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard let mapView else { return }
            let point = recognizer.location(in: mapView)
            onTap(mapView.convert(point, toCoordinateFrom: mapView))
        }
    }
}
