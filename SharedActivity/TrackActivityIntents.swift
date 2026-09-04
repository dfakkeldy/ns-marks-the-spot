import AppIntents
import Foundation

/// The two buttons on the Lock Screen.
///
/// **Pause and Resume, and deliberately not Stop.** Stop produces a walk that
/// has to survive a process iOS can end at any moment, and this app has no
/// checkpoint for a recording in progress — two review rounds found six ways
/// the walk could be lost or offered twice, and the last two of those needed
/// architecture rather than a patch. Pause and Resume change a state and
/// produce nothing, so they can be reached from a locked phone safely today.
/// Stopping stays where the save sheet can be shown, and comes back here when
/// a walk is durable by construction.
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
        guard await TrackActivityActions.shared.pause() else {
            throw TrackActivityActions.Unreachable.noRecording
        }
        return .result()
    }
}

struct ResumeTrackIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Resume recording"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        guard await TrackActivityActions.shared.resume() else {
            throw TrackActivityActions.Unreachable.noRecording
        }
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

    private var pauseAction: (() -> Bool)?
    private var resumeAction: (() -> Bool)?

    /// Each action reports whether the walk actually changed — not whether a
    /// closure happened to be installed. Actions outlive the recording they
    /// were installed for, so a stale button on a Lock Screen can reach a
    /// recorder that is already idle, and answering "done" to that is the same
    /// lie as answering it with nothing installed at all.
    func install(pause: @escaping () -> Bool, resume: @escaping () -> Bool) {
        pauseAction = pause
        resumeAction = resume
    }

    // Methods rather than the closures themselves, so nothing hands a
    // non-Sendable closure out of the main actor to be called somewhere else:
    // the intent awaits its way onto this actor and the walk is changed here,
    // which is where the recorder lives.
    //
    // Each returns whether it reached a recorder. A button on a Lock Screen
    // that does nothing and reports success is worse than one that fails: the
    // reader walks on believing they paused.
    @discardableResult func pause() -> Bool { run(pauseAction) }
    @discardableResult func resume() -> Bool { run(resumeAction) }

    /// Lets a test put the registry back the way a fresh process finds it.
    func uninstall() {
        pauseAction = nil
        resumeAction = nil
    }

    private func run(_ action: (() -> Bool)?) -> Bool {
        guard let action else { return false }
        return action()
    }

    /// What an intent throws when there is no recorder to reach.
    ///
    /// The case it exists for: iOS terminated the app with a Live Activity
    /// still on the Lock Screen, and a tap relaunches the process to perform
    /// the intent. If the actions are not installed by then, the tap did
    /// nothing — and the reader has to be told, not reassured.
    enum Unreachable: Error, CustomLocalizedStringResourceConvertible {
        case noRecording

        var localizedStringResource: LocalizedStringResource {
            "That recording is no longer running. Open NS Marks the Spot to see it."
        }
    }
}
