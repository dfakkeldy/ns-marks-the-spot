import Observation

@MainActor @Observable
final class ScreenAwakeCoordinator {
    enum Reason: Hashable { case recording, driveMode }
    private let screen: any ScreenWakeLock
    private var reasons: Set<Reason> = []
    private var sceneActive = true
    private(set) var held = false

    init(screen: any ScreenWakeLock = ApplicationScreenWakeLock()) { self.screen = screen }
    func set(_ reason: Reason, active: Bool) {
        if active { reasons.insert(reason) } else { reasons.remove(reason) }
        reconcile()
    }
    func sceneBecame(active: Bool) { sceneActive = active; reconcile() }
    private func reconcile() {
        held = sceneActive && !reasons.isEmpty
        screen.isHeldAwake = held
    }
}
