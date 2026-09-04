import SwiftUI
import WidgetKit

/// The widget extension's entry point.
///
/// One activity and no home-screen widgets. A widget would have to say
/// something about the map without the map — a parcel, a layer, a last
/// position — and every one of those is a claim this app makes only with its
/// evidence attached.
@main
struct NSMarksLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        TrackLiveActivity()
    }
}
