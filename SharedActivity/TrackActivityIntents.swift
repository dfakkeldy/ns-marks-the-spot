import AppIntents
import Foundation

/// The two buttons on the Lock Screen.
///
/// `LiveActivityIntent`, not `AppIntent`, and the difference is the whole
/// reason these exist: a `LiveActivityIntent` performs **in the app's own
/// process**, so Pause stops the recording rather than launching the app to
/// stop it. A reader who has to unlock the phone to pause has not been given a
/// button; they have been given a shortcut to the screen with the button.
///
/// Compiled into both targets: the widget extension needs the type to put a
/// `Button(intent:)` on the Lock Screen, and the app needs it to run. Only the
/// app ever reaches `perform()`.
///
/// Not discoverable. These are not things to offer in Shortcuts or Spotlight —
/// "Stop recording" from a Siri phrase, with no walk running and no screen to
/// see the result on, is an answer to a question nobody asked.
struct PauseTrackIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause recording"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await TrackActivityActions.shared.pause()
        return .result()
    }
}

struct ResumeTrackIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Resume recording"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await TrackActivityActions.shared.resume()
        return .result()
    }
}

/// Stop, which on this app opens a save sheet. The Lock Screen cannot show
/// that sheet, so what this does is end the recording and hold the result for
/// the app to present when the reader next opens it — the walk is never
/// thrown away by a button pressed on a locked phone.
struct StopTrackIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop recording"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await TrackActivityActions.shared.stop()
        return .result()
    }
}

/// Where the intents find the recorder.
///
/// A registry of closures rather than a reference to `TrackRecorder`, because
/// this file is compiled into the widget extension too and the extension has
/// no recorder, no map and no store. In that process these stay nil and
/// nothing calls them: the extension draws the buttons, the app performs them.
@MainActor
final class TrackActivityActions {
    static let shared = TrackActivityActions()
    private init() {}

    private var pauseAction: (() -> Void)?
    private var resumeAction: (() -> Void)?
    private var stopAction: (() -> Void)?

    func install(
        pause: @escaping () -> Void,
        resume: @escaping () -> Void,
        stop: @escaping () -> Void
    ) {
        pauseAction = pause
        resumeAction = resume
        stopAction = stop
    }

    // Methods rather than the closures themselves, so nothing hands a
    // non-Sendable closure out of the main actor to be called somewhere else:
    // the intent awaits its way onto this actor and the walk is changed here,
    // which is where the recorder lives.
    func pause() { pauseAction?() }
    func resume() { resumeAction?() }
    func stop() { stopAction?() }
}
