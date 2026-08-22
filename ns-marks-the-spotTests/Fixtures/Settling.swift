import Foundation
import Testing

/// Waits for `condition` to hold, and records a failure if it never does.
///
/// For the tests that drive asynchronous work and then read what it produced.
/// Sleeping a fixed span for that is a bet on how busy the machine is, and the
/// bet loses: a 600 ms wait that was ample on an idle Mac reached its
/// assertion 5.7 seconds late during a full gated run and failed there. Polling
/// costs the same on an idle machine, because the first pass is a run of yields
/// rather than a timer, and it survives a loaded one.
///
/// The timeout fails here rather than being handed back for the caller to
/// check, because most of what these tests assert afterwards is also true of a
/// model that never did anything: an empty layer answers a tap with nothing,
/// and a card nothing has re-checked is still the card that was selected. A
/// helper whose result can be dropped turns those into passes.
@MainActor
func settles(
    _ what: Comment,
    within limit: Duration = .seconds(20),
    sourceLocation: SourceLocation = #_sourceLocation,
    until condition: () async -> Bool
) async {
    if await condition() { return }

    // Much of what these tests wait for is one or two hops away. Yielding for
    // those keeps them as quick as they were before the timer existed.
    for _ in 0..<50 {
        await Task.yield()
        if await condition() { return }
    }

    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: limit)
    while clock.now < deadline {
        try? await Task.sleep(for: .milliseconds(10))
        if await condition() { return }
    }
    Issue.record(
        "Timed out after \(limit) waiting for \(what.description)",
        sourceLocation: sourceLocation
    )
}
