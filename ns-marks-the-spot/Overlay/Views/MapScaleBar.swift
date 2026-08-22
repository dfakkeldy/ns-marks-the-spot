import MapKit
import SwiftUI

/// The graphical scale bar, beside the readout that names the ratio.
///
/// The web draws both: Leaflet's bar and an approximate denominator. This app
/// had only the denominator, and the two are not the same tool. A ratio has to
/// be converted before it means anything on the ground, while a bar is measured
/// straight off the screen — which is what someone does when they want to know
/// how far it is across the thing they are looking at.
///
/// `MKScaleView` follows the device's measurement system rather than taking an
/// override. That is the right behaviour for a reader in the field, and in this
/// map's own province it reads in metres, as the browser does.
struct MapScaleBar: UIViewRepresentable {
    let controller: MapController

    func makeUIView(context: Context) -> MKScaleView {
        let view = MKScaleView(mapView: controller.mapView)
        view.scaleVisibility = .visible
        view.legendAlignment = .leading
        return view
    }

    func updateUIView(_ uiView: MKScaleView, context: Context) {
        // The controller holds its map view weakly and the view is rebuilt on
        // it, so the bar is re-pointed rather than assumed to still be attached.
        uiView.mapView = controller.mapView
    }
}
