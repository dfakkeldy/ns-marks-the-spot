import Foundation
import NSDataServices

/// A transport whose replies are held until the test lets them go.
///
/// `StubURLProtocol` answers as fast as the loopback allows, which is fine for
/// a question about one lookup and useless for a question about two. Anything
/// about a stale answer landing on a newer selection needs the first lookup to
/// still be in flight when the second starts, and "still in flight" cannot be
/// arranged by hoping one stub is slower than another.
///
/// Requests are matched on a substring of the URL, as `StubURLProtocol` does.
/// An unmatched request is answered immediately with a 404 rather than held, so
/// a test that forgets a needle fails on the assertion instead of hanging.
actor HeldTransport {
    private struct Held {
        let data: Data
        var waiting: [CheckedContinuation<Void, Never>] = []
        var released = false
    }

    private var replies: [String: Held] = [:]
    private var order: [String] = []
    private var arrived: [String: Int] = [:]
    private var completed: [String: Int] = [:]
    private var watchers: [(needle: String, count: Int, arrivals: Bool, resume: CheckedContinuation<Void, Never>)] = []

    /// Registers one held reply. Needles are matched in the order registered.
    func answer(_ needle: String, with data: Data) {
        replies[needle] = Held(data: data)
        order.append(needle)
    }

    /// Lets every request matching `needle` — waiting now or arriving later —
    /// complete.
    func release(_ needle: String) {
        guard var held = replies[needle] else { return }
        held.released = true
        let waiting = held.waiting
        held.waiting = []
        replies[needle] = held
        for continuation in waiting { continuation.resume() }
    }

    /// Returns once `count` requests matching `needle` have arrived and are
    /// being held.
    ///
    /// Without this a test cannot know a lookup is in flight — only that it
    /// asked for one. A task cancelled before it ever ran sends nothing, and a
    /// test waiting for that request to complete would wait forever.
    func awaitArrivals(_ needle: String, count: Int = 1) async {
        if arrived[needle, default: 0] >= count { return }
        await withCheckedContinuation { continuation in
            watchers.append((needle, count, true, continuation))
        }
    }

    /// Returns once `count` requests matching `needle` have been answered, so a
    /// test can assert about what a late reply did rather than about what it
    /// hopes happened.
    func awaitCompletions(_ needle: String, count: Int = 1) async {
        if completed[needle, default: 0] >= count { return }
        await withCheckedContinuation { continuation in
            watchers.append((needle, count, false, continuation))
        }
    }

    private func signal(_ needle: String, arrivals: Bool) {
        let reached = (arrivals ? arrived : completed)[needle, default: 0]
        watchers.removeAll { watcher in
            guard watcher.needle == needle, watcher.arrivals == arrivals,
                  reached >= watcher.count else { return false }
            watcher.resume.resume()
            return true
        }
    }

    var transport: HTTPTransport {
        HTTPTransport { [self] request in
            let url = request.url?.absoluteString ?? ""
            return try await send(url)
        }
    }

    private func send(_ url: String) async throws -> (Data, URLResponse) {
        guard let needle = order.first(where: { url.contains($0) }) else {
            return (Data(), Self.response(url, status: 404))
        }
        arrived[needle, default: 0] += 1
        signal(needle, arrivals: true)

        if replies[needle]?.released != true {
            await withCheckedContinuation { continuation in
                replies[needle]?.waiting.append(continuation)
            }
        }
        let data = replies[needle]?.data ?? Data()
        completed[needle, default: 0] += 1
        signal(needle, arrivals: false)
        return (data, Self.response(url, status: 200))
    }

    private static func response(_ url: String, status: Int) -> URLResponse {
        HTTPURLResponse(
            url: URL(string: url) ?? URL(string: "https://example.invalid")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: nil
        )!
    }
}
