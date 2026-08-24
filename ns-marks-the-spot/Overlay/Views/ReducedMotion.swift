import SwiftUI

extension Animation {
    /// This animation, or none at all when the reader has asked the system for
    /// less motion.
    ///
    /// The browser answers `prefers-reduced-motion` by cutting every
    /// transition to nothing, and the map chrome is where that matters on a
    /// phone: panels that slide in from an edge, a compass that springs back
    /// to north, a source strip that unfolds under the reader's thumb. Reduce
    /// Motion is switched on by people for whom that movement causes nausea or
    /// vertigo, and a map is a thing you stare at while moving it.
    ///
    /// Nil rather than a shorter duration. `withAnimation(nil)` and
    /// `.animation(nil, value:)` both apply the change without moving
    /// anything, so a panel appears where it would have slid to. The state
    /// change itself is untouched: what is switched off is the travel, not the
    /// result.
    func unlessReduced(_ isReduced: Bool) -> Animation? {
        isReduced ? nil : self
    }
}
