import GeoCore
import NSDataServices
import SwiftUI

/// What ground the page will cover, chosen on the map itself.
///
/// The paper is not the shape of the screen, so something has to decide which
/// part of the view becomes the page. Exporting the visible map and letting the
/// page grow to the paper's proportions — which is what this app did before —
/// silently adds ground on two sides and puts the thing the user was looking at
/// somewhere other than the middle. Here the frame is the page: what is inside
/// it prints, at the scale the readout states, and nothing else does.
///
/// Ported from `web/src/print/pdf/ExportFrameLayer.tsx`, and using the same
/// arithmetic in `PrintFrameGeometry`, so the same drag on either surface
/// exports the same ground.
struct PrintExportFrameView: View {
    let container: (width: Double, height: Double)
    let centre: GeoPoint
    let zoom: Double
    @Binding var state: PrintFrameGeometry.FrameState
    /// A credit the ground under the frame requires, or nil for a ground that
    /// carries its own. The attribution strip is hidden while a page is being
    /// framed, and on the OpenStreetMap base the tiles still drawing behind
    /// this frame must not be the one screen with no credit on it.
    var credit: String?
    let onCancel: () -> Void
    let onContinue: (GeoBoundingBox) -> Void

    /// The frame as it stood when the current drag began. A gesture reports its
    /// translation from where it started, so without this each report would be
    /// applied to a frame that has already moved by the last one.
    @State private var dragStart: PrintFrameGeometry.FrameState?

    private var template: PdfTemplate { PdfTemplate.template(state.orientation) }

    private var rect: PrintFrameGeometry.ScreenRect {
        PrintFrameGeometry.screenRect(
            container: container, aspect: template.mapFrameAspect, state: state
        )
    }

    private var fit: Double {
        PrintFrameGeometry.fittedHeight(
            container: container, aspect: template.mapFrameAspect
        )
    }

    private var scaleLabel: String {
        PrintScaleBar.build(
            bounds: bounds,
            mapFrame: template.mapFrame,
            maxWidthPoints: template.scaleBar.maxWidth
        ).denominatorLabel
    }

    /// A drag that has left the frame where it can actually sit.
    private func settle() {
        state = PrintFrameGeometry.clampedOffsets(
            state, container: container, aspect: template.mapFrameAspect
        )
        dragStart = nil
    }

    /// One step of the frame under VoiceOver, which has no drag to offer.
    private func nudge(dx: Double = 0, dy: Double = 0) {
        state.offsetX += dx
        state.offsetY += dy
        state = PrintFrameGeometry.clampedOffsets(
            state, container: container, aspect: template.mapFrameAspect
        )
    }

    private var bounds: GeoBoundingBox {
        PrintFrameGeometry.bounds(
            forFrame: rect, container: container, center: centre, zoom: zoom
        )
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // The ground that will not print, dimmed. Not hit-testable: the map
            // stays pannable and pinchable underneath, which is how the frame is
            // aimed at a place that is not currently on screen.
            dimming.allowsHitTesting(false)
            frame
            toolbar
        }
        .frame(width: container.width, height: container.height, alignment: .topLeading)
        .ignoresSafeArea()
    }

    private var dimming: some View {
        Rectangle()
            .fill(.black.opacity(0.4))
            .mask {
                ZStack {
                    Rectangle()
                    Rectangle()
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.x + rect.width / 2, y: rect.y + rect.height / 2)
                        .blendMode(.destinationOut)
                }
                .compositingGroup()
            }
    }

    private var frame: some View {
        ZStack(alignment: .bottomTrailing) {
            Rectangle()
                .strokeBorder(.white, lineWidth: 2)
                .background(Rectangle().fill(.white.opacity(0.001)))
            Text(scaleLabel)
            .font(.caption.monospacedDigit())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.regularMaterial, in: Capsule())
            .padding(8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            handle
        }
        .frame(width: rect.width, height: rect.height)
        .position(x: rect.x + rect.width / 2, y: rect.y + rect.height / 2)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { value in
                    let start = dragStart ?? state
                    if dragStart == nil { dragStart = start }
                    state.offsetX = start.offsetX + value.translation.width
                    state.offsetY = start.offsetY + value.translation.height
                }
                .onEnded { _ in settle() }
        )
        .accessibilityElement()
        .accessibilityLabel("Export frame")
        .accessibilityValue(scaleLabel)
        // Dragging is the only way to place the frame by hand, so without these
        // a VoiceOver reader can hear the scale but cannot change it — they
        // would be told what the page shows with no way to choose it. Adjusting
        // resizes, in the same 5% steps the web's slider handle uses; the four
        // actions move it.
        .accessibilityAdjustableAction { direction in
            let step = direction == .increment ? 0.05 : -0.05
            state.scale = PrintFrameGeometry.scaleAfterResizeDrag(
                startScale: state.scale, deltaY: step * fit, containerFit: fit
            )
            settle()
        }
        .accessibilityAction(named: "Move left") { nudge(dx: -nudgeStep) }
        .accessibilityAction(named: "Move right") { nudge(dx: nudgeStep) }
        .accessibilityAction(named: "Move up") { nudge(dy: -nudgeStep) }
        .accessibilityAction(named: "Move down") { nudge(dy: nudgeStep) }
    }

    private var nudgeStep: Double { max(16, container.width / 12) }

    private var handle: some View {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.black)
            .frame(width: 44, height: 44)
            .background(.white, in: Circle())
            .padding(4)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { value in
                        let start = dragStart ?? state
                        if dragStart == nil { dragStart = start }
                        state.scale = PrintFrameGeometry.scaleAfterResizeDrag(
                            startScale: start.scale,
                            deltaY: value.translation.height,
                            containerFit: fit
                        )
                    }
                    .onEnded { _ in settle() }
            )
            .accessibilityLabel("Resize export frame")
            .accessibilityIdentifier("print-frame-handle")
    }

    private var toolbar: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let credit {
                Text(credit)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.leading, 12)
                    .accessibilityIdentifier("print-frame-credit")
            }

            HStack(spacing: 12) {
                Button(state.orientation == .portrait ? "Portrait" : "Landscape") {
                    state.orientation = state.orientation == .portrait ? .landscape : .portrait
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("print-frame-orientation")

                Spacer()

                Button("Cancel", action: onCancel)
                    .buttonStyle(.bordered)
                Button("Continue") { onContinue(bounds) }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("print-frame-continue")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.regularMaterial)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }
}
