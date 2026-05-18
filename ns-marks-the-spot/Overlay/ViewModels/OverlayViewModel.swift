import Combine
import SwiftUI

@MainActor
final class OverlayViewModel: ObservableObject {
    @Published var opacity: CGFloat = 0.5
    var selectedLayerId: String?

    private let engine: any MapEngine

    init(engine: any MapEngine) {
        self.engine = engine
    }

    func updateOpacity(_ newValue: CGFloat) {
        opacity = newValue
        if let layerId = selectedLayerId {
            engine.setOpacity(for: layerId, to: newValue)
        }
    }
}
