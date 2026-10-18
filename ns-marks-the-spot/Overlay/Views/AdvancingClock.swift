import Combine
import SwiftUI

/// Keeps a view's idea of "now" moving while it stays open.
///
/// Tax-sale lifecycle labels are read off a clock — "Upcoming" until the
/// advertised sale time, "Past sale date" after it — and a phone view can sit
/// open across that moment. Read once at `onAppear`, the sheet goes on saying a
/// sale is still ahead after it has begun, which is a wrong statement about a
/// dated public record rather than a stale piece of decoration.
///
/// A minute is the browser's own interval, and nothing here is timed finer than
/// a day, so a label is never more than a minute behind the clock.
private struct AdvancingClock: ViewModifier {
    @Binding var now: Date

    /// Held in `@State` so one timer belongs to the view's identity. Built in
    /// `body` it would be a new publisher on every redraw, and the redraws that
    /// arriving evidence causes would start the minute over each time.
    @State private var tick = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    func body(content: Content) -> some View {
        content
            .onAppear { now = Date() }
            .onReceive(tick) { now = $0 }
    }
}

extension View {
    /// Sets `now` when this view appears, and again every minute it stays.
    func advancingClock(_ now: Binding<Date>) -> some View {
        modifier(AdvancingClock(now: now))
    }
}
