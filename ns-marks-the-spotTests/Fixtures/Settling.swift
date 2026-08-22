import Foundation

/// Waits for `condition` to hold, up to `limit`.
///
/// For the tests that drive asynchronous work and then read what it produced.
/// Sleeping a fixed span for that is a bet on how busy the machine is, and the
/// bet loses: a 600 ms wait that was ample on an idle Mac reached its
/// assertion 5.7 seconds late during a full gated run and failed there. Polling
/// costs the same on an idle machine, because the first pass is a run of yields
/// rather than a timer, and it survives a loaded one.
///
/// Returns whether the condition held, but the useful thing to do with a
/// timeout is to fall through and assert on the state itself: the failure then
/// names the value that was wrong rather than reporting a bare `false`.
@MainActor
@discardableResult
func settles(
    within limit: Duration = .seconds(20),
    until condition: () async -> Bool
) async -> Bool {
    if await condition() { return true }

    // Much of what these tests wait for is one or two hops away. Yielding for
    // those keeps them as quick as they were before the timer existed.
    for _ in 0..<50 {
        await Task.yield()
        if await condition() { return true }
    }

    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: limit)
    while clock.now < deadline {
        try? await Task.sleep(for: .milliseconds(10))
        if await condition() { return true }
    }
    return false
}
